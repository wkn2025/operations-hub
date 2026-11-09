import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { isEditorRole, useCategories, useSession } from '../api/client';
import { SearchDialog, SearchProvider } from '../features/search/SearchDialog';
import { Sidebar, SIDEBAR_W, useSidebarCollapsed } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorState } from '../components/ui/ErrorState';
import { STATIC_DEMO } from '../static/demo';
import { ReadOnlyNotice } from '../static/ReadOnlyNotice';

/** Pages tell the sidebar which category they belong to (e.g. an article's category). */
const ActiveCategory = createContext<(id: string | null) => void>(() => {});
export function useActiveCategory(id: string | null | undefined) {
  const set = useContext(ActiveCategory);
  useEffect(() => { set(id ?? null); return () => set(null); }, [id, set]);
}

export function Shell() {
  const session = useSession();
  const cats = useCategories();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const loc = useLocation();

  if (session.isPending) return <Splash />;
  // network/5xx on /api/me is not "signed out": keep the user where they are and offer a retry
  if (session.isError && !session.data) return <Unreachable onRetry={() => session.refetch()} retrying={session.isFetching} />;
  if (!session.data?.user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search + loc.hash)}`} replace />;

  return (
    <SearchProvider>
      <ActiveCategory.Provider value={setActiveCat}>
        {/* focus by script: in the hash-routed Pages demo "#main" would be a route */}
        <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only z-50 rounded-md bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <Sidebar categories={cats.data ?? []} activeCategoryId={activeCat} collapsed={collapsed} onCollapsedChange={setCollapsed} canEdit={isEditorRole(session.data.user.role)} isAdmin={session.data.user.role === 'admin'} />
        <motion.div initial={false} animate={{ paddingLeft: (collapsed ? SIDEBAR_W.closed : SIDEBAR_W.open) + 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }} className="min-h-screen">
          <div className="mx-auto max-w-[1180px] px-8">
            <Topbar me={session.data} />
            <main id="main" tabIndex={-1} className="pb-28 pt-4 focus:outline-none">
              <Outlet />
            </main>
          </div>
        </motion.div>
        <SearchDialog />
        {STATIC_DEMO && <ReadOnlyNotice />}
      </ActiveCategory.Provider>
    </SearchProvider>
  );
}

export function Unreachable({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ErrorState title="Can’t reach the server" detail="Operations Hub could not check your session. Your work is not lost; try again in a moment." onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
    </div>
  );
}
