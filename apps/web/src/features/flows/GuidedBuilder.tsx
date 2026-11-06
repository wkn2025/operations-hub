import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, CircleHelp, Undo2, Lock, FileText, Flag, Info, Play, Plus, Send, Sparkles, TriangleAlert, Trophy, Upload, X, CircleCheck } from 'lucide-react';
import { validateFlow, type Flow, type FlowNode, type FlowNodeKind, type FlowOption, type FlowSeverity } from '@ops/shared';
import { api, HttpError, isEditorRole, useSession, type FlowView } from '../../api/client';
import { Button } from '../../components/ui/primitives';
import { ErrorState } from '../../components/ui/ErrorState';
import { NotFound } from '../../pages/NotFound';
import { LinkPicker } from '../editor/LinkPicker';
import { useAutosave } from '../editor/useAutosave';
import { FlowRunner } from './FlowRunner';
import { FlowMap } from './FlowMap';
import { setTarget } from './flowOps';
import { chooseNext, nextTask, progress, undoChoice, type PathStep, type Task } from './guide';

/**
 * /flows/:id/build — the guided builder: one question at a time, like a quest. The author never sees ids, "goes to"
 * dropdowns or a problem list; the next thing to fill in is worked out from the flow itself (guide.ts).
 * The advanced editor (/flows/:id/edit) stays for loops, reordering and bulk edits.
 */
export function BuildFlow() {
  const session = useSession();
  const { id = 'new' } = useParams();
  if (session.isPending) return null;
  if (!isEditorRole(session.data?.user?.role)) return <NotFound what="flow" />;
  return id === 'new' ? <Start /> : <Loader id={id} />;
}

const field = 'w-full rounded-[14px] bg-white px-4 py-3 text-[16px] text-neutral-900 shadow-sm ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function Start() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (title: string) => {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const f = await api<FlowView>('/api/flows', { method: 'POST', json: { title, startId: 'q1', nodes: [{ id: 'q1', kind: 'question', text: '' }] } });
      void qc.invalidateQueries({ queryKey: ['flows'] });
      navigate(`/flows/${f.id}/build`, { replace: true });
    } catch { setError('The flow couldn’t be created. Check your connection and try again.'); setBusy(false); }
  };
  return (
    <Stage>
      <Card step="Let’s build a guided flow" icon={Sparkles} title="What problem will this flow help people solve?"
        hint="Write it the way a colleague would describe it. You can change it later.">
        <OneLine label="Flow title" placeholder="For example: The printer won’t print" max={200} submit="Start building" busy={busy} onSubmit={start} />
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    </Stage>
  );
}

function Loader({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['edit-flow', id], retry: false, staleTime: 0, gcTime: 0, queryFn: () => api<FlowView>(`/api/flows/${encodeURIComponent(id)}`) });
  if (q.isPending) return <p className="py-16 text-center text-sm text-ink-muted" aria-busy="true">Opening the builder…</p>;
  if (q.error) {
    if (q.error instanceof HttpError && q.error.status === 404) return <NotFound what="flow" />;
    return <ErrorState title="Couldn’t open this flow" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  return <Builder initial={q.data} />;
}

