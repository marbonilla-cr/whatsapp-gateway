import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db';
import { tenants, wabas } from '../db/schema';
import { encryptToken } from '../services/crypto';
import {
  getMetaApiClient,
  META_API_VERSION,
  MetaApiClient,
  MetaApiError,
  type SendPayload,
} from '../services/meta';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const ACCESS_TOKEN = 'token-super-secret';
const ENCRYPTION_KEY = 'f'.repeat(64);
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function createClient(logger?: ConstructorParameters<typeof MetaApiClient>[2]): MetaApiClient {
  return new MetaApiClient('waba_123', ACCESS_TOKEN, logger);
}

function getRequestParts(fetchMock: ReturnType<typeof vi.fn>): { url: URL; init: RequestInit } {
  const lastCall = fetchMock.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error('Expected fetch to be called at least once');
  }
  const [url, init] = lastCall;
  return { url: new URL(String(url)), init: (init as RequestInit) ?? {} };
}

describe('MetaApiClient success paths', () => {
  beforeEach(() => {
    process.env.META_API_MIN_INTERVAL_MS = '0';
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_APP_SECRET = 'meta-app-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.META_API_MIN_INTERVAL_MS;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it('supports all public methods with successful responses', async () => {
    const sendPayload: SendPayload = {
      messaging_product: 'whatsapp',
      to: '50688887777',
      type: 'text',
      text: { body: 'hola' },
    };

    const successCases: Array<{
      name: string;
      run: (client: MetaApiClient) => Promise<unknown>;
      response: unknown;
      assertResult: (result: unknown) => void;
      assertRequest: (url: URL, init: RequestInit) => void;
    }> = [
      {
        name: 'sendMessage',
        run: (client) => client.sendMessage('123456789', sendPayload),
        response: { messages: [{ id: 'wamid.1' }] },
        assertResult: (result) => {
          expect(result).toMatchObject({ messageId: 'wamid.1' });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/123456789/messages');
        },
      },
      {
        name: 'listTemplates',
        run: (client) => client.listTemplates(),
        response: { data: [{ name: 'welcome' }] },
        assertResult: (result) => {
          expect(result).toEqual([{ name: 'welcome' }]);
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/waba_123/message_templates');
        },
      },
      {
        name: 'createTemplate',
        run: (client) =>
          client.createTemplate({
            name: 'welcome',
            language: 'es',
            category: 'UTILITY',
            components: [{ type: 'BODY', text: 'hola' }],
          }),
        response: { id: 'tpl_1', name: 'welcome' },
        assertResult: (result) => {
          expect(result).toMatchObject({ id: 'tpl_1' });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/waba_123/message_templates');
        },
      },
      {
        name: 'deleteTemplate',
        run: (client) => client.deleteTemplate('welcome'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('DELETE');
          expect(url.pathname).toBe('/v22.0/waba_123/message_templates');
          expect(url.searchParams.get('name')).toBe('welcome');
        },
      },
      {
        name: 'listPhoneNumbers',
        run: (client) => client.listPhoneNumbers(),
        response: { data: [{ id: 'pn_1' }] },
        assertResult: (result) => {
          expect(result).toEqual([{ id: 'pn_1' }]);
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/waba_123/phone_numbers');
        },
      },
      {
        name: 'getPhoneNumber',
        run: (client) => client.getPhoneNumber('pn_1'),
        response: { id: 'pn_1' },
        assertResult: (result) => {
          expect(result).toEqual({ id: 'pn_1' });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/pn_1');
        },
      },
      {
        name: 'requestVerificationCode',
        run: (client) => client.requestVerificationCode('pn_1', 'SMS', 'es_CR'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/pn_1/request_code');
        },
      },
      {
        name: 'verifyCode',
        run: (client) => client.verifyCode('pn_1', '123456'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/pn_1/verify_code');
        },
      },
      {
        name: 'registerPhone',
        run: (client) => client.registerPhone('pn_1', '112233'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/pn_1/register');
        },
      },
      {
        name: 'updateProfileName',
        run: (client) => client.updateProfileName('pn_1', 'Mi negocio'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/pn_1/whatsapp_business_profile');
        },
      },
      {
        name: 'setTwoStepPin',
        run: (client) => client.setTwoStepPin('pn_1', '223344'),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/pn_1/two_step_verification');
        },
      },
      {
        name: 'subscribeWebhook',
        run: (client) => client.subscribeWebhook(),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('POST');
          expect(url.pathname).toBe('/v22.0/waba_123/subscribed_apps');
        },
      },
      {
        name: 'unsubscribeWebhook',
        run: (client) => client.unsubscribeWebhook(),
        response: { success: true },
        assertResult: (result) => {
          expect(result).toBeUndefined();
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('DELETE');
          expect(url.pathname).toBe('/v22.0/waba_123/subscribed_apps');
        },
      },
      {
        name: 'exchangeCodeForToken',
        run: (client) => client.exchangeCodeForToken('oauth-code-1', 'https://example.com/callback'),
        response: { access_token: 'long-lived', token_type: 'bearer', expires_in: 3600 },
        assertResult: (result) => {
          expect(result).toMatchObject({ accessToken: 'long-lived', tokenType: 'bearer' });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/oauth/access_token');
          expect(url.searchParams.get('client_id')).toBe('meta-app-id');
          expect(url.searchParams.get('client_secret')).toBe('meta-app-secret');
          expect(url.searchParams.get('code')).toBe('oauth-code-1');
        },
      },
      {
        name: 'refreshLongLivedToken',
        run: (client) => client.refreshLongLivedToken('short-token'),
        response: { access_token: 'refreshed', token_type: 'bearer', expires_in: 7200 },
        assertResult: (result) => {
          expect(result).toMatchObject({ accessToken: 'refreshed' });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/oauth/access_token');
          expect(url.searchParams.get('grant_type')).toBe('fb_exchange_token');
          expect(url.searchParams.get('fb_exchange_token')).toBe('short-token');
        },
      },
      {
        name: 'getQualityRating',
        run: (client) => client.getQualityRating('pn_1'),
        response: { id: 'pn_1', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K' },
        assertResult: (result) => {
          expect(result).toEqual({
            phoneNumberId: 'pn_1',
            qualityRating: 'GREEN',
            messagingLimit: { tier: 'TIER_1K', qualityRating: 'GREEN' },
          });
        },
        assertRequest: (url, init) => {
          expect(init.method).toBe('GET');
          expect(url.pathname).toBe('/v22.0/pn_1');
        },
      },
    ];

    for (const testCase of successCases) {
      const fetchMock = vi.fn(async () => jsonResponse(200, testCase.response));
      vi.stubGlobal('fetch', fetchMock);
      const client = createClient();
      const result = await testCase.run(client);

      testCase.assertResult(result);
      const { url, init } = getRequestParts(fetchMock);
      expect(url.origin).toBe('https://graph.facebook.com');
      expect(url.pathname.startsWith(`/${META_API_VERSION}/`)).toBe(true);
      const headers = init.headers as Record<string, string>;
      if (testCase.name === 'exchangeCodeForToken' || testCase.name === 'refreshLongLivedToken') {
        expect(headers.Authorization).toBeUndefined();
      } else {
        expect(headers).toMatchObject({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        });
      }
      testCase.assertRequest(url, init);
      const calls = fetchMock.mock.calls as unknown[][];
      const firstCall = calls[0];
      if (!firstCall) {
        throw new Error('Expected fetch to be called at least once');
      }
      expect(String(firstCall[0]).startsWith(GRAPH_BASE)).toBe(true);
    }
  });
});

