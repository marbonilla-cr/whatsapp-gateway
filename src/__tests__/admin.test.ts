import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../server';
import { getDb, resetDbSingleton } from '../db';
import { apps } from '../db/schema';

const KEY_64_HEX = 'd'.repeat(64);
const ADMIN = 'super-admin-secret-for-tests-only';

describe('admin apps CRUD', () => {
  beforeEach(() => {
    resetDbSingleton();
    process.env.ADMIN_SECRET = ADMIN;
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.META_VERIFY_TOKEN = 'verify-token-test';
    process.env.DATABASE_URL = ':memory:';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    resetDbSingleton();
  });

  it('POST /admin/apps creates app and GET lists without secrets', async () => {
    const { app } = buildApp();
    const create = await request(app)
      .post('/admin/apps')
      .set('X-Admin-Secret', ADMIN)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Poiesis',
        callbackUrl: 'https://example.com/hook',
        phoneNumberId: 'pnid-1',
        wabaId: 'waba-1',
        metaAccessToken: 'plain-meta-token',
      });
    expect(create.status).toBe(201);
    expect(create.body.apiKey).toMatch(/^gw_/);
    expect(create.body.apiKeyPrefix).toHaveLength(8);

    const list = await request(app).get('/admin/apps').set('X-Admin-Secret', ADMIN);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body[0]).not.toHaveProperty('apiKeyHash');
    expect(list.body[0]).not.toHaveProperty('metaAccessToken');
    expect(list.body[0].phoneNumberId).toBe('pnid-1');
  });

  it('PATCH, rotate-key, DELETE (soft) work', async () => {
    const { app } = buildApp();
    const create = await request(app)
      .post('/admin/apps')
      .set('X-Admin-Secret', ADMIN)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Bot',
        callbackUrl: 'https://b.example/cb',
        phoneNumberId: 'pnid-2',
        wabaId: 'waba-2',
        metaAccessToken: 'tok',
      });
    const id = create.body.id as string;

    const patch = await request(app)
      .patch(`/admin/apps/${id}`)
      .set('X-Admin-Secret', ADMIN)
      .set('Content-Type', 'application/json')
      .send({ name: 'Bot Renamed' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('Bot Renamed');

    const rot = await request(app)
      .post(`/admin/apps/${id}/rotate-key`)
      .set('X-Admin-Secret', ADMIN);
    expect(rot.status).toBe(200);
    expect(rot.body.apiKey).toMatch(/^gw_/);

    const del = await request(app).delete(`/admin/apps/${id}`).set('X-Admin-Secret', ADMIN);
    expect(del.status).toBe(204);

    const db = getDb(':memory:');
    const row = db.select().from(apps).where(eq(apps.id, id)).limit(1).all()[0];
    expect(row.isActive).toBe(false);
  });
});
