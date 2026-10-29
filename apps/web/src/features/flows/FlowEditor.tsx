import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import {
  Archive, ArchiveRestore, ArrowLeft, Check, ChevronDown, CircleCheck, CircleHelp, FileText, Flag, ListTree, MoreHorizontal, PenLine, Play, Plus, RefreshCw,
  Send, ShieldAlert, Trash2, TriangleAlert, Upload, X,
} from 'lucide-react';
import { validateFlow, type Flow, type FlowIssue, type FlowNode, type FlowNodeKind, type FlowSeverity } from '@ops/shared';
import { api, HttpError, isEditorRole, useArticle, useSession, type FlowView } from '../../api/client';
import { Button, IconTile, StatusBadge } from '../../components/ui/primitives';
import { ErrorState } from '../../components/ui/ErrorState';
import { NotFound } from '../../pages/NotFound';
import { LinkPicker } from '../editor/LinkPicker';
import { useAutosave, type SaveStatus } from '../editor/useAutosave';
import { addNode, outline, removeNode, saveable, setTarget, STARTER_FLOW } from './flowOps';
import { FlowRunner } from './FlowRunner';

type Draft = Flow & { articleId: string | null };
const fromView = (v: FlowView): Draft => ({ title: v.title, startId: v.startId, nodes: v.nodes, articleId: v.articleId });

const KIND: Record<FlowNodeKind, { label: string; icon: typeof CircleHelp; tile: string }> = {
  question: { label: 'Question', icon: CircleHelp, tile: 'bg-primary-soft text-primary' },
  result: { label: 'Result', icon: Flag, tile: 'bg-success-soft text-success' },
  article: { label: 'Article', icon: FileText, tile: 'bg-warning-soft text-warning' },
};
const SEVERITIES: { value: FlowSeverity; label: string }[] = [{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'success', label: 'Success' }];

const field = 'w-full rounded-[12px] bg-white px-3.5 py-2.5 text-[14.5px] text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition-shadow placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-neutral-50 disabled:text-neutral-500';

/** /flows/:id/edit (id or "new"). Editors and admins only; the server enforces the same on every request. */
export function EditFlow() {
  const session = useSession();
  const { id = 'new' } = useParams();
  if (session.isPending) return null;
  if (!isEditorRole(session.data?.user?.role)) return <Forbidden />;
  return id === 'new' ? <NewFlow /> : <Loader id={id} />;
}

function Forbidden() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <IconTile icon={ShieldAlert} size="lg" />
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">Editing isn’t available to you</h1>
      <p className="mt-2 max-w-md text-[15px] text-neutral-500">Only editors and admins can create or change guided flows. Ask an admin to add your email to the editor list.</p>
      <Link to="/flows" className="mt-6 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">Back to guided flows</Link>
    </div>
  );
}

function NewFlow() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const f = await api<FlowView>('/api/flows', { method: 'POST', json: { title: title.trim(), nodes: STARTER_FLOW.nodes, startId: STARTER_FLOW.startId } });
      void qc.invalidateQueries({ queryKey: ['flows'] });
      navigate(`/flows/${f.id}/edit`, { replace: true });
    } catch { setError('The flow couldn’t be created. Check your connection and try again.'); setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-[560px] pt-16">
      <IconTile icon={ListTree} size="lg" />
      <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.02em] text-neutral-900">New guided flow</h1>
      <p className="mt-2 text-[15px] text-neutral-500">Name the problem people are trying to solve. You will get a first question with two outcomes to build on.</p>
      <form className="mt-8" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label htmlFor="flow-title" className="text-sm font-medium text-neutral-800">Flow title</label>
        <input id="flow-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="For example: Invoice cannot be registered" className={clsx(field, 'mt-2')} />
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button type="submit" disabled={!title.trim() || busy}><Plus size={15} aria-hidden /> Create flow</Button>
          <Link to="/flows" className="inline-flex items-center rounded-[12px] px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function Loader({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['edit-flow', id], retry: false, staleTime: 0, gcTime: 0, queryFn: () => api<FlowView>(`/api/flows/${encodeURIComponent(id)}`) });
  if (q.isPending) return <p className="py-16 text-center text-sm text-ink-muted" aria-busy="true">Opening the flow editor…</p>;
  if (q.error) {
    if (q.error instanceof HttpError && q.error.status === 404) return <NotFound what="flow" />;
    return <ErrorState title="Couldn’t open this flow" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  return <Workspace initial={q.data} />;
}

