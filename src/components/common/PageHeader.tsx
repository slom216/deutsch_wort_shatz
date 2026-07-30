import type { ReactNode } from 'react';

import './PageHeader.css';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

/** Consistent page title block. Guarantees exactly one `<h1>` per screen (§30). */
export function PageHeader({ title, description, actions }: PageHeaderProps): ReactNode {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
