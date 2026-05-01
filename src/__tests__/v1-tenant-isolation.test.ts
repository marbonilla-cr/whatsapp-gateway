import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../server';
import { getDb } from '../db';
import { apps, messages, tenants } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { createTestApp } from './fixtures';

const KEY_64_HEX = 'c'.repeat(64);
const TENANT_A_KEY = 'gw_testvalidkeyxxxxxxxxxxxxxxxx';
const TENANT_A_BEARER = 'Bearer wgw_testvali_testvalidkeyxxxxxxxxxxxxxxxx';
const TENANT_B_KEY = 'gw_othertenantkeyxxxxxxxxxxxxxxxx';
const TENANT_B_BEARER = 'Bearer wgw_otherten_othertenantkeyxxxxxxxxxxxxxxxx';

describe('v1 tenant isolation', () => {
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
          json: async () => ({ messages: [{ id: 'wamid.from.meta' }] }),
        } as Response)
      )
    );
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('app A cannot query tenant B resources', async () => {
    const db = getDb();
    await db
      .insert(tenants)
      .values({
        id: 'tenant_other_test',
        businessName: 'Other Tenant',
        legalName: null,
        countryCode: 'CR',
        contactEmail: 'other-tenant-isolation@tests.invalid',
        plan: 'starter',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: tenants.id });

    await createTestApp(db, {
      apiKey: TENANT_A_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-main',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-a',
      tenantId: 'tenant_antigua_lecheria',
    });
    await createTestApp(db, {
      apiKey: TENANT_B_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-other',
      metaPhoneNumberId: '987654321',
      metaWabaId: 'waba-b',
      tenantId: 'tenant_other_test',
    });

    const appB = (await db.select().from(apps).where(eq(apps.id, 'app-v1-other')).limit(1))[0]!;
    await db.insert(messages).values({
      id: 'msg-b-1',
      appId: appB.id,
      tenantId: 'tenant_other_test',
      direction: 'OUT',
      fromNumber: '987654321',
      toNumber: '+50611112222',
      messageType: 'text',
      bodyPreview: 'tenant B private message',
      rawPayload: null,
      metaMessageId: 'wamid.tenantB.private',
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-04-30T00:10:00.000Z'),
    });

    await db.insert(messages).values({
      id: 'msg-a-1',
      appId: 'app-v1-main',
      tenantId: 'tenant_antigua_lecheria',
      direction: 'OUT',
      fromNumber: '123456789',
      toNumber: '+50677778888',
      messageType: 'text',
      bodyPreview: 'tenant A visible message',
      rawPayload: null,
      metaMessageId: 'wamid.tenantA.visible',
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-04-30T00:11:00.000Z'),
    });

    const { app } = await buildApp();

    const validTenantBAccess = await request(app)
      .get('/v1/conversations')
      .set('Authorization', TENANT_B_BEARER);
    expect(validTenantBAccess.status).toBe(200);

    const privateMessageRead = await request(app)
      .get('/v1/messages/wamid.tenantB.private')
      .set('Authorization', TENANT_A_BEARER);
    expect(privateMessageRead.status).toBe(404);

    const listConversations = await request(app)
      .get('/v1/conversations')
      .set('Authorization', TENANT_A_BEARER);
    expect(listConversations.status).toBe(200);
    expect(Array.isArray(listConversations.body.data)).toBe(true);
    expect(listConversations.body.data.some((item: { contact_phone?: string }) => item.contact_phone === '+50611112222')).toBe(
      false
    );
    expect(listConversations.body.data.some((item: { contact_phone?: string }) => item.contact_phone === '+50677778888')).toBe(
      true
    );
  });
});
