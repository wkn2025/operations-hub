import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { renderApp, mockFetch } from '../test/utils';
import type { Category } from '../api/client';

const TOPS = ['EDI & Automation', 'Clients & Terms and Conditions', 'Work Instructions', 'Quality Assurance',
  'Provider Networks & Partners', 'Finance & Payment Processing', 'Internal Systems', 'Glossary & Acronyms'];
const cat = (id: string, name: string, sortOrder: number, parentId: string | null = null): Category =>
  ({ id, parentId, name, slug: id, description: `Description of ${name}`, sortOrder, archived: false, path: name });
const categories = [
  ...TOPS.map((n, i) => cat(`t${i}`, n, i)),
  cat('s0', 'Inbound claims (837)', 0, 't0'),
  { ...cat('old', 'Troubleshooting Center', 9), archived: true },
];
// t0 has 3 published (2 own + 1 in its subcategory), t1 has 1, the rest 0; drafts never count
const counts = [
  { categoryId: 't0', status: 'published', n: 2 }, { categoryId: 's0', status: 'published', n: 1 },
  { categoryId: 't1', status: 'published', n: 1 }, { categoryId: 't2', status: 'draft', n: 4 },
];
const articles = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, slug: `a${i}`, title: `Recent article ${i}`, type: 'standard', status: 'published',
  categoryId: 't0', categoryPath: 'EDI & Automation', revision: 1, updatedAt: '2026-10-01T10:00:00Z', publishedAt: null, reviewDate: null }));
const user = (role: string) => ({ user: { id: 'u1', email: 'x@demo.test', name: 'Demo User', role }, authMode: 'dev', demo: true });
const routes = (role: string) => ({
  '/api/me': user(role), '/api/categories': { categories }, '/api/articles/counts': { counts },
  '/api/articles?': { articles, total: articles.length }, '/api/flows': { flows: [] },
  '/api/admin/review-due': { articles: [{ id: 'r1', slug: 'r1', title: 'Old procedure', reviewDate: '2026-09-01', overdue: true }, { id: 'r2', slug: 'r2', title: 'Soon due', reviewDate: '2026-11-10', overdue: false }] },
});

describe('Home', () => {
  it('shows the 8 visible top-level categories as tiles with published counts, no descriptions or subcategories', async () => {
    mockFetch(routes('viewer'));
    renderApp(<App />, '/');
    const main = await screen.findByRole('main');
    const nav = await within(main).findByRole('navigation', { name: 'Categories' });
    const tiles = within(nav).getAllByRole('link');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(
      TOPS.map((n, i) => `${n}, ${i === 0 ? '3 articles' : i === 1 ? '1 article' : '0 articles'}`));
    expect(tiles[0]).toHaveAttribute('href', '/category/t0');
    expect(within(main).queryByText(/Description of/)).toBeNull();
    expect(within(main).queryByText('Inbound claims (837)')).toBeNull();
    expect(within(main).queryByText('Troubleshooting Center')).toBeNull();
  });

  it('caps "Recently updated" at 5, links to guided flows, and opens search from the hero', async () => {
    mockFetch(routes('viewer'));
    renderApp(<App />, '/');
    const main = await screen.findByRole('main');
    const recent = await within(main).findByRole('region', { name: 'Recently updated' });
    expect(await within(recent).findByText('Recent article 0')).toBeInTheDocument();
    expect(within(recent).getAllByRole('link')).toHaveLength(5);
    expect(within(main).getByRole('link', { name: /Guided flows/ })).toHaveAttribute('href', '/flows');
    await userEvent.click(within(main).getByRole('button', { name: /^Search procedures/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('viewers get no editor actions and no review badge', async () => {
    const fetch = mockFetch(routes('viewer'));
    renderApp(<App />, '/');
    const main = await screen.findByRole('main');
    await within(main).findByRole('navigation', { name: 'Categories' });
    expect(within(main).queryByRole('link', { name: /New article/ })).toBeNull();
    expect(within(main).queryByRole('button', { name: /due for review/ })).toBeNull();
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith('/api/admin/review-due'))).toBe(false);
  });

  it('editors get New article and a small "due for review" badge that lists the articles', async () => {
    mockFetch(routes('editor'));
    renderApp(<App />, '/');
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('link', { name: /New article/ })).toHaveAttribute('href', '/edit/new');
    const badge = await within(main).findByRole('button', { name: '2 due for review' });
    await userEvent.click(badge);
    const item = await screen.findByRole('menuitem', { name: /Old procedure/ });
    expect(item).toHaveAttribute('href', '/article/r1');
    expect(screen.getByRole('menuitem', { name: /Soon due/ })).toBeInTheDocument();
  });
});
