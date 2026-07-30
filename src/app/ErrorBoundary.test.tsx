import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('Vocabulary bundle failed to load');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors; silence it so test output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows an alert with the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).toHaveTextContent('Vocabulary bundle failed to load');
  });

  it('reassures the learner that stored progress is intact', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/progress has not been changed/i);
  });

  it('supports a custom fallback', () => {
    render(
      <ErrorBoundary fallback={(error) => <p>Custom: {error.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/custom: vocabulary bundle failed to load/i)).toBeInTheDocument();
  });
});
