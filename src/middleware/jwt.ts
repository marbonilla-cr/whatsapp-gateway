import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AccessTokenPayload, JwtRole } from '../services/auth';
import { verifyAccessToken } from '../services/auth';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED' as const, message: 'Missing or invalid Authorization header' },
    });
    return;
  }
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
}

export function requireRole(...roles: JwtRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = req.adminUser;
    if (!u) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Authentication required' },
      });
      return;
    }
    if (!roles.includes(u.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'Insufficient role' },
      });
      return;
    }
    next();
  };
}

export function requireTenantAccess(paramName = 'tenant_id'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = req.adminUser;
    if (!u) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Authentication required' },
      });
      return;
    }
    if (u.role === 'super_admin') {
      next();
      return;
    }
    const paramTenant = req.params[paramName];
    if (!paramTenant || paramTenant !== u.tenantId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'Tenant scope mismatch' },
      });
      return;
    }
    next();
  };
}
