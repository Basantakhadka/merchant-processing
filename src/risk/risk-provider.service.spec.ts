import { MerchantApplication } from '../applications/application.entity';
import { RiskStatus } from '../applications/enums';
import { RiskProviderService } from './risk-provider.service';

const app = (legalBusinessName: string) => ({ id: 'a1', legalBusinessName, submissionCount: 1 }) as MerchantApplication;

describe('RiskProviderService (simulated)', () => {
  const svc = new RiskProviderService();
  it('is deterministic for the same input', async () => {
    expect(await svc.screen(app('Acme'), 0)).toEqual(await svc.screen(app('Acme'), 0));
  });
  it('maps SANCTION to FAILED', async () => {
    expect(await svc.screen(app('Sanction Ltd'), 0)).toMatchObject({ score: 99, outcome: RiskStatus.FAILED });
  });
  it('FLAKY fails twice then succeeds', async () => {
    await expect(svc.screen(app('Flaky Co'), 0)).rejects.toThrow();
    await expect(svc.screen(app('Flaky Co'), 1)).rejects.toThrow();
    await expect(svc.screen(app('Flaky Co'), 2)).resolves.toBeDefined();
  });
  it('PROVIDERDOWN always fails', async () => {
    await expect(svc.screen(app('ProviderDown'), 5)).rejects.toThrow();
  });
});
