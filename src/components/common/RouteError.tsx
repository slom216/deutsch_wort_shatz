import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

import { isStorageError, storageProblemMessage } from '@/features/persistence/db';

/** Router-level error element — catches loader/render failures outside React rendering. */
export function RouteError(): ReactNode {
  const error = useRouteError();

  // Library messages stay in the console; learners get a sentence they can act on.
  let message = 'An unexpected error stopped this screen from loading.';
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? 'That page does not exist.' : message;
  } else if (isStorageError(error)) {
    message = storageProblemMessage(error);
  } else {
    console.error('Route error:', error);
  }

  return (
    <div role="alert" style={{ padding: 'var(--space-6)' }}>
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <p>Your saved progress is stored in this browser and has not been changed.</p>
      <p>
        If this keeps happening, open <Link to="/data#data-repair">Data → Repair database</Link> to
        check for a damaged record.
      </p>
      <Link to="/">Back to dashboard</Link>
    </div>
  );
}
