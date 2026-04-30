import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { tenants } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { createTestApp } from './fixtures';

const KEY_64_HEX = 'c'.repeat(64);
const TENANT_A_KEY = 'gw_testvalidkeyxxxxxxxxxxxxxxxx';
const TENANT_A_BEARER = 'Bearer wgw_testvali_testvalidkeyxxxxxxxxxxxxxxxx';
const TENANT_B_KEY = 'gw_othertenantkeyxxxxxxxxxxxxxxxx';
const TENANT_B_BEARER = 'Bearer wgw_otherten_othertenantkeyxxxxxxxxxxxxxxxx';

describe('v1 templates endpoints', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.ADMIN_SECRET = 'admin-secret-test-value-here';
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('GET /v1/templates returns template list', async () => {
    await createTestApp(getDb(), {
      apiKey: TENANT_A_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-templates-a',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-template-a',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                name: 'appointment_reminder',
                language: 'es',
                status: 'APPROVED',
                category: 'UTILITY',
                components: [{ type: 'BODY', text: 'Hola {{1}}' }],
              },
            ],
          }),
        } as Response)
      )
    );

    const { app } = await buildApp();
    const res = await request(app).get('/v1/templates').set('Authorization', TENANT_A_BEARER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].name).toBe('appointment_reminder');
  });

  it('POST /v1/templates returns pending template', async () => {
    await createTestApp(getDb(), {
      apiKey: TENANT_A_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-templates-a',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-template-a',
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          if (init?.method === 'POST') {
            return {
              name: 'appointment_reminder',
              language: 'es',
              status: 'PENDING',
              category: 'UTILITY',
              components: [{ type: 'BODY', text: 'Hola {{1}}' }],
            };
          }
          return { data: [] };
        },
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    const { app } = await buildApp();
    const res = await request(app)
      .post('/v1/templates')
      .set('Authorization', TENANT_A_BEARER)
      .send({
        name: 'appointment_reminder',
        language: 'es',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Hola {{1}}' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('appointment_reminder');
    expect(res.body.status).toBe('PENDING');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('DELETE /v1/templates/:name returns 204', async () => {
    await createTestApp(getDb(), {
      apiKey: TENANT_A_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-templates-a',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-template-a',
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: init?.method === 'DELETE' ? true : true,
        status: 200,
        json: async () => ({}),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    const { app } = await buildApp();
    const res = await request(app)
      .delete('/v1/templates/appointment_reminder')
      .set('Authorization', TENANT_A_BEARER);

    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('tenant isolation: app A and app B receive isolated template lists', async () => {
    const db = getDb();
    await db
      .insert(tenants)
      .values({
        id: 'tenant_other_test',
        businessName: 'Other Tenant',
        legalName: null,
        countryCode: 'CR',
        contactEmail: 'other-tenant-template@tests.invalid',
        plan: 'starter',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: tenants.id });

    await createTestApp(db, {
      apiKey: TENANT_A_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-templates-a',
      metaPhoneNumberId: '123456789',
      metaWabaId: 'waba-template-a',
      tenantId: 'tenant_antigua_lecheria',
    });

    await createTestApp(db, {
      apiKey: TENANT_B_KEY,
      encryptionKey: KEY_64_HEX,
      appId: 'app-v1-templates-b',
      metaPhoneNumberId: '987654321',
      metaWabaId: 'waba-template-b',
      tenantId: 'tenant_other_test',
    });

    const metaWabaA = 'waba-template-a';
    const metaWabaB = 'waba-template-b';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes(`/${metaWabaA}/message_templates`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ name: 'tenant_a_only', language: 'es', status: 'APPROVED' }] }),
          } as Response);
        }
        if (url.includes(`/${metaWabaB}/message_templates`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ name: 'tenant_b_only', language: 'es', status: 'APPROVED' }] }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      })
    );

    const { app } = await buildApp();
    const aRes = await request(app).get('/v1/templates').set('Authorization', TENANT_A_BEARER);
    const bRes = await request(app).get('/v1/templates').set('Authorization', TENANT_B_BEARER);

    expect(aRes.status).toBe(200);
    expect(bRes.status).toBe(200);
    expect(aRes.body.data[0].name).toBe('tenant_a_only');
    expect(bRes.body.data[0].name).toBe('tenant_b_only');
  });
});
