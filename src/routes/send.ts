import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema';
import { messageLogs } from '../db/schema';
import { decryptToken, randomId16 } from '../services/crypto';
import { sendMessage } from '../services/meta';
import type { MetaMessagePayload } from '../types';
import { MetaApiError } from '../types';
import { createGatewayAuthMiddleware } from '../middleware/auth';

const sendBody = z.discriminatedUnion('type', [
  z.object({
    to: z.string().min(1),
    type: z.literal('text'),
    text: z.object({ body: z.string() }),
  }),
  z.object({
    to: z.string().min(1),
    type: z.literal('template'),
    template: z.object({
      name: z.string(),
      language: z.object({ code: z.string() }),
      components: z.array(z.unknown()).optional(),
    }),
  }),
  z.object({
    to: z.string().min(1),
    type: z.literal('image'),
    image: z.union([
      z.object({ link: z.string() }),
      z.object({ id: z.string() }),
    ]),
  }),
  z.object({
    to: z.string().min(1),
    type: z.literal('document'),
    document: z.union([
      z.object({ link: z.string(), filename: z.string().optional() }),
      z.object({ id: z.string(), filename: z.string().optional() }),
    ]),
  }),
]);

function buildMetaPayload(parsed: z.infer<typeof sendBody>): MetaMessagePayload {
  const base = { messaging_product: 'whatsapp' as const, to: parsed.to };
  switch (parsed.type) {
    case 'text':
      return { ...base, type: 'text', text: parsed.text };
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: parsed.template.name,
          language: parsed.template.language,
          components: parsed.template.components as unknown[] | undefined,
        },
      };
    case 'image':
      return { ...base, type: 'image', image: parsed.image };
    case 'document':
      return { ...base, type: 'document', document: parsed.document };
    default: {
      const _u: never = parsed;
      throw new Error(`Unhandled payload type: ${JSON.stringify(_u)}`);
    }
  }
}

function bodyPreviewFromSend(parsed: z.infer<typeof sendBody>): string | undefined {
  if (parsed.type === 'text') {
    const b = parsed.text.body;
    return b.length > 100 ? b.slice(0, 100) : b;
  }
  return `[${parsed.type}]`;
}

export function createSendRouter(
  getDb: () => BetterSQLite3Database<typeof schema>,
  encryptionKey: string,
  gatewayAuth: (req: Request, res: Response, next: NextFunction) => void
) {
  const r = Router();
  r.use(gatewayAuth);

  r.post('/', async (req: Request, res: Response) => {
    const parsed = sendBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: parsed.error.flatten().fieldErrors
            ? JSON.stringify(parsed.error.flatten().fieldErrors)
            : 'Invalid body',
        },
      });
      return;
    }
    const app = req.gatewayApp;
    if (!app) {
      res.status(401).json({
        error: { code: 'INVALID_API_KEY' as const, message: 'Unauthorized' },
      });
      return;
    }
    let accessToken: string;
    try {
      accessToken = decryptToken(app.metaAccessToken, encryptionKey);
    } catch {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR' as const,
          message: 'Failed to decrypt credentials',
        },
      });
      return;
    }
    const metaPayload = buildMetaPayload(parsed.data);
    let messageId: string;
    try {
      const out = await sendMessage(app.phoneNumberId, accessToken, metaPayload);
      messageId = out.messageId;
    } catch (e) {
      if (e instanceof MetaApiError) {
        res.status(422).json({
          error: {
            code: 'META_ERROR' as const,
            message: `${e.message}: ${JSON.stringify(e.metaBody)}`,
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR' as const,
          message: e instanceof Error ? e.message : 'Unknown error',
        },
      });
      return;
    }
    const db = getDb();
    const now = new Date().toISOString();
    try {
      db.insert(messageLogs)
        .values({
          id: randomId16(),
          appId: app.id,
          direction: 'OUT',
          fromNumber: app.phoneNumberId,
          toNumber: parsed.data.to,
          messageType: parsed.data.type,
          bodyPreview: bodyPreviewFromSend(parsed.data),
          metaMessageId: messageId,
          status: 'sent',
          createdAt: now,
        })
        .run();
    } catch {
      // still return success to client — log is best-effort
    }
    res.status(200).json({ success: true, messageId });
  });

  return r;
}

export { createGatewayAuthMiddleware };
