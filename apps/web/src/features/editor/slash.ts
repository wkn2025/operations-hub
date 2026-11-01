import type { Editor, Range } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import {
  CircleCheck, Code2, FoldVertical, Heading2, Heading3, Heading4, ImagePlus, Info, Lightbulb, Link2, List, ListChecks, ListOrdered,
  Minus, OctagonAlert, Quote, Table2, TriangleAlert, Waypoints, type LucideIcon,
} from 'lucide-react';
import type { CalloutKind } from '@ops/shared';

export interface SlashCtx { pickImage?: () => void; pickArticle?: () => void }
export interface SlashItem { id: string; label: string; hint: string; icon: LucideIcon; keywords: string; run: (e: Editor, range: Range, ctx: SlashCtx) => void }

const callout = (kind: CalloutKind, label: string, hint: string, icon: LucideIcon): SlashItem => ({
  id: `callout-${kind}`, label, hint, icon, keywords: `callout note box ${kind} ${label}`,
  run: (e, r) => e.chain().focus().deleteRange(r).setCallout(kind).run(),
});

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'h2', label: 'Heading', hint: 'Section title', icon: Heading2, keywords: 'h2 heading title section', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run() },
  { id: 'h3', label: 'Subheading', hint: 'Smaller section title', icon: Heading3, keywords: 'h3 heading subheading', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run() },
  { id: 'h4', label: 'Minor heading', hint: 'Label inside a section', icon: Heading4, keywords: 'h4 heading', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 4 }).run() },
  { id: 'steps', label: 'Steps', hint: 'Numbered procedure', icon: Waypoints, keywords: 'steps procedure how to sequence', run: (e, r) => e.chain().focus().deleteRange(r).insertSteps().run() },
  { id: 'checklist', label: 'Checklist', hint: 'Things to tick off', icon: ListChecks, keywords: 'checklist todo task list checkbox', run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: 'table', label: 'Table', hint: '3 × 3 with header row', icon: Table2, keywords: 'table grid coverage matrix', run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  callout('info', 'Note', 'Neutral side information', Info),
  callout('tip', 'Tip', 'A helpful shortcut', Lightbulb),
  callout('warning', 'Warning', 'Something can go wrong', TriangleAlert),
  callout('danger', 'Important', 'Must not be missed', OctagonAlert),
  callout('success', 'Success', 'Expected good outcome', CircleCheck),
  { id: 'collapsible', label: 'Collapsible section', hint: 'Details readers expand', icon: FoldVertical, keywords: 'collapsible toggle details accordion faq', run: (e, r) => e.chain().focus().deleteRange(r).setCollapsible().run() },
  { id: 'image', label: 'Image', hint: 'Upload a screenshot', icon: ImagePlus, keywords: 'image picture screenshot upload photo', run: (e, r, c) => { e.chain().focus().deleteRange(r).run(); c.pickImage?.(); } },
  { id: 'link', label: 'Link to article', hint: 'Internal knowledge-base link', icon: Link2, keywords: 'link internal article reference', run: (e, r, c) => { e.chain().focus().deleteRange(r).run(); c.pickArticle?.(); } },
  { id: 'bullet', label: 'Bulleted list', hint: 'Unordered points', icon: List, keywords: 'bullet list ul', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: 'numbered', label: 'Numbered list', hint: 'Ordered points', icon: ListOrdered, keywords: 'numbered ordered list ol', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: 'quote', label: 'Quote', hint: 'Quoted text', icon: Quote, keywords: 'quote blockquote', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: 'code', label: 'Code block', hint: 'SQL, EDI segments, logs', icon: Code2, keywords: 'code block sql edi log monospace', run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule', icon: Minus, keywords: 'divider rule hr line separator', run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.keywords.includes(q));
}

/** "/query" typed at the start of a block or after whitespace, with the cursor right after it. */
export function slashState(state: EditorState): { query: string; range: Range } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if ($from.parent.type.spec.code || !$from.parent.isTextblock) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const m = /(?:^|\s)\/([\w-]{0,24})$/.exec(before);
  if (!m) return null;
  return { query: m[1]!, range: { from: $from.pos - m[1]!.length - 1, to: $from.pos } };
}

export const applySlashItem = (e: Editor, item: SlashItem, range: Range, ctx: SlashCtx = {}) => item.run(e, range, ctx);
