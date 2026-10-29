import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Archive, ArchiveRestore, ArrowLeft, Check, Copy, Eye, History, MoreHorizontal, PenLine, RefreshCw, Send, ShieldAlert, SlidersHorizontal, TriangleAlert, Upload } from 'lucide-react';
import type { ArticleType } from '@ops/shared';
import { api, HttpError, isEditorRole, useCategories, useSession, type Article } from '../api/client';
import { Button, IconTile, StatusBadge } from '../components/ui/primitives';
import { ErrorState } from '../components/ui/ErrorState';
import { NotFound } from './NotFound';
import { ArticleTemplate } from '../features/articles/templates';
import { ArticleEditor, useArticleEditor } from '../features/editor/ArticleEditor';
import { MetaPanel, uploadMessage, validateMeta, type Draft } from '../features/editor/MetaPanel';
import { VersionPanel } from '../features/editor/VersionPanel';
import { STARTER, TemplatePicker } from '../features/editor/TemplatePicker';
import { useAutosave, type SaveStatus } from '../features/editor/useAutosave';

const fromArticle = (a: Article): Draft => ({
  title: a.title, type: a.type, categoryId: a.categoryId, content: a.content, fields: a.fields ?? {}, tags: a.tags, reviewDate: a.reviewDate,
  related: (a.related ?? []).map((r) => ({ id: r.id, title: r.title })), ownerId: a.owner?.id ?? null,
});

/** Save body for the API. Fields failing validation are left out so the rest still saves (the server keeps the old value). */
function payload(d: Draft) {
  const e = validateMeta(d);
  return {
    ...(e.title ? {} : { title: d.title.trim() }), type: d.type, categoryId: d.categoryId, content: d.content,
    ...(e.validTo || e.keyLimits ? {} : { fields: d.fields }), ...(e.tags ? {} : { tags: d.tags }),
    reviewDate: d.reviewDate, related: d.related.map((r) => r.id), ...(d.ownerId ? { ownerId: d.ownerId } : {}),
  };
}

/** /edit/:id (id or "new"). Editors and admins only; the server enforces the same on every request. */
export function EditArticle() {
  const session = useSession();
  const { id = 'new' } = useParams();
  const created = useRef(new Set<string>());
  const [sessionKey, setSessionKey] = useState(id);
  // A draft we just created changes the URL to /edit/<new id>: keep the same editor session instead of reloading.
  if (id !== sessionKey && !created.current.has(id)) setSessionKey(id);

  if (session.isPending) return null;
  if (!isEditorRole(session.data?.user?.role)) return <Forbidden />;
  return <EditSession key={sessionKey} id={sessionKey} onCreated={(newId) => created.current.add(newId)} />;
}

function Forbidden() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <IconTile icon={ShieldAlert} size="lg" />
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">Editing isn’t available to you</h1>
      <p className="mt-2 max-w-md text-[15px] text-neutral-500">Only editors and admins can create or change articles. Ask an admin to add your email to the editor list.</p>
      <Link to="/" className="mt-6 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">Go to home</Link>
    </div>
  );
}

