import { sqliteTable, text, integer, primaryKey, unique, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { ArticleStatus, ArticleType, Role } from '@ops/shared';

const id = () => text('id').primaryKey();
const ts = (name: string) => text(name).notNull(); // ISO-8601 strings

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(), // stored lowercase
  name: text('name').notNull(),
  role: text('role').$type<Role>().notNull().default('viewer'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true), // deactivated -> 401 everywhere
  roleSetByAdmin: integer('role_set_by_admin', { mode: 'boolean' }).notNull().default(false), // explicit admin choice beats allowlist
  createdAt: ts('created_at'),
  lastLoginAt: text('last_login_at'),
});

export const editorAllowlist = sqliteTable('editor_allowlist', {
  email: text('email').primaryKey(),
  addedBy: text('added_by').references(() => users.id),
  createdAt: ts('created_at'),
});

export const categories = sqliteTable('categories', {
  id: id(),
  parentId: text('parent_id').references((): AnySQLiteColumn => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: ts('created_at'),
});

export const articles = sqliteTable('articles', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  type: text('type').$type<ArticleType>().notNull().default('standard'),
  status: text('status').$type<ArticleStatus>().notNull().default('draft'),
  categoryId: text('category_id').references(() => categories.id),
  ownerId: text('owner_id').references(() => users.id),
  content: text('content').notNull().default('{}'), // ProseMirror JSON
  contentText: text('content_text').notNull().default(''), // extracted plain text for FTS
  fields: text('fields').notNull().default('{}'), // template-specific JSON
  reviewDate: text('review_date'),
  revision: integer('revision').notNull().default(1),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
  publishedAt: text('published_at'),
}, (t) => [index('articles_status_idx').on(t.status), index('articles_category_idx').on(t.categoryId)]);

export const revisions = sqliteTable('revisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  rev: integer('rev').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  fields: text('fields').notNull().default('{}'),
  authorId: text('author_id').references(() => users.id),
  createdAt: ts('created_at'),
  note: text('note'),
}, (t) => [unique('revisions_article_rev').on(t.articleId, t.rev)]);

export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const articleTags = sqliteTable('article_tags', {
  articleId: text('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.articleId, t.tagId] })]);

export const articleLinks = sqliteTable('article_links', {
  fromArticleId: text('from_article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  toArticleId: text('to_article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('inline'), // 'inline' | 'related'
}, (t) => [primaryKey({ columns: [t.fromArticleId, t.toArticleId, t.kind] })]);

export const files = sqliteTable('files', {
  id: id(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  path: text('path').notNull(), // relative to DATA_DIR/uploads
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: ts('created_at'),
});

/** Attachments: links files to articles. */
export const articleFiles = sqliteTable('article_files', {
  articleId: text('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  fileId: text('file_id').notNull().references(() => files.id),
  source: text('source').notNull().default('attached'), // 'attached' (explicit) or 'embedded' (image in content; re-synced on save)
}, (t) => [primaryKey({ columns: [t.articleId, t.fileId] })]);
export const attachments = articleFiles;

export const flows = sqliteTable('flows', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  articleId: text('article_id').references(() => articles.id, { onDelete: 'set null' }),
  nodes: text('nodes').notNull().default('[]'), // JSON FlowNode[]
  startId: text('start_id'),
  status: text('status').$type<ArticleStatus>().notNull().default('draft'),
  updatedAt: ts('updated_at'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  detail: text('detail'), // JSON
  createdAt: ts('created_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
});
