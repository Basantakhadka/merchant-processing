import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MerchantApplication } from '../applications/application.entity';
import { RiskStatus } from '../applications/enums';

export interface RiskResult { score: number; outcome: RiskStatus.PASSED | RiskStatus.FLAGGED | RiskStatus.FAILED; reference: string }

/**
 * Simulated third-party KYB / risk provider. Deterministic so tests are stable.
 * Behaviour is steered by the legal business name (documented in README):
 *   contains "SANCTION"   -> FAILED  (score 99)
 *   contains "FLAKY"      -> throws a transient error on the first 2 attempts, then succeeds
 *   contains "PROVIDERDOWN" -> always throws (exhausts retries -> riskStatus ERROR)
 *   otherwise             -> score = hash(name) % 100: <60 PASSED, 60-84 FLAGGED, >=85 FAILED
 */
@Injectable()
export class RiskProviderService {
  async screen(app: MerchantApplication, attemptsMade: number): Promise<RiskResult> {
    const name = app.legalBusinessName.toUpperCase();
    if (name.includes('PROVIDERDOWN')) throw new Error('Risk provider unavailable (simulated 503)');
    if (name.includes('FLAKY') && attemptsMade < 2) throw new Error('Risk provider timeout (simulated)');

    const score = name.includes('SANCTION') ? 99 : createHash('sha256').update(name).digest().readUInt16BE(0) % 100;
    const outcome = score >= 85 ? RiskStatus.FAILED : score >= 60 ? RiskStatus.FLAGGED : RiskStatus.PASSED;
    return { score, outcome, reference: `sim-${createHash('sha1').update(`${app.id}:${app.submissionCount}`).digest('hex').slice(0, 12)}` };
  }
}
