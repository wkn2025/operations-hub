import { useQuery } from '@tanstack/react-query';
import type { ArticleStatus, ArticleType, PmNode, Role, TemplateFields } from '@ops/shared';

export class HttpError extends Error {
  constructor(public status: number, public body: unknown) { super(`HTTP ${status}`); }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { 'content-type': 'application/json', ...rest.headers } } : {}),
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new HttpError(res.status, body);
  return body as T;
}

// ---- API shapes (mirror apps/server routes) ----
export interface SessionUser { id: string; email: string; name: string; role: Role }
export interface Me { user: SessionUser | null; authMode: 'dev' | 'oidc'; demo: boolean }
export interface Category { id: string; parentId: string | null; name: string; slug: string; description: string | null; sortOrder: number; archived: boolean; path: string }
export interface LinkTarget { status: string; title?: string; slug?: string }
export interface Article {
  id: string; slug: string; title: string; type: ArticleType; status: ArticleStatus; categoryId: string | null; categoryPath: string;
  owner: { id: string; name: string } | null; revision: number; updatedAt: string; publishedAt: string | null; reviewDate: string | null;
  tags: string[]; fields: TemplateFields; content: PmNode; linkTargets: Record<string, LinkTarget>;
}
export type ArticleSummary = Pick<Article, 'id' | 'slug' | 'title' | 'type' | 'status' | 'categoryId' | 'categoryPath' | 'revision' | 'updatedAt' | 'publishedAt' | 'reviewDate'> & { summary?: string | null };
export interface SearchHit { id: string; title: string; snippet: string; categoryPath: string }
export interface SearchGroup { kind: 'article' | 'category' | 'tag' | 'glossary'; hits: SearchHit[] }
export interface FileRef { id: string; url: string; name: string; mime: string; size: number }
export interface ReviewDue { id: string; slug: string; title: string; reviewDate: string; overdue: boolean }

// ---- hooks ----
export const useSession = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), staleTime: 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/api/categories').then((r) => r.categories) });
/** ponytail: one list of up to 200 visible articles feeds counts, category pages and "recent"; paginate when the KB outgrows it. */
export const useArticles = () => useQuery({ queryKey: ['articles'], queryFn: () => api<{ articles: ArticleSummary[] }>('/api/articles?limit=200').then((r) => r.articles) });
export const useArticle = (idOrSlug: string) =>
  useQuery({ queryKey: ['article', idOrSlug], queryFn: () => api<Article>(`/api/articles/${encodeURIComponent(idOrSlug)}`), retry: false });

/** Category ids in the subtree rooted at `id` (inclusive). */
export function subtree(cats: Category[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of cats) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
  }
  return ids;
}
