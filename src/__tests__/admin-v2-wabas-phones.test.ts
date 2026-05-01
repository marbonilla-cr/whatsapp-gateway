import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { phoneNumbers, tenantUsers, wabas } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { hashPassword } from '../services/auth';
import { encryptToken, randomId12 } from '../services/crypto';
import { DEFAULT_CLIENT_TENANT_ID } from '../db/constants';

const KEY_64_HEX = 'd'.repeat(64);
const ADMIN = 'super-admin-secret-for-tests-only';

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('admin v2 WABA phone provisioning', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = ADMIN;
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-min-16';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-min-16';
    process.env.SUPER_ADMIN_EMAIL = 'super@test.invalid';
    process.env.SUPER_ADMIN_PASSWORD_BOOTSTRAP = 'SuperBootstrap123!';
    process.env.META_API_MIN_INTERVAL_MS = '0';
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
    delete process.env.META_API_MIN_INTERVAL_MS;
  });

  async function tenantAdminToken(app: import('express').Express): Promise<string> {
    const db = getDb();
    const now = new Date();
    const userId = randomId12();
    await db.insert(tenantUsers).values({
      id: userId,
      tenantId: DEFAULT_CLIENT_TENANT_ID,
      email: 'tenantphones@test.invalid',
      passwordHash: await hashPassword('TenantPhones123!'),
      role: 'tenant_admin',
      isActive: true,
      createdAt: now,
    });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'tenantphones@test.invalid', password: 'TenantPhones123!' });
    expect(login.status).toBe(200);
    return login.body.access as string;
  }

  async function seedWabaAndPhone(): Promise<{ wabaId: string; phoneRowId: string; metaPhoneId: string }> {
    const db = getDb();
    const now = new Date();
    const wabaId = randomId12();
    await db.insert(wabas).values({
      id: wabaId,
      tenantId: DEFAULT_CLIENT_TENANT_ID,
      metaWabaId: 'meta_waba_phones_test',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('graph-token-phones', KEY_64_HEX),
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    const phoneRowId = randomId12();
    const metaPhoneId = '15551234567';
    await db.insert(phoneNumbers).values({
      id: phoneRowId,
      wabaId,
      metaPhoneNumberId: metaPhoneId,
      displayPhoneNumber: '+15551234567',
      displayName: null,
      displayNameStatus: 'pending',
      verifiedName: null,
      qualityRating: null,
      messagingLimitTier: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    return { wabaId, phoneRowId, metaPhoneId };
  }

  it('POST request-code forwards to Meta Graph path', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const { wabaId, phoneRowId, metaPhoneId } = await seedWabaAndPhone();

    const fetchMock = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes(`/${metaPhoneId}/request_code`)) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, { error: { message: 'unexpected' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${phoneRowId}/request-code`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ code_method: 'SMS' });

    expect(res.status).toBe(204);
    const calls = fetchMock.mock.calls as unknown[][];
    const graphUrl = String(calls[0]?.[0] ?? '');
    expect(graphUrl).toContain(metaPhoneId);
    expect(graphUrl).toContain('request_code');
  });

  it('POST verify-code sends code to Meta', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const { wabaId, phoneRowId, metaPhoneId } = await seedWabaAndPhone();

    const fetchMock = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes(`/${metaPhoneId}/verify_code`)) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${phoneRowId}/verify-code`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' });

    expect(res.status).toBe(204);
  });

  it('POST register sends pin to Meta', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const { wabaId, phoneRowId, metaPhoneId } = await seedWabaAndPhone();

    const fetchMock = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes(`/${metaPhoneId}/register`)) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${phoneRowId}/register`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '654321' });

    expect(res.status).toBe(204);
  });

  it('POST two-step sets 2FA pin on Meta', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const { wabaId, phoneRowId, metaPhoneId } = await seedWabaAndPhone();

    const fetchMock = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes(`/${metaPhoneId}/two_step_verification`)) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${phoneRowId}/two-step`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '111222' });

    expect(res.status).toBe(204);
  });

  it('PATCH profile updates display name on Meta', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const { wabaId, phoneRowId, metaPhoneId } = await seedWabaAndPhone();

    const fetchMock = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes(`/${metaPhoneId}/whatsapp_business_profile`)) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .patch(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${phoneRowId}/profile`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mi Negocio' });

    expect(res.status).toBe(204);
  });

  it('returns 404 for phone in another tenant WABA', async () => {
    const { app } = await buildApp();
    const token = await tenantAdminToken(app);
    const db = getDb();
    const now = new Date();
    const otherWaba = randomId12();
    await db.insert(wabas).values({
      id: otherWaba,
      tenantId: 'tenant_mbcsoft',
      metaWabaId: 'meta_other',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('t', KEY_64_HEX),
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    const otherPhone = randomId12();
    await db.insert(phoneNumbers).values({
      id: otherPhone,
      wabaId: otherWaba,
      metaPhoneNumberId: '1999',
      displayPhoneNumber: '+1999',
      displayName: null,
      displayNameStatus: 'pending',
      verifiedName: null,
      qualityRating: null,
      messagingLimitTier: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const { wabaId } = await seedWabaAndPhone();

    const res = await request(app)
      .post(
        `/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/wabas/${wabaId}/phones/${otherPhone}/request-code`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ code_method: 'SMS' });

    expect(res.status).toBe(404);
  });
});
