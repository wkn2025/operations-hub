import { HttpError, subtree, type Category } from '../../api/client';

/** Same order as the server's category list: sortOrder, then name. */
export const siblingsOf = (cats: Category[], parentId: string | null) =>
  cats.filter((c) => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export type CategoryPatch = { id: string; sortOrder: number; parentId?: string | null };

/**
 * PATCHes that put `id` at `index` under `parentId`: the target sibling list is renumbered 0..n and only rows whose
 * sortOrder (or, for the moved one, parent) actually change are sent. null = not allowed (into itself / its subtree).
 */
export function moveCategory(cats: Category[], id: string, parentId: string | null, index: number): CategoryPatch[] | null {
  const moved = cats.find((c) => c.id === id);
  if (!moved || (parentId && subtree(cats, id).has(parentId))) return null;
  const list = siblingsOf(cats, parentId).filter((c) => c.id !== id);
  list.splice(Math.max(0, Math.min(index, list.length)), 0, moved);
  const reparent = moved.parentId !== parentId;
  return list.flatMap((c, i) => {
    const p = c.id === id && reparent;
    return c.sortOrder !== i || p ? [{ id: c.id, sortOrder: i, ...(p && { parentId }) }] : [];
  });
}

/** Keyboard alternative to dragging: one step up (-1) or down (+1) among siblings; null at the edge. */
export function moveBy(cats: Category[], id: string, delta: -1 | 1): CategoryPatch[] | null {
  const c = cats.find((x) => x.id === id);
  if (!c) return null;
  const sibs = siblingsOf(cats, c.parentId), i = sibs.findIndex((x) => x.id === id) + delta;
  return i < 0 || i >= sibs.length ? null : moveCategory(cats, id, c.parentId, i);
}

const MESSAGES: Record<string, string> = {
  read_only: 'Read-only demo: changes are not saved here.',
  last_admin: 'At least one active admin must remain. Make someone else an admin first, then change this one (the last active admin cannot be demoted or deactivated).',
  bootstrap_admin: 'This is a bootstrap admin (listed in ADMIN_BOOTSTRAP_EMAILS on the server). It cannot be demoted or deactivated here; IT changes that setting.',
  exists: 'That email is already on the allowlist.',
  has_active_children: 'Archive or move its subcategories first.',
  parent_archived: 'Its parent category is archived. Restore the parent first.',
  invalid_transition: 'This article changed state in the meantime. The list has been refreshed; try again if still needed.',
  not_found: 'It no longer exists. The list has been refreshed.',
};

/** One place that turns admin API failures into a sentence an admin can act on. */
export function adminError(e: unknown): string {
  if (!(e instanceof HttpError)) return 'Something went wrong. Check your connection and try again.';
  const b = (e.body ?? {}) as { error?: string; message?: string; references?: number; issues?: { path: string; message: string }[] };
  if (b.error === 'file_in_use') {
    const n = b.references ?? 0;
    return `This file is still used by ${n} article${n === 1 ? '' : 's'}. Remove it from ${n === 1 ? 'that article' : 'those articles'} first.`;
  }
  if (b.error && MESSAGES[b.error]) return MESSAGES[b.error]!;
  if (e.status === 401) return 'Your session has ended. Sign in again.';
  if (e.status === 403) return 'You do not have permission to do that.';
  if (e.status === 400 || e.status === 422) {
    const detail = b.message ?? b.issues?.map((i) => i.message).join('; ');
    return detail ? `Not accepted: ${detail}.` : 'The server did not accept that input.';
  }
  return 'Something went wrong. Check your connection and try again.';
}
