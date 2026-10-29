import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { mockFetch, renderApp } from '../test/utils';
import { EditArticle } from './EditArticle';

const me = (role: string) => ({ user: { id: 'u1', email: 'e@x', name: 'Ed', role }, authMode: 'dev', demo: true });
const article = {
  id: 'a1', slug: 'gop', title: 'Missing GOP', type: 'standard', status: 'draft', categoryId: null, categoryPath: '', owner: { id: 'u1', name: 'Ed' },
  revision: 3, updatedAt: '2026-10-29T10:00:00Z', publishedAt: null, reviewDate: null, tags: [], fields: {}, linkTargets: {}, related: [],
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] }] },
  permissions: { write: true, publish: true, submit: true, archive: true },
};
const common = { '/api/categories': { categories: [] }, '/api/tags': { tags: [] }, '/api/owners': { owners: [] }, '/api/articles/a1/files': { files: [] } };
const page = (route: string) => renderApp(<Routes><Route path="/edit/:id" element={<EditArticle />} /></Routes>, route);

describe('EditArticle', () => {
  it('viewers get a friendly forbidden page', async () => {
    mockFetch({ '/api/me': me('viewer') });
    page('/edit/a1');
    expect(await screen.findByText(/only editors and admins/i)).toBeInTheDocument();
  });

  it('new article: shows the six templates', async () => {
    mockFetch({ '/api/me': me('editor'), ...common });
    page('/edit/new');
    for (const n of ['Article', 'Work instruction', 'Client terms', 'Technical documentation', 'Troubleshooting guide', 'Glossary entry']) {
      expect(await screen.findByRole('button', { name: new RegExp(n) })).toBeInTheDocument();
    }
  });

  it('shows the conflict banner when the server answers 409', async () => {
    mockFetch({
      '/api/me': me('editor'), ...common,
      '/api/articles/a1': (u: string) => u === '/api/articles/a1' ? article : { __status: 404 },
    });
    // PATCH -> 409
    const f = globalThis.fetch as unknown as { mockImplementation: Function; getMockImplementation: () => Function };
    const base = f.getMockImplementation();
    f.mockImplementation(async (input: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? new Response(JSON.stringify({ error: 'conflict', current: { revision: 5 } }), { status: 409, headers: { 'content-type': 'application/json' } }) : base(input, init));
    page('/edit/a1');
    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Missing GOP v2' } });
    expect(await screen.findByText(/someone else saved/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy my version' })).toBeInTheDocument();
  });

  it('shows only actions the server allows', async () => {
    mockFetch({ '/api/me': me('editor'), ...common, '/api/articles/a1': { ...article, permissions: { write: true, publish: false, submit: true, archive: true } } });
    page('/edit/a1');
    expect(await screen.findByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(document.querySelector('[data-template=standard]')).not.toBeNull());
  });
});
