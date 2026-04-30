import type { AppDb } from '../db';
import { apps, phoneNumbers, tenants, wabas } from '../db/schema';
import { DEFAULT_CLIENT_TENANT_ID } from '../db/constants';
import { encryptToken, hashApiKey, apiKeyPrefixFromFullKey, randomId12 } from '../services/crypto';

export async function ensureDefaultTenant(db: AppDb): Promise<void> {
  const now = new Date();
  await db
    .insert(tenants)
    .values({
      id: DEFAULT_CLIENT_TENANT_ID,
      businessName: 'Antigua Lechería',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'contacto@antigualecheria.invalid',
      plan: 'starter',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: tenants.id });
}

export async function createTestApp(
  db: AppDb,
  opts: {
    apiKey: string;
    encryptionKey: string;
    appId?: string;
    name?: string;
    metaPhoneNumberId?: string;
    metaWabaId?: string;
    tenantId?: string;
  }
): Promise<void> {
  await ensureDefaultTenant(db);
  const tenantId = opts.tenantId ?? DEFAULT_CLIENT_TENANT_ID;
  const now = new Date();
  const metaWabaId = opts.metaWabaId ?? 'waba-test';
  const metaPhone = opts.metaPhoneNumberId ?? '123456789';

  const wabaId = randomId12();
  await db.insert(wabas).values({
    id: wabaId,
    tenantId,
    metaWabaId,
    metaBusinessId: null,
    accessTokenEncrypted: encryptToken('token-plain', opts.encryptionKey),
    tokenExpiresAt: null,
    webhookSubscribedAt: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const phoneId = randomId12();
  await db.insert(phoneNumbers).values({
    id: phoneId,
    wabaId,
    metaPhoneNumberId: metaPhone,
    displayPhoneNumber: metaPhone,
    displayName: null,
    displayNameStatus: 'pending',
    verifiedName: null,
    qualityRating: null,
    messagingLimitTier: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(apps).values({
    id: opts.appId ?? 'appidfortest',
    tenantId,
    phoneNumberId: phoneId,
    name: opts.name ?? 'Test',
    vertical: 'custom',
    callbackUrl: 'https://example.com/cb',
    apiKeyHash: hashApiKey(opts.apiKey),
    apiKeyPrefix: apiKeyPrefixFromFullKey(opts.apiKey),
    configJson: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}
