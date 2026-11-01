import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError } from '../../api/client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
/** explicit: user asked to save (Ctrl+S) = a checkpoint revision; keepalive: page is unloading */
export interface SaveOpts { explicit: boolean; keepalive: boolean }
type Save<D> = (doc: D, baseRevision: number, opts: SaveOpts) => Promise<{ revision: number }>;

const BACKOFF = [2000, 4000, 8000, 15000, 30000];
/** Network failures, 5xx, 408 and 429 may succeed later; other 4xx won't until something changes. */
const transient = (e: unknown) => !(e instanceof HttpError) || e.status >= 500 || e.status === 408 || e.status === 429;

/**
 * Debounced autosave with optimistic concurrency. Always sends the revision returned by the last successful save as
 * baseRevision. 409 -> 'conflict' (stops until reset). Transient failures -> 'error' + retry with backoff
 * (errorKind 'retrying'); other 4xx -> 'error' without automatic retry (errorKind 'rejected'; flush() retries).
 * Edits are never dropped: `dirty` stays true until the latest doc is acknowledged by the server.
 */
export function useAutosave<D>(save: Save<D>, delayMs = 1500, initialRevision = 0) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorKind, setErrorKind] = useState<'retrying' | 'rejected' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevisionState] = useState(initialRevision);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);

  const r = useRef({
    save, doc: undefined as D | undefined, hasDoc: false, seq: 0, savedSeq: 0, rev: initialRevision,
    timer: undefined as ReturnType<typeof setTimeout> | undefined, inflight: null as Promise<void> | null,
    attempt: 0, conflict: false, rejected: false,
  }).current;
  r.save = save;

  const schedule = (ms: number) => { clearTimeout(r.timer); r.timer = setTimeout(() => { void run(); }, ms); };

  const run = async (o: Partial<SaveOpts> & { force?: boolean } = {}): Promise<void> => {
    clearTimeout(r.timer);
    if (r.conflict || !r.hasDoc || (r.seq === r.savedSeq && !o.force)) return;
    if (r.inflight) { await r.inflight; return run(o); }
    const seq = r.seq, doc = r.doc as D;
    setStatus('saving');
    r.inflight = (async () => {
      try {
        const res = await r.save(doc, r.rev, { explicit: !!o.explicit, keepalive: !!o.keepalive });
        r.rev = res.revision; setRevisionState(res.revision);
        r.savedSeq = seq; r.attempt = 0; r.rejected = false; setErrorKind(null);
        if (r.seq === seq) { setDirty(false); setStatus('saved'); } else schedule(delayMs); // newer edits arrived meanwhile
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) {
          r.conflict = true;
          setConflictRevision((e.body as { current?: { revision?: number } } | null)?.current?.revision ?? null);
          setStatus('conflict');
        } else if (transient(e)) {
          setStatus('error'); setErrorKind('retrying');
          schedule(BACKOFF[Math.min(r.attempt++, BACKOFF.length - 1)]!);
        } else {
          r.rejected = true; setStatus('error'); setErrorKind('rejected');
        }
      } finally { r.inflight = null; }
    })();
    return r.inflight;
  };

  const change = useCallback((doc: D) => {
    r.doc = doc; r.hasDoc = true; r.seq++;
    setDirty(true);
    // conflict: wait for reset; error backoff: the pending retry picks up the latest doc; rejected: try again on the next edit
    if (r.conflict || (r.attempt > 0 && !r.inflight)) return;
    r.rejected = false;
    schedule(delayMs);
  }, [delayMs]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Saves now (blur, navigation, before a status change, manual retry). `explicit` = Ctrl+S: a checkpoint revision,
   * sent even when nothing changed since the last autosave. Resolves true when everything is saved.
   */
  const flush = useCallback(async (o: { explicit?: boolean } = {}) => {
    if (r.inflight) await r.inflight;
    r.attempt = 0;
    await run({ explicit: o.explicit, force: o.explicit });
    return !r.conflict && r.seq === r.savedSeq;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adopt a server revision (after reload/restore); discards the unsaved state. */
  const reset = useCallback((rev: number) => {
    clearTimeout(r.timer);
    r.rev = rev; r.savedSeq = r.seq; r.conflict = false; r.attempt = 0; r.rejected = false;
    setRevisionState(rev); setConflictRevision(null); setDirty(false); setStatus('idle'); setErrorKind(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (r.seq !== r.savedSeq) { e.preventDefault(); e.returnValue = ''; void run({ keepalive: true }); } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void run(); // navigating away inside the app: save what is pending
      clearTimeout(r.timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, errorKind, dirty, revision, conflictRevision, change, flush, reset };
}
