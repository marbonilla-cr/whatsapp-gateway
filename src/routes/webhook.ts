import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import type * as schema from '../db/schema';
import { apps, messageLogs } from '../db/schema';
import { randomId16, validateMetaSignature } from '../services/crypto';
import { forwardToApp } from '../services/router';

function extractPhoneNumberId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) return undefined;
  for (const ent of entry) {
    if (!ent || typeof ent !== 'object') continue;
    const changes = (ent as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      if (!ch || typeof ch !== 'object') continue;
      const value = (ch as { value?: { metadata?: { phone_number_id?: string } } }).value;
      const pid = value?.metadata?.phone_number_id;
      if (typeof pid === 'string' && pid.length > 0) return pid;
    }
  }
  return undefined;
}

interface WaValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: Array<Record<string, unknown>>;
  statuses?: unknown[];
}

function extractValues(payload: unknown): WaValue[] {
  const out: WaValue[] = [];
  if (!payload || typeof payload !== 'object') return out;
  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) return out;
  for (const ent of entry) {
    if (!ent || typeof ent !== 'object') continue;
    const changes = (ent as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      if (!ch || typeof ch !== 'object') continue;
      const value = (ch as { value?: WaValue }).value;
      if (value && typeof value === 'object') out.push(value);
    }
  }
  return out;
}

function previewFromMessage(msg: Record<string, unknown>): string | undefined {
  const t = msg.type;
  if (t === 'text' && msg.text && typeof msg.text === 'object') {
    const body = (msg.text as { body?: string }).body;
    if (typeof body === 'string') {
      return body.length > 100 ? body.slice(0, 100) : body;
    }
  }
  return typeof t === 'string' ? `[${t}]` : undefined;
}

export function createWebhookRouter(
  getDb: () => BetterSQLite3Database<typeof schema>,
  metaVerifyToken: string,
  /** HMAC secret for `x-hub-signature-256` (typically Meta App Secret, or GATEWAY_ENCRYPTION_KEY per spec). */
  hmacSecret: string,
  log: Logger
) {
  const r = Router();

  r.get('/', (req: Request, res: Response) => {
    const token = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;
    if (token === metaVerifyToken && challenge !== undefined) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(403).json({
      error: { code: 'FORBIDDEN' as const, message: 'Invalid verify token' },
    });
  });

  r.post('/', (req: Request, res: Response) => {
    const signature = req.header('x-hub-signature-256');
    if (!signature) {
      log.warn('POST /webhook missing x-hub-signature-256');
      res.status(401).json({
        error: { code: 'INVALID_SIGNATURE' as const, message: 'Missing signature header' },
      });
      return;
    }
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw || !Buffer.isBuffer(raw)) {
      log.warn('POST /webhook missing rawBody');
      res.status(401).json({
        error: { code: 'INVALID_SIGNATURE' as const, message: 'Missing raw body' },
      });
      return;
    }
    if (!validateMetaSignature(raw, signature, hmacSecret)) {
      log.warn('POST /webhook invalid HMAC signature');
      res.status(401).json({
        error: { code: 'INVALID_SIGNATURE' as const, message: 'Invalid signature' },
      });
      return;
    }
    const payload = req.body as unknown;
    const phoneNumberId = extractPhoneNumberId(payload);
    if (!phoneNumberId) {
      res.status(200).json({ success: true });
      return;
    }
    const db = getDb();
    const rows = db
      .select()
      .from(apps)
      .where(and(eq(apps.phoneNumberId, phoneNumberId), eq(apps.isActive, true)))
      .limit(1)
      .all();
    const app = rows[0];
    if (!app) {
      log.warn({ phoneNumberId }, 'No active app for phone_number_id');
      res.status(200).json({ success: true });
      return;
    }
    void forwardToApp(app, payload as object, log);
    const values = extractValues(payload);
    const now = new Date().toISOString();
    for (const value of values) {
      const msgs = value.messages;
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      const toNum =
        value.metadata?.display_phone_number ?? value.metadata?.phone_number_id ?? 'unknown';
      for (const msg of msgs) {
        if (!msg || typeof msg !== 'object') continue;
        const fromNum = typeof msg.from === 'string' ? msg.from : 'unknown';
        const messageType = typeof msg.type === 'string' ? msg.type : 'unknown';
        const bodyPreview = previewFromMessage(msg);
        const metaMessageId = typeof msg.id === 'string' ? msg.id : undefined;
        try {
          db.insert(messageLogs)
            .values({
              id: randomId16(),
              appId: app.id,
              direction: 'IN',
              fromNumber: fromNum,
              toNumber: String(toNum),
              messageType,
              bodyPreview,
              metaMessageId,
              status: 'sent',
              createdAt: now,
            })
            .run();
        } catch (err) {
          log.error({ err, appId: app.id }, 'failed to insert message log');
        }
      }
    }
    res.status(200).json({ success: true });
  });

  return r;
}
