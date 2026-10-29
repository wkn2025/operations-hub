import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { mockFetch, renderApp } from '../test/utils';
import { CategoryPage } from './Category';
import AdminArea from './admin';

// Lists page through the server (GET /api/articles?...&offset=n returns { articles, total }); nothing is cut off at a fixed cap.
const me = (role: string) => ({ user: { id: 'u1', email: `${role}@x.test`, name: role, role }, authMode: 'dev', demo: true });
const cats = { categories: [{ id: 'k1', parentId: null, name: 'Big', slug: 'big', description: null, sortOrder: 0, archived: false, path: 'Big' }] };
const art = (i: number) => ({ id: `a${i}`, slug: `a-${i}`, title: `Article ${String(i).padStart(3, '0')}`, type: 'standard', status: 'published', categoryId: 'k1', categoryPath: 'Big', revision: 1, updatedAt: '2026-01-01', publishedAt: '2026-01-01', reviewDate: null });
const pages = (total: number) => (url: string) => {
  const p = new URL(url, 'http://x').searchParams;
  const off = Number(p.get('offset') ?? 0), lim = Number(p.get('limit'));
  return { articles: Array.from({ length: Math.max(0, Math.min(lim, total - off)) }, (_, i) => art(off + i)), total };
};

describe('paged article lists', () => {
  it('category page shows "n of total" and loads the rest with Load more', async () => {
    const fetch = mockFetch({ '/api/me': me('viewer'), '/api/categories': cats, '/api/articles/counts': { counts: [{ categoryId: 'k1', status: 'published', n: 60 }] }, '/api/articles?': pages(60) });
    renderApp(<Routes><Route path="category/:slug" element={<CategoryPage />} /></Routes>, '/category/big');
    expect(await screen.findByText('Showing 50 of 60 articles')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Article \d+/ })).toHaveLength(50);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 60 of 60 articles')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Article \d+/ })).toHaveLength(60);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    const urls = fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/articles?'));
    expect(urls[0]).toContain('within=k1');
    expect(urls[0]).toContain('sort=title');
    expect(urls.at(-1)).toContain('offset=50');
  });

  it('admin Articles filters on the server (status, category subtree, owner) instead of filtering a capped list', async () => {
    const fetch = mockFetch({ '/api/me': me('admin'), '/api/categories': cats, '/api/admin/users': { users: [] }, '/api/articles?': pages(3) });
    renderApp(<Routes><Route path="admin/*" element={<AdminArea />} /></Routes>, '/admin/articles');
    expect(await screen.findByText('Showing 3 of 3 articles')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'draft');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'k1');
    await waitFor(() => {
      const last = String(fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/articles?')).at(-1));
      expect(last).toContain('status=draft');
      expect(last).toContain('within=k1');
    });
  });

  it('admin Revisions picker searches titles on the server', async () => {
    const fetch = mockFetch({ '/api/me': me('admin'), '/api/articles?': pages(2) });
    renderApp(<Routes><Route path="admin/*" element={<AdminArea />} /></Routes>, '/admin/revisions');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Find article by title' }), 'needle');
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => String(u).includes('q=needle'))).toBe(true));
  });
});
