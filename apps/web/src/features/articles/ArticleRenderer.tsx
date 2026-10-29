import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Archive, Check, ChevronRight, CircleCheck, Info, Lightbulb, OctagonAlert, TriangleAlert, Unlink, type LucideIcon } from 'lucide-react';
import type { CalloutKind, PmNode } from '@ops/shared';
import { api, type Article, type LinkTarget } from '../../api/client';
import { headingsOf, safeHref } from '../../lib/text';

/**
 * Renders stored ProseMirror JSON as React elements. Never uses dangerouslySetInnerHTML: every string ends up as a text node,
 * every href passes safeHref(), unknown nodes degrade to their children.
 */
interface Ctx { links: Record<string, LinkTarget>; headingIds: Map<PmNode, string> }
const RenderCtx = createContext<Ctx>({ links: {}, headingIds: new Map() });

/** Optional: lets a template make steps checkable (UI state only). */
export interface StepState { isDone: (n: PmNode) => boolean; toggle: (n: PmNode) => void }
export const StepStateCtx = createContext<StepState | null>(null);

export function ArticleRenderer({ doc, links = {} }: { doc: PmNode | null | undefined; links?: Record<string, LinkTarget> }) {
  const headingIds = useMemo(() => new Map(headingsOf(doc).map((h) => [h.node, h.id])), [doc]);
  if (!doc || !Array.isArray(doc.content)) return null;
  return (
    <RenderCtx.Provider value={{ links, headingIds }}>
      <div className="prose-ops">{renderAll(doc.content)}</div>
    </RenderCtx.Provider>
  );
}

const renderAll = (nodes: PmNode[] | undefined): ReactNode => (Array.isArray(nodes) ? nodes.map((n, i) => <Node key={i} n={n} />) : null);

function Node({ n }: { n: PmNode }): ReactNode {
  const ctx = useContext(RenderCtx);
  if (!n || typeof n !== 'object') return null;
  const kids = renderAll(n.content);
  switch (n.type) {
    case 'text': return <Marks text={typeof n.text === 'string' ? n.text : ''} marks={n.marks} />;
    case 'paragraph': return <p>{kids}</p>;
    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(n.attrs?.level) || 2)); // h1 belongs to the page title
      const H = `h${level}` as 'h2' | 'h3' | 'h4';
      return <H id={ctx.headingIds.get(n)}>{kids}</H>;
    }
    case 'bulletList': return <ul>{kids}</ul>;
    case 'orderedList': return <ol start={Number(n.attrs?.start) || undefined}>{kids}</ol>;
    case 'listItem': return <li>{kids}</li>;
    case 'blockquote': return <blockquote>{kids}</blockquote>;
    case 'hardBreak': return <br />;
    case 'horizontalRule': return <hr />;
    case 'codeBlock': return <CodeBlock n={n} />;
    case 'callout': return <Callout n={n}>{kids}</Callout>;
    case 'collapsible': return <Collapsible title={String(n.attrs?.title ?? 'Details')} defaultOpen={!!n.attrs?.open}>{kids}</Collapsible>;
    case 'steps': return <Steps n={n} />;
    case 'taskList': return <ul className="!list-none !pl-0 space-y-1.5">{kids}</ul>;
    case 'taskItem': return <TaskItem n={n} />;
    case 'table': return <Table n={n} />;
    case 'image': return <Figure n={n} />;
    case 'internalLink': return <InternalLink n={n} />;
    default: return <>{kids}</>;
  }
}

function Marks({ text, marks }: { text: string; marks?: PmNode['marks'] }) {
  let el: ReactNode = text;
  for (const m of Array.isArray(marks) ? marks : []) {
    switch (m?.type) {
      case 'bold': el = <strong>{el}</strong>; break;
      case 'italic': el = <em>{el}</em>; break;
      case 'underline': el = <u className="underline-offset-2">{el}</u>; break;
      case 'strike': el = <s>{el}</s>; break;
      case 'code': el = <code>{el}</code>; break;
      case 'highlight': el = <mark>{el}</mark>; break;
      case 'link': {
        const href = safeHref(m.attrs?.href);
        if (href) {
          const external = /^https?:/i.test(href);
          el = <a className="ext" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{el}</a>;
        }
        break;
      }
    }
  }
  return <>{el}</>;
}

