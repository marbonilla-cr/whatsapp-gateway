import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../server';
import { getDb } from '../db';
import { onboardingSessions, wabas } from '../db/schema';
import { DEFAULT_CLIENT_TENANT_ID } from '../db/constants';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const KEY_64_HEX = 'e'.repeat(64);
const ADMIN = 'admin-onboard-test';

function mockFetchSequence(): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    if (url.includes('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'll-token', expires_in: 5184000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/me/businesses')) {
      return new Response(JSON.stringify({ data: [{ id: 'biz_1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/owned_whatsapp_business_accounts')) {
      return new Response(JSON.stringify({ data: [{ id: 'waba_meta_1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('waba_meta_1/phone_numbers')) {
      return new Response(
        JSON.stringify({
          data: [{ id: 'phone_meta_1', display_phone_number: '+50688888888' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('waba_meta_1/subscribed_apps') && url.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
  }) as unknown as typeof fetch;
}

describe('onboard', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = ADMIN;
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    process.env.META_APP_ID = 'appid-test';
    process.env.META_APP_SECRET = 'appsecret-test';
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = 'config-test';
    process.env.META_REDIRECT_URI = 'https://gateway.example/onboard/callback';
    delete process.env.REDIS_URL;
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('POST /onboard/start without auth returns 401', async () => {
    const { app } = await buildApp();
    const res = await request(app).post('/onboard/start').send({});
    expect(res.status).toBe(401);
  });

  it('POST /onboard/start with auth returns signup_url', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post('/onboard/start')
      .set('X-Admin-Secret', ADMIN)
      .send({ tenant_id: DEFAULT_CLIENT_TENANT_ID });
    expect(res.status).toBe(200);
    expect(res.body.signup_url).toContain('facebook.com');
    expect(res.body.signup_url).toContain('config_id=config-test');
    expect(res.body.session_id).toBeTruthy();
  });

  it('GET /onboard/callback with invalid state redirects error', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .get('/onboard/callback')
      .query({ code: 'x', state: 'bad.state.sig' })
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('onboard=error');
  });

  it('GET /onboard/callback with valid code+state inserts WABA (mock Meta)', async () => {
    vi.stubGlobal('fetch', mockFetchSequence());
    const { app } = await buildApp();
    const start = await request(app)
      .post('/onboard/start')
      .set('X-Admin-Secret', ADMIN)
      .send({ tenant_id: DEFAULT_CLIENT_TENANT_ID });
    const state = start.body.state as string;

    const res = await request(app)
      .get('/onboard/callback')
      .query({ code: 'auth-code-test', state })
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('onboard=success');

    const db = getDb();
    const wabaRows = await db.select().from(wabas).where(eq(wabas.metaWabaId, 'waba_meta_1'));
    expect(wabaRows.length).toBe(1);
    expect(wabaRows[0].tenantId).toBe(DEFAULT_CLIENT_TENANT_ID);
  });

  it('race: two callbacks with same state — only one completes', async () => {
    const fetchMock = mockFetchSequence();
    vi.stubGlobal('fetch', fetchMock);

    const { app } = await buildApp();
    const start = await request(app)
      .post('/onboard/start')
      .set('X-Admin-Secret', ADMIN)
      .send({ tenant_id: DEFAULT_CLIENT_TENANT_ID });
    const state = start.body.state as string;

    const [a, b] = await Promise.all([
      request(app).get('/onboard/callback').query({ code: 'c1', state }).redirects(0),
      request(app).get('/onboard/callback').query({ code: 'c2', state }).redirects(0),
    ]);

    const successCount = [a, b].filter((r) => r.status === 302 && String(r.headers.location).includes('success')).length;
    const errorCount = [a, b].filter((r) => r.status === 302 && String(r.headers.location).includes('error')).length;
    expect(successCount).toBe(1);
    expect(errorCount).toBe(1);

    const completed = await getDb()
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.state, state));
    expect(completed[0]?.status).toBe('completed');
  });
});
