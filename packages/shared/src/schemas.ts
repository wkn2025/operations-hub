import { z } from 'zod';
import { ARTICLE_STATUSES, ARTICLE_TYPES, ROLES } from './roles';

export const roleSchema = z.enum(ROLES);
export const articleStatusSchema = z.enum(ARTICLE_STATUSES);
export const articleTypeSchema = z.enum(ARTICLE_TYPES);

export const emailSchema = z.string().trim().toLowerCase().email();
export const devLoginBody = z.object({ email: emailSchema, name: z.string().trim().min(1).max(100).optional() });
