import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { encryptedTransformer } from '../common/crypto/field-crypto';
import { User } from '../users/user.entity';
import { ApplicationStatus, BusinessType, RiskStatus } from './enums';

const numeric = { to: (v?: number) => v, from: (v?: string | null) => (v == null ? v : parseFloat(v)) };

@Entity('merchant_applications')
@Index(['createdById', 'status'])
@Index(['assignedReviewerId', 'status'])
@Index(['status', 'createdAt'])
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'business_name', type: 'varchar', length: 200 }) businessName: string;
  @Column({ name: 'legal_business_name', type: 'varchar', length: 200 }) legalBusinessName: string;
  @Column({ name: 'business_type', type: 'enum', enum: BusinessType, enumName: 'business_type' }) businessType: BusinessType;

  @Column({ name: 'owner_name', type: 'varchar', length: 150 }) ownerName: string;
  @Column({ name: 'owner_email', type: 'varchar', length: 255 }) ownerEmail: string;
  @Column({ name: 'owner_phone', type: 'varchar', length: 30 }) ownerPhone: string;
  /** Field-level encrypted (AES-256-GCM). Masked in API responses and redacted in audit logs. */
  @Column({ name: 'owner_national_id_enc', type: 'text', nullable: true, transformer: encryptedTransformer }) ownerNationalId: string | null;

  @Column({ name: 'expected_monthly_volume', type: 'numeric', precision: 14, scale: 2, transformer: numeric }) expectedMonthlyVolume: number;
  @Column({ name: 'average_ticket_size', type: 'numeric', precision: 14, scale: 2, transformer: numeric }) averageTicketSize: number;
  @Column({ type: 'char', length: 3 }) currency: string;

  @Column({ type: 'enum', enum: ApplicationStatus, enumName: 'application_status', default: ApplicationStatus.DRAFT }) status: ApplicationStatus;
  @Column({ name: 'risk_status', type: 'enum', enum: RiskStatus, enumName: 'risk_status', default: RiskStatus.NOT_STARTED }) riskStatus: RiskStatus;
  @Column({ name: 'risk_score', type: 'int', nullable: true }) riskScore: number | null;
  /** Incremented on every (re)submission; part of the risk-job idempotency key. */
  @Column({ name: 'submission_count', type: 'int', default: 0 }) submissionCount: number;

  @Column({ name: 'decision_notes', type: 'text', nullable: true }) decisionNotes: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt: Date | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' }) createdById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_id' }) createdBy?: User;

  @Column({ name: 'assigned_reviewer_id', type: 'uuid', nullable: true }) assignedReviewerId: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'assigned_reviewer_id' }) assignedReviewer?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
