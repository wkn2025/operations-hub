-- Hand-written: FTS5 index for search. Kept in sync by services/search (same transaction as article save).
-- article_id is UNINDEXED (join key only, not searchable).
CREATE VIRTUAL TABLE `article_fts` USING fts5(
  `title`, `body`, `tags`, `category`, `client`, `terms`,
  `article_id` UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
