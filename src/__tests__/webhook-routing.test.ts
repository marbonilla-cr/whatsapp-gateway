import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { createTestApp } from './fixtures';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { enqueueForward } from '../queue';

vi.mock('../queue', () => ({
  enqueueForward: vi.fn().mockResolvedValue(undefined),
  pingRedis: vi.fn().mockResolvedValue('disabled'),
  shutdown: vi.fn().mockResolvedValue(undefined),
  isQueueEnabled: vi.fn(() => false),
}));

const KEY_64_HEX = 'c'.repeat(64);

function signBody(raw: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('webhook routing + enqueue', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = 'admin-secret-test-value-here';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    delete process.env.STRICT_WEBHOOK_VERIFY;
    vi.mocked(enqueueForward).mockClear();
  });

  afterEach(async () => {
    await teardownTestPgMem();
  });

  it('enqueues forward when phone_number_id matches an active app and signature is valid', async () => {
    const metaPid = '15551234567';
    await createTestApp(getDb(), {
      apiKey: 'gw_testkey1234567890123456789012',
      encryptionKey: KEY_64_HEX,
      metaPhoneNumberId: metaPid,
    });

    const { app } = await buildApp();
    const body = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: metaPid },
                messages: [{ from: '15559876543', id: 'wamid.x', type: 'text', text: { body: 'hi' } }],
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const sig = signBody(raw, KEY_64_HEX);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(enqueueForward).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(enqueueForward).mock.calls[0][0];
    expect(arg.appId).toBe('appidfortest');
    expect(arg.eventId).toBeDefined();
    expect(arg.change.field).toBe('messages');
  });

  it('returns 200 for unknown phone_number_id without enqueue', async () => {
    const { app } = await buildApp();
    const body = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '999999999' },
                messages: [{ from: '1', id: 'w1', type: 'text', text: { body: 'x' } }],
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const sig = signBody(raw, KEY_64_HEX);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(raw);

    expect(res.status).toBe(200);
    expect(enqueueForward).not.toHaveBeenCalled();
  });

  it('returns 403 when STRICT_WEBHOOK_VERIFY=true and signature is invalid', async () => {
    process.env.STRICT_WEBHOOK_VERIFY = 'true';
    const { app } = await buildApp();
    const raw = JSON.stringify({ entry: [] });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(raw);

    expect(res.status).toBe(403);
    expect(enqueueForward).not.toHaveBeenCalled();
  });

  it('returns 200 with signatureValid false when STRICT is off and signature is invalid', async () => {
    process.env.STRICT_WEBHOOK_VERIFY = 'false';
    const { app } = await buildApp();
    const raw = JSON.stringify({ entry: [] });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.signatureValid).toBe(false);
    expect(res.body.strictWebhookVerify).toBe(false);
  });
});
