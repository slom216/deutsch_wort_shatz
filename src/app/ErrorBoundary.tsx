import { Component, type ErrorInfo, type ReactNode } from 'react';

import { isStorageError, storageProblemMessage } from '@/features/persistence/db';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Rendered instead of the default panel when provided. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Application error boundary (Phase 0 deliverable 17).
 *
 * Catches render-time errors so a failure in one screen cannot blank the whole app and,
 * critically, never discards locally stored progress (§24). Errors are logged to the
 * console only — the app sends no data anywhere (§31).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in DeuLern Deutsch Wortschatz:', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    // The raw message is for the console only: library errors can carry internals and links.
    if (isStorageError(error)) {
      return (
        <div role="alert" className="error-boundary">
          <h1>Progress can&rsquo;t be saved here</h1>
          <p>{storageProblemMessage(error)}</p>
          <div className="error-boundary__actions">
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    return (
      <div role="alert" className="error-boundary">
        <h1>Something went wrong</h1>
        <p>
          An unexpected error stopped this screen from loading. Your saved progress has not been
          changed and is still stored in this browser.
        </p>
        <p>
          If this keeps happening, a damaged record may be the cause: open{' '}
          <a href="/data#data-repair">Data → Repair database</a> to check for it. Repair downloads a
          backup before removing anything.
        </p>
        <div className="error-boundary__actions">
          <button type="button" onClick={this.reset}>
            Try again
          </button>
          <a href="/">Back to dashboard</a>
        </div>
      </div>
    );
  }
}