const SAVE: Record<SaveStatus | 'dirty', { label: string; dot: string }> = {
  idle: { label: 'All changes saved', dot: 'bg-accent' }, dirty: { label: 'Unsaved changes', dot: 'bg-neutral-400' }, saving: { label: 'Saving…', dot: 'bg-primary animate-pulse' },
  saved: { label: 'Saved', dot: 'bg-accent' }, conflict: { label: 'Not saved: conflict', dot: 'bg-warning' }, error: { label: 'Couldn’t save. Retrying…', dot: 'bg-danger animate-pulse' },
};

function Workspace({ initial }: { initial: FlowView }) {
  const qc = useQueryClient();
  const [view, setView] = useState(initial);
  const [draft, setDraftState] = useState<Draft>(() => fromView(initial));
  const draftRef = useRef(draft);
  const [tab, setTab] = useState<'checks' | 'outline' | 'test'>('checks');
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial.nodes.length <= 6 ? initial.nodes.map((n) => n.id) : []));
  const [flash, setFlash] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const remember = (v: FlowView) => { setView(v); qc.setQueryData(['flow', v.slug], v); qc.setQueryData(['flow', v.id], v); void qc.invalidateQueries({ queryKey: ['flows'] }); };

  const autosave = useAutosave<Draft>(async (d, base, o) => {
    const body = { baseRevision: base, ...(d.title.trim() ? { title: d.title.trim() } : {}), startId: d.startId, nodes: saveable(d).nodes, articleId: d.articleId, autosave: !o.explicit };
    try {
      const v = await api<FlowView>(`/api/flows/${view.id}`, { method: 'PATCH', keepalive: o.keepalive, json: body });
      setView(v); qc.setQueryData(['flow', v.slug], v); qc.setQueryData(['flow', v.id], v);
      setNotice(null); setLastSaved(new Date());
      return { revision: v.revision };
    } catch (e) {
      if (e instanceof HttpError && e.status === 422) setNotice({ tone: 'error', text: `Not saved: ${((e.body as { errors?: string[] } | null)?.errors ?? []).join(' ')}` });
      throw e;
    }
  }, 1200, initial.revision);

  const update = (next: Draft) => { draftRef.current = next; setDraftState(next); autosave.change(next); };
  const edit = (fn: (d: Draft) => Draft) => update(fn(draftRef.current));
  const patchNode = (id: string, patch: Partial<FlowNode>) => edit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void autosave.flush({ explicit: true }); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canWrite = view.permissions.write;
  const v = useMemo(() => validateFlow(draft), [draft]);
  const errorCount = v.issues.filter((i) => i.level === 'error').length;

  const jump = (id: string) => {
    setOpen((s) => new Set(s).add(id));
    setFlash(id);
    setTimeout(() => {
      const el = document.getElementById(`node-${id}`);
      el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el?.querySelector<HTMLElement>('textarea, input, select')?.focus({ preventScroll: true });
    }, 30);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1800);
  };
  const add = (kind: FlowNodeKind) => { const r = addNode(draftRef.current, kind); update({ ...draftRef.current, ...r.flow }); jump(r.id); };

  const act = async (action: 'publish' | 'submit' | 'archive' | 'restore') => {
    setNotice(null);
    if ((action === 'publish' || action === 'submit') && errorCount) { setNotice({ tone: 'error', text: `Fix the ${errorCount} problem${errorCount === 1 ? '' : 's'} in Checks first.` }); setTab('checks'); return; }
    const clean = await autosave.flush();
    if (!clean) { setNotice({ tone: 'error', text: 'Save your changes first, then try again.' }); return; }
    try {
      const next = await api<FlowView>(`/api/flows/${view.id}/${action}`, { method: 'POST' });
      remember(next); autosave.reset(next.revision);
      setNotice({ tone: 'info', text: { publish: 'Published. Readers can run it now.', submit: 'Submitted for review. An admin will publish it.', archive: 'Archived. It no longer appears for readers.', restore: 'Restored as a draft.' }[action] });
    } catch (e) {
      const s = e instanceof HttpError ? e.status : 0;
      const errs = e instanceof HttpError && s === 422 ? ((e.body as { errors?: string[] }).errors ?? []).join(' ') : '';
      setNotice({ tone: 'error', text: s === 403 ? 'You don’t have permission to do that. Approvals may be required.' : s === 422 ? `Can’t do that yet: ${errs}` : s === 409 ? 'The flow’s status changed meanwhile. Reload the page.' : 'That didn’t work. Check your connection and try again.' });
    }
  };

  const reloadLatest = async () => {
    try { const latest = await api<FlowView>(`/api/flows/${view.id}`); const d = fromView(latest); draftRef.current = d; setDraftState(d); setView(latest); autosave.reset(latest.revision); setNotice(null); }
    catch { setNotice({ tone: 'error', text: 'Couldn’t load the latest version. Try again.' }); }
  };

  const [confirm, setConfirm] = useState<string | null>(null);
  const doRemove = (id: string) => {
    const r = removeNode(draftRef.current, id);
    update({ ...draftRef.current, ...r.flow });
    setConfirm(null);
    setNotice({ tone: 'info', text: r.removedAnswers ? `Step removed. ${r.removedAnswers} answer${r.removedAnswers === 1 ? '' : 's'} that led to it ${r.removedAnswers === 1 ? 'was' : 'were'} removed too.` : 'Step removed.' });
  };

  const p = view.permissions, status = view.status;
  const key = autosave.status === 'conflict' || autosave.status === 'error' || autosave.status === 'saving' ? autosave.status : autosave.dirty ? 'dirty' : autosave.status;
  const s = SAVE[key];
  const incoming = (id: string) => draft.nodes.reduce((n, x) => n + (x.options ?? []).filter((o) => o.to === id).length, 0);

  return (
    <div>
      <div className="sticky top-[76px] z-10 -mx-3 mb-6 px-3 pb-2">
        <div className="glass flex h-14 items-center gap-2 rounded-[18px] pl-2 pr-2">
          <Link to={status === 'published' ? `/flows/${view.slug}` : '/flows'} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-[12px] text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"><ArrowLeft size={18} /></Link>
          <span className="flex items-center gap-1.5 pl-1 text-[13px] font-medium text-neutral-700"><PenLine size={14} className="text-neutral-400" aria-hidden />Editing flow</span>
          <StatusBadge status={status} />
          <span aria-live="polite" className="ml-2 flex items-center gap-2 text-[13px] text-neutral-500" data-save-state={key}>
            <span className={clsx('h-2 w-2 rounded-full transition-colors duration-300', s.dot)} aria-hidden />
            {autosave.errorKind === 'rejected' ? 'Not saved: the server refused this change' : s.label}
            {key === 'saved' && lastSaved && <span className="text-ink-muted tabular">{lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
            {key === 'saved' && <Check size={13} className="text-accent-ink" aria-hidden />}
            {(autosave.status === 'error') && <button type="button" onClick={() => void autosave.flush()} className="font-medium text-primary hover:underline">Retry now</button>}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setTab('test')} className="flex h-9 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium text-neutral-600 transition-colors hover:bg-white hover:text-neutral-900"><Play size={15} aria-hidden /> Test run</button>
            <span aria-hidden className="mx-1 h-6 w-px bg-neutral-200" />
            {(status === 'draft' || status === 'in_review') && p.publish && <Button onClick={() => act('publish')}><Upload size={15} aria-hidden /> Publish</Button>}
            {status === 'draft' && !p.publish && p.submit && <Button onClick={() => act('submit')}><Send size={15} aria-hidden /> Submit for review</Button>}
            {status === 'in_review' && !p.publish && <span className="text-[13px] text-ink-muted">Waiting for an admin</span>}
            {status === 'archived' && p.archive && <Button variant="soft" onClick={() => act('restore')}><ArchiveRestore size={15} aria-hidden /> Restore as draft</Button>}
            {status !== 'archived' && p.archive && (
              <Menu.Root>
                <Menu.Trigger className="flex h-9 w-9 items-center justify-center rounded-[12px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800" aria-label="More actions"><MoreHorizontal size={18} /></Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content align="end" sideOffset={6} className="glass z-50 min-w-[200px] rounded-[14px] p-1.5 animate-menu-in">
                    <Menu.Item onSelect={() => act('archive')} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] text-neutral-700 outline-none data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger">
                      <Archive size={15} aria-hidden /> Archive flow
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        </div>
      </div>

      {autosave.status === 'conflict' && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-[16px] bg-warning-soft px-4 py-3.5 ring-1 ring-inset ring-warning/20">
          <TriangleAlert size={18} className="shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-neutral-800"><strong className="font-semibold">Someone else saved this flow</strong>{autosave.conflictRevision ? ` (revision ${autosave.conflictRevision})` : ''} while you were editing. Your latest changes aren’t saved.</p>
          <Button onClick={reloadLatest}><RefreshCw size={15} aria-hidden /> Reload latest</Button>
        </div>
      )}
      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={clsx('mb-5 flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px]', notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-medium underline-offset-2 hover:underline">Dismiss</button>
        </div>
      )}
      {!canWrite && <div role="note" className="mb-5 rounded-[14px] bg-neutral-100 px-4 py-3 text-[14px] text-neutral-700">{status === 'archived' ? 'This flow is archived. Restore it as a draft to edit it.' : 'Published flows can only be changed by an admin while approvals are switched on.'}</div>}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 max-w-[780px]">
          <textarea aria-label="Flow title" rows={1} value={draft.title} disabled={!canWrite} maxLength={200} placeholder="Untitled flow"
            onChange={(e) => edit((d) => ({ ...d, title: e.target.value.replace(/\n/g, '') }))}
            className="block w-full resize-none bg-transparent text-balance text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-neutral-900 outline-none [field-sizing:content] placeholder:text-neutral-300 focus-visible:outline-none" />
          {!draft.title.trim() && <p className="mt-1 text-xs text-danger">Give the flow a title.</p>}
          <ArticleLink id={draft.articleId} disabled={!canWrite} onPick={() => setPicker(true)} onClear={() => edit((d) => ({ ...d, articleId: null }))} />

          <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[17px] font-semibold text-neutral-900">Steps <span className="ml-1 text-sm font-normal text-ink-muted tabular">{draft.nodes.length}</span></h2>
            {canWrite && (['question', 'result', 'article'] as const).map((k) => {
              const Icon = KIND[k].icon;
              return <Button key={k} variant="soft" onClick={() => add(k)} aria-label={`Add ${k === 'article' ? 'article step' : k}`}><Icon size={15} aria-hidden /> {KIND[k].label}</Button>;
            })}
          </div>

          <ol className="space-y-3">
            {draft.nodes.map((n) => (
              <NodeCard key={n.id} node={n} flow={draft} isStart={draft.startId === n.id} open={open.has(n.id)} flash={flash === n.id} disabled={!canWrite}
                incoming={incoming(n.id)} confirming={confirm === n.id}
                issues={v.issues.filter((i) => i.nodeId === n.id)}
                onToggle={() => setOpen((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; })}
                onPatch={(patch) => patchNode(n.id, patch)} onStart={() => edit((d) => ({ ...d, startId: n.id }))}
                onTarget={(i, to) => { const r = setTarget(draftRef.current, n.id, i, to); update({ ...draftRef.current, ...r.flow }); if (r.createdId) jump(r.createdId); }}
                onAskDelete={() => setConfirm(n.id)} onCancelDelete={() => setConfirm(null)} onDelete={() => doRemove(n.id)}
                onPickArticle={() => setPicker(true)} onJump={jump} />
            ))}
          </ol>
          {draft.nodes.length === 0 && <p className="panel p-6 text-center text-[14.5px] text-neutral-500">No steps yet. Add a question to begin.</p>}
        </div>

        <aside aria-label="Flow tools" className="xl:sticky xl:top-[150px] xl:self-start">
          <div className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-md ring-1 ring-neutral-200/80 xl:max-h-[calc(100vh-208px)]">
            <div role="tablist" aria-label="Panels" className="flex shrink-0 gap-1 border-b border-neutral-200/70 p-1.5">
              {([['checks', 'Checks'], ['outline', 'Outline'], ['test', 'Test run']] as const).map(([k, label]) => (
                <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2 text-[13px] font-medium transition-colors', tab === k ? 'bg-primary-soft text-primary' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800')}>
                  {label}
                  {k === 'checks' && (errorCount > 0
                    ? <span aria-label={`${errorCount} problems`} className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white tabular">{errorCount}</span>
                    : <CircleCheck size={13} className="text-success" aria-label="No problems" />)}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'checks' && <Checks issues={v.issues} onJump={jump} />}
              {tab === 'outline' && <Outline flow={draft} onJump={jump} />}
              {tab === 'test' && (
                <div>
                  <p className="mb-4 text-[13px] text-ink-muted">Runs the flow as readers will see it, using your unsaved edits.</p>
                  <FlowRunner flow={{ title: draft.title, startId: draft.startId, nodes: saveable(draft).nodes }} keyboard={false} />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <LinkPicker open={picker} onOpenChange={setPicker} title="Choose an article" onPick={(a) => {
        // the picker is shared: it fills the open article step, or the flow's own article link when no step is waiting
        const waiting = pickTarget.current;
        pickTarget.current = null;
        if (waiting) patchNode(waiting, { articleId: a.id, text: draftRef.current.nodes.find((n) => n.id === waiting)?.text || a.title });
        else edit((d) => ({ ...d, articleId: a.id }));
      }} />
    </div>
  );
}

// which article step opened the picker (null = the flow's own article link)
const pickTarget: { current: string | null } = { current: null };

function ArticleLink({ id, disabled, onPick, onClear }: { id: string | null; disabled: boolean; onPick: () => void; onClear: () => void }) {
  const a = useArticle(id ?? '');
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-neutral-600">
      <FileText size={15} className="text-neutral-400" aria-hidden />
      {id ? <span>Linked article: <strong className="font-medium text-neutral-900">{a.data?.title ?? (a.isError ? 'unavailable' : '…')}</strong></span> : <span>No linked article. Readers find the flow from the Guided flows list.</span>}
      {!disabled && <button type="button" onClick={() => { pickTarget.current = null; onPick(); }} className="font-medium text-primary hover:underline">{id ? 'Change' : 'Link a troubleshooting article'}</button>}
      {!disabled && id && <button type="button" onClick={onClear} className="font-medium text-neutral-500 hover:text-danger hover:underline">Remove</button>}
    </div>
  );
}

interface CardProps {
  node: FlowNode; flow: Draft; isStart: boolean; open: boolean; flash: boolean; disabled: boolean; incoming: number; confirming: boolean; issues: FlowIssue[];
  onToggle: () => void; onPatch: (p: Partial<FlowNode>) => void; onStart: () => void; onTarget: (i: number, to: string) => void;
  onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void; onPickArticle: () => void; onJump: (id: string) => void;
}

function NodeCard(c: CardProps) {
  const { node: n, flow, disabled } = c;
  const k = KIND[n.kind], Icon = k.icon;
  const errs = c.issues.filter((i) => i.level === 'error').length;
  const label = n.text.trim() || `Untitled ${k.label.toLowerCase()}`;
  const setOptions = (options: NonNullable<FlowNode['options']>) => c.onPatch({ options });
  const opts = n.options ?? [];
  return (
    <li id={`node-${n.id}`} data-kind={n.kind} className={clsx('rounded-[18px] bg-white shadow-sm ring-1 transition-[box-shadow] duration-500', c.flash ? 'ring-2 ring-primary shadow-lg' : errs ? 'ring-danger/40' : 'ring-neutral-200/80')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', k.tile)}><Icon size={16} aria-hidden /></span>
        <button type="button" onClick={c.onToggle} aria-expanded={c.open} aria-controls={`body-${n.id}`} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[14.5px] font-medium text-neutral-900">{label}</span>
          <span className="block truncate text-xs text-ink-muted">
            {k.label}{n.kind === 'question' && ` · ${opts.length} answer${opts.length === 1 ? '' : 's'}`}{c.isStart && ' · Start'}
            {errs > 0 && <span className="ml-1 font-medium text-danger"> · {errs} problem{errs === 1 ? '' : 's'}</span>}
          </span>
        </button>
        {c.isStart && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">Start</span>}
        <button type="button" onClick={c.onToggle} aria-label={c.open ? `Collapse ${label}` : `Expand ${label}`} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          <ChevronDown size={16} className={clsx('transition-transform duration-300', c.open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {c.open && (
        <fieldset id={`body-${n.id}`} disabled={disabled} className="space-y-4 border-t border-neutral-100 px-4 pb-4 pt-4">
          <legend className="sr-only">{k.label}: {label}</legend>
          <label className="block">
            <span className="text-[13px] font-medium text-neutral-700">{n.kind === 'question' ? 'Question' : n.kind === 'result' ? 'What to do' : 'Heading'}</span>
            <textarea rows={2} maxLength={400} value={n.text} onChange={(e) => c.onPatch({ text: e.target.value })} className={clsx(field, 'mt-1.5 resize-y')} />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-neutral-700">Detail <span className="font-normal text-ink-muted">(optional, plain text)</span></span>
            <textarea rows={2} maxLength={1000} value={n.detail ?? ''} onChange={(e) => c.onPatch({ detail: e.target.value || undefined })} className={clsx(field, 'mt-1.5 resize-y')} />
          </label>

          {n.kind === 'result' && (
            <div role="radiogroup" aria-label="Severity" className="flex gap-1.5">
              {SEVERITIES.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={(n.severity ?? 'info') === s.value} onClick={() => c.onPatch({ severity: s.value })}
                  className={clsx('rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 transition-colors',
                    (n.severity ?? 'info') === s.value ? { info: 'bg-primary-soft text-primary ring-primary/20', warning: 'bg-warning-soft text-warning ring-warning/25', success: 'bg-success-soft text-success ring-success/25' }[s.value] : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50')}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {n.kind === 'article' && <ArticleStepField node={n} onPick={() => { pickTarget.current = n.id; c.onPickArticle(); }} />}

          {n.kind === 'question' && (
            <div>
              <p className="text-[13px] font-medium text-neutral-700">Answers</p>
              <ul className="mt-2 space-y-2">
                {opts.map((o, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] bg-neutral-50 p-2 ring-1 ring-inset ring-neutral-200/70 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                    <input aria-label={`Answer ${i + 1} label`} value={o.label} maxLength={120} placeholder="Answer, for example Yes"
                      onChange={(e) => setOptions(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={clsx(field, '!py-2')} />
                    <select aria-label={`Answer ${i + 1} goes to`} value={o.to} onChange={(e) => c.onTarget(i, e.target.value)} className={clsx(field, '!py-2 max-sm:col-span-2 max-sm:row-start-2', !o.to && 'text-danger')}>
                      <option value="">Choose where this goes…</option>
                      <optgroup label="Existing steps">
                        {flow.nodes.map((x) => <option key={x.id} value={x.id}>{KIND[x.kind].label}: {(x.text || 'Untitled').slice(0, 42)}</option>)}
                      </optgroup>
                      <optgroup label="Create new">
                        <option value="__new:question">New question</option><option value="__new:result">New result</option><option value="__new:article">New article step</option>
                      </optgroup>
                    </select>
                    <button type="button" aria-label={`Remove answer ${i + 1}`} onClick={() => setOptions(opts.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-neutral-400 hover:bg-danger-soft hover:text-danger"><X size={15} aria-hidden /></button>
                    {o.to && o.to !== n.id && flow.nodes.some((x) => x.id === o.to) && <button type="button" onClick={() => c.onJump(o.to)} className="col-span-full justify-self-start px-1 text-xs font-medium text-primary hover:underline">Go to that step</button>}
                  </li>
                ))}
              </ul>
              {opts.length < 8 && <button type="button" onClick={() => setOptions([...opts, { label: '', to: '' }])} className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-primary hover:bg-primary-soft"><Plus size={14} aria-hidden /> Add answer</button>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            {!c.isStart && <button type="button" onClick={c.onStart} className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-primary-soft hover:text-primary">Make this the start</button>}
            <span className="ml-auto" />
            {c.confirming ? (
              <div role="alertdialog" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-neutral-700">{c.incoming ? `${c.incoming} answer${c.incoming === 1 ? '' : 's'} lead here and will be removed. ` : ''}Delete this step?</span>
                <Button variant="ghost" onClick={c.onCancelDelete} className="!py-1.5">Keep it</Button>
                <button type="button" onClick={c.onDelete} className="rounded-[10px] bg-danger px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">Delete step</button>
              </div>
            ) : <button type="button" onClick={c.onAskDelete} className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-neutral-500 hover:bg-danger-soft hover:text-danger"><Trash2 size={14} aria-hidden /> Delete step</button>}
          </div>
        </fieldset>
      )}
    </li>
  );
}

function ArticleStepField({ node, onPick }: { node: FlowNode; onPick: () => void }) {
  const a = useArticle(node.articleId ?? '');
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-neutral-50 p-3 ring-1 ring-inset ring-neutral-200/70">
      <FileText size={16} className="text-neutral-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[14px] text-neutral-800">{node.articleId ? (a.data?.title ?? (a.isError ? 'This article is unavailable' : '…')) : 'No article chosen yet'}</span>
      <button type="button" onClick={onPick} className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-primary hover:bg-primary-soft">{node.articleId ? 'Change article' : 'Choose article'}</button>
    </div>
  );
}

function Checks({ issues, onJump }: { issues: FlowIssue[]; onJump: (id: string) => void }) {
  if (!issues.length) return (
    <div className="flex items-center gap-3 rounded-[14px] bg-success-soft p-4 text-[14px] text-success"><CircleCheck size={18} aria-hidden /> No problems. This flow is ready to publish.</div>
  );
  const sorted = [...issues].sort((a, b) => Number(a.level === 'warning') - Number(b.level === 'warning'));
  return (
    <ul className="space-y-2" aria-label="Problems">
      {sorted.map((i, idx) => {
        const body = (
          <>
            {i.level === 'error' ? <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden /> : <CircleHelp size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />}
            <span className="min-w-0 flex-1"><span className="sr-only">{i.level === 'error' ? 'Error: ' : 'Warning: '}</span>{i.message}</span>
          </>
        );
        return (
          <li key={idx} data-level={i.level}>
            {i.nodeId
              ? <button type="button" onClick={() => onJump(i.nodeId!)} className="flex w-full items-start gap-2.5 rounded-[12px] bg-white p-3 text-left text-[13.5px] leading-snug text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors hover:bg-primary-soft hover:ring-primary/20">{body}</button>
              : <div className="flex items-start gap-2.5 rounded-[12px] bg-white p-3 text-[13.5px] leading-snug text-neutral-800 shadow-sm ring-1 ring-neutral-200">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function Outline({ flow, onJump }: { flow: Draft; onJump: (id: string) => void }) {
  const o = useMemo(() => outline(flow), [flow]);
  const node = (id: string) => flow.nodes.find((n) => n.id === id);
  const row = (r: { depth: number; nodeId: string; via?: string; repeat?: boolean }, i: number): ReactNode => {
    const n = node(r.nodeId);
    if (!n) return null;
    const Icon = KIND[n.kind].icon;
    return (
      <li key={i} style={{ paddingLeft: r.depth * 16 }}>
        {r.via !== undefined && <p className="ml-6 truncate pt-1 text-xs text-primary">{r.via || '(no label)'}</p>}
        <button type="button" onClick={() => onJump(r.nodeId)} className={clsx('flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] hover:bg-neutral-50', r.repeat ? 'text-ink-muted' : 'text-neutral-800')}>
          <Icon size={14} className="shrink-0 text-neutral-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{n.text || 'Untitled'}</span>
          {r.repeat && <span className="shrink-0 text-xs">see above</span>}
        </button>
      </li>
    );
  };
  return (
    <div>
      <ul aria-label="Flow outline" className="border-l border-neutral-200 pl-1">{o.rows.map(row)}</ul>
      {o.unconnected.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-ink-muted">Not connected to the start</p>
          <ul>{o.unconnected.map((id, i) => row({ depth: 0, nodeId: id }, i))}</ul>
        </div>
      )}
    </div>
  );
}
