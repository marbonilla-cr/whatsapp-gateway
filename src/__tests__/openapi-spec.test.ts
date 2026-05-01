import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../server';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const KEY_64_HEX = 'c'.repeat(64);

describe('openapi spec endpoint', () => {
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

  it('GET /openapi.json returns deterministic v1 spec with security scheme', async () => {
    const { app } = await buildApp();
    const first = await request(app).get('/openapi.json');
    const second = await request(app).get('/openapi.json');

    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('application/json');
    expect(second.status).toBe(200);
    expect(first.body).toEqual(second.body);

    expect(first.body.paths['/v1/messages']).toBeDefined();
    expect(first.body.paths['/v1/messages/{wamid}']).toBeDefined();
    expect(first.body.paths['/v1/conversations']).toBeDefined();
    expect(first.body.paths['/v1/conversations/{id}/messages']).toBeDefined();
    expect(first.body.paths['/v1/templates']).toBeDefined();
    expect(first.body.paths['/v1/templates/{name}']).toBeDefined();
    expect(first.body.paths['/v1/media/upload']).toBeDefined();
    expect(first.body.paths['/v1/contacts/{phone}/profile']).toBeDefined();

    expect(first.body.components?.securitySchemes?.BearerAuth).toBeDefined();
    expect(first.body.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
  });
});
