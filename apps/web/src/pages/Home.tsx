import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, ChevronDown, Plus, Route } from 'lucide-react';
import { api, countIn, useArticleCounts, useCategories, useFlows, useRecentArticles, useSession, type ReviewDue } from '../api/client';
import { IconTile, Skeleton, TEMPLATE_ICON, categoryIcon } from '../components/ui/primitives';
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
        {isEditor && (
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
            <Link to="/edit/new" className={clsx(quiet, 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')}><Plus size={16} aria-hidden /> New article</Link>
            <ReviewBadge />
          </div>
        )}
      </section>

      <FeaturedFlows />

      {(cats.isError || counts.isError || recentQ.isError) ? (
        <div className="panel mt-14">
          <ErrorState title="Couldn’t load articles" onRetry={() => { cats.refetch(); counts.refetch(); recentQ.refetch(); }} retrying={cats.isFetching || counts.isFetching || recentQ.isFetching} />
        </div>
      ) : (<>
      <nav aria-labelledby="h-cats" className="mt-14 animate-rise [animation-delay:120ms]">
        <h2 id="h-cats" className="text-[17px] font-semibold text-neutral-900">Categories</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {(cats.isPending || counts.isPending) ? Array.from({ length: 8 }, (_, i) => <li key={i}><Skeleton className="h-[72px] rounded-[20px] xl:h-[124px]" /></li>)
            : tops.map((c) => {
              const n = count(c.id);
              return (
                <li key={c.id}>
                  {/* a row up to xl (1 or 2 columns), a tile in the 4-column grid */}
                  <Link to={`/category/${c.slug}`} aria-label={`${c.name}, ${articles(n)}`}
                    className="group flex h-full items-center gap-4 rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-accent motion-reduce:hover:translate-y-0 xl:min-h-[124px] xl:flex-col xl:items-start xl:gap-0 xl:p-5">
                    <IconTile icon={categoryIcon(c.name)} tone="accent" />
                    <span className="min-w-0 xl:mt-auto xl:pt-5">
                      <span className="block text-[15px] font-semibold leading-snug text-neutral-900 transition-colors group-hover:text-primary">{c.name}</span>
                      <span className="mt-0.5 block text-[13px] text-neutral-500 tabular">{articles(n)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      <section aria-labelledby="h-recent" className="mt-14 animate-rise [animation-delay:180ms]">
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

/** The featured guided flows (first 3 published by title). Hidden when there are none; a failed load offers a retry. */
function FeaturedFlows() {
  const flows = useFlows();
  const shown = [...(flows.data ?? [])].filter((f) => f.status === 'published').sort((a, b) => a.title.localeCompare(b.title)).slice(0, 3);
  if (flows.isSuccess && !shown.length) return null;
  return (
    <section aria-labelledby="h-flows" className="mt-10 animate-rise rounded-[24px] bg-accent-soft/60 p-4 [animation-delay:60ms] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3.5">
          <span className="hidden sm:block"><IconTile icon={Route} tone="accent" size="lg" /></span>
          <div>
            <h2 id="h-flows" className="text-[17px] font-semibold text-neutral-900">Something not working? Start with a guided flow</h2>
            <p className="mt-0.5 text-[14px] text-neutral-600">Answer a few questions and get straight to the fix.</p>
          </div>
        </div>
        <Link to="/flows" className={clsx(quiet, 'group text-[14px] text-primary hover:bg-white/70')}>
          All guided flows <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </div>
      {flows.isError ? (
        <div className="mt-5"><ErrorState compact title="Couldn’t load the guided flows" onRetry={() => flows.refetch()} retrying={flows.isFetching} /></div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:mt-5 lg:grid-cols-3 lg:gap-4">
          {flows.isPending ? [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-[112px] rounded-[18px] lg:h-[148px]" /></li>)
            : shown.map((f) => (
              <li key={f.id}>
                <Link to={`/flows/${f.slug}`}
                  className="group flex h-full flex-col rounded-[18px] bg-white p-4 shadow-sm ring-1 ring-neutral-200/70 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-accent motion-reduce:hover:translate-y-0 lg:min-h-[148px] lg:p-5">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-snug text-primary">{f.title}</span>
                    {f.startText && <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-neutral-500">{f.startText}</span>}
                  </span>
                  <span className="mt-auto flex w-full items-center gap-3 pt-3 text-[13px] text-ink-muted tabular lg:pt-4">
                    <span>{f.nodeCount} steps</span>
                    <span aria-hidden className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-px motion-reduce:transition-none" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
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
