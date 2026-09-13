import { useEffect, useRef, type ReactNode } from 'react';

import './PageHeader.css';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

const APP_NAME = 'DeuLern Deutsch Wortschatz';

/** Set by the shell on a route change; the next page heading to mount takes focus. */
let headingFocusPending = false;

/**
 * Moves focus to the current page's `<h1>` after client-side navigation, so screen
 * readers announce the new page. If the page is still loading, its heading takes focus
 * when it mounts.
 */
export function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (heading) {
    heading.focus();
    headingFocusPending = false;
  } else {
    headingFocusPending = true;
  }
}

/** Consistent page title block. Guarantees exactly one `<h1>` per screen (§30). */
export function PageHeader({ title, description, actions }: PageHeaderProps): ReactNode {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    document.title = title.includes(APP_NAME) ? title : `${title} · ${APP_NAME}`;
  }, [title]);

  useEffect(() => {
    if (headingFocusPending) {
      headingFocusPending = false;
      headingRef.current?.focus();
    }
  }, []);

  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
