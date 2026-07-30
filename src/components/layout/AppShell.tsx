import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';

import { ErrorBoundary } from '@/app/ErrorBoundary';
import { Sidebar } from './Sidebar';
import './AppShell.css';

/**
 * Desktop-first application shell (Phase 0 deliverables 13–14).
 *
 * A persistent sidebar plus a single `<main>` landmark. The inner error boundary keeps
 * a crashing page from taking down navigation, so the learner can always move away
 * from a broken screen.
 */
export function AppShell(): ReactNode {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" className="app-shell__main" tabIndex={-1}>
        <div className="app-shell__content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
