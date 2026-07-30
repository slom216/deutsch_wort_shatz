import type { Exercise } from '@/schemas/exerciseSchema';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';
import {
  availableMultipleChoiceVariants,
  generateMultipleChoice,
  type GeneratorContext,
} from './multipleChoice';
import { availableTypedTranslationVariants, generateTypedTranslation } from './typedTranslation';
import {
  availableSentenceCompletionVariants,
  generateSentenceCompletion,
} from './sentenceCompletion';
import { availableWordOrderingVariants, generateWordOrdering } from './wordOrdering';
import {
  availableListeningVariants,
  availableSpeakingVariants,
  generateListening,
  generateSpeaking,
} from './listeningSpeaking';

export * from './multipleChoice';
export * from './typedTranslation';
export * from './sentenceCompletion';
export * from './matching';
export * from './wordOrdering';
export * from './listeningSpeaking';
export * from './distractors';
export * from './entryHelpers';

/**
 * Single-entry exercise generation.
 *
 * Matching is deliberately absent: it spans a group of entries and is generated
 * separately by the session builder via `generateMatching`.
 */

export interface GenerateOptions {
  readonly entry: VocabularyEntry;
  readonly pool: readonly VocabularyEntry[];
  readonly random: Random;
  readonly id: string;
  /** Restricts generation to these types; defaults to whatever the entry enables. */
  readonly allowedTypes?: readonly ExerciseType[];
}

/** Every exercise this entry can support, across all types and variants. */
export function generateAllForEntry(options: GenerateOptions): Exercise[] {
  const { entry, pool, random, id, allowedTypes } = options;
  const enabled = new Set<ExerciseType>(
    allowedTypes && allowedTypes.length > 0
      ? allowedTypes.filter((type) => entry.exerciseConfig.enabledTypes.includes(type))
      : entry.exerciseConfig.enabledTypes,
  );

  const exercises: Exercise[] = [];
  let counter = 0;
  const nextId = (): string => `${id}-${(counter += 1)}`;

  const context = (): GeneratorContext => ({ entry, pool, random, id: nextId() });

  if (enabled.has('multipleChoice')) {
    for (const variant of availableMultipleChoiceVariants(entry)) {
      const exercise = generateMultipleChoice(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  if (enabled.has('typedTranslation')) {
    for (const variant of availableTypedTranslationVariants(entry)) {
      const exercise = generateTypedTranslation(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  if (enabled.has('sentenceCompletion')) {
    for (const variant of availableSentenceCompletionVariants(entry)) {
      const exercise = generateSentenceCompletion(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  if (enabled.has('wordOrdering')) {
    for (const variant of availableWordOrderingVariants(entry)) {
      const exercise = generateWordOrdering(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  if (enabled.has('listening')) {
    for (const variant of availableListeningVariants(entry)) {
      const exercise = generateListening(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  if (enabled.has('speaking')) {
    for (const variant of availableSpeakingVariants(entry)) {
      const exercise = generateSpeaking(context(), variant);
      if (exercise) exercises.push(exercise);
    }
  }

  return exercises;
}

/** True when the entry can produce at least one exercise of the given type. */
export function canGenerate(
  entry: VocabularyEntry,
  type: ExerciseType,
  pool: readonly VocabularyEntry[],
  random: Random,
): boolean {
  return generateAllForEntry({ entry, pool, random, id: 'probe', allowedTypes: [type] }).length > 0;
}
