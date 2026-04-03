import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema';
import { apps } from '../db/schema';
import {
  encryptToken,
  generateApiKey,
  hashApiKey,
  apiKeyPrefixFromFullKey,
  randomId12,
} from '../services/crypto';

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

type AppRow = InferSelectModel<typeof apps>;

function listAppPublic(row: AppRow) {
  return {
    id: row.id,
    name: row.name,
    apiKeyPrefix: row.apiKeyPrefix,
    callbackUrl: row.callbackUrl,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function patchAppPublic(row: AppRow) {
  return { ...listAppPublic(row), updatedAt: row.updatedAt };
}

export function createAdminRouter(
  getDb: () => BetterSQLite3Database<typeof schema>,
  encryptionKey: string,
  adminAuth: (req: Request, res: Response, next: NextFunction) => void
) {
  const r = Router();
  r.use(adminAuth);

  r.post('/apps', (req: Request, res: Response) => {
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
    const db = getDb();
    const now = new Date().toISOString();
    const id = randomId12();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = apiKeyPrefixFromFullKey(apiKey);
    const encrypted = encryptToken(parsed.data.metaAccessToken, encryptionKey);
    try {
      db.insert(apps)
        .values({
          id,
          name: parsed.data.name,
          apiKeyHash,
          apiKeyPrefix,
          callbackUrl: parsed.data.callbackUrl,
          phoneNumberId: parsed.data.phoneNumberId,
          wabaId: parsed.data.wabaId,
          metaAccessToken: encrypted,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }
    res.status(201).json({
      id,
      name: parsed.data.name,
      apiKey,
      apiKeyPrefix,
      phoneNumberId: parsed.data.phoneNumberId,
      createdAt: now,
    });
  });

  r.get('/apps', (_req: Request, res: Response) => {
    const rows = getDb().select().from(apps).all();
    res.json(rows.map((row) => listAppPublic(row)));
  });

  r.patch('/apps/:id', (req: Request, res: Response) => {
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
    const existing = db.select().from(apps).where(eq(apps.id, id)).limit(1).all();
    const row = existing[0];
    if (!row) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const now = new Date().toISOString();
    const updates: Partial<typeof apps.$inferInsert> = { updatedAt: now };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.callbackUrl !== undefined) updates.callbackUrl = parsed.data.callbackUrl;
    if (parsed.data.phoneNumberId !== undefined) updates.phoneNumberId = parsed.data.phoneNumberId;
    if (parsed.data.wabaId !== undefined) updates.wabaId = parsed.data.wabaId;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.metaAccessToken !== undefined) {
      updates.metaAccessToken = encryptToken(parsed.data.metaAccessToken, encryptionKey);
    }
    try {
      db.update(apps).set(updates).where(eq(apps.id, id)).run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: msg },
      });
      return;
    }
    const updated = db.select().from(apps).where(eq(apps.id, id)).limit(1).all()[0];
    res.json(patchAppPublic(updated));
  });

  r.post('/apps/:id/rotate-key', (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    const existing = db.select().from(apps).where(eq(apps.id, id)).limit(1).all();
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
    const now = new Date().toISOString();
    db.update(apps)
      .set({ apiKeyHash, apiKeyPrefix, updatedAt: now })
      .where(eq(apps.id, id))
      .run();
    res.json({ apiKey });
  });

  r.delete('/apps/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    const existing = db.select().from(apps).where(eq(apps.id, id)).limit(1).all();
    if (!existing[0]) {
      res.status(404).json({
        error: { code: 'NOT_FOUND' as const, message: 'App not found' },
      });
      return;
    }
    const now = new Date().toISOString();
    db.update(apps).set({ isActive: false, updatedAt: now }).where(eq(apps.id, id)).run();
    res.status(204).send();
  });

  return r;
}
