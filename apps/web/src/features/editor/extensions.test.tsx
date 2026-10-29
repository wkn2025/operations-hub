import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import type { PmNode } from '@ops/shared';
import { ArticleRenderer } from '../articles/ArticleRenderer';
import { editorExtensions } from './extensions';
import { applySlashItem, filterSlashItems, slashState } from './slash';
import { mockFetch } from '../../test/utils';

let ed: Editor | null = null;
afterEach(() => { ed?.destroy(); ed = null; });
const make = (content?: unknown, opts: Parameters<typeof editorExtensions>[0] = {}) =>
  (ed = new Editor({ extensions: editorExtensions(opts), content: content as any }));

const t = (text: string, marks?: PmNode['marks']): PmNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c: PmNode[]): PmNode => ({ type: 'paragraph', content: c });
const cell = (type: string, s: string): PmNode => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t(s))] });

/** One of everything the editor can produce. */
const EVERYTHING: PmNode = {
  type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Heading')] },
    p(t('b', [{ type: 'bold' }]), t('i', [{ type: 'italic' }]), t('u', [{ type: 'underline' }]), t('s', [{ type: 'strike' }]),
      t('c', [{ type: 'code' }]), t('h', [{ type: 'highlight' }]), t('l', [{ type: 'link', attrs: { href: 'https://example.test' } }]),
      { type: 'hardBreak' }, { type: 'internalLink', attrs: { articleId: 'a1', label: 'Other article' } }),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('bullet'))] }] },
    { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p(t('ordered'))] }] },
    { type: 'blockquote', content: [p(t('quote'))] },
    { type: 'codeBlock', attrs: { language: 'sql' }, content: [t('select 1')] },
    { type: 'horizontalRule' },
    { type: 'callout', attrs: { kind: 'warning', title: null }, content: [p(t('careful'))] },
    { type: 'collapsible', attrs: { title: 'More', open: false }, content: [p(t('hidden'))] },
    { type: 'steps', content: [{ type: 'step', attrs: { title: 'First' }, content: [p(t('do it'))] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('task'))] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'H')] }, { type: 'tableRow', content: [cell('tableCell', 'C')] }] },
    { type: 'image', attrs: { src: '/api/files/f1', alt: 'shot', title: null } },
  ],
};

/** How the renderer shows each node/mark type. A new editor node without an entry here fails the coverage test. */
const RENDERED: Record<string, string> = {
  doc: '.prose-ops', paragraph: 'p', text: 'p', heading: 'h2', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote',
  codeBlock: 'pre code', horizontalRule: 'hr', hardBreak: 'br', callout: '[role=note][data-kind=warning]', collapsible: 'button[aria-expanded]',
  steps: 'ol[aria-label=Procedure]', step: 'ol[aria-label=Procedure] li', taskList: 'ul input[type=checkbox]', taskItem: 'input[type=checkbox]:checked',
  table: 'table', tableRow: 'tr', tableHeader: 'th', tableCell: 'td', image: 'img[src="/api/files/f1"][alt=shot]', internalLink: 'a[href="/article/other"]',
  // marks
  bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'p code', highlight: 'mark', link: 'a.ext[href="https://example.test"]',
};

const types = (n: PmNode, out = new Set<string>()) => {
  out.add(n.type);
  n.marks?.forEach((m) => out.add(m.type));
  n.content?.forEach((c) => types(c, out));
  return out;
};

describe('editor schema ↔ ArticleRenderer', () => {
  it('every node and mark the editor schema can produce has a renderer mapping', () => {
    const e = make();
    const schemaTypes = [...Object.keys(e.schema.nodes), ...Object.keys(e.schema.marks)].sort();
    expect(schemaTypes).toEqual(Object.keys(RENDERED).sort());
  });

  it('round-trips every node type through getJSON and renders each one (no silent drops)', () => {
    const e = make(EVERYTHING);
    const out = e.getJSON() as PmNode;
    expect([...types(out)].sort()).toEqual([...types(EVERYTHING)].sort());
    const { container } = render(<ArticleRenderer doc={out} links={{ a1: { status: 'published', title: 'Other', slug: 'other' } }} />, { wrapper: Router });
    for (const [type, sel] of Object.entries(RENDERED)) expect(container.querySelector(sel), `${type} -> ${sel}`).not.toBeNull();
  });

  it('callout kinds and step titles survive the round trip', () => {
    const e = make({ type: 'doc', content: [{ type: 'callout', attrs: { kind: 'danger', title: 'Stop' }, content: [p(t('x'))] }] });
    expect((e.getJSON().content![0] as PmNode).attrs).toEqual({ kind: 'danger', title: 'Stop' });
  });
});

describe('internal links', () => {
  it('insertInternalLink inserts an inline node resolving to the article id', () => {
    const e = make({ type: 'doc', content: [p(t('See '))] });
    e.commands.focus('end');
    e.commands.insertInternalLink({ articleId: 'abc', label: 'Missing GOP' });
    const para = e.getJSON().content![0] as PmNode;
    expect(para.content![1]).toEqual({ type: 'internalLink', attrs: { articleId: 'abc', label: 'Missing GOP' } });
  });
});