describe('MetaApiClient error handling', () => {
  beforeEach(() => {
    process.env.META_API_MIN_INTERVAL_MS = '0';
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_APP_SECRET = 'meta-app-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.META_API_MIN_INTERVAL_MS;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  const methodCases: Array<{
    name: string;
    run: (client: MetaApiClient) => Promise<unknown>;
  }> = [
    {
      name: 'sendMessage',
      run: (client) =>
        client.sendMessage('123456789', {
          messaging_product: 'whatsapp',
          to: '50688887777',
          type: 'text',
          text: { body: 'hola' },
        }),
    },
    { name: 'listTemplates', run: (client) => client.listTemplates() },
    {
      name: 'createTemplate',
      run: (client) =>
        client.createTemplate({
          name: 'welcome',
          language: 'es',
          category: 'UTILITY',
          components: [{ type: 'BODY', text: 'hola' }],
        }),
    },
    { name: 'deleteTemplate', run: (client) => client.deleteTemplate('welcome') },
    { name: 'listPhoneNumbers', run: (client) => client.listPhoneNumbers() },
    { name: 'getPhoneNumber', run: (client) => client.getPhoneNumber('pn_1') },
    {
      name: 'requestVerificationCode',
      run: (client) => client.requestVerificationCode('pn_1', 'SMS', 'es_CR'),
    },
    { name: 'verifyCode', run: (client) => client.verifyCode('pn_1', '123456') },
    { name: 'registerPhone', run: (client) => client.registerPhone('pn_1', '112233') },
    { name: 'updateProfileName', run: (client) => client.updateProfileName('pn_1', 'Mi negocio') },
    { name: 'setTwoStepPin', run: (client) => client.setTwoStepPin('pn_1', '223344') },
    { name: 'subscribeWebhook', run: (client) => client.subscribeWebhook() },
    { name: 'unsubscribeWebhook', run: (client) => client.unsubscribeWebhook() },
    {
      name: 'exchangeCodeForToken',
      run: (client) => client.exchangeCodeForToken('oauth-code-1', 'https://example.com/callback'),
    },
    { name: 'refreshLongLivedToken', run: (client) => client.refreshLongLivedToken('short-token') },
    { name: 'getQualityRating', run: (client) => client.getQualityRating('pn_1') },
  ];

  for (const methodCase of methodCases) {
    it(`${methodCase.name}: rejects 4xx immediately`, async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse(400, {
          error: {
            message: 'Bad request',
            code: 100,
            error_subcode: 33,
          },
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      const client = createClient();

      await expect(methodCase.run(client)).rejects.toBeInstanceOf(MetaApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it(`${methodCase.name}: retries on 5xx`, async () => {
      if (methodCase.name === 'exchangeCodeForToken' || methodCase.name === 'refreshLongLivedToken') {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () =>
          jsonResponse(500, {
            error: {
              message: 'Temporary upstream failure',
              code: 2,
            },
          })
        );
        vi.stubGlobal('fetch', fetchMock);
        const client = createClient();
        const assertion = expect(methodCase.run(client)).rejects.toBeInstanceOf(MetaApiError);
        await vi.runAllTimersAsync();
        await assertion;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
        return;
      }
      vi.useFakeTimers();
      const fetchMock = vi.fn(async () =>
        jsonResponse(500, {
          error: {
            message: 'Temporary upstream failure',
            code: 2,
          },
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      const client = createClient();

      const assertion = expect(methodCase.run(client)).rejects.toBeInstanceOf(MetaApiError);
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  }

  it('does not leak token in logs', async () => {
    vi.useFakeTimers();
    const entries: string[] = [];
    const logger = {
      debug: (...args: unknown[]) => entries.push(args.map((a) => JSON.stringify(a)).join(' ')),
      info: (...args: unknown[]) => entries.push(args.map((a) => JSON.stringify(a)).join(' ')),
      warn: (...args: unknown[]) => entries.push(args.map((a) => JSON.stringify(a)).join(' ')),
      error: (...args: unknown[]) => entries.push(args.map((a) => JSON.stringify(a)).join(' ')),
    };
    const fetchMock = vi.fn(async () =>
      jsonResponse(500, {
        error: {
          message: 'down',
          code: 2,
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient(logger);

    const assertion = expect(client.listTemplates()).rejects.toBeInstanceOf(MetaApiError);
    await vi.runAllTimersAsync();
    await assertion;

    const dumped = entries.join('\n');
    expect(dumped).not.toContain(ACCESS_TOKEN);
  });
});

describe('getMetaApiClient', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.META_API_MIN_INTERVAL_MS = '0';
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
    delete process.env.META_API_MIN_INTERVAL_MS;
  });

  it('loads encrypted token from DB and creates a working client', async () => {
    const db = getDb();
    const now = new Date();
    await db.insert(tenants).values({
      id: 'tenant_meta_client',
      businessName: 'Tenant Meta',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'tenant-meta@example.com',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(wabas).values({
      id: 'waba_meta_client',
      tenantId: 'tenant_meta_client',
      metaWabaId: 'meta_waba_client',
      metaBusinessId: null,
      accessTokenEncrypted: encryptToken('plain-token-from-db', ENCRYPTION_KEY),
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = await getMetaApiClient({
      db,
      wabaId: 'waba_meta_client',
      encryptionKey: ENCRYPTION_KEY,
    });
    await client.listTemplates();

    const calls = fetchMock.mock.calls as unknown[][];
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error('Expected fetch to be called');
    }
    const url = String(firstCall[0]);
    expect(url).toContain('meta_waba_client');
    expect(url).not.toContain('waba_meta_client');
    const init = (firstCall[1] ?? {}) as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer plain-token-from-db',
    });
  });

  it('throws when WABA is missing', async () => {
    await expect(
      getMetaApiClient({
        db: getDb(),
        wabaId: 'missing_waba',
        encryptionKey: ENCRYPTION_KEY,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws when token decryption fails', async () => {
    const db = getDb();
    const now = new Date();
    await db.insert(tenants).values({
      id: 'tenant_bad_token',
      businessName: 'Tenant bad',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'tenant-bad@example.com',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(wabas).values({
      id: 'waba_bad_token',
      tenantId: 'tenant_bad_token',
      metaWabaId: 'meta_waba_bad',
      metaBusinessId: null,
      accessTokenEncrypted: 'invalid-token-format',
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      getMetaApiClient({
        db,
        wabaId: 'waba_bad_token',
        encryptionKey: ENCRYPTION_KEY,
      })
    ).rejects.toMatchObject({ status: 500 });
  });
});
