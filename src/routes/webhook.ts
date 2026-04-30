import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import type { Logger } from 'pino';
import { apps, auditLog, messages, phoneNumbers, tenantUsers, wabas, webhookEvents } from '../db/schema';
import { randomId16, validateMetaSignature } from '../services/crypto';
import { enqueueForward } from '../queue';
import { sendEmail } from '../services/notifications';

const UNKNOWN_APP_ID = 'unknown';

function isStrictWebhookVerify(): boolean {
  return process.env.STRICT_WEBHOOK_VERIFY === 'true';
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
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

type MetaWebhookChange = {
  field?: string;
  value?: unknown;
  rawPayload: string | null;
  /** WhatsApp Business Account id from webhook `entry[].id` when present. */
  entryWabaId?: string;
};

function extractMetaChanges(payload: unknown): MetaWebhookChange[] {
  const out: MetaWebhookChange[] = [];
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
    const entryId = (ent as { id?: string }).id;
    const entryWabaId = typeof entryId === 'string' && entryId.length > 0 ? entryId : undefined;
    const changes = (ent as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    if (changes.length === 0 && entryWabaId) {
      out.push({
        field: undefined,
        value: ent,
        rawPayload: safeJsonStringify(ent),
        entryWabaId,
      });
      continue;
    }
    for (const ch of changes) {
      if (!ch || typeof ch !== 'object') continue;
      const c = ch as { field?: string; value?: unknown };
      out.push({
        field: typeof c.field === 'string' ? c.field : undefined,
        value: c.value,
        rawPayload: safeJsonStringify(ch),
        entryWabaId,
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

function parseJsonb(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { _unparsed: raw };
  }
}

function changeToRecord(change: MetaWebhookChange): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (change.field !== undefined) base.field = change.field;
  if (change.value !== undefined) base.value = change.value;
  if (change.rawPayload !== null) {
    try {
      base.raw = JSON.parse(change.rawPayload) as unknown;
    } catch {
      base.raw = change.rawPayload;
    }
  }
  return base;
}

function isPermissionRevokeField(field: string | undefined): boolean {
  if (!field) return false;
  const f = field.toLowerCase();
  return f === 'account_review_update' || f === 'permission_revoked';
}

function extractMetaWabaIdFromChange(change: MetaWebhookChange): string | undefined {
  if (change.entryWabaId) return change.entryWabaId;
  const v = change.value;
  if (!v || typeof v !== 'object') return undefined;
  const w = (v as { waba_id?: string; wabaId?: string }).waba_id ?? (v as { wabaId?: string }).wabaId;
  return typeof w === 'string' && w.length > 0 ? w : undefined;
}

async function tryHandlePermissionRevoked(
  db: AppDb,
  change: MetaWebhookChange,
  log: Logger,
  now: Date
): Promise<void> {
  if (!isPermissionRevokeField(change.field)) {
    return;
  }
  const metaWabaId = extractMetaWabaIdFromChange(change);
  if (!metaWabaId) {
    log.warn({ field: change.field }, 'permission webhook: could not resolve waba id');
    return;
  }

  const rows = await db.select().from(wabas).where(eq(wabas.metaWabaId, metaWabaId)).limit(1);
  const wabaRow = rows[0];
  if (!wabaRow) {
    log.warn({ metaWabaId }, 'permission webhook: unknown WABA');
    return;
  }

  await db
    .update(wabas)
    .set({ status: 'revoked', updatedAt: now, errorMessage: `permission_revoked:${change.field ?? ''}` })
    .where(eq(wabas.id, wabaRow.id));

  await db.insert(auditLog).values({
    id: randomId16(),
    tenantId: wabaRow.tenantId,
    actorUserId: null,
    action: 'waba_permission_revoked',
    targetType: 'waba',
    targetId: wabaRow.id,
    diffJson: { field: change.field, metaWabaId } as unknown as Record<string, unknown>,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
  });

  const admins = await db
    .select({ email: tenantUsers.email })
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, wabaRow.tenantId),
        eq(tenantUsers.role, 'tenant_admin'),
        eq(tenantUsers.isActive, true)
      )
    );

  const subject = `[WhatsApp Gateway] WABA access revoked (${metaWabaId})`;
  const body = `Your WhatsApp Business Account connection was revoked or restricted (field: ${change.field ?? 'unknown'}).\nMeta WABA id: ${metaWabaId}\nInternal id: ${wabaRow.id}`;

  const alertTo = process.env.ALERT_EMAIL_TO?.trim();
  if (alertTo) {
    await sendEmail(alertTo, subject, body, log);
  }
  for (const a of admins) {
    await sendEmail(a.email, subject, body, log);
  }
}

async function resolveAppByMetaPhoneNumberId(
  db: AppDb,
  metaPhoneNumberId: string
): Promise<{ app: typeof apps.$inferSelect; phoneRow: typeof phoneNumbers.$inferSelect } | undefined> {
  const pnRows = await db
    .select()
    .from(phoneNumbers)
    .where(eq(phoneNumbers.metaPhoneNumberId, metaPhoneNumberId))
    .limit(1);
  const phoneRow = pnRows[0];
  if (!phoneRow) return undefined;
  const appRows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.phoneNumberId, phoneRow.id), eq(apps.isActive, true)))
    .limit(1);
  const app = appRows[0];
  if (!app) return undefined;
  return { app, phoneRow };
}

