export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ARTICLE_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_TYPES = ['standard', 'work_instruction', 'client_terms', 'technical', 'troubleshooting', 'glossary'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const ACTIONS = ['article:read', 'article:write', 'article:publish', 'article:submit', 'article:archive', 'file:upload', 'flow:read', 'flow:write', 'flow:publish', 'flow:submit', 'flow:archive', 'admin'] as const;
export type Action = (typeof ACTIONS)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}
