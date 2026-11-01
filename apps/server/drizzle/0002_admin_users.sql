ALTER TABLE `users` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role_set_by_admin` integer DEFAULT false NOT NULL;