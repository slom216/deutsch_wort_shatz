import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';

import { App } from '@/app/App';
import '@/styles/global.css';

// public/404.html stores the requested path on static hosts that serve it for unknown
// URLs. Restore it before the router is created (App creates it on first render), and only
// ever to a path on this origin.
try {
  const redirect = sessionStorage.getItem('dws:redirect');
  sessionStorage.removeItem('dws:redirect');
  if (redirect) {
    const target = new URL(redirect, window.location.origin);
    if (target.origin === window.location.origin) {
      window.history.replaceState(null, '', target.pathname + target.search + target.hash);
    }
  }
} catch {
  // Storage blocked or a malformed value: stay on the current URL.
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
