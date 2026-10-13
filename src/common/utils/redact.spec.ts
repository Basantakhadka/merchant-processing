import { maskTail, redact, REDACTED } from './redact';

describe('redact', () => {
  it('redacts sensitive keys deeply without mutating the input', () => {
    const input = { email: 'a@b.com', password: 'p', nested: { accessToken: 't', ok: 1, list: [{ ownerNationalId: '123' }] } };
    const out = redact(input);
    expect(out).toEqual({ email: 'a@b.com', password: REDACTED, nested: { accessToken: REDACTED, ok: 1, list: [{ ownerNationalId: REDACTED }] } });
    expect(input.password).toBe('p');
  });
  it('masks all but the tail', () => {
    expect(maskTail('1234567890')).toBe('******7890');
    expect(maskTail('12')).toBe('**');
    expect(maskTail(null)).toBeNull();
  });
});
