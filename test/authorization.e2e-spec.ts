import { bootstrap, createApp, TestCtx, validApplication, waitForRisk } from './helpers';

/** Object-level authorization. Every case below must stay green — these are the "cannot be bypassed" proofs. */
describe('Object-level authorization (e2e)', () => {
  let ctx: TestCtx;
  let appId: string; // created by sales1
  beforeAll(async () => { ctx = await bootstrap(); });
  beforeEach(async () => { await ctx.reset(); appId = await createApp(ctx, 'sales1'); });
  afterAll(() => ctx.close());

  describe('SALES isolation', () => {
    it('sales2 cannot READ sales1’s application by id (404, not 403 — no existence leak)', async () => {
      await ctx.as('sales2').get(`/applications/${appId}`).expect(404);
      await ctx.as('sales1').get(`/applications/${appId}`).expect(200);
    });
    it('sales2 cannot UPDATE sales1’s application, and the row is unchanged', async () => {
      await ctx.as('sales2').patch(`/applications/${appId}`).send({ businessName: 'Hijacked' }).expect(404);
      const res = await ctx.as('sales1').get(`/applications/${appId}`).expect(200);
      expect(res.body.businessName).toBe('Himalayan Coffee');
    });
    it('sales2 cannot SUBMIT sales1’s application', async () => {
      await ctx.as('sales2').post(`/applications/${appId}/submit`).expect(404);
      const res = await ctx.as('sales1').get(`/applications/${appId}`).expect(200);
      expect(res.body.status).toBe('DRAFT');
    });
    it('sales2 cannot read its risk checks', async () => {
      await ctx.as('sales2').get(`/applications/${appId}/risk-checks`).expect(404);
    });
    it('list only returns own applications, with total count scoped too', async () => {
      await createApp(ctx, 'sales2');
      const s1 = await ctx.as('sales1').get('/applications').expect(200);
      const s2 = await ctx.as('sales2').get('/applications').expect(200);
      expect(s1.body.meta.total).toBe(1);
      expect(s1.body.items.map((a: { id: string }) => a.id)).toEqual([appId]);
      expect(s2.body.meta.total).toBe(1);
      expect(s2.body.items[0].id).not.toBe(appId);
    });
    it('cannot spoof ownership or protected fields via the request body (400)', async () => {
      await ctx.as('sales1').post('/applications').send(validApplication({ createdById: ctx.ids.sales2 })).expect(400);
      await ctx.as('sales1').patch(`/applications/${appId}`).send({ status: 'APPROVED' }).expect(400);
      await ctx.as('sales1').patch(`/applications/${appId}`).send({ assignedReviewerId: ctx.ids.reviewer1 }).expect(400);
      await ctx.as('sales1').patch(`/applications/${appId}`).send({ riskStatus: 'PASSED' }).expect(400);
    });
    it('SALES cannot assign or decide (403)', async () => {
      await ctx.as('sales1').patch(`/applications/${appId}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(403);
      await ctx.as('sales1').post(`/applications/${appId}/decision`).send({ decision: 'APPROVE' }).expect(403);
    });
  });

  describe('REVIEWER scoping + decision rights', () => {
    beforeEach(async () => {
      await ctx.as('admin').patch(`/applications/${appId}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
      await ctx.as('sales1').post(`/applications/${appId}/submit`).expect(202);
      await waitForRisk(ctx, appId);
    });
    it('only the assigned reviewer can see the application', async () => {
      await ctx.as('reviewer1').get(`/applications/${appId}`).expect(200);
      await ctx.as('reviewer2').get(`/applications/${appId}`).expect(404);
      expect((await ctx.as('reviewer2').get('/applications').expect(200)).body.meta.total).toBe(0);
    });
    it('a non-assigned REVIEWER cannot record a decision', async () => {
      await ctx.as('reviewer2').post(`/applications/${appId}/decision`).send({ decision: 'APPROVE' }).expect(404);
      expect((await ctx.as('admin').get(`/applications/${appId}`)).body.status).toBe('SUBMITTED');
    });
    it('ADMIN cannot record a decision either (403) — only the assigned reviewer', async () => {
      await ctx.as('admin').post(`/applications/${appId}/decision`).send({ decision: 'APPROVE' }).expect(403);
    });
    it('the assigned reviewer can; reassigning removes their rights', async () => {
      await ctx.as('admin').patch(`/applications/${appId}/assignment`).send({ reviewerId: ctx.ids.reviewer2 }).expect(200);
      await ctx.as('reviewer1').post(`/applications/${appId}/decision`).send({ decision: 'APPROVE' }).expect(404);
      await ctx.as('reviewer2').post(`/applications/${appId}/decision`).send({ decision: 'APPROVE' }).expect(200);
    });
    it('REVIEWER cannot edit business data or create applications', async () => {
      await ctx.as('reviewer1').patch(`/applications/${appId}`).send({ businessName: 'x' }).expect(403);
      await ctx.as('reviewer1').post('/applications').send(validApplication()).expect(403);
    });
  });

  it('assignment only accepts active REVIEWER users', async () => {
    await ctx.as('admin').patch(`/applications/${appId}/assignment`).send({ reviewerId: ctx.ids.sales2 }).expect(404);
    await ctx.as('admin').patch(`/applications/${appId}/assignment`).send({ reviewerId: 'not-a-uuid' }).expect(400);
  });

  it('ids must be UUIDs (400) — no raw DB errors leak', async () => {
    const res = await ctx.as('admin').get('/applications/123').expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/select|postgres|QueryFailed/i);
  });
});
