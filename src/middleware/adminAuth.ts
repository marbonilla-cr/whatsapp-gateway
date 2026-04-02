import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function createAdminAuthMiddleware(adminSecret: string) {
  return function adminAuth(req: Request, res: Response, next: NextFunction) {
    const provided = req.header('X-Admin-Secret');
    if (!provided) {
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'Missing X-Admin-Secret header' },
      });
      return;
    }
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(adminSecret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'Invalid admin secret' },
      });
      return;
    }
    next();
  };
}
