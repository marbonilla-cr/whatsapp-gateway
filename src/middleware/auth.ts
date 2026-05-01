import type { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { apps, phoneNumbers, wabas } from '../db/schema';
import { hashApiKey } from '../services/crypto';

export function createGatewayAuthMiddleware(getDb: () => AppDb) {
  return async function gatewayAuth(req: Request, res: Response, next: NextFunction) {
    const key = req.header('X-Gateway-Key');
    if (!key) {
      res.status(401).json({
        error: { code: 'INVALID_API_KEY' as const, message: 'Missing X-Gateway-Key header' },
      });
      return;
    }
    const hash = hashApiKey(key);
    const db = getDb();
    const rows = await db
      .select({
        app: apps,
        wabaId: wabas.id,
        metaPhoneNumberId: phoneNumbers.metaPhoneNumberId,
        accessTokenEncrypted: wabas.accessTokenEncrypted,
      })
      .from(apps)
      .innerJoin(phoneNumbers, eq(apps.phoneNumberId, phoneNumbers.id))
      .innerJoin(wabas, eq(phoneNumbers.wabaId, wabas.id))
      .where(and(eq(apps.apiKeyHash, hash), eq(apps.isActive, true)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(401).json({
        error: { code: 'INVALID_API_KEY' as const, message: 'Invalid or inactive API key' },
      });
      return;
    }
    req.gatewayApp = {
      ...row.app,
      wabaId: row.wabaId,
      metaPhoneNumberId: row.metaPhoneNumberId,
      accessTokenEncrypted: row.accessTokenEncrypted,
    };
    next();
  };
}
