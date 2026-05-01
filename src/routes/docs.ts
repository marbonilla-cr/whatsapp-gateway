import { Router } from 'express';
import { apiReference } from '@scalar/express-api-reference';

export function createDocsRouter() {
  const r = Router();
  r.get(
    '/',
    apiReference({
      title: 'MBCSOFT WhatsApp Gateway API',
      theme: 'default',
      url: '/openapi.json',
    })
  );
  return r;
}
