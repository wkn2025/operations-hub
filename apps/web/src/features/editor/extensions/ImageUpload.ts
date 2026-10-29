import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { api, type FileRef } from '../../../api/client';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function uploadFile(file: File): Promise<FileRef> {
  const body = new FormData();
  body.append('file', file, file.name);
  return api<FileRef>('/api/files', { method: 'POST', body });
}

export interface ImageUploadOptions {
  onError: (e: unknown, file: File) => void;
  onBusy: (busy: boolean) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: { uploadImages: (files: File[], pos?: number) => ReturnType };
  }
}

const altOf = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();

/** Upload images to /api/files, then insert `image` {src:'/api/files/<id>', alt}. Nothing is inserted if the server rejects the file. */
async function uploadAndInsert(editor: Editor, files: File[], pos: number, o: ImageUploadOptions) {
  o.onBusy(true);
  try {
    for (const file of files) {
      try {
        const f = await uploadFile(file);
        if (editor.isDestroyed) return;
        // ponytail: insert at the original position clamped to the doc; edits elsewhere during upload may shift it slightly
        const at = Math.min(pos, editor.state.doc.content.size);
        editor.chain().insertContentAt(at, { type: 'image', attrs: { src: `/api/files/${f.id}`, alt: altOf(file.name) } }).run();
      } catch (e) { o.onError(e, file); }
    }
  } finally { o.onBusy(false); }
}

const images = (list: FileList | File[] | null | undefined) => Array.from(list ?? []).filter((f) => IMAGE_TYPES.includes(f.type));

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',
  addOptions() { return { onError: () => {}, onBusy: () => {} }; },
  addCommands() {
    return {
      uploadImages: (files, pos) => ({ editor }) => {
        void uploadAndInsert(editor as Editor, files, pos ?? editor.state.selection.from, this.options);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor, o = this.options;
    return [new Plugin({
      key: new PluginKey('imageUpload'),
      props: {
        handlePaste(view, event) {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length) return false;
          event.preventDefault();
          const imgs = images(files);
          if (imgs.length) void uploadAndInsert(editor, imgs, view.state.selection.from, o);
          else o.onError(new Error('Only PNG, JPG, GIF or WebP images can be pasted. Add other files as attachments.'), files[0]!);
          return true;
        },
        handleDrop(view, event, _slice, moved) {
          const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
          if (moved || !files.length) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos ?? view.state.selection.from;
          const imgs = images(files);
          if (imgs.length) void uploadAndInsert(editor, imgs, at, o);
          else o.onError(new Error('Only images can be dropped into the text. Add other files as attachments.'), files[0]!);
          return true;
        },
      },
    })];
  },
});
