import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import type { Category } from '../api/client';
import { renderApp } from '../test/utils';

const cats: Category[] = [
  { id: 'c1', parentId: null, name: 'EDI & Automation', slug: 'edi-automation', description: null, sortOrder: 0, archived: false, path: 'EDI & Automation' },
  { id: 'c2', parentId: 'c1', name: 'Inbound claims (837)', slug: 'inbound-claims-837', description: null, sortOrder: 0, archived: false, path: 'EDI & Automation / Inbound claims (837)' },
  { id: 'c3', parentId: null, name: 'Glossary & Acronyms', slug: 'glossary-acronyms', description: null, sortOrder: 1, archived: false, path: 'Glossary & Acronyms' },
];

describe('Sidebar', () => {
  it('renders the category tree and expands subcategories', async () => {
    renderApp(<Sidebar categories={cats} />, '/');
    expect(screen.getByRole('link', { name: 'EDI & Automation' })).toHaveAttribute('href', '/category/edi-automation');
    expect(screen.queryByRole('link', { name: 'Inbound claims (837)' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show subcategories of EDI & Automation' }));
    expect(screen.getByRole('link', { name: 'Inbound claims (837)' })).toBeInTheDocument();
  });

  it('marks the active category and auto-expands its parent', () => {
    renderApp(<Sidebar categories={cats} />, '/category/inbound-claims-837');
    expect(screen.getByRole('link', { name: 'Inbound claims (837)' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides archived categories; Admin link only for admins', () => {
    const { unmount } = renderApp(<Sidebar categories={[...cats, { ...cats[2]!, id: 'c4', name: 'Old stuff', slug: 'old', archived: true }]} />, '/');
    expect(screen.queryByRole('link', { name: 'Old stuff' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    unmount();
    renderApp(<Sidebar categories={cats} isAdmin />, '/');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('collapse state persists in localStorage (UI preference only)', async () => {
    const { unmount } = renderApp(<Sidebar categories={cats} />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(localStorage.getItem('ops.sidebarCollapsed')).toBe('true');
    expect(screen.getByRole('navigation')).toHaveAttribute('data-collapsed', 'true');
    unmount();
    renderApp(<Sidebar categories={cats} />);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveAttribute('data-collapsed', 'true');
  });
});
