import { createHmac, timingSafeEqual } from 'crypto';

/** Replay window: a captured webhook is useless after this many seconds. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** HMAC-SHA256 over "<timestamp>.<raw body>" as lowercase hex. Pure, so it is unit-testable. */
export function computeSignature(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

export function verifySignature(
  secret: string, timestamp: string | undefined, signature: string | undefined, rawBody: Buffer | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestamp || !signature || !rawBody || !/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), 'hex');
  const given = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected); // constant-time compare
}
