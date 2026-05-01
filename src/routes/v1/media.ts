import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { AppDb } from '../../db';
import { getMetaApiClient, MetaApiError } from '../../services/meta';
import { ErrorResponseSchema } from './schemas/common';
import { MediaResponses, UploadMediaResponseSchema } from './schemas/media';
import { z } from './schemas/zod';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function sendError(
  res: Response,
  status: number,
  code: 'AUTH_REQUIRED' | 'VALIDATION_ERROR' | 'META_ERROR' | 'INTERNAL_ERROR',
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

export function createV1MediaRouter(getDb: () => AppDb, encryptionKey: string) {
  const r = Router();

  r.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    const auth = req.v1Auth;
    if (!auth) {
      sendError(res, 401, 'AUTH_REQUIRED', 'Missing v1 authentication context');
      return;
    }
    if (!req.file) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Multipart file field "file" is required');
      return;
    }

    try {
      const client = await getMetaApiClient({
        db: getDb(),
        wabaId: auth.wabaId,
        encryptionKey,
      });
      const response = await client.uploadMedia(auth.phoneNumber.metaPhoneNumberId, {
        file: req.file.buffer,
        filename: req.file.originalname || 'upload.bin',
        mimeType: req.file.mimetype,
      });

      res.status(200).json({
        media_id: response.id,
        mime_type: response.mime_type ?? req.file.mimetype,
        sha256: response.sha256,
        size: req.file.size,
      });
    } catch (error) {
      if (error instanceof MetaApiError) {
        sendError(res, 422, 'META_ERROR', error.message, error.metaBody);
        return;
      }
      sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  return r;
}

export function registerV1MediaOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/v1/media/upload',
    tags: ['Media'],
    summary: 'Upload media',
    description: 'Uploads a media file to Meta Cloud API and returns media_id.',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z
              .object({
                file: z.string().openapi({
                  type: 'string',
                  format: 'binary',
                  description: 'Binary file contents',
                }),
              })
              .openapi('UploadMediaRequest', { description: 'Multipart body with a required file field' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Media uploaded',
        content: { 'application/json': { schema: UploadMediaResponseSchema } },
      },
      400: MediaResponses.badRequest,
      401: MediaResponses.unauthorized,
      422: MediaResponses.metaError,
      429: MediaResponses.rateLimited,
      500: {
        description: 'Unexpected server failure',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
