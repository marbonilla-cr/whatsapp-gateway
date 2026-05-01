import { test, expect, request } from '@playwright/test';
import { skipIfNoGateway } from './helpers/skipIfNoGateway';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('API v1 contract', () => {
  test.beforeEach(async ({ request: req }) => {
    await skipIfNoGateway(test, req);
  });

  test('POST /v1/messages without auth returns 401', async () => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post('/v1/messages', {
      data: { type: 'text', to: '+1234567890', text: 'hi' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('POST /v1/messages with invalid token returns 401', async () => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post('/v1/messages', {
      headers: { Authorization: 'Bearer wgw_invalid_token' },
      data: { type: 'text', to: '+1234567890', text: 'hi' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('GET /openapi.json returns valid spec', async () => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.get('/openapi.json');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { openapi?: string; paths?: Record<string, unknown> };
    expect(body.openapi).toBeDefined();
    expect(body.paths).toBeDefined();
    expect(body.paths?.['/v1/messages']).toBeDefined();
    await ctx.dispose();
  });

  test('GET /docs renders Scalar UI', async ({ page }) => {
    await page.goto('/docs/');
    await expect(page.locator('body')).toContainText(/api|reference|openapi|scalar/i);
  });

  test('GET /health responds with all checks ok', async () => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.get('/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      status: string;
      db: string;
      redis?: string;
    };
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    if (process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0) {
      expect(body.redis).toBe('ok');
    }
    await ctx.dispose();
  });
});
