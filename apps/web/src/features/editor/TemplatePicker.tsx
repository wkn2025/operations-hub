import { useId, useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { ARTICLE_TYPES, TEMPLATE_LABELS, type ArticleType, type PmNode } from '@ops/shared';
import { useCategories } from '../../api/client';
import { IconTile, TEMPLATE_ICON } from '../../components/ui/primitives';
import { categoryOptions } from './MetaPanel';

const t = (text: string): PmNode => ({ type: 'text', text });
const h2 = (s: string): PmNode => ({ type: 'heading', attrs: { level: 2 }, content: [t(s)] });
const p = (s?: string): PmNode => ({ type: 'paragraph', ...(s ? { content: [t(s)] } : {}) });
const steps = (n: number): PmNode => ({ type: 'steps', content: Array.from({ length: n }, () => ({ type: 'step', attrs: { title: null }, content: [p()] })) });
const cell = (type: 'tableHeader' | 'tableCell', s?: string): PmNode => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(s)] });
const row = (type: 'tableHeader' | 'tableCell', ...xs: (string | undefined)[]): PmNode => ({ type: 'tableRow', content: xs.map((x) => cell(type, x)) });

/** Starting structure for each template; empty blocks show placeholders. */
export const STARTER: Record<ArticleType, PmNode> = {
  standard: { type: 'doc', content: [p()] },
  work_instruction: { type: 'doc', content: [h2('Before you start'), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p()] }] }, h2('Procedure'), steps(3), h2('Exceptions'), p()] },
  client_terms: { type: 'doc', content: [h2('Coverage'), { type: 'table', content: [row('tableHeader', 'Service', 'Covered', 'Limit'), row('tableCell', undefined, undefined, undefined), row('tableCell', undefined, undefined, undefined)] }, h2('Exclusions'), { type: 'bulletList', content: [{ type: 'listItem', content: [p()] }] }, h2('Claims handling'), p()] },
  technical: { type: 'doc', content: [h2('Overview'), p(), h2('Configuration'), { type: 'codeBlock', attrs: { language: null } }, h2('Known issues'), p()] },
  troubleshooting: { type: 'doc', content: [h2('Checks'), steps(3), { type: 'callout', attrs: { kind: 'info', title: null }, content: [p('If the checks don’t solve it, escalate to the EDI team with the case number.')] }] },
  glossary: { type: 'doc', content: [h2('In practice'), p()] },
};

const DESCRIPTION: Record<ArticleType, string> = {
  standard: 'Free-form article for anything that isn’t a procedure.',
  work_instruction: 'Purpose, scope and a numbered procedure readers can tick off.',
  client_terms: 'Contract facts, key limits and a coverage table for one client.',
  technical: 'How a system is set up: versions, configuration, known issues.',
  troubleshooting: 'Symptom, cause and the checks that fix it.',
  glossary: 'One term or acronym with its definition and aliases.',
};

