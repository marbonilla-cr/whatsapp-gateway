import { Router, type Request, type Response } from 'express';
import { and, desc, eq, gte, lte, SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { auditLog } from '../../../db/schema';
import { requireAuth, requireRole } from '../../../middleware/jwt';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  action: z.string().optional(),
  actor_user_id: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function createAuditLogAdminRouter(getDb: () => AppDb) {
  const r = Router();
  r.use(requireAuth);
  r.use(requireRole('super_admin', 'tenant_admin', 'tenant_operator'));

  r.get('/', async (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const u = req.adminUser!;
    const { limit, offset, action, actor_user_id: actorUserId, from, to } = parsed.data;
    const db = getDb();

    const filters: SQL[] = [];
    if (u.role !== 'super_admin') {
      filters.push(eq(auditLog.tenantId, u.tenantId));
    }
    if (action) {
      filters.push(eq(auditLog.action, action));
    }
    if (actorUserId) {
      filters.push(eq(auditLog.actorUserId, actorUserId));
    }
    if (from) {
      filters.push(gte(auditLog.createdAt, new Date(from)));
    }
    if (to) {
      filters.push(lte(auditLog.createdAt, new Date(to)));
    }

    const whereClause = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

    const rows = whereClause
      ? await db
          .select()
          .from(auditLog)
          .where(whereClause)
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(auditLog)
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .offset(offset);

    res.json({ data: rows, limit, offset });
  });

  return r;
}
