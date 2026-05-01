import { z } from './zod';
import { ErrorResponseSchema } from './common';

export const UploadMediaResponseSchema = z
  .object({
    media_id: z.string().openapi({ example: '1643423550042275' }),
    mime_type: z.string().openapi({ example: 'image/jpeg' }),
    sha256: z.string().optional().openapi({
      description: 'Meta-reported SHA256 checksum when available',
      example: 'af6f8a5f7e0f9ec1f08111f2c4dbb59389f24b8344a2a6380f5f5d8c2f2f40b5',
    }),
    size: z.number().int().nonnegative().openapi({ example: 102400 }),
  })
  .openapi('UploadMediaResponse', {
    description: 'Uploaded media metadata',
  });

export const MediaResponses = {
  unauthorized: {
    description: 'Missing or invalid API key',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  badRequest: {
    description: 'Invalid multipart payload',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  metaError: {
    description: 'Meta API failure while uploading media',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  rateLimited: {
    description: 'Rate limit reached',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;
