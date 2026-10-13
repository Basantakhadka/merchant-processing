import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MerchantApplication } from '../src/applications/application.entity';
import { RiskStatus } from '../src/applications/enums';
import { RISK_QUEUE } from '../src/risk/risk.constants';
import { setupApp } from '../src/setup-app';
import { Role } from '../src/users/role.enum';
import { User } from '../src/users/user.entity';

export const PASSWORD = 'Test#Passw0rd!';
export const USERS = {
  admin: { email: 'admin@test.example', role: Role.ADMIN },
  reviewer1: { email: 'rev1@test.example', role: Role.REVIEWER },
  reviewer2: { email: 'rev2@test.example', role: Role.REVIEWER },
  sales1: { email: 'sales1@test.example', role: Role.SALES },
  sales2: { email: 'sales2@test.example', role: Role.SALES },
} as const;
export type UserKey = keyof typeof USERS;

export interface TestCtx {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
  tokens: Record<UserKey, string>;
  ids: Record<UserKey, string>;
  as: (u: UserKey) => { get: (p: string) => request.Test; post: (p: string) => request.Test; patch: (p: string) => request.Test };
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function bootstrap(): Promise<TestCtx> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  setupApp(app);
  await app.init();
  const ds = app.get(DataSource);
  if (!/test/i.test(String(ds.options.database))) throw new Error('Refusing to drop a non-test database');
  await ds.dropDatabase();
  await ds.runMigrations();

  const hash = await bcrypt.hash(PASSWORD, 4);
  const ids = {} as Record<UserKey, string>;
  for (const [k, u] of Object.entries(USERS)) {
    const saved = await ds.getRepository(User).save({ email: u.email, name: k, role: u.role, passwordHash: hash });
    ids[k as UserKey] = saved.id;
  }
  const http = () => request(app.getHttpServer());
  const tokens = {} as Record<UserKey, string>;
  for (const [k, u] of Object.entries(USERS)) {
    const res = await http().post('/auth/login').send({ email: u.email, password: PASSWORD }).expect(200);
    tokens[k as UserKey] = res.body.accessToken;
  }
  const queue = app.get<Queue>(getQueueToken(RISK_QUEUE));
  await queue.obliterate({ force: true });

  return {
    app, ds, http, tokens, ids,
    as: (u) => ({
      get: (p) => http().get(p).set('Authorization', `Bearer ${tokens[u]}`),
      post: (p) => http().post(p).set('Authorization', `Bearer ${tokens[u]}`),
      patch: (p) => http().patch(p).set('Authorization', `Bearer ${tokens[u]}`),
    }),
    reset: async () => {
      await ds.query('TRUNCATE audit_logs, risk_checks, merchant_applications RESTART IDENTITY CASCADE');
      await queue.obliterate({ force: true });
    },
    close: async () => { await app.close(); },
  };
}

export const validApplication = (over: Record<string, unknown> = {}) => ({
  businessName: 'Himalayan Coffee',
  legalBusinessName: 'Himalayan Coffee Pvt. Ltd.',
  businessType: 'PRIVATE_LIMITED',
  ownerName: 'Test Owner',
  ownerEmail: 'owner@test.example',
  ownerPhone: '+9779800000000',
  ownerNationalId: 'FAKE-ID-987654321',
  expectedMonthlyVolume: 50000,
  averageTicketSize: 25.5,
  currency: 'NPR',
  ...over,
});

export async function createApp(ctx: TestCtx, as: UserKey = 'sales1', over: Record<string, unknown> = {}) {
  const res = await ctx.as(as).post('/applications').send(validApplication(over)).expect(201);
  return res.body.id as string;
}

/** Polls the DB until the async worker has moved the application out of PENDING. */
export async function waitForRisk(ctx: TestCtx, id: string, timeoutMs = 8000): Promise<MerchantApplication> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const a = await ctx.ds.getRepository(MerchantApplication).findOneByOrFail({ id });
    if (a.riskStatus !== RiskStatus.PENDING) return a;
    if (Date.now() > deadline) throw new Error(`risk review still PENDING after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
