import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowLeft, ArrowUpRight, CircleCheck, FileText, Info, RotateCcw, TriangleAlert, Unlink, type LucideIcon } from 'lucide-react';
import { back, goTo, start, step, type FlowNode, type FlowSeverity, type RunState } from '@ops/shared';
import { useArticle, type FlowArticleRef } from '../../api/client';
import { Button, Kbd, Skeleton } from '../../components/ui/primitives';
import { ArticleRenderer } from '../articles/ArticleRenderer';

export interface RunnableFlow { title: string; startId: string; nodes: FlowNode[]; articles?: Record<string, FlowArticleRef> }

const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;

const SEVERITY: Record<FlowSeverity, { icon: LucideIcon; label: string; tile: string; ring: string }> = {
  info: { icon: Info, label: 'Next step', tile: 'bg-white text-primary', ring: 'bg-primary-soft/60 ring-primary/20' },
  warning: { icon: TriangleAlert, label: 'Needs attention', tile: 'bg-white text-warning', ring: 'bg-warning-soft/70 ring-warning/30' },
  success: { icon: CircleCheck, label: 'All clear', tile: 'bg-white text-success', ring: 'bg-success-soft/60 ring-success/30' },
};

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Shortcuts act only when focus is on the page body or inside the runner: never in dialogs, menus, popovers or other widgets. */
const owns = (root: HTMLElement | null, t: EventTarget | null) =>
  t === document.body || t === document.documentElement || t === null
  || (t instanceof HTMLElement && !!root?.contains(t) && !t.closest('[role=dialog],[role=alertdialog],[role=menu],[role=menuitem],[role=listbox],[role=combobox]'));

/**
 * Guided troubleshooting runner: one question per screen. State lives in the shared pure state machine
 * (step/back/goTo/start), so the editor's "Test run" behaves exactly like the real thing.
 * Keys: 1-9 choose an answer, Backspace goes back (ignored while typing in a field).
 */
export function FlowRunner({ flow, keyboard = true }: { flow: RunnableFlow; keyboard?: boolean }) {
  const [state, setState] = useState<RunState>(() => start(flow));
  const dir = useRef(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const node = flow.nodes.find((n) => n.id === state.nodeId);
  const stuck = !!state.error || !node; // unknown node, loop guard, or the flow changed under us

  const go = (next: RunState, d: number) => { dir.current = d; setState(next); };
  const choose = (i: number) => { const next = step(flow, state, i); go(next, 1); }; // an error state shows the broken-flow panel
  const goBack = () => { if (state.trail.length) go(back(state), -1); };
  const restart = () => go(start(flow), -1);

  const latest = useRef({ choose, goBack, node });
  latest.current = { choose, goBack, node };
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || !owns(rootRef.current, e.target)) return;
      const { choose: c, goBack: b, node: n } = latest.current;
      if (e.key === 'Backspace') { e.preventDefault(); b(); }
      else if (/^[1-9]$/.test(e.key) && n?.kind === 'question' && n.options?.[Number(e.key) - 1]) { e.preventDefault(); c(Number(e.key) - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);

  // move focus to the new screen's heading so keyboard and screen-reader users land on it
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } headingRef.current?.focus({ preventScroll: true }); }, [state.nodeId]);

  const label = (id: string) => flow.nodes.find((n) => n.id === id);
  const crumbs = state.trail.map((id, i) => {
    return { id, i, question: label(id)?.text ?? id, answer: label(id)?.options?.[state.choices[i] ?? -1]?.label ?? '' };
  });

  return (
    <div data-testid="flow-runner" ref={rootRef}>
      <div className="flex items-start gap-3">
        <nav aria-label="Progress" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c) => (
              <li key={c.i} className="flex min-w-0 items-center gap-1.5">
                <button type="button" onClick={() => go(goTo(state, c.i), -1)} title={`${c.question} ${c.answer}`}
                  className="group flex max-w-[220px] flex-col rounded-[10px] bg-white px-3 py-1.5 text-left shadow-sm ring-1 ring-neutral-200 transition-[box-shadow,background-color] hover:bg-primary-soft hover:ring-primary/25">
                  <span className="truncate text-xs font-medium text-neutral-800">{c.question}</span>
                  <span className="truncate text-xs text-primary">{c.answer}</span>
                </button>
                <span aria-hidden className="text-neutral-300">/</span>
              </li>
            ))}
            <li aria-current="step" className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink">
              {crumbs.length === 0 ? 'Start' : node?.kind === 'question' ? 'You are here' : 'Outcome'}
            </li>
          </ol>
        </nav>
        {state.trail.length > 0 && node?.kind === 'question' && <Button variant="ghost" onClick={restart} className="shrink-0 !py-1.5"><RotateCcw size={14} aria-hidden /> Start over</Button>}
      </div>

      <div className="relative mt-6">
        <AnimatePresence mode="wait" initial={false} custom={dir.current}>
          <motion.section key={stuck ? 'stuck' : state.nodeId} custom={dir.current}
            initial={{ opacity: 0, x: dir.current * 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir.current * -36, transition: { duration: 0.12 } }}
            transition={spring}>
            {stuck || !node ? <Broken error={state.error} onRestart={restart} />
              : node.kind === 'question' ? <Question node={node} onChoose={choose} headingRef={headingRef} />
              : node.kind === 'result' ? <Result node={node} headingRef={headingRef} />
              : <ArticleStep node={node} ref_={flow.articles?.[node.articleId ?? '']} headingRef={headingRef} />}
          </motion.section>
        </AnimatePresence>
      </div>

      {!stuck && node && (
        <div className="mt-8 flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} disabled={state.trail.length === 0}><ArrowLeft size={15} aria-hidden /> Back</Button>
          {node.kind !== 'question' && <Button variant="soft" onClick={restart}><RotateCcw size={15} aria-hidden /> Start over</Button>}
          {keyboard && node.kind === 'question' && <p className="ml-auto hidden items-center gap-1.5 text-xs text-ink-muted sm:flex"><Kbd>1</Kbd>–<Kbd>{Math.min(9, node.options?.length ?? 1)}</Kbd> to answer <Kbd>Backspace</Kbd> to go back</p>}
        </div>
      )}
    </div>
  );
}

