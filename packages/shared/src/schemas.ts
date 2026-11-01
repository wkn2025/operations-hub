import { z } from 'zod';
import { ARTICLE_STATUSES, ARTICLE_TYPES, ROLES } from './roles';
import type { TemplateFields } from './templates';

export const roleSchema = z.enum(ROLES);
export const articleStatusSchema = z.enum(ARTICLE_STATUSES);
export const articleTypeSchema = z.enum(ARTICLE_TYPES);

export const emailSchema = z.string().trim().toLowerCase().email();
export const devLoginBody = z.object({ email: emailSchema, name: z.string().trim().min(1).max(100).optional() });

// ---- Task 2: categories & articles ----
const pmDocSchema = z.object({ type: z.literal('doc'), content: z.array(z.any()).optional() }).passthrough();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(+d) && d.toISOString().startsWith(v); }, 'invalid date');
/** Max lengths of template text fields; the web MetaPanel uses the same numbers (maxLength + counter). */
export const TEMPLATE_FIELD_MAX = {
  summary: 2000, purpose: 2000, scope: 2000, audience: 200, verification: 2000,
  client: 200, contractRef: 200, region: 200, version: 200,
  symptom: 2000, cause: 2000, fix: 2000, flowId: 200,
  term: 200, acronym: 200, definition: 2000,
} as const satisfies Partial<Record<keyof TemplateFields, number>>;
export const LIST_ITEM_MAX = 100; // systems, aliases, related terms, key-limit label/value
const txt = (k: keyof typeof TEMPLATE_FIELD_MAX) => z.string().max(TEMPLATE_FIELD_MAX[k], `Keep it under ${TEMPLATE_FIELD_MAX[k].toLocaleString('en-GB')} characters`);
const names = z.array(z.string().trim().min(1).max(LIST_ITEM_MAX)).max(30);
/** `articles.fields` (mirrors TemplateFields in templates.ts). Unknown keys are stripped; wrong shapes are rejected. */
export const templateFieldsSchema = z.object({
  summary: txt('summary'), purpose: txt('purpose'), scope: txt('scope'), audience: txt('audience'), verification: txt('verification'),
  client: txt('client'), contractRef: txt('contractRef'), validFrom: isoDate, validTo: isoDate, region: txt('region'),
  keyLimits: z.array(z.object({ label: z.string().trim().min(1).max(LIST_ITEM_MAX), value: z.string().max(LIST_ITEM_MAX) })).max(12),
  systems: names, version: txt('version'),
  symptom: txt('symptom'), cause: txt('cause'), fix: txt('fix'), flowId: txt('flowId'),
  term: txt('term'), acronym: txt('acronym'), definition: txt('definition'), aliases: names, relatedTerms: names,
}).partial().refine((f) => !(f.validFrom && f.validTo && f.validTo < f.validFrom), { message: 'validTo must not be before validFrom', path: ['validTo'] });

const relatedList = z.array(z.string().min(1)).max(20); // explicit 'related' article ids (Task 6)
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
  fields: templateFieldsSchema.optional(),
  tags: tagList.optional(),
  reviewDate: isoDate.nullish(),
  related: relatedList.optional(),
});
export const articlePatchBody = z.object({
  baseRevision: z.number().int().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  type: articleTypeSchema.optional(),
  categoryId: z.string().nullable().optional(),
  content: pmDocSchema.optional(),
  fields: templateFieldsSchema.optional(),
  tags: tagList.optional(),
  reviewDate: isoDate.nullable().optional(),
  note: z.string().max(200).optional(),
  related: relatedList.optional(),
  ownerId: z.string().min(1).optional(),
  /** true = background autosave: may be merged into the author's open revision (see updateArticle) */
  autosave: z.boolean().optional(),
});
