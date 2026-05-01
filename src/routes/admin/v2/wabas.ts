import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../../../db';
import { phoneNumbers, wabas } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';

export function createWabasAdminRouter(getDb: () => AppDb) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);
  r.use(requireTenantAccess('tenant_id'));
  r.use(requireRole('super_admin', 'tenant_admin', 'tenant_operator'));

  r.get('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const rows = await getDb().select().from(wabas).where(eq(wabas.tenantId, tenantId));
    res.json(
      rows.map((w) => ({
        id: w.id,
        tenantId: w.tenantId,
        metaWabaId: w.metaWabaId,
        metaBusinessId: w.metaBusinessId,
        status: w.status,
        tokenExpiresAt: w.tokenExpiresAt,
        webhookSubscribedAt: w.webhookSubscribedAt,
        errorMessage: w.errorMessage,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      }))
    );
  });

  r.get('/:waba_id/phones', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const waba = (
      await getDb()
        .select()
        .from(wabas)
        .where(and(eq(wabas.id, wabaId), eq(wabas.tenantId, tenantId)))
        .limit(1)
    )[0];
    if (!waba) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'WABA not found' } });
      return;
    }
    const phones = await getDb().select().from(phoneNumbers).where(eq(phoneNumbers.wabaId, waba.id));
    res.json(phones);
  });

  return r;
}
