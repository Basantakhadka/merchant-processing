# Merchant Onboarding & Risk Review API

NestJS 10 · TypeScript · PostgreSQL (TypeORM + migrations) · Redis + BullMQ · JWT + role/object-level authorization · Swagger · Jest + Supertest · Docker Compose

Merchants apply (SALES), an ADMIN assigns a REVIEWER, a background worker runs a simulated third-party KYB/risk check, and the assigned REVIEWER approves / rejects / requests info. Every significant action is audited.

---

## 1. Quick start

Prerequisites: Node 18+ (20 recommended), Docker + Docker Compose.

```bash
cp .env.example .env            # local-dev placeholders only; .env is git-ignored
npm install
docker compose up -d postgres redis   # Postgres on :5433, Redis on :6380 (non-default ports to avoid clashes)
npm run migration:run           # applies reviewed migrations
npm run seed                    # creates demo users (see table below)
npm run start:dev               # http://localhost:3000   Swagger: http://localhost:3000/docs
```

Or run everything (API + Postgres + Redis) in containers — migrations and seed run automatically:

```bash
cp .env.example .env
docker compose --profile app up -d --build
# Swagger: http://localhost:3000/docs
```

Before using real environments, generate your own secrets: `openssl rand -hex 32` for `JWT_SECRET` and `FIELD_ENCRYPTION_KEY`.

### Seed users (from `.env.example`)

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@example.test` | `Admin#Local123` |
| REVIEWER | `reviewer1@example.test`, `reviewer2@example.test` | `Reviewer#Local123` |
| SALES | `sales1@example.test`, `sales2@example.test` | `Sales#Local123` |

(Dev-only placeholders; change them in `.env` before seeding.)

---

## 2. Testing the API with Swagger (step-by-step)

Open **http://localhost:3000/docs**. Every endpoint is documented; protected ones show a lock icon.

**How to authenticate in Swagger**
1. Expand `POST /auth/login` → *Try it out* → body `{"email":"sales1@example.test","password":"Sales#Local123"}` → *Execute*.
2. Copy `accessToken` from the response.
3. Click **Authorize** (top right), paste the token (no `Bearer ` prefix), *Authorize*, *Close*.
4. To switch role, log in as someone else and **Authorize → Logout → paste the new token**. (Tokens last 15 min; `persistAuthorization` keeps it across page reloads.)

### Walkthrough A — happy path

| # | Log in as | Call | Expect |
|---|---|---|---|
| 1 | sales1 | `POST /applications` — click *Example Value* body and Execute | `201`, `status: DRAFT`, `ownerNationalIdMasked: ****…`. **Copy `id`.** |
| 2 | sales1 | `PATCH /applications/{id}` `{"businessName":"Renamed"}` | `200` (editable while DRAFT) |
| 3 | admin | `GET /users/reviewers` | list of reviewers — copy `reviewer1`'s `id` |
| 4 | admin | `PATCH /applications/{id}/assignment` `{"reviewerId":"<id>"}` | `200`, `assignedReviewerId` set |
| 5 | sales1 | `POST /applications/{id}/submit` | `202`, `status: SUBMITTED`, `riskStatus: PENDING` (job queued) |
| 6 | sales1 | `GET /applications/{id}` (wait ~1 s, repeat) | `riskStatus` becomes `PASSED` / `FLAGGED` / `FAILED`, `riskScore` set |
| 7 | reviewer1 | `POST /applications/{id}/decision` `{"decision":"APPROVE","notes":"ok"}` | `200`, `status: APPROVED` (if risk was `FAILED`, approve returns `409`; use `REJECT`) |
| 8 | admin | `GET /audit-logs?entityId={id}` | created → submitted → assigned → risk completed → decision |

### Walkthrough B — security checks (all must be refused)

| Log in as | Call | Expect |
|---|---|---|
| sales2 | `GET /applications/{id}` of sales1's app | `404` (no existence leak) |
| sales2 | `PATCH /applications/{id}` / `POST …/submit` | `404`, data unchanged |
| sales2 | `GET /applications` | only sales2's own rows |
| sales1 | `PATCH …/assignment`, `POST …/decision`, `GET /audit-logs` | `403` |
| sales1 | `PATCH /applications/{id}` with `{"status":"APPROVED"}` | `400` (non-whitelisted field) |
| reviewer2 | `POST …/decision` on an app assigned to reviewer1 | `404` |
| admin | `POST …/decision` | `403` — only the assigned REVIEWER may decide |
| sales1 | edit/submit after SUBMITTED, or decide twice | `409` invalid state transition |

