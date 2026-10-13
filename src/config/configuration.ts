function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export interface AppConfig {
  port: number;
  db: { host: string; port: number; user: string; password: string; name: string };
  redis: { host: string; port: number };
  jwt: { secret: string; expiresIn: string };
  encryptionKey: string;
  risk: { attempts: number; backoffMs: number };
  payments: { webhookSecret: string };
}

export default (): AppConfig => {
  const isTest = process.env.NODE_ENV === 'test';
  const key = required('FIELD_ENCRYPTION_KEY');
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  const webhookSecret = required('PAYMENT_WEBHOOK_SECRET');
  if (webhookSecret.length < 16) throw new Error('PAYMENT_WEBHOOK_SECRET must be at least 16 characters');
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      name: isTest ? (process.env.DB_TEST_NAME ?? 'merchant_test') : required('DB_NAME'),
    },
    redis: { host: process.env.REDIS_HOST ?? 'localhost', port: parseInt(process.env.REDIS_PORT ?? '6379', 10) },
    jwt: { secret: required('JWT_SECRET'), expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
    encryptionKey: key,
    risk: {
      attempts: parseInt(process.env.RISK_JOB_ATTEMPTS ?? '4', 10),
      backoffMs: parseInt(process.env.RISK_JOB_BACKOFF_MS ?? '1000', 10),
    },
    payments: { webhookSecret },
  };
};
