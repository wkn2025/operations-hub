import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient';
import { vi } from 'vitest';

/** Shows the current path so tests can assert navigation. */
export function LocationProbe() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search + l.hash}</output>;
}

export function renderApp(ui: ReactElement, route = '/') {
  const qc = createQueryClient({ retry: false });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="*" element={<>{ui}<LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** fetch stub: first matching url prefix wins; unmatched -> 404. */
export function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    const raw = routes[key];
    const body = typeof raw === 'function' ? (raw as (u: string) => unknown)(url) : raw;
    const status = (body as { __status?: number } | null)?.__status ?? 200; // { __status: 500 } simulates an error response
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
