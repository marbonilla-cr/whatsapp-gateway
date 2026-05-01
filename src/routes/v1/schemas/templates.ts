import { z } from './zod';
import { ErrorResponseSchema } from './common';

export const TemplateComponentSchema = z
  .object({
    type: z.string().min(1).openapi({ example: 'BODY' }),
    text: z.string().optional().openapi({ example: 'Hola {{1}}, tu cita es el {{2}}.' }),
    format: z.string().optional().openapi({ example: 'TEXT' }),
    buttons: z.array(z.unknown()).optional(),
    example: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('TemplateComponentV1', {
    description: 'Template component definition',
  });

export const TemplateResponseSchema = z
  .object({
    name: z.string().openapi({ example: 'appointment_reminder' }),
    language: z.string().openapi({ example: 'es' }),
    status: z.string().openapi({ example: 'PENDING' }),
    category: z.string().openapi({ example: 'UTILITY' }),
    components: z.array(TemplateComponentSchema).openapi({ description: 'Meta template components' }),
    rejected_reason: z.string().nullable().openapi({
      description: 'Reason provided by Meta if rejected',
      example: null,
    }),
  })
  .openapi('TemplateResponse', {
    description: 'Template payload returned by API',
  });

export const TemplateListResponseSchema = z
  .object({
    data: z.array(TemplateResponseSchema),
  })
  .openapi('TemplateListResponse', {
    description: 'Template list result',
  });

export const TemplateInputSchema = z
  .object({
    name: z.string().min(1).openapi({ example: 'appointment_reminder' }),
    language: z.string().min(2).openapi({ example: 'es' }),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).openapi({ example: 'UTILITY' }),
    components: z.array(TemplateComponentSchema).min(1),
  })
  .openapi('TemplateInput', {
    description: 'Payload used to create a new template',
  });

export const TemplateNameParamSchema = z
  .object({
    name: z.string().min(1).openapi({
      param: { name: 'name', in: 'path' },
      description: 'Template name',
      example: 'appointment_reminder',
    }),
  })
  .openapi('TemplateNameParam');

export const TemplateResponses = {
  unauthorized: {
    description: 'Missing or invalid API key',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  badRequest: {
    description: 'Invalid payload',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  notFound: {
    description: 'Template not found for this tenant WABA',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  metaError: {
    description: 'Meta API failure',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  rateLimited: {
    description: 'Rate limit reached',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;
