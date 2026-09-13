import type { TypedTranslationExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import {
  acceptedEnglish,
  acceptedGerman,
  acceptedPlurals,
  acceptedVerbForms,
  articleStrictness,
  englishStrictness,
  firstExample,
  headword,
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  lookalikeWords,
  pluralForm,
  primaryEnglish,
  sameMeaningWords,
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
  const { entry, pool, id } = context;

  /** Pool words the evaluator must treat as different words (see `EvaluationOptions`). */
  const otherWordsField = (words: readonly string[]) =>
    words.length > 0 ? { otherWords: [...new Set(words)] } : {};

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
        // Context only on this direction — see `exerciseBaseShape.example`. The German
        // sentence alone: its translation would spell out the answer being typed.
        ...(firstExample(entry) ? { example: firstExample(entry)?.german } : {}),
        question: headword(entry),
        answerLanguage: 'en',
        acceptedAnswers: accepted,
        canonicalAnswer: accepted[0] as string,
      };
    }

    case 'englishToGerman': {
      const own = acceptedGerman(entry);
      if (own.length === 0) return null;
      // "at" is an, bei and um: another entry with the prompt's meaning is right too.
      const sameMeaning = sameMeaningWords(entry, pool);
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the German word or phrase.',
        strictness: strictnessFor(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: [...own, ...sameMeaning],
        ...otherWordsField([...sameMeaning, ...lookalikeWords(entry, pool, own)]),
        canonicalAnswer: headword(entry),
      };
    }

    case 'nounWithArticle': {
      if (!isNounEntry(entry) || !entry.article) return null;
      const canonical = headword(entry);
      const accepted = withArticle(acceptedGerman(entry));
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the German noun with its article.',
        strictness: articleStrictness(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: accepted,
        ...otherWordsField(lookalikeWords(entry, pool, accepted)),
        canonicalAnswer: canonical,
      };
    }

    case 'nounWithArticleAndPlural': {
      const plural = pluralForm(entry);
      if (!isNounEntry(entry) || !entry.article || !plural) return null;
      const canonical = `${headword(entry)}, ${plural}`;
      const accepted = withArticle(acceptedGerman(entry)).flatMap((singular) =>
        acceptedPlurals(entry).flatMap((form) => [`${singular}, ${form}`, `${singular} ${form}`]),
      );
      return {
        ...base,
        isProduction: true,
        prompt: 'Type the noun with its article, then a comma, then the plural.',
        hint: `Example format: der Tisch, die Tische`,
        strictness: articleStrictness(entry),
        question: primaryEnglish(entry),
        answerLanguage: 'de',
        acceptedAnswers: accepted,
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
        acceptedAnswers: acceptedVerbForms(entry, 'pastParticiple'),
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

/** The forms that carry an article, for the variants that ask for one. */
function withArticle(forms: readonly string[]): string[] {
  return forms.filter((form) => /^(?:der|die|das)\s/iu.test(form));
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
