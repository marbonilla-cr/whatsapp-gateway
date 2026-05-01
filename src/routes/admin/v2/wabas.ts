import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db';
import { phoneNumbers, wabas } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';
import { getMetaApiClient, MetaApiError } from '../../../services/meta';

const requestCodeBody = z.object({
  code_method: z.enum(['SMS', 'VOICE']),
  language: z.string().min(2).optional(),
});

const verifyCodeBody = z.object({
  code: z.string().min(4).max(10),
});

const registerPhoneBody = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

const twoStepBody = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

const profileBody = z.object({
  name: z.string().min(1).max(128),
});

export function createWabasAdminRouter(getDb: () => AppDb, encryptionKey: string) {
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

  async function resolvePhoneForWaba(tenantId: string, wabaId: string, phoneRowId: string) {
    const waba = (
      await getDb()
        .select()
        .from(wabas)
        .where(and(eq(wabas.id, wabaId), eq(wabas.tenantId, tenantId)))
        .limit(1)
    )[0];
    if (!waba) return null;
    const phone = (
      await getDb()
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.id, phoneRowId), eq(phoneNumbers.wabaId, waba.id)))
        .limit(1)
    )[0];
    if (!phone) return null;
    return { waba, phone };
  }

  r.post('/:waba_id/phones/:phone_id/request-code', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const phoneId = req.params.phone_id;
    const parsed = requestCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const resolved = await resolvePhoneForWaba(tenantId, wabaId, phoneId);
    if (!resolved) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Phone or WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: resolved.waba.id, encryptionKey });
      await client.requestVerificationCode(
        resolved.phone.metaPhoneNumberId,
        parsed.data.code_method,
        parsed.data.language ?? 'en_US'
      );
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        res.status(422).json({ error: { code: 'META_ERROR' as const, message: error.message } });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message: error instanceof Error ? error.message : 'Unknown' },
      });
    }
  });

  r.post('/:waba_id/phones/:phone_id/verify-code', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const phoneId = req.params.phone_id;
    const parsed = verifyCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const resolved = await resolvePhoneForWaba(tenantId, wabaId, phoneId);
    if (!resolved) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Phone or WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: resolved.waba.id, encryptionKey });
      await client.verifyCode(resolved.phone.metaPhoneNumberId, parsed.data.code);
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        res.status(422).json({ error: { code: 'META_ERROR' as const, message: error.message } });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message: error instanceof Error ? error.message : 'Unknown' },
      });
    }
  });

  r.post('/:waba_id/phones/:phone_id/register', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const phoneId = req.params.phone_id;
    const parsed = registerPhoneBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const resolved = await resolvePhoneForWaba(tenantId, wabaId, phoneId);
    if (!resolved) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Phone or WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: resolved.waba.id, encryptionKey });
      await client.registerPhone(resolved.phone.metaPhoneNumberId, parsed.data.pin);
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        res.status(422).json({ error: { code: 'META_ERROR' as const, message: error.message } });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message: error instanceof Error ? error.message : 'Unknown' },
      });
    }
  });

  r.post('/:waba_id/phones/:phone_id/two-step', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const phoneId = req.params.phone_id;
    const parsed = twoStepBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const resolved = await resolvePhoneForWaba(tenantId, wabaId, phoneId);
    if (!resolved) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Phone or WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: resolved.waba.id, encryptionKey });
      await client.setTwoStepPin(resolved.phone.metaPhoneNumberId, parsed.data.pin);
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        res.status(422).json({ error: { code: 'META_ERROR' as const, message: error.message } });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message: error instanceof Error ? error.message : 'Unknown' },
      });
    }
  });

  r.patch('/:waba_id/phones/:phone_id/profile', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = req.params.waba_id;
    const phoneId = req.params.phone_id;
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    const resolved = await resolvePhoneForWaba(tenantId, wabaId, phoneId);
    if (!resolved) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Phone or WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: resolved.waba.id, encryptionKey });
      await client.updateProfileName(resolved.phone.metaPhoneNumberId, parsed.data.name);
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        res.status(422).json({ error: { code: 'META_ERROR' as const, message: error.message } });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message: error instanceof Error ? error.message : 'Unknown' },
      });
    }
  });

  return r;
}
