import { maskTail } from '../common/utils/redact';
import { MerchantApplication } from './application.entity';

/** Explicit response shape: the encrypted national id is never returned in clear text. */
export function toResponse(a: MerchantApplication) {
  const { ownerNationalId, createdBy, assignedReviewer, ...rest } = a;
  return { ...rest, ownerNationalIdMasked: maskTail(ownerNationalId) };
}
