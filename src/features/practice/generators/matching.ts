import type { MatchingExercise, MatchingPair } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';
import {
  headword,
  isNounEntry,
  isVerbEntry,
  pluralForm,
  primaryEnglish,
  strictnessFor,
} from './entryHelpers';

/**
 * Matching (§15).
 *
 * 5–8 pairs. Unlike the other formats a matching exercise covers a *group* of entries,
 * so it is generated from a set rather than a single entry. Interaction requirements
 * (mouse, keyboard, click-to-select) live in the component; drag-and-drop is never the
 * only way to answer.
 */

export type MatchingVariant = 'germanToEnglish' | 'nounToPlural' | 'verbToParticiple';

const MIN_PAIRS = 5;
const MAX_PAIRS = 8;

export interface MatchingContext {
  readonly entries: readonly VocabularyEntry[];
  readonly random: Random;
  readonly id: string;
}

function pairsFor(entries: readonly VocabularyEntry[], variant: MatchingVariant): MatchingPair[] {
  const pairs: MatchingPair[] = [];
  const seenRight = new Set<string>();

  for (const entry of entries) {
    let left: string | null = null;
    let right: string | null = null;

    switch (variant) {
      case 'germanToEnglish':
        left = headword(entry);
        right = primaryEnglish(entry) || null;
        break;
      case 'nounToPlural':
        if (!isNounEntry(entry)) break;
        left = headword(entry);
        right = pluralForm(entry);
        break;
      case 'verbToParticiple':
        if (!isVerbEntry(entry)) break;
        left = entry.infinitive;
        right = entry.pastParticiple;
        break;
    }

    if (!left || !right) continue;
    // Two entries sharing a right-hand value would make the exercise ambiguous.
    if (seenRight.has(right)) continue;
    seenRight.add(right);
    pairs.push({ id: entry.id, left, right });
    if (pairs.length >= MAX_PAIRS) break;
  }

  return pairs;
}

export function generateMatching(
  context: MatchingContext,
  variant: MatchingVariant,
): MatchingExercise | null {
  const { entries, random, id } = context;
  const pairs = pairsFor(entries, variant);
  if (pairs.length < MIN_PAIRS) return null;

  const prompts: Record<MatchingVariant, string> = {
    germanToEnglish: 'Match each German word to its English meaning.',
    nounToPlural: 'Match each noun to its plural.',
    verbToParticiple: 'Match each verb to its past participle.',
  };

  // Shuffle until the right column is not in the same order as the pairs, so the answer
  // is never simply "first to first".
  let shuffledRight = random.shuffle(pairs.map((pair) => pair.right));
  if (pairs.length > 1 && shuffledRight.every((value, index) => value === pairs[index]?.right)) {
    shuffledRight = [...shuffledRight.slice(1), shuffledRight[0] as string];
  }

  const firstEntry = entries[0] as VocabularyEntry;

  return {
    id,
    // A matching exercise spans several entries; the first is used for attribution.
    entryId: firstEntry.id,
    type: 'matching',
    variant,
    isProduction: false,
    requiresTypedInput: false,
    prompt: prompts[variant],
    strictness: strictnessFor(firstEntry),
    pairs,
    shuffledRight,
  };
}

export function availableMatchingVariants(entries: readonly VocabularyEntry[]): MatchingVariant[] {
  const variants: MatchingVariant[] = [];
  if (pairsFor(entries, 'germanToEnglish').length >= MIN_PAIRS) variants.push('germanToEnglish');
  if (pairsFor(entries, 'nounToPlural').length >= MIN_PAIRS) variants.push('nounToPlural');
  if (pairsFor(entries, 'verbToParticiple').length >= MIN_PAIRS) {
    variants.push('verbToParticiple');
  }
  return variants;
}
