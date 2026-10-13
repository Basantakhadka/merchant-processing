import { ConflictException } from '@nestjs/common';
import { assertDecisionAllowed, assertTransition, canTransition, isEditable } from './application-state';
import { ApplicationStatus as S, ReviewDecision as D, RiskStatus as R } from './enums';

describe('application state rules', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition(S.DRAFT, S.SUBMITTED)).toBe(true);
    expect(canTransition(S.INFO_REQUESTED, S.SUBMITTED)).toBe(true);
    expect(canTransition(S.SUBMITTED, S.APPROVED)).toBe(true);
    expect(canTransition(S.DRAFT, S.APPROVED)).toBe(false);
    expect(canTransition(S.APPROVED, S.REJECTED)).toBe(false);
    expect(canTransition(S.REJECTED, S.SUBMITTED)).toBe(false);
    expect(() => assertTransition(S.APPROVED, S.SUBMITTED)).toThrow(ConflictException);
  });

  it('is editable only in DRAFT and INFO_REQUESTED', () => {
    expect([S.DRAFT, S.INFO_REQUESTED].every(isEditable)).toBe(true);
    expect([S.SUBMITTED, S.APPROVED, S.REJECTED].some(isEditable)).toBe(false);
  });

  describe('assertDecisionAllowed', () => {
    it.each([R.PASSED, R.FLAGGED])('allows approve when risk is %s', (r) => {
      expect(() => assertDecisionAllowed(S.SUBMITTED, r, D.APPROVE)).not.toThrow();
    });
    it.each([R.FAILED, R.ERROR])('blocks approve when risk is %s but allows reject', (r) => {
      expect(() => assertDecisionAllowed(S.SUBMITTED, r, D.APPROVE)).toThrow(ConflictException);
      expect(() => assertDecisionAllowed(S.SUBMITTED, r, D.REJECT)).not.toThrow();
    });
    it.each([R.PENDING, R.NOT_STARTED])('blocks any decision while risk is %s', (r) => {
      for (const d of Object.values(D)) expect(() => assertDecisionAllowed(S.SUBMITTED, r, d)).toThrow(/not completed/);
    });
    it('blocks decisions on non-SUBMITTED applications', () => {
      for (const s of [S.DRAFT, S.INFO_REQUESTED, S.APPROVED, S.REJECTED]) {
        expect(() => assertDecisionAllowed(s, R.PASSED, D.APPROVE)).toThrow(ConflictException);
      }
    });
  });
});
