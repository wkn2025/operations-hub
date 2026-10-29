import { Route, Routes } from 'react-router';
import { Shell } from './layout/Shell';
import { Home } from './pages/Home';
import { CategoryPage } from './pages/Category';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { ArticlePage } from './features/articles/ArticlePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="category/:slug" element={<CategoryPage />} />
        <Route path="article/:slug" element={<ArticlePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
