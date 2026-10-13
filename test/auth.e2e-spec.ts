import { bootstrap, PASSWORD, TestCtx, USERS } from './helpers';

describe('Auth (e2e)', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await bootstrap(); });
  afterAll(() => ctx.close());

  it('issues a JWT for valid credentials', async () => {
    const res = await ctx.http().post('/auth/login').send({ email: USERS.sales1.email, password: PASSWORD }).expect(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: expect.any(String) });
    expect(res.body.accessToken.split('.')).toHaveLength(3);
  });

  it('rejects wrong password and unknown user with the same 401', async () => {
    const a = await ctx.http().post('/auth/login').send({ email: USERS.sales1.email, password: 'wrong-password' }).expect(401);
    const b = await ctx.http().post('/auth/login').send({ email: 'nobody@test.example', password: 'wrong-password' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('validates the login body', async () => {
    await ctx.http().post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
  });

  it('protects routes: no token / garbage token / tampered token => 401', async () => {
    await ctx.http().get('/applications').expect(401);
    await ctx.http().get('/applications').set('Authorization', 'Bearer garbage').expect(401);
    const [h, p, s] = ctx.tokens.sales1.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: ctx.ids.admin, role: 'ADMIN' })).toString('base64url');
    await ctx.http().get('/applications').set('Authorization', `Bearer ${h}.${forged}.${s}`).expect(401);
    void p;
  });

  it('GET /auth/me returns identity + role from the token', async () => {
    const res = await ctx.as('reviewer1').get('/auth/me').expect(200);
    expect(res.body).toMatchObject({ email: USERS.reviewer1.email, role: 'REVIEWER' });
  });

  it('blocks deactivated users even with a previously issued token', async () => {
    await ctx.ds.query('UPDATE users SET is_active = false WHERE id = $1', [ctx.ids.sales2]);
    await ctx.as('sales2').get('/applications').expect(401);
    await ctx.http().post('/auth/login').send({ email: USERS.sales2.email, password: PASSWORD }).expect(401);
    await ctx.ds.query('UPDATE users SET is_active = true WHERE id = $1', [ctx.ids.sales2]);
  });

  it('role guard: SALES/REVIEWER cannot reach ADMIN-only endpoints', async () => {
    await ctx.as('sales1').get('/audit-logs').expect(403);
    await ctx.as('reviewer1').get('/users/reviewers').expect(403);
    await ctx.as('admin').get('/audit-logs').expect(200);
  });

  it('never stores passwords or tokens in the audit trail', async () => {
    const res = await ctx.as('admin').get('/audit-logs?limit=100').expect(200);
    const dump = JSON.stringify(res.body);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain('wrong-password');
    expect(dump).not.toContain(ctx.tokens.sales1);
    expect(res.body.items.some((a: { action: string }) => a.action === 'LOGIN_FAILED')).toBe(true);
  });
});
