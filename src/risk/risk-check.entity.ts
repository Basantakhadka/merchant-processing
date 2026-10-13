import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum RiskCheckStatus { PENDING = 'PENDING', COMPLETED = 'COMPLETED', FAILED = 'FAILED' }

/**
 * One row per (application, submission). The unique key is the idempotency anchor: a redelivered or
 * duplicated job finds the same row and a COMPLETED row short-circuits the work.
 */
@Entity('risk_checks')
@Index(['applicationId', 'submissionNo'], { unique: true })
export class RiskCheck {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'application_id', type: 'uuid' }) applicationId: string;
  @Column({ name: 'submission_no', type: 'int' }) submissionNo: number;
  @Column({ type: 'enum', enum: RiskCheckStatus, enumName: 'risk_check_status', default: RiskCheckStatus.PENDING }) status: RiskCheckStatus;
  @Column({ type: 'int', nullable: true }) score: number | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) outcome: string | null;
  @Column({ name: 'provider_reference', type: 'varchar', length: 100, nullable: true }) providerReference: string | null;
  /** Number of manual re-queues (POST .../risk-review/retry); part of the BullMQ jobId. */
  @Column({ type: 'int', default: 0 }) runs: number;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
