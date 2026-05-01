import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { tenantUsers } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';
import { hashPassword } from '../../../services/auth';
import { randomId12 } from '../../../services/crypto';

const roleSchema = z.enum(['tenant_admin', 'tenant_operator']);

const createUser = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleSchema,
});

const patchUser = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});

export function createUsersAdminRouter(getDb: () => AppDb) {
  const r = Router({ mergeParams: true });
  const base = [requireAuth, requireTenantAccess('tenant_id')];

  r.get('/', ...base, requireRole('super_admin', 'tenant_admin', 'tenant_operator'), async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const u = req.adminUser!;
    if (u.role === 'tenant_admin' && u.tenantId !== tenantId) {
      res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Tenant scope mismatch' } });
      return;
    }
    const rows = await getDb().select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
    res.json(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        isActive: row.isActive,
        createdAt: row.createdAt,
      }))
    );
  });

  r.post('/', ...base, requireRole('super_admin', 'tenant_admin'), async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const u = req.adminUser!;
    if (u.role === 'tenant_admin' && u.tenantId !== tenantId) {
      res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Tenant scope mismatch' } });
      return;
    }
    const parsed = createUser.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    if (u.role === 'tenant_admin' && parsed.data.role !== 'tenant_operator') {
      res.status(403).json({
        error: { code: 'FORBIDDEN' as const, message: 'tenant_admin can only create tenant_operator users' },
      });
      return;
    }
    const id = randomId12();
    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      await getDb().insert(tenantUsers).values({
        id,
        tenantId,
        email: parsed.data.email.trim().toLowerCase(),
        passwordHash,
        role: parsed.data.role,
        isActive: true,
        createdAt: now,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: msg } });
      return;
    }
    res.status(201).json({ id, email: parsed.data.email.trim().toLowerCase(), role: parsed.data.role });
  });

  r.patch('/:user_id', ...base, requireRole('super_admin', 'tenant_admin'), async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const userId = req.params.user_id;
    const u = req.adminUser!;
    const existing = (
      await getDb()
        .select()
        .from(tenantUsers)
        .where(and(eq(tenantUsers.id, userId), eq(tenantUsers.tenantId, tenantId)))
        .limit(1)
    )[0];
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'User not found' } });
      return;
    }
    if (u.role === 'tenant_admin') {
      if (existing.role !== 'tenant_operator') {
        res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Can only manage operators' } });
        return;
      }
    }
    const parsed = patchUser.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const updates: Partial<typeof tenantUsers.$inferInsert> = {};
    if (parsed.data.email !== undefined) updates.email = parsed.data.email.trim().toLowerCase();
    if (parsed.data.password !== undefined) updates.passwordHash = await hashPassword(parsed.data.password);
    if (parsed.data.role !== undefined) {
      if (u.role === 'tenant_admin' && parsed.data.role !== 'tenant_operator') {
        res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Invalid role' } });
        return;
      }
      updates.role = parsed.data.role;
    }
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: 'No updates' } });
      return;
    }
    try {
      await getDb().update(tenantUsers).set(updates).where(eq(tenantUsers.id, userId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: msg } });
      return;
    }
    res.json({ ok: true });
  });

  r.delete('/:user_id', ...base, requireRole('super_admin', 'tenant_admin'), async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const userId = req.params.user_id;
    const u = req.adminUser!;
    const existing = (
      await getDb()
        .select()
        .from(tenantUsers)
        .where(and(eq(tenantUsers.id, userId), eq(tenantUsers.tenantId, tenantId)))
        .limit(1)
    )[0];
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'User not found' } });
      return;
    }
    if (existing.role === 'super_admin') {
      res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Cannot delete super_admin' } });
      return;
    }
    if (u.role === 'tenant_admin' && existing.role !== 'tenant_operator') {
      res.status(403).json({ error: { code: 'FORBIDDEN' as const, message: 'Can only delete operators' } });
      return;
    }
    await getDb().delete(tenantUsers).where(eq(tenantUsers.id, userId));
    res.status(204).send();
  });

  return r;
}
