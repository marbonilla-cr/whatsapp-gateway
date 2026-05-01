import { Router, type Request, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { messages } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  app_id: z.string().optional(),
});

export function createMessagesAdminRouter(getDb: () => AppDb) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);
  r.use(requireTenantAccess('tenant_id'));
  r.use(requireRole('super_admin', 'tenant_admin', 'tenant_operator'));

  r.get('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const { limit, offset, app_id: appId } = parsed.data;
    const db = getDb();
    const whereClause = appId
      ? and(eq(messages.tenantId, tenantId), eq(messages.appId, appId))
      : eq(messages.tenantId, tenantId);
    const rows = await db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);
    res.json({ data: rows, limit, offset });
  });

  return r;
}
