import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../server';
import { getDb } from '../db';
import { auditLog, tenants, wabas } from '../db/schema';
import { encryptToken } from '../services/crypto';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import crypto from 'node:crypto';

const KEY_64_HEX = 'a'.repeat(64);

function signBody(raw: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('permission_revoked webhook', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = 'admin-perm-test';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    process.env.STRICT_WEBHOOK_VERIFY = 'false';
    delete process.env.REDIS_URL;
  });

  afterEach(async () => {
    await teardownTestPgMem();
  });

  it('marks WABA revoked and writes audit_log', async () => {
    const db = getDb();
    const now = new Date();
    await db.insert(tenants).values({
      id: 't_perm',
      businessName: 'Perm tenant',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'perm@example.com',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(wabas).values({
      id: 'waba_int_perm',
      tenantId: 't_perm',
      metaWabaId: 'meta_waba_perm_99',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('tok', KEY_64_HEX),
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    const { app } = await buildApp();
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'meta_waba_perm_99',
          changes: [{ field: 'account_review_update', value: { decision: 'DISABLED' } }],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const sig = signBody(raw, KEY_64_HEX);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);
    expect(res.status).toBe(200);

    const w = (await db.select().from(wabas).where(eq(wabas.id, 'waba_int_perm')).limit(1))[0]!;
    expect(w.status).toBe('revoked');

    const logs = await db.select().from(auditLog).where(eq(auditLog.action, 'waba_permission_revoked'));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
