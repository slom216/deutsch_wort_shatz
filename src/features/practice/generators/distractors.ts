import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Random } from '../random';

/**
 * Distractor selection (§15).
 *
 * Distractors must be plausible. Three preferences apply, outermost first:
 *
 *  1. the same CEFR level as the target;
 *  2. an English gloss of similar length — within ±2 letters, widening only when too few
 *     candidates qualify. Option length is otherwise a giveaway: a learner who knows
 *     nothing can still spot the one long answer among five short ones;
 *  3. the same topic, then a nearby frequency range, then anything else (§15).
 */

/** How far apart two ranks may be and still count as "nearby frequency". */
const NEARBY_RANK_WINDOW = 400;

/**
 * Gloss-length windows, tried in order. The last is unbounded, so selection degrades to
 * "any plausible candidate" rather than returning too few options.
 */
const GLOSS_LENGTH_WINDOWS: readonly number[] = [2, 3, 4, Number.POSITIVE_INFINITY];

function glossLength(entry: VocabularyEntry): number {
  return (entry.english[0] ?? '').length;
}

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
  const eligible = pool.filter(
    (entry) => entry.id !== target.id && (filter ? filter(entry) : true),
  );

  // Prefer the target's own level, but only while that still leaves enough candidates —
  // a review session's pool does not always cover every level its due entries span.
  const sameLevel = eligible.filter((entry) => entry.level === target.level);
  const candidates = sameLevel.length >= count ? sameLevel : eligible;

  /** Same topic, then nearby frequency, then the rest; same word class first within each. */
  const byRelatedness = (group: readonly VocabularyEntry[]): VocabularyEntry[] => {
    const sameTopic: VocabularyEntry[] = [];
    const nearbyRank: VocabularyEntry[] = [];
    const rest: VocabularyEntry[] = [];

    for (const entry of group) {
      if (entry.primaryTopic === target.primaryTopic) sameTopic.push(entry);
      else if (Math.abs(entry.rank - target.rank) <= NEARBY_RANK_WINDOW) nearbyRank.push(entry);
      else rest.push(entry);
    }

    // Same word class first: an article question wants other nouns, and a translation
    // question is harder when the options are all the same part of speech.
    return [sameTopic, nearbyRank, rest].flatMap((tier) => {
      const sameClass = tier.filter((entry) => entry.wordClass === target.wordClass);
      const otherClass = tier.filter((entry) => entry.wordClass !== target.wordClass);
      return [...random.shuffle(sameClass), ...random.shuffle(otherClass)];
    });
  };

  const targetLength = glossLength(target);
  const buckets: VocabularyEntry[][] = GLOSS_LENGTH_WINDOWS.map(() => []);
  for (const entry of candidates) {
    const delta = Math.abs(glossLength(entry) - targetLength);
    const index = GLOSS_LENGTH_WINDOWS.findIndex((window) => delta <= window);
    (buckets[index] as VocabularyEntry[]).push(entry);
  }

  const results: T[] = [];
  const tiers = buckets.map(byRelatedness);

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

/**
 * Letters a slipped keystroke could produce. No ß: it cannot start a word or follow a
 * consonant, so a stray one is a giveaway rather than a believable mistake.
 */
const LETTERS = [...'abcdefghijklmnopqrstuvwxyzäöü'];

/**
 * The correct answer with exactly one letter changed, added or removed — never the first or
 * the last letter of a word, so the option still reads as an attempt at the same word (§15).
 *
 * One option per question is built this way: a learner who only half-remembers the spelling
 * should not be able to pass on the shape of the word alone.
 *
 * Null when the answer has nowhere to take an edit — a single letter, or a string with no
 * two adjacent letters — or when every edit collides with a value in `taken`. The accepted
 * answers belong in `taken`, or a "wrong" option could turn out to be right.
 */
export function nearMiss(
  correct: string,
  random: Random,
  taken: readonly string[] = [],
): string | null {
  const blocked = new Set(taken.map((value) => value.toLowerCase()));
  blocked.add(correct.toLowerCase());

  const candidates: string[] = [];
  const isLetter = (char: string | undefined): boolean => char !== undefined && /\p{L}/u.test(char);

  for (let i = 1; i < correct.length; i += 1) {
    const char = correct[i] as string;
    // Both tests are per word, not per string: in a phrase, the first and last letter of
    // every word are protected, so "Guten Morgen" never becomes "Guten Torgen".
    const canAdd = isLetter(correct[i - 1]) && isLetter(char);
    const canEdit = canAdd && isLetter(correct[i + 1]);

    for (const letter of LETTERS) {
      const cased = char === char.toLowerCase() ? letter : letter.toUpperCase();
      // Added: between two letters, so the new one is neither first nor last.
      if (canAdd) candidates.push(correct.slice(0, i) + cased + correct.slice(i));
      // Changed.
      if (canEdit && cased !== char) {
        candidates.push(correct.slice(0, i) + cased + correct.slice(i + 1));
      }
    }
    // Removed.
    if (canEdit) candidates.push(correct.slice(0, i) + correct.slice(i + 1));
  }

  return random.pick(candidates.filter((value) => !blocked.has(value.toLowerCase()))) ?? null;
}