function EditSession({ id, onCreated }: { id: string; onCreated: (id: string) => void }) {
  const [params] = useSearchParams();
  const cats = useCategories();
  const isNew = id === 'new';
  const q = useQuery({ queryKey: ['edit-article', id], enabled: !isNew, retry: false, staleTime: 0, gcTime: 0, queryFn: () => api<Article>(`/api/articles/${encodeURIComponent(id)}`) });
  const qType = params.get('type') as ArticleType | null;
  const qCat = params.get('category');
  const initialCat = qCat ? (cats.data?.find((c) => c.id === qCat || c.slug === qCat)?.id ?? null) : null;
  const [picked, setPicked] = useState<{ type: ArticleType; categoryId: string | null } | null>(qType && STARTER[qType] ? { type: qType, categoryId: null } : null);
  const [cat, setCat] = useState<string | null>(null);

  if (isNew) {
    if (!picked) return <TemplatePicker categoryId={cat ?? initialCat} onCategory={setCat} onPick={(type) => setPicked({ type, categoryId: cat ?? initialCat })} />;
    const draft: Draft = { title: '', type: picked.type, categoryId: picked.categoryId ?? initialCat, content: STARTER[picked.type], fields: {}, tags: [], reviewDate: null, related: [], ownerId: null };
    return <Workspace initialDraft={draft} initialArticle={null} onCreated={onCreated} />;
  }
  if (q.isPending) return <p className="py-16 text-center text-sm text-ink-muted" aria-busy="true">Opening the editor…</p>;
  if (q.error) {
    const status = q.error instanceof HttpError ? q.error.status : 0;
    if (status === 404) return <NotFound what="article" />;
    return <ErrorState title="Couldn’t open this article" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  return <Workspace initialDraft={fromArticle(q.data)} initialArticle={q.data} onCreated={onCreated} />;
}

function Workspace({ initialDraft, initialArticle, onCreated }: { initialDraft: Draft; initialArticle: Article | null; onCreated: (id: string) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [article, setArticle] = useState<Article | null>(initialArticle);
  const [draft, setDraftState] = useState<Draft>(initialDraft);
  const draftRef = useRef(draft);
  const idRef = useRef<string | null>(initialArticle?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const remember = (a: Article) => {
    setArticle(a);
    qc.setQueryData(['article', a.slug], a);
    qc.setQueryData(['article', a.id], a);
  };

  const autosave = useAutosave<Draft>(async (d, base) => {
    let a: Article;
    if (!idRef.current) {
      const body = payload(d);
      a = await api<Article>('/api/articles', { method: 'POST', json: { ...body, title: body.title || 'Untitled draft', ownerId: undefined } });
      idRef.current = a.id;
      onCreated(a.id);
      navigate(`/edit/${a.id}`, { replace: true });
    } else {
      a = await api<Article>(`/api/articles/${idRef.current}`, { method: 'PATCH', json: { ...payload(d), baseRevision: base } });
    }
    remember(a);
    setLastSaved(new Date());
    return { revision: a.revision };
  }, 1500, initialArticle?.revision ?? 0);

  const setDraft = (d: Draft) => { draftRef.current = d; setDraftState(d); autosave.change(d); };

  const canWrite = article ? !!article.permissions?.write : true;
  const editor = useArticleEditor({
    content: initialDraft.content, editable: canWrite,
    onChange: (content) => setDraft({ ...draftRef.current, content }),
    onBlur: () => { void autosave.flush(); },
    onUploadError: (e) => setNotice({ tone: 'error', text: uploadMessage(e) }),
    onUploadBusy: setUploading,
  });

  // Ctrl/Cmd+S saves now
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void autosave.flush(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); void qc.invalidateQueries({ queryKey: ['articles'] }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adopt = (a: Article) => {
    const d = fromArticle(a);
    draftRef.current = d; setDraftState(d);
    editor.commands.setContent(a.content as object, false);
    remember(a);
    autosave.reset(a.revision);
  };

  const reloadLatest = async () => {
    try { adopt(await api<Article>(`/api/articles/${idRef.current}`)); setNotice(null); }
    catch { setNotice({ tone: 'error', text: 'Couldn’t load the latest version. Try again.' }); }
  };
  const copyMine = async () => {
    const html = `<h1>${escapeHtml(draftRef.current.title)}</h1>${editor.getHTML()}`;
    const text = `${draftRef.current.title}\n\n${editor.getText()}`;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      } else await navigator.clipboard.writeText(text);
      setNotice({ tone: 'info', text: 'Your version is on the clipboard. Reload the latest version, then paste what you need.' });
    } catch { setNotice({ tone: 'error', text: 'The browser blocked clipboard access. Select the text and copy it manually.' }); }
  };

  const act = async (action: 'publish' | 'submit' | 'archive' | 'restore') => {
    setNotice(null);
    const clean = await autosave.flush();
    if (!idRef.current) return;
    if (!clean) { setNotice({ tone: 'error', text: 'Save your changes first, then try again.' }); return; }
    try {
      const a = await api<Article>(`/api/articles/${idRef.current}/${action}`, { method: 'POST' });
      remember(a);
      void qc.invalidateQueries({ queryKey: ['articles'] });
      setNotice({ tone: 'info', text: { publish: 'Published. Readers can see it now.', submit: 'Submitted for review. An admin will publish it.', archive: 'Archived. It no longer appears for readers.', restore: 'Restored as a draft.' }[action] });
    } catch (e) {
      const s = e instanceof HttpError ? e.status : 0;
      setNotice({ tone: 'error', text: s === 403 ? 'You don’t have permission to do that. Approvals may be required.' : s === 409 ? 'The article’s status changed meanwhile. Reload the page.' : 'That didn’t work. Check your connection and try again.' });
    }
  };

  const previewArticle = useMemo<Article>(() => ({
    id: article?.id ?? 'new', slug: article?.slug ?? '', status: article?.status ?? 'draft', categoryPath: article?.categoryPath ?? '',
    owner: article?.owner ?? null, revision: autosave.revision, updatedAt: article?.updatedAt ?? new Date().toISOString(), publishedAt: article?.publishedAt ?? null,
    linkTargets: article?.linkTargets ?? {}, ...draft, title: draft.title || 'Untitled draft', related: [],
  }), [article, draft, autosave.revision]);

  const p = article?.permissions;
  const status = article?.status ?? 'draft';

  return (
    <div>
      <DocBar
        back={article?.status === 'published' ? `/article/${article.slug}` : '/'}
        status={status} save={autosave.status} dirty={autosave.dirty} isNew={!article} uploading={uploading} lastSaved={lastSaved}
        onRetry={() => void autosave.flush()} preview={preview} onPreview={() => setPreview((v) => !v)}
        onHistory={() => setTab('history')} historyDisabled={!article}
        actions={article && p ? (
          <>
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
                      <Archive size={15} aria-hidden /> Archive article
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            )}
          </>
        ) : null}
      />

      {autosave.status === 'conflict' && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-[16px] bg-warning-soft px-4 py-3.5 ring-1 ring-inset ring-warning/20">
          <TriangleAlert size={18} className="shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-neutral-800">
            <strong className="font-semibold">Someone else saved this article</strong>{autosave.conflictRevision ? ` (revision ${autosave.conflictRevision})` : ''} while you were editing. Your latest changes aren’t saved.
          </p>
          <Button variant="ghost" className="bg-white/70" onClick={copyMine}><Copy size={15} aria-hidden /> Copy my version</Button>
          <Button onClick={reloadLatest}><RefreshCw size={15} aria-hidden /> Reload latest</Button>
        </div>
      )}
      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={clsx('mb-5 flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px]', notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-medium underline-offset-2 hover:underline">Dismiss</button>
        </div>
      )}
      {article && !canWrite && (
        <div role="note" className="mb-5 rounded-[14px] bg-neutral-100 px-4 py-3 text-[14px] text-neutral-700">
          {status === 'archived' ? 'This article is archived. Restore it as a draft to edit it.' : 'Published articles can only be changed by an admin while approvals are switched on.'}
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 max-w-[760px]">
          <div hidden={preview}>
            <TitleInput value={draft.title} disabled={!canWrite} onChange={(title) => setDraft({ ...draftRef.current, title })} onEnter={() => editor.commands.focus('start')} />
            <ArticleEditor editor={editor} />
          </div>
          {preview && (
            <div className="relative">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"><Eye size={13} aria-hidden /> Preview: what readers will see</p>
              <ArticleTemplate article={previewArticle} />
            </div>
          )}
        </div>

        <aside aria-label="Article settings" className="xl:sticky xl:top-[150px] xl:max-h-[calc(100vh-170px)] xl:self-start">
          <div className="flex max-h-full flex-col overflow-hidden rounded-[20px] bg-white shadow-md ring-1 ring-neutral-200/80">
            <div role="tablist" aria-label="Panels" className="flex shrink-0 gap-1 border-b border-neutral-200/70 p-1.5">
              {([['details', 'Details', SlidersHorizontal], ['history', 'History', History]] as const).map(([k, label, Icon]) => (
                <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} disabled={k === 'history' && !article}
                  className={clsx('flex flex-1 items-center justify-center gap-2 rounded-[12px] py-2 text-[13px] font-medium transition-colors disabled:opacity-40',
                    tab === k ? 'bg-primary-soft text-primary' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800')}>
                  <Icon size={14} aria-hidden />{label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'details' || !article
                ? <MetaPanel draft={draft} onChange={setDraft} articleId={article?.id} slug={article?.slug} published={!!article?.publishedAt} disabled={!canWrite} />
                : <VersionPanel articleId={article.id} current={{ title: draft.title, content: draft.content }} currentRevision={autosave.revision}
                    canRestore={canWrite} beforeRestore={async () => { await autosave.flush(); }} onRestored={(a) => { adopt(a); setNotice({ tone: 'info', text: `Restored. Saved as revision ${a.revision}.` }); }} />}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function TitleInput({ value, onChange, onEnter, disabled }: { value: string; onChange: (v: string) => void; onEnter: () => void; disabled?: boolean }) {
  const err = !value.trim();
  return (
    <div className="mb-6">
      <textarea aria-label="Title" rows={1} value={value} disabled={disabled} placeholder="Untitled article" maxLength={200} autoFocus={!value}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        className="block w-full resize-none bg-transparent text-balance text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-neutral-900 outline-none [field-sizing:content] placeholder:text-neutral-300 focus-visible:outline-none" />
      {err && value !== '' && <p className="mt-1 text-xs text-danger">Give the article a title.</p>}
    </div>
  );
}

const SAVE: Record<SaveStatus | 'dirty' | 'new', { label: string; dot: string }> = {
  new: { label: 'Not saved yet', dot: 'bg-neutral-300' },
  idle: { label: 'All changes saved', dot: 'bg-accent' },
  dirty: { label: 'Unsaved changes', dot: 'bg-neutral-400' },
  saving: { label: 'Saving…', dot: 'bg-primary animate-pulse' },
  saved: { label: 'Saved', dot: 'bg-accent' },
  conflict: { label: 'Not saved: conflict', dot: 'bg-warning' },
  error: { label: 'Couldn’t save. Retrying…', dot: 'bg-danger animate-pulse' },
};

function DocBar({ back, status, save, dirty, isNew, uploading, lastSaved, onRetry, preview, onPreview, onHistory, historyDisabled, actions }: {
  back: string; status: Article['status']; save: SaveStatus; dirty: boolean; isNew: boolean; uploading: boolean; lastSaved: Date | null; onRetry: () => void;
  preview: boolean; onPreview: () => void; onHistory: () => void; historyDisabled: boolean; actions: React.ReactNode;
}) {
  const key = save === 'conflict' || save === 'error' || save === 'saving' ? save : isNew && !dirty ? 'new' : dirty ? 'dirty' : save;
  const s = SAVE[key];
  return (
    <div className="sticky top-[76px] z-10 -mx-3 mb-6 px-3 pb-2">
      <div className="glass flex h-14 items-center gap-2 rounded-[18px] pl-2 pr-2">
        <Link to={back} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-[12px] text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"><ArrowLeft size={18} /></Link>
        <span className="flex items-center gap-1.5 pl-1 text-[13px] font-medium text-neutral-700"><PenLine size={14} className="text-neutral-400" aria-hidden />Editing</span>
        <StatusBadge status={status} />
        <span aria-live="polite" className="ml-2 flex items-center gap-2 text-[13px] text-neutral-500" data-save-state={key}>
          <span className={clsx('h-2 w-2 rounded-full transition-colors duration-300', s.dot)} aria-hidden />
          {uploading ? 'Uploading image…' : s.label}
          {key === 'saved' && lastSaved && <span className="text-ink-muted tabular">{lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          {key === 'saved' && <Check size={13} className="text-accent-ink" aria-hidden />}
          {save === 'error' && <button type="button" onClick={onRetry} className="font-medium text-primary hover:underline">Retry now</button>}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" aria-pressed={preview} onClick={onPreview}
            className={clsx('flex h-9 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium transition-colors', preview ? 'bg-primary-soft text-primary' : 'text-neutral-600 hover:bg-white hover:text-neutral-900')}>
            <Eye size={16} aria-hidden /> Preview
          </button>
          <button type="button" onClick={onHistory} disabled={historyDisabled}
            className="flex h-9 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium text-neutral-600 transition-colors hover:bg-white hover:text-neutral-900 disabled:opacity-40">
            <History size={16} aria-hidden /> History
          </button>
          {actions && <span aria-hidden className="mx-1 h-6 w-px bg-neutral-200" />}
          {actions}
        </div>
      </div>
    </div>
  );
}
