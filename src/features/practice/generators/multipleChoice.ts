import type { MultipleChoiceExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';
import { selectDistractors } from './distractors';
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
 * Four options by default, exactly one correct, distractors preferably from the same
 * topic or a nearby frequency range. A variant returns null when the entry cannot
 * support it — an article question needs a noun, a verb-form question needs a verb.
 */

export type MultipleChoiceVariant =
  | 'germanToEnglish'
  | 'englishToGerman'
  | 'article'
  | 'plural'
  | 'wordClass'
  | 'verbForm'
  | 'phraseContext';

const OPTION_COUNT = 4;

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

  const options = random.shuffle([fields.correct, ...fields.distractors]);
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
          valueOf: (candidate) => (isVerbEntry(candidate) ? candidate.pastParticiple : null),
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
  if (isVerbEntry(entry)) variants.push('verbForm');
  if (isPhraseEntry(entry)) variants.push('phraseContext');
  return variants;
}
