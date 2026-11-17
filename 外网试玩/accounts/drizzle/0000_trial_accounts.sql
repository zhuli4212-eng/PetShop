CREATE TABLE `trial_accounts` (
  `id` text PRIMARY KEY,
  `name_key` text NOT NULL,
  `username` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trial_accounts_name_key_unique` ON `trial_accounts` (`name_key`);
--> statement-breakpoint
CREATE TABLE `trial_sessions` (
  `digest` text PRIMARY KEY,
  `account_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `trial_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trial_sessions_expiry` ON `trial_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `trial_auth_limits` (
  `bucket` text PRIMARY KEY,
  `attempts` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trial_limits_expiry` ON `trial_auth_limits` (`expires_at`);
