import { Node } from '@tiptap/core';
import { CALLOUT_KINDS, type CalloutKind } from '@ops/shared';
import { chromeView, el } from './nodeView';

export const CALLOUT_LABEL: Record<CalloutKind, string> = { info: 'Note', tip: 'Tip', warning: 'Warning', danger: 'Important', success: 'Success' };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { setCallout: (kind?: CalloutKind) => ReturnType };
  }
}

/** `callout` {kind, title}: block container rendered by ArticleRenderer as a coloured note. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      kind: { default: 'info', parseHTML: (e) => e.getAttribute('data-kind') ?? 'info' },
      title: { default: null },
    };
  },
  parseHTML() { return [{ tag: 'div[data-callout]' }]; },
  renderHTML({ node }) { return ['div', { 'data-callout': '', 'data-kind': node.attrs.kind }, 0]; },
  addCommands() {
    return { setCallout: (kind = 'info') => ({ commands }) => commands.wrapIn(this.name, { kind }) };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const select = el('select', { className: 'ed-chip-select', attrs: { 'aria-label': 'Callout type' } },
        ...CALLOUT_KINDS.map((k) => el('option', { value: k }, CALLOUT_LABEL[k])));
      return chromeView({
        tag: 'div', className: 'ed-callout', node, editor, getPos: getPos as () => number,
        attrs: (n) => ({ 'data-kind': String(n.attrs.kind) }),
        chrome: (set) => { select.onchange = () => set({ kind: select.value }); return el('div', { className: 'ed-callout-bar' }, select); },
        sync: (n) => { select.value = String(n.attrs.kind); select.disabled = !editor.isEditable; },
      });
    };
  },
});
