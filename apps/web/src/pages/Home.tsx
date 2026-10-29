import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, Plus, Route, Search } from 'lucide-react';
import { ARTICLE_CAP, api, subtree, useArticles, useCategories, useFlows, useSession, type ReviewDue } from '../api/client';
import { useSearch, isMac } from '../features/search/SearchDialog';
import { IconTile, Kbd, Skeleton, TEMPLATE_ICON, categoryIcon } from '../components/ui/primitives';
import { fmtDate } from '../lib/text';
import { ErrorState } from '../components/ui/ErrorState';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export function Home() {
  const me = useSession().data!.user!;
  const cats = useCategories();
  const arts = useArticles();
  const flows = useFlows();
  const { setOpen } = useSearch();
  const isEditor = me.role !== 'viewer';
  const review = useQuery({ queryKey: ['review-due'], enabled: isEditor, queryFn: () => api<{ articles: ReviewDue[] }>('/api/admin/review-due?days=30').then((r) => r.articles) });

  const published = useMemo(() => (arts.data ?? []).filter((a) => a.status === 'published'), [arts.data]);
  const tops = useMemo(() => (cats.data ?? []).filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [cats.data]);
  const count = (id: string) => { const ids = subtree(cats.data ?? [], id); return published.filter((a) => a.categoryId && ids.has(a.categoryId)).length; };
  const recent = (arts.data ?? []).filter((a) => a.status !== 'archived').slice(0, 6);

  return (
    <div>
      <section className="animate-rise pt-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[34px] font-semibold tracking-[-0.025em] text-neutral-900">{greeting()}, {me.name}</h1>
          {isEditor && (
            <Link to="/edit/new" className="mt-1.5 inline-flex shrink-0 items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white shadow-button transition-colors hover:bg-primary-hover">
              <Plus size={16} aria-hidden /> New article
            </Link>
          )}
        </div>
        <p className="mt-2 text-[17px] text-neutral-500">
          {arts.isPending ? 'Loading the knowledge base…' : arts.isError ? 'The article list is unavailable right now.' : `${published.length} published article${published.length === 1 ? '' : 's'} across ${tops.length} categories.`}
        </p>
        <button type="button" onClick={() => setOpen(true)}
          className="group mt-7 flex h-[58px] w-full max-w-[640px] items-center gap-3.5 rounded-[18px] bg-white px-5 text-left shadow-md ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-px hover:shadow-lg hover:ring-primary/20">
          <Search size={20} className="text-primary" aria-hidden />
          <span className="flex-1 text-[16px] text-ink-muted">Find a procedure, a client, an error code…</span>
          <span className="flex gap-1" aria-hidden><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
        </button>
      </section>

      {(cats.isError || arts.isError) ? (
        <div className="panel mt-14">
          <ErrorState title="Couldn’t load articles" onRetry={() => { cats.refetch(); arts.refetch(); }} retrying={cats.isFetching || arts.isFetching} />
        </div>
      ) : (<>
      {!!flows.data?.length && (
        <section aria-labelledby="h-flows" className="mt-14 animate-rise [animation-delay:40ms]">
          <div className="flex items-baseline justify-between">
            <h2 id="h-flows" className="text-[17px] font-semibold text-neutral-900">Something not working? Start here</h2>
            <Link to="/flows" className="text-sm font-medium text-primary hover:underline">All guided flows</Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {flows.data.filter((f) => f.status === 'published').slice(0, 3).map((f) => (
              <li key={f.id}>
                <Link to={`/flows/${f.slug}`} className="group flex h-full items-center gap-3.5 rounded-[18px] bg-primary-soft/60 p-4 ring-1 ring-primary/10 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                  <IconTile icon={Route} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug text-neutral-900 group-hover:text-primary">{f.title}</span>
                    <span className="block text-xs text-ink-muted">{f.nodeCount} steps</span>
                  </span>
                  <ArrowRight size={16} className="text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-cats" className="mt-14 animate-rise [animation-delay:80ms]">
        <h2 id="h-cats" className="text-[17px] font-semibold text-neutral-900">Browse by category</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cats.isPending && Array.from({ length: 9 }, (_, i) => <li key={i}><Skeleton className="h-[148px] rounded-[18px]" /></li>)}
          {tops.map((c) => {
            const subs = (cats.data ?? []).filter((s) => s.parentId === c.id);
            const n = count(c.id);
            return (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`}
                  className="group flex h-full flex-col rounded-[18px] bg-white p-5 shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/15">
                  <div className="flex items-start justify-between gap-3">
                    <IconTile icon={categoryIcon(c.name)} className="transition-colors duration-300 group-hover:bg-primary group-hover:text-white" />
                    <span aria-hidden className="rounded-full bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-500 tabular ring-1 ring-inset ring-neutral-200/70">
                      {n} {n === 1 ? 'article' : 'articles'}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[15.5px] font-semibold leading-snug text-neutral-900 transition-colors group-hover:text-primary">{c.name}</h3>
                  {c.description && <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-neutral-500">{c.description}</p>}
                  {subs.length > 0 && <p className="mt-auto truncate pt-3 text-xs text-ink-muted">{subs.map((s) => s.name).join(', ')}</p>}
                  <span className="sr-only">{n} {n === 1 ? 'article' : 'articles'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={clsx('mt-14 grid gap-8 animate-rise [animation-delay:160ms]', isEditor && 'lg:grid-cols-[1.4fr_1fr]')}>
        <section aria-labelledby="h-recent">
          <h2 id="h-recent" className="text-[17px] font-semibold text-neutral-900">Recently updated</h2>
          <ul className="panel mt-4 divide-y divide-neutral-100 overflow-hidden">
            {arts.isPending && [0, 1, 2].map((i) => <li key={i} className="p-4"><Skeleton className="h-5 w-2/3" /></li>)}
            {!arts.isPending && recent.length === 0 && <li className="p-5 text-sm text-neutral-500">Nothing has been published yet.</li>}
            {recent.map((a) => {
              const Icon = TEMPLATE_ICON[a.type];
              return (
                <li key={a.id}>
                  <Link to={`/article/${a.slug}`} className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-neutral-50/80">
                    <IconTile icon={Icon} size="sm" tone="neutral" className="transition-colors group-hover:bg-primary-soft group-hover:text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-neutral-900 group-hover:text-primary">{a.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{a.categoryPath}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted tabular">{fmtDate(a.updatedAt, { day: 'numeric', month: 'short' })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {isEditor && (
          <section aria-labelledby="h-review">
            <h2 id="h-review" className="text-[17px] font-semibold text-neutral-900">Due for review</h2>
            <ul className="panel mt-4 divide-y divide-neutral-100 overflow-hidden">
              {review.isPending && <li className="p-4"><Skeleton className="h-5 w-1/2" /></li>}
              {review.isError && <li className="p-2"><ErrorState compact title="Couldn’t load the review list" detail="Try again in a moment." onRetry={() => review.refetch()} retrying={review.isFetching} /></li>}
              {review.data?.length === 0 && <li className="p-5 text-sm text-neutral-500">Nothing is due in the next 30 days.</li>}
              {review.data?.map((r) => (
                <li key={r.id}>
                  <Link to={`/article/${r.slug}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50/80">
                    <CalendarClock size={16} className={r.overdue ? 'text-danger' : 'text-warning'} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-800 group-hover:text-primary">{r.title}</span>
                    <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular', r.overdue ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                      {r.overdue ? 'Overdue' : fmtDate(r.reviewDate, { day: 'numeric', month: 'short' })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {arts.data?.length === ARTICLE_CAP && <p className="mt-4 text-xs text-ink-muted">Counts and lists use the {ARTICLE_CAP} most recently updated articles.</p>}
      </>)}
    </div>
  );
}
