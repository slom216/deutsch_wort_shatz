import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

/** Router-level error element — catches loader/render failures outside React rendering. */
export function RouteError(): ReactNode {
  const error = useRouteError();

  let message = 'An unexpected error occurred.';
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div role="alert" style={{ padding: 'var(--space-6)' }}>
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <p>Your saved progress is stored in this browser and has not been changed.</p>
      <Link to="/">Back to dashboard</Link>
    </div>
  );
}
