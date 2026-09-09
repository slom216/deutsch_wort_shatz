import { useSettingsStore } from '@/features/settings/settingsStore';
import type { LearningMode } from '@/schemas/settingsSchema';

/**
 * Learning modes: how many clean answers master a word.
 *
 * The quiz score is the spine of the continuous stream — it picks the exercise format, it
 * decides when a word leaves the stream, and it is what the header counts. Lowering the
 * target is therefore the one honest way to trade thoroughness for speed: the same ladder,
 * walked in fewer rungs.
 *
 * Switching mode resets all progress (see the settings screen), so a learner's stored
 * scores and XP are always earned under exactly one target.
 */

export const MASTERY_TARGETS: Readonly<Record<LearningMode, number>> = {
  normal: 4,
  fast: 3,
  ultraFast: 2,
};

export const LEARNING_MODE_LABELS: Readonly<Record<LearningMode, string>> = {
  normal: 'Normal',
  fast: 'Fast',
  ultraFast: 'Ultra fast',
};

/** The order the modes are offered in, slowest and most thorough first. */
export const LEARNING_MODES: readonly LearningMode[] = ['normal', 'fast', 'ultraFast'];

/**
 * The learner's current mode.
 *
 * Read straight off the settings store rather than threaded through every caller: Zustand's
 * `getState` works outside React, and the mode is genuinely one global value per learner —
 * there is no session or entry that could sensibly be on a different one.
 */
export function currentMode(): LearningMode {
  return useSettingsStore.getState().settings.learningMode;
}

/** Quiz score at which an entry counts as mastered, for this mode. */
export function masteryTarget(mode: LearningMode = currentMode()): number {
  return MASTERY_TARGETS[mode];
}

/**
 * XP per exercise is scaled so that mastering a word is worth the same in every mode.
 *
 * Without it, ultra fast would pay half as much XP per word as normal for learning the
 * same vocabulary, and the level curve would quietly punish the faster modes.
 */
export function xpMultiplier(mode: LearningMode = currentMode()): number {
  return MASTERY_TARGETS.normal / MASTERY_TARGETS[mode];
}
