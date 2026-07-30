import type { WordOrderingExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { firstExample, isNounEntry, isPhraseEntry, strictnessFor } from './entryHelpers';
import type { GeneratorContext } from './multipleChoice';

/**
 * Word ordering (§15).
 *
 * 4–12 tokens. Only sentences in that range are used; longer example sentences are
 * skipped rather than truncated, because a truncated German sentence would teach a wrong
 * word order. All valid orders are accepted — for the reconstructions built here that is
 * the original order, plus documented alternates where German genuinely allows them.
 */

export type WordOrderingVariant =
  'sentenceReconstruction' | 'phraseReconstruction' | 'articleNounOrdering';

const MIN_TOKENS = 4;
const MAX_TOKENS = 12;

function tokensOf(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

/**
 * Ensures the shuffled presentation is not already the correct answer, which would let a
 * learner score without doing anything.
 */
function shuffleAwayFromAnswer(
  tokens: readonly string[],
  shuffle: (t: readonly string[]) => string[],
): string[] {
  const target = tokens.join(' ');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = shuffle(tokens);
    if (candidate.join(' ') !== target) return candidate;
  }
  // Degenerate case (e.g. repeated identical tokens): rotate instead.
  return [...tokens.slice(1), tokens[0] as string];
}

export function generateWordOrdering(
  context: GeneratorContext,
  variant: WordOrderingVariant,
): WordOrderingExercise | null {
  const { entry, random, id } = context;

  const build = (
    source: string,
    prompt: string,
    hint: string | undefined,
    acceptedOrders: string[][],
  ): WordOrderingExercise | null => {
    const tokens = tokensOf(source);
    if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS) return null;
    return {
      id,
      entryId: entry.id,
      type: 'wordOrdering',
      variant,
      isProduction: true,
      requiresTypedInput: false,
      prompt,
      ...(hint === undefined ? {} : { hint }),
      strictness: { ...strictnessFor(entry), wordOrder: true },
      tokens: shuffleAwayFromAnswer(tokens, random.shuffle),
      acceptedOrders,
      canonicalAnswer: tokens.join(' '),
    };
  };

  switch (variant) {
    case 'sentenceReconstruction': {
      const example = firstExample(entry);
      if (!example) return null;
      const tokens = tokensOf(example.german);
      return build(example.german, 'Put the words in the correct order.', example.english, [
        tokens,
      ]);
    }

    case 'phraseReconstruction': {
      if (!isPhraseEntry(entry)) return null;
      const tokens = tokensOf(entry.german);
      return build(entry.german, 'Rebuild the German phrase.', entry.english[0], [tokens]);
    }

    case 'articleNounOrdering': {
      // Article + noun is only two tokens, so this variant uses the example sentence and
      // requires that the article and noun appear in it.
      if (!isNounEntry(entry) || !entry.article) return null;
      const example = firstExample(entry);
      if (!example) return null;
      if (!example.german.includes(entry.german)) return null;
      const tokens = tokensOf(example.german);
      return build(
        example.german,
        'Put the words in the correct order, keeping the article with its noun.',
        example.english,
        [tokens],
      );
    }

    default:
      return null;
  }
}

export function availableWordOrderingVariants(entry: VocabularyEntry): WordOrderingVariant[] {
  const variants: WordOrderingVariant[] = [];
  const example = firstExample(entry);
  if (example) {
    const count = tokensOf(example.german).length;
    if (count >= MIN_TOKENS && count <= MAX_TOKENS) variants.push('sentenceReconstruction');
  }
  if (isPhraseEntry(entry)) {
    const count = tokensOf(entry.german).length;
    if (count >= MIN_TOKENS && count <= MAX_TOKENS) variants.push('phraseReconstruction');
  }
  return variants;
}
