import { initDb, getDb, resetDbSingleton } from './index';
import { tenants } from './schema';
import { DEFAULT_CLIENT_TENANT_ID, TENANT_MBCSOFT_ID } from './constants';

/**
 * Bootstrap core tenants. Idempotent.
 * Call after `initDb` / `initDbWithPool`.
 */
export async function seedTenants(): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db
    .insert(tenants)
    .values({
      id: TENANT_MBCSOFT_ID,
      businessName: 'MBCSOFT',
      legalName: 'MBCSOFT S.A.',
      countryCode: 'CR',
      contactEmail: 'ops@mbcsoft.com',
      plan: 'enterprise',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: tenants.id });

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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  await initDb(url);
  await seedTenants();
  console.log('Seed completed: tenants ensured (MBCSOFT, Antigua Lechería).');
  await resetDbSingleton();
}

if (require.main === module) {
  void main();
}
