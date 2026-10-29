import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowUp, CornerDownRight, Download, Paperclip } from 'lucide-react';
import type { PmNode } from '@ops/shared';
import { api, HttpError, useArticle, useArticles, useCategories, type ArticleSummary, type FileRef } from '../../api/client';
import { Breadcrumbs, categoryCrumbs } from '../../components/ui/Breadcrumbs';
import { IconTile, Skeleton, TEMPLATE_ICON } from '../../components/ui/primitives';
import { useActiveCategory } from '../../layout/Shell';
import { headingsOf, type Heading } from '../../lib/text';
import { NotFound } from '../../pages/NotFound';
import { ArticleTemplate } from './templates';

const imageSrcs = (n: PmNode, out = new Set<string>()) => {
  if (n?.type === 'image' && typeof n.attrs?.src === 'string') out.add(n.attrs.src);
  (n?.content ?? []).forEach((c) => imageSrcs(c, out));
  return out;
};
const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function ArticlePage() {
  const { slug = '' } = useParams();
  const q = useArticle(slug);
  const cats = useCategories();
  const list = useArticles();
  const a = q.data;
  useActiveCategory(a?.categoryId);
  useEffect(() => { if (a) document.title = `${a.title} · Operations Hub`; return () => { document.title = 'Operations Hub'; }; }, [a]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);

  const files = useQuery({ queryKey: ['files', a?.id], enabled: !!a, queryFn: () => api<{ files: FileRef[] }>(`/api/articles/${a!.id}/files`).then((r) => r.files) });
  const backlinks = useQuery({ queryKey: ['backlinks', a?.id], enabled: !!a, queryFn: () => api<{ backlinks: ArticleSummary[] }>(`/api/articles/${a!.id}/backlinks`).then((r) => r.backlinks) });
  const headings = useMemo(() => headingsOf(a?.content).filter((h) => h.level <= 3), [a?.content]);

  if (q.isPending) return <ArticleSkeleton />;
  if (q.error) return <NotFound what="article" key={(q.error as HttpError).status} />;
  if (!a) return null;

  const inline = imageSrcs(a.content);
  const attachments = (files.data ?? []).filter((f) => !inline.has(f.url));
  const related = (list.data ?? []).filter((x) => x.id !== a.id && x.categoryId === a.categoryId && x.status === 'published').slice(0, 4);
  const back = backlinks.data ?? [];
  const catName = a.categoryPath.split(' / ').pop();

  return (
    <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 max-w-[760px]">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, ...categoryCrumbs(a.categoryPath, cats.data ?? []), { label: a.title }]} />
        <div className="mt-7"><ArticleTemplate key={a.id} article={a} /></div>

        {attachments.length > 0 && (
          <section aria-labelledby="h-files" className="mt-14">
            <h2 id="h-files" className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900"><Paperclip size={16} className="text-neutral-400" aria-hidden /> Attachments</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {attachments.map((f) => (
                <li key={f.id}>
                  <a href={f.url} className="group flex items-center gap-3 rounded-[14px] bg-white px-3.5 py-3 shadow-sm ring-1 ring-neutral-200/80 transition-shadow hover:shadow-md">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500 ring-1 ring-inset ring-neutral-200">{f.name.split('.').pop()?.slice(0, 4)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-800">{f.name}</span><span className="text-xs text-neutral-400 tabular">{size(f.size)}</span></span>
                    <Download size={16} className="text-neutral-400 transition-colors group-hover:text-primary" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(related.length > 0 || back.length > 0) && (
          <div className="mt-14 grid gap-8 border-t border-neutral-200/70 pt-10 sm:grid-cols-2">
            {related.length > 0 && (
              <section aria-labelledby="h-related">
                <h2 id="h-related" className="text-[15px] font-semibold text-neutral-900">More in {catName}</h2>
                <ul className="mt-3 space-y-1">
                  {related.map((r) => <MiniLink key={r.id} a={r} />)}
                </ul>
              </section>
            )}
            {back.length > 0 && (
              <section aria-labelledby="h-back">
                <h2 id="h-back" className="text-[15px] font-semibold text-neutral-900">Linked from</h2>
                <ul className="mt-3 space-y-1">
                  {back.map((r) => (
                    <li key={r.id}>
                      <Link to={`/article/${r.slug}`} className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 -mx-2 text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-primary">
                        <CornerDownRight size={15} className="shrink-0 text-neutral-400" aria-hidden /><span className="truncate">{r.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-[104px]">{headings.length > 1 && <Toc headings={headings} />}</div>
      </aside>
    </div>
  );
}

function MiniLink({ a }: { a: ArticleSummary }) {
  return (
    <li>
      <Link to={`/article/${a.slug}`} className="group -mx-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-primary">
        <IconTile icon={TEMPLATE_ICON[a.type]} size="sm" tone="neutral" />
        <span className="truncate">{a.title}</span>
      </Link>
    </li>
  );
}

function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState(headings[0]?.id);
  useEffect(() => {
    // active = last heading scrolled past the sticky top bar
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = headings[0]?.id;
      for (const h of headings) { const el = document.getElementById(h.id); if (el && el.getBoundingClientRect().top < 140) cur = h.id; }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [headings]);
  return (
    <nav aria-label="On this page">
      <p className="text-[13px] font-semibold text-neutral-900">On this page</p>
      <ul className="relative mt-3 space-y-0.5 border-l border-neutral-200">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} aria-current={active === h.id ? 'location' : undefined}
              onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setActive(h.id); history.replaceState(null, '', `#${h.id}`); }}
              className={clsx('-ml-px block border-l py-1 text-[13px] leading-snug transition-colors duration-200',
                h.level === 3 ? 'pl-6' : 'pl-3.5',
                active === h.id ? 'border-primary font-medium text-primary' : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800')}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="mt-5 flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-700">
        <ArrowUp size={13} aria-hidden /> Back to top
      </button>
    </nav>
  );
}

function ArticleSkeleton() {
  return (
    <div className="max-w-[760px] space-y-4" aria-busy="true" aria-label="Loading article">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-8 h-10 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <div className="space-y-3 pt-10">{[90, 80, 95, 60].map((w) => <Skeleton key={w} className="h-4" />)}</div>
    </div>
  );
}
