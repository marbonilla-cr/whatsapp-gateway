import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db';
import { tenantUsers } from '../db/schema';
import {
  bootstrapSuperAdmin,
  generateAccessToken,
  generateRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../services/auth';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({
  refresh: z.string().min(1),
});

function publicUser(row: typeof tenantUsers.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    tenantId: row.tenantId,
    role: row.role,
  };
}

export function createAuthRouter(getDb: () => AppDb) {
  const r = Router();

  r.post('/login', async (req: Request, res: Response) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: 'Invalid email or password payload' },
      });
      return;
    }
    const db = getDb();
    await bootstrapSuperAdmin(db);

    const email = parsed.data.email.trim().toLowerCase();
    const rows = await db.select().from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1);
    const user = rows[0];
    if (!user || !user.isActive) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Invalid credentials' },
      });
      return;
    }
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Invalid credentials' },
      });
      return;
    }

    const access = generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'super_admin' | 'tenant_admin' | 'tenant_operator',
    });
    const refresh = generateRefreshToken(user.id);
    res.json({ access, refresh, user: publicUser(user) });
  });

  r.post('/refresh', async (req: Request, res: Response) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: 'Invalid refresh body' },
      });
      return;
    }
    const sub = verifyRefreshToken(parsed.data.refresh);
    if (!sub) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'Invalid refresh token' },
      });
      return;
    }
    const db = getDb();
    const rows = await db.select().from(tenantUsers).where(eq(tenantUsers.id, sub.userId)).limit(1);
    const user = rows[0];
    if (!user || !user.isActive) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED' as const, message: 'User not found' },
      });
      return;
    }
    const access = generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'super_admin' | 'tenant_admin' | 'tenant_operator',
    });
    res.json({ access });
  });

  r.post('/logout', (_req: Request, res: Response) => {
    res.status(204).send();
  });

  return r;
}
