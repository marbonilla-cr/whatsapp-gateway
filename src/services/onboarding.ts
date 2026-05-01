import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { AppDb } from '../db';
import { auditLog, onboardingSessions, phoneNumbers, wabas } from '../db/schema';
import { randomId12, randomId16, encryptToken } from './crypto';
import { MetaApiClient, META_API_VERSION } from './meta/client';
import type { PhoneNumber } from './meta/types';

const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const ONBOARDING_TTL_MS = 30 * 60 * 1000;

function hmacStatePayload(encryptionKeyHex: string, parts: string): string {
  const key = Buffer.from(encryptionKeyHex, 'hex');
  return crypto.createHmac('sha256', key).update(parts, 'utf8').digest('hex');
}

function buildStateToken(sessionId: string, tenantId: string, nonce: string, encryptionKeyHex: string): string {
  const sig = hmacStatePayload(encryptionKeyHex, `${sessionId}|${tenantId}|${nonce}`);
  return `${sessionId}.${nonce}.${sig}`;
}

function parseStateToken(state: string): { sessionId: string; nonce: string; sig: string } | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, nonce, sig] = parts;
  if (!sessionId || !nonce || !sig) return null;
  return { sessionId, nonce, sig };
}

export function buildSignupUrl(state: string, redirectUri: string): string {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !configId) {
    throw new Error('META_APP_ID and META_EMBEDDED_SIGNUP_CONFIG_ID are required for Embedded Signup');
  }
  const u = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'whatsapp_business_management,whatsapp_business_messaging');
  u.searchParams.set('config_id', configId);
  u.searchParams.set('override_default_response_type', 'true');
  return u.toString();
}

export async function generateSignedState(
  db: AppDb,
  tenantId: string,
  redirectUri: string,
  encryptionKeyHex: string,
  now = new Date()
): Promise<{ sessionId: string; state: string; expiresAt: Date; signupUrl: string }> {
  const sessionId = randomId12();
  const nonce = crypto.randomBytes(16).toString('base64url');
  const state = buildStateToken(sessionId, tenantId, nonce, encryptionKeyHex);
  const expiresAt = new Date(now.getTime() + ONBOARDING_TTL_MS);

  await db.insert(onboardingSessions).values({
    id: sessionId,
    tenantId,
    state,
    redirectUri,
    status: 'pending',
    metadataJson: null,
    errorMessage: null,
    expiresAt,
    completedAt: null,
    createdAt: now,
  });

  const signupUrl = buildSignupUrl(state, redirectUri);
  return { sessionId, state, expiresAt, signupUrl };
}

export type OnboardingSessionRow = typeof onboardingSessions.$inferSelect;

export async function verifyState(
  db: AppDb,
  state: string,
  encryptionKeyHex: string,
  now = new Date()
): Promise<OnboardingSessionRow | null> {
  const parsed = parseStateToken(state);
  if (!parsed) return null;

  const rows = await db
    .select()
    .from(onboardingSessions)
    .where(eq(onboardingSessions.id, parsed.sessionId))
    .limit(1);
  const row = rows[0];
  if (!row || row.state !== state || row.status !== 'pending') {
    return null;
  }
  if (row.expiresAt.getTime() < now.getTime()) {
    return null;
  }

  const expected = hmacStatePayload(encryptionKeyHex, `${parsed.sessionId}|${row.tenantId}|${parsed.nonce}`);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parsed.sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  return row;
}

