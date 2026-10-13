import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RiskProcessor } from '../src/risk/risk.processor';
import { RISK_QUEUE } from '../src/risk/risk.constants';
import { RiskQueueService } from '../src/risk/risk-queue.service';
import { bootstrap, createApp, TestCtx, waitForRisk } from './helpers';

describe('Async risk review (e2e)', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await bootstrap(); });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const assignAndSubmit = async (id: string) => {
    await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
    await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
  };
  const auditCount = async (id: string, action: string) =>
    (await ctx.ds.query('SELECT count(*)::int AS c FROM audit_logs WHERE entity_id = $1 AND action = $2', [id, action]))[0].c as number;

  it('submit enqueues a job; the worker persists the result and updates the application', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
    await assignAndSubmit(id);
    const app = await waitForRisk(ctx, id);
    expect(['PASSED', 'FLAGGED', 'FAILED']).toContain(app.riskStatus);
    expect(app.riskScore).toEqual(expect.any(Number));
    const checks = await ctx.as('sales1').get(`/applications/${id}/risk-checks`).expect(200);
    expect(checks.body[0]).toMatchObject({ status: 'COMPLETED', submissionNo: 1, score: app.riskScore, outcome: app.riskStatus });
    expect(checks.body[0].providerReference).toMatch(/^sim-/);
  });

  it('SANCTION hit => FAILED, approve is blocked but reject is allowed', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Sanction Traders Ltd' });
    await assignAndSubmit(id);
    expect((await waitForRisk(ctx, id)).riskStatus).toBe('FAILED');
    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE' }).expect(409);
    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'REJECT', notes: 'Sanctions' }).expect(200);
  });

  it('transient provider failures are retried with backoff and then succeed', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Flaky Foods' });
    await assignAndSubmit(id);
    const app = await waitForRisk(ctx, id);
    expect(app.riskStatus).not.toBe('ERROR');
    const job = await ctx.app.get<Queue>(getQueueToken(RISK_QUEUE)).getJob(`risk-${id}-1-0`);
    expect(job?.attemptsMade).toBe(3); // 2 failures + 1 success
    expect(await auditCount(id, 'RISK_REVIEW_COMPLETED')).toBe(1);
  });

  it('exhausted retries => riskStatus ERROR; approve blocked; ADMIN retry re-queues', async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'ProviderDown Inc' });
    await assignAndSubmit(id);
    expect((await waitForRisk(ctx, id)).riskStatus).toBe('ERROR');
    expect(await auditCount(id, 'RISK_REVIEW_FAILED')).toBe(1);
    const [check] = (await ctx.as('admin').get(`/applications/${id}/risk-checks`)).body;
    expect(check).toMatchObject({ status: 'FAILED' });
    expect(check.lastError).toMatch(/unavailable/);

    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE' }).expect(409);
    await ctx.as('sales1').post(`/applications/${id}/risk-review/retry`).expect(403);

    // Provider "recovers": fix the name directly in DB so the retry succeeds, then re-queue.
    await ctx.ds.query(`UPDATE merchant_applications SET legal_business_name = 'Recovered Inc' WHERE id = $1`, [id]);
    const res = await ctx.as('admin').post(`/applications/${id}/risk-review/retry`).expect(202);
    expect(res.body.riskStatus).toBe('PENDING');
    expect(['PASSED', 'FLAGGED', 'FAILED']).toContain((await waitForRisk(ctx, id)).riskStatus);
    await ctx.as('admin').post(`/applications/${id}/risk-review/retry`).expect(409); // now completed
  });

  describe('idempotency', () => {
    it('re-enqueuing the same submission is a no-op (deterministic jobId)', async () => {
      const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
      await assignAndSubmit(id);
      await waitForRisk(ctx, id);
      const q = ctx.app.get(RiskQueueService);
      await q.enqueue(id, 1);
      await q.enqueue(id, 1);
      await new Promise((r) => setTimeout(r, 300));
      expect((await ctx.ds.query('SELECT count(*)::int AS c FROM risk_checks WHERE application_id = $1', [id]))[0].c).toBe(1);
      expect(await auditCount(id, 'RISK_REVIEW_COMPLETED')).toBe(1);
    });

    it('processing the same job repeatedly (redelivery) does not change the stored result or double-audit', async () => {
      const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
      await assignAndSubmit(id);
      const first = await waitForRisk(ctx, id);
      const processor = ctx.app.get(RiskProcessor);
      const fakeJob = { id: 'dup', data: { applicationId: id, submissionNo: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never;
      await Promise.all([processor.process(fakeJob), processor.process(fakeJob), processor.process(fakeJob)]);
      const after = await waitForRisk(ctx, id);
      expect(after.riskScore).toBe(first.riskScore);
      expect(after.riskStatus).toBe(first.riskStatus);
      expect(await auditCount(id, 'RISK_REVIEW_COMPLETED')).toBe(1);
    });

    it('a stale job for an older submission never overwrites the newer one', async () => {
      const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Clean Co' });
      await assignAndSubmit(id);
      await waitForRisk(ctx, id);
      await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'REQUEST_INFO', notes: 'more' }).expect(200);
      await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
      await waitForRisk(ctx, id);
      const before = (await ctx.as('admin').get(`/applications/${id}`)).body;
      // Replay submission #1's job
      const processor = ctx.app.get(RiskProcessor);
      await processor.process({ id: 'stale', data: { applicationId: id, submissionNo: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
      const after = (await ctx.as('admin').get(`/applications/${id}`)).body;
      expect(after.riskScore).toBe(before.riskScore);
      expect(after.submissionCount).toBe(2);
    });
  });
});
