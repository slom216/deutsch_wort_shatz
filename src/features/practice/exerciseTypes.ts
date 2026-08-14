import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
} from '@/features/speech/speechTypes';
import type { Settings } from '@/schemas/settingsSchema';
import type { ExerciseType } from '@/schemas/vocabularySchema';

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
 * every few questions instead of a graded answer.
 */
export function availableExerciseTypes(settings: Settings): ExerciseType[] {
  const listening = settings.listeningEnabled && isSpeechSynthesisSupported();
  const speaking = settings.speakingEnabled && isSpeechRecognitionSupported();

  return ALL_EXERCISE_TYPES.filter((type) => {
    if (type === 'listening') return listening;
    if (type === 'speaking') return speaking;
    return true;
  });
}
