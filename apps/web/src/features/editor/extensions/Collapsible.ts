import { Node } from '@tiptap/core';
import { chromeView, el } from './nodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: { setCollapsible: (title?: string) => ReturnType };
  }
}

/** `collapsible` {title, open}: a titled section readers expand. Always expanded while editing. */
export const Collapsible = Node.create({
  name: 'collapsible',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      title: { default: 'Details', parseHTML: (e) => e.getAttribute('data-title') ?? 'Details' },
      open: { default: false, parseHTML: (e) => e.hasAttribute('data-open') },
    };
  },
  parseHTML() { return [{ tag: 'div[data-collapsible]' }]; },
  renderHTML({ node }) { return ['div', { 'data-collapsible': '', 'data-title': node.attrs.title, ...(node.attrs.open ? { 'data-open': '' } : {}) }, 0]; },
  addCommands() {
    return { setCollapsible: (title = '') => ({ commands }) => commands.wrapIn(this.name, { title }) };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const input = el('input', { className: 'ed-title-input', placeholder: 'Section title', attrs: { 'aria-label': 'Collapsible section title' } });
      const open = el('input', { type: 'checkbox', attrs: { 'aria-label': 'Open by default' } });
      return chromeView({
        tag: 'div', className: 'ed-collapsible', node, editor, getPos: getPos as () => number,
        chrome: (set) => {
          input.oninput = () => set({ title: input.value });
          open.onchange = () => set({ open: open.checked });
          return el('div', { className: 'ed-collapsible-head' }, el('span', { className: 'ed-chevron', attrs: { 'aria-hidden': 'true' } }), input,
            el('label', { className: 'ed-open-toggle' }, open, 'Open by default'));
        },
        sync: (n) => {
          if (document.activeElement !== input) input.value = String(n.attrs.title ?? '');
          open.checked = !!n.attrs.open;
          input.disabled = open.disabled = !editor.isEditable;
        },
      });
    };
  },
});
