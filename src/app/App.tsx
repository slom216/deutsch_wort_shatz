import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';
import { Providers } from './providers';
import { createRouter } from './router';

const router = createRouter();

export function App(): ReactNode {
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  );
}
