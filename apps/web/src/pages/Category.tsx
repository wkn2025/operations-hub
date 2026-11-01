import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { FileQuestion, Plus } from 'lucide-react';
import { TEMPLATE_LABELS } from '@ops/shared';
import { countIn, useArticleCounts, useArticlePages, useCategories, useSession } from '../api/client';
import { LoadMore } from '../components/ui/LoadMore';
import { Breadcrumbs, categoryCrumbs } from '../components/ui/Breadcrumbs';
import { IconTile, Skeleton, StatusBadge, TEMPLATE_ICON, categoryIcon } from '../components/ui/primitives';
import { fmtDate } from '../lib/text';
import { NotFound } from './NotFound';
import { ErrorState } from '../components/ui/ErrorState';

export function CategoryPage() {
  const { slug = '' } = useParams();
  const cats = useCategories();
  const counts = useArticleCounts();
  const role = useSession().data?.user?.role;
  const [filter, setFilter] = useState<string | null>(null);
  const all = cats.data ?? [];
  const cat = all.find((c) => c.slug === slug || c.id === slug);
  const arts = useArticlePages({ within: filter ?? cat?.id, sort: 'title' }, !!cat);
  const subs = useMemo(() => (cat ? all.filter((c) => c.parentId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder) : []), [all, cat]);

  if (cats.isPending) return <Skeleton className="mt-8 h-24 w-1/2" />;
  if (cats.isError) return <ErrorState title="Couldn’t load categories" onRetry={() => cats.refetch()} retrying={cats.isFetching} />;
  if (!cat) return <NotFound what="category" />;

  const list = arts.data ?? [];
  const parent = cat.parentId ? all.find((c) => c.id === cat.parentId) : null;
  const top = parent ?? cat;

  return (
    <div key={cat.id}>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, ...categoryCrumbs(cat.path, all)]} />
      <header className="mt-6 flex items-start gap-5">
        <IconTile icon={categoryIcon(top.name)} size="lg" tone="accent" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-neutral-900">{cat.name}</h1>
          <p className="mt-1.5 max-w-[62ch] text-[16px] leading-relaxed text-neutral-500">
            {cat.description ?? (parent ? `Part of ${parent.name}.` : '')}
          </p>
        </div>
        {(role === 'editor' || role === 'admin') && (
          <Link to={`/edit/new?category=${cat.id}`} className="inline-flex shrink-0 items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white shadow-button transition-colors hover:bg-primary-hover">
            <Plus size={16} aria-hidden /> New article
          </Link>
        )}
      </header>

      {subs.length > 0 && (
        <div role="tablist" aria-label="Filter by subcategory" className="mt-8 flex flex-wrap gap-1.5">
          {[{ id: null as string | null, name: 'All' }, ...subs].map((s) => {
            const on = filter === s.id;
            return (
              <button key={s.id ?? 'all'} role="tab" aria-selected={on} type="button" onClick={() => setFilter(s.id)}
                className={clsx('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                  on ? 'bg-primary text-white shadow-sm' : 'bg-white text-neutral-600 ring-1 ring-inset ring-neutral-200 hover:text-neutral-900 hover:ring-neutral-300')}>
                {s.name}
                <span className={clsx('tabular text-xs', on ? 'text-white/80' : 'text-ink-muted')}>{counts.data ? countIn(counts.data, all, s.id ?? cat.id) : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="panel mt-5 overflow-hidden">
        {arts.isPending && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-3/4" />)}</div>}
        {arts.isError && <ErrorState title="Couldn’t load articles" onRetry={() => arts.refetch()} retrying={arts.isFetching} />}
        {arts.isSuccess && list.length === 0 && (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <IconTile icon={FileQuestion} tone="neutral" size="lg" />
            <p className="mt-4 text-[15px] font-medium text-neutral-800">No articles here yet</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              {role === 'viewer' ? 'Check back later, or search the whole hub with Ctrl K.' : 'Articles created in this category will appear here once saved.'}
            </p>
          </div>
        )}
        <ul className="divide-y divide-neutral-100">
          {list.map((a) => {
            const sub = all.find((c) => c.id === a.categoryId);
            return (
              <li key={a.id}>
                <Link to={`/article/${a.slug}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50/70">
                  <IconTile icon={TEMPLATE_ICON[a.type]} tone="neutral" className="transition-colors group-hover:bg-primary-soft group-hover:text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-neutral-900 group-hover:text-primary">{a.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                      {a.summary ?? `${TEMPLATE_LABELS[a.type]}${sub && sub.id !== cat.id ? ` in ${sub.name}` : ''}`}
                    </span>
                  </span>
                  {a.status !== 'published' && <StatusBadge status={a.status} />}
                  <span className="hidden shrink-0 text-[13px] text-ink-muted tabular sm:block">Updated {fmtDate(a.updatedAt, { day: 'numeric', month: 'short' })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <LoadMore q={arts} />
    </div>
  );
}
