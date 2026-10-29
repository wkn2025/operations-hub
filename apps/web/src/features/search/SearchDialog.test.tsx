import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchDialog, SearchProvider } from './SearchDialog';
import { renderApp, mockFetch } from '../../test/utils';

const results = {
  groups: [
    { kind: 'article', hits: [
      { id: 'a1', title: 'EDI claim failed to import', snippet: 'missing <mark>GOP</mark> &lt;b&gt;', categoryPath: 'Troubleshooting Center / EDI issues' },
      { id: 'a2', title: 'Register an invoice', snippet: 'check the <mark>GOP</mark>', categoryPath: 'Work Instructions' },
    ] },
    { kind: 'glossary', hits: [{ id: 'g1', title: 'GOP (Guarantee of Payment)', snippet: '<mark>GOP</mark>', categoryPath: 'Glossary & Acronyms' }] },
  ],
};

const setup = () => {
  const fetch = mockFetch({ '/api/search': results });
  renderApp(<SearchProvider><SearchDialog /></SearchProvider>);
  return fetch;
};

describe('SearchDialog', () => {
  it('opens on Ctrl+K and Cmd+K, closes on Escape', async () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('queries the API, groups results and highlights <mark> safely', async () => {
    const fetch = setup();
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'gop');
    expect(await screen.findByRole('option', { name: /EDI claim failed to import/ })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes('/api/search?q=gop'))).toBe(true);
    expect(screen.getByRole('group', { name: 'Articles' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Glossary' })).toBeInTheDocument();
    const marks = document.querySelectorAll('[role=listbox] mark');
    expect(marks.length).toBe(3);
    expect(marks[0].textContent).toBe('GOP');
    expect(document.querySelector('[role=listbox] b')).toBeNull(); // escaped markup stays text
    expect(screen.getByText(/<b>/)).toBeInTheDocument();
  });

  it('arrow keys move the selection and Enter navigates to the article', async () => {
    setup();
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'gop');
    const first = await screen.findByRole('option', { name: /EDI claim failed/ });
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: /Guarantee of Payment/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}'); // wraps
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/article/g1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a no-results state and remembers recent searches', async () => {
    mockFetch({ '/api/search?q=zzz': { groups: [] }, '/api/search': results });
    renderApp(<SearchProvider><SearchDialog /></SearchProvider>);
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(await screen.findByText(/No matches for/)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'gop');
    await screen.findByRole('option', { name: /EDI claim failed/ });
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('button', { name: 'gop' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ops.recentSearches')!)).toContain('gop');
  });
});
