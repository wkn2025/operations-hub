import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import { ChevronRight, House, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Category } from '../api/client';
import { categoryIcon } from '../components/ui/primitives';
import { usePref } from '../lib/prefs';

export const SIDEBAR_W = { open: 272, closed: 76 };
export const SIDEBAR_PREF = 'ops.sidebarCollapsed';
const spring = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const;

export function useSidebarCollapsed() { return usePref(SIDEBAR_PREF, false); }

export function Sidebar({ categories, activeCategoryId, collapsed: collapsedProp, onCollapsedChange }: {
  categories: Category[]; activeCategoryId?: string | null; collapsed?: boolean; onCollapsedChange?: (v: boolean) => void;
}) {
  const [prefCollapsed, setPref] = useSidebarCollapsed();
  const collapsed = collapsedProp ?? prefCollapsed;
  const setCollapsed = (v: boolean) => { setPref(v); onCollapsedChange?.(v); };
  const { pathname } = useLocation();

  const tops = useMemo(() => categories.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [categories]);
  const kids = (id: string) => categories.filter((c) => c.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const routeSlug = /^\/category\/([^/]+)/.exec(pathname)?.[1];
  const active = categories.find((c) => c.slug === routeSlug)?.id ?? activeCategoryId ?? null;
  const activeTop = active ? topOf(categories, active) : null;

  const [open, setOpen] = useState<Set<string>>(() => new Set(activeTop ? [activeTop] : []));
  useEffect(() => { if (activeTop) setOpen((s) => (s.has(activeTop) ? s : new Set(s).add(activeTop))); }, [activeTop]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
      <motion.nav aria-label="Primary" data-collapsed={collapsed} initial={false}
        animate={{ width: collapsed ? SIDEBAR_W.closed : SIDEBAR_W.open }} transition={spring}
        className="glass fixed bottom-3 left-3 top-3 z-30 flex flex-col overflow-hidden rounded-[20px]">
        <div className="flex h-16 shrink-0 items-center gap-3 px-[18px]">
          <Logo />
          <Fade show={!collapsed}>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">Operations Hub</p>
              <p className="text-xs text-neutral-500">Knowledge base</p>
            </div>
          </Fade>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-1">
          <NavItem to="/" label="Home" icon={<House size={18} strokeWidth={1.8} />} active={pathname === '/'} collapsed={collapsed} />
          <Fade show={!collapsed}>
            <p className="mb-1 mt-5 px-3 text-xs font-medium text-neutral-400">Categories</p>
          </Fade>
          {collapsed && <div className="mx-3 my-3 h-px bg-neutral-200/70" />}
          <ul className="space-y-0.5">
            {tops.map((c) => {
              const Icon = categoryIcon(c.name);
              const children = kids(c.id);
              const isOpen = open.has(c.id) && !collapsed;
              return (
                <li key={c.id}>
                  <NavItem to={`/category/${c.slug}`} label={c.name} icon={<Icon size={18} strokeWidth={1.8} />} active={active === c.id}
                    within={activeTop === c.id && active !== c.id} collapsed={collapsed}
                    trailing={children.length > 0 && !collapsed ? (
                      <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} subcategories of ${c.name}`}
                        className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700">
                        <ChevronRight size={14} className={clsx('transition-transform duration-300 ease-out', isOpen && 'rotate-90')} />
                      </button>
                    ) : null} />
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={spring} className="relative ml-[26px] overflow-hidden pl-[3px]">
                        <span aria-hidden className="absolute bottom-2 left-[3px] top-1 w-px bg-neutral-200" />
                        {children.map((s) => (
                          <li key={s.id} className="pl-3 first:pt-0.5 last:pb-1">
                            <Link to={`/category/${s.slug}`} aria-current={active === s.id ? 'page' : undefined}
                              className={clsx('relative block rounded-[9px] px-2.5 py-1.5 text-[13px] leading-snug transition-colors',
                                active === s.id ? 'bg-primary-soft font-medium text-primary' : 'text-neutral-600 hover:bg-white/80 hover:text-neutral-900')}>
                              {active === s.id && <ActiveMarker className="-left-[14px] !rounded-full" />}
                              {s.name}
                            </Link>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-neutral-200/60 p-3">
          <Tip label="Expand sidebar" show={collapsed}>
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-10 w-full items-center gap-3 rounded-[12px] px-[14px] text-sm text-neutral-500 transition-colors hover:bg-white/80 hover:text-neutral-900">
              {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.8} className="shrink-0" /> : <PanelLeftClose size={18} strokeWidth={1.8} className="shrink-0" />}
              <Fade show={!collapsed}><span>Collapse</span></Fade>
            </button>
          </Tip>
        </div>
      </motion.nav>
    </Tooltip.Provider>
  );
}

function topOf(cats: Category[], id: string): string {
  const byId = new Map(cats.map((c) => [c.id, c]));
  let c = byId.get(id);
  for (let n = 0; c?.parentId && n < 50; n++) c = byId.get(c.parentId);
  return c?.id ?? id;
}

function NavItem({ to, label, icon, active, within, collapsed, trailing }: {
  to: string; label: string; icon: ReactNode; active: boolean; within?: boolean; collapsed: boolean; trailing?: ReactNode;
}) {
  return (
    <Tip label={label} show={collapsed}>
      <div className={clsx('group relative flex items-center rounded-[12px] transition-colors',
        active ? 'bg-primary-soft text-primary' : within ? 'text-neutral-900' : 'text-neutral-600 hover:bg-white/80 hover:text-neutral-900')}>
        {active && <ActiveMarker className="-left-3" />}
        <Link to={to} aria-current={active ? 'page' : undefined} aria-label={collapsed ? label : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-[14px] py-2 text-[13.5px] font-medium">
          <span className={clsx('shrink-0 transition-colors', active || within ? 'text-primary' : 'text-neutral-400 group-hover:text-neutral-600')}>{icon}</span>
          <Fade show={!collapsed} wrap><span className="block leading-snug">{label}</span></Fade>
        </Link>
        {trailing}
      </div>
    </Tip>
  );
}

/** The small lime marker; one shared layoutId so it glides between items. */
function ActiveMarker({ className }: { className?: string }) {
  return <motion.span layoutId="nav-active" aria-hidden transition={{ type: 'spring', stiffness: 500, damping: 40 }}
    className={clsx('absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent', className)} />;
}

function Fade({ show, wrap, children }: { show: boolean; wrap?: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.18 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
          className={clsx('min-w-0', !wrap && 'whitespace-nowrap')}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Tip({ label, show, children }: { label: string; show: boolean; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={14} className="z-50 rounded-[9px] bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="shrink-0">
      <rect width="34" height="34" rx="10" fill="var(--color-primary)" />
      <path d="M10 11.5h9.5M10 17h14M10 22.5h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23.5" cy="11.5" r="2.6" fill="var(--color-accent)" />
    </svg>
  );
}
