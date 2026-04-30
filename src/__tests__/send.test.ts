import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { createTestApp } from './fixtures';

const KEY_64_HEX = 'c'.repeat(64);

describe('POST /send auth', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = 'admin-secret-test-value-here';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'wamid.test123' }] }),
        } as Response)
      )
    );
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('returns 401 when X-Gateway-Key is missing or invalid', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post('/send')
      .set('Content-Type', 'application/json')
      .send({ to: '50688887777', type: 'text', text: { body: 'hi' } });
    expect(res.status).toBe(401);
    const res2 = await request(app)
      .post('/send')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Key', 'gw_invalidxxxxxxxxxxxxxxxxxxxxxxxx')
      .send({ to: '50688887777', type: 'text', text: { body: 'hi' } });
    expect(res2.status).toBe(401);
  });

  it('returns 200 with messageId when key is valid (Meta mocked)', async () => {
    const { app } = await buildApp();
    const apiKey = 'gw_testvalidkeyxxxxxxxxxxxxxxxx';
    await createTestApp(getDb(), { apiKey, encryptionKey: KEY_64_HEX, metaPhoneNumberId: '123456789' });
    const res = await request(app)
      .post('/send')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Key', apiKey)
      .send({ to: '50688887777', type: 'text', text: { body: 'hola' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messageId).toBe('wamid.test123');
    expect(global.fetch).toHaveBeenCalled();
  });
});
