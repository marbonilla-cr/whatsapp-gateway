import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import pino from 'pino';
import { getDb } from '../db';
import { executeForwardJob } from '../queue/workers/forwardWorker';
import { createTestApp } from './fixtures';
import { setupTestPgMem, teardownTestPgMem } from './test-db';

const KEY_64_HEX = 'e'.repeat(64);

describe('executeForwardJob', () => {
  beforeEach(async () => {
    await teardownTestPgMem();
    await setupTestPgMem();
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_64_HEX;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_mem';
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    process.env.FORWARD_TIMEOUT_MS = '30000';
  });

  afterEach(async () => {
    await teardownTestPgMem();
    vi.unstubAllGlobals();
  });

  it('completes when callback returns 2xx', async () => {
    await createTestApp(getDb(), {
      apiKey: 'gw_testkey1234567890123456789012',
      encryptionKey: KEY_64_HEX,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const log = pino({ level: 'silent' });
    await expect(
      executeForwardJob(
        getDb(),
        { appId: 'appidfortest', eventId: 'evt1', change: { field: 'x' } },
        log,
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalled();
  });

  it('throws UnrecoverableError on callback 4xx', async () => {
    await createTestApp(getDb(), {
      apiKey: 'gw_testkey1234567890123456789012',
      encryptionKey: KEY_64_HEX,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const log = pino({ level: 'silent' });
    await expect(
      executeForwardJob(
        getDb(),
        { appId: 'appidfortest', eventId: 'evt2', change: {} },
        log,
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow(UnrecoverableError);
  });

  it('throws retryable Error on callback 5xx', async () => {
    await createTestApp(getDb(), {
      apiKey: 'gw_testkey1234567890123456789012',
      encryptionKey: KEY_64_HEX,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const log = pino({ level: 'silent' });
    await expect(
      executeForwardJob(
        getDb(),
        { appId: 'appidfortest', eventId: 'evt3', change: {} },
        log,
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow('callback 503');
  });

  it('throws retryable Error on timeout', async () => {
    process.env.FORWARD_TIMEOUT_MS = '50';
    await createTestApp(getDb(), {
      apiKey: 'gw_testkey1234567890123456789012',
      encryptionKey: KEY_64_HEX,
    });
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (!sig) {
          reject(new Error('no signal'));
          return;
        }
        const onAbort = () => {
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        };
        if (sig.aborted) {
          onAbort();
          return;
        }
        sig.addEventListener('abort', onAbort, { once: true });
      });
    });

    const log = pino({ level: 'silent' });
    await expect(
      executeForwardJob(
        getDb(),
        { appId: 'appidfortest', eventId: 'evt4', change: {} },
        log,
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow('callback timeout');
  });
});
