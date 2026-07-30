import { useEffect, useState } from 'react';

import { loadManifest, type ContentManifest } from '@/content/vocabulary/registry';

interface ManifestState {
  readonly manifest: ContentManifest | null;
  readonly error: string | null;
}

/**
 * Loads the generated content manifest.
 *
 * The manifest is tiny (a dozen band descriptors) and is the cheapest way for a screen
 * to show real dataset counts without pulling in any vocabulary bundle.
 */
export function useContentManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({ manifest: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((manifest) => {
        if (!cancelled) setState({ manifest, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          manifest: null,
          error:
            cause instanceof Error
              ? cause.message
              : 'Vocabulary content is missing. Run `npm run build:content`.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
