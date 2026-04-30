import { Router, type Request, type Response } from 'express';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { AppDb } from '../../db';
import { getMetaApiClient, MetaApiError } from '../../services/meta';
import { ErrorResponseSchema } from './schemas/common';
import {
  TemplateInputSchema,
  TemplateListResponseSchema,
  TemplateNameParamSchema,
  TemplateResponseSchema,
  TemplateResponses,
} from './schemas/templates';

function sendError(
  res: Response,
  status: number,
  code: 'AUTH_REQUIRED' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'META_ERROR' | 'INTERNAL_ERROR',
  message: string,
  details?: unknown
) {
  res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

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

export function createV1TemplatesRouter(getDb: () => AppDb, encryptionKey: string) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    try {
      const client = await getMetaApiClient({
        db: getDb(),
        wabaId: auth.wabaId,
        encryptionKey,
      });
      const templates = await client.listTemplates();
      res.status(200).json({
        data: templates.map((template) => toTemplateResponse(template as Record<string, unknown>)),
      });
    } catch (error) {
      if (error instanceof MetaApiError) {
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  r.post('/', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }
    const parsed = TemplateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid template payload', parsed.error.flatten());
      return;
    }

    try {
      const client = await getMetaApiClient({
        db: getDb(),
        wabaId: auth.wabaId,
        encryptionKey,
      });
      const created = await client.createTemplate(parsed.data);
      res.status(200).json({
        ...toTemplateResponse(created as Record<string, unknown>),
        status: String((created as Record<string, unknown>).status ?? 'PENDING'),
      });
    } catch (error) {
      if (error instanceof MetaApiError) {
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  r.get('/:name', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }
    const paramsParsed = TemplateNameParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid template name', paramsParsed.error.flatten());
      return;
    }

    try {
      const client = await getMetaApiClient({
        db: getDb(),
        wabaId: auth.wabaId,
        encryptionKey,
      });
      const templates = await client.listTemplates();
      const found = templates.find((template) => template.name === paramsParsed.data.name);
      if (!found) {
        sendError(res, 404, 'NOT_FOUND', 'Template not found');
        return;
      }
      res.status(200).json(toTemplateResponse(found as Record<string, unknown>));
    } catch (error) {
      if (error instanceof MetaApiError) {
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  r.delete('/:name', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }
    const paramsParsed = TemplateNameParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid template name', paramsParsed.error.flatten());
      return;
    }

    try {
      const client = await getMetaApiClient({
        db: getDb(),
        wabaId: auth.wabaId,
        encryptionKey,
      });
      await client.deleteTemplate(paramsParsed.data.name);
      res.status(204).send();
    } catch (error) {
      if (error instanceof MetaApiError) {
        if (error.status === 404) {
          sendError(res, 404, 'NOT_FOUND', 'Template not found', error.metaBody);
          return;
        }
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  return r;
}

export function registerV1TemplatesOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/v1/templates',
    tags: ['Templates'],
    summary: 'List templates',
    description: 'Lists templates from the authenticated app WABA.',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Template list',
        content: { 'application/json': { schema: TemplateListResponseSchema } },
      },
      401: TemplateResponses.unauthorized,
      422: TemplateResponses.metaError,
      429: TemplateResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/templates',
    tags: ['Templates'],
    summary: 'Create template',
    description: 'Creates a template in Meta for the authenticated WABA.',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: TemplateInputSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Template creation accepted',
        content: { 'application/json': { schema: TemplateResponseSchema } },
      },
      400: TemplateResponses.badRequest,
      401: TemplateResponses.unauthorized,
      422: TemplateResponses.metaError,
      429: TemplateResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/templates/{name}',
    tags: ['Templates'],
    summary: 'Get template details',
    description: 'Fetches one template by name from the authenticated WABA.',
    security: [{ BearerAuth: [] }],
    request: {
      params: TemplateNameParamSchema,
    },
    responses: {
      200: {
        description: 'Template found',
        content: { 'application/json': { schema: TemplateResponseSchema } },
      },
      400: TemplateResponses.badRequest,
      401: TemplateResponses.unauthorized,
      404: TemplateResponses.notFound,
      429: TemplateResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/v1/templates/{name}',
    tags: ['Templates'],
    summary: 'Delete template',
    description: 'Deletes a template by name in the authenticated WABA.',
    security: [{ BearerAuth: [] }],
    request: {
      params: TemplateNameParamSchema,
    },
    responses: {
      204: { description: 'Template deleted' },
      400: TemplateResponses.badRequest,
      401: TemplateResponses.unauthorized,
      404: TemplateResponses.notFound,
      422: TemplateResponses.metaError,
      429: TemplateResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