/** Miniature of each template's distinctive look. */
function Miniature({ type }: { type: ArticleType }) {
  const line = (w: string, c = 'bg-neutral-200') => <span className={clsx('block h-1.5 rounded-full', w, c)} />;
  const body: Record<ArticleType, ReactNode> = {
    standard: <div className="space-y-1.5">{line('w-3/4', 'bg-neutral-300')}{line('w-full')}{line('w-11/12')}{line('w-2/3')}</div>,
    work_instruction: (
      <div className="space-y-2">
        <div className="space-y-1 rounded-md bg-white p-1.5 ring-1 ring-neutral-200">{line('w-2/3')}{line('w-1/2')}</div>
        {[1, 2, 3].map((n) => <div key={n} className="flex items-center gap-1.5"><span className="flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-primary ring-1 ring-primary/40">{n}</span>{line('flex-1')}</div>)}
      </div>
    ),
    client_terms: (
      <div className="space-y-2">
        <span className="demo-stripe block h-2.5 rounded-sm ring-1 ring-accent/50" />
        <div className="grid grid-cols-3 gap-1">{['50k', '1.2k', '30d'].map((v) => <span key={v} className="rounded bg-white py-1 text-center text-[8px] font-semibold text-primary ring-1 ring-neutral-200">{v}</span>)}</div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded bg-neutral-200">{Array.from({ length: 6 }, (_, i) => <span key={i} className={clsx('h-2', i < 3 ? 'bg-neutral-100' : 'bg-white')} />)}</div>
      </div>
    ),
    technical: (
      <div className="space-y-1.5">
        <div className="flex gap-1">{['Globo', 'v4'].map((x) => <span key={x} className="rounded bg-primary-soft px-1 text-[7px] font-semibold text-primary">{x}</span>)}</div>
        <div className="space-y-1 rounded-md bg-neutral-100 p-1.5 font-mono">{line('w-3/4', 'bg-neutral-300')}{line('w-1/2', 'bg-neutral-300')}{line('w-2/3', 'bg-neutral-300')}</div>
      </div>
    ),
    troubleshooting: (
      <div className="flex items-center gap-1">
        {['Symptom', 'Cause', 'Fix'].map((x, i) => (
          <span key={x} className="flex items-center gap-1">
            <span className={clsx('rounded px-1 py-1.5 text-[7.5px] font-semibold ring-1', i === 2 ? 'bg-success-soft text-success ring-success/20' : 'bg-white text-neutral-600 ring-neutral-200')}>{x}</span>
            {i < 2 && <span className="text-[8px] text-neutral-400">›</span>}
          </span>
        ))}
      </div>
    ),
    glossary: (
      <div>
        <span className="hl-under text-[18px] font-bold tracking-tight text-neutral-900">GOP</span>
        <div className="mt-1.5 space-y-1">{line('w-full')}{line('w-3/4')}</div>
      </div>
    ),
  };
  return <div aria-hidden className="h-[86px] rounded-[12px] bg-neutral-50 p-3 ring-1 ring-inset ring-neutral-200/70 transition-colors group-hover:bg-white">{body[type]}</div>;
}

export function TemplatePicker({ categoryId, onCategory, onPick }: { categoryId: string | null; onCategory: (id: string | null) => void; onPick: (t: ArticleType) => void }) {
  const cats = useCategories();
  const opts = useMemo(() => categoryOptions(cats.data ?? []), [cats.data]);
  const catId = useId();
  return (
    <div className="max-w-[920px] animate-rise pt-4">
      <h1 className="text-[30px] font-semibold tracking-[-0.025em] text-neutral-900">New article</h1>
      <p className="mt-2 text-[16px] text-neutral-500">Pick the template that fits. You can switch later; the text stays.</p>
      <div className="mt-6 flex items-center gap-3">
        <label htmlFor={catId} className="text-[13px] font-medium text-neutral-700">Category</label>
        <select id={catId} value={categoryId ?? ''} onChange={(e) => onCategory(e.target.value || null)}
          className="rounded-[10px] bg-white px-3 py-2 text-[14px] shadow-sm ring-1 ring-inset ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">Choose later</option>
          {opts.map((c) => <option key={c.id} value={c.id}>{'   '.repeat(c.depth) + c.label}</option>)}
        </select>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ARTICLE_TYPES.map((type) => (
          <li key={type}>
            <button type="button" onClick={() => onPick(type)}
              className="group flex h-full w-full flex-col gap-4 rounded-[18px] bg-white p-4 text-left shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/20 focus-visible:ring-2 focus-visible:ring-primary">
              <Miniature type={type} />
              <span className="flex items-start gap-3">
                <IconTile icon={TEMPLATE_ICON[type]} size="sm" />
                <span>
                  <span className="block text-[15px] font-semibold text-neutral-900">{TEMPLATE_LABELS[type]}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-neutral-500">{DESCRIPTION[type]}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
