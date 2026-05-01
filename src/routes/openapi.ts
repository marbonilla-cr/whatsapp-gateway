import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { Router, type Request, type Response } from 'express';
import { ErrorResponseSchema } from './v1/schemas/common';
import { registerV1OpenApi } from './v1/openapi';

let cachedSpec: unknown | null = null;

function buildOpenApiSpec(): unknown {
  const registry = new OpenAPIRegistry();
  registry.register('ErrorResponse', ErrorResponseSchema);
  registerV1OpenApi(registry);

  registry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'API Key',
    description:
      'Authorization header with Bearer token in format wgw_<prefix>_<secret> for app-level access.',
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'MBCSOFT WhatsApp Gateway API',
      version: '1.0.0',
      description: 'Multi-tenant BSP gateway for WhatsApp Cloud API',
    },
    servers: [
      { url: 'https://gateway.mbcsoft.com', description: 'Production' },
      { url: 'https://staging-gateway.mbcsoft.com', description: 'Staging' },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Messages', description: 'Outbound messages and status checks' },
      { name: 'Conversations', description: 'Conversation list and history' },
      { name: 'Templates', description: 'Template management for the tenant WABA' },
      { name: 'Media', description: 'Media upload helpers' },
      { name: 'Contacts', description: 'Public contact profile lookup' },
    ],
  });
}

export function getOpenApiSpec(): unknown {
  if (!cachedSpec || process.env.NODE_ENV === 'development') {
    cachedSpec = buildOpenApiSpec();
  }
  return cachedSpec;
}

export function createOpenApiRouter() {
  const r = Router();
  r.get('/', (_req: Request, res: Response) => {
    res.type('application/json').status(200).json(getOpenApiSpec());
  });
  return r;
}