function Builder({ initial }: { initial: FlowView }) {
  const qc = useQueryClient();
  const [view, setView] = useState(initial);
  const [draft, setDraftState] = useState<Flow>({ title: initial.title, startId: initial.startId, nodes: initial.nodes });
  const ref = useRef(draft);
  const [focus, setFocus] = useState<string | null>(null); // a question picked from the path to change
  const [reopened, setReopened] = useState<{ nodeId: string; option: number } | null>(null); // after "Choose something else"
  const editQuestion = (id: string) => { setReopened(null); setFocus(id); };
  const [trying, setTrying] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  // unfinished answers (to: '') are saved too: the server keeps them as "incomplete", so a reload loses nothing
  const autosave = useAutosave<Flow>(async (d, base) => {
    try {
      const v = await api<FlowView>(`/api/flows/${view.id}`, { method: 'PATCH', json: { baseRevision: base, title: d.title.trim(), startId: d.startId, nodes: d.nodes, autosave: true } });
      setView(v); qc.setQueryData(['flow', v.slug], v); qc.setQueryData(['flow', v.id], v);
      setNotice((n) => (n?.text.startsWith('Not saved') ? null : n)); setStuck(null);
      return { revision: v.revision };
    } catch (e) {
      const st = e instanceof HttpError ? e.status : 0;
      if (st === 422) setNotice({ tone: 'error', text: `Not saved: ${((e as HttpError).body as { errors?: string[] } | null)?.errors?.join(' ') ?? 'the flow has a problem.'} Open the advanced editor to fix it.` });
      if (st === 403) setNotice({ tone: 'error', text: 'Not saved: you can’t change this flow right now (it may need approval or be archived).' });
      throw e;
    }
  }, 800, initial.revision);
  const navigate = useNavigate();
  // never open another editor on a stale copy: save first, then go
  const [stuck, setStuck] = useState<string | null>(null); // where the author wanted to go when the last change couldn't be saved
  const leave = async (e: React.MouseEvent, to: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return; // new tab: let the browser open it
    e.preventDefault();
    if (await autosave.flush()) navigate(to); else setStuck(to);
  };
  const reloadLatest = async () => {
    try {
      const v = await api<FlowView>(`/api/flows/${view.id}`);
      const d = { title: v.title, startId: v.startId, nodes: v.nodes };
      ref.current = d; setDraftState(d); setView(v); autosave.reset(v.revision); setNotice(null); setStuck(null);
    } catch { setNotice({ tone: 'error', text: 'Couldn’t load the latest version. Try again.' }); }
  };
  const update = (next: Flow) => { ref.current = next; setDraftState(next); autosave.change(next); };
  const patch = (id: string, p: Partial<FlowNode>) => update({ ...ref.current, nodes: ref.current.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) });

  const byId = new Map(draft.nodes.map((n) => [n.id, n]));
  const auto = nextTask(draft);
  const back = reopened && byId.get(reopened.nodeId)?.options?.[reopened.option];
  const focused = focus ? byId.get(focus) : undefined;
  const task: Task = focused ? { kind: focused.kind, nodeId: focused.id, path: pathTo(draft, focused.id) }
    : back && !back.to && (auto.kind === 'branch' || auto.kind === 'done')
      ? { kind: 'branch', nodeId: reopened!.nodeId, option: reopened!.option, path: [...pathTo(draft, reopened!.nodeId).slice(0, -1), { nodeId: reopened!.nodeId, answer: back.label }] }
      : auto;
  const { done, open } = progress(draft);
  const pct = done + open ? Math.round((done / (done + open)) * 100) : 0;
  const isStart = 'nodeId' in task && task.nodeId === draft.startId;
  const node = 'nodeId' in task ? byId.get(task.nodeId) : undefined;
  // a fresh step with nothing after it can be taken back ("choose something else")
  const undo = !focus && node && node.id !== draft.startId && !(node.options ?? []).length
    ? <button type="button" onClick={() => { const from = ref.current.nodes.flatMap((n) => (n.options ?? []).map((o, i) => (o.to === node.id ? { nodeId: n.id, option: i } : null))).find(Boolean); update(undoChoice(ref.current, node.id)); setReopened(from ?? null); }} className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100"><Undo2 size={14} aria-hidden /> Choose something else</button>
    : null;
  const v = validateFlow(draft);
  // endings already written, offered for reuse ("same as before") instead of copy-paste
  const endings = draft.nodes.filter((n) => n.kind !== 'question' && n.text.trim() && (n.kind !== 'article' || n.articleId));
  const cancel = <button type="button" onClick={() => setFocus(null)} className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>;

  const publish = async (action: 'publish' | 'submit') => {
    setNotice(null);
    if (!(await autosave.flush())) { setNotice({ tone: 'error', text: 'Your last change isn’t saved yet. Try again in a moment.' }); return; }
    try {
      const v = await api<FlowView>(`/api/flows/${view.id}/${action}`, { method: 'POST' });
      setView(v); autosave.reset(v.revision); void qc.invalidateQueries({ queryKey: ['flows'] });
      setNotice({ tone: 'info', text: action === 'publish' ? 'Published! Everyone can use it now.' : 'Sent for review. An admin will publish it.' });
    } catch (e) {
      const s = e instanceof HttpError ? e.status : 0;
      setNotice({ tone: 'error', text: s === 403 ? 'You don’t have permission to publish. Send it for review instead.' : s === 409 ? 'The flow’s status changed meanwhile. Reload the page.' : s === 422 ? 'Something still needs fixing. Open the advanced editor to see what.' : 'That didn’t work. Check your connection and try again.' });
    }
  };

  return (
    <div className="mx-auto max-w-[1320px]">
      <header className="flex items-center gap-3">
        <Link to="/flows" onClick={(e) => void leave(e, '/flows')} aria-label="Back to guided flows" className="flex h-9 w-9 items-center justify-center rounded-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><ArrowLeft size={18} /></Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-neutral-900">{draft.title}</p>
        <span aria-live="polite" data-save-state={autosave.dirty ? 'dirty' : autosave.status} className="text-[13px] text-neutral-500">
          {autosave.status === 'saving' ? 'Saving…' : autosave.status === 'error' || autosave.status === 'conflict' ? 'Not saved' : autosave.dirty ? '' : 'Saved'}
        </span>
        <Link to={`/flows/${view.id}/edit`} onClick={(e) => void leave(e, `/flows/${view.id}/edit`)} className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">Advanced editor</Link>
      </header>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-neutral-800">{done} ending{done === 1 ? '' : 's'} ready</span>
          <span className="text-neutral-500">{open ? `${open} path${open === 1 ? '' : 's'} to go` : 'Every path has an ending'}</span>
        </div>
        <div role="progressbar" aria-label="Flow progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 max-w-[720px] lg:max-w-none">
      {'path' in task && task.path.some((s) => s.answer) && <Trail path={task.path} byId={byId} onEdit={view.permissions.write ? editQuestion : undefined} />}
      {!view.permissions.write && <p role="status" className="mt-5 flex items-center gap-2 rounded-[12px] bg-neutral-100 px-4 py-3 text-sm text-neutral-700"><Lock size={15} aria-hidden /> You can look at this flow but not change it right now (it may need approval or be archived).</p>}
      {autosave.status === 'conflict' && <p role="alert" className="mt-5 flex flex-wrap items-center gap-2 rounded-[12px] bg-warning-soft px-4 py-3 text-sm text-neutral-900">Someone else changed this flow, so your last change wasn’t saved. <button type="button" onClick={() => void reloadLatest()} className="font-medium text-primary underline">Load their version</button></p>}
      {stuck && (
        <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-[12px] bg-danger-soft px-4 py-3 text-sm text-danger">
          Your last change isn’t saved, so you’re still here.
          <button type="button" onClick={() => setStuck(null)} className="font-medium underline">Stay and fix it</button>
          <button type="button" onClick={() => navigate(stuck)} className="font-medium underline">Leave anyway</button>
        </div>
      )}
      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={clsx('mt-5 rounded-[12px] px-4 py-3 text-sm', notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>{notice.text}</p>}

      {view.permissions.write && <Stage taskKey={JSON.stringify(task)}>
        {task.kind === 'question' && (
          <Card step={focus ? 'Change this question' : isStart ? 'Step 1 · The first question' : 'Ask another question'} icon={CircleHelp}
            title={isStart ? 'What’s the first thing you would ask someone with this problem?' : 'What do you ask next?'}
            hint="One short question they can answer by picking an option.">
            <OneLine label="Question" placeholder="For example: Is the printer switched on?" max={400} initial={byId.get(task.nodeId)!.text}
              submit={focus ? 'Done' : 'Next'} onSubmit={(t) => { patch(task.nodeId, { text: t }); setFocus(null); }}
              extra={focus ? cancel : undo} />
          </Card>
        )}
        {task.kind === 'answers' && (
          <Card step="Answers" icon={CircleHelp} title={`What can they answer to “${byId.get(task.nodeId)!.text}”?`}
            hint="Most questions are Yes or No. Change them or add more if you need to.">
            <Answers initial={node!.options ?? []} onSubmit={(options) => patch(task.nodeId, { options })} extra={undo} />
          </Card>
        )}
        {task.kind === 'branch' && (
          <Card step="Choose a path" icon={ArrowRight}
            title={<>When they answer <Em>{byId.get(task.nodeId)!.options![task.option]!.label}</Em>, what happens next?</>}>
            <div className="grid gap-3 sm:grid-cols-3">
              {(([['question', CircleHelp, 'Ask another question', 'You need to know more first'], ['result', Flag, 'Give the solution', 'You know what they should do'], ['article', FileText, 'Send them to an article', 'The answer is already written up']]) as [FlowNodeKind, typeof Flag, string, string][]).map(([kind, Icon, label, sub]) => (
                <button key={kind} type="button" onClick={() => { update(chooseNext(ref.current, task.nodeId, task.option, kind).flow); setReopened(null); }}
                  className="group flex flex-col items-start gap-3 rounded-[18px] bg-white p-5 text-left shadow-sm ring-1 ring-neutral-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent text-primary"><Icon size={20} aria-hidden /></span>
                  <span className="text-[15px] font-semibold text-neutral-900">{label}</span>
                  <span className="-mt-2 text-[13px] text-neutral-500">{sub}</span>
                </button>
              ))}
            </div>
            {endings.length > 0 && (
              <div className="mt-6">
                <p className="text-[13px] font-medium text-neutral-700">Same as an ending you already wrote?</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {endings.map((n) => (
                    <li key={n.id}>
                      <button type="button" aria-label={`Reuse ending: ${n.text}`} onClick={() => { update(setTarget(ref.current, task.nodeId, task.option, n.id).flow); setReopened(null); }}
                        className="inline-flex max-w-[280px] items-center gap-2 rounded-full bg-white px-3.5 py-2 text-left text-[13.5px] text-neutral-800 ring-1 ring-neutral-200 hover:bg-accent-soft hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {n.kind === 'article' ? <FileText size={14} aria-hidden className="shrink-0" /> : <Flag size={14} aria-hidden className="shrink-0" />}<span className="truncate">{n.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
        {task.kind === 'result' && <Ending node={node!} editing={!!focus} onDone={(p) => { patch(task.nodeId, p); setFocus(null); }} extra={focus ? cancel : undo} />}
        {task.kind === 'article' && <ArticleStep editing={!!focus} onPick={(a) => { patch(task.nodeId, { articleId: a.id, text: a.title }); setFocus(null); }} extra={focus ? cancel : undo} />}
        {task.kind === 'title' && (
          <Card step="Name" icon={Sparkles} title="What problem will this flow help people solve?">
            <OneLine label="Flow title" max={200} submit="Next" onSubmit={(t) => update({ ...ref.current, title: t })} />
          </Card>
        )}
        {task.kind === 'done' && !v.ok && (
          <Card step="Almost there" icon={TriangleAlert} title="A few things still need fixing" hint="These are easiest to fix in the advanced editor.">
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-neutral-700">{v.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            <div className="mt-5"><Button onClick={(e) => void leave(e, `/flows/${view.id}/edit`)}>Fix in the advanced editor</Button></div>
          </Card>
        )}
        {task.kind === 'done' && v.ok && (
          <Card step="Flow complete" icon={Trophy} title="Nice work! Every path ends with an answer."
            hint={view.status === 'published' ? 'This flow is published. Your changes are live.' : view.permissions.publish || view.status === 'draft' ? 'Try it out the way your colleagues will, then publish it.' : 'It’s waiting for an admin to publish it.'}>
            <Win questions={draft.nodes.filter((n) => n.kind === 'question').length} endings={done} />
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button variant="soft" onClick={() => setTrying((t) => !t)}><Play size={15} aria-hidden /> {trying ? 'Hide the test run' : 'Try it out'}</Button>
              {view.status !== 'published' && view.status !== 'archived' && (view.permissions.publish
                ? <Button onClick={() => void publish('publish')}><Upload size={15} aria-hidden /> Publish</Button>
                : view.status === 'draft' && view.permissions.submit && <Button onClick={() => void publish('submit')}><Send size={15} aria-hidden /> Send for review</Button>)}
            </div>
            {trying && <div className="mt-5 rounded-[18px] bg-white p-5 ring-1 ring-neutral-200"><FlowRunner flow={{ ...draft, articles: view.articles }} keyboard={false} /></div>}
          </Card>
        )}
      </Stage>}
      </div>
      <div className="min-w-0 lg:sticky lg:top-[96px] lg:mt-5"><FlowMap flow={draft} task={task} onEdit={view.permissions.write ? editQuestion : undefined} /></div>
      </div>
    </div>
  );
}

/** The finish moment: a trophy that pops in (still with reduced motion) and what was built. */
function Win({ questions, endings }: { questions: number; endings: number }) {
  const still = useReducedMotion();
  return (
    <div className="flex items-center gap-5">
      <motion.span initial={still ? false : { scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-accent text-primary shadow-sm"><Trophy size={30} aria-hidden /></motion.span>
      <dl className="flex gap-6">
        <div><dt className="text-[13px] text-neutral-500">Questions</dt><dd className="text-[24px] font-semibold tabular text-neutral-900">{questions}</dd></div>
        <div><dt className="text-[13px] text-neutral-500">Endings</dt><dd className="text-[24px] font-semibold tabular text-neutral-900">{endings}</dd></div>
      </dl>
    </div>
  );
}

/** The questions and answers that led here, as chips; a question chip lets the author change it. */
function Trail({ path, byId, onEdit }: { path: PathStep[]; byId: Map<string, FlowNode>; onEdit?: (id: string) => void }) {
  return (
    <ol aria-label="Your path so far" className="mt-5 flex flex-wrap items-center gap-1.5 text-[13px]">
      {path.map((s, i) => {
        const n = byId.get(s.nodeId);
        if (!n || n.kind !== 'question' || !n.text) return null;
        return (
          <li key={i} className="flex items-center gap-1.5">
            {onEdit ? <button type="button" onClick={() => onEdit(s.nodeId)} aria-label={`Change question: ${n.text}`} title="Change this question" className="max-w-[240px] truncate rounded-full bg-white px-3 py-1 text-neutral-700 ring-1 ring-neutral-200 hover:ring-primary">{n.text}</button> : <span className="max-w-[240px] truncate rounded-full bg-white px-3 py-1 text-neutral-700 ring-1 ring-neutral-200">{n.text}</span>}
            {s.answer && <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-neutral-900">{s.answer}</span>}
            {i < path.length - 1 && <ArrowRight size={13} className="text-neutral-400" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function pathTo(flow: Flow, id: string): PathStep[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n])), seen = new Set<string>();
  const walk = (at: string, path: PathStep[]): PathStep[] | null => {
    if (seen.has(at)) return null;
    seen.add(at);
    if (at === id) return [...path, { nodeId: at }];
    for (const o of byId.get(at)?.options ?? []) { const r = o.to && walk(o.to, [...path, { nodeId: at, answer: o.label }]); if (r) return r; }
    return null;
  };
  return walk(flow.startId, []) ?? [{ nodeId: id }];
}

const Em = ({ children }: { children: ReactNode }) => <span className="rounded-[8px] bg-accent px-2 py-0.5 text-neutral-900">{children}</span>;

/** Cards slide in one at a time (no motion with reduced motion). */
function Stage({ children, taskKey = 'start' }: { children: ReactNode; taskKey?: string }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={taskKey} initial={still ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={still ? undefined : { opacity: 0, x: -24 }}
        transition={{ duration: 0.22, ease: 'easeOut' }} className="mt-8">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function Card({ step, icon: Icon, title, hint, children }: { step: string; icon: typeof Flag; title: ReactNode; hint?: string; children: ReactNode }) {
  const box = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null);
  // a new card keeps focus on its first field (autoFocus) or moves it to the question, never leaves it on the page body
  useEffect(() => { if (!box.current?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true }); }, []);
  return (
    <section ref={box} aria-labelledby="task-title" className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-neutral-200/80 sm:p-8">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-neutral-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-accent text-primary"><Icon size={15} aria-hidden /></span>{step}
      </p>
      <h1 id="task-title" ref={heading} tabIndex={-1} className="focus:outline-none mt-4 text-[24px] font-semibold leading-snug tracking-[-0.015em] text-neutral-900">{title}</h1>
      {hint && <p className="mt-2 text-[15px] text-neutral-500">{hint}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function OneLine({ label, placeholder, max, initial = '', submit, busy, extra, onSubmit }: {
  label: string; placeholder?: string; max: number; initial?: string; submit: string; busy?: boolean; extra?: ReactNode; onSubmit: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim() && !busy) onSubmit(v.trim()); }}>
      <label className="sr-only" htmlFor="task-input">{label}</label>
      <input id="task-input" autoFocus aria-describedby="task-title" value={v} maxLength={max} placeholder={placeholder} onChange={(e) => setV(e.target.value)} className={field} />
      <div className="mt-4 flex items-center justify-between gap-3">{extra ?? <span />}<Button type="submit" disabled={!v.trim() || busy}>{submit} <ArrowRight size={15} aria-hidden /></Button></div>
    </form>
  );
}

/** Starts from the answers already there (each keeps where it leads), or Yes / No. */
function Answers({ initial, onSubmit, extra }: { initial: FlowOption[]; onSubmit: (options: FlowOption[]) => void; extra?: ReactNode }) {
  const [opts, setOpts] = useState<FlowOption[]>(() => (initial.length ? initial : [{ label: 'Yes', to: '' }, { label: 'No', to: '' }]));
  const labels = opts.map((o) => o.label);
  const setLabels = (next: string[]) => setOpts(next.map((label, i) => ({ label, to: opts[i]?.to ?? '' })));
  const ok = labels.length >= 2 && labels.every((l) => l.trim());
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(opts.map((o) => ({ ...o, label: o.label.trim() }))); }}>
      <ul className="space-y-2.5">
        {labels.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            <input aria-label={`Answer ${i + 1}`} aria-describedby="task-title" value={l} maxLength={120} autoFocus={i === 0} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? e.target.value : x)))} className={field} />
            {labels.length > 2 && <button type="button" aria-label={`Remove answer ${i + 1}`} onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-neutral-400 hover:bg-danger-soft hover:text-danger"><X size={16} aria-hidden /></button>}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between">
        {labels.length < 8 ? <Button type="button" variant="soft" onClick={() => setOpts([...opts, { label: '', to: '' }])}><Plus size={15} aria-hidden /> Add an answer</Button> : <span />}
        <span className="flex items-center gap-2">{extra}<Button type="submit" disabled={!ok}>Next <ArrowRight size={15} aria-hidden /></Button></span>
      </div>
    </form>
  );
}

const TONES: { value: FlowSeverity; label: string; icon: typeof Flag }[] = [
  { value: 'success', label: 'This solves it', icon: CircleCheck }, { value: 'info', label: 'Good to know', icon: Info }, { value: 'warning', label: 'Stop or escalate', icon: TriangleAlert },
];

function Ending({ node, editing, onDone, extra }: { node: FlowNode; editing?: boolean; onDone: (p: Partial<FlowNode>) => void; extra?: ReactNode }) {
  const [text, setText] = useState(node.text), [detail, setDetail] = useState(node.detail ?? ''), [tone, setTone] = useState<FlowSeverity>(node.severity ?? 'success');
  return (
    <Card step={editing ? 'Change this ending' : 'An ending'} icon={Flag} title="What should they do?" hint={editing ? 'Every answer that leads here shows the change.' : 'This is what people see at the end of this path.'}>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onDone({ text: text.trim(), detail: detail.trim() || undefined, severity: tone }); }}>
        <label className="sr-only" htmlFor="ending-text">Solution</label>
        <input id="ending-text" autoFocus aria-describedby="task-title" value={text} maxLength={400} placeholder="For example: Restart the printer and try again" onChange={(e) => setText(e.target.value)} className={field} />
        <label className="sr-only" htmlFor="ending-detail">More detail (optional)</label>
        <textarea id="ending-detail" rows={3} value={detail} maxLength={1000} placeholder="More detail (optional)" onChange={(e) => setDetail(e.target.value)} className={clsx(field, 'mt-3 resize-y text-[15px]')} />
        <fieldset className="mt-4">
          <legend className="text-[13px] font-medium text-neutral-700">What kind of ending is it?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TONES.map((t) => (
              <label key={t.value} className={clsx('flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[14px] ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                tone === t.value ? 'bg-accent font-medium text-neutral-900 ring-primary' : 'bg-white text-neutral-700 ring-neutral-200 hover:bg-accent-soft')}>
                <input type="radio" name="tone" value={t.value} checked={tone === t.value} onChange={() => setTone(t.value)} className="sr-only" />
                <t.icon size={15} aria-hidden /> {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex items-center justify-between gap-3">{extra ?? <span />}<Button type="submit" disabled={!text.trim()}>{editing ? 'Done' : 'Save ending'} <ArrowRight size={15} aria-hidden /></Button></div>
      </form>
    </Card>
  );
}

function ArticleStep({ onPick, editing, extra }: { onPick: (a: { id: string; title: string }) => void; editing?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(true), []);
  // the picker opens by itself, so on close put focus back on its button
  const toggle = (o: boolean) => { setOpen(o); if (!o) requestAnimationFrame(() => wrap.current?.querySelector('button')?.focus()); };
  return (
    <Card step={editing ? 'Change this ending' : 'An ending'} icon={FileText} title="Which article should they read?" hint="Search the hub and pick the article that answers their problem.">
      <div ref={wrap} className="flex items-center justify-between gap-3">
        <Button onClick={() => toggle(true)}><FileText size={15} aria-hidden /> Choose an article</Button>
        {extra}
      </div>
      <LinkPicker open={open} onOpenChange={toggle} title="Choose an article" onPick={(a) => { setOpen(false); onPick(a); }} />
    </Card>
  );
}
