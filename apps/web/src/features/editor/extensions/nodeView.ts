import type { Editor } from '@tiptap/core';
import type { Node as PmNodeType } from '@tiptap/pm/model';

/**
 * Small vanilla node-view helper: a wrapper with non-editable chrome (inputs/selects/buttons) plus an editable contentDOM.
 * Vanilla (not React) so the same extensions work in the headless editor used by tests.
 */
export function chromeView(o: {
  tag: string; className: string; editor: Editor; getPos: () => number | undefined; node: PmNodeType;
  chrome: (set: (attrs: Record<string, unknown>) => void) => HTMLElement; sync: (node: PmNodeType) => void; footer?: HTMLElement;
  attrs?: (node: PmNodeType) => Record<string, string>;
}) {
  const dom = document.createElement(o.tag);
  dom.className = o.className;
  const applyAttrs = (n: PmNodeType) => { for (const [k, v] of Object.entries(o.attrs?.(n) ?? {})) dom.setAttribute(k, v); };
  const set = (attrs: Record<string, unknown>) => {
    const pos = o.getPos();
    if (typeof pos !== 'number' || !o.editor.isEditable) return;
    const node = o.editor.state.doc.nodeAt(pos);
    if (node) o.editor.view.dispatch(o.editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
  };
  const chrome = o.chrome(set);
  chrome.contentEditable = 'false';
  const contentDOM = document.createElement('div');
  contentDOM.className = `${o.className}-body`;
  dom.append(chrome, contentDOM);
  if (o.footer) { o.footer.contentEditable = 'false'; dom.append(o.footer); }
  applyAttrs(o.node); o.sync(o.node);
  let type = o.node.type;
  return {
    dom, contentDOM,
    update(n: PmNodeType) { if (n.type !== type) return false; type = n.type; applyAttrs(n); o.sync(n); return true; },
    // chrome controls handle their own events; ProseMirror must not treat them as edits
    stopEvent: (e: Event) => chrome.contains(e.target as Node) || !!o.footer?.contains(e.target as Node),
    ignoreMutation: (m: MutationRecord | { type: 'selection'; target: Node }) => m.type !== 'selection' && !contentDOM.contains(m.target),
  };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> & { attrs?: Record<string, string> } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const { attrs, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest) as HTMLElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs ?? {})) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}
