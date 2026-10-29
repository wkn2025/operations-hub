import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, BookA, CornerDownLeft, FileText, Folder, Hash, History, Search, X, type LucideIcon } from 'lucide-react';
import { api, type SearchGroup, type SearchHit } from '../../api/client';
import { parseMarked } from '../../lib/text';
import { readPref, writePref } from '../../lib/prefs';
import { Kbd } from '../../components/ui/primitives';

// ---- open state + global hotkey ----
interface SearchCtx { open: boolean; setOpen: (v: boolean) => void; openWith: (q: string) => void; initial: string }
const Ctx = createContext<SearchCtx>({ open: false, setOpen: () => {}, openWith: () => {}, initial: '' });
export const useSearch = () => useContext(Ctx);
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpenRaw] = useState(false);
  const [initial, setInitial] = useState('');
  const setOpen = useCallback((v: boolean) => { if (v) setInitial(''); setOpenRaw(v); }, []);
  const openWith = useCallback((q: string) => { setInitial(q); setOpenRaw(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) { e.preventDefault(); setInitial(''); setOpenRaw((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <Ctx.Provider value={{ open, setOpen, openWith, initial }}>{children}</Ctx.Provider>;
}

// ---- dialog ----
const GROUPS: { kind: SearchGroup['kind']; label: string; icon: LucideIcon }[] = [
  { kind: 'article', label: 'Articles', icon: FileText },
  { kind: 'glossary', label: 'Glossary', icon: BookA },
  { kind: 'category', label: 'Categories', icon: Folder },
  { kind: 'tag', label: 'Tags', icon: Hash },
];
const RECENT = 'ops.recentSearches';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function SearchDialog() {
  const { open, setOpen, initial } = useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const term = useDebounced(q.trim(), 140);

  useEffect(() => { if (open) { setQ(initial); setRecent(readPref<string[]>(RECENT, [])); } }, [open, initial]);

  const res = useQuery<SearchGroup[]>({
    queryKey: ['search', term], enabled: open && term.length > 0, staleTime: 30_000, placeholderData: (prev) => prev,
    queryFn: ({ signal }) => api<{ groups: SearchGroup[] }>(`/api/search?q=${encodeURIComponent(term)}&limit=20`, { signal }).then((r) => r.groups),
  });
  const groups = useMemo(() => (term && res.data ? GROUPS.map((g) => ({ ...g, hits: res.data.find((x) => x.kind === g.kind)?.hits ?? [] })).filter((g) => g.hits.length) : []), [res.data, term]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits.map((h) => ({ kind: g.kind, hit: h }))), [groups]);
  useEffect(() => setSel(0), [res.data]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const remember = useCallback((s: string) => {
    const next = [s, ...readPref<string[]>(RECENT, []).filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 6);
    writePref(RECENT, next);
  }, []);

  const choose = (item: { kind: SearchGroup['kind']; hit: SearchHit } | undefined) => {
    if (!item) return;
    if (item.kind === 'tag') { setQ(item.hit.title); return; }
    remember(q.trim());
    setOpen(false);
    navigate(item.kind === 'category' ? `/category/${item.hit.id}` : `/article/${item.hit.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[sel]); }
  };

  const loading = term.length > 0 && res.isFetching && !res.data;
  const empty = term.length > 0 && !res.isFetching && res.data && flat.length === 0;
  const optId = (i: number) => `${baseId}-opt-${i}`;
  let idx = -1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(244_246_251/0.55)] backdrop-blur-[6px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <Dialog.Content aria-describedby={undefined}
          className="glass fixed left-1/2 top-[12vh] z-50 flex max-h-[min(640px,76vh)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[22px] !bg-white/90 shadow-lg data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in">
          <Dialog.Title className="sr-only">Search the knowledge base</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-neutral-200/70 px-5">
            <Search size={19} strokeWidth={2} className={clsx('shrink-0 transition-colors', q ? 'text-primary' : 'text-neutral-400')} aria-hidden />
            <input
              role="combobox" aria-expanded={flat.length > 0} aria-controls={`${baseId}-list`} aria-autocomplete="list"
              aria-activedescendant={flat.length ? optId(sel) : undefined} aria-label="Search"
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Search articles, clients, error codes, acronyms…" spellCheck={false}
              className="h-[60px] min-w-0 flex-1 bg-transparent text-[17px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:outline-none"
            />
            {q ? (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"><X size={16} /></button>
            ) : <Kbd>Esc</Kbd>}
          </div>

          <div ref={listRef} id={`${baseId}-list`} role="listbox" aria-label="Search results" aria-busy={loading || undefined} className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
            {!term && <Recent items={recent} onPick={setQ} onClear={() => { writePref(RECENT, []); setRecent([]); }} />}
            {loading && <LoadingRows />}
            {empty && (
              <div className="px-4 py-10 text-center">
                <p className="text-[15px] font-medium text-neutral-800">No matches for “{term}”</p>
                <p className="mt-1.5 text-sm text-neutral-500">Try a client name, an acronym like GOP, or an error code such as E-112.</p>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.kind} role="group" aria-labelledby={`${baseId}-${g.kind}`} className="mb-1.5 last:mb-0">
                <p id={`${baseId}-${g.kind}`} className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-400">{g.label}</p>
                {g.hits.map((h) => {
                  const i = ++idx, on = i === sel;
                  const Icon = g.icon;
                  return (
                    <div key={h.id} id={optId(i)} role="option" aria-selected={on} onMouseMove={() => sel !== i && setSel(i)} onClick={() => choose(flat[i])}
                      className={clsx('group flex cursor-pointer items-start gap-3 rounded-[14px] px-3 py-2.5 transition-colors duration-150', on ? 'bg-primary-soft' : 'hover:bg-neutral-50')}>
                      <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset transition-colors',
                        on ? 'bg-white text-primary ring-primary/15' : 'bg-neutral-50 text-neutral-500 ring-neutral-200/80')}>
                        <Icon size={16} strokeWidth={1.9} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={clsx('truncate text-[14.5px] font-medium', on ? 'text-primary' : 'text-neutral-900')}>{h.title}</span>
                          {h.categoryPath && <span className="hidden truncate text-xs text-neutral-400 sm:inline">{h.categoryPath}</span>}
                        </div>
                        {h.snippet && <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-neutral-500"><Snippet s={h.snippet} /></p>}
                      </div>
                      <CornerDownLeft size={15} aria-hidden className={clsx('mt-2 shrink-0 text-primary transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 border-t border-neutral-200/70 bg-neutral-50/60 px-5 py-2.5 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><Kbd><ArrowUp size={11} /></Kbd><Kbd><ArrowDown size={11} /></Kbd> to move</span>
            <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft size={11} /></Kbd> to open</span>
            <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> to close</span>
            {flat.length > 0 && <span className="ml-auto tabular">{flat.length} result{flat.length === 1 ? '' : 's'}</span>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Snippet({ s }: { s: string }) {
  return <>{parseMarked(s).map((p, i) => (p.mark ? <mark key={i} className="hl font-medium text-neutral-800">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

function Recent({ items, onPick, onClear }: { items: string[]; onPick: (s: string) => void; onClear: () => void }) {
  if (!items.length) {
    return (
      <div className="px-4 py-9 text-center">
        <p className="text-[15px] font-medium text-neutral-800">Search everything in the hub</p>
        <p className="mt-1.5 text-sm text-neutral-500">Titles, body text, tags, client names and glossary terms. Matches are highlighted.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <p className="text-xs font-medium text-neutral-400">Recent searches</p>
        <button type="button" onClick={onClear} className="rounded px-1 text-xs text-neutral-400 transition-colors hover:text-neutral-700">Clear</button>
      </div>
      {items.map((r) => (
        <button key={r} type="button" onClick={() => onPick(r)}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-neutral-900">
          <History size={15} className="shrink-0 text-neutral-400" aria-hidden />
          <span className="truncate">{r}</span>
        </button>
      ))}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1 px-1 pt-2" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3 rounded-[14px] px-3 py-2.5">
          <span className="h-8 w-8 animate-pulse rounded-[10px] bg-neutral-100" />
          <div className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-2/5 animate-pulse rounded bg-neutral-100" />
            <span className="block h-2.5 w-4/5 animate-pulse rounded bg-neutral-100" style={{ animationDelay: `${i * 120}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
