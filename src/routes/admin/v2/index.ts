import { Router } from 'express';
import type { AppDb } from '../../../db';
import { createTenantsAdminRouter } from './tenants';
import { createUsersAdminRouter } from './users';
import { createWabasAdminRouter } from './wabas';
import { createAppsV2Router } from './apps';
import { createTemplatesAdminRouter } from './templates';
import { createMessagesAdminRouter } from './messages';
import { createAuditLogAdminRouter } from './audit-log';
import { createMeRouter } from './me';

/**
 * Routes under `/tenants/:tenant_id/*` need a single parent router with
 * `mergeParams` so nested routers receive `tenant_id` in `req.params`.
 */
export function createAdminV2Router(getDb: () => AppDb, encryptionKey: string) {
  const r = Router();

  r.use('/me', createMeRouter(getDb));

  const tenantScoped = Router({ mergeParams: true });
  tenantScoped.use('/users', createUsersAdminRouter(getDb));
  tenantScoped.use('/wabas', createWabasAdminRouter(getDb, encryptionKey));
  tenantScoped.use('/apps', createAppsV2Router(getDb, encryptionKey));
  tenantScoped.use('/templates', createTemplatesAdminRouter(getDb, encryptionKey));
  tenantScoped.use('/messages', createMessagesAdminRouter(getDb));

  /** Must be before `/tenants` list router so paths like `/tenants/:id/messages` match here */
  r.use('/tenants/:tenant_id', tenantScoped);
  r.use('/tenants', createTenantsAdminRouter(getDb));
  r.use('/audit-log', createAuditLogAdminRouter(getDb));

  return r;
}
