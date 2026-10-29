import { useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import { api, subtree, useCategories, type Category } from '../../api/client';
import { Button, Chip } from '../../components/ui/primitives';
import { InlineError, PageHeader, QueryBlock, field, smallBtn, useAdminAction } from './common';
import { moveBy, moveCategory, siblingsOf, type CategoryPatch } from './ops';

type DropPos = 'before' | 'inside' | 'after';

export function Categories() {
  const cats = useCategories(); // admins get archived categories too
  const all = cats.data ?? [];
  const qc = useQueryClient();
  const act = useAdminAction();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: DropPos } | null>(null);
  const [said, setSaid] = useState('');
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');

  const apply = (c: Category, patches: CategoryPatch[] | null, message: string) => {
    if (!patches?.length) return;
    // optimistic: the sidebar and this tree move at once; the refetch after the PATCHes settles the truth
    qc.setQueryData<Category[]>(['categories'], (old) => old?.map((x) => ({ ...x, ...patches.find((p) => p.id === x.id) })));
    setSaid(message);
    void act.run(c.id, async () => { for (const { id, ...b } of patches) await api(`/api/categories/${id}`, { method: 'PATCH', json: b }); });
  };
  const patch = (c: Category, body: Partial<Pick<Category, 'name' | 'archived'>>) =>
    act.run(c.id, () => api(`/api/categories/${c.id}`, { method: 'PATCH', json: body }));

  /** Where a drop on `target` would put the dragged category. */
  const dropPatches = (target: Category, pos: DropPos) => {
    if (!dragId || dragId === target.id) return null;
    if (pos === 'inside') return moveCategory(all, dragId, target.id, Infinity);
    const sibs = siblingsOf(all, target.parentId).filter((x) => x.id !== dragId);
    const i = sibs.findIndex((x) => x.id === target.id);
    return moveCategory(all, dragId, target.parentId, pos === 'before' ? i : i + 1);
  };
  const posOf = (e: DragEvent<HTMLElement>): DropPos => {
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
  };

  // a render function, not a component: a component defined here would remount on every drag-over and cancel the drag
  const row = (c: Category, depth: number) => {
    const kids = siblingsOf(all, c.id);
    const sibs = siblingsOf(all, c.parentId), idx = sibs.findIndex((x) => x.id === c.id);
    const forbiddenParents = subtree(all, c.id);
    const dropHere = over?.id === c.id ? over.pos : null;
    return (
      <li key={c.id}>
        <div draggable={renaming !== c.id}
          onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setDragId(c.id); }}
          onDragEnd={() => { setDragId(null); setOver(null); }}
          onDragOver={(e) => { const pos = posOf(e); if (dropPatches(c, pos)) { e.preventDefault(); setOver({ id: c.id, pos }); } else if (over?.id === c.id) setOver(null); }}
          onDragLeave={() => setOver((o) => (o?.id === c.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const pos = posOf(e), moved = all.find((x) => x.id === dragId);
            if (moved) apply(moved, dropPatches(c, pos), `${moved.name} moved ${pos === 'inside' ? `into ${c.name}` : `${pos} ${c.name}`}`);
            setDragId(null); setOver(null);
          }}
          style={{ paddingLeft: 12 + depth * 28 }}
          className={clsx('group flex flex-wrap items-center gap-2 border-y-2 border-transparent py-2 pr-3 transition-colors',
            dropHere === 'before' && '!border-t-primary', dropHere === 'after' && '!border-b-primary', dropHere === 'inside' && 'bg-primary-soft',
            dragId === c.id && 'opacity-50', c.archived && 'text-neutral-500')}>
          <GripVertical size={16} aria-hidden className="shrink-0 cursor-grab text-neutral-300 group-hover:text-neutral-500" />
          {renaming === c.id ? (
            <form className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('name') ?? '').trim(); setRenaming(null); if (v && v !== c.name) void patch(c, { name: v }); }}>
              <input name="name" aria-label="Category name" defaultValue={c.name} autoFocus maxLength={100} className={clsx(field, 'min-w-0 flex-1')}
                onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
              <button type="submit" className={smallBtn}>Save</button>
              <button type="button" className={smallBtn} onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <span className={clsx('min-w-0 flex-1 truncate text-[14.5px]', depth === 0 ? 'font-medium text-neutral-900' : 'text-neutral-700', c.archived && 'line-through decoration-neutral-300')}>
              {c.name}{c.archived && <Chip className="ml-2 no-underline">Archived</Chip>}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={smallBtn} aria-label={`Move ${c.name} up`} disabled={idx <= 0} onClick={() => apply(c, moveBy(all, c.id, -1), `${c.name} moved up`)}><ArrowUp size={14} aria-hidden /></button>
            <button type="button" className={smallBtn} aria-label={`Move ${c.name} down`} disabled={idx >= sibs.length - 1} onClick={() => apply(c, moveBy(all, c.id, 1), `${c.name} moved down`)}><ArrowDown size={14} aria-hidden /></button>
            <select aria-label={`Parent of ${c.name}`} className={clsx(field, 'max-w-[200px] !py-1 text-[13px]')} value={c.parentId ?? ''}
              onChange={(e) => apply(c, moveCategory(all, c.id, e.target.value || null, Infinity), `${c.name} moved`)}>
              <option value="">Top level</option>
              {all.filter((x) => !forbiddenParents.has(x.id)).sort((a, b) => a.path.localeCompare(b.path)).map((x) => <option key={x.id} value={x.id}>{x.path}</option>)}
            </select>
            <button type="button" className={smallBtn} aria-label={`Rename ${c.name}`} onClick={() => setRenaming(c.id)}>Rename</button>
            <button type="button" className={smallBtn} aria-label={`${c.archived ? 'Restore' : 'Archive'} ${c.name}`} disabled={act.busy === c.id}
              onClick={() => patch(c, { archived: !c.archived })}>{c.archived ? 'Restore' : 'Archive'}</button>
          </span>
          <InlineError className="ml-6 basis-full" message={act.errorFor(c.id)} />
        </div>
        {kids.length > 0 && <ul className="border-t border-neutral-100">{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <section>
      <PageHeader title="Categories" intro="Drag a category above, below or onto another one to reorder or nest it; the arrow buttons and the Parent menu do the same from the keyboard. Archived categories (and their articles) are hidden from viewers." />
      <form className="panel mb-5 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim(), parentId = newParent || null;
          if (name) void act.run('new', async () => { await api('/api/categories', { method: 'POST', json: { name, parentId, sortOrder: siblingsOf(all, parentId).length } }); setNewName(''); });
        }}>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-neutral-700">
          New category
          <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} required />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-neutral-700">
          Inside
          <select className={field} value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">Top level</option>
            {all.filter((x) => !x.archived).sort((a, b) => a.path.localeCompare(b.path)).map((x) => <option key={x.id} value={x.id}>{x.path}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={act.busy === 'new'}><Plus size={15} aria-hidden /> Add</Button>
        <InlineError className="basis-full" message={act.errorFor('new')} />
      </form>
      <p role="status" className="sr-only">{said}</p>
      <QueryBlock q={cats} what="categories" empty="No categories yet.">
        {() => <ul aria-label="Category tree" className="panel divide-y divide-neutral-100 overflow-hidden py-1">{siblingsOf(all, null).map((c) => row(c, 0))}</ul>}
      </QueryBlock>
    </section>
  );
}
