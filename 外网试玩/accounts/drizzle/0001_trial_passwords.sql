ALTER TABLE `trial_accounts` ADD COLUMN `password_hash` text;
--> statement-breakpoint
ALTER TABLE `trial_sessions` ADD COLUMN `setup_digest` text;
--> statement-breakpoint
ALTER TABLE `trial_sessions` ADD COLUMN `setup_expires_at` integer;
