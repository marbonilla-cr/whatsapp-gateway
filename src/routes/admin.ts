import { Router, type Request, type Response, type NextFunction } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db';
import { apps, messages, phoneNumbers, tenants, wabas } from '../db/schema';
import { DEFAULT_CLIENT_TENANT_ID } from '../db/constants';
import { encryptToken, generateApiKey, hashApiKey, apiKeyPrefixFromFullKey, randomId12 } from '../services/crypto';
import { ensureWabaAndPhone, listAppPublic, patchAppPublic } from './admin/helpers';

const createAppBody = z.object({
  tenantId: z.string().min(1).optional(),
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

export function createAdminRouter(
  getDb: () => AppDb,
  encryptionKey: string,
  adminAuth: (req: Request, res: Response, next: NextFunction) => void
) {
  const r = Router();
  r.use(adminAuth);

  r.get('/logs', async (_req: Request, res: Response) => {
    const rows = await getDb()
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(50);
    res.json(rows);
  });

  r.post('/apps', async (req: Request, res: Response) => {
    const parsed = createAppBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: parsed.error.flatten().fieldErrors
            ? JSON.stringify(parsed.error.flatten().fieldErrors)
            : 'Invalid body',
        },
      });
      return;
    }
    const tenantId = parsed.data.tenantId ?? DEFAULT_CLIENT_TENANT_ID;
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

  r.get('/apps', async (_req: Request, res: Response) => {
    const db = getDb();
    const rows = await db
      .select({
        app: apps,
        metaPhoneNumberId: phoneNumbers.metaPhoneNumberId,
        metaWabaId: wabas.metaWabaId,
      })
      .from(apps)
      .innerJoin(phoneNumbers, eq(apps.phoneNumberId, phoneNumbers.id))
      .innerJoin(wabas, eq(phoneNumbers.wabaId, wabas.id));
    res.json(rows.map(({ app, metaPhoneNumberId, metaWabaId }) => listAppPublic(app, metaPhoneNumberId, metaWabaId)));
  });

  r.patch('/apps/:id', async (req: Request, res: Response) => {
    const parsed = patchAppBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: parsed.error.flatten().fieldErrors
            ? JSON.stringify(parsed.error.flatten().fieldErrors)
            : 'Invalid body',
        },
      });
      return;
    }
    const { id } = req.params;
    const db = getDb();
    const existing = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
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

    if (parsed.data.metaAccessToken !== undefined) {
      const phone = (
        await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, row.phoneNumberId)).limit(1)
      )[0];
      if (phone) {
        const enc = encryptToken(parsed.data.metaAccessToken, encryptionKey);
        await db.update(wabas).set({ accessTokenEncrypted: enc, updatedAt: now }).where(eq(wabas.id, phone.wabaId));
      }
    }

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
    }

    try {
      await db.update(apps).set(updates).where(eq(apps.id, id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }
    const updated = (await db.select().from(apps).where(eq(apps.id, id)).limit(1))[0]!;
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

  r.post('/apps/:id/rotate-key', async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    const existing = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
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
      .where(eq(apps.id, id));
    res.json({ apiKey });
  });

  r.delete('/apps/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    const existing = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    if (!existing[0]) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const now = new Date();
    await db.update(apps).set({ isActive: false, updatedAt: now }).where(eq(apps.id, id));
    res.status(204).send();
  });

  return r;
}
