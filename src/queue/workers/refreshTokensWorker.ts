import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { AppDb } from '../../db';
import { refreshTokensJob } from '../jobs/refreshTokens';

let worker: Worker | null = null;
let connection: Redis | null = null;
let refreshQueue: Queue | null = null;

const QUEUE_NAME = 'refresh-tokens';

function ensureConnection(url: string): Redis {
  if (!connection) {
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getRefreshTokensQueue(): Queue | null {
  return refreshQueue;
}

export async function registerRefreshTokensRepeat(log: Logger): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    log.warn('REDIS_URL not set — refresh-tokens scheduler not registered');
    return;
  }
  const conn = ensureConnection(url);
  if (!refreshQueue) {
    refreshQueue = new Queue(QUEUE_NAME, { connection: conn });
  }
  await refreshQueue.add(
    'refresh-tokens',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'refresh-tokens-daily',
    }
  );
  log.info('Registered daily refresh-tokens job (3am UTC)');
}

export function startRefreshTokensWorker(
  getDb: () => AppDb,
  encryptionKeyHex: string,
  log: Logger
): void {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    log.warn('REDIS_URL not set — refresh-tokens worker not started');
    return;
  }
  if (worker) {
    return;
  }
  const conn = ensureConnection(url);
  worker = new Worker(
    QUEUE_NAME,
    async () => {
      await refreshTokensJob(getDb, encryptionKeyHex, log);
    },
    { connection: conn }
  );
  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id }, 'refresh-tokens job failed');
  });
}

export async function stopRefreshTokensWorker(log?: Logger): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (refreshQueue) {
    await refreshQueue.close();
    refreshQueue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
  log?.info('refresh-tokens worker stopped');
}
