import { useCallback, useEffect, useState } from 'react';

import { loadSearchIndex } from '@/content/vocabulary/registry';
import type { EntryProgress } from '@/schemas/progressSchema';
import { loadAllProgress } from './repository';
import {
  dueEntries,
  hardestEntries,
  masteredEntries,
  overdueEntries,
  queueCounts,
  reviewForecast,
  type ForecastDay,
  type QueueCounts,
} from './queue';

/**
 * Loads SRS state for the screens that report on it.
 *
 * Everything is derived from IndexedDB, so a refresh reproduces the same queue rather
 * than resetting it — one of the Phase 2 acceptance criteria.
 */

export interface ReviewState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly progress: readonly EntryProgress[];
  readonly counts: QueueCounts;
  readonly due: readonly EntryProgress[];
  readonly overdue: readonly EntryProgress[];
  readonly hardest: readonly EntryProgress[];
  readonly mastered: readonly EntryProgress[];
  readonly forecast: readonly ForecastDay[];
  readonly totalEntries: number;
  readonly refresh: () => Promise<void>;
}

const EMPTY_COUNTS: QueueCounts = {
  due: 0,
  overdue: 0,
  newAvailable: 0,
  learning: 0,
  review: 0,
  mastered: 0,
};

export function useReviewState(): ReviewState {
  const [progress, setProgress] = useState<readonly EntryProgress[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stored, index] = await Promise.all([loadAllProgress(), loadSearchIndex()]);
      setProgress(stored);
      setTotalEntries(index.length);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read your progress.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const now = new Date();

  return {
    loading,
    error,
    progress,
    counts: loading ? EMPTY_COUNTS : queueCounts(progress, totalEntries, now),
    due: dueEntries(progress, now),
    overdue: overdueEntries(progress, now),
    hardest: hardestEntries(progress, 10),
    mastered: masteredEntries(progress),
    forecast: reviewForecast(progress, 14, now),
    totalEntries,
    refresh,
  };
}
