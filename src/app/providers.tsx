import { useEffect, type ReactNode } from 'react';

import { useSettingsStore } from '@/features/settings/settingsStore';

interface ProvidersProps {
  readonly children: ReactNode;
}

/**
 * Application-wide providers (Phase 0 deliverable).
 *
 * Zustand needs no React provider, so this component's job is to hydrate persisted
 * settings from IndexedDB once on start-up and expose them to the tree. Additional
 * providers (speech, session) are introduced in later phases.
 *
 * When IndexedDB cannot be opened (blocked, missing, or written by a newer build) the app
 * shows one clear message instead of screens that would fail one by one with library text.
 */
export function Providers({ children }: ProvidersProps): ReactNode {
  const hydrate = useSettingsStore((state) => state.hydrate);
  const status = useSettingsStore((state) => state.status);
  const error = useSettingsStore((state) => state.error);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === 'error') {
    return (
      <div role="alert" className="error-boundary">
        <h1>Progress can&rsquo;t be saved here</h1>
        <p>{error}</p>
        <div className="error-boundary__actions">
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  return children;
}
