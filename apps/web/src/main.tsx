import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="p-10">
      <h1 className="text-2xl font-semibold text-primary">Operations Hub</h1>
      <span className="mt-2 inline-block h-1 w-10 rounded-sm bg-accent" />
    </main>
  </StrictMode>,
);