describe('image upload', () => {
  it('pasting an image uploads it to /api/files and inserts an image node', async () => {
    const fetchFn = mockFetch({ '/api/files': { id: 'f9', url: '/api/files/f9', name: 'shot.png', mime: 'image/png', size: 3 } });
    const onError = vi.fn();
    const e = make({ type: 'doc', content: [p(t('x'))] }, { onUploadError: onError });
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    const handled = e.view.someProp('handlePaste', (f) => f(e.view, { clipboardData: { files: [file] }, preventDefault() {} } as unknown as ClipboardEvent, null as any));
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(JSON.stringify(e.getJSON())).toContain('/api/files/f9'));
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/files');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    const img = (e.getJSON().content as PmNode[]).flatMap((n) => [n, ...(n.content ?? [])]).find((n) => n.type === 'image')!;
    expect(img.attrs).toMatchObject({ src: '/api/files/f9', alt: '' }); // empty until the author describes it (the editor flags it)
    expect(onError).not.toHaveBeenCalled();
  });

  it('a rejected upload reports the error and inserts nothing', async () => {
    mockFetch({ '/api/files': { __status: 415, error: 'unsupported_type' } });
    const onError = vi.fn();
    const e = make({ type: 'doc', content: [p(t('x'))] }, { onUploadError: onError });
    const file = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    e.view.someProp('handlePaste', (f) => f(e.view, { clipboardData: { files: [file] }, preventDefault() {} } as unknown as ClipboardEvent, null as any));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(JSON.stringify(e.getJSON())).not.toContain('image');
  });
});

describe('slash menu', () => {
  it('detects "/query" before the cursor and filters items', () => {
    const e = make({ type: 'doc', content: [p(t('/call'))] });
    e.commands.focus('end');
    const s = slashState(e.state);
    expect(s).toMatchObject({ query: 'call' });
    expect(filterSlashItems('call').map((i) => i.id)).toContain('callout-info');
    expect(filterSlashItems('zzz')).toEqual([]);
    expect(filterSlashItems('').length).toBeGreaterThan(8);
  });

  it('ignores slashes inside words (urls, dates)', () => {
    const e = make({ type: 'doc', content: [p(t('and/or'))] });
    e.commands.focus('end');
    expect(slashState(e.state)).toBeNull();
  });

  it.each(['callout-info', 'steps', 'table', 'checklist', 'collapsible', 'h2', 'h3'])('applying %s replaces the trigger text', (id) => {
    const e = make({ type: 'doc', content: [p(t('/x'))] });
    e.commands.focus('end');
    const item = filterSlashItems('').find((i) => i.id === id)!;
    applySlashItem(e, item, slashState(e.state)!.range);
    const json = JSON.stringify(e.getJSON());
    expect(json).not.toContain('/x');
    const expected = { 'callout-info': '"callout"', steps: '"steps"', table: '"table"', checklist: '"taskList"', collapsible: '"collapsible"', h2: '"level":2', h3: '"level":3' }[id]!;
    expect(json).toContain(expected);
  });
});

// ArticleRenderer uses <Link>; give it a router.
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient';
import type { ReactNode } from 'react';
function Router({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient({ retry: false })}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('steps', () => {
  it('inserting steps puts the cursor in the first step', () => {
    const e = make({ type: 'doc', content: [p(t('intro')), p()] });
    e.commands.focus('end');
    e.commands.insertSteps();
    e.commands.insertContent('first');
    const steps = (e.getJSON().content as PmNode[]).find((n) => n.type === 'steps')!;
    expect(JSON.stringify(steps.content![0])).toContain('first');
    expect(JSON.stringify(steps.content![1])).not.toContain('first');
  });
});

describe('paste with text content', () => {
  it('HTML + PNG on the clipboard keeps the text and uploads nothing', () => {
    const fetchFn = mockFetch({ '/api/files': { id: 'f1', url: '/api/files/f1' } });
    const e = make({ type: 'doc', content: [p(t('x'))] });
    const file = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });
    const plugin = e.state.plugins.find((pl) => (pl as unknown as { key: string }).key.startsWith('imageUpload'))!;
    const ev = { clipboardData: { files: [file], types: ['text/html', 'text/plain', 'Files'], getData: () => '' }, preventDefault() {} } as unknown as ClipboardEvent;
    const handled = plugin.props.handlePaste!.call(plugin, e.view, ev, null as any);
    expect(handled).toBe(false); // ProseMirror pastes the text as usual
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('link sanitising', () => {
  const bad = 'javascript:alert(1)';
  it('a stored javascript: href never becomes a live link in the editor or the renderer', () => {
    const json = { type: 'doc', content: [p(t('click', [{ type: 'link', attrs: { href: bad } }]))] };
    const e = make(json);
    expect(e.view.dom.querySelector('a[href^="javascript"]')).toBeNull();
    const { container } = render(<ArticleRenderer doc={e.getJSON() as PmNode} />, { wrapper: Router });
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('pasted <a href="javascript:"> is sanitised', () => {
    const e = make({ type: 'doc', content: [p()] });
    e.commands.focus('end');
    e.view.pasteHTML(`<p><a href="${bad}">evil</a> and <a href="https://ok.test">fine</a></p>`, new Event('paste') as ClipboardEvent);
    const json = JSON.stringify(e.getJSON());
    expect(json).toContain('evil');
    expect(json).not.toContain('javascript');
    expect(json).toContain('https://ok.test');
  });
});
