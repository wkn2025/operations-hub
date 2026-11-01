import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    internalLink: { insertInternalLink: (attrs: { articleId: string; label: string }) => ReturnType };
  }
}

/** `internalLink` {articleId, label}: inline atom pointing at another article by id (survives renames and slug changes). */
export const InternalLink = Node.create({
  name: 'internalLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      articleId: { default: null, parseHTML: (e) => e.getAttribute('data-article-id') },
      label: { default: '', parseHTML: (e) => e.textContent ?? '' },
    };
  },
  parseHTML() { return [{ tag: 'span[data-internal-link]' }]; },
  renderHTML({ node }) {
    return ['span', { 'data-internal-link': '', 'data-article-id': node.attrs.articleId, class: 'ed-ilink', title: 'Link to article' }, node.attrs.label || 'Linked article'];
  },
  renderText: ({ node }) => node.attrs.label,
  addCommands() {
    return {
      insertInternalLink: (attrs) => ({ commands }) => commands.insertContent([{ type: this.name, attrs }, { type: 'text', text: ' ' }]),
    };
  },
});
