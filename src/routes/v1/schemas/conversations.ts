import { z } from './zod';
import {
  CursorSchema,
  E164PhoneSchema,
  ErrorResponseSchema,
  IsoDateTimeSchema,
  LimitSchema,
  createPaginatedResponseSchema,
} from './common';

export const ConversationStatusSchema = z
  .enum(['open', 'pending', 'closed', 'archived'])
  .openapi('ConversationStatus', {
    description: 'Conversation lifecycle status',
    example: 'open',
  });

export const ConversationListQuerySchema = z
  .object({
    cursor: CursorSchema.optional().openapi({
      param: { name: 'cursor', in: 'query' },
    }),
    limit: LimitSchema.optional().openapi({
      param: { name: 'limit', in: 'query' },
    }),
    status: ConversationStatusSchema.optional().openapi({
      param: { name: 'status', in: 'query' },
    }),
  })
  .openapi('ConversationListQuery', {
    description: 'Filters for listing conversations',
  });

export const ConversationItemSchema = z
  .object({
    id: z.string().openapi({
      description: 'Conversation identifier (contact phone)',
      example: '50688887777',
    }),
    contact_phone: E164PhoneSchema,
    last_message_at: IsoDateTimeSchema,
    status: ConversationStatusSchema,
    unread_count: z.number().int().min(0).openapi({ example: 2 }),
  })
  .openapi('ConversationItem', {
    description: 'Conversation list item',
  });

export const ConversationListResponseSchema = createPaginatedResponseSchema(
  ConversationItemSchema,
  'ConversationListResponse',
  'Paginated conversations'
);

export const MessageDirectionSchema = z.enum(['IN', 'OUT']).openapi('MessageDirection', {
  description: 'Message direction relative to the app',
  example: 'OUT',
});

export const MessageItemSchema = z
  .object({
    id: z.string().openapi({ example: 'msg_123' }),
    direction: MessageDirectionSchema,
    type: z.string().openapi({ example: 'text' }),
    body_preview: z.string().nullable().openapi({ example: 'Hola, confirmada tu cita' }),
    sent_at: IsoDateTimeSchema,
    status: z.string().openapi({ example: 'sent' }),
  })
  .openapi('ConversationMessageItem', {
    description: 'Message entry inside a conversation',
  });

export const ConversationMessagesResponseSchema = createPaginatedResponseSchema(
  MessageItemSchema,
  'ConversationMessagesResponse',
  'Paginated messages inside one conversation'
);

export const ConversationIdParamSchema = z
  .object({
    id: E164PhoneSchema.openapi({
      param: { name: 'id', in: 'path' },
      description: 'Conversation id (contact phone)',
      example: '50688887777',
    }),
  })
  .openapi('ConversationIdParam');

export const ConversationMessagesQuerySchema = z
  .object({
    cursor: CursorSchema.optional().openapi({
      param: { name: 'cursor', in: 'query' },
    }),
    limit: LimitSchema.optional().openapi({
      param: { name: 'limit', in: 'query' },
    }),
  })
  .openapi('ConversationMessagesQuery');

export const ConversationResponses = {
  unauthorized: {
    description: 'Missing or invalid API key',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  notFound: {
    description: 'Conversation/message not found for this tenant',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  rateLimited: {
    description: 'Rate limit reached',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  badRequest: {
    description: 'Invalid query params',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;

