const SENSITIVE_KEYS = /pass(word)?|token|secret|authorization|api[-_]?key|national.?id|ssn|card|cvv|pan/i;

export const REDACTED = '[REDACTED]';

/** Deep-clones `value`, replacing the value of any sensitive-looking key with [REDACTED]. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** "1234567890" -> "******7890" (for API responses where a partial value is useful). */
export function maskTail(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  return value.length <= visible ? '*'.repeat(value.length) : '*'.repeat(value.length - visible) + value.slice(-visible);
}
