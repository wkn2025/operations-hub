import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, ChevronDown, Plus, Route, Search } from 'lucide-react';
import { api, countIn, useArticleCounts, useCategories, useRecentArticles, useSession, type ReviewDue } from '../api/client';
import { useSearch, isMac } from '../features/search/SearchDialog';
import { IconTile, Kbd, Skeleton, TEMPLATE_ICON, categoryIcon } from '../components/ui/primitives';
import { fmtDate } from '../lib/text';
import { ErrorState } from '../components/ui/ErrorState';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const articles = (n: number) => `${n} ${n === 1 ? 'article' : 'articles'}`;
const quiet = 'inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 -mx-2 font-medium transition-colors';

export function Home() {
  const me = useSession().data!.user!;
  const cats = useCategories();
  const counts = useArticleCounts();
  const recentQ = useRecentArticles(12);
  const { setOpen } = useSearch();
  const isEditor = me.role !== 'viewer';

  const publishedTotal = (counts.data ?? []).filter((c) => c.status === 'published').reduce((n, c) => n + c.n, 0);
  // archived categories are hidden here like in the sidebar (viewers never receive them; admins manage them in Admin)
  const tops = useMemo(() => (cats.data ?? []).filter((c) => !c.parentId && !c.archived).sort((a, b) => a.sortOrder - b.sortOrder), [cats.data]);
  const count = (id: string) => countIn(counts.data, cats.data ?? [], id, 'published');
  const recent = (recentQ.data ?? []).filter((a) => a.status !== 'archived').slice(0, 5);

  return (
    <div className="mx-auto max-w-[1040px]">
      <section className="animate-rise pt-8 sm:pt-12">
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-neutral-900 sm:text-[38px]">{greeting()}, {me.name}</h1>
        <p className="mt-2 text-[16px] text-neutral-500 sm:text-[17px]">
          {counts.isPending ? 'Loading the knowledge base…' : counts.isError ? 'The article list is unavailable right now.' : `${publishedTotal} published ${publishedTotal === 1 ? 'article' : 'articles'} across ${tops.length} categories.`}
        </p>
        <button type="button" onClick={() => setOpen(true)}
          className="group mt-8 flex h-16 w-full max-w-[720px] items-center gap-4 rounded-[20px] bg-white px-5 text-left shadow-md ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-px hover:shadow-lg hover:ring-primary/20 motion-reduce:hover:translate-y-0">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent text-primary"><Search size={18} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1 truncate text-[16px] text-ink-muted">Search procedures, clients, error codes…</span>
          <span className="hidden gap-1 sm:flex" aria-hidden><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
        </button>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
          <Link to="/flows" className={clsx(quiet, 'group text-primary hover:bg-primary-soft')}>
            <Route size={16} aria-hidden /> Guided flows
            <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          {isEditor && <Link to="/edit/new" className={clsx(quiet, 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')}><Plus size={16} aria-hidden /> New article</Link>}
          {isEditor && <ReviewBadge />}
        </div>
      </section>

      {(cats.isError || counts.isError || recentQ.isError) ? (
        <div className="panel mt-12">
          <ErrorState title="Couldn’t load articles" onRetry={() => { cats.refetch(); counts.refetch(); recentQ.refetch(); }} retrying={cats.isFetching || counts.isFetching || recentQ.isFetching} />
        </div>
      ) : (<>
      <nav aria-labelledby="h-cats" className="mt-14 animate-rise [animation-delay:60ms]">
        <h2 id="h-cats" className="text-[17px] font-semibold text-neutral-900">Categories</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {(cats.isPending || counts.isPending) ? Array.from({ length: 8 }, (_, i) => <li key={i}><Skeleton className="h-[72px] rounded-[20px] sm:h-[124px]" /></li>)
            : tops.map((c) => {
              const n = count(c.id);
              return (
                <li key={c.id}>
                  {/* a row on phones, a tile from sm up */}
                  <Link to={`/category/${c.slug}`} aria-label={`${c.name}, ${articles(n)}`}
                    className="group flex h-full items-center gap-4 rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-accent motion-reduce:hover:translate-y-0 sm:min-h-[124px] sm:flex-col sm:items-start sm:gap-0 sm:p-5">
                    <IconTile icon={categoryIcon(c.name)} tone="accent" />
                    <span className="min-w-0 sm:mt-auto sm:pt-5">
                      <span className="block text-[15px] font-semibold leading-snug text-neutral-900 transition-colors group-hover:text-primary">{c.name}</span>
                      <span className="mt-0.5 block text-[13px] text-neutral-500 tabular">{articles(n)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      <section aria-labelledby="h-recent" className="mt-14 animate-rise [animation-delay:120ms]">
        <h2 id="h-recent" className="text-[17px] font-semibold text-neutral-900">Recently updated</h2>
        <ul className="panel mt-4 divide-y divide-neutral-100 overflow-hidden">
          {recentQ.isPending && [0, 1, 2].map((i) => <li key={i} className="p-4"><Skeleton className="h-5 w-2/3" /></li>)}
          {!recentQ.isPending && recent.length === 0 && <li className="p-5 text-sm text-neutral-500">Nothing has been published yet.</li>}
          {recent.map((a) => (
            <li key={a.id}>
              <Link to={`/article/${a.slug}`} className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-neutral-50/80">
                <IconTile icon={TEMPLATE_ICON[a.type]} size="sm" tone="neutral" className="transition-colors group-hover:bg-accent-soft group-hover:text-accent-ink" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-neutral-900 group-hover:text-primary">{a.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{a.categoryPath}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular">{fmtDate(a.updatedAt, { day: 'numeric', month: 'short' })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      </>)}
    </div>
  );
}

/** Editors only: a small pill with the articles whose review date is within 30 days or past. Hidden when nothing is due. */
function ReviewBadge() {
  const review = useQuery({ queryKey: ['review-due'], queryFn: () => api<{ articles: ReviewDue[] }>('/api/admin/review-due?days=30').then((r) => r.articles) });
  if (review.isError) return (
    <button type="button" onClick={() => review.refetch()} disabled={review.isFetching} className={clsx(quiet, 'text-neutral-500 hover:bg-neutral-100')}>
      <CalendarClock size={16} aria-hidden /> Review dates unavailable, retry
    </button>
  );
  const due = review.data ?? [];
  if (!due.length) return null;
  const overdue = due.some((r) => r.overdue);
  return (
    <Menu.Root>
      <Menu.Trigger className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium tabular transition-colors',
        overdue ? 'bg-danger-soft text-danger hover:bg-danger/15' : 'bg-warning-soft text-warning hover:bg-warning/15')}>
        <CalendarClock size={14} aria-hidden /> {due.length} due for review <ChevronDown size={13} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={8} className="glass z-50 w-[min(360px,calc(100vw-32px))] rounded-[14px] p-1.5 animate-menu-in">
          {due.map((r) => (
            <Menu.Item key={r.id} asChild>
              <Link to={`/article/${r.slug}`} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13.5px] text-neutral-800 outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary">
                <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular', r.overdue ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                  {r.overdue ? 'Overdue' : fmtDate(r.reviewDate, { day: 'numeric', month: 'short' })}
                </span>
              </Link>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
