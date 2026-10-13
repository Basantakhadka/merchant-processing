import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1760000000000 implements MigrationInterface {
  name = 'InitialSchema1760000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await q.query(`CREATE TYPE "user_role" AS ENUM ('ADMIN','REVIEWER','SALES')`);
    await q.query(`CREATE TYPE "business_type" AS ENUM ('SOLE_PROPRIETOR','PARTNERSHIP','PRIVATE_LIMITED','PUBLIC_LIMITED','NON_PROFIT')`);
    await q.query(`CREATE TYPE "application_status" AS ENUM ('DRAFT','SUBMITTED','INFO_REQUESTED','APPROVED','REJECTED')`);
    await q.query(`CREATE TYPE "risk_status" AS ENUM ('NOT_STARTED','PENDING','PASSED','FLAGGED','FAILED','ERROR')`);
    await q.query(`CREATE TYPE "risk_check_status" AS ENUM ('PENDING','COMPLETED','FAILED')`);
    await q.query(`CREATE TYPE "audit_action" AS ENUM ('LOGIN_SUCCESS','LOGIN_FAILED','APPLICATION_CREATED','APPLICATION_UPDATED','APPLICATION_SUBMITTED','APPLICATION_ASSIGNED','REVIEW_DECISION','RISK_REVIEW_COMPLETED','RISK_REVIEW_FAILED')`);

    await q.query(`CREATE TABLE "users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "email" varchar(255) NOT NULL,
      "name" varchar(120) NOT NULL,
      "password_hash" varchar(100) NOT NULL,
      "role" "user_role" NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "chk_users_email_lower" CHECK ("email" = lower("email"))
    )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")`);

    await q.query(`CREATE TABLE "merchant_applications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "business_name" varchar(200) NOT NULL,
      "legal_business_name" varchar(200) NOT NULL,
      "business_type" "business_type" NOT NULL,
      "owner_name" varchar(150) NOT NULL,
      "owner_email" varchar(255) NOT NULL,
      "owner_phone" varchar(30) NOT NULL,
      "owner_national_id_enc" text,
      "expected_monthly_volume" numeric(14,2) NOT NULL CHECK ("expected_monthly_volume" > 0),
      "average_ticket_size" numeric(14,2) NOT NULL CHECK ("average_ticket_size" > 0),
      "currency" char(3) NOT NULL,
      "status" "application_status" NOT NULL DEFAULT 'DRAFT',
      "risk_status" "risk_status" NOT NULL DEFAULT 'NOT_STARTED',
      "risk_score" int,
      "submission_count" int NOT NULL DEFAULT 0,
      "decision_notes" text,
      "decided_at" timestamptz,
      "submitted_at" timestamptz,
      "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "assigned_reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX "IDX_apps_created_by_status" ON "merchant_applications" ("created_by_id","status")`);
    await q.query(`CREATE INDEX "IDX_apps_reviewer_status" ON "merchant_applications" ("assigned_reviewer_id","status")`);
    await q.query(`CREATE INDEX "IDX_apps_status_created" ON "merchant_applications" ("status","created_at")`);

    await q.query(`CREATE TABLE "risk_checks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "application_id" uuid NOT NULL REFERENCES "merchant_applications"("id") ON DELETE CASCADE,
      "submission_no" int NOT NULL,
      "status" "risk_check_status" NOT NULL DEFAULT 'PENDING',
      "score" int,
      "outcome" varchar(20),
      "provider_reference" varchar(100),
      "runs" int NOT NULL DEFAULT 0,
      "last_error" text,
      "completed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_risk_checks_app_submission" ON "risk_checks" ("application_id","submission_no")`);

    await q.query(`CREATE TABLE "audit_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "actor_id" uuid,
      "action" "audit_action" NOT NULL,
      "entity_type" varchar(50) NOT NULL,
      "entity_id" varchar(64),
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX "IDX_audit_entity" ON "audit_logs" ("entity_type","entity_id","created_at")`);
    await q.query(`CREATE INDEX "IDX_audit_actor" ON "audit_logs" ("actor_id","created_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "audit_logs"`);
    await q.query(`DROP TABLE "risk_checks"`);
    await q.query(`DROP TABLE "merchant_applications"`);
    await q.query(`DROP TABLE "users"`);
    for (const t of ['audit_action', 'risk_check_status', 'risk_status', 'application_status', 'business_type', 'user_role']) {
      await q.query(`DROP TYPE "${t}"`);
    }
  }
}
