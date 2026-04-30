import { Router } from 'express';
import type { AppDb } from '../../db';
import { createApiKeyV1Middleware, createApiKeyV1RateLimiter } from '../../middleware/apiKeyV1';
import { createV1MessagesRouter } from './messages';
import { createV1ConversationsRouter } from './conversations';
import { createV1TemplatesRouter } from './templates';
import { createV1MediaRouter } from './media';
import { createV1ContactsRouter } from './contacts';

export function createV1Router(getDb: () => AppDb, encryptionKey: string) {
  const r = Router();

  r.use(createApiKeyV1Middleware(getDb));
  r.use(createApiKeyV1RateLimiter());

  r.use('/messages', createV1MessagesRouter(getDb, encryptionKey));
  r.use('/conversations', createV1ConversationsRouter(getDb));
  r.use('/templates', createV1TemplatesRouter(getDb, encryptionKey));
  r.use('/media', createV1MediaRouter(getDb, encryptionKey));
  r.use('/contacts', createV1ContactsRouter(getDb));

  return r;
}
