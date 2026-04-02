import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  apiKeyPrefix: text('api_key_prefix').notNull(),
  callbackUrl: text('callback_url').notNull(),
  phoneNumberId: text('phone_number_id').notNull().unique(),
  wabaId: text('waba_id').notNull(),
  metaAccessToken: text('meta_access_token').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messageLogs = sqliteTable('message_logs', {
  id: text('id').primaryKey(),
  appId: text('app_id')
    .notNull()
    .references(() => apps.id),
  direction: text('direction', { enum: ['IN', 'OUT'] }).notNull(),
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number').notNull(),
  messageType: text('message_type').notNull(),
  bodyPreview: text('body_preview'),
  metaMessageId: text('meta_message_id'),
  status: text('status').notNull().default('sent'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
});
