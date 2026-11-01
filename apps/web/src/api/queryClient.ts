import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { HttpError, type Me } from './client';

/**
 * One place for query defaults and the session-expiry rule: any 401 (outside /api/me itself) marks the session as
 * signed out; Shell then redirects to /login?next=<current location>.
 */
export function createQueryClient(queries: DefaultOptions['queries'] = {}) {
  const onError = (e: unknown, key?: readonly unknown[]) => {
    if (e instanceof HttpError && e.status === 401 && key?.[0] !== 'me') {
      qc.setQueryData<Me>(['me'], (old) => (old ? { ...old, user: null } : old));
    }
  };
  const qc: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (e, q) => onError(e, q.queryKey) }),
    mutationCache: new MutationCache({ onError: (e) => onError(e) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000, refetchOnWindowFocus: false,
        retry: (n, e) => !(e instanceof HttpError && e.status < 500) && n < 2,
        ...queries,
      },
    },
  });
  return qc;
}
