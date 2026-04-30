import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const KEY_64_HEX = 'b'.repeat(64);

function signBody(raw: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('POST /webhook', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = 'admin-secret-test-value-here';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await teardownTestPgMem();
  });

  it('returns 200 with diagnostic when signature is invalid (temporary bypass for Meta diagnosis)', async () => {
    const { app } = await buildApp();
    const raw = JSON.stringify({ entry: [] });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 when signature is valid', async () => {
    const { app } = await buildApp();
    const raw = JSON.stringify({ entry: [] });
    const sig = signBody(raw, KEY_64_HEX);
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(raw);
    expect(res.status).toBe(200);
  });
});
