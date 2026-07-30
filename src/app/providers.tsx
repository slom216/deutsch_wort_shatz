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
 */
export function Providers({ children }: ProvidersProps): ReactNode {
  const hydrate = useSettingsStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return children;
}
