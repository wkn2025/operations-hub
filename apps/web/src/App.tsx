import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Shell } from './layout/Shell';
import { Home } from './pages/Home';
import { CategoryPage } from './pages/Category';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { ArticlePage } from './features/articles/ArticlePage';
import { FlowsPage } from './features/flows/FlowsPage';
import { FlowPage } from './features/flows/FlowPage';

// The editor (Tiptap) is only loaded by editors who open it.
const EditArticle = lazy(() => import('./pages/EditArticle').then((m) => ({ default: m.EditArticle })));

const EditFlow = lazy(() => import('./features/flows/FlowEditor').then((m) => ({ default: m.EditFlow })));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="category/:slug" element={<CategoryPage />} />
        <Route path="article/:slug" element={<ArticlePage />} />
        <Route path="edit/:id" element={<Suspense fallback={<p className="py-16 text-center text-sm text-ink-muted">Opening the editor…</p>}><EditArticle /></Suspense>} />
        <Route path="flows" element={<FlowsPage />} />
        <Route path="flows/:slug" element={<FlowPage />} />
        <Route path="flows/:id/edit" element={<Suspense fallback={<p className="py-16 text-center text-sm text-ink-muted">Opening the flow editor…</p>}><EditFlow /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
