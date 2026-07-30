import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { routes } from '@/app/router';

/**
 * Renders the real route table at a given path using a memory router, so tests exercise
 * the same routing configuration the application ships.
 */
export function renderRoute(initialPath: string): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(<RouterProvider router={router} />);
}

export function renderWithRouter(element: ReactNode, initialPath = '/'): RenderResult {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [initialPath] });
  return render(<RouterProvider router={router} />);
}
