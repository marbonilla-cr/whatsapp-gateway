CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"name" text NOT NULL,
	"vertical" text DEFAULT 'custom' NOT NULL,
	"callback_url" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"config_json" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_phone_number_id_unique" UNIQUE("phone_number_id"),
	CONSTRAINT "apps_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"diff_json" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"direction" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"message_type" text NOT NULL,
	"body_preview" text,
	"raw_payload" jsonb,
	"meta_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" text PRIMARY KEY NOT NULL,
	"waba_id" text NOT NULL,
	"meta_phone_number_id" text NOT NULL,
	"display_phone_number" text NOT NULL,
	"display_name" text,
	"display_name_status" text DEFAULT 'pending',
	"verified_name" text,
	"quality_rating" text,
	"messaging_limit_tier" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_numbers_meta_phone_number_id_unique" UNIQUE("meta_phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"legal_name" text,
	"country_code" text DEFAULT 'CR' NOT NULL,
	"contact_email" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_contact_email_unique" UNIQUE("contact_email")
);
--> statement-breakpoint
CREATE TABLE "wabas" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"meta_waba_id" text NOT NULL,
	"meta_business_id" text,
	"access_token_encrypted" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"webhook_subscribed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wabas_meta_waba_id_unique" UNIQUE("meta_waba_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"waba_id" text,
	"phone_number_id" text,
	"event_type" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_waba_id_wabas_id_fk" FOREIGN KEY ("waba_id") REFERENCES "public"."wabas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wabas" ADD CONSTRAINT "wabas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_waba_id_wabas_id_fk" FOREIGN KEY ("waba_id") REFERENCES "public"."wabas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apps_tenant_idx" ON "apps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "messages_app_idx" ON "messages" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_idx" ON "messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "messages_meta_msg_idx" ON "messages" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX "phone_numbers_waba_idx" ON "phone_numbers" USING btree ("waba_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_email_idx" ON "tenant_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "wabas_tenant_idx" ON "wabas" USING btree ("tenant_id");