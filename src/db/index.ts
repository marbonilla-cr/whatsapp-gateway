import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';
import { apps, phoneNumbers, tenants, wabas } from './schema';

export type AppDb = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

let pool: Pool | null = null;
let pgliteClient: PGlite | null = null;
let dbInstance: AppDb | null = null;

const SYSTEM_TENANT_ID = 'tenant_system_internal';
const DIAG_WABA_ID = 'waba_system_diagnostic';
const DIAG_PHONE_ID = 'phone_system_diagnostic';
const UNKNOWN_APP_ID = 'unknown';

async function ensureDiagnosticUnknownApp(db: AppDb): Promise<void> {
  const now = new Date();
  await db
    .insert(tenants)
    .values({
      id: SYSTEM_TENANT_ID,
      businessName: '__system_internal__',
      legalName: null,
      countryCode: 'CR',
      contactEmail: 'system-internal@gateway.invalid',
      plan: 'enterprise',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: tenants.id });

  await db
    .insert(wabas)
    .values({
      id: DIAG_WABA_ID,
      tenantId: SYSTEM_TENANT_ID,
      metaWabaId: '__gateway_diagnostic_unknown_waba__',
      metaBusinessId: null,
      accessTokenEncrypted: '__not_used__',
      tokenExpiresAt: null,
      webhookSubscribedAt: null,
      status: 'active',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: wabas.id });

  await db
    .insert(phoneNumbers)
    .values({
      id: DIAG_PHONE_ID,
      wabaId: DIAG_WABA_ID,
      metaPhoneNumberId: '__gateway_diagnostic_unknown_phone__',
      displayPhoneNumber: '__diagnostic__',
      displayName: null,
      displayNameStatus: 'pending',
      verifiedName: null,
      qualityRating: null,
      messagingLimitTier: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: phoneNumbers.id });

  await db
    .insert(apps)
    .values({
      id: UNKNOWN_APP_ID,
      tenantId: SYSTEM_TENANT_ID,
      phoneNumberId: DIAG_PHONE_ID,
      name: '__diagnostic_unknown_app__',
      vertical: 'custom',
      callbackUrl: 'https://example.invalid/gateway-diagnostic-placeholder',
      apiKeyHash: '3f943f629e65568a816d5803b4c1b318e498341cc96498480b99a93f512725b5',
      apiKeyPrefix: 'diag',
      configJson: null,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: apps.id });
}

export async function initDb(databaseUrl: string): Promise<void> {
  if (dbInstance) {
    return;
  }
  pool = new PgPool({ connectionString: databaseUrl });
  dbInstance = drizzleNodePg(pool, { schema });
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  if (fs.existsSync(migrationsFolder)) {
    await migrateNodePg(dbInstance as NodePgDatabase<typeof schema>, { migrationsFolder });
  }
  await ensureDiagnosticUnknownApp(dbInstance);
}

/** Vitest: in-memory Postgres via PGlite + Drizzle migrator. */
export async function initDbWithPglite(client: PGlite): Promise<void> {
  if (dbInstance) {
    return;
  }
  pgliteClient = client;
  dbInstance = drizzlePglite(client, { schema });
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  if (fs.existsSync(migrationsFolder)) {
    await migratePglite(dbInstance as PgliteDatabase<typeof schema>, { migrationsFolder });
  }
  await ensureDiagnosticUnknownApp(dbInstance);
}

export function getDb(): AppDb {
  if (!dbInstance) {
    throw new Error('Database not initialized; call initDb first');
  }
  return dbInstance;
}

export async function resetDbSingleton(): Promise<void> {
  if (pgliteClient) {
    await pgliteClient.close();
    pgliteClient = null;
    dbInstance = null;
    return;
  }
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export { schema };
