import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb, resetDbSingleton } from '../db';
import { apps } from '../db/schema';
import { encryptToken, hashApiKey, apiKeyPrefixFromFullKey } from '../services/crypto';

const KEY_64_HEX = 'c'.repeat(64);

describe('POST /send auth', () => {
  beforeEach(() => {
    resetDbSingleton();
    process.env.ADMIN_SECRET = 'admin-secret-test-value-here';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = ':memory:';
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

  afterEach(() => {
    resetDbSingleton();
    vi.unstubAllGlobals();
  });

  it('returns 401 when X-Gateway-Key is missing or invalid', async () => {
    const { app } = buildApp();
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
    const { app } = buildApp();
    const apiKey = 'gw_testvalidkeyxxxxxxxxxxxxxxxx';
    const now = new Date().toISOString();
    const db = getDb(':memory:');
    db.insert(apps)
      .values({
        id: 'appidfortest',
        name: 'Test',
        apiKeyHash: hashApiKey(apiKey),
        apiKeyPrefix: apiKeyPrefixFromFullKey(apiKey),
        callbackUrl: 'https://example.com/cb',
        phoneNumberId: '123456789',
        wabaId: 'waba1',
        metaAccessToken: encryptToken('token-plain', KEY_64_HEX),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

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
