import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentStatus { PENDING = 'PENDING', SUCCEEDED = 'SUCCEEDED', FAILED = 'FAILED' }

const numeric = { to: (v?: number) => v, from: (v?: string | null) => (v == null ? v : parseFloat(v)) };

/** A payment request against an APPROVED application. No card data is ever stored — only amount + provider reference. */
@Entity('payments')
@Index(['applicationId', 'idempotencyKey'], { unique: true })
@Index(['providerReference'], { unique: true })
@Index(['applicationId', 'createdAt'])
export class Payment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'application_id', type: 'uuid' }) applicationId: string;
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numeric }) amount: number;
  /** Always copied from the application, never from the request body. */
  @Column({ type: 'char', length: 3 }) currency: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'payment_status', default: PaymentStatus.PENDING }) status: PaymentStatus;
  /** Client-supplied Idempotency-Key; unique per application so retries never create a second payment. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 64 }) idempotencyKey: string;
  @Column({ name: 'provider_reference', type: 'varchar', length: 100 }) providerReference: string;
  @Column({ name: 'failure_reason', type: 'varchar', length: 200, nullable: true }) failureReason: string | null;
  @Column({ name: 'created_by_id', type: 'uuid' }) createdById: string;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** One row per provider event id: the primary key is the webhook idempotency anchor. */
@Entity('payment_webhook_events')
export class PaymentWebhookEvent {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 100 }) eventId: string;
  @Column({ name: 'payment_id', type: 'uuid' }) paymentId: string;
  @ManyToOne(() => Payment, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'payment_id' }) payment?: Payment;
  /** APPLIED, or IGNORED when the payment was already in a final state. */
  @Column({ type: 'varchar', length: 20 }) outcome: string;
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' }) receivedAt: Date;
}
