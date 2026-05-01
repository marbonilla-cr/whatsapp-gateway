import { and, eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../../db';
import { apps, phoneNumbers, wabas } from '../../db/schema';
import { encryptToken, randomId12 } from '../../services/crypto';

export type AppRow = InferSelectModel<typeof apps>;

export function listAppPublic(row: AppRow, metaPhoneNumberId?: string, metaWabaId?: string) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    vertical: row.vertical,
    apiKeyPrefix: row.apiKeyPrefix,
    callbackUrl: row.callbackUrl,
    phoneNumberId: metaPhoneNumberId ?? row.phoneNumberId,
    /** Meta Graph WABA id (for admin UI). */
    wabaId: metaWabaId ?? '',
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function patchAppPublic(row: AppRow, metaPhoneNumberId?: string, metaWabaId?: string) {
  return { ...listAppPublic(row, metaPhoneNumberId, metaWabaId), updatedAt: row.updatedAt };
}

export async function ensureWabaAndPhone(
  db: AppDb,
  tenantId: string,
  metaWabaId: string,
  metaPhoneNumberId: string,
  accessTokenEncrypted: string,
  now: Date
): Promise<{ wabaId: string; phoneRowId: string }> {
  let wabaRow = (
    await db
      .select()
      .from(wabas)
      .where(and(eq(wabas.tenantId, tenantId), eq(wabas.metaWabaId, metaWabaId)))
      .limit(1)
  )[0];

  if (!wabaRow) {
    const id = randomId12();
    await db.insert(wabas).values({
      id,
      tenantId,
      metaWabaId,
      metaBusinessId: null,
      accessTokenEncrypted,
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    wabaRow = (await db.select().from(wabas).where(eq(wabas.id, id)).limit(1))[0]!;
  } else {
    await db
      .update(wabas)
      .set({ accessTokenEncrypted, updatedAt: now })
      .where(eq(wabas.id, wabaRow.id));
  }

  const existingPhone = (
    await db
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.metaPhoneNumberId, metaPhoneNumberId))
      .limit(1)
  )[0];

  if (existingPhone) {
    if (existingPhone.wabaId !== wabaRow.id) {
      throw new Error('phone_number_id already registered under another WABA');
    }
    return { wabaId: wabaRow.id, phoneRowId: existingPhone.id };
  }

  const phoneRowId = randomId12();
  await db.insert(phoneNumbers).values({
    id: phoneRowId,
    wabaId: wabaRow.id,
    metaPhoneNumberId,
    displayPhoneNumber: metaPhoneNumberId,
    displayName: null,
    displayNameStatus: 'pending',
    verifiedName: null,
    qualityRating: null,
    messagingLimitTier: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { wabaId: wabaRow.id, phoneRowId };
}
