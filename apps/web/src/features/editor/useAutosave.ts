import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError } from '../../api/client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
type Save<D> = (doc: D, baseRevision: number) => Promise<{ revision: number }>;

const BACKOFF = [2000, 4000, 8000, 15000, 30000];

/**
 * Debounced autosave with optimistic concurrency. Always sends the revision returned by the last successful save as
 * baseRevision. 409 -> 'conflict' (stops until reset); any other failure -> 'error' and retries with backoff.
 * Edits are never dropped: `dirty` stays true until the latest doc is acknowledged by the server.
 */
export function useAutosave<D>(save: Save<D>, delayMs = 1500, initialRevision = 0) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [dirty, setDirty] = useState(false);
  const [revision, setRevisionState] = useState(initialRevision);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);

  const r = useRef({
    save, doc: undefined as D | undefined, seq: 0, savedSeq: 0, rev: initialRevision,
    timer: undefined as ReturnType<typeof setTimeout> | undefined, inflight: null as Promise<void> | null, attempt: 0, conflict: false,
  }).current;
  r.save = save;

  const schedule = (ms: number) => { clearTimeout(r.timer); r.timer = setTimeout(() => { void run(); }, ms); };

  const run = async (): Promise<void> => {
    clearTimeout(r.timer);
    if (r.conflict || r.seq === r.savedSeq) return;
    if (r.inflight) { await r.inflight; return run(); }
    const seq = r.seq, doc = r.doc as D;
    setStatus('saving');
    r.inflight = (async () => {
      try {
        const res = await r.save(doc, r.rev);
        r.rev = res.revision; setRevisionState(res.revision);
        r.savedSeq = seq; r.attempt = 0;
        if (r.seq === seq) { setDirty(false); setStatus('saved'); } else schedule(delayMs); // newer edits arrived meanwhile
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) {
          r.conflict = true;
          setConflictRevision((e.body as { current?: { revision?: number } } | null)?.current?.revision ?? null);
          setStatus('conflict');
        } else {
          setStatus('error');
          schedule(BACKOFF[Math.min(r.attempt++, BACKOFF.length - 1)]!);
        }
      } finally { r.inflight = null; }
    })();
    return r.inflight;
  };

  const change = useCallback((doc: D) => {
    r.doc = doc; r.seq++;
    setDirty(true);
    // conflict: wait for reset; error backoff: the pending retry picks up the latest doc
    if (!r.conflict && !(r.attempt > 0 && !r.inflight)) schedule(delayMs);
  }, [delayMs]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Saves now (blur, navigation, before a status change). Resolves true when everything is saved. */
  const flush = useCallback(async () => { if (r.inflight) await r.inflight; await run(); return !r.conflict && r.seq === r.savedSeq; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adopt a server revision (after reload/restore); discards the unsaved state. */
  const reset = useCallback((rev: number) => {
    clearTimeout(r.timer);
    r.rev = rev; r.savedSeq = r.seq; r.conflict = false; r.attempt = 0;
    setRevisionState(rev); setConflictRevision(null); setDirty(false); setStatus('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (r.seq !== r.savedSeq) { e.preventDefault(); e.returnValue = ''; void run(); } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void run(); // navigating away inside the app: save what is pending
      clearTimeout(r.timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, dirty, revision, conflictRevision, change, flush, reset };
}
