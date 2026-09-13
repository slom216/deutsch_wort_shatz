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

  it('shows an alert pointing to Repair, without the raw error message', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).not.toHaveTextContent('Vocabulary bundle failed to load');
    expect(screen.getByRole('link', { name: /repair/i })).toHaveAttribute(
      'href',
      '/data#data-repair',
    );
  });

  it('explains a storage failure in plain words, never the library text', () => {
    function Blocked(): never {
      const error = new Error('IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb');
      error.name = 'MissingAPIError';
      throw error;
    }
    render(
      <ErrorBoundary>
        <Blocked />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/blocking local storage/i);
    expect(alert).not.toHaveTextContent(/tinyurl/);
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
