import type { TypedTranslationExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import {
  acceptedEnglish,
  acceptedGerman,
  articleStrictness,
  englishStrictness,
  headword,
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  pluralForm,
  primaryEnglish,
  strictnessFor,
} from './entryHelpers';
import type { GeneratorContext } from './multipleChoice';

/**
 * Typed translation (§15).
 *
 * Exact spelling, capitalization, umlauts and ß all matter; accepted alternatives come
 * from the entry's own configuration. Article and plural are only required by the
 * variants that explicitly ask for them.
 */

export type TypedTranslationVariant =
  | 'germanToEnglish'
  | 'englishToGerman'
  | 'nounWithArticle'
  | 'nounWithArticleAndPlural'
  | 'verbForm'
  | 'fullPhrase';

export function generateTypedTranslation(
  context: GeneratorContext,
  variant: TypedTranslationVariant,
): TypedTranslationExercise | null {
  const { entry, id } = context;

  const base = {
    id,
    entryId: entry.id,
    type: 'typedTranslation' as const,
    variant,
    requiresTypedInput: true,
    // "other" names nothing the learner can use to tell two senses apart, so it is left off.
    ...(entry.wordClass === 'other' ? {} : { wordClass: entry.wordClass }),
  };

  switch (variant) {
    case 'germanToEnglish': {
      const accepted = acceptedEnglish(entry);
      if (accepted.length === 0) return null;
      return {
        ...base,
        isProduction: false,
        prompt: 'Type the English translation.',
        strictness: englishStrictness(entry),
        question: headword(entry),
        answerLanguage: 'en',
        acceptedAnswers: accepted,
        canonicalAnswer: accepted[0] as string,
      };
    }

    case 'englishToGerman': {
      const accepted = acceptedGerman(entry);
      if (accepted.length === 0) return null;
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the German word or phrase.',
        strictness: strictnessFor(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: accepted,
        canonicalAnswer: headword(entry),
      };
    }

    case 'nounWithArticle': {
      if (!isNounEntry(entry) || !entry.article) return null;
      const canonical = `${entry.article} ${entry.german}`;
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the German noun with its article.',
        strictness: articleStrictness(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: [canonical],
        canonicalAnswer: canonical,
      };
    }

    case 'nounWithArticleAndPlural': {
      const plural = pluralForm(entry);
      if (!isNounEntry(entry) || !entry.article || !plural) return null;
      const canonical = `${entry.article} ${entry.german}, ${plural}`;
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the noun with its article, then a comma, then the plural.',
        hint: `Example format: der Tisch, die Tische`,
        strictness: articleStrictness(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: [canonical, `${entry.article} ${entry.german} ${plural}`],
        canonicalAnswer: canonical,
      };
    }

    case 'verbForm': {
      if (!isVerbEntry(entry)) return null;
      const participle = entry.pastParticiple;
      // Datasets that record no conjugation cannot ask for one.
      if (!participle) return null;
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the past participle.',
        hint: primaryEnglish(entry),
        strictness: strictnessFor(entry),
        question: entry.infinitive,
        answerLanguage: 'de',
        acceptedAnswers: [participle],
        canonicalAnswer: participle,
      };
    }

    case 'fullPhrase': {
      if (!isPhraseEntry(entry)) return null;
      const accepted = acceptedGerman(entry);
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the complete German phrase, including punctuation.',
        strictness: { ...strictnessFor(entry), punctuation: true },
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: accepted,
        canonicalAnswer: entry.german,
      };
    }

    default:
      return null;
  }
}

export function availableTypedTranslationVariants(
  entry: VocabularyEntry,
): TypedTranslationVariant[] {
  const variants: TypedTranslationVariant[] = ['germanToEnglish', 'englishToGerman'];
  if (isNounEntry(entry) && entry.article) {
    variants.push('nounWithArticle');
    if (pluralForm(entry)) variants.push('nounWithArticleAndPlural');
  }
  if (isVerbEntry(entry) && entry.pastParticiple) variants.push('verbForm');
  if (isPhraseEntry(entry)) variants.push('fullPhrase');
  return variants;
}
