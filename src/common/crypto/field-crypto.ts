import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ValueTransformer } from 'typeorm';

/**
 * AES-256-GCM field-level encryption. Stored format: "v1:<iv>:<tag>:<ciphertext>" (base64).
 * The key comes from FIELD_ENCRYPTION_KEY (64 hex chars). Rotating the key requires re-encrypting
 * rows; the "v1" prefix leaves room for key versioning (see README "Sensitive data").
 */
const PREFIX = 'v1';

function key(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('FIELD_ENCRYPTION_KEY missing or invalid');
  return Buffer.from(hex, 'hex');
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptField(stored: string): string {
  const [v, iv, tag, data] = stored.split(':');
  if (v !== PREFIX || !iv || !tag || !data) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const encryptedTransformer: ValueTransformer = {
  to: (v?: string | null) => (v == null ? v : encryptField(v)),
  from: (v?: string | null) => (v == null ? v : decryptField(v)),
};
