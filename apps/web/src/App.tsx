import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Shell } from './layout/Shell';
import { Home } from './pages/Home';
import { CategoryPage } from './pages/Category';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { ArticlePage } from './features/articles/ArticlePage';

// The editor (Tiptap) is only loaded by editors who open it.
const EditArticle = lazy(() => import('./pages/EditArticle').then((m) => ({ default: m.EditArticle })));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="category/:slug" element={<CategoryPage />} />
        <Route path="article/:slug" element={<ArticlePage />} />
        <Route path="edit/:id" element={<Suspense fallback={<p className="py-16 text-center text-sm text-ink-muted">Opening the editor…</p>}><EditArticle /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
