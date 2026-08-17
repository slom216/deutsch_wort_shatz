import type { MultipleChoiceExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';
import { nearMiss, selectDistractors } from './distractors';
import {
  acceptedGerman,
  headword,
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  pluralForm,
  primaryEnglish,
  strictnessFor,
} from './entryHelpers';

/**
 * Multiple choice (§15).
 *
 * Six options by default, exactly one correct, distractors drawn from the same level with
 * an English gloss of similar length (see `distractors.ts`). A variant returns null when
 * the entry cannot support it — an article question needs a noun, a verb-form question
 * needs a verb.
 *
 * About half the German-answer questions include the right answer carrying one plausible
 * learner mistake — a confusable spelling, the wrong article, the wrong ending — so
 * recognizing the shape of the word is not enough (`nearMiss`). Only about half, because a
 * near miss is also a tell: two options that close point at each other.
 * English-answer variants get none — a misspelled gloss tests English, not German.
 *
 * `article` is naturally capped at three options, since German has three articles.
 */

export type MultipleChoiceVariant =
  | 'germanToEnglish'
  | 'englishToGerman'
  | 'article'
  | 'plural'
  | 'wordClass'
  | 'verbForm'
  | 'phraseContext';

export const OPTION_COUNT = 6;

/**
 * Variants whose options are German words, and so the only ones a near miss belongs in.
 * `article` and `wordClass` offer a closed set of labels — "dos" alongside der/die/das would
 * test spelling, not grammar — and the English-answer variants would only test English.
 */
const GERMAN_OPTION_VARIANTS: readonly MultipleChoiceVariant[] = [
  'englishToGerman',
  'plural',
  'verbForm',
];

/** How often those variants actually get one. */
const NEAR_MISS_CHANCE = 0.5;

/**
 * Forms that are also right, and so must never come back as a near miss: the plural, and any
 * article the entry accepts besides its main one. The article and ending rules would
 * otherwise happily offer "das Joghurt" as the wrong answer to "der Joghurt".
 */
function alsoCorrect(entry: VocabularyEntry): string[] {
  if (!isNounEntry(entry)) return [];
  const plural = pluralForm(entry);
  return [
    ...(plural === null ? [] : [plural]),
    ...(entry.alternateArticles ?? []).map((article) => `${article} ${entry.german}`),
  ];
}

export interface GeneratorContext {
  readonly entry: VocabularyEntry;
  readonly pool: readonly VocabularyEntry[];
  readonly random: Random;
  readonly id: string;
}

function assemble(
  context: GeneratorContext,
  variant: MultipleChoiceVariant,
  fields: {
    prompt: string;
    question: string;
    correct: string;
    distractors: string[];
    isProduction: boolean;
    hint?: string;
  },
): MultipleChoiceExercise | null {
  const { entry, random, id } = context;
  // Fewer than two options cannot make a question.
  if (fields.distractors.length === 0) return null;

  // The near miss replaces a distractor rather than joining them, so the count stays at six.
  // Accepted answers are excluded from it: an option that is also right would be a trap.
  const near =
    GERMAN_OPTION_VARIANTS.includes(variant) && random.next() < NEAR_MISS_CHANCE
      ? nearMiss(fields.correct, random, [
          ...fields.distractors,
          ...entry.english,
          ...acceptedGerman(entry),
          ...alsoCorrect(entry),
        ])
      : null;
  const distractors = near
    ? [near, ...fields.distractors].slice(0, OPTION_COUNT - 1)
    : fields.distractors;

  const options = random.shuffle([fields.correct, ...distractors]);
  const correctIndex = options.indexOf(fields.correct);
  if (correctIndex < 0) return null;

  return {
    id,
    entryId: entry.id,
    type: 'multipleChoice',
    variant,
    isProduction: fields.isProduction,
    requiresTypedInput: false,
    prompt: fields.prompt,
    ...(fields.hint === undefined ? {} : { hint: fields.hint }),
    strictness: strictnessFor(entry),
    question: fields.question,
    options,
    correctIndex,
  };
}

export function generateMultipleChoice(
  context: GeneratorContext,
  variant: MultipleChoiceVariant,
): MultipleChoiceExercise | null {
  const { entry, pool, random } = context;

  switch (variant) {
    case 'germanToEnglish': {
      const correct = primaryEnglish(entry);
      if (!correct) return null;
      return assemble(context, variant, {
        prompt: 'What does this mean in English?',
        question: headword(entry),
        correct,
        distractors: selectDistractors({
          target: entry,
          pool,
          count: OPTION_COUNT - 1,
          random,
          valueOf: (candidate) => candidate.english[0] ?? null,
          exclude: entry.english,
        }),
        isProduction: false,
      });
    }

    case 'englishToGerman': {
      const correct = headword(entry);
      return assemble(context, variant, {
        prompt: 'Which German word or phrase is this?',
        question: primaryEnglish(entry),
        correct,
        distractors: selectDistractors({
          target: entry,
          pool,
          count: OPTION_COUNT - 1,
          random,
          valueOf: (candidate) => headword(candidate),
          exclude: acceptedGerman(entry),
        }),
        // Recognition, not production: the learner selects rather than writes German.
        isProduction: false,
      });
    }

    case 'article': {
      if (!isNounEntry(entry) || !entry.article) return null;
      return assemble(context, variant, {
        prompt: 'Which article does this noun take?',
        question: entry.german,
        hint: primaryEnglish(entry),
        correct: entry.article,
        // The article question always offers all three, so no distractor search is needed.
        distractors: ['der', 'die', 'das'].filter((a) => a !== entry.article),
        isProduction: true,
      });
    }

    case 'plural': {
      const correct = pluralForm(entry);
      if (!correct) return null;
      return assemble(context, variant, {
        prompt: 'What is the plural?',
        question: headword(entry),
        hint: primaryEnglish(entry),
        correct,
        distractors: selectDistractors({
          target: entry,
          pool,
          count: OPTION_COUNT - 1,
          random,
          valueOf: (candidate) => pluralForm(candidate),
          exclude: [correct],
          filter: (candidate) => isNounEntry(candidate),
        }),
        isProduction: true,
      });
    }

    case 'wordClass': {
      const distractors = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'pronoun'].filter(
        (value) => value !== entry.wordClass,
      );
      return assemble(context, variant, {
        prompt: 'What kind of word is this?',
        question: headword(entry),
        hint: primaryEnglish(entry),
        correct: entry.wordClass,
        distractors: random.sample(distractors, OPTION_COUNT - 1),
        isProduction: false,
      });
    }

    case 'verbForm': {
      if (!isVerbEntry(entry)) return null;
      const correct = entry.pastParticiple;
      // Datasets that record no conjugation cannot ask for one.
      if (!correct) return null;
      return assemble(context, variant, {
        prompt: 'Which is the past participle?',
        question: entry.infinitive,
        hint: primaryEnglish(entry),
        correct,
        distractors: selectDistractors({
          target: entry,
          pool,
          count: OPTION_COUNT - 1,
          random,
          valueOf: (candidate) =>
            isVerbEntry(candidate) ? (candidate.pastParticiple ?? null) : null,
          exclude: [correct],
          filter: (candidate) => isVerbEntry(candidate),
        }),
        isProduction: true,
      });
    }

    case 'phraseContext': {
      if (!isPhraseEntry(entry)) return null;
      const correct = primaryEnglish(entry);
      if (!correct) return null;
      return assemble(context, variant, {
        prompt: `When would you say this? (register: ${entry.register})`,
        question: entry.german,
        correct,
        distractors: selectDistractors({
          target: entry,
          pool,
          count: OPTION_COUNT - 1,
          random,
          valueOf: (candidate) =>
            isPhraseEntry(candidate) ? (candidate.english[0] ?? null) : null,
          exclude: entry.english,
          filter: (candidate) => isPhraseEntry(candidate),
        }),
        isProduction: false,
      });
    }

    default:
      return null;
  }
}

/** Variants this entry can actually support, in a sensible teaching order. */
export function availableMultipleChoiceVariants(entry: VocabularyEntry): MultipleChoiceVariant[] {
  const variants: MultipleChoiceVariant[] = ['germanToEnglish', 'englishToGerman', 'wordClass'];
  if (isNounEntry(entry) && entry.article) variants.push('article');
  if (pluralForm(entry)) variants.push('plural');
  if (isVerbEntry(entry) && entry.pastParticiple) variants.push('verbForm');
  if (isPhraseEntry(entry)) variants.push('phraseContext');
  return variants;
}
