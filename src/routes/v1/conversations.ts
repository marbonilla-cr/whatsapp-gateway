import { Router, type Request, type Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { AppDb } from '../../db';
import { messages } from '../../db/schema';
import {
  ConversationIdParamSchema,
  ConversationListQuerySchema,
  ConversationListResponseSchema,
  ConversationMessagesQuerySchema,
  ConversationMessagesResponseSchema,
  ConversationResponses,
} from './schemas/conversations';
import { ErrorResponseSchema } from './schemas/common';

type ConversationRow = {
  id: string;
  contact_phone: string;
  last_message_at: string;
  status: 'open' | 'pending' | 'closed' | 'archived';
  unread_count: number;
};

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

function deriveConversationStatus(latestStatus: string): 'open' | 'pending' | 'closed' | 'archived' {
  if (latestStatus === 'failed' || latestStatus === 'error') {
    return 'pending';
  }
  return 'open';
}

function applyCursor<T extends { id: string; sortDate: string }>(items: T[], cursor: string | undefined): T[] {
  if (!cursor) {
    return items;
  }
  const [cursorDate, cursorId] = cursor.split('|');
  const idx = items.findIndex((item) => item.sortDate === cursorDate && item.id === cursorId);
  if (idx === -1) {
    return items;
  }
  return items.slice(idx + 1);
}

export function createV1ConversationsRouter(getDb: () => AppDb) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    const parsed = ConversationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid query params', parsed.error.flatten());
      return;
    }

    const limit = parsed.data.limit ?? 25;
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.appId, auth.app.id), eq(messages.tenantId, auth.tenantId)));

    const byContact = new Map<string, ConversationRow>();
    for (const row of rows) {
      const contactPhone = row.direction === 'OUT' ? row.toNumber : row.fromNumber;
      const previous = byContact.get(contactPhone);
      const rowDate = row.createdAt.toISOString();
      if (!previous) {
        byContact.set(contactPhone, {
          id: contactPhone,
          contact_phone: contactPhone,
          last_message_at: rowDate,
          status: deriveConversationStatus(row.status),
          unread_count: row.direction === 'IN' && row.status !== 'read' ? 1 : 0,
        });
        continue;
      }
      if (rowDate > previous.last_message_at) {
        previous.last_message_at = rowDate;
        previous.status = deriveConversationStatus(row.status);
      }
      if (row.direction === 'IN' && row.status !== 'read') {
        previous.unread_count += 1;
      }
    }

    let conversations = Array.from(byContact.values())
      .sort((a, b) => {
        if (a.last_message_at === b.last_message_at) {
          return b.id.localeCompare(a.id);
        }
        return a.last_message_at < b.last_message_at ? 1 : -1;
      })
      .map((item) => ({ ...item, sortDate: item.last_message_at }));

    if (parsed.data.status) {
      conversations = conversations.filter((item) => item.status === parsed.data.status);
    }

    const pageSource = applyCursor(conversations, parsed.data.cursor);
    const pageSlice = pageSource.slice(0, limit);
    const nextItem = pageSource[limit];

    res.status(200).json({
      data: pageSlice.map(({ sortDate: _sortDate, ...item }) => item),
      page: {
        next_cursor: nextItem ? `${nextItem.sortDate}|${nextItem.id}` : null,
        limit,
      },
    });
  });

  r.get('/:id/messages', async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }

    const paramsParsed = ConversationIdParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid conversation id', paramsParsed.error.flatten());
      return;
    }
    const queryParsed = ConversationMessagesQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid query params', queryParsed.error.flatten());
      return;
    }

    const limit = queryParsed.data.limit ?? 25;
    const contact = paramsParsed.data.id;
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.appId, auth.app.id),
          eq(messages.tenantId, auth.tenantId),
          or(eq(messages.fromNumber, contact), eq(messages.toNumber, contact))
        )
      );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Conversation not found');
      return;
    }

    const list = rows
      .sort((a, b) => {
        const left = a.createdAt.toISOString();
        const right = b.createdAt.toISOString();
        if (left === right) {
          return b.id.localeCompare(a.id);
        }
        return left < right ? 1 : -1;
      })
      .map((row) => ({
        id: row.id,
        direction: row.direction as 'IN' | 'OUT',
        type: row.messageType,
        body_preview: row.bodyPreview ?? null,
        sent_at: row.createdAt.toISOString(),
        status: row.status,
        sortDate: row.createdAt.toISOString(),
      }));

    const pageSource = applyCursor(list, queryParsed.data.cursor);
    const pageSlice = pageSource.slice(0, limit);
    const nextItem = pageSource[limit];

    res.status(200).json({
      data: pageSlice.map(({ sortDate: _sortDate, ...item }) => item),
      page: {
        next_cursor: nextItem ? `${nextItem.sortDate}|${nextItem.id}` : null,
        limit,
      },
    });
  });

  return r;
}

export function registerV1ConversationsOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/v1/conversations',
    tags: ['Conversations'],
    summary: 'List conversations',
    description: 'Lists recent conversations scoped to the authenticated app/tenant.',
    security: [{ BearerAuth: [] }],
    request: {
      query: ConversationListQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated conversations',
        content: {
          'application/json': { schema: ConversationListResponseSchema },
        },
      },
      400: ConversationResponses.badRequest,
      401: ConversationResponses.unauthorized,
      429: ConversationResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/conversations/{id}/messages',
    tags: ['Conversations'],
    summary: 'List conversation messages',
    description: 'Lists messages for a specific conversation id (contact phone).',
    security: [{ BearerAuth: [] }],
    request: {
      params: ConversationIdParamSchema,
      query: ConversationMessagesQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated conversation messages',
        content: {
          'application/json': { schema: ConversationMessagesResponseSchema },
        },
      },
      400: ConversationResponses.badRequest,
      401: ConversationResponses.unauthorized,
      404: ConversationResponses.notFound,
      429: ConversationResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
