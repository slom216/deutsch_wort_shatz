import { isSpeechRecognitionSupported } from '@/features/speech/speechTypes';
import { hasGermanVoice } from '@/features/speech/useSpeechSynthesis';
import type { Settings } from '@/schemas/settingsSchema';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';

/** Every format the engine can generate (§15). */
export const ALL_EXERCISE_TYPES: readonly ExerciseType[] = [
  'multipleChoice',
  'typedTranslation',
  'sentenceCompletion',
  'matching',
  'wordOrdering',
  'listening',
  'speaking',
];

/** Learner-facing names for each format, in English (§1). */
export const EXERCISE_TYPE_LABELS: Readonly<Record<ExerciseType, string>> = {
  multipleChoice: 'Multiple choice',
  typedTranslation: 'Typed translation',
  sentenceCompletion: 'Sentence completion',
  matching: 'Matching',
  wordOrdering: 'Word ordering',
  listening: 'Listening',
  speaking: 'Speaking',
};

/**
 * The formats a session may use here and now (§19: "listening and speaking only when
 * enabled and supported").
 *
 * Both halves matter. The settings toggles are the learner's choice; browser support is
 * not. A Firefox user who leaves speaking switched on has no speech recognition, and
 * putting speaking exercises in their session would hand them a self-assessment prompt
 * every few questions instead of a graded answer. Listening needs an installed German
 * voice, not merely the speechSynthesis API: with no voice nothing is audible at all.
 *
 * Every fixed session applies this when it is built, whatever its URL says, so no entry
 * point can bypass it.
 */
export async function availableExerciseTypes(settings: Settings): Promise<ExerciseType[]> {
  const listening = settings.listeningEnabled && (await hasGermanVoice());
  const speaking = settings.speakingEnabled && isSpeechRecognitionSupported();

  return ALL_EXERCISE_TYPES.filter((type) => {
    if (type === 'listening') return listening;
    if (type === 'speaking') return speaking;
    return true;
  });
}

/** Keeps only the formats at least one of these entries can produce. */
export function typesForEntries(
  types: readonly ExerciseType[],
  entries: readonly VocabularyEntry[],
): ExerciseType[] {
  return types.filter((type) =>
    // Matching is built from a group of entries, not from one (see `buildSession`).
    type === 'matching'
      ? entries.length >= 5
      : entries.some((entry) => entry.exerciseConfig.enabledTypes.includes(type)),
  );
}
