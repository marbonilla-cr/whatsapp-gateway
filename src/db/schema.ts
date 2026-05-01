import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  legalName: text('legal_name'),
  countryCode: text('country_code').notNull().default('CR'),
  contactEmail: text('contact_email').notNull().unique(),
  plan: text('plan').notNull().default('starter'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wabas = pgTable(
  'wabas',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    metaWabaId: text('meta_waba_id').notNull().unique(),
    metaBusinessId: text('meta_business_id'),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    webhookSubscribedAt: timestamp('webhook_subscribed_at', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('wabas_tenant_idx').on(t.tenantId),
  })
);

export const phoneNumbers = pgTable(
  'phone_numbers',
  {
    id: text('id').primaryKey(),
    wabaId: text('waba_id')
      .notNull()
      .references(() => wabas.id),
    metaPhoneNumberId: text('meta_phone_number_id').notNull().unique(),
    displayPhoneNumber: text('display_phone_number').notNull(),
    displayName: text('display_name'),
    displayNameStatus: text('display_name_status').default('pending'),
    verifiedName: text('verified_name'),
    qualityRating: text('quality_rating'),
    messagingLimitTier: text('messaging_limit_tier'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    wabaIdx: index('phone_numbers_waba_idx').on(t.wabaId),
  })
);

export const apps = pgTable(
  'apps',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    phoneNumberId: text('phone_number_id')
      .notNull()
      .references(() => phoneNumbers.id)
      .unique(),
    name: text('name').notNull(),
    vertical: text('vertical').notNull().default('custom'),
    callbackUrl: text('callback_url').notNull(),
    apiKeyHash: text('api_key_hash').notNull().unique(),
    apiKeyPrefix: text('api_key_prefix').notNull(),
    configJson: jsonb('config_json'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('apps_tenant_idx').on(t.tenantId),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    direction: text('direction').notNull(),
    fromNumber: text('from_number').notNull(),
    toNumber: text('to_number').notNull(),
    messageType: text('message_type').notNull(),
    bodyPreview: text('body_preview'),
    rawPayload: jsonb('raw_payload'),
    metaMessageId: text('meta_message_id'),
    status: text('status').notNull().default('sent'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index('messages_app_idx').on(t.appId),
    tenantIdx: index('messages_tenant_idx').on(t.tenantId),
    metaMsgIdx: index('messages_meta_msg_idx').on(t.metaMessageId),
  })
);

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  wabaId: text('waba_id').references(() => wabas.id),
  phoneNumberId: text('phone_number_id').references(() => phoneNumbers.id),
  eventType: text('event_type').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  signatureValid: boolean('signature_valid').notNull(),
  processed: boolean('processed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  diffJson: jsonb('diff_json'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantUsers = pgTable(
  'tenant_users',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('tenant_users_email_idx').on(t.email),
  })
);

export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    state: text('state').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    /** pending | processing | completed | failed | expired */
    status: text('status').notNull().default('pending'),
    metadataJson: jsonb('metadata_json'),
    errorMessage: text('error_message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: uniqueIndex('onboarding_state_idx').on(t.state),
    tenantIdx: index('onboarding_tenant_idx').on(t.tenantId),
  })
);
