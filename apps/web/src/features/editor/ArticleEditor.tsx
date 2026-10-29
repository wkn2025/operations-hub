import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BubbleMenu, EditorContent, useEditor, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import clsx from 'clsx';
import {
  Bold, Code, Columns3, FileText, Heading2, Heading3, Highlighter, ImagePlus, Italic, Link2, ListChecks, Rows3, Strikethrough, Table2, Trash2,
  Underline as UnderlineIcon, Unlink, Waypoints, Info, FoldVertical, X, Check,
} from 'lucide-react';
import type { PmNode } from '@ops/shared';
import { editorExtensions } from './extensions';
import { IMAGE_TYPES } from './extensions/ImageUpload';
import { applySlashItem, filterSlashItems, slashState, type SlashItem } from './slash';
import { LinkPicker } from './LinkPicker';
import { safeHref } from '../../lib/text';

/** Creates the Tiptap editor for an article body. Kept outside the canvas so the page can reset content (reload / restore). */
export function useArticleEditor(o: {
  content: PmNode; editable: boolean; onChange: (doc: PmNode) => void; onBlur: () => void; onUploadError: (e: unknown) => void; onUploadBusy: (b: boolean) => void;
}) {
  const cb = useRef(o); cb.current = o;
  const editor = useEditor({
    extensions: editorExtensions({ onUploadError: (e) => cb.current.onUploadError(e), onUploadBusy: (b) => cb.current.onUploadBusy(b) }),
    content: o.content as object,
    editable: o.editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: 'prose-ops ed-content', 'aria-label': 'Article text', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => cb.current.onChange(editor.getJSON() as PmNode),
    onBlur: () => cb.current.onBlur(),
  });
  // emitUpdate=false: toggling editability is not an edit (it would otherwise trigger an autosave)
  useEffect(() => { if (editor.isEditable !== o.editable) editor.setEditable(o.editable, false); }, [editor, o.editable]);
  return editor;
}

/** Re-render on every editor transaction (toolbar active states, slash menu). */
function useTick(editor: Editor) {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    editor.on('transaction', f);
    return () => { editor.off('transaction', f); };
  }, [editor]);
}

export function ArticleEditor({ editor }: { editor: Editor }) {
  const [picker, setPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickImage = () => fileRef.current?.click();
  const pickArticle = () => setPicker(true);

  return (
    <div className="relative">
      {editor.isEditable && <InsertStrip editor={editor} onImage={pickImage} onArticle={pickArticle} />}
      <EditorContent editor={editor} />
      {editor.isEditable && (<>
        <FormatBubble editor={editor} onArticle={pickArticle} />
        <TableBubble editor={editor} />
        <SlashMenu editor={editor} ctx={{ pickImage, pickArticle }} />
      </>)}
      <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} multiple className="sr-only" tabIndex={-1} aria-label="Upload image"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) editor.chain().focus().uploadImages(files).run(); e.target.value = ''; }} />
      <LinkPicker open={picker} onOpenChange={(o) => { setPicker(o); if (!o) editor.commands.focus(); }}
        onPick={(a) => {
          const { from, to, empty } = editor.state.selection;
          const label = empty ? a.title : editor.state.doc.textBetween(from, to, ' ').trim() || a.title;
          editor.chain().focus().insertInternalLink({ articleId: a.id, label }).run();
        }} />
    </div>
  );
}

