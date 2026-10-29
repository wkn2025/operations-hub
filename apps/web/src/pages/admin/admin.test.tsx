import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/utils';
import { Route, Routes } from 'react-router';
import AdminArea from '.';

// mounted the way App mounts it, so the nested section routes resolve
const Admin = () => <Routes><Route path="admin/*" element={<AdminArea />} /></Routes>;

const me = (role: string) => ({ user: { id: 'u1', email: `${role}@x.test`, name: role, role }, authMode: 'dev', demo: true });
const users = [{ id: 'u1', email: 'admin@x.test', name: 'Ada', role: 'admin', active: true, roleSetByAdmin: false, bootstrap: false, createdAt: '2026-01-01', lastLoginAt: null }];

function stub(role: string, patchResponse?: { status: number; body: unknown }, extra: Record<string, unknown> = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url === '/api/me') return json(me(role));
    if (init?.method === 'PATCH' && patchResponse) return json(patchResponse.body, patchResponse.status);
    if (url === '/api/admin/users') return json({ users });
    if (url in extra) return json(extra[url]);
    return json({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('admin area', () => {
  it('non-admins get a forbidden state and no admin API calls', async () => {
    const fn = stub('editor');
    renderApp(<Admin />, '/admin/users');
    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/users');
    expect(fn.mock.calls.some(([u]) => String(u).startsWith('/api/admin'))).toBe(false);
  });

  it('shows the last-admin 409 inside the user row and keeps the old role', async () => {
    const fn = stub('admin', { status: 409, body: { error: 'last_admin', message: 'cannot demote or deactivate the last active admin' } });
    renderApp(<Admin />, '/admin/users');
    const row = (await screen.findByText('admin@x.test')).closest('tr')!;
    await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for admin@x.test' }), 'viewer');
    expect(await within(row).findByRole('alert')).toHaveTextContent(/last active admin/);
    expect(within(row).getByRole('combobox', { name: 'Role for admin@x.test' })).toHaveValue('admin');
    const patch = fn.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/admin/users/u1');
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ role: 'viewer' });
  });

  it('rename: Escape and Cancel hand focus back to the Rename button', async () => {
    stub('admin', undefined, { '/api/categories': { categories: [{ id: 'k1', parentId: null, name: 'EDI', slug: 'edi', description: null, sortOrder: 0, archived: false, path: 'EDI' }] } });
    renderApp(<Admin />, '/admin/categories');
    const rename = await screen.findByRole('button', { name: 'Rename EDI' });
    await userEvent.click(rename);
    expect(screen.getByRole('textbox', { name: 'Category name' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Rename EDI' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Rename EDI' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Rename EDI' })).toHaveFocus();
  });

  it('files: Delete moves focus into the confirm group, Cancel returns it to Delete', async () => {
    stub('admin', undefined, { '/api/admin/files': { files: [{ id: 'f1', name: 'old.pdf', mime: 'application/pdf', size: 2048, uploadedBy: 'u1', createdAt: '2026-01-01', references: 0, url: '/api/files/f1' }] } });
    renderApp(<Admin />, '/admin/files');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete old.pdf' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Confirm deleting old.pdf' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete old.pdf' })).toHaveFocus();
  });

  it('articles page offers a real Export download (admin-only server route)', async () => {
    stub('admin', undefined, { '/api/articles?limit=200': { articles: [] }, '/api/categories': { categories: [] } });
    renderApp(<Admin />, '/admin/articles');
    const link = await screen.findByRole('link', { name: /Export all content/ });
    expect(link).toHaveAttribute('href', '/api/admin/export');
    expect(link).toHaveAttribute('download');
  });
});
