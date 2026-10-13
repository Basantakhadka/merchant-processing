import { computeSignature, verifySignature, WEBHOOK_TOLERANCE_SECONDS } from './webhook-signature';

describe('webhook signature', () => {
  const secret = 'unit-test-secret-0123456789';
  const body = Buffer.from('{"eventId":"evt_00000001"}');
  const now = 1_800_000_000;
  const ts = String(now);
  const sig = computeSignature(secret, ts, body);

  it('accepts a correct signature (with or without sha256= prefix)', () => {
    expect(verifySignature(secret, ts, sig, body, now)).toBe(true);
    expect(verifySignature(secret, ts, `sha256=${sig}`, body, now)).toBe(true);
  });
  it('rejects a tampered body, wrong secret, or garbage signature', () => {
    expect(verifySignature(secret, ts, sig, Buffer.from('{"eventId":"evt_00000002"}'), now)).toBe(false);
    expect(verifySignature('another-secret-0123456789', ts, sig, body, now)).toBe(false);
    expect(verifySignature(secret, ts, 'zz', body, now)).toBe(false);
    expect(verifySignature(secret, ts, sig.slice(0, 10), body, now)).toBe(false);
  });
  it('rejects missing parts', () => {
    expect(verifySignature(secret, undefined, sig, body, now)).toBe(false);
    expect(verifySignature(secret, ts, undefined, body, now)).toBe(false);
    expect(verifySignature(secret, ts, sig, undefined, now)).toBe(false);
  });
  it('rejects a replay outside the tolerance window, in either direction', () => {
    expect(verifySignature(secret, ts, sig, body, now + WEBHOOK_TOLERANCE_SECONDS + 1)).toBe(false);
    expect(verifySignature(secret, ts, sig, body, now - WEBHOOK_TOLERANCE_SECONDS - 1)).toBe(false);
    expect(verifySignature(secret, ts, sig, body, now + WEBHOOK_TOLERANCE_SECONDS)).toBe(true);
  });
  it('binds the timestamp into the signature', () => {
    const other = String(now + 10);
    expect(verifySignature(secret, other, sig, body, now)).toBe(false);
  });
});
