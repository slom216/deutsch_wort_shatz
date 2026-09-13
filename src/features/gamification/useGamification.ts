import { useCallback, useEffect, useState } from 'react';

import { LEVEL_ENTRY_COUNTS } from '@/content/vocabulary/frequencyBands';
import { isStorageError, storageProblemMessage } from '@/features/persistence/db';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { loadGamification, syncAchievements, type GamificationSnapshot } from './repository';

/**
 * Loads the gamification snapshot and unlocks any achievement that has just been earned.
 *
 * Everything is recomputed from stored history on each load, so the figures cannot drift
 * out of step with the learner's actual record.
 */
export function useGamification(): {
  loading: boolean;
  snapshot: GamificationSnapshot | null;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const goal = useSettingsStore((state) => state.settings.dailyGoal);
  const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadGamification(goal, LEVEL_ENTRY_COUNTS);
      // Record newly earned achievements, then re-read so the screen shows them unlocked.
      const unlocked = await syncAchievements(loaded.stats);
      setSnapshot(unlocked.length > 0 ? await loadGamification(goal, LEVEL_ENTRY_COUNTS) : loaded);
      setError(null);
    } catch (cause) {
      // Never a library message: the screen shows this to the learner as it is.
      console.error('Could not load gamification:', cause);
      setError(
        isStorageError(cause)
          ? storageProblemMessage(cause)
          : 'Could not read your progress. If this keeps happening, run Data → Repair.',
      );
    } finally {
      setLoading(false);
    }
  }, [goal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, snapshot, error, refresh };
}
