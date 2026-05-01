import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../../../db';
import { wabas } from '../../../db/schema';
import { requireAuth, requireRole, requireTenantAccess } from '../../../middleware/jwt';
import { getMetaApiClient, MetaApiError } from '../../../services/meta';
import { TemplateInputSchema } from '../../v1/schemas/templates';

function toTemplateResponse(template: Record<string, unknown>) {
  const languageValue = template.language;
  const normalizedLanguage =
    typeof languageValue === 'string'
      ? languageValue
      : languageValue &&
          typeof languageValue === 'object' &&
          typeof (languageValue as { code?: unknown }).code === 'string'
        ? String((languageValue as { code: string }).code)
        : '';
  return {
    name: String(template.name ?? ''),
    language: normalizedLanguage,
    status: String(template.status ?? 'PENDING'),
    category: String(template.category ?? 'UTILITY'),
    components: Array.isArray(template.components) ? template.components : [],
    rejected_reason: template.rejected_reason ? String(template.rejected_reason) : null,
  };
}

export function createTemplatesAdminRouter(getDb: () => AppDb, encryptionKey: string) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);
  r.use(requireTenantAccess('tenant_id'));
  r.use(requireRole('super_admin', 'tenant_admin', 'tenant_operator'));

  async function resolveWaba(tenantId: string, wabaId: string) {
    const row = (
      await getDb()
        .select()
        .from(wabas)
        .where(and(eq(wabas.id, wabaId), eq(wabas.tenantId, tenantId)))
        .limit(1)
    )[0];
    return row;
  }

  r.get('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = typeof req.query.waba_id === 'string' ? req.query.waba_id : '';
    if (!wabaId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: 'waba_id query required' } });
      return;
    }
    const wabaRow = await resolveWaba(tenantId, wabaId);
    if (!wabaRow) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: wabaRow.id, encryptionKey });
      const templates = await client.listTemplates();
      res.json({ data: templates.map((t) => toTemplateResponse(t as Record<string, unknown>)) });
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

  r.post('/', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = typeof req.query.waba_id === 'string' ? req.query.waba_id : '';
    if (!wabaId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: 'waba_id query required' } });
      return;
    }
    const wabaRow = await resolveWaba(tenantId, wabaId);
    if (!wabaRow) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'WABA not found' } });
      return;
    }
    const parsed = TemplateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR' as const, message: JSON.stringify(parsed.error.flatten()) },
      });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: wabaRow.id, encryptionKey });
      const created = await client.createTemplate(parsed.data);
      res.status(200).json(toTemplateResponse(created as Record<string, unknown>));
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

  r.get('/:name', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = typeof req.query.waba_id === 'string' ? req.query.waba_id : '';
    const name = req.params.name;
    if (!wabaId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: 'waba_id query required' } });
      return;
    }
    const wabaRow = await resolveWaba(tenantId, wabaId);
    if (!wabaRow) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: wabaRow.id, encryptionKey });
      const templates = await client.listTemplates();
      const found = templates.find((t) => (t as { name?: string }).name === name);
      if (!found) {
        res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Template not found' } });
        return;
      }
      res.json(toTemplateResponse(found as Record<string, unknown>));
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

  r.delete('/:name', async (req: Request, res: Response) => {
    const tenantId = req.params.tenant_id!;
    const wabaId = typeof req.query.waba_id === 'string' ? req.query.waba_id : '';
    const name = req.params.name;
    if (!wabaId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR' as const, message: 'waba_id query required' } });
      return;
    }
    const wabaRow = await resolveWaba(tenantId, wabaId);
    if (!wabaRow) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'WABA not found' } });
      return;
    }
    try {
      const client = await getMetaApiClient({ db: getDb(), wabaId: wabaRow.id, encryptionKey });
      const templates = await client.listTemplates();
      const found = templates.find((t) => (t as { name?: string }).name === name);
      if (!found) {
        res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Template not found' } });
        return;
      }
      await client.deleteTemplate(name);
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
