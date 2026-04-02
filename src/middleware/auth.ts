import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema';
import { apps } from '../db/schema';
import { hashApiKey } from '../services/crypto';

export function createGatewayAuthMiddleware(
  getDb: () => BetterSQLite3Database<typeof schema>
) {
  return function gatewayAuth(req: Request, res: Response, next: NextFunction) {
    const key = req.header('X-Gateway-Key');
    if (!key) {
      res.status(401).json({
        error: { code: 'INVALID_API_KEY' as const, message: 'Missing X-Gateway-Key header' },
      });
      return;
    }
    const hash = hashApiKey(key);
    const db = getDb();
    const row = db.select().from(apps).where(eq(apps.apiKeyHash, hash)).limit(1).all();
    const appRow = row[0];
    if (!appRow || !appRow.isActive) {
      res.status(401).json({
        error: { code: 'INVALID_API_KEY' as const, message: 'Invalid or inactive API key' },
      });
      return;
    }
    req.gatewayApp = appRow;
    next();
  };
}
