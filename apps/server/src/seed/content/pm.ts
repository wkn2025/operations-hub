import type { CalloutKind, PmNode } from '@ops/shared';

/** Tiny ProseMirror JSON builders for seed content. Strings become text nodes; `**x**` is not parsed — use b(). */
type Inline = string | PmNode;
// empty strings are dropped: ProseMirror rejects empty text nodes (an empty table cell becomes an empty paragraph)
const inl = (xs: Inline[]): PmNode[] => xs.filter((x) => x !== '').map((x) => (typeof x === 'string' ? { type: 'text', text: x } : x));
const mark = (type: string, attrs?: Record<string, unknown>) => (text: string): PmNode => ({ type: 'text', text, marks: [{ type, ...(attrs ? { attrs } : {}) }] });

export const b = mark('bold');
export const i = mark('italic');
export const code = mark('code');
export const hl = mark('highlight');
export const a = (text: string, href: string): PmNode => mark('link', { href })(text);
/** Seed-only placeholder resolved to { articleId } by seedBase. Target is the article title. */
export const ref = (title: string, label?: string): PmNode => ({ type: 'internalLink', attrs: { seedRef: title, label: label ?? title } });

export const p = (...xs: Inline[]): PmNode => { const c = inl(xs); return { type: 'paragraph', ...(c.length ? { content: c } : {}) }; };
export const h = (level: 2 | 3 | 4, text: string): PmNode => ({ type: 'heading', attrs: { level }, content: inl([text]) });
const items = (xs: (Inline | PmNode[])[]): PmNode[] =>
  xs.map((x) => ({ type: 'listItem', content: Array.isArray(x) ? x : [p(x)] }));
export const ul = (...xs: (Inline | PmNode[])[]): PmNode => ({ type: 'bulletList', content: items(xs) });
export const ol = (...xs: (Inline | PmNode[])[]): PmNode => ({ type: 'orderedList', content: items(xs) });
export const quote = (...blocks: PmNode[]): PmNode => ({ type: 'blockquote', content: blocks });
export const pre = (language: string, text: string): PmNode => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] });
export const hr = (): PmNode => ({ type: 'horizontalRule' });

export const callout = (kind: CalloutKind, title: string | null, ...blocks: PmNode[]): PmNode =>
  ({ type: 'callout', attrs: { kind, ...(title ? { title } : {}) }, content: blocks });
export const collapsible = (title: string, ...blocks: PmNode[]): PmNode => ({ type: 'collapsible', attrs: { title }, content: blocks });
export const steps = (...xs: { title: string; body: PmNode[] }[]): PmNode =>
  ({ type: 'steps', content: xs.map((s) => ({ type: 'step', attrs: { title: s.title }, content: s.body })) });
export const tasks = (...xs: [boolean, string][]): PmNode =>
  ({ type: 'taskList', content: xs.map(([checked, t]) => ({ type: 'taskItem', attrs: { checked }, content: [p(t)] })) });
export const table = (head: string[], ...rows: Inline[][]): PmNode => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: head.map((c) => ({ type: 'tableHeader', content: [p(c)] })) },
    ...rows.map((r) => ({ type: 'tableRow', content: r.map((c) => ({ type: 'tableCell', content: [p(c)] })) })),
  ],
});
/** Seed-only placeholder resolved to src=/api/files/<id> by seedBase. */
export const shot = (seedFile: string, alt: string, caption?: string): PmNode =>
  ({ type: 'image', attrs: { seedFile, alt, ...(caption ? { title: caption } : {}) } });

export const demo = (text = 'Illustrative example for the Operations Hub demo. Names, clients, limits and figures are fictional.') =>
  callout('info', 'DEMO content', p(text));
