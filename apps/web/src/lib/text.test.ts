import { describe, it, expect } from 'vitest';
import { safeHref, parseMarked, headingsOf } from './text';

describe('safeHref', () => {
  it('allows http, https, mailto and relative links', () => {
    for (const h of ['https://example.test/a?b=1', 'http://x.test', 'mailto:a@b.test', '/article/x', '#top', 'docs/page', '?q=1'])
      expect(safeHref(h)).toBe(h);
  });
  it('rejects script-capable and odd schemes, including obfuscated ones', () => {
    for (const h of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:x',
      'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', '//evil.test/x', '\\\\evil', 'blob:x', '', 42, null])
      expect(safeHref(h as any)).toBeNull();
  });
});

describe('parseMarked', () => {
  it('splits server snippets on <mark> and decodes the escaped HTML entities as text', () => {
    expect(parseMarked('a &lt;b&gt; <mark>GOP</mark> &amp; c')).toEqual([
      { text: 'a <b> ', mark: false }, { text: 'GOP', mark: true }, { text: ' & c', mark: false },
    ]);
  });
  it('never turns other tags into markup', () => {
    const parts = parseMarked('<img src=x onerror=alert(1)><mark>x</mark>');
    expect(parts.every((p) => typeof p.text === 'string')).toBe(true);
    expect(parts[0]).toEqual({ text: '<img src=x onerror=alert(1)>', mark: false });
  });
});

describe('headingsOf', () => {
  it('gives unique slug ids in document order', () => {
    const h = (t: string, level = 2) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] });
    const doc = { type: 'doc', content: [h('Overview'), { type: 'callout', content: [h('Nested', 3)] }, h('Overview')] };
    expect(headingsOf(doc).map((x) => [x.id, x.level])).toEqual([['overview', 2], ['nested', 3], ['overview-2', 2]]);
  });
});
