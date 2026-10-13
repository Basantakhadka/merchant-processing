import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RISK_QUEUE, RiskJobData, riskJobId } from './risk.constants';

@Injectable()
export class RiskQueueService {
  constructor(@InjectQueue(RISK_QUEUE) private readonly queue: Queue<RiskJobData>, private readonly config: ConfigService) {}

  /** Deterministic jobId => enqueueing the same submission twice is a no-op (BullMQ de-duplicates by id). */
  enqueue(applicationId: string, submissionNo: number, runs = 0) {
    return this.queue.add('screen', { applicationId, submissionNo }, {
      jobId: riskJobId(applicationId, submissionNo, runs),
      attempts: this.config.getOrThrow<number>('risk.attempts'),
      backoff: { type: 'exponential', delay: this.config.getOrThrow<number>('risk.backoffMs') },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
