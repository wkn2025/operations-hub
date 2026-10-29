import { describe, expect, it } from 'vitest';
import { HttpError, type Category } from '../../api/client';
import { adminError, moveBy, moveCategory, siblingsOf } from './ops';

const cat = (id: string, parentId: string | null, sortOrder: number, archived = false): Category =>
  ({ id, parentId, name: id.toUpperCase(), slug: id, description: null, sortOrder, archived, path: id });
const cats = [cat('a', null, 0), cat('b', null, 1), cat('c', null, 2), cat('a1', 'a', 0), cat('a2', 'a', 1), cat('b1', 'b', 5)];

describe('moveCategory', () => {
  it('reorders within the same parent and renumbers only what changed', () => {
    expect(moveCategory(cats, 'c', null, 0)).toEqual([{ id: 'c', sortOrder: 0 }, { id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }]);
    expect(moveCategory(cats, 'a', null, 1)).toEqual([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }]);
  });
  it('reparents and sends parentId only for the moved category', () => {
    expect(moveCategory(cats, 'a2', 'b', 0)).toEqual([{ id: 'a2', sortOrder: 0, parentId: 'b' }, { id: 'b1', sortOrder: 1 }]);
    expect(moveCategory(cats, 'b1', null, 99)).toEqual([{ id: 'b1', sortOrder: 3, parentId: null }]); // index clamps to the end
  });
  it('refuses moves into its own subtree and no-op moves', () => {
    expect(moveCategory(cats, 'a', 'a1', 0)).toBeNull();
    expect(moveCategory(cats, 'a', 'a', 0)).toBeNull();
    expect(moveCategory(cats, 'a', null, 0)).toEqual([]);
  });
  it('moveBy: up/down among siblings, null at the edges', () => {
    expect(moveBy(cats, 'a2', -1)).toEqual([{ id: 'a2', sortOrder: 0 }, { id: 'a1', sortOrder: 1 }]);
    expect(moveBy(cats, 'a1', -1)).toBeNull();
    expect(moveBy(cats, 'c', 1)).toBeNull();
  });
  it('siblings sort like the server: sortOrder, then name', () => {
    expect(siblingsOf([cat('z', null, 0), cat('y', null, 0)], null).map((c) => c.id)).toEqual(['y', 'z']);
  });
});

describe('adminError', () => {
  const err = (status: number, body: unknown) => new HttpError(status, body);
  it('maps known 409 codes to plain-language messages', () => {
    expect(adminError(err(409, { error: 'last_admin' }))).toMatch(/last active admin/i);
    expect(adminError(err(409, { error: 'bootstrap_admin' }))).toMatch(/bootstrap admin/i);
    expect(adminError(err(409, { error: 'exists' }))).toMatch(/already on the allowlist/i);
    expect(adminError(err(409, { error: 'file_in_use', references: 2 }))).toMatch(/used by 2 articles/);
    expect(adminError(err(409, { error: 'has_active_children' }))).toMatch(/subcategories/);
  });
  it('falls back by status and surfaces validation messages', () => {
    expect(adminError(err(403, { error: 'forbidden' }))).toMatch(/permission/);
    expect(adminError(err(400, { error: 'invalid', message: 'unknown parentId' }))).toMatch(/unknown parentId/);
    expect(adminError(err(400, { error: 'invalid', issues: [{ path: 'email', message: 'Invalid email' }] }))).toMatch(/Invalid email/);
    expect(adminError(err(500, null))).toMatch(/went wrong/);
    expect(adminError(new TypeError('fetch failed'))).toMatch(/went wrong/);
  });
});
