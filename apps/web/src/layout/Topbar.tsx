import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Eye, FlaskConical, LogOut, Search, Users } from 'lucide-react';
import { api, type Me } from '../api/client';
import { isMac, useSearch } from '../features/search/SearchDialog';
import { Kbd } from '../components/ui/primitives';
import { initials } from '../lib/text';
import { STATIC_DEMO } from '../static/demo';

const ROLE: Record<string, { label: string; can: string }> = {
  admin: { label: 'Admin', can: 'Manages users, categories and settings.' },
  editor: { label: 'Editor', can: 'Writes and publishes articles.' },
  viewer: { label: 'Viewer', can: 'Reads published articles.' },
};

export function Topbar({ me }: { me: Me }) {
  const { setOpen } = useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = me.user!;
  const role = ROLE[user.role] ?? ROLE.viewer!;

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="sticky top-0 z-20 -mx-3 bg-gradient-to-b from-white via-white/85 to-white/0 px-3 pb-4 pt-3">
    <header className="glass flex h-14 items-center gap-3 rounded-[18px] pl-2 pr-2">
      <button type="button" onClick={() => setOpen(true)}
        className="group flex h-10 w-full min-w-0 max-w-[440px] items-center gap-3 rounded-[12px] px-3 text-left text-[14px] text-ink-muted transition-colors hover:bg-white/90 hover:text-neutral-600">
        <Search size={17} strokeWidth={2} className="shrink-0 text-neutral-400 transition-colors group-hover:text-primary" aria-hidden />
        <span className="flex-1 truncate">Search articles, clients, error codes…</span>
        <span className="hidden items-center gap-1 sm:flex" aria-hidden><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
        <span className="sr-only">Open search ({isMac ? 'Command' : 'Control'} K)</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {STATIC_DEMO && (
          <span title="A read-only snapshot of the demo content. Editing, sign-in and admin need the real server."
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink ring-1 ring-inset ring-accent/50 sm:inline-flex">
            <Eye size={13} aria-hidden /> Read-only demo
          </span>
        )}
        {me.demo && (
          <span title="Demo sign-in is on: anyone can pick any user. Production uses Microsoft Entra ID."
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink ring-1 ring-inset ring-accent/50 sm:inline-flex">
            <FlaskConical size={13} aria-hidden /> Demo auth
          </span>
        )}
        <Menu.Root>
          <Menu.Trigger className="flex items-center gap-2.5 rounded-[12px] py-1.5 pl-1.5 pr-2.5 text-left transition-colors hover:bg-white/90 data-[state=open]:bg-white">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-xs font-semibold text-white">{initials(user.name)}</span>
            <span className="hidden leading-tight md:block">
              <span className="block whitespace-nowrap text-[13px] font-medium text-neutral-900">{user.name}</span>
              <span className="block text-xs text-neutral-500">{role.label}</span>
            </span>
            <ChevronDown size={14} className="text-neutral-400" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={10}
              className="glass z-40 w-72 origin-top-right rounded-[16px] !bg-white/95 p-1.5 data-[state=open]:animate-menu-in">
              <div className="px-3 pb-3 pt-2.5">
                <p className="text-sm font-semibold text-neutral-900">{user.name}</p>
                <p className="truncate text-xs text-neutral-500">{user.email}</p>
                <p className="mt-2.5 flex items-center gap-2 text-xs text-neutral-600">
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">{role.label}</span>{role.can}
                </p>
                {me.demo && <p className="mt-2.5 rounded-[10px] bg-accent-soft px-2.5 py-2 text-xs leading-relaxed text-accent-ink">Demo sign-in. Production uses Microsoft Entra ID.</p>}
              </div>
              <Menu.Separator className="mx-2 my-1 h-px bg-neutral-200/80" />
              {me.demo && (
                <Menu.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100">
                  <Users size={15} aria-hidden /> Switch demo user
                </Menu.Item>
              )}
              {STATIC_DEMO ? (
                <p className="px-3 py-2 text-xs leading-relaxed text-neutral-600">Read-only snapshot: nothing you do here is saved.</p>
              ) : (
                <Menu.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100">
                  <LogOut size={15} aria-hidden /> Sign out
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </header>
    </div>
  );
}
