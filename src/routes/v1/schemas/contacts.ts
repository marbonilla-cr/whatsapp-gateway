import { z } from './zod';
import { E164PhoneSchema, ErrorResponseSchema } from './common';

export const ContactProfileResponseSchema = z
  .object({
    wa_id: z.string().openapi({ example: '50688887777' }),
    profile_name: z.string().nullable().openapi({
      description: 'Public profile name when available from inbound payloads',
      example: 'Juan Perez',
    }),
    display_phone_number: z.string().nullable().openapi({
      description: 'Business display number related to this contact',
      example: '+50622223333',
    }),
    last_seen_at: z.string().datetime().nullable().openapi({
      description: 'Most recent inbound message timestamp for this contact',
      example: '2026-04-30T02:00:00.000Z',
    }),
  })
  .openapi('ContactProfileResponse', {
    description: 'Public contact profile data inferred from message history',
  });

export const ContactPhoneParamSchema = z
  .object({
    phone: E164PhoneSchema.openapi({
      param: { name: 'phone', in: 'path' },
      description: 'WhatsApp contact phone',
      example: '50688887777',
    }),
  })
  .openapi('ContactPhoneParam');

export const ContactResponses = {
  unauthorized: {
    description: 'Missing or invalid API key',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  notFound: {
    description: 'No profile metadata found for this contact in tenant scope',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  rateLimited: {
    description: 'Rate limit reached',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;