### Walkthrough C — steering the simulated risk provider

The provider is simulated and deterministic; the **legal business name** drives the outcome:

| `legalBusinessName` contains | Behaviour |
|---|---|
| `Sanction` | score 99 → `FAILED` (approve blocked, reject allowed) |
| `Flaky` | provider "times out" twice; BullMQ retries with exponential backoff, 3rd attempt succeeds |
| `ProviderDown` | always errors; after `RISK_JOB_ATTEMPTS` the application gets `riskStatus: ERROR` (+ audit `RISK_REVIEW_FAILED`); an ADMIN can `POST /applications/{id}/risk-review/retry` |
| anything else | `hash(name) % 100` → `<60` PASSED, `60–84` FLAGGED, `≥85` FAILED |

### cURL equivalent

```bash
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"sales1@example.test","password":"Sales#Local123"}' | jq -r .accessToken)
curl -s localhost:3000/applications -H "Authorization: Bearer $TOKEN"
```

---

## 2b. Payments (assignment section D, assumed)

After `APPROVED`, SALES/ADMIN create a payment (`POST /applications/:id/payments`, `Idempotency-Key` header). The simulated provider reports the result through `POST /payments/webhook` (HMAC-SHA256 signature + timestamp, idempotent on `eventId`). ADMIN can trigger it from Swagger with `POST /payments/:id/simulate-callback`. Needs `PAYMENT_WEBHOOK_SECRET` in `.env`. Full walkthrough: `code.md` Part 7.

---

## 3. Automated tests

```bash
npm test            # unit tests (no infra needed)
npm run test:e2e    # integration tests (needs `docker compose up -d postgres redis`)
npm run test:all
```

E2E tests run against the real Postgres (database `merchant_test`, dropped/recreated each suite; the helper refuses to touch a non-test DB) and real Redis/BullMQ (`bull-test` key prefix), through the same validation/filter pipeline as production (`setupApp`).

| Suite | Proves |
|---|---|
| `auth.e2e-spec` | login, 401s (missing / garbage / forged token), deactivated users locked out, role gates, no passwords/tokens in audit |
| `authorization.e2e-spec` | **SALES cannot read / update / submit / list another SALES user's application by id**; non-assigned REVIEWER and ADMIN cannot decide; body-injection of `createdById`/`status` rejected; reassigning revokes rights |
| `lifecycle.e2e-spec` | validation, encrypted+masked national id, create→submit→risk→decide, request-info→resubmit (new risk run), terminal states, concurrent double-submit enqueues exactly one job, filtering + pagination |
| `risk.e2e-spec` | worker persists result, retries with backoff, `ERROR` after exhaustion + admin retry, **idempotency** (duplicate enqueue, concurrent redelivery, stale-submission replay) |
| `payments.e2e-spec` | payment only after APPROVED, Idempotency-Key replay / race, bad / stale / tampered signatures, duplicate + concurrent webhook events applied once, final payments immutable, SALES / REVIEWER / ADMIN object-level access |
| unit specs | state machine, authorization policy, redaction, AES-GCM crypto, risk provider |

---

## 4. Architecture

```
src/
  main.ts / setup-app.ts     bootstrap, pipes, filter, helmet, Swagger (shared with e2e)
  config/                    typed, validated env config (fails fast)
  common/                    decorators (@Roles, @Public, @CurrentUser), guards, exception filter, crypto, redaction
  auth/                      login, JWT strategy (re-checks user on every request)
  users/                     user entity, reviewer lookup
  applications/              entity, DTOs, pure state machine, pure policy, service, controller
  risk/                      BullMQ queue service, processor (worker), simulated provider, risk_checks entity
  audit/                     audit_logs entity/service/ADMIN query endpoint
  payments/                  payments after APPROVED: idempotent create, signed idempotent webhook, simulate endpoint
  database/                  data-source, migrations, seed
test/                        Supertest e2e suites
```

### Request pipeline
`ThrottlerGuard → JwtAuthGuard (global, @Public to opt out) → RolesGuard (@Roles) → ValidationPipe (whitelist + forbidNonWhitelisted) → controller → service (object-level policy) → AllExceptionsFilter`.

### Lifecycle

