import type { PmNode } from '@ops/shared';

/** Only http(s), mailto and plain relative URLs survive. Anything with whitespace/control chars is refused (browsers strip them, e.g. "java\tscript:"). */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string' || !href) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(href) || href.startsWith('//')) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (scheme && !['http', 'https', 'mailto'].includes(scheme[1].toLowerCase())) return null;
  return href;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Server snippets are HTML-escaped text with literal <mark>…</mark>. Returns text segments; nothing is ever parsed as HTML. */
export function parseMarked(snippet: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  let mark = false;
  for (const part of snippet.split(/(<\/?mark>)/)) {
    if (part === '<mark>') mark = true;
    else if (part === '</mark>') mark = false;
    else if (part) out.push({ text: decode(part), mark });
  }
  return out;
}

export const textOf = (n: PmNode): string =>
  n.type === 'text' ? n.text ?? '' : n.type === 'internalLink' ? String(n.attrs?.label ?? '') : (n.content ?? []).map(textOf).join('');

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

export interface Heading { id: string; text: string; level: number; node: PmNode }

/** Headings in document order with unique ids (shared by the renderer and the table of contents). */
export function headingsOf(doc: PmNode | null | undefined): Heading[] {
  const out: Heading[] = [], seen = new Map<string, number>();
  const walk = (n: PmNode) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'heading') {
      const text = textOf(n), base = slug(text), k = (seen.get(base) ?? 0) + 1;
      seen.set(base, k);
      out.push({ id: k === 1 ? base : `${base}-${k}`, text, level: Number(n.attrs?.level ?? 2), node: n });
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

export const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts }) : '';
