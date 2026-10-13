import { Role } from '../users/role.enum';
import { MerchantApplication } from './application.entity';
import { ApplicationPolicy as P } from './application.policy';

const app = { createdById: 'sales-1', assignedReviewerId: 'rev-1' } as MerchantApplication;
const u = (role: Role, id: string) => ({ id, role, email: 'x@test' });

describe('ApplicationPolicy', () => {
  it('SALES can view/edit/submit only own applications', () => {
    expect(P.canView(u(Role.SALES, 'sales-1'), app)).toBe(true);
    expect(P.canView(u(Role.SALES, 'sales-2'), app)).toBe(false);
    expect(P.canEdit(u(Role.SALES, 'sales-2'), app)).toBe(false);
    expect(P.canSubmit(u(Role.SALES, 'sales-2'), app)).toBe(false);
  });
  it('REVIEWER can view only assigned applications and never edit', () => {
    expect(P.canView(u(Role.REVIEWER, 'rev-1'), app)).toBe(true);
    expect(P.canView(u(Role.REVIEWER, 'rev-2'), app)).toBe(false);
    expect(P.canEdit(u(Role.REVIEWER, 'rev-1'), app)).toBe(false);
  });
  it('only the assigned REVIEWER may decide — not ADMIN, not SALES owner, not another reviewer', () => {
    expect(P.canDecide(u(Role.REVIEWER, 'rev-1'), app)).toBe(true);
    expect(P.canDecide(u(Role.REVIEWER, 'rev-2'), app)).toBe(false);
    expect(P.canDecide(u(Role.ADMIN, 'admin'), app)).toBe(false);
    expect(P.canDecide(u(Role.SALES, 'sales-1'), app)).toBe(false);
    expect(P.canDecide(u(Role.REVIEWER, 'rev-1'), { ...app, assignedReviewerId: null } as MerchantApplication)).toBe(false);
  });
  it('ADMIN has full view/edit access', () => {
    expect(P.canView(u(Role.ADMIN, 'a'), app)).toBe(true);
    expect(P.canEdit(u(Role.ADMIN, 'a'), app)).toBe(true);
  });
});