```
DRAFT ──submit──▶ SUBMITTED ──decision──▶ APPROVED
  ▲                  │  │                 REJECTED   (terminal)
  │                  │  └──REQUEST_INFO──▶ INFO_REQUESTED ──submit──┐
  └──────────────────┴──────────────────────────────────────────────┘
```
* Editable only in `DRAFT` / `INFO_REQUESTED`.
* Decisions need `SUBMITTED` **and** a finished risk review; `APPROVE` is refused when risk is `FAILED`/`ERROR`.
* Rules live in `application-state.ts` (pure, unit-tested); the service applies them inside a transaction holding a row lock (`SELECT … FOR UPDATE`), so races (double submit, decide-while-edit) resolve to exactly one winner and a `409`.

### Authorization model
| | ADMIN | REVIEWER | SALES |
|---|---|---|---|
| Create / edit / submit | ✔ (any) | ✘ | ✔ (own only) |
| View | all | assigned only | own only |
| Assign reviewer | ✔ | ✘ | ✘ |
| Record decision | ✘ (by design) | ✔ assigned only | ✘ |
| Audit log, retry risk | ✔ | ✘ | ✘ |

* Role checks are declarative (`@Roles`); object-level checks are centralised in `ApplicationPolicy` and also pushed **into list queries** so other users' rows are never loaded.
* Not-visible objects return **404**, not 403, so ids can't be probed. Visible-but-not-permitted returns **403**.
* `createdById` always comes from the token; DTO whitelisting means clients can never set `status`, `riskStatus`, `assignedReviewerId`, etc.

### Async risk review (reliability)
1. `submit` commits the status change + `risk_checks` anchor row + audit in **one transaction**, then enqueues a job **after commit** (the worker never sees uncommitted data).
2. **Idempotency, three layers:** deterministic BullMQ `jobId = risk-{appId}-{submissionNo}-{runs}` (duplicate adds ignored); unique `(application_id, submission_no)` row — a `COMPLETED` check short-circuits reprocessing; the result write is locked and guarded by `submission_count = :n AND status = SUBMITTED`, so a stale/redelivered job can never overwrite a newer submission.
3. **Retries:** `attempts` (default 4) with exponential backoff (`RISK_JOB_BACKOFF_MS`). On the final failure the `failed` handler marks the check `FAILED`, sets `riskStatus = ERROR`, and audits it — nothing is silently stuck.
4. **Known gap (documented trade-off):** if Redis is down at the instant after commit, the application stays `PENDING`. Production fix = transactional outbox; here an ADMIN endpoint (`POST /applications/{id}/risk-review/retry`) re-queues it.
5. The worker runs in the API process for simplicity; `RiskModule` can be hosted in a separate worker entrypoint unchanged.

### Data model (PostgreSQL, migrations only — `synchronize: false`)
`users`, `merchant_applications` (enums, CHECK constraints, FKs, composite indexes for the scoped/filtered list queries), `risk_checks` (unique idempotency key), `audit_logs` (jsonb metadata, indexed by entity and actor). Migration: `src/database/migrations/`. Rollback: `npm run migration:revert`.

---

## 5. Sensitive data & audit

| Data | Treatment |
|---|---|
| Passwords | bcrypt hash only (`select: false` column); never logged or audited; login failures record only the attempted email |
| JWT / tokens / secrets | never logged or stored; secrets come from env; `.env` is git-ignored, `.env.example` has placeholders only |
| `ownerNationalId` | **field-level encrypted** (AES-256-GCM, random IV, auth tag, `v1:` version prefix) via a TypeORM transformer; **masked** in API responses (`ownerNationalIdMasked`); never put in audit metadata |
| Other PII (owner name/email/phone) | stored in clear (needed for operations). **Recommended next:** encrypt phone/email too, or use envelope encryption with KMS and key rotation |
| Audit metadata | passes through `redact()` (keys like password/token/secret/nationalId/card → `[REDACTED]`); update events log changed *field names*, not values |

Audited actions: login success/failure, application created / updated / submitted / assigned, review decision, risk review completed / failed (system actor = `null`). Audit rows are written in the **same transaction** as the change they describe. Storage is PostgreSQL (permitted by the brief); the table is append-only by convention — production should add DB-level insert-only grants.

Other hardening: `helmet`, global rate limiting + stricter login throttle, uniform "Invalid credentials" with constant-time bcrypt compare for unknown users, centralised error filter (no stack traces / SQL leakage), UUID param validation, deactivated users rejected immediately.

---

## 6. Trade-offs / not done
* Access tokens only (15 min); no refresh tokens / logout revocation.
* Single-process worker; no dead-letter dashboard (Bull Board would be a small addition).
* Optional extras skipped: webhook callback, MongoDB audit store, separate ADR (decisions are recorded above).
* Reviewer pool assignment is manual (ADMIN); no auto-assignment/queue for unassigned apps.
* Risk provider is simulated by design.