export function createWebhookRouter(
  getDb: () => AppDb,
  metaVerifyToken: string,
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

  r.post('/', async (req: Request, res: Response) => {
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
        'POST /webhook: missing signature'
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
        'POST /webhook: rawBody missing'
      );
    } else if (!validateMetaSignature(raw, signature, hmacSecret)) {
      rejectionReasons.push('invalid_hmac');
      log.warn(
        {
          diagnostic: 'webhook_signature',
          reason: 'invalid_hmac',
          signaturePrefix: signature.slice(0, 32),
          rawBodyLength: raw.length,
        },
        'POST /webhook: HMAC validation failed'
      );
    } else {
      signatureValid = true;
    }

    const strict = isStrictWebhookVerify();
    if (strict && !signatureValid) {
      log.warn({ rejectionReasons }, 'STRICT_WEBHOOK_VERIFY: rejecting webhook');
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'Invalid webhook signature' },
      });
      return;
    }

    if (rejectionReasons.length > 0 && !strict) {
      log.info({ rejectionReasons }, 'webhook verification did not pass; accepting (non-strict)');
    }

    const payload = req.body as unknown;
    const db = getDb();
    const changes = extractMetaChanges(payload);
    const now = new Date();

    const unknownTenantRows = await db
      .select({ tenantId: apps.tenantId })
      .from(apps)
      .where(eq(apps.id, UNKNOWN_APP_ID))
      .limit(1);
    const unknownTenantId = unknownTenantRows[0]?.tenantId;

    for (const change of changes) {
      try {
        await tryHandlePermissionRevoked(db, change, log, now);
      } catch (err) {
        log.error({ err }, 'permission_revoked handler failed');
      }

      const metaPid = extractPhoneFromWaValue(change.value);
      let wabaId: string | null = null;
      let phoneNumberFk: string | null = null;
      let appRow: typeof apps.$inferSelect | undefined;

      if (metaPid) {
        const resolved = await resolveAppByMetaPhoneNumberId(db, metaPid);
        if (resolved) {
          appRow = resolved.app;
          wabaId = resolved.phoneRow.wabaId;
          phoneNumberFk = resolved.phoneRow.id;
        }
      }

      const eventId = randomId16();
      const auditPayload = changeToRecord(change);

      try {
        await db.insert(webhookEvents).values({
          id: eventId,
          wabaId,
          phoneNumberId: phoneNumberFk,
          eventType: change.field ?? 'META_WEBHOOK_CHANGE',
          rawPayload: auditPayload,
          signatureValid,
          processed: Boolean(appRow && signatureValid),
          createdAt: now,
        });
      } catch (err) {
        log.error({ err }, 'failed to insert webhook_events');
      }

      const appId = appRow?.id ?? UNKNOWN_APP_ID;
      const tenantId = appRow?.tenantId ?? unknownTenantId;
      const { from: fromNumber, to: toNumber } = inferNumbersFromValue(change.value);
      const messageType = change.field ?? 'webhook';
      const bodyPreview = bodyPreviewForChange(change.field, change.value);
      const metaMessageId = metaMessageIdFromValue(change.value);
      const rawObj = parseJsonb(change.rawPayload);

      try {
        if (!tenantId) {
          log.error({ appId }, 'missing tenant for message insert');
        } else {
          await db.insert(messages).values({
            id: randomId16(),
            appId,
            tenantId,
            direction: 'IN',
            fromNumber,
            toNumber,
            messageType,
            bodyPreview,
            rawPayload: rawObj,
            metaMessageId: metaMessageId ?? null,
            status: 'sent',
            errorCode: null,
            errorMessage: null,
            createdAt: now,
          });
        }
      } catch (err) {
        log.error({ err, appId }, 'failed to insert message');
      }

      if (signatureValid && appRow) {
        try {
          await enqueueForward({
            appId: appRow.id,
            eventId,
            change: auditPayload,
          });
        } catch (err) {
          log.error({ err, appId: appRow.id, eventId }, 'enqueue forward failed');
        }
      } else if (metaPid && !appRow) {
        log.warn({ phone_number_id: metaPid }, 'No app for phone_number_id — orphan webhook event');
      }
    }

    res.status(200).json({
      success: true,
      signatureValid,
      strictWebhookVerify: strict,
    });
  });

  return r;
}
