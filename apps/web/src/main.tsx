import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { createQueryClient } from './api/queryClient';
import { App } from './App';
import { STATIC_DEMO } from './static/demo';

// GitHub Pages serves only files, so the static demo routes on the hash (no server rewrite to index.html).
const Router = STATIC_DEMO ? HashRouter : BrowserRouter;

const qc = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <Router>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
