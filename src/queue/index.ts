import { Queue } from 'bullmq';
import Redis from 'ioredis';

const defaultJobOpts = {
  removeOnComplete: 1000,
  removeOnFail: 100,
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
};

export type ForwardWebhookJobPayload = {
  appId: string;
  eventId: string;
  /** Single Meta `change` object (field + value + raw) for the client callback. */
  change: Record<string, unknown>;
};

export type SendMessageJobPayload = Record<string, unknown>;

let connection: Redis | null = null;
let forwardQueue: Queue<ForwardWebhookJobPayload> | null = null;
let sendQueue: Queue<SendMessageJobPayload> | null = null;

function getRedisUrl(): string | undefined {
  const u = process.env.REDIS_URL;
  return u && u.trim().length > 0 ? u : undefined;
}

function ensureQueues(): void {
  const url = getRedisUrl();
  if (!url) {
    return;
  }
  if (connection) {
    return;
  }
  connection = new Redis(url, { maxRetriesPerRequest: null });
  forwardQueue = new Queue<ForwardWebhookJobPayload>('forward-webhook', {
    connection,
    defaultJobOptions: defaultJobOpts,
  });
  sendQueue = new Queue<SendMessageJobPayload>('send-message', {
    connection,
    defaultJobOptions: defaultJobOpts,
  });
}

export function isQueueEnabled(): boolean {
  return Boolean(getRedisUrl());
}

export async function enqueueForward(payload: ForwardWebhookJobPayload): Promise<void> {
  ensureQueues();
  if (!forwardQueue) {
    return;
  }
  await forwardQueue.add('forward', payload, { jobId: `${payload.eventId}:${payload.appId}` });
}

export async function enqueueSend(payload: SendMessageJobPayload): Promise<void> {
  ensureQueues();
  if (!sendQueue) {
    return;
  }
  await sendQueue.add('send', payload);
}

/** Ping Redis when queue is enabled; resolves status for /health. */
export async function pingRedis(): Promise<'ok' | 'error' | 'disabled'> {
  if (!getRedisUrl()) {
    return 'disabled';
  }
  ensureQueues();
  if (!connection) {
    return 'error';
  }
  try {
    const pong = await connection.ping();
    return pong === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function shutdown(): Promise<void> {
  await forwardQueue?.close();
  await sendQueue?.close();
  forwardQueue = null;
  sendQueue = null;
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