function Tool({ label, onClick, active, children, disabled }: { label: string; onClick: () => void; active?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled}
      onMouseDown={(e) => e.preventDefault() /* keep the editor selection */} onClick={onClick}
      className={clsx('flex h-8 min-w-8 items-center justify-center rounded-[9px] px-1.5 transition-colors duration-150 disabled:opacity-40',
        active ? 'bg-primary text-white' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')}>
      {children}
    </button>
  );
}
const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-neutral-200" />;

/** Quiet row of the most used blocks, above the text. The slash menu has the rest. */
function InsertStrip({ editor, onImage, onArticle }: { editor: Editor; onImage: () => void; onArticle: () => void }) {
  useTick(editor);
  const c = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Insert" className="mb-6 flex flex-wrap items-center gap-0.5 rounded-[14px] bg-neutral-50/80 p-1 ring-1 ring-inset ring-neutral-200/70">
      <Tool label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={17} /></Tool>
      <Tool label="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 size={17} /></Tool>
      <Sep />
      <Tool label="Steps" onClick={() => c().insertSteps().run()}><Waypoints size={17} /></Tool>
      <Tool label="Checklist" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}><ListChecks size={17} /></Tool>
      <Tool label="Callout" active={editor.isActive('callout')} onClick={() => (editor.isActive('callout') ? c().lift('callout').run() : c().setCallout('info').run())}><Info size={17} /></Tool>
      <Tool label="Collapsible section" active={editor.isActive('collapsible')} onClick={() => c().setCollapsible().run()}><FoldVertical size={17} /></Tool>
      <Tool label="Table" disabled={editor.isActive('table')} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /></Tool>
      <Sep />
      <Tool label="Insert image" onClick={onImage}><ImagePlus size={17} /></Tool>
      <Tool label="Link to article" onClick={onArticle}><FileText size={17} /></Tool>
      <span className="ml-auto hidden pr-2 text-xs text-ink-muted sm:block">Type <kbd className="rounded bg-white px-1 font-sans ring-1 ring-neutral-200">/</kbd> for more</span>
    </div>
  );
}

function FormatBubble({ editor, onArticle }: { editor: Editor; onArticle: () => void }) {
  useTick(editor);
  const [linkMode, setLinkMode] = useState(false);
  const [href, setHref] = useState('');
  const c = () => editor.chain().focus();
  const applyLink = () => {
    const h = href.trim();
    const url = h && !/^[a-z][a-z0-9+.-]*:|^\//i.test(h) ? `https://${h}` : h;
    if (!url) c().extendMarkRange('link').unsetLink().run();
    else if (safeHref(url)) c().extendMarkRange('link').setLink({ href: url }).run();
    setLinkMode(false);
  };
  return (
    <BubbleMenu editor={editor} pluginKey="formatBubble" updateDelay={80}
      tippyOptions={{ duration: [180, 120], maxWidth: 'none', appendTo: () => document.body, onHidden: () => setLinkMode(false) }}
      shouldShow={({ editor: e, state }) => {
        const s = state.selection;
        return e.isEditable && !s.empty && !(s instanceof NodeSelection) && !e.isActive('codeBlock');
      }}>
      <div className="ed-bubble glass flex items-center gap-0.5 rounded-[14px] p-1">
        {linkMode ? (
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
            <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="Paste a web address" aria-label="Web address"
              onKeyDown={(e) => { if (e.key === 'Escape') { setLinkMode(false); editor.commands.focus(); } }}
              className="h-8 w-60 rounded-[9px] bg-white px-2.5 text-[13px] outline-none ring-1 ring-inset ring-neutral-200 focus:ring-primary/50" />
            <Tool label="Apply link" onClick={applyLink}><Check size={16} /></Tool>
            <Tool label="Cancel" onClick={() => setLinkMode(false)}><X size={16} /></Tool>
          </form>
        ) : (<>
          <Tool label="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><Bold size={16} /></Tool>
          <Tool label="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><Italic size={16} /></Tool>
          <Tool label="Underline" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><UnderlineIcon size={16} /></Tool>
          <Tool label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><Strikethrough size={16} /></Tool>
          <Tool label="Highlight" active={editor.isActive('highlight')} onClick={() => c().toggleHighlight().run()}><Highlighter size={16} /></Tool>
          <Tool label="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()}><Code size={16} /></Tool>
          <Sep />
          <Tool label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Tool>
          <Tool label="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Tool>
          <Sep />
          {editor.isActive('link')
            ? <Tool label="Remove web link" onClick={() => c().extendMarkRange('link').unsetLink().run()}><Unlink size={16} /></Tool>
            : <Tool label="Web link" onClick={() => { setHref(String(editor.getAttributes('link').href ?? '')); setLinkMode(true); }}><Link2 size={16} /></Tool>}
          <Tool label="Link to article" onClick={onArticle}><FileText size={16} /></Tool>
        </>)}
      </div>
    </BubbleMenu>
  );
}

