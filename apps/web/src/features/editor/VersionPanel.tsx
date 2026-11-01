import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { History, RotateCcw, X } from 'lucide-react';
import type { PmNode } from '@ops/shared';
import { api, type Article } from '../../api/client';
import { ArticleRenderer } from '../articles/ArticleRenderer';
import { Button } from '../../components/ui/primitives';
import { ErrorState } from '../../components/ui/ErrorState';
import { fmtDate, textOf } from '../../lib/text';

/** coalescable = the author's open autosave revision: later autosaves (same author, <10 min) overwrite it in place */
interface RevisionRow { id: number; rev: number; title: string; authorId: string | null; createdAt: string; note: string | null; coalescable?: boolean }
interface RevisionFull { rev: number; title: string; content: PmNode; fields: Record<string, unknown> }
type Snap = { title: string; content: PmNode };

const words = (d: PmNode) => textOf(d).split(/\s+/).filter(Boolean).length;

/** Cheap "what changed" between a revision and the current draft: title, word delta, top-level blocks that differ. */
export function diffSummary(rev: Snap, current: Snap) {
  const a = rev.content.content ?? [], b = current.content.content ?? [];
  let changedBlocks = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) changedBlocks++;
  // textOf concatenates blocks without spaces; count per block instead
  const count = (d: PmNode) => (d.content ?? []).reduce((n, c) => n + words(c), 0);
  return { titleChanged: rev.title !== current.title, wordDelta: count(current.content) - count(rev.content), changedBlocks };
}

const when = (iso: string) => `${fmtDate(iso)}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

export function VersionPanel({ articleId, current, currentRevision, beforeRestore, onRestored, canRestore }: {
  articleId: string; current: Snap; currentRevision: number; beforeRestore: () => Promise<void>; onRestored: (a: Article) => void; canRestore: boolean;
}) {
  const list = useQuery({
    queryKey: ['revisions', articleId, currentRevision], // refetch after every save (the counter, not a row number)
    queryFn: () => api<{ revisions: RevisionRow[] }>(`/api/articles/${articleId}/revisions`).then((r) => r.revisions),
  });
  const [viewing, setViewing] = useState<number | null>(null);

  if (list.isError) return <div className="p-5"><ErrorState compact title="Couldn’t load the history" onRetry={() => list.refetch()} retrying={list.isFetching} /></div>;
  return (
    <div className="px-3 py-3">
      <p className="px-2 pb-2 text-xs text-ink-muted">Autosaves are collected into one draft revision per 10 minutes; Ctrl+S, publishing and review steps keep a fixed checkpoint. Restoring one saves it as a new revision, so nothing is lost.</p>
      <ol className="relative">
        {(list.data ?? []).map((r, i) => { const isLatest = i === 0; return (
          <li key={r.rev} className="relative">
            <button type="button" aria-label={`View revision ${r.rev}`} onClick={() => setViewing(r.rev)}
              className="group flex w-full items-start gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-neutral-50">
              <span className="relative flex w-3 shrink-0 justify-center pt-1.5">
                <span className={clsx('h-2 w-2 rounded-full ring-4 ring-white', isLatest ? 'bg-accent' : 'bg-neutral-300 group-hover:bg-primary')} aria-hidden />
                {i < (list.data?.length ?? 0) - 1 && <span aria-hidden className="absolute top-4 h-[calc(100%+4px)] w-px bg-neutral-200" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] font-medium text-neutral-900">
                  <span>Revision {r.rev}</span>
                  {isLatest && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold text-accent-ink">Current</span>}
                </span>
                <span className="block text-xs text-ink-muted tabular">{when(r.createdAt)}</span>
                {r.coalescable && <span className="mt-0.5 block text-xs text-neutral-600">Autosaved draft (still updating)</span>}
                {r.note && <span className="mt-0.5 block truncate text-xs text-neutral-600">{r.note}</span>}
              </span>
            </button>
          </li>
        ); })}
        {list.isPending && <li className="px-2 py-3 text-sm text-ink-muted">Loading history…</li>}
      </ol>
      {viewing !== null && (
        <RevisionDialog articleId={articleId} rev={viewing} current={current} isCurrent={viewing === list.data?.[0]?.rev} canRestore={canRestore}
          onClose={() => setViewing(null)}
          onRestore={async () => {
            await beforeRestore();
            const a = await api<Article>(`/api/articles/${articleId}/revisions/${viewing}/restore`, { method: 'POST' });
            setViewing(null);
            onRestored(a);
          }} />
      )}
    </div>
  );
}

function RevisionDialog({ articleId, rev, current, isCurrent, canRestore, onClose, onRestore }: {
  articleId: string; rev: number; current: Snap; isCurrent: boolean; canRestore: boolean; onClose: () => void; onRestore: () => Promise<void>;
}) {
  const q = useQuery({ queryKey: ['revision', articleId, rev], queryFn: () => api<RevisionFull>(`/api/articles/${articleId}/revisions/${rev}`) });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const d = q.data ? diffSummary({ title: q.data.title, content: q.data.content }, current) : null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-overlay-in" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed inset-y-4 right-4 z-50 flex w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] bg-white shadow-lg ring-1 ring-neutral-200 data-[state=open]:animate-dialog-in">
          <header className="flex items-start gap-3 border-b border-neutral-200/70 px-6 py-4">
            <History size={18} className="mt-1 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[16px] font-semibold text-neutral-900">Revision {rev}{isCurrent && ' (current)'}</Dialog.Title>
              {d && !isCurrent && (
                <ul aria-label="Changes compared with now" className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {d.titleChanged && <li className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">Title changed</li>}
                  <li className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 tabular">
                    {d.wordDelta === 0 ? 'Same length as now' : `${Math.abs(d.wordDelta)} word${Math.abs(d.wordDelta) === 1 ? '' : 's'} ${d.wordDelta > 0 ? 'added' : 'removed'} since`}
                  </li>
                  <li className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 tabular">{d.changedBlocks === 0 ? 'Same blocks' : `${d.changedBlocks} block${d.changedBlocks === 1 ? ' differs' : 's differ'}`}</li>
                </ul>
              )}
            </div>
            <Dialog.Close className="rounded-[10px] p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close"><X size={18} /></Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-8 py-7">
            {q.isPending && <p className="text-sm text-ink-muted">Loading revision…</p>}
            {q.isError && <ErrorState compact title="Couldn’t load this revision" onRetry={() => q.refetch()} retrying={q.isFetching} />}
            {q.data && (<>
              <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-neutral-900">{q.data.title}</h1>
              <ArticleRenderer doc={q.data.content} />
            </>)}
          </div>
          {canRestore && !isCurrent && q.data && (
            <footer className="border-t border-neutral-200/70 bg-neutral-50/70 px-6 py-3.5">
              {!confirm ? (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>Close</Button>
                  <Button onClick={() => setConfirm(true)}><RotateCcw size={15} aria-hidden /> Restore this version</Button>
                </div>
              ) : (
                <div role="alertdialog" aria-label="Confirm restore" className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-[13.5px] text-neutral-700">
                    {err ? <span className="text-danger">Restore failed. Try again.</span> : <>The current text is replaced by revision {rev}. It stays in the history.</>}
                  </p>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                  <Button disabled={busy} onClick={async () => { setBusy(true); setErr(false); try { await onRestore(); } catch { setErr(true); } finally { setBusy(false); } }}>
                    Restore revision {rev}
                  </Button>
                </div>
              )}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
