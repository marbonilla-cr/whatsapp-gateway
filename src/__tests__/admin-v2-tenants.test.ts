import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../server';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const KEY_64_HEX = 'd'.repeat(64);
const ADMIN = 'super-admin-secret-for-tests-only';

describe('admin v2 tenants CRUD', () => {
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

  async function superToken(app: import('express').Express): Promise<string> {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'super@test.invalid', password: 'SuperBootstrap123!' });
    return login.body.access as string;
  }

  it('POST /admin/v2/tenants creates and GET lists', async () => {
    const { app } = await buildApp();
    const token = await superToken(app);
    const create = await request(app)
      .post('/admin/v2/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessName: 'Test Co',
        contactEmail: 'newco@test.invalid',
        countryCode: 'CR',
      });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeTruthy();

    const list = await request(app).get('/admin/v2/tenants').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: string }) => t.id === create.body.id)).toBe(true);
  });

  it('non-super gets 403 on tenants', async () => {
    const { app } = await buildApp();
    const bad = jwt.sign(
      { tenantId: 'tenant_antigua_lecheria', role: 'tenant_admin' },
      process.env.JWT_ACCESS_SECRET!,
      { subject: 'x', expiresIn: 3600 }
    );
    const res = await request(app).get('/admin/v2/tenants').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(403);
  });
});
