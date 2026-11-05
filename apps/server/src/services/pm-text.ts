import { PM_NODES, type PmNode } from '@ops/shared';

const BLOCK = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'tableRow', 'tableCell', 'tableHeader', 'callout', 'collapsible', 'steps', 'step', 'blockquote', 'codeBlock']);

function walk(n: PmNode | undefined | null, out: string[]) {
  if (!n || typeof n !== 'object') return;
  if (n.type === PM_NODES.text && typeof n.text === 'string') out.push(n.text);
  if (n.type === PM_NODES.internalLink && typeof n.attrs?.label === 'string' && !n.content?.length) out.push(n.attrs.label);
  if ((n.type === 'collapsible' || n.type === 'step') && typeof n.attrs?.title === 'string') out.push(n.attrs.title, '\n');
  if (n.type === PM_NODES.image) for (const k of ['alt', 'title'] as const) if (typeof n.attrs?.[k] === 'string') out.push(n.attrs[k] as string);
  if (Array.isArray(n.content)) for (const c of n.content) walk(c, out);
  if (BLOCK.has(n.type)) out.push('\n');
}

/** Plain text for the FTS index. Tolerates malformed input (returns ''). */
export function extractText(doc: unknown): string {
  const out: string[] = [];
  walk(doc as PmNode, out);
  // eslint-disable-next-line no-control-regex
  return out.join(' ').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Distinct target article ids of internalLink nodes. */
export function extractLinkIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const go = (n: PmNode | undefined | null) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === PM_NODES.internalLink && typeof n.attrs?.articleId === 'string') ids.add(n.attrs.articleId);
    if (Array.isArray(n.content)) n.content.forEach(go);
  };
  go(doc as PmNode);
  return [...ids];
}

/** Distinct file ids of image nodes whose src is /api/files/<id>. */
export function extractFileIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const go = (n: PmNode | undefined | null) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === PM_NODES.image && typeof n.attrs?.src === 'string') {
      const m = /^\/api\/files\/([\w-]+)$/.exec(n.attrs.src);
      if (m) ids.add(m[1]);
    }
    if (Array.isArray(n.content)) n.content.forEach(go);
  };
  go(doc as PmNode);
  return [...ids];
}
