import { z } from './zod';

export const E164PhoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Expected E.164-like phone number')
  .openapi('E164Phone', {
    description: 'Phone number in E.164 format',
    example: '+50688887777',
  });

export const IsoDateTimeSchema = z.string().datetime().openapi('IsoDateTime', {
  description: 'ISO 8601 date-time in UTC',
  example: '2026-04-30T02:00:00.000Z',
});

export const CursorSchema = z.string().min(1).openapi('Cursor', {
  description: 'Opaque cursor for pagination',
  example: '2026-04-30T02:00:00.000Z|msg_123',
});

export const LimitSchema = z.coerce.number().int().min(1).max(100).default(25).openapi('Limit', {
  description: 'Page size limit (1-100)',
  example: 25,
});

export const ErrorCodeSchema = z
  .enum([
    'AUTH_REQUIRED',
    'INVALID_API_KEY',
    'VALIDATION_ERROR',
    'NOT_FOUND',
    'META_ERROR',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ])
  .openapi('ErrorCode', {
    description: 'Stable machine-readable error code',
    example: 'INVALID_API_KEY',
  });

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string().openapi({ example: 'Invalid or expired API key' }),
      details: z.unknown().optional().openapi({
        description: 'Optional additional diagnostics for validation/meta errors',
      }),
    }),
  })
  .openapi('ErrorResponse', {
    description: 'Standard error payload for v1 endpoints',
  });

export const PaginationQuerySchema = z
  .object({
    cursor: CursorSchema.optional(),
    limit: LimitSchema.optional(),
  })
  .openapi('PaginationQuery', {
    description: 'Cursor-based pagination parameters',
  });

export const PaginationMetaSchema = z
  .object({
    next_cursor: CursorSchema.nullable().openapi({
      description: 'Cursor to pass in the next request, null when exhausted',
      example: '2026-04-30T02:00:00.000Z|msg_123',
    }),
    limit: z.number().int().min(1).max(100).openapi({ example: 25 }),
  })
  .openapi('PaginationMeta', {
    description: 'Pagination information for list responses',
  });

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
  name: string,
  description: string
) {
  return z
    .object({
      data: z.array(itemSchema).openapi({ description: 'Current page items' }),
      page: PaginationMetaSchema,
    })
    .openapi(name, { description });
}

