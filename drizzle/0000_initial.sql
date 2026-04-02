CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_key_hash` text NOT NULL,
	`api_key_prefix` text NOT NULL,
	`callback_url` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`waba_id` text NOT NULL,
	`meta_access_token` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_api_key_hash_unique` ON `apps` (`api_key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `apps_phone_number_id_unique` ON `apps` (`phone_number_id`);--> statement-breakpoint
CREATE TABLE `message_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`direction` text NOT NULL,
	`from_number` text NOT NULL,
	`to_number` text NOT NULL,
	`message_type` text NOT NULL,
	`body_preview` text,
	`meta_message_id` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
