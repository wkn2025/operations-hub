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
});
