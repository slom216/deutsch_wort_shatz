import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';
import { Providers } from './providers';
import { createRouter } from './router';

// Created on first render rather than at import, so main.tsx can restore a deep link
// saved by public/404.html before the router reads the URL.
let router: ReturnType<typeof createRouter> | undefined;

export function App(): ReactNode {
  router ??= createRouter();
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  );
}
