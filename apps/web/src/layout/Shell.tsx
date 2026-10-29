import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { useCategories, useSession } from '../api/client';
import { SearchDialog, SearchProvider } from '../features/search/SearchDialog';
import { Sidebar, SIDEBAR_W, useSidebarCollapsed } from './Sidebar';
import { Topbar } from './Topbar';

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
  if (!session.data?.user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;

  return (
    <SearchProvider>
      <ActiveCategory.Provider value={setActiveCat}>
        <a href="#main" className="sr-only z-50 rounded-md bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <Sidebar categories={cats.data ?? []} activeCategoryId={activeCat} collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <motion.div initial={false} animate={{ paddingLeft: (collapsed ? SIDEBAR_W.closed : SIDEBAR_W.open) + 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }} className="min-h-screen">
          <div className="mx-auto max-w-[1180px] px-8">
            <Topbar me={session.data} />
            <main id="main" className="pb-28 pt-4">
              <Outlet />
            </main>
          </div>
        </motion.div>
        <SearchDialog />
      </ActiveCategory.Provider>
    </SearchProvider>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
    </div>
  );
}
