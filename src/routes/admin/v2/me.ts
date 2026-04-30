import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../../../db';
import { tenantUsers } from '../../../db/schema';
import { requireAuth } from '../../../middleware/jwt';

export function createMeRouter(getDb: () => AppDb) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req: Request, res: Response) => {
    const u = req.adminUser!;
    const rows = await getDb().select().from(tenantUsers).where(eq(tenantUsers.id, u.userId)).limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'User not found' } });
      return;
    }
    res.json({
      id: row.id,
      email: row.email,
      tenantId: row.tenantId,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
    });
  });

  return r;
}
