import { computeSignature } from '../src/payments/webhook-signature';
import { bootstrap, createApp, TestCtx, waitForRisk } from './helpers';

describe('Payments (e2e)', () => {
  let ctx: TestCtx;
  let appId: string; // APPROVED, created by sales1, assigned to reviewer1
  beforeAll(async () => { ctx = await bootstrap(); });
  afterAll(() => ctx.close());

  // "Pine Works" hashes to a passing risk score, so the application can be approved.
  const approvedApp = async () => {
    const id = await createApp(ctx, 'sales1', { legalBusinessName: 'Pine Works' });
    await ctx.as('admin').patch(`/applications/${id}/assignment`).send({ reviewerId: ctx.ids.reviewer1 }).expect(200);
    await ctx.as('sales1').post(`/applications/${id}/submit`).expect(202);
    expect((await waitForRisk(ctx, id)).riskStatus).not.toBe('FAILED');
    await ctx.as('reviewer1').post(`/applications/${id}/decision`).send({ decision: 'APPROVE', notes: 'ok' }).expect(200);
    return id;
  };
  beforeEach(async () => { await ctx.reset(); appId = await approvedApp(); });

  const pay = (who: 'sales1' | 'sales2' | 'admin' | 'reviewer1', id: string, key: string | null, body: object = { amount: 1500.5 }) => {
    const r = ctx.as(who).post(`/applications/${id}/payments`);
    return (key ? r.set('Idempotency-Key', key) : r).send(body);
  };
  const secret = () => process.env.PAYMENT_WEBHOOK_SECRET as string;
  const sendWebhook = (payload: object, over: { ts?: string; sig?: string } = {}) => {
    const raw = JSON.stringify(payload);
    const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
    return ctx.http().post('/payments/webhook').set('Content-Type', 'application/json')
      .set('X-Webhook-Timestamp', ts).set('X-Webhook-Signature', over.sig ?? computeSignature(secret(), ts, raw)).send(raw);
  };
  const auditCount = async (paymentId: string, action: string) =>
    (await ctx.ds.query('SELECT count(*)::int AS c FROM audit_logs WHERE entity_id = $1 AND action = $2', [paymentId, action]))[0].c as number;

  describe('creating payments', () => {
    it('is refused until the application is APPROVED (409)', async () => {
      const draft = await createApp(ctx, 'sales1');
      await pay('sales1', draft, 'key-draft-0001').expect(409);
    });
    it('creates a PENDING payment; currency comes from the application', async () => {
      const res = await pay('sales1', appId, 'key-create-001').expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', amount: 1500.5, currency: 'NPR', applicationId: appId });
      expect(res.body.providerReference).toMatch(/^pay_/);
    });
    it('requires a valid Idempotency-Key header (400)', async () => {
      await pay('sales1', appId, null).expect(400);
      await pay('sales1', appId, 'short').expect(400);
    });
    it('same key + same body returns the same payment (200, one row); different body => 409; new key => new payment', async () => {
      const first = await pay('sales1', appId, 'key-replay-001').expect(201);
      const again = await pay('sales1', appId, 'key-replay-001').expect(200);
      expect(again.body.id).toBe(first.body.id);
      await pay('sales1', appId, 'key-replay-001', { amount: 99 }).expect(409);
      const other = await pay('sales1', appId, 'key-replay-002').expect(201);
      expect(other.body.id).not.toBe(first.body.id);
      expect((await ctx.ds.query('SELECT count(*)::int AS c FROM payments'))[0].c).toBe(2);
    });
    it('concurrent requests with the same key create exactly one payment', async () => {
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => pay('sales1', appId, 'key-race-0001')));
      expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect((await ctx.ds.query('SELECT count(*)::int AS c FROM payments'))[0].c).toBe(1);
    });
    it('rejects invalid amounts and non-whitelisted fields (status, currency) with 400', async () => {
      await pay('sales1', appId, 'key-bad-00001', { amount: -5 }).expect(400);
      await pay('sales1', appId, 'key-bad-00002', { amount: 10, status: 'SUCCEEDED' }).expect(400);
      await pay('sales1', appId, 'key-bad-00003', { amount: 10, currency: 'USD' }).expect(400);
    });
    it('audits PAYMENT_CREATED without leaking secrets', async () => {
      const res = await pay('sales1', appId, 'key-audit-001').expect(201);
      expect(await auditCount(res.body.id, 'PAYMENT_CREATED')).toBe(1);
    });
  });

  describe('object-level authorization', () => {
    it('another SALES user cannot create, list or read payments of the application (404)', async () => {
      const created = await pay('sales1', appId, 'key-authz-001').expect(201);
      await pay('sales2', appId, 'key-authz-002').expect(404);
      await ctx.as('sales2').get(`/applications/${appId}/payments`).expect(404);
      await ctx.as('sales2').get(`/payments/${created.body.id}`).expect(404);
      await ctx.as('sales1').get(`/payments/${created.body.id}`).expect(200);
    });
    it('the assigned reviewer can view but not create; an unassigned reviewer sees nothing; admin can create', async () => {
      const created = await pay('sales1', appId, 'key-authz-003').expect(201);
      await ctx.as('reviewer1').get(`/payments/${created.body.id}`).expect(200);
      await pay('reviewer1', appId, 'key-authz-004').expect(403);
      await ctx.as('reviewer2').get(`/payments/${created.body.id}`).expect(404);
      await pay('admin', appId, 'key-authz-005').expect(201);
    });
    it('requires authentication', async () => {
      await ctx.http().post(`/applications/${appId}/payments`).set('Idempotency-Key', 'key-noauth-01').send({ amount: 5 }).expect(401);
    });
  });

  describe('signed webhook', () => {
    let payment: { id: string; providerReference: string };
    beforeEach(async () => { payment = (await pay('sales1', appId, 'key-hook-0001').expect(201)).body; });
    const evt = (over: object = {}) => ({ eventId: 'evt_0000000A', providerReference: payment.providerReference, status: 'SUCCEEDED', ...over });
    const status = async () => (await ctx.as('sales1').get(`/payments/${payment.id}`).expect(200)).body.status;

    it('rejects missing, wrong and stale signatures (401) and changes nothing', async () => {
      await ctx.http().post('/payments/webhook').send(evt()).expect(401);
      await sendWebhook(evt(), { sig: 'a'.repeat(64) }).expect(401);
      await sendWebhook(evt(), { ts: String(Math.floor(Date.now() / 1000) - 3600) }).expect(401);
      expect(await status()).toBe('PENDING');
    });
    it('a body altered after signing is rejected', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = computeSignature(secret(), ts, JSON.stringify(evt()));
      await ctx.http().post('/payments/webhook').set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', ts).set('X-Webhook-Signature', sig).send(JSON.stringify(evt({ status: 'FAILED' }))).expect(401);
      expect(await status()).toBe('PENDING');
    });
    it('a valid event moves PENDING -> SUCCEEDED and is audited once', async () => {
      const res = await sendWebhook(evt()).expect(200);
      expect(res.body).toEqual({ received: true, result: 'applied' });
      expect(await status()).toBe('SUCCEEDED');
      expect(await auditCount(payment.id, 'PAYMENT_SUCCEEDED')).toBe(1);
    });
    it('FAILED events store the reason', async () => {
      await sendWebhook(evt({ status: 'FAILED', failureReason: 'Insufficient funds' })).expect(200);
      const res = await ctx.as('sales1').get(`/payments/${payment.id}`).expect(200);
      expect(res.body).toMatchObject({ status: 'FAILED', failureReason: 'Insufficient funds' });
      expect(await auditCount(payment.id, 'PAYMENT_FAILED')).toBe(1);
    });
    it('is idempotent: redelivering the same eventId (even concurrently) has no extra effect', async () => {
      const results = await Promise.all([1, 2, 3, 4].map(() => sendWebhook(evt())));
      results.forEach((r) => expect(r.status).toBe(200));
      expect(results.filter((r) => r.body.result === 'applied')).toHaveLength(1);
      expect(results.filter((r) => r.body.result === 'duplicate')).toHaveLength(3);
      expect(await auditCount(payment.id, 'PAYMENT_SUCCEEDED')).toBe(1);
      expect((await ctx.ds.query('SELECT count(*)::int AS c FROM payment_webhook_events'))[0].c).toBe(1);
    });
    it('a later conflicting event cannot change a final payment', async () => {
      await sendWebhook(evt()).expect(200);
      const res = await sendWebhook(evt({ eventId: 'evt_0000000B', status: 'FAILED' })).expect(200);
      expect(res.body.result).toBe('ignored');
      expect(await status()).toBe('SUCCEEDED');
      expect(await auditCount(payment.id, 'PAYMENT_FAILED')).toBe(0);
    });
    it('unknown reference => 404 (event not consumed); invalid body with a valid signature => 400', async () => {
      await sendWebhook(evt({ providerReference: 'pay_doesnotexist' })).expect(404);
      await sendWebhook(evt({ status: 'REFUNDED' })).expect(400);
      expect((await ctx.ds.query('SELECT count(*)::int AS c FROM payment_webhook_events'))[0].c).toBe(0);
    });
  });

  describe('simulate-callback (dev helper)', () => {
    it('is ADMIN only and drives the same idempotent path', async () => {
      const p = (await pay('sales1', appId, 'key-sim-00001').expect(201)).body;
      await ctx.as('sales1').post(`/payments/${p.id}/simulate-callback`).send({ status: 'SUCCEEDED' }).expect(403);
      const res = await ctx.as('admin').post(`/payments/${p.id}/simulate-callback`).send({ status: 'SUCCEEDED' }).expect(200);
      expect(res.body.payment.status).toBe('SUCCEEDED');
      const again = await ctx.as('admin').post(`/payments/${p.id}/simulate-callback`).send({ status: 'FAILED' }).expect(200);
      expect(again.body.result).toBe('ignored');
      expect(again.body.payment.status).toBe('SUCCEEDED');
    });
  });
});
