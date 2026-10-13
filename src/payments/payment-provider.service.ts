import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Simulated payment provider. `initiate` returns a deterministic reference; the provider then reports the
 * outcome later through the signed webhook (POST /payments/webhook).
 */
@Injectable()
export class PaymentProviderService {
  initiate(applicationId: string, idempotencyKey: string): { reference: string } {
    return { reference: `pay_${createHash('sha256').update(`${applicationId}:${idempotencyKey}`).digest('hex').slice(0, 20)}` };
  }
}
