CREATE TABLE "onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"state" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata_json" jsonb,
	"error_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wabas" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_state_idx" ON "onboarding_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "onboarding_tenant_idx" ON "onboarding_sessions" USING btree ("tenant_id");