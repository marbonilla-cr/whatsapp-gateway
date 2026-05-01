import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { tenantUsers, messages, apps, phoneNumbers, wabas } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { hashPassword } from '../services/auth';
import { encryptToken, randomId12 } from '../services/crypto';
import { DEFAULT_CLIENT_TENANT_ID, TENANT_MBCSOFT_ID } from '../db/constants';
const KEY_64_HEX = 'd'.repeat(64);
const ADMIN = 'super-admin-secret-for-tests-only';

describe('admin v2 tenant isolation', () => {
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
  });

  afterEach(async () => {
    await teardownTestPgMem();
  });

  it('tenant A JWT cannot read tenant B messages', async () => {
    const { app } = await buildApp();
    const db = getDb();
    const now = new Date();

    const wabaB = randomId12();
    await db.insert(wabas).values({
      id: wabaB,
      tenantId: TENANT_MBCSOFT_ID,
      metaWabaId: 'meta-waba-b',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('tok', KEY_64_HEX),
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    const phoneB = randomId12();
    await db.insert(phoneNumbers).values({
      id: phoneB,
      wabaId: wabaB,
      metaPhoneNumberId: 'meta-phone-b',
      displayPhoneNumber: '+50600000000',
      displayName: null,
      displayNameStatus: 'pending',
      verifiedName: null,
      qualityRating: null,
      messagingLimitTier: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const appB = randomId12();
    await db.insert(apps).values({
      id: appB,
      tenantId: TENANT_MBCSOFT_ID,
      phoneNumberId: phoneB,
      name: 'App B',
      vertical: 'custom',
      callbackUrl: 'https://example.com/h',
      apiKeyHash: 'hash',
      apiKeyPrefix: 'prefix123',
      configJson: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const msgId = randomId12();
    await db.insert(messages).values({
      id: msgId,
      appId: appB,
      tenantId: TENANT_MBCSOFT_ID,
      direction: 'OUT',
      fromNumber: '1',
      toNumber: '2',
      messageType: 'text',
      bodyPreview: 'secret',
      rawPayload: null,
      metaMessageId: null,
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: now,
    });

    const userA = randomId12();
    await db.insert(tenantUsers).values({
      id: userA,
      tenantId: DEFAULT_CLIENT_TENANT_ID,
      email: 'usera@test.invalid',
      passwordHash: await hashPassword('UserAPass123!'),
      role: 'tenant_admin',
      isActive: true,
      createdAt: now,
    });

    const loginA = await request(app)
      .post('/auth/login')
      .send({ email: 'usera@test.invalid', password: 'UserAPass123!' });
    const tokenA = loginA.body.access as string;

    const peek = await request(app)
      .get(`/admin/v2/tenants/${TENANT_MBCSOFT_ID}/messages`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(peek.status).toBe(403);

    const own = await request(app)
      .get(`/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/messages`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);
    const data = own.body.data as Array<{ tenantId?: string }>;
    expect(data.every((m) => m.tenantId === DEFAULT_CLIENT_TENANT_ID)).toBe(true);
  });
});
