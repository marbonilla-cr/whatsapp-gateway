import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { AppDb } from '../../db';
import { messages } from '../../db/schema';
import { ContactPhoneParamSchema, ContactProfileResponseSchema, ContactResponses } from './schemas/contacts';
import { ErrorResponseSchema } from './schemas/common';

function sendError(
  res: Response,
  status: number,
  code: 'AUTH_REQUIRED' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL_ERROR',
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

export function createV1ContactsRouter(getDb: () => AppDb) {
  const r = Router();

  r.get('/:phone/profile', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    const paramsParsed = ContactPhoneParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid contact phone', paramsParsed.error.flatten());
      return;
    }

    const phone = paramsParsed.data.phone;
    try {
      const rows = await getDb()
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.appId, auth.app.id),
            eq(messages.tenantId, auth.tenantId),
            eq(messages.direction, 'IN'),
            eq(messages.fromNumber, phone)
          )
        );

      if (rows.length === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Contact profile not found');
        return;
      }

      const latest = rows.sort((a, b) => {
        const left = a.createdAt.toISOString();
        const right = b.createdAt.toISOString();
        return left < right ? 1 : -1;
      })[0];

      const rawPayload = latest.rawPayload as Record<string, unknown> | null;
      const contactsArray = Array.isArray(rawPayload?.contacts) ? rawPayload?.contacts : [];
      const profileObject =
        contactsArray[0] &&
        typeof contactsArray[0] === 'object' &&
        (contactsArray[0] as { profile?: unknown }).profile &&
        typeof (contactsArray[0] as { profile?: unknown }).profile === 'object'
          ? ((contactsArray[0] as { profile: Record<string, unknown> }).profile ?? null)
          : null;

      res.status(200).json({
        wa_id: phone,
        profile_name:
          profileObject && typeof profileObject.name === 'string' ? profileObject.name : null,
        display_phone_number: auth.phoneNumber.displayPhoneNumber ?? null,
        last_seen_at: latest.createdAt.toISOString(),
      });
    } catch (error) {
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  return r;
}

export function registerV1ContactsOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/v1/contacts/{phone}/profile',
    tags: ['Contacts'],
    summary: 'Get contact profile',
    description:
      'Returns public profile info inferred from inbound messages within the authenticated tenant/app scope.',
    security: [{ BearerAuth: [] }],
    request: {
      params: ContactPhoneParamSchema,
    },
    responses: {
      200: {
        description: 'Contact profile found',
        content: { 'application/json': { schema: ContactProfileResponseSchema } },
      },
      401: ContactResponses.unauthorized,
      404: ContactResponses.notFound,
      429: ContactResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
