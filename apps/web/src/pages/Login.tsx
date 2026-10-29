import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react';
import { api, useSession } from '../api/client';
import { Logo } from '../layout/Sidebar';
import { Unreachable } from '../layout/Shell';
import { initials } from '../lib/text';

const ROLE_OF: Record<string, { role: string; can: string }> = {
  'admin@demo.test': { role: 'Admin', can: 'Manages users, categories and settings' },
  'editor@demo.test': { role: 'Editor', can: 'Writes and publishes articles' },
  'viewer@demo.test': { role: 'Viewer', can: 'Reads published articles' },
};

export function Login() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const demo = session.data?.authMode === 'dev';
  const users = useQuery({ queryKey: ['dev-users'], enabled: demo, queryFn: () => api<{ users: { email: string; name: string }[] }>('/api/auth/dev/users').then((r) => r.users) });

  if (session.data?.user) return <Navigate to={target} replace />;
  if (session.isError && !session.data) return <Unreachable onRetry={() => session.refetch()} retrying={session.isFetching} />;

  const login = async (email: string) => {
    setBusy(email); setError(null);
    try {
      await api('/api/auth/dev/login', { method: 'POST', json: { email } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(target, { replace: true });
    } catch {
      setError('Sign-in failed. The account may be deactivated; try another demo user.');
    } finally { setBusy(null); }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-[440px] animate-rise">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div className="leading-tight">
            <p className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Operations Hub</p>
            <p className="text-[13px] text-neutral-500">Operational knowledge, in one place</p>
          </div>
        </div>

        <div className="glass mt-8 rounded-[22px] !bg-white/85 p-7">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">Sign in</h1>
          {session.isPending && <p className="mt-2 text-sm text-neutral-500">Checking your session…</p>}

          {session.data?.authMode === 'oidc' && (
            <>
              <p className="mt-1.5 text-[15px] text-neutral-500">Use your company Microsoft account.</p>
              <a href="/api/auth/login" className="mt-6 flex h-11 items-center justify-center gap-2 rounded-[12px] bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-hover">
                <ShieldCheck size={17} aria-hidden /> Sign in with Microsoft
              </a>
            </>
          )}

          {demo && (
            <>
              <p className="mt-1.5 text-[15px] text-neutral-500">Pick a demo user. Each one sees the hub with a different role.</p>
              <ul className="mt-6 space-y-2">
                {(users.data ?? []).map((u) => {
                  const r = ROLE_OF[u.email];
                  return (
                    <li key={u.email}>
                      <button type="button" disabled={!!busy} onClick={() => login(u.email)}
                        className={clsx('group flex w-full items-center gap-3.5 rounded-[16px] bg-white px-3.5 py-3 text-left ring-1 ring-neutral-200 transition-[box-shadow,transform,background-color] duration-200 ease-out',
                          'hover:-translate-y-px hover:shadow-md hover:ring-primary/25 disabled:opacity-60', busy === u.email && 'ring-primary/40')}>
                        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-[13px] font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                          {initials(u.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[15px] font-medium text-neutral-900">{u.name}</span>
                            {r && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{r.role}</span>}
                          </span>
                          <span className="block truncate text-[13px] text-neutral-500">{r?.can ?? u.email}</span>
                        </span>
                        {busy === u.email
                          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-label="Signing in" />
                          : <ArrowRight size={17} className="text-neutral-300 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && <p role="alert" className="mt-4 rounded-[12px] bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            </>
          )}
        </div>

        {demo && (
          <p className="mt-5 flex items-start gap-2.5 px-1 text-[13px] leading-relaxed text-neutral-500">
            <FlaskConical size={15} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            Demo sign-in is enabled, so anyone can choose any user. Production uses Microsoft Entra ID and this screen is replaced.
          </p>
        )}
      </div>
    </div>
  );
}
