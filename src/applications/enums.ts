export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  INFO_REQUESTED = 'INFO_REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RiskStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FLAGGED = 'FLAGGED',
  FAILED = 'FAILED',
  /** Provider could not be reached after all retries; needs an operator retry. */
  ERROR = 'ERROR',
}

export enum BusinessType {
  SOLE_PROPRIETOR = 'SOLE_PROPRIETOR',
  PARTNERSHIP = 'PARTNERSHIP',
  PRIVATE_LIMITED = 'PRIVATE_LIMITED',
  PUBLIC_LIMITED = 'PUBLIC_LIMITED',
  NON_PROFIT = 'NON_PROFIT',
}

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}
