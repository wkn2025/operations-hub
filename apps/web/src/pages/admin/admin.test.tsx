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

function stub(role: string, patchResponse?: { status: number; body: unknown }) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url === '/api/me') return json(me(role));
    if (init?.method === 'PATCH' && patchResponse) return json(patchResponse.body, patchResponse.status);
    if (url === '/api/admin/users') return json({ users });
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
});
