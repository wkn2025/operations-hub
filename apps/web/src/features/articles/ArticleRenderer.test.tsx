import { describe, it, expect } from 'vitest';
import type { PmNode } from '@ops/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleRenderer } from './ArticleRenderer';
import { renderApp, mockFetch } from '../../test/utils';

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c: PmNode[]) => ({ type: 'paragraph', content: c });

const doc: PmNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Overview')] },
    p(t('bold', [{ type: 'bold' }]), t(' and '), t('code', [{ type: 'code' }]), t(' '), t('site', [{ type: 'link', attrs: { href: 'https://example.test' } }]),
      t(' '), t('evil', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    p(t('<script>alert(1)</script>')),
    { type: 'callout', attrs: { kind: 'warning', title: 'Careful' }, content: [p(t('Watch out'))] },
    { type: 'collapsible', attrs: { title: 'More details' }, content: [p(t('Hidden body'))] },
    { type: 'steps', content: [
      { type: 'step', attrs: { title: 'First' }, content: [p(t('do a'))] },
      { type: 'step', attrs: { title: 'Second' }, content: [p(t('do b'))] },
    ] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done item'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('open item'))] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Benefit'))] }, { type: 'tableHeader', content: [p(t('Limit'))] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Dental'))] }, { type: 'tableCell', content: [p(t('EUR 400'))] }] },
    ] },
    { type: 'image', attrs: { src: '/api/files/abc', alt: 'Screen', title: 'A caption' } },
    { type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'bad' } },
    { type: 'codeBlock', attrs: { language: 'text' }, content: [t('UHCGD_837I.x12')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('bullet one'))] }] },
    p(t('See '), { type: 'internalLink', attrs: { articleId: 'a1', label: 'Fallback label' } }, t(', '),
      { type: 'internalLink', attrs: { articleId: 'a2', label: 'Old doc' } }, t(', '),
      { type: 'internalLink', attrs: { articleId: 'a3', label: 'Lost doc' } }),
    { type: 'mysteryNode', content: [p(t('unknown child text'))] },
  ],
};
const links = {
  a1: { status: 'published', title: 'GOP explained', slug: 'gop-explained' },
  a2: { status: 'archived' },
  a3: { status: 'unavailable' },
};

describe('ArticleRenderer', () => {
  it('renders standard nodes and marks, with sanitized links and no HTML injection', () => {
    const { container } = renderApp(<ArticleRenderer doc={doc} links={links} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toHaveAttribute('id', 'overview');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.test');
    expect(screen.queryByRole('link', { name: 'evil' })).toBeNull();
    expect(screen.getByText(/evil/)).toBeInTheDocument(); // text kept, link dropped
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('bullet one').closest('ul')).not.toBeNull();
    expect(screen.getByText('UHCGD_837I.x12').closest('pre')).not.toBeNull();
    expect(screen.getByText('unknown child text')).toBeInTheDocument(); // unknown nodes degrade to their children
  });

  it('renders callout, collapsible, steps, checklist, table and image', async () => {
    renderApp(<ArticleRenderer doc={doc} links={links} />);
    const callout = screen.getByRole('note', { name: 'Careful' });
    expect(callout).toHaveAttribute('data-kind', 'warning');
    expect(within(callout).getByText('Watch out')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'More details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden body')).toBeVisible();

    const steps = screen.getByRole('list', { name: 'Procedure' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
    expect(within(steps).getByText('Second')).toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: 'done item' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'open item' })).not.toBeChecked();

    expect(screen.getByRole('columnheader', { name: 'Benefit' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'EUR 400' })).toBeInTheDocument();

    expect(screen.getByRole('img', { name: 'Screen' })).toHaveAttribute('src', '/api/files/abc');
    expect(screen.getByText('A caption')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'bad' })).toBeNull();
  });

  it('resolves internal links to /article/:slug and shows archived/unavailable states', () => {
    renderApp(<ArticleRenderer doc={doc} links={links} />);
    expect(screen.getByRole('link', { name: 'GOP explained' })).toHaveAttribute('href', '/article/gop-explained');
    expect(screen.getByText('Old doc').closest('a')).toBeNull();
    expect(screen.getByTitle('This article is archived')).toBeInTheDocument();
    expect(screen.getByTitle('This article is not available')).toBeInTheDocument();
  });

  it('fetches link targets that are not in the provided map', async () => {
    mockFetch({ '/api/articles/zz': { id: 'zz', slug: 'zz-slug', title: 'Fetched title', status: 'published' } });
    const d = { type: 'doc', content: [p({ type: 'internalLink', attrs: { articleId: 'zz', label: 'x' } })] };
    renderApp(<ArticleRenderer doc={d} />);
    expect(await screen.findByRole('link', { name: 'Fetched title' })).toHaveAttribute('href', '/article/zz-slug');
  });
});
