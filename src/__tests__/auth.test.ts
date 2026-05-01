import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { getDb } from '../db';
import { tenantUsers } from '../db/schema';
import { setupTestPgMem, teardownTestPgMem } from './test-db';
import { hashPassword } from '../services/auth';
import { DEFAULT_CLIENT_TENANT_ID, TENANT_MBCSOFT_ID } from '../db/constants';
import { randomId12 } from '../services/crypto';

const KEY_64_HEX = 'd'.repeat(64);
const ADMIN = 'super-admin-secret-for-tests-only';

describe('auth + admin v2 JWT', () => {
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

  it('POST /auth/login bootstraps super_admin and returns tokens', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'super@test.invalid', password: 'SuperBootstrap123!' });
    expect(res.status).toBe(200);
    expect(res.body.access).toBeTruthy();
    expect(res.body.refresh).toBeTruthy();
    expect(res.body.user.role).toBe('super_admin');
  });

  it('POST /auth/refresh returns new access', async () => {
    const { app } = await buildApp();
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'super@test.invalid', password: 'SuperBootstrap123!' });
    const refresh = await request(app).post('/auth/refresh').send({ refresh: login.body.refresh });
    expect(refresh.status).toBe(200);
    expect(refresh.body.access).toBeTruthy();
  });

  it('GET /admin/v2/me requires Bearer', async () => {
    const { app } = await buildApp();
    const me = await request(app).get('/admin/v2/me');
    expect(me.status).toBe(401);
  });

  it('tenant_admin cannot list other tenant apps (IDOR)', async () => {
    const { app } = await buildApp();
    await request(app)
      .post('/auth/login')
      .send({ email: 'super@test.invalid', password: 'SuperBootstrap123!' });

    const db = getDb();
    const now = new Date();
    const opId = randomId12();
    await db.insert(tenantUsers).values({
      id: opId,
      tenantId: DEFAULT_CLIENT_TENANT_ID,
      email: 'op@test.invalid',
      passwordHash: await hashPassword('OpPassword123!'),
      role: 'tenant_admin',
      isActive: true,
      createdAt: now,
    });

    const loginOp = await request(app)
      .post('/auth/login')
      .send({ email: 'op@test.invalid', password: 'OpPassword123!' });
    const token = loginOp.body.access as string;

    const leak = await request(app)
      .get(`/admin/v2/tenants/${TENANT_MBCSOFT_ID}/apps`)
      .set('Authorization', `Bearer ${token}`);
    expect(leak.status).toBe(403);
  });

  it('super_admin can access any tenant apps route', async () => {
    const { app } = await buildApp();
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'super@test.invalid', password: 'SuperBootstrap123!' });
    const token = login.body.access as string;
    const apps = await request(app)
      .get(`/admin/v2/tenants/${DEFAULT_CLIENT_TENANT_ID}/apps`)
      .set('Authorization', `Bearer ${token}`);
    expect(apps.status).toBe(200);
    expect(Array.isArray(apps.body)).toBe(true);
  });
});
