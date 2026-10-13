import { ConflictException } from '@nestjs/common';
import { ApplicationStatus, ReviewDecision, RiskStatus } from './enums';

/** Pure business rules for the application lifecycle — no I/O, trivially unit-testable. */

export const EDITABLE_STATUSES = [ApplicationStatus.DRAFT, ApplicationStatus.INFO_REQUESTED];
export const TERMINAL_STATUSES = [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED];

export const DECISION_TARGET: Record<ReviewDecision, ApplicationStatus> = {
  [ReviewDecision.APPROVE]: ApplicationStatus.APPROVED,
  [ReviewDecision.REJECT]: ApplicationStatus.REJECTED,
  [ReviewDecision.REQUEST_INFO]: ApplicationStatus.INFO_REQUESTED,
};

const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.DRAFT]: [ApplicationStatus.SUBMITTED],
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED, ApplicationStatus.INFO_REQUESTED],
  [ApplicationStatus.INFO_REQUESTED]: [ApplicationStatus.SUBMITTED],
  [ApplicationStatus.APPROVED]: [],
  [ApplicationStatus.REJECTED]: [],
};

export const canTransition = (from: ApplicationStatus, to: ApplicationStatus) => TRANSITIONS[from].includes(to);

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) throw new ConflictException(`Invalid status transition ${from} -> ${to}`);
}

export const isEditable = (s: ApplicationStatus) => EDITABLE_STATUSES.includes(s);

/**
 * A reviewer may only decide once the async risk check has finished, and may not approve a
 * failed / errored check (they can still reject or request more info).
 */
export function assertDecisionAllowed(status: ApplicationStatus, risk: RiskStatus, decision: ReviewDecision): void {
  assertTransition(status, DECISION_TARGET[decision]);
  if (risk === RiskStatus.PENDING || risk === RiskStatus.NOT_STARTED) {
    throw new ConflictException('Risk review has not completed yet');
  }
  if (decision === ReviewDecision.APPROVE && (risk === RiskStatus.FAILED || risk === RiskStatus.ERROR)) {
    throw new ConflictException(`Cannot approve an application with risk status ${risk}`);
  }
}
