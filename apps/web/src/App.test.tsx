import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { renderApp, mockFetch } from './test/utils';

const me = { user: { id: 'u1', email: 'v@demo.test', name: 'Demo Viewer', role: 'viewer' }, authMode: 'dev', demo: true };
const base = { '/api/me': me, '/api/categories': { categories: [] }, '/api/auth/dev/users': { users: [] } };

describe('session and error states', () => {
  it('a 401 from any query sends the user to /login with the full path as next', async () => {
    mockFetch({ ...base, '/api/articles/x': { __status: 401 }, '/api/articles?': { articles: [] } });
    renderApp(<App />, '/article/x?tab=1#steps');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/login?next=${encodeURIComponent('/article/x?tab=1#steps')}`));
  });

  it('a 5xx on the article shows an error panel with retry (not "not found")', async () => {
    const fetch = mockFetch({ ...base, '/api/articles/x': { __status: 500 }, '/api/articles?': { articles: [] } });
    renderApp(<App />, '/article/x');
    expect(await screen.findByText(/Couldn.t load this article/)).toBeInTheDocument();
    const n = fetch.mock.calls.filter(([u]) => String(u).startsWith('/api/articles/x')).length;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetch.mock.calls.filter(([u]) => String(u).startsWith('/api/articles/x')).length).toBeGreaterThan(n));
  });

  it('a 404 article shows the not-available page', async () => {
    mockFetch({ ...base, '/api/articles/missing': { __status: 404 }, '/api/articles?': { articles: [] } });
    renderApp(<App />, '/article/missing');
    expect(await screen.findByText(/isn.t available/)).toBeInTheDocument();
  });

  it('home shows an error panel when the article list fails', async () => {
    mockFetch({ ...base, '/api/articles?': { __status: 503 } });
    renderApp(<App />, '/');
    expect(await screen.findByText(/Couldn.t load articles/)).toBeInTheDocument();
  });

  it('an unreachable /api/me is not treated as logged out', async () => {
    mockFetch({ '/api/me': { __status: 502 } });
    renderApp(<App />, '/');
    expect(await screen.findByText(/Can.t reach the server/)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
