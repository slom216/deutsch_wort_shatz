import type { SentenceCompletionExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { fullyNormalize } from '../evaluation/normalize';
import {
  acceptedPlurals,
  acceptedVerbForms,
  asksForArticle,
  bareNoun,
  firstExample,
  isNounEntry,
  isVerbEntry,
  lookalikeWords,
  pluralForm,
  primaryEnglish,
  strictnessFor,
  withoutArticle,
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

/** A whole-word, case-insensitive pattern for `token`, so "Minute" never matches inside "Minuten". */
function wordPattern(token: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(token)}(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Locates `token` inside `sentence` as a whole word, case-insensitively, and splits around it.
 * Returns null when the token does not occur, which is the case for a small number of
 * entries whose generated examples do not contain their own target token.
 */
function splitAroundToken(
  sentence: string,
  token: string,
): { before: string; after: string; matched: string } | null {
  const match = wordPattern(token).exec(sentence);
  if (!match) return null;
  return {
    before: sentence.slice(0, match.index),
    after: sentence.slice(match.index + token.length),
    matched: match[0],
  };
}

/**
 * The gap for a verb form. A separable form ("fährt ab") is usually split in the sentence ("Der
 * Zug fährt um 8 Uhr ab."), and the schema has one gap: the finite part is gapped when the
 * particle follows later. `part` maps any accepted spelling onto what the gap holds.
 */
function verbGap(sentence: string, form: string) {
  const whole = splitAroundToken(sentence, form);
  if (whole) return { split: whole, part: (value: string) => value };
  const words = form.split(' ');
  const particle = words[words.length - 1] as string;
  if (words.length < 2) return null;
  const head = splitAroundToken(sentence, words[0] as string);
  if (!head || !wordPattern(particle).test(head.after)) return null;
  return { split: head, part: (value: string) => value.split(' ')[0] as string };
}

export function generateSentenceCompletion(
  context: GeneratorContext,
  variant: SentenceCompletionVariant,
): SentenceCompletionExercise | null {
  const { entry, pool, id } = context;
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
      const otherWords = lookalikeWords(entry, pool, [split.matched]);
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
        ...(otherWords.length > 0 ? { otherWords } : {}),
      };
    }

    case 'articleGap': {
      if (!isNounEntry(entry) || !entry.article || !asksForArticle(entry)) return null;
      // Only build an article gap when the sentence actually uses the definite article
      // directly before the noun, so there is exactly one intended answer.
      const pattern = new RegExp(
        `(?<![\\p{L}])(der|die|das)\\s+(${escapeRegex(bareNoun(entry))})(?![\\p{L}])`,
        'iu',
      );
      const match = pattern.exec(example.german);
      if (!match) return null;
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
      const plurals = acceptedPlurals(entry).map(withoutArticle);
      for (const plural of plurals) {
        const split = splitAroundToken(example.german, plural);
        if (!split) continue;
        return {
          ...base,
          prompt: 'Fill in the plural form.',
          hint: primaryEnglish(entry),
          strictness: { ...strictnessFor(entry), plural: true },
          sentenceBefore: split.before,
          sentenceAfter: split.after,
          fullSentence: example.german,
          acceptedAnswers: [...new Set([split.matched, ...plurals])],
          canonicalAnswer: split.matched,
        };
      }
      return null;
    }

    case 'verbFormGap': {
      if (!isVerbEntry(entry)) return null;
      // Try the forms a sentence is most likely to contain, in order, each with its accepted
      // spellings. The infinitive last: it has no alternatives recorded.
      const forms: string[][] = [
        acceptedVerbForms(entry, 'pastParticiple'),
        acceptedVerbForms(entry, 'thirdPersonPresent'),
        acceptedVerbForms(entry, 'simplePast'),
        [entry.infinitive],
      ];
      for (const spellings of forms) {
        for (const form of spellings) {
          const gap = verbGap(example.german, form);
          if (!gap) continue;
          const { split, part } = gap;
          return {
            ...base,
            // The infinitive in the prompt: without it the gap could take any verb.
            prompt: `Fill in the correct form of ${entry.infinitive}.`,
            hint: primaryEnglish(entry),
            strictness: strictnessFor(entry),
            sentenceBefore: split.before,
            sentenceAfter: split.after,
            fullSentence: example.german,
            acceptedAnswers: [...new Set([split.matched, ...spellings.map(part)])],
            canonicalAnswer: split.matched,
          };
        }
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
  if (asksForArticle(entry)) variants.push('articleGap');
  if (pluralForm(entry)) variants.push('pluralGap');
  if (
    isVerbEntry(entry) &&
    (entry.pastParticiple || entry.thirdPersonPresent || entry.simplePast)
  ) {
    variants.push('verbFormGap');
  }
  return variants;
}
