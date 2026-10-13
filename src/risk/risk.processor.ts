import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { MerchantApplication } from '../applications/application.entity';
import { ApplicationStatus, RiskStatus } from '../applications/enums';
import { AuditAction } from '../audit/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RISK_QUEUE, RiskJobData } from './risk.constants';
import { RiskCheck, RiskCheckStatus } from './risk-check.entity';
import { RiskProviderService } from './risk-provider.service';

@Processor(RISK_QUEUE, { concurrency: 5 })
export class RiskProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskProcessor.name);

  constructor(
    private readonly ds: DataSource,
    private readonly provider: RiskProviderService,
    private readonly audit: AuditService,
    @InjectRepository(RiskCheck) private readonly checks: Repository<RiskCheck>,
    @InjectRepository(MerchantApplication) private readonly apps: Repository<MerchantApplication>,
  ) { super(); }

  /** Idempotent: safe to run any number of times for the same (application, submission). */
  async process(job: Job<RiskJobData>): Promise<void> {
    const { applicationId, submissionNo } = job.data;

    // Ensure the anchor row exists (no-op if a duplicate job already created it).
    await this.checks.createQueryBuilder().insert().values({ applicationId, submissionNo }).orIgnore().execute();
    const check = await this.checks.findOneOrFail({ where: { applicationId, submissionNo } });
    if (check.status === RiskCheckStatus.COMPLETED) return this.logger.log(`Skip ${job.id}: already completed`);

    const app = await this.apps.findOne({ where: { id: applicationId } });
    if (!app || app.submissionCount !== submissionNo || app.status !== ApplicationStatus.SUBMITTED) {
      return this.logger.warn(`Skip ${job.id}: stale job (application moved on)`);
    }

    const result = await this.provider.screen(app, job.attemptsMade); // throws -> BullMQ retries with backoff

    await this.ds.transaction(async (m) => {
      const locked = await m.getRepository(RiskCheck).findOne({ where: { id: check.id }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.status === RiskCheckStatus.COMPLETED) return; // lost a race with a duplicate job
      await m.update(RiskCheck, check.id, {
        status: RiskCheckStatus.COMPLETED, score: result.score, outcome: result.outcome,
        providerReference: result.reference, lastError: null, completedAt: new Date(),
      });
      // Guarded by submission_count + status so a stale result can never overwrite a newer submission.
      const upd = await m.createQueryBuilder().update(MerchantApplication)
        .set({ riskStatus: result.outcome, riskScore: result.score })
        .where('id = :id AND submission_count = :n AND status = :s', { id: applicationId, n: submissionNo, s: ApplicationStatus.SUBMITTED })
        .execute();
      if (upd.affected) {
        await this.audit.record({ actorId: null, action: AuditAction.RISK_REVIEW_COMPLETED, entityType: 'MerchantApplication', entityId: applicationId,
          metadata: { submissionNo, outcome: result.outcome, score: result.score, reference: result.reference } }, m);
      }
    });
  }

  /** Fires after each failed attempt; only acts once BullMQ has exhausted all retries. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobData> | undefined, err: Error) {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return this.logger.warn(`Risk job ${job.id} attempt ${job.attemptsMade}/${attempts} failed: ${err.message}`);
    }
    const { applicationId, submissionNo } = job.data;
    await this.ds.transaction(async (m) => {
      await m.update(RiskCheck, { applicationId, submissionNo }, { status: RiskCheckStatus.FAILED, lastError: err.message.slice(0, 500) });
      const upd = await m.createQueryBuilder().update(MerchantApplication)
        .set({ riskStatus: RiskStatus.ERROR })
        .where('id = :id AND submission_count = :n AND status = :s', { id: applicationId, n: submissionNo, s: ApplicationStatus.SUBMITTED })
        .execute();
      if (upd.affected) {
        await this.audit.record({ actorId: null, action: AuditAction.RISK_REVIEW_FAILED, entityType: 'MerchantApplication', entityId: applicationId,
          metadata: { submissionNo, attempts, error: err.message.slice(0, 200) } }, m);
      }
    });
    this.logger.error(`Risk job ${job.id} exhausted retries: ${err.message}`);
  }
}