async function graphGet<T>(
  path: string,
  accessToken: string,
  log: Logger
): Promise<T> {
  const url = path.startsWith('http') ? path : `${META_GRAPH}/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    log.warn({ path, status: res.status, body }, 'onboarding Graph GET failed');
    throw new Error(`Meta API ${res.status}`);
  }
  return body as T;
}

interface BusinessNode {
  id?: string;
}

interface WabaListResponse {
  data?: Array<{ id?: string }>;
}

async function discoverWabas(accessToken: string, log: Logger): Promise<
  Array<{
    metaWabaId: string;
    metaBusinessId: string;
    phones: PhoneNumber[];
  }>
> {
  const meBiz = await graphGet<{ data?: BusinessNode[] }>('me/businesses', accessToken, log);
  const businesses = Array.isArray(meBiz.data) ? meBiz.data : [];
  const out: Array<{ metaWabaId: string; metaBusinessId: string; phones: PhoneNumber[] }> = [];

  for (const b of businesses) {
    const bid = typeof b.id === 'string' ? b.id : '';
    if (!bid) continue;
    let wabaBody: WabaListResponse;
    try {
      wabaBody = await graphGet<WabaListResponse>(`${bid}/owned_whatsapp_business_accounts`, accessToken, log);
    } catch {
      wabaBody = await graphGet<WabaListResponse>(`${bid}/whatsapp_business_accounts`, accessToken, log);
    }
    const wabaList = Array.isArray(wabaBody.data) ? wabaBody.data : [];
    for (const w of wabaList) {
      const wid = typeof w.id === 'string' ? w.id : '';
      if (!wid) continue;
      const client = new MetaApiClient(wid, accessToken, log);
      const phones = await client.listPhoneNumbers();
      out.push({ metaWabaId: wid, metaBusinessId: bid, phones });
    }
  }
  return out;
}

export type CompleteOnboardingResult = {
  wabaIds: string[];
  phoneNumberIds: string[];
};

/**
 * Atomically marks session as in-progress so duplicate callbacks cannot both succeed.
 * Returns false if already completed / not pending.
 */
async function claimSessionForCompletion(
  db: AppDb,
  sessionId: string,
  now: Date
): Promise<boolean> {
  const updated = await db
    .update(onboardingSessions)
    .set({ status: 'processing', errorMessage: null })
    .where(
      and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.status, 'pending'),
        gt(onboardingSessions.expiresAt, now)
      )
    )
    .returning();
  return updated.length > 0;
}

export async function completeOnboarding(
  db: AppDb,
  code: string,
  state: string,
  encryptionKeyHex: string,
  log: Logger,
  now = new Date()
): Promise<CompleteOnboardingResult> {
  const session = await verifyState(db, state, encryptionKeyHex, now);
  if (!session) {
    throw new Error('INVALID_STATE');
  }

  const claimed = await claimSessionForCompletion(db, session.id, now);
  if (!claimed) {
    throw new Error('STATE_ALREADY_USED');
  }

  const redirectUri = session.redirectUri;
  const tenantId = session.tenantId;

  try {
    const oauthClient = new MetaApiClient('', '', log);
    const tokenRes = await oauthClient.exchangeCodeForToken(code, redirectUri);
    const accessToken = tokenRes.accessToken;
    log.info({ tenantId, sessionId: session.id }, 'onboarding: token exchanged (redacted)');

    const discovered = await discoverWabas(accessToken, log);
    const wabaIds: string[] = [];
    const phoneNumberIds: string[] = [];

    for (const item of discovered) {
      const enc = encryptToken(accessToken, encryptionKeyHex);
      const existing = (
        await db.select().from(wabas).where(eq(wabas.metaWabaId, item.metaWabaId)).limit(1)
      )[0];
      const newWabaId = randomId12();
      const internalWabaId = existing?.id ?? newWabaId;
      const tokenExpiresAt = tokenRes.expiresAt ?? null;

      if (existing) {
        await db
          .update(wabas)
          .set({
            tenantId,
            metaBusinessId: item.metaBusinessId,
            accessTokenEncrypted: enc,
            tokenExpiresAt,
            status: 'active',
            errorMessage: null,
            updatedAt: now,
          })
          .where(eq(wabas.id, existing.id));
      } else {
        await db.insert(wabas).values({
          id: internalWabaId,
          tenantId,
          metaWabaId: item.metaWabaId,
          metaBusinessId: item.metaBusinessId,
          accessTokenEncrypted: enc,
          tokenExpiresAt,
          webhookSubscribedAt: null,
          status: 'active',
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      wabaIds.push(internalWabaId);

      const metaClient = new MetaApiClient(item.metaWabaId, accessToken, log);
      try {
        await metaClient.subscribeWebhook();
        await db
          .update(wabas)
          .set({ webhookSubscribedAt: now, updatedAt: now })
          .where(eq(wabas.metaWabaId, item.metaWabaId));
      } catch (subErr) {
        log.warn({ err: subErr, metaWabaId: item.metaWabaId }, 'subscribeWebhook failed during onboarding');
      }

      for (const pn of item.phones) {
        const metaPid = pn.id;
        if (!metaPid) continue;
        const display =
          typeof pn.display_phone_number === 'string' && pn.display_phone_number.length > 0
            ? pn.display_phone_number
            : metaPid;
        const existingPn = (
          await db.select().from(phoneNumbers).where(eq(phoneNumbers.metaPhoneNumberId, metaPid)).limit(1)
        )[0];
        const internalWaba = (
          await db.select({ id: wabas.id }).from(wabas).where(eq(wabas.metaWabaId, item.metaWabaId)).limit(1)
        )[0];
        const wId = internalWaba?.id ?? internalWabaId;

        if (existingPn) {
          await db
            .update(phoneNumbers)
            .set({
              wabaId: wId,
              displayPhoneNumber: display,
              displayName: typeof pn.verified_name === 'string' ? pn.verified_name : null,
              verifiedName: typeof pn.verified_name === 'string' ? pn.verified_name : null,
              qualityRating: typeof pn.quality_rating === 'string' ? pn.quality_rating : null,
              messagingLimitTier: typeof pn.messaging_limit_tier === 'string' ? pn.messaging_limit_tier : null,
              updatedAt: now,
            })
            .where(eq(phoneNumbers.id, existingPn.id));
          phoneNumberIds.push(existingPn.id);
        } else {
          const pid = randomId12();
          await db.insert(phoneNumbers).values({
            id: pid,
            wabaId: wId,
            metaPhoneNumberId: metaPid,
            displayPhoneNumber: display,
            displayName: null,
            displayNameStatus: 'pending',
            verifiedName: typeof pn.verified_name === 'string' ? pn.verified_name : null,
            qualityRating: typeof pn.quality_rating === 'string' ? pn.quality_rating : null,
            messagingLimitTier: typeof pn.messaging_limit_tier === 'string' ? pn.messaging_limit_tier : null,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          });
          phoneNumberIds.push(pid);
        }
      }
    }

    const metadata = { wabaIds, phoneNumberIds, metaWabaIds: discovered.map((d) => d.metaWabaId) };
    await db
      .update(onboardingSessions)
      .set({
        status: 'completed',
        completedAt: now,
        metadataJson: metadata,
        errorMessage: null,
      })
      .where(eq(onboardingSessions.id, session.id));

    await db.insert(auditLog).values({
      id: randomId16(),
      tenantId,
      actorUserId: null,
      action: 'onboarding_completed',
      targetType: 'onboarding_session',
      targetId: session.id,
      diffJson: metadata as unknown as Record<string, unknown>,
      ipAddress: null,
      userAgent: null,
      createdAt: now,
    });

    return { wabaIds, phoneNumberIds };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(onboardingSessions)
      .set({
        status: 'failed',
        errorMessage: msg,
        completedAt: now,
      })
      .where(eq(onboardingSessions.id, session.id));
    throw err;
  }
}
