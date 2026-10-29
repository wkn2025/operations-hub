import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { safeHref } from '../../../lib/text';
import { Callout } from './Callout';
import { Collapsible } from './Collapsible';
import { Step, Steps } from './Steps';
import { InternalLink } from './InternalLink';
import { ImageUpload, type ImageUploadOptions } from './ImageUpload';

/**
 * The editor schema. Every node/mark here must be handled by ArticleRenderer (enforced by extensions.test.tsx);
 * names and attrs follow packages/shared/src/pm-nodes.ts.
 */
export function editorExtensions(o: { placeholder?: string; onUploadError?: ImageUploadOptions['onError']; onUploadBusy?: ImageUploadOptions['onBusy'] } = {}) {
  return [
    StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
    Underline,
    Highlight,
    // autolink off: typed text like "Done.My" was turned into a link; pasted URLs still become links
    Link.configure({ openOnClick: false, autolink: false, validate: (href) => !!safeHref(href), isAllowedUri: (url, ctx) => !!safeHref(url) && ctx.defaultValidate(url), HTMLAttributes: { rel: 'noopener noreferrer', target: null } }),
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : o.placeholder ?? 'Write, or type / for blocks'),
      includeChildren: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow, TableHeader, TableCell,
    Callout, Collapsible, Steps, Step, InternalLink,
    ImageUpload.configure({ onError: o.onUploadError ?? (() => {}), onBusy: o.onUploadBusy ?? (() => {}) }),
  ];
}
