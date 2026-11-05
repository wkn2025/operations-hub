import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ArticleStatus, ArticleType, ClientDocKind, ClientLine, FlowNode, FlowValidation, PmNode, Role, TemplateFields } from '@ops/shared';

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
  /** explicit related articles (readable ones only); empty -> UI falls back to same-category articles */
  /** published guided flow attached to this article (set from the flow editor) */
  flow?: { id: string; slug: string; title: string } | null;
  related?: { id: string; title: string; slug: string; status: ArticleStatus; type?: ArticleType }[];
  /** what the server would allow this user to do right now (UI hints only; the server still enforces) */
  permissions?: { write: boolean; publish: boolean; submit: boolean; archive: boolean };
}
export type ArticleSummary = Pick<Article, 'id' | 'slug' | 'title' | 'type' | 'status' | 'categoryId' | 'categoryPath' | 'revision' | 'updatedAt' | 'publishedAt' | 'reviewDate'> & { summary?: string | null; ownerId?: string | null; client?: string | null; line?: ClientLine | null; docKind?: ClientDocKind | null };
export interface SearchHit { id: string; title: string; snippet: string; categoryPath: string }
export interface SearchGroup { kind: 'article' | 'flow' | 'category' | 'tag' | 'glossary'; hits: SearchHit[] }
export interface FileRef { id: string; url: string; name: string; mime: string; size: number; source?: 'attached' | 'embedded' }
export interface ReviewDue { id: string; slug: string; title: string; reviewDate: string; overdue: boolean }

// ---- hooks ----
export const useSession = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), staleTime: 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/api/categories').then((r) => r.categories) });
// ---- article lists: server-side filters + paging (GET /api/articles returns { articles, total }) ----
export interface ArticleFilter { status?: string; categoryId?: string; within?: string; ownerId?: string; q?: string; sort?: 'updated' | 'title' }
export interface ArticleListPage { articles: ArticleSummary[]; total: number }
export const PAGE_SIZE = 50;
export const fetchArticles = (f: ArticleFilter & { limit: number; offset?: number }) =>
  api<ArticleListPage>(`/api/articles?${new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`);
/** Newest updated articles (home "Recently updated", link picker suggestions). */
export const useRecentArticles = (limit = 12) =>
  useQuery({ queryKey: ['articles', 'recent', limit], queryFn: () => fetchArticles({ limit }).then((r) => r.articles) });
/** All articles matching a filter, PAGE_SIZE at a time; `data` is the loaded rows, `total` the full count, `fetchNextPage` loads more. */
export function useArticlePages(f: ArticleFilter, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: ['articles', 'pages', f], enabled, initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchArticles({ ...f, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => { const n = pages.reduce((s, p) => s + p.articles.length, 0); return n < last.total && last.articles.length ? n : undefined; },
  });
  return { ...q, data: q.data?.pages.flatMap((p) => p.articles), total: q.data?.pages[0]?.total ?? 0 };
}
export interface ArticleCount { categoryId: string | null; status: ArticleStatus; n: number }
export const useArticleCounts = () =>
  useQuery({ queryKey: ['articles', 'counts'], queryFn: () => api<{ counts: ArticleCount[] }>('/api/articles/counts').then((r) => r.counts) });
/** Articles in the subtree of `id` (optionally of one status) from useArticleCounts data. */
export const countIn = (counts: ArticleCount[] | undefined, cats: Category[], id: string, status?: ArticleStatus) => {
  const ids = subtree(cats, id);
  return (counts ?? []).filter((c) => c.categoryId && ids.has(c.categoryId) && (!status || c.status === status)).reduce((n, c) => n + c.n, 0);
};
export const isEditorRole = (role: Role | undefined) => role === 'editor' || role === 'admin';
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

// ---- flows (apps/server routes/flows.ts) ----
export interface FlowArticleRef { status: string; title?: string; slug?: string }
export interface FlowView {
  id: string; slug: string; title: string; status: ArticleStatus; revision: number; startId: string; articleId: string | null;
  article: { id: string; slug: string; title: string } | null;
  nodes: FlowNode[]; articles: Record<string, FlowArticleRef>; updatedAt: string; publishedAt: string | null;
  permissions: { write: boolean; publish: boolean; submit: boolean; archive: boolean };
  /** editors only */
  validation?: FlowValidation;
}
export interface FlowSummary {
  id: string; slug: string; title: string; status: ArticleStatus; updatedAt: string; articleId: string | null;
  article: { id: string; slug: string; title: string } | null; nodeCount: number; startText: string;
}
export const useFlows = () => useQuery({ queryKey: ['flows'], queryFn: () => api<{ flows: FlowSummary[] }>('/api/flows').then((r) => r.flows) });
export const useFlow = (key: string) => useQuery({ queryKey: ['flow', key], queryFn: () => api<FlowView>(`/api/flows/${encodeURIComponent(key)}`), retry: false });
