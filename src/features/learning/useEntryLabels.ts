import { useEffect, useState } from 'react';

import { loadEntries } from '@/content/vocabulary/registry';
import { headword } from '@/features/practice/generators/entryHelpers';

/**
 * Entry id → learner-facing headword, for the screens that list stored progress.
 *
 * Progress is keyed by stable id (`a1-0004-heissen`), which is a database key, not
 * vocabulary. §14 also requires a noun to carry its article wherever it is shown, and
 * `headword()` is the one place that rule lives — the search index has no article field,
 * so the entries themselves are loaded. Bands are memoized by the registry, so the cost
 * is one band load per screen at most.
 */
export function useEntryLabels(entryIds: readonly string[]): Map<string, string> {
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  // Ids arrive as a fresh array on every render; the join gives the effect a stable key.
  const key = entryIds.join(',');

  useEffect(() => {
    if (entryIds.length === 0) {
      setLabels(new Map());
      return;
    }
    let cancelled = false;

    loadEntries(entryIds)
      .then((entries) => {
        if (cancelled) return;
        setLabels(new Map([...entries].map(([id, entry]) => [id, headword(entry)])));
      })
      .catch(() => {
        // Labels are cosmetic: without them the list falls back to entry ids rather than
        // failing the whole screen.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return labels;
}
