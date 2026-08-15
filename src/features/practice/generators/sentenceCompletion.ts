import type { SentenceCompletionExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { fullyNormalize } from '../evaluation/normalize';
import {
  firstExample,
  isNounEntry,
  isVerbEntry,
  pluralForm,
  primaryEnglish,
  strictnessFor,
} from './entryHelpers';
import type { GeneratorContext } from './multipleChoice';

/**
 * Sentence completion (§15).
 *
 * Exactly one gap with one clearly intended answer, and the full corrected sentence is
 * shown after submission. The gap is cut from a real example sentence using the entry's
 * declared target token, so the surrounding context is always genuine.
 */

export type SentenceCompletionVariant =
  'vocabularyGap' | 'articleGap' | 'pluralGap' | 'verbFormGap';

/**
 * Locates `token` inside `sentence` case-insensitively and splits around it.
 * Returns null when the token does not occur, which is the case for a small number of
 * entries whose generated examples do not contain their own target token.
 */
function splitAroundToken(
  sentence: string,
  token: string,
): { before: string; after: string; matched: string } | null {
  const index = sentence.toLocaleLowerCase('de-DE').indexOf(token.toLocaleLowerCase('de-DE'));
  if (index < 0) return null;
  return {
    before: sentence.slice(0, index),
    after: sentence.slice(index + token.length),
    matched: sentence.slice(index, index + token.length),
  };
}

export function generateSentenceCompletion(
  context: GeneratorContext,
  variant: SentenceCompletionVariant,
): SentenceCompletionExercise | null {
  const { entry, id } = context;
  const example = firstExample(entry);
  if (!example) return null;

  const base = {
    id,
    entryId: entry.id,
    type: 'sentenceCompletion' as const,
    variant,
    isProduction: true,
    requiresTypedInput: true,
    englishSentence: example.english,
    answerLanguage: 'de' as const,
  };

  switch (variant) {
    case 'vocabularyGap': {
      const token = example.targetTokens[0];
      if (!token) return null;
      const split = splitAroundToken(example.german, token);
      if (!split) return null;
      return {
        ...base,
        prompt: 'Fill in the missing word.',
        hint: primaryEnglish(entry),
        strictness: strictnessFor(entry),
        sentenceBefore: split.before,
        sentenceAfter: split.after,
        fullSentence: example.german,
        acceptedAnswers: [split.matched],
        canonicalAnswer: split.matched,
      };
    }

    case 'articleGap': {
      if (!isNounEntry(entry) || !entry.article) return null;
      // Only build an article gap when the sentence actually uses the definite article
      // directly before the noun, so there is exactly one intended answer.
      const pattern = new RegExp(`\\b(der|die|das)\\s+(${escapeRegex(entry.german)})\\b`, 'iu');
      const match = pattern.exec(example.german);
      if (!match || match.index === undefined) return null;
      const articleInSentence = match[1] as string;
      if (fullyNormalize(articleInSentence) !== fullyNormalize(entry.article)) return null;

      return {
        ...base,
        prompt: 'Fill in the missing article.',
        hint: primaryEnglish(entry),
        strictness: { ...strictnessFor(entry), article: true },
        sentenceBefore: example.german.slice(0, match.index),
        sentenceAfter: example.german.slice(match.index + articleInSentence.length),
        fullSentence: example.german,
        acceptedAnswers: [articleInSentence],
        canonicalAnswer: articleInSentence,
      };
    }

    case 'pluralGap': {
      const plural = pluralForm(entry);
      if (!isNounEntry(entry) || !plural || !entry.plural) return null;
      const split = splitAroundToken(example.german, entry.plural);
      if (!split) return null;
      return {
        ...base,
        prompt: 'Fill in the plural form.',
        hint: primaryEnglish(entry),
        strictness: { ...strictnessFor(entry), plural: true },
        sentenceBefore: split.before,
        sentenceAfter: split.after,
        fullSentence: example.german,
        acceptedAnswers: [split.matched],
        canonicalAnswer: split.matched,
      };
    }

    case 'verbFormGap': {
      if (!isVerbEntry(entry)) return null;
      // Try the forms a sentence is most likely to contain, in order.
      for (const form of [
        entry.pastParticiple,
        entry.thirdPersonPresent,
        entry.simplePast,
        entry.infinitive,
      ].filter((value): value is string => Boolean(value))) {
        const split = splitAroundToken(example.german, form);
        if (!split) continue;
        return {
          ...base,
          prompt: 'Fill in the correct verb form.',
          hint: `${entry.infinitive} — ${primaryEnglish(entry)}`,
          strictness: strictnessFor(entry),
          sentenceBefore: split.before,
          sentenceAfter: split.after,
          fullSentence: example.german,
          acceptedAnswers: [split.matched],
          canonicalAnswer: split.matched,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function availableSentenceCompletionVariants(
  entry: VocabularyEntry,
): SentenceCompletionVariant[] {
  const variants: SentenceCompletionVariant[] = ['vocabularyGap'];
  if (isNounEntry(entry) && entry.article) variants.push('articleGap');
  if (pluralForm(entry)) variants.push('pluralGap');
  if (isVerbEntry(entry) && entry.pastParticiple) variants.push('verbFormGap');
  return variants;
}
