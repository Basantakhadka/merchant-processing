import { decryptField, encryptField } from './field-crypto';

describe('field-crypto', () => {
  beforeAll(() => { process.env.FIELD_ENCRYPTION_KEY = 'ab'.repeat(32); });
  it('round-trips and uses a random IV', () => {
    const a = encryptField('secret-id');
    const b = encryptField('secret-id');
    expect(a).not.toEqual(b);
    expect(a).not.toContain('secret-id');
    expect(decryptField(a)).toBe('secret-id');
  });
  it('detects tampering', () => {
    const parts = encryptField('x').split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });
});
