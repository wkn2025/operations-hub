import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch, renderApp } from '../../test/utils';
import { LinkPicker } from './LinkPicker';
import { MetaPanel, validateMeta, type Draft } from './MetaPanel';
import { VersionPanel, diffSummary } from './VersionPanel';

const draft = (over: Partial<Draft> = {}): Draft => ({
  title: 'T', type: 'standard', categoryId: null, content: { type: 'doc', content: [] }, fields: {}, tags: [], reviewDate: null, related: [], ownerId: null, ...over,
});

describe('LinkPicker', () => {
  it('searches articles and returns the picked one', async () => {
    const fetchFn = mockFetch({
      '/api/search': { groups: [{ kind: 'article', hits: [{ id: 'a1', title: 'Missing GOP', snippet: 'the <mark>gop</mark>', categoryPath: 'Claims' }] }, { kind: 'glossary', hits: [{ id: 'g1', title: 'GOP', snippet: '', categoryPath: 'Glossary' }] }] },
      '/api/articles?': { articles: [] },
    });
    const onPick = vi.fn();
    renderApp(<LinkPicker open onOpenChange={() => {}} onPick={onPick} />);
    await userEvent.type(screen.getByRole('combobox'), 'gop');
    const opt = await screen.findByRole('option', { name: /Missing GOP/ });
    expect(fetchFn.mock.calls.some(([u]) => String(u).startsWith('/api/search?q=gop'))).toBe(true);
    expect(screen.getByRole('option', { name: /GOP Glossary/ })).toBeInTheDocument();
    await userEvent.click(opt);
    expect(onPick).toHaveBeenCalledWith({ id: 'a1', title: 'Missing GOP' });
  });

  it('keyboard: arrows + Enter pick, excluded ids are hidden', async () => {
    mockFetch({
      '/api/search': { groups: [{ kind: 'article', hits: [{ id: 'self', title: 'Self', snippet: '', categoryPath: '' }, { id: 'a2', title: 'Other', snippet: '', categoryPath: '' }] }] },
      '/api/articles?': { articles: [] },
    });
    const onPick = vi.fn();
    renderApp(<LinkPicker open onOpenChange={() => {}} onPick={onPick} exclude={['self']} />);
    await userEvent.type(screen.getByRole('combobox'), 'o');
    await screen.findByRole('option', { name: /Other/ });
    expect(screen.queryByRole('option', { name: /Self/ })).toBeNull();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith({ id: 'a2', title: 'Other' });
  });
});

describe('MetaPanel validation', () => {
  it('flags empty title, bad tag, inverted contract dates and unnamed limits', () => {
    expect(validateMeta(draft())).toEqual({});
    const e = validateMeta(draft({
      title: '  ', tags: ['x'.repeat(41)], type: 'client_terms',
      fields: { validFrom: '2026-05-01', validTo: '2026-01-01', keyLimits: [{ label: '', value: '1' }] },
    }));
    expect(Object.keys(e).sort()).toEqual(['keyLimits', 'tags', 'title', 'validTo']);
  });

  it('shows template-specific fields and inline errors', async () => {
    mockFetch({ '/api/categories': { categories: [
      { id: 'c1', parentId: null, name: 'Clients', slug: 'clients', description: null, sortOrder: 0, archived: false, path: 'Clients' },
      { id: 'c2', parentId: 'c1', name: 'Old', slug: 'old', description: null, sortOrder: 0, archived: true, path: 'Clients / Old' },
    ] }, '/api/tags': { tags: ['edi'] }, '/api/owners': { owners: [] } });
    const onChange = vi.fn();
    renderApp(<MetaPanel draft={draft({ type: 'client_terms', fields: { validFrom: '2026-05-01', validTo: '2026-01-01' } })} onChange={onChange} />);
    expect(screen.getByLabelText('Client name')).toBeInTheDocument();
    expect(screen.getByText(/must be after/i)).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Clients' });
    expect(screen.queryByRole('option', { name: /Old/ })).toBeNull(); // archived categories excluded
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Acme' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fields: expect.objectContaining({ client: 'Acme' }) }));
  });

  it('adds a tag on Enter', async () => {
    mockFetch({ '/api/categories': { categories: [] }, '/api/tags': { tags: [] }, '/api/owners': { owners: [] } });
    const onChange = vi.fn();
    renderApp(<MetaPanel draft={draft()} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Add tag'), 'Claims{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['claims'] }));
  });
});

describe('VersionPanel', () => {
  const revs = { revisions: [
    { id: 3, articleId: 'a', rev: 3, title: 'T', authorId: 'u', createdAt: '2026-10-29T10:00:00Z', note: null },
    { id: 2, articleId: 'a', rev: 2, title: 'Old title', authorId: 'u', createdAt: '2026-10-28T10:00:00Z', note: null },
  ] };

  it('lists revisions and restores one after confirmation', async () => {
    const fetchFn = mockFetch({
      '/api/articles/a/revisions/2/restore': { id: 'a', revision: 4 },
      '/api/articles/a/revisions/2': { rev: 2, title: 'Old title', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old body' }] }] }, fields: {} },
      '/api/articles/a/revisions': revs,
    });
    const onRestored = vi.fn();
    const beforeRestore = vi.fn(async () => {});
    renderApp(<VersionPanel articleId="a" current={{ title: 'T', content: { type: 'doc', content: [] } }} currentRevision={3} beforeRestore={beforeRestore} onRestored={onRestored} canRestore />);
    await screen.findByText('Revision 2');
    await userEvent.click(screen.getByRole('button', { name: 'View revision 2' }));
    expect(await screen.findByText('old body')).toBeInTheDocument();
    expect(screen.getByText(/title changed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore revision 2' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ revision: 4 })));
    expect(beforeRestore).toHaveBeenCalled();
    expect(fetchFn.mock.calls.some(([u, i]) => u === '/api/articles/a/revisions/2/restore' && (i as RequestInit)?.method === 'POST')).toBe(true);
  });

  it('diffSummary counts words and changed blocks', () => {
    const para = (s: string) => ({ type: 'paragraph', content: [{ type: 'text', text: s }] });
    const d = diffSummary({ title: 'A', content: { type: 'doc', content: [para('one two'), para('same')] } }, { title: 'B', content: { type: 'doc', content: [para('one two three four'), para('same')] } });
    expect(d).toEqual({ titleChanged: true, wordDelta: 2, changedBlocks: 1 });
  });
});
