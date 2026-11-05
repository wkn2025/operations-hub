import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { mockFetch, renderApp } from '../test/utils';
import { CategoryPage } from './Category';

const me = { user: { id: 'u1', email: 'viewer@x.test', name: 'v', role: 'viewer' }, authMode: 'dev', demo: true };
const cats = { categories: [{ id: 'k1', parentId: null, name: 'Clients & Terms and Conditions', slug: 'clients', description: null, sortOrder: 0, archived: false, path: 'Clients & Terms and Conditions' }] };
const doc = (slug: string, client: string, line: string, docKind: string) => ({
  id: slug, slug, title: slug, type: 'client_terms', status: 'published', categoryId: 'k1', categoryPath: 'Clients & Terms and Conditions',
  revision: 1, updatedAt: '2026-01-01', publishedAt: '2026-01-01', reviewDate: null, client, line, docKind,
});
const list = { articles: [
  doc('zeta-travel-full', 'Zeta Assist (fictional)', 'travel', 'full'),
  doc('alpha-corp-full', 'Alpha Health (fictional)', 'corporate', 'full'),
  doc('alpha-corp-sum', 'Alpha Health (fictional)', 'corporate', 'summary'),
  doc('alpha-travel-full', 'Alpha Health (fictional)', 'travel', 'full'),
], total: 4 };

describe('Clients & Terms and Conditions directory', () => {
  it('lists clients A–Z by name only, then client → line → document links', async () => {
    mockFetch({ '/api/me': me, '/api/categories': cats, '/api/articles/counts': { counts: [] }, '/api/articles?': list });
    renderApp(<Routes><Route path="category/:slug" element={<CategoryPage />} /></Routes>, '/category/clients');

    const alpha = await screen.findByRole('button', { name: 'Alpha Health' });
    const zeta = screen.getByRole('button', { name: 'Zeta Assist' });
    expect(alpha.compareDocumentPosition(zeta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Full T&C|Coverage summary/ })).toBeNull(); // names only until expanded
    expect(alpha).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(alpha);
    expect(alpha).toHaveAttribute('aria-expanded', 'true');
    const corporate = screen.getByRole('button', { name: 'Corporate' });
    expect(screen.getByRole('button', { name: 'Travel' })).toBeInTheDocument();

    await userEvent.click(corporate);
    expect(screen.getByRole('link', { name: 'Full T&C' })).toHaveAttribute('href', '/article/alpha-corp-full');
    expect(screen.getByRole('link', { name: 'Coverage summary' })).toHaveAttribute('href', '/article/alpha-corp-sum');

    await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
    expect(screen.getByRole('link', { name: 'Full T&C' })).toHaveAttribute('href', '/article/alpha-travel-full');
    expect(screen.queryByRole('link', { name: 'Coverage summary' })).toBeNull();
    expect(screen.getByText('Coverage summary: not available yet')).toBeInTheDocument();
  });

  it('skips archived, merges name variants, surfaces duplicates and untagged articles, and loads every page', async () => {
    const big = Array.from({ length: 55 }, (_, i) => ({ ...doc(`filler-${i}`, `Client ${String(i).padStart(2, '0')}`, 'travel', 'full') }));
    const rows = [
      ...big,
      { ...doc('old-sum', 'Gone Ltd', 'travel', 'summary'), status: 'archived' },
      doc('acme-full', 'Acme  Ltd (fictional)', 'travel', 'full'),
      doc('acme-sum', 'acme ltd', 'travel', 'summary'),
      { ...doc('acme-full-v2', 'Acme Ltd', 'travel', 'full'), title: 'Acme full v2' },
      { ...doc('loose', 'Acme Ltd', 'travel', 'full'), title: 'Untagged note', line: null },
      doc('last-page', 'Zulu Co', 'corporate', 'full'),
    ];
    const pages = (url: string) => {
      const q = new URL(url, 'http://x').searchParams; const off = Number(q.get('offset') ?? 0), lim = Number(q.get('limit'));
      return { articles: rows.slice(off, off + lim), total: rows.length };
    };
    mockFetch({ '/api/me': me, '/api/categories': cats, '/api/articles/counts': { counts: [] }, '/api/articles?': pages });
    renderApp(<Routes><Route path="category/:slug" element={<CategoryPage />} /></Routes>, '/category/clients');

    expect(await screen.findByRole('button', { name: 'Zulu Co' })).toBeInTheDocument(); // on page 2, loaded without clicking
    expect(screen.queryByRole('button', { name: 'Gone Ltd' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^acme/i })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /^acme/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
    expect(screen.getByRole('link', { name: 'Full T&C' })).toHaveAttribute('href', '/article/acme-full');
    expect(screen.getByRole('link', { name: 'Coverage summary' })).toHaveAttribute('href', '/article/acme-sum');
    expect(screen.getByRole('link', { name: 'Acme full v2' })).toHaveAttribute('href', '/article/acme-full-v2');
    expect(screen.getByRole('link', { name: 'Untagged note' })).toBeInTheDocument();
  });

  it('a failed later page shows an error with Retry instead of a partial directory, and does not refetch on its own', async () => {
    let failing = true;
    const many = Array.from({ length: 60 }, (_, i) => doc(`d-${i}`, `Client ${String(i).padStart(2, '0')}`, 'travel', 'full'));
    const fetch = mockFetch({ '/api/me': me, '/api/categories': cats, '/api/articles/counts': { counts: [] }, '/api/articles?': (url: string) => {
      const off = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0);
      if (off > 0 && failing) return { __status: 500, error: 'internal' };
      return { articles: many.slice(off, off + 50), total: many.length };
    } });
    renderApp(<Routes><Route path="category/:slug" element={<CategoryPage />} /></Routes>, '/category/clients');
    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByRole('button', { name: 'Client 00' })).toBeNull(); // no partial list
    await new Promise((r) => setTimeout(r, 300));
    const pageCalls = () => fetch.mock.calls.filter(([u]) => String(u).includes('offset=50')).length;
    const before = pageCalls();
    await new Promise((r) => setTimeout(r, 300));
    expect(pageCalls()).toBe(before); // no retry loop
    failing = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Client 59' })).toBeInTheDocument();
  });
});
