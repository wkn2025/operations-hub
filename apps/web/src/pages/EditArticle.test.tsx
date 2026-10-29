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

  it('new article: picking a template does not create a draft until something is typed', async () => {
    const f = mockFetch({ '/api/me': me('editor'), ...common });
    page('/edit/new');
    await userEvent.click(await screen.findByRole('button', { name: /^Article/ }));
    await screen.findByLabelText('Article title');
    await new Promise((r) => setTimeout(r, 1800));
    expect(f.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
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
    const title = await screen.findByLabelText('Article title');
    fireEvent.change(title, { target: { value: 'Missing GOP v2' } });
    expect(await screen.findByText(/someone else saved/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy my version' })).toBeInTheDocument();
  });

  it('background saves send autosave:true, Ctrl+S sends a checkpoint; a refused save says so and is not retried', async () => {
    const bodies: { autosave?: boolean }[] = [];
    let refuse = false;
    mockFetch({ '/api/me': me('editor'), ...common, '/api/articles/a1': article });
    const f = globalThis.fetch as unknown as { mockImplementation: Function; getMockImplementation: () => Function };
    const base = f.getMockImplementation();
    f.mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return base(input, init);
      bodies.push(JSON.parse(String(init.body)));
      return refuse ? new Response(JSON.stringify({ error: 'invalid' }), { status: 400, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ ...article, revision: 3 + bodies.length }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    page('/edit/a1');
    fireEvent.change(await screen.findByLabelText('Article title'), { target: { value: 'Missing GOP 2' } });
    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 4000 });
    expect(bodies[0]!.autosave).toBe(true);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]!.autosave).toBe(false);
    refuse = true;
    fireEvent.change(screen.getByLabelText('Article title'), { target: { value: 'Missing GOP 3' } });
    expect(await screen.findByText(/server refused this change/i, {}, { timeout: 4000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 2500));
    expect(bodies).toHaveLength(3); // no automatic retry
  }, 15000);

  // PATCH interceptor: records bodies, answers with `respond(body, n)`
  const intercept = (respond: (b: any, n: number) => Response) => {
    const bodies: any[] = [];
    const f = globalThis.fetch as unknown as { mockImplementation: Function; getMockImplementation: () => Function };
    const base = f.getMockImplementation();
    f.mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return base(input, init);
      const b = JSON.parse(String(init.body)); bodies.push(b);
      return respond(b, bodies.length);
    });
    return bodies;
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('an over-limit field shows a field message; the save keeps the stored value for it and still saves the rest', async () => {
    const wi = { ...article, type: 'work_instruction', fields: { purpose: 'stored purpose' } };
    mockFetch({ '/api/me': me('editor'), ...common, '/api/articles/a1': wi });
    const bodies = intercept((b, n) => json({ ...wi, title: b.title, revision: 3 + n }));
    page('/edit/a1');
    const purpose = await screen.findByLabelText('Purpose');
    expect(purpose).toHaveAttribute('maxLength', '2000');
    fireEvent.change(purpose, { target: { value: 'x'.repeat(2001) } });
    fireEvent.change(screen.getByLabelText('Article title'), { target: { value: 'Body still saves' } });
    expect(screen.getByText(/keep it under 2,000 characters/i)).toBeInTheDocument();
    expect(screen.getByText('2,001 / 2,000')).toBeInTheDocument();
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(bodies.at(-1).title).toBe('Body still saves');
    expect(bodies.at(-1).fields.purpose).toBe('stored purpose');
  });

  it('a 400 naming a field: retries without that field, warns which one, body edits are saved', async () => {
    mockFetch({ '/api/me': me('editor'), ...common, '/api/articles/a1': { ...article, fields: { scope: 'old scope' } } });
    const bodies = intercept((b, n) => n === 1
      ? json({ error: 'invalid', issues: [{ path: 'fields.summary', message: 'Keep it under 2,000 characters' }] }, 400)
      : json({ ...article, title: b.title, fields: b.fields, revision: 3 + n }));
    page('/edit/a1');
    fireEvent.change(await screen.findByLabelText('Summary'), { target: { value: 'server says no' } });
    fireEvent.change(screen.getByLabelText('Article title'), { target: { value: 'Saved anyway' } });
    await waitFor(() => expect(bodies).toHaveLength(2), { timeout: 4000 });
    expect(bodies[1].title).toBe('Saved anyway');
    expect(bodies[1].fields.summary).toBeUndefined(); // stored value (none) kept
    expect(bodies[1].fields.scope).toBe('old scope');
    expect(await screen.findByText(/Summary wasn’t saved: Keep it under 2,000 characters/)).toBeInTheDocument();
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
