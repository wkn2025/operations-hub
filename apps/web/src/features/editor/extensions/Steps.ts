import { Node } from '@tiptap/core';
import { chromeView, el } from './nodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    steps: { insertSteps: () => ReturnType };
  }
}

const emptyStep = { type: 'step', content: [{ type: 'paragraph' }] };

/** `steps` > `step` {title}: an ordered procedure, rendered as a numbered timeline. */
export const Steps = Node.create({
  name: 'steps',
  group: 'block',
  content: 'step+',
  defining: true,
  parseHTML() { return [{ tag: 'ol[data-steps]' }]; },
  renderHTML() { return ['ol', { 'data-steps': '' }, 0]; },
  addCommands() {
    return { insertSteps: () => ({ commands }) => commands.insertContent({ type: this.name, content: [emptyStep, emptyStep] }) };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const add = el('button', { type: 'button', className: 'ed-add-step' }, '+ Add step');
      add.onclick = () => {
        const pos = (getPos as () => number)();
        const n = editor.state.doc.nodeAt(pos);
        if (n) editor.chain().insertContentAt(pos + n.nodeSize - 1, emptyStep).focus(pos + n.nodeSize + 1).run();
      };
      return chromeView({
        tag: 'div', className: 'ed-steps', node, editor, getPos: getPos as () => number, footer: add,
        chrome: () => el('div', { className: 'ed-steps-label' }, 'Procedure'),
        sync: () => { add.hidden = !editor.isEditable; },
      });
    };
  },
});

export const Step = Node.create({
  name: 'step',
  content: 'block+',
  defining: true,
  addAttributes() { return { title: { default: null, parseHTML: (e) => e.getAttribute('data-title') } }; },
  parseHTML() { return [{ tag: 'li[data-step]' }]; },
  renderHTML({ node }) { return ['li', { 'data-step': '', ...(node.attrs.title ? { 'data-title': node.attrs.title } : {}) }, 0]; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const input = el('input', { className: 'ed-title-input', placeholder: 'Step title (optional)', attrs: { 'aria-label': 'Step title' } });
      const remove = el('button', { type: 'button', className: 'ed-remove-step', title: 'Remove step', attrs: { 'aria-label': 'Remove step' } }, '×');
      remove.onclick = () => {
        const pos = (getPos as () => number)();
        const n = editor.state.doc.nodeAt(pos), parent = editor.state.doc.resolve(pos).parent;
        if (!n) return;
        // last step: remove the whole procedure
        if (parent.childCount <= 1) { const $p = editor.state.doc.resolve(pos); editor.chain().deleteRange({ from: $p.before(), to: $p.after() }).run(); }
        else editor.chain().deleteRange({ from: pos, to: pos + n.nodeSize }).run();
      };
      return chromeView({
        tag: 'div', className: 'ed-step', node, editor, getPos: getPos as () => number,
        chrome: (set) => {
          input.oninput = () => set({ title: input.value || null });
          return el('div', { className: 'ed-step-head' }, el('span', { className: 'ed-step-num', attrs: { 'aria-hidden': 'true' } }), input, remove);
        },
        sync: (n) => {
          if (document.activeElement !== input) input.value = String(n.attrs.title ?? '');
          input.disabled = !editor.isEditable; remove.hidden = !editor.isEditable;
        },
      });
    };
  },
});
