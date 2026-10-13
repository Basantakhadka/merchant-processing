import { config } from 'dotenv';

process.env.NODE_ENV = 'test';
config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
process.env.PAYMENT_WEBHOOK_SECRET ??= 'test-webhook-secret-0123456789';
// Fast retries so failure paths run in milliseconds.
process.env.RISK_JOB_ATTEMPTS = '3';
process.env.RISK_JOB_BACKOFF_MS = '50';
