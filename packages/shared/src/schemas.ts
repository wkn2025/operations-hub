import { z } from 'zod';
import { ARTICLE_STATUSES, ARTICLE_TYPES, ROLES } from './roles';

export const roleSchema = z.enum(ROLES);
export const articleStatusSchema = z.enum(ARTICLE_STATUSES);
export const articleTypeSchema = z.enum(ARTICLE_TYPES);

export const emailSchema = z.string().trim().toLowerCase().email();
export const devLoginBody = z.object({ email: emailSchema, name: z.string().trim().min(1).max(100).optional() });

// ---- Task 2: categories & articles ----
const pmDocSchema = z.object({ type: z.literal('doc'), content: z.array(z.any()).optional() }).passthrough();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(+d) && d.toISOString().startsWith(v); }, 'invalid date');
const tagList = z.array(z.string().trim().min(1).max(40)).max(30);

export const categoryCreateBody = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().nullish(),
  description: z.string().max(500).nullish(),
  sortOrder: z.number().int().optional(),
});
export const categoryPatchBody = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().nullable(),
  description: z.string().max(500).nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
}).partial();

export const articleCreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  type: articleTypeSchema.optional(),
  categoryId: z.string().nullish(),
  content: pmDocSchema.optional(),
  fields: z.record(z.unknown()).optional(),
  tags: tagList.optional(),
  reviewDate: isoDate.nullish(),
});
export const articlePatchBody = z.object({
  baseRevision: z.number().int().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  type: articleTypeSchema.optional(),
  categoryId: z.string().nullable().optional(),
  content: pmDocSchema.optional(),
  fields: z.record(z.unknown()).optional(),
  tags: tagList.optional(),
  reviewDate: isoDate.nullable().optional(),
  note: z.string().max(200).optional(),
});
