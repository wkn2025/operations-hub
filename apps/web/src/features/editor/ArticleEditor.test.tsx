import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { mockFetch, renderApp } from '../../test/utils';
import { ArticleEditor, ImageAltForm, RovingToolbar, useArticleEditor } from './ArticleEditor';

let ed: Editor;
function Harness({ text = '' }: { text?: string }) {
  ed = useArticleEditor({
    content: { type: 'doc', content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }] },
    editable: true, onChange: () => {}, onBlur: () => {}, onUploadError: () => {}, onUploadBusy: () => {},
  });
  return <ArticleEditor editor={ed} />;
}

describe('slash menu accessibility', () => {
  it('exposes combobox semantics on the editor while the menu is open', async () => {
    mockFetch({ '/api/articles?': { articles: [] } });
    renderApp(<Harness text="/" />);
    act(() => { ed.commands.focus('end'); });
    const dom = ed.view.dom;
    const list = await screen.findByRole('listbox', { name: 'Insert block' });
    expect(dom.getAttribute('role')).toBe('combobox');
    expect(dom.getAttribute('aria-expanded')).toBe('true');
    expect(dom.getAttribute('aria-controls')).toBe(list.id);
    const active = dom.getAttribute('aria-activedescendant')!;
    expect(document.getElementById(active)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(dom, { key: 'ArrowDown' });
    expect(dom.getAttribute('aria-activedescendant')).not.toBe(active);
    // IME composition: keys belong to the input method, not the menu
    const before = dom.getAttribute('aria-activedescendant');
    fireEvent.keyDown(dom, { key: 'ArrowDown', isComposing: true });
    expect(dom.getAttribute('aria-activedescendant')).toBe(before);
    fireEvent.keyDown(dom, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull();
    expect(dom.getAttribute('role')).toBe('textbox');
    expect(dom.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('Ctrl+Shift+K opens the article link picker', async () => {
    mockFetch({ '/api/articles?': { articles: [] } });
    renderApp(<Harness text="hello" />);
    act(() => { ed.commands.focus('end'); });
    fireEvent.keyDown(ed.view.dom, { key: 'K', ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole('combobox', { name: 'Link to an article' })).toBeInTheDocument();
  });
});

describe('RovingToolbar', () => {
  it('moves focus with arrows/Home/End and returns on Escape', () => {
    const onEscape = vi.fn();
    render(<RovingToolbar label="Format" onEscape={onEscape}><button>A</button><button>B</button><button>C</button></RovingToolbar>);
    const [a, b, c] = screen.getAllByRole('button');
    expect(screen.getByRole('toolbar', { name: 'Format' })).toBeInTheDocument();
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowRight' }); expect(b).toHaveFocus();
    fireEvent.keyDown(b!, { key: 'End' }); expect(c).toHaveFocus();
    fireEvent.keyDown(c!, { key: 'ArrowRight' }); expect(a).toHaveFocus(); // wraps
    fireEvent.keyDown(a!, { key: 'ArrowLeft' }); expect(c).toHaveFocus();
    fireEvent.keyDown(c!, { key: 'Escape' }); expect(onEscape).toHaveBeenCalled();
    // only one tab stop
    expect([a, b, c].filter((x) => x!.tabIndex === 0)).toHaveLength(1);
  });
});

describe('ImageAltForm', () => {
  it('warns when the description is missing and reports edits', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ImageAltForm alt="" onChange={onChange} />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Image description'), 'E');
    expect(onChange).toHaveBeenLastCalledWith('E');
    rerender(<ImageAltForm alt="EDI monitor" onChange={onChange} />);
    expect(screen.queryByText(/no description/i)).toBeNull();
  });
});

describe('image description', () => {
  it('editing the description in the image bubble updates the image alt', async () => {
    mockFetch({ '/api/articles?': { articles: [] } });
    function ImgHarness() {
      ed = useArticleEditor({
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }, { type: 'image', attrs: { src: '/api/files/f1', alt: '' } }] },
        editable: true, onChange: () => {}, onBlur: () => {}, onUploadError: () => {}, onUploadBusy: () => {},
      });
      return <ArticleEditor editor={ed} />;
    }
    renderApp(<ImgHarness />);
    act(() => { ed.commands.setNodeSelection(3); ed.commands.focus(); });
    const input = await screen.findByLabelText('Image description');
    fireEvent.change(input, { target: { value: 'EDI monitor' } });
    const img = (ed.getJSON().content as { type: string; attrs?: { alt?: string } }[]).find((n) => n.type === 'image')!;
    expect(img.attrs?.alt).toBe('EDI monitor');
  });
});
