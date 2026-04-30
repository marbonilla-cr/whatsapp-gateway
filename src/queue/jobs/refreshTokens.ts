import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { AppDb } from '../../db';
import { tenantUsers, wabas } from '../../db/schema';
import { decryptToken, encryptToken } from '../../services/crypto';
import { MetaApiClient } from '../../services/meta/client';
import { sendEmail } from '../../services/notifications';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export async function refreshTokensJob(
  getDb: () => AppDb,
  encryptionKeyHex: string,
  log: Logger
): Promise<void> {
  const db = getDb();
  const threshold = new Date(Date.now() + TEN_DAYS_MS);

  const rows = await db
    .select()
    .from(wabas)
    .where(
      and(
        eq(wabas.status, 'active'),
        or(isNull(wabas.tokenExpiresAt), lte(wabas.tokenExpiresAt, threshold))
      )
    );

  for (const row of rows) {
    let token: string;
    try {
      token = decryptToken(row.accessTokenEncrypted, encryptionKeyHex);
    } catch (err) {
      log.error({ wabaId: row.id, err }, 'refresh job: decrypt failed');
      continue;
    }

    const oauthClient = new MetaApiClient(row.metaWabaId, token, log);
    try {
      const refreshed = await oauthClient.refreshLongLivedToken(token);
      const enc = encryptToken(refreshed.accessToken, encryptionKeyHex);
      const now = new Date();
      await db
        .update(wabas)
        .set({
          accessTokenEncrypted: enc,
          tokenExpiresAt: refreshed.expiresAt ?? null,
          status: 'active',
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(wabas.id, row.id));
      log.info({ wabaId: row.id }, 'refresh job: token renewed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const now = new Date();
      await db
        .update(wabas)
        .set({
          status: 'error',
          errorMessage: msg.slice(0, 2000),
          updatedAt: now,
        })
        .where(eq(wabas.id, row.id));
      log.warn({ wabaId: row.id, err: msg }, 'refresh job: Meta refresh failed');

      const admins = await db
        .select({ email: tenantUsers.email })
        .from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, row.tenantId), eq(tenantUsers.role, 'tenant_admin'), eq(tenantUsers.isActive, true)));

      const alertTo = process.env.ALERT_EMAIL_TO?.trim();
      const subject = `[WhatsApp Gateway] Token refresh failed for WABA ${row.metaWabaId}`;
      const body = `WABA internal id: ${row.id}\nMeta WABA id: ${row.metaWabaId}\nTenant: ${row.tenantId}\nError: ${msg}`;

      if (alertTo) {
        await sendEmail(alertTo, subject, body, log);
      }
      for (const a of admins) {
        await sendEmail(a.email, subject, body, log);
      }
    }
  }
}
