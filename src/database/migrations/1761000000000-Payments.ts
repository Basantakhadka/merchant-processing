import { MigrationInterface, QueryRunner } from 'typeorm';

export class Payments1761000000000 implements MigrationInterface {
  name = 'Payments1761000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "payment_status" AS ENUM ('PENDING','SUCCEEDED','FAILED')`);
    for (const v of ['PAYMENT_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED']) {
      await q.query(`ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS '${v}'`);
    }
    await q.query(`CREATE TABLE "payments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "application_id" uuid NOT NULL REFERENCES "merchant_applications"("id") ON DELETE RESTRICT,
      "amount" numeric(14,2) NOT NULL CHECK ("amount" > 0),
      "currency" char(3) NOT NULL,
      "description" varchar(200),
      "status" "payment_status" NOT NULL DEFAULT 'PENDING',
      "idempotency_key" varchar(64) NOT NULL,
      "provider_reference" varchar(100) NOT NULL,
      "failure_reason" varchar(200),
      "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "completed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_payments_app_idem" ON "payments" ("application_id","idempotency_key")`);
    await q.query(`CREATE UNIQUE INDEX "IDX_payments_provider_ref" ON "payments" ("provider_reference")`);
    await q.query(`CREATE INDEX "IDX_payments_app_created" ON "payments" ("application_id","created_at")`);
    await q.query(`CREATE TABLE "payment_webhook_events" (
      "event_id" varchar(100) PRIMARY KEY,
      "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
      "outcome" varchar(20) NOT NULL,
      "received_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "payment_webhook_events"`);
    await q.query(`DROP TABLE "payments"`);
    await q.query(`DROP TYPE "payment_status"`);
    // Postgres cannot drop enum values: the PAYMENT_* audit_action values are intentionally left in place.
  }
}
