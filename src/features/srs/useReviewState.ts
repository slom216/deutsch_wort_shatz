import { useCallback, useEffect, useMemo, useState } from 'react';

import type { EntryProgress } from '@/schemas/progressSchema';
import { loadQueueableProgress, type QueueableProgress } from './repository';
import { isOverdue } from './scheduler';
import {
  dueEntries,
  hardestEntries,
  masteredEntries,
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

const EMPTY_STATE: QueueableProgress = { known: [], queueable: [], totalEntries: 0 };

export function useReviewState(): ReviewState {
  const [state, setState] = useState<QueueableProgress>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Unknown ids and skipped words are removed here, once, so every screen agrees.
      setState(await loadQueueableProgress());
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

  // Derived once per load rather than re-sorted on every render.
  const derived = useMemo(() => {
    const { known, queueable, totalEntries } = state;
    const now = new Date();
    const due = dueEntries(queueable, now);
    return {
      counts: queueCounts(known, totalEntries, now, queueable),
      due,
      overdue: due.filter((progress) => isOverdue(progress.srs, now)),
      hardest: hardestEntries(known, 10),
      mastered: masteredEntries(known),
      forecast: reviewForecast(queueable, 14, now),
    };
  }, [state]);

  return {
    loading,
    error,
    progress: state.known,
    ...derived,
    counts: loading ? EMPTY_COUNTS : derived.counts,
    totalEntries: state.totalEntries,
    refresh,
  };
}
