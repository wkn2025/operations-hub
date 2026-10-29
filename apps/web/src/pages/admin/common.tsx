import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@ops/shared';
import { api, type ArticleSummary } from '../../api/client';
import { ErrorState } from '../../components/ui/ErrorState';
import { adminError } from './ops';

export interface AdminUser {
  id: string; email: string; name: string; role: Role; active: boolean; roleSetByAdmin: boolean; bootstrap: boolean;
  createdAt: string; lastLoginAt: string | null;
}
export const useAdminUsers = () =>
  useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users) });

/** Articles of one status (admins see every status); capped like the rest of the app. */
export const useArticlesByStatus = (status: string) =>
  useQuery({ queryKey: ['articles', 'status', status], queryFn: () => api<{ articles: ArticleSummary[] }>(`/api/articles?status=${status}&limit=200`).then((r) => r.articles) });

/**
 * Runs an admin write, then refreshes everything cached (sidebar, lists, article views) so every screen agrees
 * without a reload. Errors become a sentence via adminError; refreshing also happens on failure (state may have moved).
 */
export function useAdminAction() {
  const qc = useQueryClient();
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError({ key, message: adminError(e) }); } finally {
      await qc.invalidateQueries();
      setBusy(null);
    }
  };
  return { run, busy, errorFor: (key: string) => (error?.key === key ? error.message : null), clearError: () => setError(null) };
}

export function PageHeader({ title, intro, children }: { title: string; intro: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">{title}</h2>
        <p className="mt-1 max-w-[64ch] text-[14.5px] text-neutral-500">{intro}</p>
      </div>
      {children}
    </div>
  );
}

/** Loading / error / empty wrapper for a list query. */
export function QueryBlock<T>({ q, what, empty, children }: {
  q: { isPending: boolean; isError: boolean; isFetching: boolean; data?: T[]; refetch: () => unknown }; what: string; empty: string; children: (rows: T[]) => ReactNode;
}) {
  if (q.isError) return <div className="panel"><ErrorState title={`Couldn’t load ${what}`} onRetry={() => q.refetch()} retrying={q.isFetching} /></div>;
  if (q.isPending) return <p className="panel px-5 py-8 text-center text-sm text-ink-muted" aria-busy="true">Loading {what}…</p>;
  if (!q.data?.length) return <p className="panel px-5 py-10 text-center text-[15px] text-neutral-500">{empty}</p>;
  return <>{children(q.data)}</>;
}

export function InlineError({ message, className = '' }: { message: string | null; className?: string }) {
  return message ? <p role="alert" className={'mt-1.5 rounded-[10px] bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger ' + className}>{message}</p> : null;
}

export const th = 'px-4 py-2.5 text-left text-xs font-medium text-ink-muted';
export const td = 'px-4 py-3 align-top text-[14px] text-neutral-700';
export const field = 'rounded-[10px] border border-neutral-200 bg-white px-2.5 py-1.5 text-[14px] text-neutral-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
export const smallBtn = 'inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50';

export function Table({ label, head, children }: { label: string; head: string[]; children: ReactNode }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full border-collapse" aria-label={label}>
        <thead className="border-b border-neutral-200/80 bg-neutral-50/70"><tr>{head.map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-neutral-200/70">{children}</tbody>
      </table>
    </div>
  );
}
