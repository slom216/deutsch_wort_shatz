import type { ReactNode } from 'react';

interface LoadingScreenProps {
  readonly label?: string;
}

/** Suspense fallback. `aria-live` announces the wait without stealing focus (§30). */
export function LoadingScreen({ label = 'Loading…' }: LoadingScreenProps): ReactNode {
  return (
    <div role="status" aria-live="polite" style={{ padding: 'var(--space-6)' }}>
      {label}
    </div>
  );
}
