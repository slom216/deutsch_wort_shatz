import { useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { ErrorBoundary } from '@/app/ErrorBoundary';
import { seoForPath } from '@/app/seo';
import { focusPageHeading } from '@/components/common/PageHeader';
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
  const { pathname } = useLocation();
  const firstRender = useRef(true);

  // A client-side route change is silent to screen readers: move focus to the new page's
  // heading. Not on the initial load, where the browser already announces the document.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    focusPageHeading();
  }, [pathname]);

  // Canonical and robots for the current route. index.html ships neither, and it is
  // the same file for every URL — so until this runs, every deep link looks to a
  // crawler like a copy of the last one. Google renders the app before indexing, so
  // the tags written here are the ones it reads.
  useEffect(() => {
    const { canonical, index } = seoForPath(pathname);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.append(link);
    }
    link.href = canonical;

    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (index) {
      robots?.remove();
      return;
    }
    // follow, not none: these screens are dead ends for the index but their links
    // still lead to pages that are not.
    const meta = robots ?? document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    if (!robots) document.head.append(meta);
  }, [pathname]);

  // Exercise screens get a compact header on phones, so the answer controls fit above the
  // fold (see AppHeader.css).
  const inSession = /^\/(practice\/session|continuous)\//u.test(pathname);

  return (
    <div className={inSession ? 'app-shell app-shell--session' : 'app-shell'}>
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
