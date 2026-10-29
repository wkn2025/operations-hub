/** ProseMirror JSON node names shared by the editor (web) and text extraction / link sync (server). */
export const PM_NODES = {
  doc: 'doc',
  paragraph: 'paragraph',
  text: 'text',
  callout: 'callout',
  collapsible: 'collapsible',
  steps: 'steps',
  taskList: 'taskList',
  taskItem: 'taskItem',
  table: 'table',
  image: 'image',
  /** attrs: { articleId: string; label?: string } */
  internalLink: 'internalLink',
} as const;

export interface PmNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}
