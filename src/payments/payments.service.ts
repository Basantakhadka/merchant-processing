import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MerchantApplication } from '../applications/application.entity';
import { ApplicationPolicy } from '../applications/application.policy';
import { ApplicationStatus } from '../applications/enums';
import { AuditAction } from '../audit/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreatePaymentDto, WebhookEventDto } from './dto';
import { PaymentProviderService } from './payment-provider.service';
import { Payment, PaymentStatus, PaymentWebhookEvent } from './payment.entity';

const ENTITY = 'Payment';
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @InjectRepository(MerchantApplication) private readonly apps: Repository<MerchantApplication>,
    private readonly audit: AuditService,
    private readonly provider: PaymentProviderService,
  ) {}

  /** Creates a PENDING payment for an APPROVED application. Replaying the same Idempotency-Key returns the same payment. */
  async create(user: AuthUser, applicationId: string, dto: CreatePaymentDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !KEY_RE.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header is required (8-64 chars: letters, digits, "-" or "_")');
    }
    return this.ds.transaction(async (m) => {
      // Row lock on the application serialises concurrent requests for the same application.
      const app = await this.lockVisible(m, user, applicationId);
      if (!ApplicationPolicy.canEdit(user, app)) throw new ForbiddenException('You may not create payments for this application');
      if (app.status !== ApplicationStatus.APPROVED) throw new ConflictException(`Payments require an APPROVED application (current: ${app.status})`);

      const existing = await m.findOne(Payment, { where: { applicationId, idempotencyKey } });
      if (existing) {
        if (Number(existing.amount) !== dto.amount || (existing.description ?? null) !== (dto.description ?? null)) {
          throw new ConflictException('Idempotency-Key was already used with a different payload');
        }
        return { payment: existing, created: false };
      }
      const payment = await m.save(m.create(Payment, {
        applicationId, amount: dto.amount, currency: app.currency, description: dto.description ?? null,
        idempotencyKey, createdById: user.id, providerReference: this.provider.initiate(applicationId, idempotencyKey).reference,
      }));
      await this.audit.record({ actorId: user.id, action: AuditAction.PAYMENT_CREATED, entityType: ENTITY, entityId: payment.id,
        metadata: { applicationId, amount: payment.amount, currency: payment.currency, providerReference: payment.providerReference } }, m);
      return { payment, created: true };
    });
  }

  async listForApplication(user: AuthUser, applicationId: string) {
    await this.getVisibleApp(user, applicationId);
    return this.repo.find({ where: { applicationId }, order: { createdAt: 'DESC' } });
  }

  async get(user: AuthUser, id: string) {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.getVisibleApp(user, payment.applicationId).catch(() => { throw new NotFoundException('Payment not found'); });
    return payment;
  }

  /**
   * Provider callback. Idempotent on `eventId`: duplicates are acknowledged without side effects, and a payment
   * that already reached a final state is never changed again.
   */
  async handleWebhook(evt: WebhookEventDto): Promise<{ result: 'applied' | 'duplicate' | 'ignored'; paymentId: string }> {
    return this.ds.transaction(async (m) => {
      const payment = await m.findOne(Payment, { where: { providerReference: evt.providerReference }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Unknown payment reference'); // rolls back; provider may retry later

      const ins = await m.query(
        `INSERT INTO payment_webhook_events (event_id, payment_id, outcome) VALUES ($1, $2, 'APPLIED') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [evt.eventId, payment.id],
      );
      if (!ins.length) return { result: 'duplicate' as const, paymentId: payment.id };

      if (payment.status !== PaymentStatus.PENDING) {
        await m.update(PaymentWebhookEvent, evt.eventId, { outcome: 'IGNORED' });
        return { result: 'ignored' as const, paymentId: payment.id };
      }
      payment.status = evt.status === 'SUCCEEDED' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
      payment.failureReason = evt.status === 'FAILED' ? (evt.failureReason ?? 'Declined by provider') : null;
      payment.completedAt = new Date();
      await m.save(payment);
      await this.audit.record({ actorId: null, // system actor
        action: payment.status === PaymentStatus.SUCCEEDED ? AuditAction.PAYMENT_SUCCEEDED : AuditAction.PAYMENT_FAILED,
        entityType: ENTITY, entityId: payment.id, metadata: { applicationId: payment.applicationId, eventId: evt.eventId, status: payment.status } }, m);
      return { result: 'applied' as const, paymentId: payment.id };
    });
  }

  private async getVisibleApp(user: AuthUser, id: string) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app || !ApplicationPolicy.canView(user, app)) throw new NotFoundException('Application not found');
    return app;
  }

  private async lockVisible(m: EntityManager, user: AuthUser, id: string) {
    const app = await m.getRepository(MerchantApplication).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!app || !ApplicationPolicy.canView(user, app)) throw new NotFoundException('Application not found');
    return app;
  }
}
