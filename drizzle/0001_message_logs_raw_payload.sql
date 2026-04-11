ALTER TABLE `message_logs` ADD `raw_payload` text;--> statement-breakpoint
INSERT OR IGNORE INTO `apps` (
	`id`,
	`name`,
	`api_key_hash`,
	`api_key_prefix`,
	`callback_url`,
	`phone_number_id`,
	`waba_id`,
	`meta_access_token`,
	`is_active`,
	`created_at`,
	`updated_at`
) VALUES (
	'unknown',
	'__diagnostic_unknown_app__',
	'3f943f629e65568a816d5803b4c1b318e498341cc96498480b99a93f512725b5',
	'diag',
	'https://example.invalid/gateway-diagnostic-placeholder',
	'__gateway_diagnostic_unknown_phone__',
	'__gateway_diagnostic_unknown_waba__',
	'__not_used__',
	0,
	'1970-01-01T00:00:00.000Z',
	'1970-01-01T00:00:00.000Z'
);