function TableBubble({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  return (
    <BubbleMenu editor={editor} pluginKey="tableBubble" updateDelay={80} tippyOptions={{ placement: 'top-start', maxWidth: 'none', duration: [180, 120], appendTo: () => document.body }}
      shouldShow={({ editor: e, state }) => e.isEditable && state.selection.empty && e.isActive('table')}>
      <div className="ed-bubble glass flex items-center gap-0.5 rounded-[14px] p-1 text-[12.5px]">
        <Tool label="Add row below" onClick={() => c().addRowAfter().run()}><Rows3 size={15} /><span className="ml-1">+ Row</span></Tool>
        <Tool label="Add column right" onClick={() => c().addColumnAfter().run()}><Columns3 size={15} /><span className="ml-1">+ Column</span></Tool>
        <Sep />
        <Tool label="Delete row" onClick={() => c().deleteRow().run()}><span>− Row</span></Tool>
        <Tool label="Delete column" onClick={() => c().deleteColumn().run()}><span>− Column</span></Tool>
        <Tool label="Toggle header row" onClick={() => c().toggleHeaderRow().run()}><span>Header</span></Tool>
        <Sep />
        <Tool label="Delete table" onClick={() => c().deleteTable().run()}><Trash2 size={15} className="text-danger" /></Tool>
      </div>
    </BubbleMenu>
  );
}

/** "/" command palette anchored at the caret. Keyboard handled by capturing keydown on the editor DOM. */
function SlashMenu({ editor, ctx }: { editor: Editor; ctx: { pickImage: () => void; pickArticle: () => void } }) {
  useTick(editor);
  const [active, setActive] = useState(0);
  const dismissed = useRef<number | null>(null);
  const s = editor.isFocused ? slashState(editor.state) : null;
  const items = s ? filterSlashItems(s.query) : [];
  const open = !!s && items.length > 0 && dismissed.current !== s.range.from;
  if (!s) dismissed.current = null;
  const state = useRef({ open, items, active, s }); state.current = { open, items, active, s };
  useEffect(() => setActive(0), [s?.query]);

  const run = (item: SlashItem) => { const cur = state.current.s; if (cur) applySlashItem(editor, item, cur.range, ctx); };

  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      const st = state.current;
      if (!st.open) return;
      const n = st.items.length;
      if (e.key === 'ArrowDown') setActive((a) => (a + 1) % n);
      else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + n) % n);
      else if (e.key === 'Enter' || e.key === 'Tab') run(st.items[Math.min(st.active, n - 1)]!);
      else if (e.key === 'Escape') { dismissed.current = st.s!.range.from; setActive(0); editor.view.dispatch(editor.state.tr); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  if (!open) return null;
  let pos = { left: 0, top: 0 };
  try { const r = editor.view.coordsAtPos(s!.range.from); pos = { left: r.left, top: r.bottom + 8 }; } catch { /* jsdom has no layout */ }
  const flip = typeof window !== 'undefined' && pos.top + 360 > window.innerHeight;

  return (
    <div className="glass fixed z-40 w-[300px] overflow-hidden rounded-[16px] animate-menu-in"
      style={{ left: Math.min(pos.left, window.innerWidth - 316), ...(flip ? { bottom: window.innerHeight - pos.top + 32 } : { top: pos.top }) }}>
      <p className="px-3.5 pb-1 pt-2.5 text-xs font-medium text-ink-muted">{s!.query ? `Blocks matching “${s!.query}”` : 'Insert a block'}</p>
      <ul ref={listRef} role="listbox" aria-label="Insert block" className="max-h-[300px] overflow-y-auto p-1.5">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <li key={it.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); run(it); }}
              className={clsx('flex cursor-pointer items-center gap-3 rounded-[11px] px-2 py-1.5 transition-colors', i === active ? 'bg-primary-soft' : '')}>
              <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset transition-colors',
                i === active ? 'bg-white text-primary ring-primary/15' : 'bg-white text-neutral-500 ring-neutral-200')}>
                <Icon size={16} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-neutral-900">{it.label}</span>
                <span className="block truncate text-xs text-ink-muted">{it.hint}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
