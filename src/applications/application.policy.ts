import { AuthUser } from '../common/decorators';
import { Role } from '../users/role.enum';
import { MerchantApplication } from './application.entity';

/**
 * Object-level authorization. Kept pure and centralised so every rule is unit-testable and
 * there is exactly one place that decides "who may touch this row".
 */
export const ApplicationPolicy = {
  canView(u: AuthUser, a: MerchantApplication): boolean {
    switch (u.role) {
      case Role.ADMIN: return true;
      case Role.SALES: return a.createdById === u.id;
      case Role.REVIEWER: return a.assignedReviewerId === u.id;
      default: return false;
    }
  },
  /** SALES: own applications only. ADMIN: any. REVIEWER: never edits business data. */
  canEdit(u: AuthUser, a: MerchantApplication): boolean {
    return u.role === Role.ADMIN || (u.role === Role.SALES && a.createdById === u.id);
  },
  canSubmit(u: AuthUser, a: MerchantApplication): boolean {
    return ApplicationPolicy.canEdit(u, a);
  },
  /** Strictly the assigned reviewer — not even ADMIN may record a risk decision. */
  canDecide(u: AuthUser, a: MerchantApplication): boolean {
    return u.role === Role.REVIEWER && a.assignedReviewerId === u.id;
  },
};
