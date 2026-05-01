import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { registerV1MessagesOpenApi } from './messages';
import { registerV1ConversationsOpenApi } from './conversations';
import { registerV1TemplatesOpenApi } from './templates';
import { registerV1MediaOpenApi } from './media';
import { registerV1ContactsOpenApi } from './contacts';

export function registerV1OpenApi(registry: OpenAPIRegistry): void {
  registerV1MessagesOpenApi(registry);
  registerV1ConversationsOpenApi(registry);
  registerV1TemplatesOpenApi(registry);
  registerV1MediaOpenApi(registry);
  registerV1ContactsOpenApi(registry);
}
