import { z } from './zod';
import { E164PhoneSchema, ErrorResponseSchema, IsoDateTimeSchema } from './common';

const TemplateLanguageSchema = z
  .object({
    code: z.string().min(2).openapi({ example: 'es' }),
  })
  .openapi('TemplateLanguage', {
    description: 'Template language reference',
  });

const TemplateComponentSchema = z
  .object({
    type: z.string().min(1).openapi({ example: 'body' }),
    parameters: z.array(z.unknown()).optional().openapi({
      description: 'Meta Cloud API component parameters',
    }),
  })
  .openapi('TemplateComponent', {
    description: 'Template component payload',
  });

const SendTextSchema = z
  .object({
    type: z.literal('text').openapi({ example: 'text' }),
    to: E164PhoneSchema,
    text: z
      .string()
      .min(1)
      .openapi({ description: 'Text body', example: 'Hola, te confirmamos tu reserva' }),
    preview_url: z
      .boolean()
      .optional()
      .openapi({ description: 'Enable URL preview when text contains links', example: false }),
  })
  .openapi('SendTextMessageBody', {
    description: 'Send a text message',
  });

const SendTemplateSchema = z
  .object({
    type: z.literal('template').openapi({ example: 'template' }),
    to: E164PhoneSchema,
    template: z
      .object({
        name: z.string().min(1).openapi({ example: 'appointment_reminder' }),
        language: TemplateLanguageSchema,
        components: z.array(TemplateComponentSchema).optional(),
      })
      .openapi('SendTemplatePayload', { description: 'Template payload definition' }),
  })
  .openapi('SendTemplateMessageBody', {
    description: 'Send a template message',
  });

const ImagePayloadSchema = z
  .object({
    id: z.string().min(1).optional().openapi({ example: '12345678901234' }),
    link: z.string().url().optional().openapi({ example: 'https://cdn.example.com/image.jpg' }),
    caption: z.string().optional().openapi({ example: 'Catálogo Mayo 2026' }),
  })
  .refine((value) => Boolean(value.id || value.link), {
    message: 'image.id or image.link is required',
  })
  .openapi('SendImagePayload', {
    description: 'Image by uploaded media id or external link',
  });

const DocumentPayloadSchema = z
  .object({
    id: z.string().min(1).optional().openapi({ example: '98765432109876' }),
    link: z.string().url().optional().openapi({ example: 'https://cdn.example.com/manual.pdf' }),
    filename: z.string().optional().openapi({ example: 'manual.pdf' }),
    caption: z.string().optional().openapi({ example: 'Manual de uso' }),
  })
  .refine((value) => Boolean(value.id || value.link), {
    message: 'document.id or document.link is required',
  })
  .openapi('SendDocumentPayload', {
    description: 'Document by uploaded media id or external link',
  });

const SendImageSchema = z
  .object({
    type: z.literal('image').openapi({ example: 'image' }),
    to: E164PhoneSchema,
    image: ImagePayloadSchema,
  })
  .openapi('SendImageMessageBody', {
    description: 'Send an image message',
  });

const SendDocumentSchema = z
  .object({
    type: z.literal('document').openapi({ example: 'document' }),
    to: E164PhoneSchema,
    document: DocumentPayloadSchema,
  })
  .openapi('SendDocumentMessageBody', {
    description: 'Send a document message',
  });

const SendInteractiveSchema = z
  .object({
    type: z.literal('interactive').openapi({ example: 'interactive' }),
    to: E164PhoneSchema,
    interactive: z.record(z.string(), z.unknown()).openapi({
      description: 'Interactive payload compatible with Meta API',
      example: {
        type: 'button',
        body: { text: 'Elegí una opción' },
        action: { buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Sí' } }] },
      },
    }),
  })
  .openapi('SendInteractiveMessageBody', {
    description: 'Send an interactive message',
  });

export const SendMessageBodySchema = z
  .discriminatedUnion('type', [
    SendTextSchema,
    SendTemplateSchema,
    SendImageSchema,
    SendDocumentSchema,
    SendInteractiveSchema,
  ])
  .openapi('SendMessageBody', {
    description: 'Supported outbound message payloads',
  });

export const SendMessageResponseSchema = z
  .object({
    wamid: z.string().openapi({ example: 'wamid.HBgMNTYwNjA2MDYwFQIAERgSMjVFMjY5QjM4NUI3RUQ3NTQA' }),
    status: z.enum(['sent', 'queued']).openapi({ example: 'sent' }),
    contacts: z
      .array(
        z.object({
          wa_id: z.string().openapi({ example: '50688887777' }),
        })
      )
      .optional(),
  })
  .openapi('SendMessageResponse', {
    description: 'Response returned after a successful send',
  });

export const GetMessageStatusResponseSchema = z
  .object({
    wamid: z.string().openapi({ example: 'wamid.HBgMNTYwNjA2MDYwFQIAERgSMjVFMjY5QjM4NUI3RUQ3NTQA' }),
    status: z.string().openapi({ example: 'sent' }),
    errors: z
      .array(
        z.object({
          code: z.string().openapi({ example: '131000' }),
          message: z.string().openapi({ example: 'Delivery failed due to policy issue' }),
        })
      )
      .optional(),
    sent_at: IsoDateTimeSchema,
    delivered_at: IsoDateTimeSchema.nullable().openapi({
      description: 'Delivery timestamp when known',
      deprecated: false,
    }),
  })
  .openapi('GetMessageStatusResponse', {
    description: 'Current status for a message id',
  });

export const MessageIdParamSchema = z
  .object({
    wamid: z.string().min(1).openapi({
      description: 'Meta WhatsApp message id',
      param: { name: 'wamid', in: 'path' },
      example: 'wamid.HBgMNTYwNjA2MDYwFQIAERgSMjVFMjY5QjM4NUI3RUQ3NTQA',
    }),
  })
  .openapi('MessageIdParam');

export const MessageResponses = {
  badRequest: {
    description: 'Invalid request payload',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  unauthorized: {
    description: 'Missing or invalid API key',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  notFound: {
    description: 'Resource not found for this tenant/app',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  metaError: {
    description: 'Meta API request failed',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  rateLimited: {
    description: 'Rate limit reached',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;
