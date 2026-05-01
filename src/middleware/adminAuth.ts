import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { verifyAccessToken } from '../services/auth';

/**
 * Accepts JWT Bearer (preferred) or legacy `X-Admin-Secret` during transition.
 */
export function createAdminAuthMiddleware(adminSecret: string, log?: Logger) {
  return function adminAuth(req: Request, res: Response, next: NextFunction): void {
    const auth = req.header('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();
      const payload = verifyAccessToken(token);
      if (!payload) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED' as const, message: 'Invalid or expired access token' },
        });
        return;
      }
      req.adminUser = payload;
      next();
      return;
    }

    const provided = req.header('X-Admin-Secret');
    if (!provided) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Missing X-Admin-Secret or Bearer token' },
      });
      return;
    }
    log?.warn({ path: req.path }, 'deprecated auth: X-Admin-Secret (use JWT login)');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(adminSecret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Invalid admin secret' },
      });
      return;
    }
    next();
  };
}
