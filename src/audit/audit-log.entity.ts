import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_UPDATED = 'APPLICATION_UPDATED',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  APPLICATION_ASSIGNED = 'APPLICATION_ASSIGNED',
  REVIEW_DECISION = 'REVIEW_DECISION',
  RISK_REVIEW_COMPLETED = 'RISK_REVIEW_COMPLETED',
  RISK_REVIEW_FAILED = 'RISK_REVIEW_FAILED',
  PAYMENT_CREATED = 'PAYMENT_CREATED',
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

@Entity('audit_logs')
@Index(['entityType', 'entityId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  /** null for system actions (the risk worker) and failed logins for unknown users. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action' }) action: AuditAction;
  @Column({ name: 'entity_type', type: 'varchar', length: 50 }) entityType: string;
  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true }) entityId: string | null;
  /** Always passed through redact() before insert. */
  @Column({ type: 'jsonb', default: () => `'{}'` }) metadata: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
