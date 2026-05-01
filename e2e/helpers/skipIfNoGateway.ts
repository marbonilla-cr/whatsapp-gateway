import type { APIRequestContext } from '@playwright/test';

let cached: boolean | null = null;

/**
 * Skip tests when no server responds at baseURL (local dev without Postgres, CI without stack).
 */
export async function skipIfNoGateway(
  test: { skip: (condition: boolean, description?: string) => void },
  request: APIRequestContext
): Promise<void> {
  if (cached === null) {
    const res = await request.get('/health', { timeout: 5000 }).catch(() => null);
    cached = Boolean(res && res.ok());
  }
  test.skip(
    !cached,
    'Gateway not running at Playwright baseURL. Run Postgres, `npm run build`, start the server, and set E2E_BASE_URL (optional: E2E_USE_WEBSERVER=1).'
  );
}
