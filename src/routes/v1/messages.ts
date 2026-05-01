import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { AppDb } from '../../db';
import { messages } from '../../db/schema';
import { randomId16 } from '../../services/crypto';
import { getMetaApiClient, MetaApiError, type SendPayload } from '../../services/meta';
import { ErrorResponseSchema } from './schemas/common';
import {
  GetMessageStatusResponseSchema,
  MessageIdParamSchema,
  MessageResponses,
  SendMessageBodySchema,
  SendMessageResponseSchema,
} from './schemas/messages';

type SendMessageBody = typeof SendMessageBodySchema._output;

function sendError(
  res: Response,
  status: number,
  code: 'AUTH_REQUIRED' | 'INVALID_API_KEY' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'META_ERROR' | 'INTERNAL_ERROR',
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

function buildMetaPayload(parsed: SendMessageBody): SendPayload {
  const base = { messaging_product: 'whatsapp' as const, to: parsed.to };
  switch (parsed.type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: { body: parsed.text, preview_url: parsed.preview_url },
      };
    case 'template':
      return {
        ...base,
        type: 'template',
        template: parsed.template,
      };
    case 'image':
      return {
        ...base,
        type: 'image',
        image: parsed.image,
      };
    case 'document':
      return {
        ...base,
        type: 'document',
        document: parsed.document,
      };
    case 'interactive':
      return {
        ...base,
        type: 'interactive',
        interactive: parsed.interactive,
      };
    default: {
      const neverType: never = parsed;
      throw new Error(`Unknown message type ${(neverType as { type?: string }).type ?? 'unknown'}`);
    }
  }
}

function bodyPreviewFromSend(parsed: SendMessageBody): string | undefined {
  if (parsed.type === 'text') {
    return parsed.text.length > 100 ? parsed.text.slice(0, 100) : parsed.text;
  }
  return `[${parsed.type}]`;
}

export function createV1MessagesRouter(getDb: () => AppDb, encryptionKey: string) {
  const r = Router();

  r.post('/', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    const parsed = SendMessageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid message payload', parsed.error.flatten());
      return;
    }

    const db = getDb();
    const metaPayload = buildMetaPayload(parsed.data);
    let wamid: string;

    try {
      const client = await getMetaApiClient({
        db,
        wabaId: auth.wabaId,
        encryptionKey,
      });
      const metaResponse = await client.sendMessage(auth.phoneNumber.metaPhoneNumberId, metaPayload);
      if (!metaResponse.messageId) {
        throw new MetaApiError('Meta response missing message id', 502, metaResponse);
      }
      wamid = metaResponse.messageId;
    } catch (error) {
      if (error instanceof MetaApiError) {
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    try {
      await db.insert(messages).values({
        id: randomId16(),
        appId: auth.app.id,
        tenantId: auth.tenantId,
        direction: 'OUT',
        fromNumber: auth.phoneNumber.metaPhoneNumberId,
        toNumber: parsed.data.to,
        messageType: parsed.data.type,
        bodyPreview: bodyPreviewFromSend(parsed.data),
        rawPayload: parsed.data,
        metaMessageId: wamid,
        status: 'sent',
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
      });
    } catch {
      // Fire-and-forget persistence path.
    }

    res.status(200).json({
      wamid,
      status: 'sent',
    });
  });

  r.get('/:wamid', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    const parsedParams = MessageIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid message id', parsedParams.error.flatten());
      return;
    }

    const db = getDb();
    const row = (
      await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.metaMessageId, parsedParams.data.wamid),
            eq(messages.tenantId, auth.tenantId),
            eq(messages.appId, auth.app.id)
          )
        )
        .limit(1)
    )[0];

    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'Message not found');
      return;
    }

    res.status(200).json({
      wamid: row.metaMessageId ?? parsedParams.data.wamid,
      status: row.status,
      errors: row.errorCode
        ? [{ code: row.errorCode, message: row.errorMessage ?? 'Unknown delivery failure' }]
        : undefined,
      sent_at: row.createdAt.toISOString(),
      delivered_at: row.status === 'delivered' || row.status === 'read' ? row.createdAt.toISOString() : null,
    });
  });

  return r;
}

export function registerV1MessagesOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/v1/messages',
    tags: ['Messages'],
    summary: 'Send a WhatsApp message',
    description: 'Sends text/template/image/document/interactive messages under the authenticated app.',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: SendMessageBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Message accepted by Meta',
        content: {
          'application/json': {
            schema: SendMessageResponseSchema,
          },
        },
      },
      400: MessageResponses.badRequest,
      401: MessageResponses.unauthorized,
      422: MessageResponses.metaError,
      429: MessageResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/messages/{wamid}',
    tags: ['Messages'],
    summary: 'Get message status',
    description: 'Retrieves status for a message id within current tenant and app context.',
    security: [{ BearerAuth: [] }],
    request: {
      params: MessageIdParamSchema,
    },
    responses: {
      200: {
        description: 'Message status found',
        content: {
          'application/json': {
            schema: GetMessageStatusResponseSchema,
          },
        },
      },
      400: MessageResponses.badRequest,
      401: MessageResponses.unauthorized,
      404: MessageResponses.notFound,
      429: MessageResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
