import { resetAllProgress } from '@/features/persistence/db';
import { clearBestStreaks } from '@/features/practice/streakGame';
import { useSettingsStore } from './settingsStore';
import type { LearningMode, Settings } from '@/schemas/settingsSchema';

/**
 * Switches learning mode, wiping every trace of progress earned under the old one.
 *
 * A score means something different under each target: a word sitting at 3/4 is unlearned
 * under normal and already mastered under fast. There is no honest way to rescale the
 * stored scores, the XP derived from them or the SRS intervals they produced, so the whole
 * lot goes and the learner starts clean.
 *
 * Settings are *not* progress, but `resetAllProgress` clears their table along with the
 * rest — so they are written back afterwards carrying the new mode. Without that, changing
 * mode would quietly reset the daily goal, strictness and speech settings too.
 *
 * Best streaks live in localStorage, which no IndexedDB transaction can reach; they are a
 * scoreboard of past runs, so they go with everything else.
 */
export async function switchLearningMode(mode: LearningMode): Promise<void> {
  const store = useSettingsStore.getState();
  const previous: Settings = store.settings;

  if (mode === previous.learningMode) return;

  await resetAllProgress();
  clearBestStreaks();
  // Re-hydrate first so the store is not left holding settings that no longer exist in the
  // database, then write the preserved ones back over the freshly created defaults.
  await store.hydrate();
  await useSettingsStore.getState().update({ ...previous, learningMode: mode });
}
