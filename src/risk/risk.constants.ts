export const RISK_QUEUE = 'risk-review';

export interface RiskJobData { applicationId: string; submissionNo: number }

export const riskJobId = (applicationId: string, submissionNo: number, runs = 0) =>
  `risk-${applicationId}-${submissionNo}-${runs}`;
