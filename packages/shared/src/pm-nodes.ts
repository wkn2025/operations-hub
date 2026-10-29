/**
 * ProseMirror JSON node names shared by the renderer (web, Task 5), editor (web, Task 6) and text extraction / link sync (server).
 * Standard nodes use Tiptap's names. Custom node attrs are documented inline.
 */
export const PM_NODES = {
  doc: 'doc',
  paragraph: 'paragraph',
  text: 'text',
  heading: 'heading', // attrs: { level: 1..4 }
  bulletList: 'bulletList',
  orderedList: 'orderedList', // attrs: { start?: number }
  listItem: 'listItem',
  blockquote: 'blockquote',
  codeBlock: 'codeBlock', // attrs: { language?: string }
  horizontalRule: 'horizontalRule',
  hardBreak: 'hardBreak',
  /** attrs: { kind: CalloutKind; title?: string }; content: blocks */
  callout: 'callout',
  /** attrs: { title: string; open?: boolean }; content: blocks */
  collapsible: 'collapsible',
  /** content: step+ (rendered as a numbered procedure) */
  steps: 'steps',
  /** attrs: { title?: string }; content: blocks */
  step: 'step',
  taskList: 'taskList',
  taskItem: 'taskItem', // attrs: { checked: boolean }
  table: 'table',
  tableRow: 'tableRow',
  tableHeader: 'tableHeader',
  tableCell: 'tableCell',
  image: 'image', // attrs: { src: string ('/api/files/<id>'); alt?: string; title?: string (caption) }
  /** inline atom; attrs: { articleId: string; label?: string } */
  internalLink: 'internalLink',
} as const;

/** Marks: bold, italic, underline, strike, code, highlight, link (attrs: { href }). */
export const PM_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'link'] as const;

export const CALLOUT_KINDS = ['info', 'tip', 'warning', 'danger', 'success'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export interface PmNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}
