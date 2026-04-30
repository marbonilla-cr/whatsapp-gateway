import { PGlite } from '@electric-sql/pglite';
import { initDbWithPglite, resetDbSingleton } from '../db';
import { seedTenants } from '../db/seed';

export async function setupTestPgMem(): Promise<void> {
  await resetDbSingleton();
  const client = new PGlite();
  await initDbWithPglite(client);
  await seedTenants();
}

export async function teardownTestPgMem(): Promise<void> {
  await resetDbSingleton();
}
