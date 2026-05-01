import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { tenants, wabas } from '../db/schema';
import { encryptToken } from '../services/crypto';
import { refreshTokensJob } from '../queue/jobs/refreshTokens';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import pino from 'pino';

const KEY_64_HEX = 'f'.repeat(64);

describe('refreshTokensJob', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it('refreshes token and updates DB on success', async () => {
    process.env.META_APP_ID = 'app';
    process.env.META_APP_SECRET = 'secret';
    const db = getDb();
    const now = new Date();
    await db.insert(tenants).values({
      id: 't_refresh',
      businessName: 'R',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'r@example.com',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const exp = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.insert(wabas).values({
      id: 'w_refresh_1',
      tenantId: 't_refresh',
      metaWabaId: 'meta_w_refresh',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('old-token', KEY_64_HEX),
      tokenExpiresAt: exp,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ access_token: 'new-token', expires_in: 60 * 60 * 24 * 60 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as unknown as typeof fetch
    );

    const log = pino({ level: 'silent' });
    await refreshTokensJob(() => getDb(), KEY_64_HEX, log);

    const row = (await db.select().from(wabas).where(eq(wabas.id, 'w_refresh_1')).limit(1))[0]!;
    expect(row.status).toBe('active');
    expect(row.errorMessage).toBeNull();
  });

  it('marks WABA error when refresh fails', async () => {
    process.env.META_APP_ID = 'app';
    process.env.META_APP_SECRET = 'secret';
    const db = getDb();
    const now = new Date();
    await db.insert(tenants).values({
      id: 't_refresh2',
      businessName: 'R2',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'r2@example.com',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const exp = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.insert(wabas).values({
      id: 'w_refresh_2',
      tenantId: 't_refresh2',
      metaWabaId: 'meta_w_refresh2',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('old-token', KEY_64_HEX),
      tokenExpiresAt: exp,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: 'Invalid OAuth', code: 190 } }), { status: 400 });
      }) as unknown as typeof fetch
    );

    const log = pino({ level: 'silent' });
    await refreshTokensJob(() => getDb(), KEY_64_HEX, log);

    const row = (await db.select().from(wabas).where(eq(wabas.id, 'w_refresh_2')).limit(1))[0]!;
    expect(row.status).toBe('error');
    expect(row.errorMessage).toBeTruthy();
  });
});
