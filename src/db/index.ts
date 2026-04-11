import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

let sqlite: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureDataDir(dbPath: string): void {
  if (dbPath === ':memory:' || dbPath.startsWith('file:memdb')) {
    return;
  }
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** FK target for logs sin app registrada (`app_id = 'unknown'`). Idempotente. */
function ensureDiagnosticUnknownApp(database: Database.Database): void {
  database.exec(`
INSERT OR IGNORE INTO apps (
  id, name, api_key_hash, api_key_prefix, callback_url,
  phone_number_id, waba_id, meta_access_token, is_active, created_at, updated_at
) VALUES (
  'unknown',
  '__diagnostic_unknown_app__',
  '3f943f629e65568a816d5803b4c1b318e498341cc96498480b99a93f512725b5',
  'diag',
  'https://example.invalid/gateway-diagnostic-placeholder',
  '__gateway_diagnostic_unknown_phone__',
  '__gateway_diagnostic_unknown_waba__',
  '__not_used__',
  0,
  '1970-01-01T00:00:00.000Z',
  '1970-01-01T00:00:00.000Z'
);
`);
}

export function getDb(databaseUrl: string) {
  if (dbInstance) {
    return dbInstance;
  }
  const fileForSqlite = databaseUrl === ':memory:' ? ':memory:' : path.resolve(databaseUrl);
  ensureDataDir(databaseUrl === ':memory:' ? ':memory:' : fileForSqlite);
  sqlite = new Database(fileForSqlite);
  sqlite.pragma('journal_mode = WAL');
  dbInstance = drizzle(sqlite, { schema });
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  if (fs.existsSync(migrationsFolder)) {
    migrate(dbInstance, { migrationsFolder });
  }
  ensureDiagnosticUnknownApp(sqlite);
  return dbInstance;
}

export function resetDbSingleton(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
  }
}

export { schema };
