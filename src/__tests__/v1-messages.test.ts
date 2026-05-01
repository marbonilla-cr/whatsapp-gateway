import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../server';
import { getDb } from '../db';
import { apps, messages, tenants } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { createTestApp } from './fixtures';

const KEY_64_HEX = 'c'.repeat(64);
const VALID_BEARER = 'Bearer wgw_testvali_testvalidkeyxxxxxxxxxxxxxxxx';
const VALID_LEGACY_KEY = 'gw_testvalidkeyxxxxxxxxxxxxxxxx';

describe('v1 messages endpoints', () => {
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
      vi.fn(async (url: string) => {
        if (url.includes('/messages')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [{ id: 'wamid.test123' }] }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: 'noop' }),
        } as Response);
      })
    );
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('POST /v1/messages sends text message', async () => {
    await createTestApp(getDb(), {
      apiKey: VALID_LEGACY_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-test-1',
    });
    const { app } = await buildApp();

    const res = await request(app).post('/v1/messages').set('Authorization', VALID_BEARER).send({
      type: 'text',
      to: '+50688887777',
      text: 'Hola desde v1',
    });

    expect(res.status).toBe(200);
    expect(res.body.wamid).toBe('wamid.test123');
    expect(res.body.status).toBe('sent');
  });

  it('POST /v1/messages returns 401 without auth', async () => {
    const { app } = await buildApp();
    const res = await request(app).post('/v1/messages').send({
      type: 'text',
      to: '+50688887777',
      text: 'hola',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('POST /v1/messages returns 401 with invalid auth', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer wgw_bad_invalid')
      .send({
        type: 'text',
        to: '+50688887777',
        text: 'hola',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_API_KEY');
  });

  it('POST /v1/messages returns 400 for invalid body', async () => {
    await createTestApp(getDb(), {
      apiKey: VALID_LEGACY_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
    });
    const { app } = await buildApp();
    const res = await request(app).post('/v1/messages').set('Authorization', VALID_BEARER).send({
      type: 'text',
      to: '+50688887777',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /v1/messages/:wamid returns 200 for existing message', async () => {
    await createTestApp(getDb(), {
      apiKey: VALID_LEGACY_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
    });
    const db = getDb();
    await db.insert(messages).values({
      id: 'msg1',
      appId: 'app-v1-main',
      tenantId: 'tenant_antigua_lecheria',
      direction: 'OUT',
      fromNumber: '123456789',
      toNumber: '+50688887777',
      messageType: 'text',
      bodyPreview: 'hola',
      rawPayload: null,
      metaMessageId: 'wamid.test123',
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
    });

    const { app } = await buildApp();
    const res = await request(app).get('/v1/messages/wamid.test123').set('Authorization', VALID_BEARER);

    expect(res.status).toBe(200);
    expect(res.body.wamid).toBe('wamid.test123');
    expect(res.body.status).toBe('sent');
  });

  it('GET /v1/messages/:wamid returns 404 for other tenant message', async () => {
    const db = getDb();
    await db
      .insert(tenants)
      .values({
        id: 'tenant_other_test',
        businessName: 'Other Tenant',
        legalName: null,
        countryCode: 'CR',
        contactEmail: 'other-tenant@tests.invalid',
        plan: 'starter',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: tenants.id });

    await createTestApp(getDb(), {
      apiKey: VALID_LEGACY_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
      tenantId: 'tenant_antigua_lecheria',
    });

    await createTestApp(getDb(), {
      apiKey: 'gw_othertenantkeyxxxxxxxxxxxxxxxx',
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-other',
      metaPhoneNumberId: '987654321',
      metaWabaId: 'waba-other',
      tenantId: 'tenant_other_test',
    });

    const otherApp = (await db.select().from(apps).where(eq(apps.id, 'app-v1-other')).limit(1))[0];
    expect(otherApp).toBeDefined();

    await db.insert(messages).values({
      id: 'msg-other',
      appId: otherApp!.id,
      tenantId: 'tenant_other_test',
      direction: 'OUT',
      fromNumber: '987654321',
      toNumber: '+50611112222',
      messageType: 'text',
      bodyPreview: 'other tenant message',
      rawPayload: null,
      metaMessageId: 'wamid.othertenant',
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-04-30T00:10:00.000Z'),
    });

    const { app } = await buildApp();
    const res = await request(app)
      .get('/v1/messages/wamid.othertenant')
      .set('Authorization', VALID_BEARER);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Rate limit triggers on 101 requests', async () => {
    await createTestApp(getDb(), {
      apiKey: VALID_LEGACY_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
    });
    const { app } = await buildApp();

    let finalStatus = 0;
    for (let i = 0; i < 101; i += 1) {
      const response = await request(app).get('/v1/messages/wamid.any').set('Authorization', VALID_BEARER);
      finalStatus = response.status;
      if (response.status === 429) {
        break;
      }
    }

    expect(finalStatus).toBe(429);
  });
});
