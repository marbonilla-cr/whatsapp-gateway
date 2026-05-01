import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { apps, phoneNumbers, tenants, wabas } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';
import { encryptToken, generateApiKey, hashApiKey, apiKeyPrefixFromFullKey, randomId12 } from '../../../services/crypto';
import { ensureWabaAndPhone, listAppPublic, patchAppPublic } from '../helpers';

const createAppBody = z.object({
  name: z.string().min(1),
  callbackUrl: z.string().url(),
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1),
  metaAccessToken: z.string().min(1),
});

const patchAppBody = z.object({
  name: z.string().min(1).optional(),
  callbackUrl: z.string().url().optional(),
  phoneNumberId: z.string().min(1).optional(),
  wabaId: z.string().min(1).optional(),
  metaAccessToken: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export function createAppsV2Router(getDb: () => AppDb, encryptionKey: string) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);
  r.use(requireTenantAccess('tenant_id'));
  r.use(requireRole('super_admin', 'tenant_admin', 'tenant_operator'));

  r.get('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const db = getDb();
    const rows = await db
      .select({
        app: apps,
        metaPhoneNumberId: phoneNumbers.metaPhoneNumberId,
        metaWabaId: wabas.metaWabaId,
      })
      .from(apps)
      .innerJoin(phoneNumbers, eq(apps.phoneNumberId, phoneNumbers.id))
      .innerJoin(wabas, eq(phoneNumbers.wabaId, wabas.id))
      .where(eq(apps.tenantId, tenantId));
    res.json(rows.map(({ app, metaPhoneNumberId, metaWabaId }) => listAppPublic(app, metaPhoneNumberId, metaWabaId)));
  });

  r.post('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const parsed = createAppBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: JSON.stringify(parsed.error.flatten()),
        },
      });
      return;
    }
    const db = getDb();
    const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenantRows[0]) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: `Unknown tenantId: ${tenantId}` },
      });
      return;
    }

    const now = new Date();
    const encrypted = encryptToken(parsed.data.metaAccessToken, encryptionKey);

    let phoneRowId: string;
    try {
      const out = await ensureWabaAndPhone(
        db,
        tenantId,
        parsed.data.wabaId,
        parsed.data.phoneNumberId,
        encrypted,
        now
      );
      phoneRowId = out.phoneRowId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }

    const id = randomId12();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = apiKeyPrefixFromFullKey(apiKey);
    try {
      await db.insert(apps).values({
        id,
        tenantId,
        phoneNumberId: phoneRowId,
        name: parsed.data.name,
        vertical: 'custom',
        callbackUrl: parsed.data.callbackUrl,
        apiKeyHash,
        apiKeyPrefix,
        configJson: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }
    res.status(201).json({
      id,
      tenantId,
      name: parsed.data.name,
      apiKey,
      apiKeyPrefix,
      phoneNumberId: parsed.data.phoneNumberId,
      createdAt: now.toISOString(),
    });
  });

  r.patch('/:app_id', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const { app_id: id } = req.params;
    const parsed = patchAppBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: JSON.stringify(parsed.error.flatten()),
        },
      });
      return;
    }
    const db = getDb();
    const existing = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id!), eq(apps.tenantId, tenantId)))
      .limit(1);
    const row = existing[0];
    if (!row) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const now = new Date();
    const updates: Partial<typeof apps.$inferInsert> = { updatedAt: now };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.callbackUrl !== undefined) updates.callbackUrl = parsed.data.callbackUrl;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    const wantsPhoneChange = parsed.data.phoneNumberId !== undefined || parsed.data.wabaId !== undefined;
    if (wantsPhoneChange) {
      const metaPhone = parsed.data.phoneNumberId;
      const metaWaba = parsed.data.wabaId;
      if (!metaPhone || !metaWaba) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'Both phoneNumberId and wabaId are required to change routing',
          },
        });
        return;
      }
      const tokenPlain = parsed.data.metaAccessToken;
      if (!tokenPlain) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'metaAccessToken is required when changing phoneNumberId/wabaId',
          },
        });
        return;
      }
      const enc = encryptToken(tokenPlain, encryptionKey);
      try {
        const { phoneRowId } = await ensureWabaAndPhone(db, row.tenantId, metaWaba, metaPhone, enc, now);
        updates.phoneNumberId = phoneRowId;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Update failed';
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR' as const, message: msg },
        });
        return;
      }
    } else if (parsed.data.metaAccessToken !== undefined) {
      const phone = (
        await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, row.phoneNumberId)).limit(1)
      )[0];
      if (phone) {
        const enc = encryptToken(parsed.data.metaAccessToken, encryptionKey);
        await db.update(wabas).set({ accessTokenEncrypted: enc, updatedAt: now }).where(eq(wabas.id, phone.wabaId));
      }
    }

    try {
      await db.update(apps).set(updates).where(eq(apps.id, id!));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }
    const updated = (await db.select().from(apps).where(eq(apps.id, id!)).limit(1))[0]!;
    const phoneJoin = (
      await db
        .select({ metaPhoneNumberId: phoneNumbers.metaPhoneNumberId, metaWabaId: wabas.metaWabaId })
        .from(phoneNumbers)
        .innerJoin(wabas, eq(phoneNumbers.wabaId, wabas.id))
        .where(eq(phoneNumbers.id, updated.phoneNumberId))
        .limit(1)
    )[0];
    res.json(patchAppPublic(updated, phoneJoin?.metaPhoneNumberId, phoneJoin?.metaWabaId));
  });

  r.post('/:app_id/rotate-key', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const id = req.params.app_id;
    const db = getDb();
    const existing = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id!), eq(apps.tenantId, tenantId)))
      .limit(1);
    const row = existing[0];
    if (!row) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = apiKeyPrefixFromFullKey(apiKey);
    const now = new Date();
    await db
      .update(apps)
      .set({ apiKeyHash, apiKeyPrefix, updatedAt: now })
      .where(eq(apps.id, id!));
    res.json({ apiKey });
  });

  r.delete('/:app_id', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const id = req.params.app_id;
    const db = getDb();
    const existing = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id!), eq(apps.tenantId, tenantId)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const now = new Date();
    await db.update(apps).set({ isActive: false, updatedAt: now }).where(eq(apps.id, id!));
    res.status(204).send();
  });

  return r;
}
