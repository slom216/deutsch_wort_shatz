import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';

/**
 * Distractor selection (§15).
 *
 * Distractors must be plausible and are preferably drawn from the same topic or a nearby
 * frequency range, so a multiple-choice question cannot be solved by noticing that three
 * options are obviously from a different part of the vocabulary.
 */

/** How far apart two ranks may be and still count as "nearby frequency". */
const NEARBY_RANK_WINDOW = 400;

export interface DistractorOptions<T> {
  readonly target: VocabularyEntry;
  readonly pool: readonly VocabularyEntry[];
  readonly count: number;
  readonly random: Random;
  /** Extracts the option text. Entries that yield null are skipped. */
  readonly valueOf: (entry: VocabularyEntry) => T | null;
  /** Values that must not appear as distractors (typically the correct answer). */
  readonly exclude?: readonly T[];
  /** Restricts the pool, e.g. to nouns only for an article question. */
  readonly filter?: (entry: VocabularyEntry) => boolean;
}

/**
 * Returns up to `count` distinct distractor values, preferring same-topic candidates,
 * then nearby-frequency candidates, then anything else that is valid.
 */
export function selectDistractors<T>(options: DistractorOptions<T>): T[] {
  const { target, pool, count, random, valueOf, exclude = [], filter } = options;

  const taken = new Set<string>(exclude.map((value) => JSON.stringify(value)));
  const candidates = pool.filter(
    (entry) => entry.id !== target.id && (filter ? filter(entry) : true),
  );

  const sameTopic: VocabularyEntry[] = [];
  const nearbyRank: VocabularyEntry[] = [];
  const rest: VocabularyEntry[] = [];

  for (const entry of candidates) {
    if (entry.primaryTopic === target.primaryTopic) sameTopic.push(entry);
    else if (Math.abs(entry.rank - target.rank) <= NEARBY_RANK_WINDOW) nearbyRank.push(entry);
    else rest.push(entry);
  }

  const results: T[] = [];
  // Same word class first within each tier: an article question wants other nouns, and a
  // translation question is harder when the options are all the same part of speech.
  const tiers = [sameTopic, nearbyRank, rest].map((tier) => {
    const sameClass = tier.filter((entry) => entry.wordClass === target.wordClass);
    const otherClass = tier.filter((entry) => entry.wordClass !== target.wordClass);
    return [...random.shuffle(sameClass), ...random.shuffle(otherClass)];
  });

  for (const tier of tiers) {
    for (const entry of tier) {
      if (results.length >= count) return results;
      const value = valueOf(entry);
      if (value === null) continue;
      const key = JSON.stringify(value);
      if (taken.has(key)) continue;
      taken.add(key);
      results.push(value);
    }
  }

  return results;
}
