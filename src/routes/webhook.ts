import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import type * as schema from '../db/schema';
import { apps, messageLogs } from '../db/schema';
import type { AppRow } from '../types';
import { randomId16, validateMetaSignature } from '../services/crypto';
import { forwardToApp } from '../services/router';

const UNKNOWN_APP_ID = 'unknown';

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

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

function extractPhoneFromWaValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const m = (value as { metadata?: { phone_number_id?: string } }).metadata;
  const pid = m?.phone_number_id;
  return typeof pid === 'string' && pid.length > 0 ? pid : undefined;
}

interface WaValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
}

/** Un evento lógico = cada `change` de Meta; si no hay estructura estándar, un único evento con el body completo. */
function extractMetaChanges(payload: unknown): Array<{ field?: string; value: unknown; rawPayload: string }> {
  const out: Array<{ field?: string; value: unknown; rawPayload: string }> = [];
  if (!payload || typeof payload !== 'object') {
    out.push({ rawPayload: safeJsonStringify(payload) });
    return out;
  }
  const p = payload as { entry?: unknown[] };
  if (!Array.isArray(p.entry)) {
    out.push({ rawPayload: safeJsonStringify(payload) });
    return out;
  }
  for (const ent of p.entry) {
    if (!ent || typeof ent !== 'object') continue;
    const changes = (ent as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      if (!ch || typeof ch !== 'object') continue;
      const c = ch as { field?: string; value?: unknown };
      out.push({
        field: typeof c.field === 'string' ? c.field : undefined,
        value: c.value,
        rawPayload: safeJsonStringify(ch),
      });
    }
  }
  if (out.length === 0) {
    out.push({ rawPayload: safeJsonStringify(payload) });
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

function bodyPreviewForChange(field: string | undefined, value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return field ? `[${field}]` : undefined;
  }
  const v = value as WaValue;
  const msgs = v.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    const first = msgs[0];
    if (first && typeof first === 'object') {
      const p = previewFromMessage(first);
      if (msgs.length > 1) return p ? `${p} (+${msgs.length - 1})` : `${msgs.length} messages`;
      return p;
    }
    return `${msgs.length} messages`;
  }
  const sts = v.statuses;
  if (Array.isArray(sts) && sts.length > 0) {
    const s0 = sts[0];
    const st = s0 && typeof s0 === 'object' ? (s0 as { status?: string }).status : undefined;
    return typeof st === 'string' ? `status:${st}` : `${sts.length} statuses`;
  }
  return field ? `[${field}]` : '[event]';
}

function inferNumbersFromValue(value: unknown): { from: string; to: string } {
  if (!value || typeof value !== 'object') return { from: 'unknown', to: 'unknown' };
  const v = value as WaValue;
  const meta = v.metadata;
  const toNum = meta?.display_phone_number ?? meta?.phone_number_id ?? 'unknown';
  const msgs = v.messages;
  if (Array.isArray(msgs) && msgs[0] && typeof msgs[0] === 'object') {
    const from = typeof msgs[0].from === 'string' ? msgs[0].from : 'unknown';
    return { from, to: String(toNum) };
  }
  const sts = v.statuses;
  if (Array.isArray(sts) && sts[0] && typeof sts[0] === 'object') {
    const s0 = sts[0] as { recipient_id?: string };
    const dest = typeof s0.recipient_id === 'string' ? s0.recipient_id : 'unknown';
    return { from: String(toNum), to: dest };
  }
  return { from: 'unknown', to: String(toNum) };
}

function metaMessageIdFromValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as WaValue;
  const msgs = v.messages;
  if (Array.isArray(msgs) && msgs[0] && typeof msgs[0] === 'object') {
    const id = msgs[0].id;
    if (typeof id === 'string') return id;
  }
  const sts = v.statuses;
  if (Array.isArray(sts) && sts[0] && typeof sts[0] === 'object') {
    const id = (sts[0] as { id?: string }).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
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
    log.info({ headers: req.headers, body: req.body }, 'webhook received');

    const signature = req.header('x-hub-signature-256');
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;

    const rejectionReasons: string[] = [];
    let signatureValid = false;

    if (!signature) {
      rejectionReasons.push('missing_x_hub_signature_256');
      log.warn(
        {
          diagnostic: 'webhook_signature',
          reason: 'missing_x_hub_signature_256',
          contentType: req.header('content-type'),
          contentLength: req.header('content-length'),
          userAgent: req.header('user-agent'),
        },
        'POST /webhook: missing signature — logging and returning 200 (diagnostic)'
      );
    } else if (!raw || !Buffer.isBuffer(raw)) {
      rejectionReasons.push('missing_raw_body');
      log.warn(
        {
          diagnostic: 'webhook_signature',
          reason: 'missing_raw_body',
          signaturePrefix: signature.slice(0, 24),
          contentType: req.header('content-type'),
        },
        'POST /webhook: rawBody missing — logging and returning 200 (diagnostic)'
      );
    } else if (!validateMetaSignature(raw, signature, hmacSecret)) {
      rejectionReasons.push('invalid_hmac');
      const sigOkFormat = signature.startsWith('sha256=');
      const recvLen = signature.startsWith('sha256=') ? signature.length - 7 : 0;
      log.warn(
        {
          diagnostic: 'webhook_signature',
          reason: 'invalid_hmac',
          signatureFormatOk: sigOkFormat,
          signaturePrefix: signature.slice(0, 32),
          receivedHexLength: recvLen,
          rawBodyLength: raw.length,
          hmacSecretConfiguredLength: hmacSecret.length,
        },
        'POST /webhook: HMAC validation failed — logging and returning 200 (diagnostic)'
      );
    } else {
      signatureValid = true;
    }

    if (rejectionReasons.length > 0) {
      log.info({ rejectionReasons }, 'webhook verification did not pass; payload still recorded (diagnostic)');
    }

    const payload = req.body as unknown;
    const db = getDb();
    const phoneNumberId = extractPhoneNumberId(payload);

    let appForForward: AppRow | undefined;
    if (phoneNumberId) {
      const rows = db
        .select()
        .from(apps)
        .where(and(eq(apps.phoneNumberId, phoneNumberId), eq(apps.isActive, true)))
        .limit(1)
        .all();
      appForForward = rows[0];
    }

    if (signatureValid && appForForward) {
      void forwardToApp(appForForward, payload as object, log);
    } else {
      if (signatureValid && phoneNumberId && !appForForward) {
        log.warn(
          { phoneNumberId, rejectionReasons: ['no_active_app_for_phone_number_id'] },
          'No active app for phone_number_id — not forwarding (diagnostic)'
        );
      } else if (!signatureValid) {
        log.info(
          { skipForward: 'invalid_or_unverified_signature', rejectionReasons },
          'Not forwarding webhook to app (diagnostic)'
        );
      }
    }

    const resolveAppIdForPhone = (pid: string | undefined): string => {
      if (!pid) return UNKNOWN_APP_ID;
      const rows = db
        .select()
        .from(apps)
        .where(and(eq(apps.phoneNumberId, pid), eq(apps.isActive, true)))
        .limit(1)
        .all();
      return rows[0]?.id ?? UNKNOWN_APP_ID;
    };

    const changes = extractMetaChanges(payload);
    const now = new Date().toISOString();

    for (const change of changes) {
      const pid = extractPhoneFromWaValue(change.value);
      const appId = resolveAppIdForPhone(pid);
      const { from: fromNumber, to: toNumber } = inferNumbersFromValue(change.value);
      const messageType = change.field ?? 'webhook';
      const bodyPreview = bodyPreviewForChange(change.field, change.value);
      const metaMessageId = metaMessageIdFromValue(change.value);
      try {
        db.insert(messageLogs)
          .values({
            id: randomId16(),
            appId,
            direction: 'IN',
            fromNumber,
            toNumber,
            messageType,
            bodyPreview,
            metaMessageId,
            rawPayload: change.rawPayload,
            status: 'sent',
            createdAt: now,
          })
          .run();
      } catch (err) {
        log.error({ err, appId }, 'failed to insert message log');
      }
    }

    res.status(200).json({ success: true });
  });

  return r;
}
