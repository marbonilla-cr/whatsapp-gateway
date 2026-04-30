import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { tenants } from '../../../db/schema';
import { requireAuth, requireRole } from '../../../middleware/jwt';
import { randomId12 } from '../../../services/crypto';

const createTenant = z.object({
  businessName: z.string().min(1),
  legalName: z.string().optional(),
  countryCode: z.string().min(2).max(4).default('CR'),
  contactEmail: z.string().email(),
  plan: z.string().optional(),
});

const patchTenant = z.object({
  businessName: z.string().min(1).optional(),
  legalName: z.string().nullable().optional(),
  countryCode: z.string().min(2).max(4).optional(),
  contactEmail: z.string().email().optional(),
  plan: z.string().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export function createTenantsAdminRouter(getDb: () => AppDb) {
  const r = Router();
  r.use(requireAuth);
  r.use(requireRole('super_admin'));

  r.get('/', async (_req: Request, res: Response) => {
    const rows = await getDb().select().from(tenants);
    res.json(rows);
  });

  r.post('/', async (req: Request, res: Response) => {
    const parsed = createTenant.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const now = new Date();
    const id = randomId12();
    try {
      await getDb().insert(tenants).values({
        id,
        businessName: parsed.data.businessName,
        legalName: parsed.data.legalName ?? null,
        countryCode: parsed.data.countryCode,
        contactEmail: parsed.data.contactEmail,
        plan: parsed.data.plan ?? 'starter',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: msg } });
      return;
    }
    const created = (await getDb().select().from(tenants).where(eq(tenants.id, id)).limit(1))[0]!;
    res.status(201).json(created);
  });

  r.get('/:tenant_id', async (req: Request, res: Response) => {
    const row = (await getDb().select().from(tenants).where(eq(tenants.id, req.params.tenant_id)).limit(1))[0];
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Tenant not found' } });
      return;
    }
    res.json(row);
  });

  r.patch('/:tenant_id', async (req: Request, res: Response) => {
    const parsed = patchTenant.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const existing = (await getDb().select().from(tenants).where(eq(tenants.id, req.params.tenant_id)).limit(1))[0];
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Tenant not found' } });
      return;
    }
    const now = new Date();
    const updates: Partial<typeof tenants.$inferInsert> = { updatedAt: now };
    const d = parsed.data;
    if (d.businessName !== undefined) updates.businessName = d.businessName;
    if (d.legalName !== undefined) updates.legalName = d.legalName;
    if (d.countryCode !== undefined) updates.countryCode = d.countryCode;
    if (d.contactEmail !== undefined) updates.contactEmail = d.contactEmail;
    if (d.plan !== undefined) updates.plan = d.plan;
    if (d.status !== undefined) updates.status = d.status;
    try {
      await getDb().update(tenants).set(updates).where(eq(tenants.id, req.params.tenant_id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: msg } });
      return;
    }
    const updated = (await getDb().select().from(tenants).where(eq(tenants.id, req.params.tenant_id)).limit(1))[0]!;
    res.json(updated);
  });

  r.delete('/:tenant_id', async (req: Request, res: Response) => {
    const existing = (await getDb().select().from(tenants).where(eq(tenants.id, req.params.tenant_id)).limit(1))[0];
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Tenant not found' } });
      return;
    }
    const now = new Date();
    await getDb().update(tenants).set({ status: 'suspended', updatedAt: now }).where(eq(tenants.id, req.params.tenant_id));
    res.status(204).send();
  });

  return r;
}
