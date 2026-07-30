import type { ExerciseType } from '@/schemas/vocabularySchema';
import type { EntryProgress } from '@/schemas/progressSchema';
import { difficultyBand, isGrammarPropertyError, type DifficultyBand } from './difficulty';

/**
 * Exercise adaptation (§21).
 *
 * Low difficulty     — more typed production, less multiple choice, phrase-level recall.
 * Medium difficulty  — keep the mix, emphasise whatever property the learner gets wrong.
 * High difficulty    — return to recognition, simpler distractors, focus on the article,
 *                      plural or verb form, and show metadata after errors.
 */

export interface AdaptationPlan {
  readonly band: DifficultyBand;
  /** Exercise types to prefer for this entry, most preferred first. */
  readonly preferredTypes: readonly ExerciseType[];
  /** Types to avoid unless nothing else is available. */
  readonly discouragedTypes: readonly ExerciseType[];
  /** Number of multiple-choice options; fewer options for struggling learners. */
  readonly multipleChoiceOptions: number;
  /** Show the entry's grammar metadata after a wrong answer. */
  readonly showMetadataAfterError: boolean;
  /** The grammatical property this learner keeps getting wrong, if any. */
  readonly weakProperty: WeakProperty | null;
}

export type WeakProperty = 'article' | 'plural' | 'verbForm';

const PROPERTY_BY_CATEGORY: Record<string, WeakProperty> = {
  missingArticle: 'article',
  wrongArticle: 'article',
  wrongPlural: 'plural',
  wrongConjugation: 'verbForm',
};

/** The grammatical property with the most recorded errors for this entry. */
export function weakestProperty(progress: EntryProgress): WeakProperty | null {
  const totals = new Map<WeakProperty, number>();
  for (const [category, count] of Object.entries(progress.errorCounts)) {
    if (!isGrammarPropertyError(category)) continue;
    const property = PROPERTY_BY_CATEGORY[category];
    if (!property) continue;
    totals.set(property, (totals.get(property) ?? 0) + count);
  }

  let best: WeakProperty | null = null;
  let bestCount = 0;
  for (const [property, count] of totals) {
    if (count > bestCount) {
      bestCount = count;
      best = property;
    }
  }
  return best;
}

export function planFor(progress: EntryProgress): AdaptationPlan {
  const band = difficultyBand(progress.srs.difficulty);
  const weakProperty = weakestProperty(progress);

  switch (band) {
    case 'low':
      return {
        band,
        // Easy words earn harder formats: typed production and full phrases.
        preferredTypes: ['typedTranslation', 'sentenceCompletion', 'wordOrdering', 'speaking'],
        discouragedTypes: ['multipleChoice'],
        multipleChoiceOptions: 4,
        showMetadataAfterError: false,
        weakProperty,
      };

    case 'medium':
      return {
        band,
        preferredTypes: [
          'typedTranslation',
          'multipleChoice',
          'sentenceCompletion',
          'listening',
          'matching',
        ],
        discouragedTypes: [],
        multipleChoiceOptions: 4,
        showMetadataAfterError: true,
        weakProperty,
      };

    case 'high':
    default:
      return {
        band,
        // Hard words go back to recognition with simpler choices.
        preferredTypes: ['multipleChoice', 'matching', 'listening'],
        discouragedTypes: ['wordOrdering', 'speaking'],
        multipleChoiceOptions: 3,
        showMetadataAfterError: true,
        weakProperty,
      };
  }
}

/**
 * Orders an entry's candidate exercises by how well they suit its difficulty, so the
 * session builder can take the best few. Exercises targeting a weak grammatical property
 * are promoted regardless of band.
 */
export function scoreExercise(
  plan: AdaptationPlan,
  exercise: { type: ExerciseType; variant: string; isProduction: boolean },
): number {
  let score = 0;

  const preferredIndex = plan.preferredTypes.indexOf(exercise.type);
  if (preferredIndex >= 0) score += 10 - preferredIndex;
  if (plan.discouragedTypes.includes(exercise.type)) score -= 5;

  // Focus on the property the learner keeps getting wrong (§21).
  if (plan.weakProperty) {
    const variant = exercise.variant.toLowerCase();
    const targets =
      (plan.weakProperty === 'article' && variant.includes('article')) ||
      (plan.weakProperty === 'plural' && variant.includes('plural')) ||
      (plan.weakProperty === 'verbForm' && variant.includes('verbform'));
    if (targets) score += 8;
  }

  // Low-difficulty entries should be pushed towards production.
  if (plan.band === 'low' && exercise.isProduction) score += 3;
  // High-difficulty entries should not be pushed into production yet.
  if (plan.band === 'high' && exercise.isProduction) score -= 2;

  return score;
}