const CALLOUT: Record<CalloutKind, { icon: LucideIcon; label: string; box: string; icon_: string }> = {
  info: { icon: Info, label: 'Note', box: 'bg-primary-soft/70 ring-primary/10', icon_: 'text-primary' },
  tip: { icon: Lightbulb, label: 'Tip', box: 'bg-accent-soft/80 ring-accent/30', icon_: 'text-accent-ink' },
  warning: { icon: TriangleAlert, label: 'Warning', box: 'bg-warning-soft ring-warning/15', icon_: 'text-warning' },
  danger: { icon: OctagonAlert, label: 'Important', box: 'bg-danger-soft ring-danger/15', icon_: 'text-danger' },
  success: { icon: CircleCheck, label: 'Success', box: 'bg-success-soft ring-success/15', icon_: 'text-success' },
};

function Callout({ n, children }: { n: PmNode; children: ReactNode }) {
  const kind = (Object.keys(CALLOUT).includes(String(n.attrs?.kind)) ? n.attrs!.kind : 'info') as CalloutKind;
  const c = CALLOUT[kind], Icon = c.icon;
  const title = typeof n.attrs?.title === 'string' && n.attrs.title ? n.attrs.title : null;
  return (
    <div role="note" aria-label={title ?? c.label} data-kind={kind} className={clsx('!mt-6 flex gap-3 rounded-[14px] px-4 py-3.5 ring-1 ring-inset', c.box)}>
      <Icon size={18} strokeWidth={2} className={clsx('mt-[3px] shrink-0', c.icon_)} aria-hidden />
      <div className="min-w-0 flex-1 text-[15px] leading-[1.65] [&>*+*]:mt-2">
        {title && <p className="font-semibold text-neutral-900">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function Collapsible({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={clsx('rounded-[14px] ring-1 ring-inset transition-colors', open ? 'bg-white ring-neutral-200 shadow-sm' : 'bg-neutral-50/70 ring-neutral-200/80 hover:bg-neutral-50')}>
      <button type="button" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[14px] px-4 py-3 text-left text-[15px] font-medium text-neutral-800">
        <ChevronRight size={16} className={clsx('shrink-0 text-neutral-400 transition-transform duration-300 ease-out', open && 'rotate-90 text-primary')} aria-hidden />
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }} className="overflow-hidden">
            <div className="px-4 pb-4 pl-[42px] text-[15px] [&>*+*]:mt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Steps({ n }: { n: PmNode }) {
  const steps = (n.content ?? []).filter((s) => s?.type === 'step');
  const state = useContext(StepStateCtx);
  return (
    <ol aria-label="Procedure" className="!mt-7 !list-none !pl-0">
      {steps.map((s, i) => {
        const done = state?.isDone(s) ?? false;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-4 !mt-0 pb-6 last:pb-0">
            {!last && <span aria-hidden className={clsx('absolute left-[15px] top-9 bottom-1 w-px', done ? 'bg-accent' : 'bg-neutral-200')} />}
            {state ? (
              <button type="button" onClick={() => state.toggle(s)} aria-pressed={done} aria-label={`Mark step ${i + 1} ${done ? 'not done' : 'done'}`}
                className={clsx('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular transition-all duration-300 ease-out',
                  done ? 'bg-accent text-neutral-900 shadow-[0_0_0_4px_var(--color-accent-soft)]' : 'bg-white text-primary ring-1 ring-primary/25 hover:ring-primary/60 hover:shadow-md')}>
                {done ? <Check size={16} strokeWidth={2.6} /> : i + 1}
              </button>
            ) : (
              <span aria-hidden className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-primary ring-1 ring-primary/25 tabular">{i + 1}</span>
            )}
            <div className={clsx('min-w-0 flex-1 pt-1 transition-opacity duration-300 [&>*+*]:mt-2.5', done && 'opacity-60')}>
              {typeof s.attrs?.title === 'string' && <p className="font-semibold text-neutral-900">{s.attrs.title}</p>}
              {renderAll(s.content)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TaskItem({ n }: { n: PmNode }) {
  const [checked, setChecked] = useState(!!n.attrs?.checked);
  return (
    <li className="!mt-0">
      <label className="group flex cursor-pointer items-start gap-3 rounded-[10px] px-2 py-1.5 -mx-2 transition-colors hover:bg-neutral-50">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span aria-hidden className={clsx('mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] ring-1 ring-inset transition-all duration-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary',
          checked ? 'bg-primary ring-primary text-white' : 'bg-white ring-neutral-300 group-hover:ring-primary/50')}>
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
        <span className={clsx('min-w-0 flex-1 transition-colors [&>p]:m-0', checked && 'text-neutral-500 line-through decoration-neutral-300')}>{renderAll(n.content)}</span>
      </label>
    </li>
  );
}

function Table({ n }: { n: PmNode }) {
  const rows = (n.content ?? []).filter((r) => r?.type === 'tableRow');
  return (
    <div className="!mt-6 overflow-x-auto rounded-[14px] bg-white shadow-sm ring-1 ring-neutral-200">
      <table className="w-full border-collapse text-left text-[14.5px] leading-snug tabular">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-100 last:border-0 transition-colors hover:bg-neutral-50/60">
              {(r.content ?? []).map((cell, j) => {
                const Tag = cell?.type === 'tableHeader' ? 'th' : 'td';
                return (
                  <Tag key={j} {...(Tag === 'th' ? { scope: 'col' } : {})}
                    colSpan={Number(cell?.attrs?.colspan) || undefined} rowSpan={Number(cell?.attrs?.rowspan) || undefined}
                    className={clsx('px-4 py-2.5 align-top [&>p]:m-0 [&>*+*]:mt-1.5',
                      Tag === 'th' ? 'bg-neutral-50 text-[13px] font-semibold text-neutral-600' : 'text-neutral-800', j === 0 && Tag === 'td' && 'font-medium text-neutral-900')}>
                    {renderAll(cell?.content)}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ n }: { n: PmNode }) {
  const src = safeHref(n.attrs?.src);
  if (!src || src.startsWith('mailto:')) return null;
  const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : '';
  const caption = typeof n.attrs?.title === 'string' ? n.attrs.title : null;
  return (
    <figure className="!mt-7">
      <div className="overflow-hidden rounded-[16px] bg-neutral-50 shadow-md ring-1 ring-neutral-200/80">
        <img src={src} alt={alt} loading="lazy" className="block h-auto w-full" />
      </div>
      {caption && <figcaption className="mt-2.5 text-center text-[13px] text-neutral-500">{caption}</figcaption>}
    </figure>
  );
}

function CodeBlock({ n }: { n: PmNode }) {
  const lang = typeof n.attrs?.language === 'string' ? n.attrs.language : '';
  const text = (n.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('');
  return (
    <div className="relative !mt-5">
      {lang && lang !== 'text' && <span className="absolute right-3 top-2 text-[11px] font-medium text-ink-muted">{lang}</span>}
      <pre className="overflow-x-auto rounded-[14px] bg-neutral-50 px-4 py-3.5 font-mono text-[13.5px] leading-relaxed text-neutral-800 ring-1 ring-inset ring-neutral-200"><code>{text}</code></pre>
    </div>
  );
}

function InternalLink({ n }: { n: PmNode }) {
  const { links } = useContext(RenderCtx);
  const id = typeof n.attrs?.articleId === 'string' ? n.attrs.articleId : '';
  const label = typeof n.attrs?.label === 'string' && n.attrs.label ? n.attrs.label : 'Linked article';
  const known = links[id];
  const q = useQuery({
    queryKey: ['article', id], enabled: !known && !!id, retry: false, staleTime: 60_000,
    queryFn: () => api<Article>(`/api/articles/${encodeURIComponent(id)}`),
  });
  const t: LinkTarget | undefined = known ?? (q.data ? { status: q.data.status, title: q.data.title, slug: q.data.slug } : q.isError || !id ? { status: 'unavailable' } : undefined);
  if (t?.slug) {
    return (
      <Link to={`/article/${t.slug}`} className="font-medium text-primary underline decoration-primary/25 decoration-[1.5px] underline-offset-[3px] transition-colors hover:decoration-primary">
        {t.title ?? label}
      </Link>
    );
  }
  if (!t) return <span className="text-neutral-500">{label}</span>;
  const archived = t.status === 'archived';
  const Icon = archived ? Archive : Unlink;
  return (
    <span title={archived ? 'This article is archived' : 'This article is not available'}
      className="inline-flex items-baseline gap-1 rounded-md bg-neutral-100 px-1.5 text-neutral-500">
      <Icon size={12} className="self-center" aria-hidden />
      <span>{label}</span>
      <span className="sr-only">{archived ? '(archived)' : '(unavailable)'}</span>
    </span>
  );
}
