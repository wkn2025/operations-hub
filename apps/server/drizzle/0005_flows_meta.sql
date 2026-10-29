ALTER TABLE `flows` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `flows` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `flows` ADD `created_at` text;--> statement-breakpoint
ALTER TABLE `flows` ADD `published_at` text;--> statement-breakpoint
-- Hand-written: FTS5 index for flows (title + all node text). flow_id is the join key only.
CREATE VIRTUAL TABLE `flow_fts` USING fts5(`title`, `body`, `flow_id` UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
