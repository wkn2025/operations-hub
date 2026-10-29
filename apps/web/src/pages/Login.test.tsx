import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFetch, renderApp } from '../test/utils';
import { Login } from './Login';

describe('Login (Entra ID mode)', () => {
  it('passes next to the SSO login and explains a failed sign-in', async () => {
    mockFetch({ '/api/me': { user: null, authMode: 'oidc', demo: false } });
    renderApp(<Login />, `/login?error=deactivated&next=${encodeURIComponent('/admin/users')}`);
    const link = await screen.findByRole('link', { name: /Sign in with Microsoft/ });
    expect(link).toHaveAttribute('href', `/api/auth/login?next=${encodeURIComponent('/admin/users')}`);
    expect(screen.getByRole('alert')).toHaveTextContent(/deactivated/i);
  });

  it('no next and no error: plain link, no alert; unsafe next is dropped', async () => {
    mockFetch({ '/api/me': { user: null, authMode: 'oidc', demo: false } });
    renderApp(<Login />, '/login?next=//evil.example');
    expect(await screen.findByRole('link', { name: /Sign in with Microsoft/ })).toHaveAttribute('href', '/api/auth/login');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example'])('drops unsafe next %j (same rule as the server)', async (next) => {
    mockFetch({ '/api/me': { user: null, authMode: 'oidc', demo: false } });
    renderApp(<Login />, `/login?next=${encodeURIComponent(next)}`);
    expect(await screen.findByRole('link', { name: /Sign in with Microsoft/ })).toHaveAttribute('href', '/api/auth/login');
  });
});
