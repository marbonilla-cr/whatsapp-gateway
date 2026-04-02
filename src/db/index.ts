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
