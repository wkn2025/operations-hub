import { useEffect, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { api, useRecentArticles, type SearchGroup } from '../../api/client';
import { Kbd } from '../../components/ui/primitives';

export interface Picked { id: string; title: string }

/** Search published and draft articles (whatever /api/search shows this user) and pick one. */
export function LinkPicker({ open, onOpenChange, onPick, exclude = [], title = 'Link to an article' }: {
  open: boolean; onOpenChange: (o: boolean) => void; onPick: (a: Picked) => void; exclude?: string[]; title?: string;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (open) { setQ(''); setDebounced(''); } }, [open]);

  const search = useQuery({
    queryKey: ['link-search', debounced], enabled: open && !!debounced,
    queryFn: () => api<{ groups: SearchGroup[] }>(`/api/search?q=${encodeURIComponent(debounced)}&limit=12`).then((r) => r.groups),
  });
  const recent = useRecentArticles(20);
  const items = useMemo(() => {
    const raw = debounced
      ? (search.data ?? []).filter((g) => g.kind === 'article' || g.kind === 'glossary').flatMap((g) => g.hits.map((h) => ({ id: h.id, title: h.title, path: h.categoryPath })))
      : (recent.data ?? []).filter((a) => a.status !== 'archived').slice(0, 8).map((a) => ({ id: a.id, title: a.title, path: a.categoryPath }));
    const seen = new Set(exclude);
    return raw.filter((x) => !seen.has(x.id) && (seen.add(x.id), true));
  }, [debounced, search.data, recent.data, exclude]);
  useEffect(() => setActive(0), [items]);

  const pick = (i: number) => { const it = items[i]; if (it) { onPick({ id: it.id, title: it.title }); onOpenChange(false); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Content aria-describedby={undefined}
          className="glass fixed left-1/2 top-[18vh] z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[20px] data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-neutral-200/70 px-4">
            <Search size={18} className="shrink-0 text-primary" aria-hidden />
            <input role="combobox" aria-expanded aria-controls={listId} aria-label={title} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined} placeholder="Search articles by title or content…"
              className="h-14 w-full bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-ink-muted" />
          </div>
          <p className="px-4 pt-3 text-xs font-medium text-ink-muted">{debounced ? 'Matching articles' : 'Recently updated'}</p>
          <ul id={listId} role="listbox" aria-label="Articles" className="max-h-[340px] overflow-y-auto p-2">
            {items.map((it, i) => (
              <li key={it.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}
                className={clsx('flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors', i === active ? 'bg-primary-soft' : 'hover:bg-neutral-50')}>
                <FileText size={16} className={i === active ? 'text-primary' : 'text-neutral-400'} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-neutral-900">{it.title}</span>{' '}
                  {it.path && <span className="block truncate text-xs text-ink-muted">{it.path}</span>}
                </span>
                {i === active && <CornerDownLeft size={14} className="text-primary" aria-hidden />}
              </li>
            ))}
            {debounced && search.isSuccess && items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No articles match “{debounced}”.</li>}
            {debounced && search.isError && <li className="px-3 py-6 text-center text-sm text-danger">Search is unavailable. Try again in a moment.</li>}
          </ul>
          <div className="flex items-center gap-4 border-t border-neutral-200/70 px-4 py-2.5 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
            <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> to insert</span>
            <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
