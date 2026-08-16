import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';

import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';
import './AppShell.css';

/**
 * Application shell, laid out like the rest of the DeuLern suite: sticky top bar, one
 * `<main>` landmark, brand-band footer.
 *
 * The inner error boundary keeps a crashing page from taking down navigation, so the
 * learner can always move away from a broken screen.
 */
export function AppShell(): ReactNode {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <AppHeader />
      <main id="main-content" className="app-shell__main" tabIndex={-1}>
        <div className="app-shell__content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
