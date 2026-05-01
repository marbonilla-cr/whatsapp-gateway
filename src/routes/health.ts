import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AppDb } from '../db';
import { tenants } from '../db/schema';
import { pingRedis } from '../queue';

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

export function createHealthRouter(getDb: () => AppDb) {
  const r = Router();

  r.get('/', async (_req: Request, res: Response) => {
    let dbStatus: 'ok' | 'error' = 'error';
    try {
      await getDb().select().from(tenants).limit(1);
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }
    const redis = await pingRedis();
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: readVersion(),
      db: dbStatus,
      redis,
    });
  });

  return r;
}
