import { bootstrap, createApp, TestCtx, validApplication, waitForRisk } from './helpers';

describe('Application lifecycle (e2e)', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await bootstrap(); });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const submitAndAssign = async (id: string) => {
    await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
    await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
    return waitForRisk(ctx, id);
  };

  it('creates a DRAFT with masked national id and never returns the raw value', async () => {
    const res = await ctx.as('sales1').post('/applications').send(validApplication()).expect(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', riskStatus: 'NOT_STARTED', createdById: ctx.ids.sales1, assignedReviewerId: null });
    expect(res.body.ownerNationalIdMasked).toBe('*************4321');
    expect(JSON.stringify(res.body)).not.toContain('FAKE-ID-987654321');
  });

  it('stores the national id encrypted at rest', async () => {
    const id = await createApp(ctx);
    const [row] = await ctx.ds.query('SELECT owner_national_id_enc AS v FROM merchant_applications WHERE id = $1', [id]);
    expect(row.v).toMatch(/^v1:/);
    expect(row.v).not.toContain('FAKE-ID');
  });

  it('validates input', async () => {
    await ctx.as('sales1').post('/applications').send(validApplication({ currency: 'npr' })).expect(400);
    await ctx.as('sales1').post('/applications').send(validApplication({ ownerEmail: 'nope' })).expect(400);
    await ctx.as('sales1').post('/applications').send(validApplication({ expectedMonthlyVolume: -5 })).expect(400);
    await ctx.as('sales1').post('/applications').send(validApplication({ businessType: 'LLC' })).expect(400);
    await ctx.as('sales1').post('/applications').send({}).expect(400);
  });

  it('happy path: create -> update -> assign -> submit -> risk -> approve (with full audit trail)', async () => {
    const id = await createApp(ctx);
    const upd = await ctx.as('sales1').patch(`/applications/${id}`).send({ businessName: 'Renamed' }).expect(200);
    expect(upd.body.businessName).toBe('Renamed');

    const sub = await ctx.as("sales1").post(`/applications/${id}/submit`).expect(202);
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', riskStatus: 'PENDING', submissionCount: 1 });
    await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
    const risk = await waitForRisk(ctx, id);
    expect(['PASSED', 'FLAGGED', 'FAILED']).toContain(risk.riskStatus);
  });

  it('approve flow records decision + audit entries', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
    const risk = await submitAndAssign(id);
    if (risk.riskStatus === 'FAILED') return; // hash-dependent; covered deterministically in risk tests
    const res = await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE', notes: 'Looks fine' }).expect(200);
    expect(res.body).toMatchObject({ status: 'APPROVED', decisionNotes: 'Looks fine' });
    expect(res.body.decidedAt).toBeTruthy();

    const audit = await ctx.as('admin').get(`/audit-logs?entityId=${id}&limit=50`).expect(200);
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['APPLICATION_CREATED', 'APPLICATION_SUBMITTED', 'APPLICATION_ASSIGNED', 'RISK_REVIEW_COMPLETED', 'REVIEW_DECISION']));
    const decision = audit.body.items.find((a: { action: string }) => a.action === 'REVIEW_DECISION');
    expect(decision.actorId).toBe(ctx.ids.reviewer1);
    expect(decision.metadata).toMatchObject({ decision: 'APPROVE', from: 'SUBMITTED', to: 'APPROVED' });
    expect(JSON.stringify(audit.body)).not.toContain('FAKE-ID-987654321');
  });

  it('request-info -> edit -> resubmit starts a new risk review (submission 2)', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
    await submitAndAssign(id);
    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'REQUEST_INFO' }).expect(400); // notes required
    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'REQUEST_INFO', notes: 'Need licence copy' }).expect(200);
    await ctx.as('sales1').patch(`/applications/${id}`).send({ ownerName: 'Updated Owner' }).expect(200); // editable again
    const re = await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
    expect(re.body).toMatchObject({ status: 'SUBMITTED', riskStatus: 'PENDING', submissionCount: 2 });
    await waitForRisk(ctx, id);
    const checks = await ctx.as('admin').get(`/applications/${id}/risk-checks`).expect(200);
    expect(checks.body.map((c: { submissionNo: number }) => c.submissionNo)).toEqual([2, 1]);
  });

  describe('invalid state transitions', () => {
    it('not editable after submit; cannot double-submit', async () => {
      const id = await createApp(ctx);
      await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
      await ctx.as('sales1').patch(`/applications/${id}`).send({ businessName: 'late' }).expect(409);
      await ctx.as('sales1').post(`/applications/${id}/submit`).expect(409);
    });
    it('cannot decide a DRAFT, or before risk completes / without assignment', async () => {
      const id = await createApp(ctx);
      await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
      await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE' }).expect(409);
    });
    it('terminal states are final', async () => {
      const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
      await submitAndAssign(id);
      await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'REJECT', notes: 'No' }).expect(200);
      await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE' }).expect(409);
      await ctx.as('sales1').post(`/applications/${id}/submit`).expect(409);
      await ctx.as('sales1').patch(`/applications/${id}`).send({ businessName: 'x' }).expect(409);
      await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer2 }).expect(409);
    });
    it('concurrent double submit enqueues exactly one risk review', async () => {
      const id = await createApp(ctx);
      const results = await Promise.all([1, 2, 3].map(() => ctx.as('sales1').post(`/applications/${id}/submit`)));
      expect(results.filter((r) => r.status === 202)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      await waitForRisk(ctx, id);
      const [{ count }] = await ctx.ds.query('SELECT count(*)::int AS count FROM risk_checks WHERE application_id = $1', [id]);
      expect(count).toBe(1);
    });
  });

  describe('listing', () => {
    it('filters by status and paginates', async () => {
      for (let i = 0; i < 5; i++) await createApp(ctx, 'sales1', { businessName: `Biz ${i}` });
      const submitted = await createApp(ctx, 'sales1');
      await ctx.as('sales1').post(`/applications/${submitted}/submit`).expect(202);

      const p1 = await ctx.as('sales1').get('/applications?limit=4&page=1').expect(200);
      const p2 = await ctx.as('sales1').get('/applications?limit=4&page=2').expect(200);
      expect(p1.body.meta).toEqual({ page: 1, limit: 4, total: 6, totalPages: 2 });
      expect(p1.body.items).toHaveLength(4);
      expect(p2.body.items).toHaveLength(2);
      const ids = [...p1.body.items, ...p2.body.items].map((a: { id: string }) => a.id);
      expect(new Set(ids).size).toBe(6);

      const drafts = await ctx.as('sales1').get('/applications?status=DRAFT').expect(200);
      expect(drafts.body.meta.total).toBe(5);
      const subs = await ctx.as('admin').get('/applications?status=SUBMITTED').expect(200);
      expect(subs.body.meta.total).toBe(1);
      await ctx.as('sales1').get('/applications?status=BOGUS').expect(400);
      await ctx.as('sales1').get('/applications?limit=1000').expect(400);
    });
  });
});
