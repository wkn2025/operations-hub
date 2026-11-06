import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { AMERICAS } from '@ops/shared';
import { mockFetch, renderApp } from '../test/utils';
import { CategoryPage } from './Category';

const me = { user: { id: 'u1', email: 'viewer@x.test', name: 'v', role: 'viewer' }, authMode: 'dev', demo: true };
const cats = { categories: [
  { id: 'wi', parentId: null, name: 'Work Instructions', slug: 'wi', description: null, sortOrder: 0, archived: false, path: 'Work Instructions' },
  { id: 'cs', parentId: 'wi', name: 'Country Specifics', slug: 'country-specifics', description: null, sortOrder: 0, archived: false, path: 'Work Instructions / Country Specifics' },
] };
const doc = (slug: string, country: string, countryDoc: string, status = 'published') => ({
  id: slug, slug, title: slug, type: 'standard', status, categoryId: 'cs', categoryPath: 'Work Instructions / Country Specifics',
  revision: 1, updatedAt: '2026-01-01', publishedAt: '2026-01-01', reviewDate: null, country, countryDoc,
});

describe('Country Specifics directory', () => {
  it('lists every country in the Americas A–Z; a country expands to providers, specifics and repatriation/evacuation', async () => {
    mockFetch({ '/api/me': me, '/api/categories': cats, '/api/articles/counts': { counts: [] }, '/api/articles?': { articles: [
      doc('barbados', 'Barbados', 'specifics'), doc('barbados-evac', 'Barbados', 'evacuation'), doc('loose', '', ''),
    ], total: 3 } });
    renderApp(<Routes><Route path="category/:slug" element={<CategoryPage />} /></Routes>, '/category/country-specifics');

    const list = await screen.findByRole('list', { name: 'Countries' });
    const names = within(list).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual([...AMERICAS].sort((a, b) => a.localeCompare(b, 'en')));
    expect(names).toContain('United States');
    expect(screen.queryByRole('link', { name: 'Country specifics' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Barbados' }));
    expect(screen.getByRole('link', { name: 'Country specifics' })).toHaveAttribute('href', '/article/barbados');
    expect(screen.getByRole('link', { name: 'Repatriation / evacuation' })).toHaveAttribute('href', '/article/barbados-evac');
    expect(screen.getByText('Preferred providers: not available yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'loose' })).toBeInTheDocument(); // untagged article stays reachable
  });
});
