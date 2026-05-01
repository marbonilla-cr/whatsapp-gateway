import { Worker, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { AppDb } from '../../db';
import { apps } from '../../db/schema';
import type { ForwardWebhookJobPayload } from '../index';

let worker: Worker<ForwardWebhookJobPayload> | null = null;
let connection: Redis | null = null;

function forwardTimeoutMs(): number {
  const raw = process.env.FORWARD_TIMEOUT_MS;
  const n = raw ? Number.parseInt(raw, 10) : 30_000;
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

/** Exported for unit tests (inject `fetchImpl`). */
export async function executeForwardJob(
  db: AppDb,
  jobData: ForwardWebhookJobPayload,
  log: Logger,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { appId, eventId, change } = jobData;
  const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  const app = rows[0];
  if (!app) {
    throw new UnrecoverableError(`app not found: ${appId}`);
  }

  const controller = new AbortController();
  const ms = forwardTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), ms);
  let status = 0;
  try {
    const res = await fetchImpl(app.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-App-Id': app.id,
        'X-Gateway-Event-Id': eventId,
        'X-Gateway-Timestamp': String(Date.now()),
      },
      body: JSON.stringify({ eventId, appId, change }),
      signal: controller.signal,
    });
    status = res.status;
    if (status >= 400 && status < 500) {
      log.warn({ appId, eventId, status }, 'forward callback client error — no retry');
      throw new UnrecoverableError(`callback ${status}`);
    }
    if (!res.ok) {
      log.warn({ appId, eventId, status }, 'forward callback server error — will retry');
      throw new Error(`callback ${status}`);
    }
    log.info({ appId, eventId, status }, 'forward callback completed');
  } catch (err) {
    if (err instanceof UnrecoverableError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      log.warn({ appId, eventId, status: 'timeout' }, 'forward callback timeout — will retry');
      throw new Error('callback timeout');
    }
    log.warn({ err, appId, eventId, status: status || 'network' }, 'forward callback error — will retry');
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timeout);
  }
}

export function startForwardWorker(getDb: () => AppDb, log: Logger): void {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    log.warn('REDIS_URL not set — forward webhook worker not started');
    return;
  }
  if (worker) {
    return;
  }
  connection = new Redis(url, { maxRetriesPerRequest: null });
  worker = new Worker<ForwardWebhookJobPayload>(
    'forward-webhook',
    async (job) => {
      await executeForwardJob(getDb(), job.data, log);
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    log.error(
      { err, jobId: job?.id, appId: job?.data.appId, eventId: job?.data.eventId },
      'forward-webhook job failed'
    );
  });
}

export async function stopForwardWorker(log?: Logger): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
  log?.info('forward webhook worker stopped');
}
