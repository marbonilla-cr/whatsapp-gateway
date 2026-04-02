import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema';
import { apps } from '../db/schema';

const startTime = Date.now();

function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function createHealthRouter(getDb: () => BetterSQLite3Database<typeof schema>) {
  const r = Router();

  r.get('/', (_req: Request, res: Response) => {
    let dbStatus: 'ok' | 'error' = 'error';
    try {
      getDb().select().from(apps).limit(1).all();
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: readVersion(),
      db: dbStatus,
    });
  });

  return r;
}