type HeadingRef = React.RefObject<HTMLHeadingElement>;

function Question({ node, onChoose, headingRef }: { node: FlowNode; onChoose: (i: number) => void; headingRef: HeadingRef }) {
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-neutral-900 outline-none">{node.text}</h2>
      {node.detail && <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-neutral-500">{node.detail}</p>}
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {(node.options ?? []).map((o, i) => (
          <li key={i}>
            <motion.button type="button" onClick={() => onChoose(i)} whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={spring}
              className="group flex min-h-[76px] w-full items-center gap-4 rounded-[18px] bg-white px-5 py-4 text-left shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,background-color] duration-300 hover:shadow-md hover:ring-primary/25">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-[14px] font-semibold text-neutral-600 tabular transition-colors group-hover:bg-primary group-hover:text-white">{i + 1}</span>
              <span className="text-[16.5px] font-medium leading-snug text-neutral-900">
                <span className="sr-only">{i + 1}. </span>{o.label}
              </span>
            </motion.button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ node, headingRef }: { node: FlowNode; headingRef: HeadingRef }) {
  const sev = node.severity ?? 'info';
  const s = SEVERITY[sev];
  const Icon = s.icon;
  return (
    <div data-testid="flow-result" data-severity={sev} className={clsx('rounded-[22px] p-8 shadow-md ring-1', s.ring)}>
      <span className={clsx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium', s.tile)}><Icon size={15} aria-hidden /> {s.label}</span>
      <h2 ref={headingRef} tabIndex={-1} className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-neutral-900 outline-none">{node.text}</h2>
      {node.detail && <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-neutral-600">{node.detail}</p>}
    </div>
  );
}

function ArticleStep({ node, ref_, headingRef }: { node: FlowNode; ref_?: FlowArticleRef; headingRef: HeadingRef }) {
  const gone = !node.articleId || ref_?.status === 'unavailable';
  const art = useArticle(gone ? '' : node.articleId!);
  const unavailable = gone || art.isError;
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-neutral-900 outline-none">{node.text}</h2>
      {node.detail && <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-neutral-500">{node.detail}</p>}
      <div className="mt-6 overflow-hidden rounded-[20px] bg-white shadow-md ring-1 ring-neutral-200/80">
        {unavailable ? (
          <div role="status" className="flex items-center gap-3 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-neutral-100 text-neutral-500"><Unlink size={18} aria-hidden /></span>
            <p className="text-[15px] text-neutral-700"><span className="font-medium text-neutral-900">This article is unavailable.</span> It may have been archived or you may not have access. Ask the flow owner for the right procedure.</p>
          </div>
        ) : art.isPending ? (
          <div className="space-y-3 p-6"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
        ) : (
          <>
            <div className="flex items-start gap-3 border-b border-neutral-100 px-6 py-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-soft text-primary"><FileText size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold text-neutral-900">{art.data.title}</p>
                {art.data.fields?.summary && <p className="mt-0.5 text-sm text-neutral-500">{art.data.fields.summary}</p>}
              </div>
              <Link to={`/article/${art.data.slug}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-button hover:bg-primary-hover">
                Open full article <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
            <div className="max-h-[340px] overflow-y-auto px-6 py-5"><ArticleRenderer doc={art.data.content} links={art.data.linkTargets} /></div>
          </>
        )}
      </div>
    </div>
  );
}

function Broken({ error, onRestart }: { error?: RunState['error']; onRestart: () => void }) {
  const why = error === 'too_many_steps' ? 'It went round in circles too many times.' : 'A step this flow points to no longer exists.';
  return (
    <div role="alert" className="rounded-[22px] bg-danger-soft/60 p-8">
      <h2 className="text-[22px] font-semibold text-neutral-900">We can’t run this flow any further</h2>
      <p className="mt-2 text-[15px] text-neutral-700">{why} Start over, and tell the flow owner if it keeps happening.</p>
      <Button onClick={onRestart} className="mt-5"><RotateCcw size={15} aria-hidden /> Start over</Button>
    </div>
  );
}
