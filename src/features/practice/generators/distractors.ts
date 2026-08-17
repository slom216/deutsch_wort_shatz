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
 * Near miss (§15).
 *
 * One option per question is the correct answer carrying a single mistake a learner would
 * plausibly make, so half-remembering the shape of the word is not enough to pass. A
 * uniformly random letter is not that mistake: "der Türke" → "der Tüvke" is dismissed on
 * sight, because German never forms "üvk". Every candidate below comes from a rule instead.
 */

/**
 * Spellings a learner genuinely swaps either way, first and last letter included — "Vater" →
 * "Fater" is a real error, which is exactly why the option is worth offering.
 */
const CONFUSIONS: readonly (readonly [string, string])[] = [
  // Written out the way a keyboard without umlauts forces, and back again.
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['äu', 'eu'],
  // The digraph flip everyone makes at least once.
  ['ie', 'ei'],
];

/**
 * Simplifications, one way only. Learners drop the second letter of a doubled pair and the
 * silent h; they do not invent them. Running these backwards produced "der Türkee" and
 * "dehr Türke" — the same unreadable noise the random-letter version used to.
 */
const REDUCTIONS: readonly (readonly [string, string])[] = [
  // Umlauts get dropped, not invented — "das Auto" → "das Äuto" fooled nobody.
  ['ä', 'a'],
  ['ä', 'e'],
  ['ö', 'o'],
  ['ü', 'u'],
  ['ie', 'i'],
  ['aa', 'a'],
  ['ee', 'e'],
  ['oo', 'o'],
  ['ah', 'a'],
  ['eh', 'e'],
  ['ih', 'i'],
  ['oh', 'o'],
  ['uh', 'u'],
  // ß one way only: it cannot start a word or follow a consonant, so an invented one
  // ("sprechen" → "ßprechen") is a giveaway rather than a mistake.
  ['ß', 'ss'],
  ['ß', 's'],
  ['ss', 's'],
  ['tt', 't'],
  ['ll', 'l'],
  ['nn', 'n'],
  ['mm', 'm'],
  ['ff', 'f'],
  ['rr', 'r'],
  ['pp', 'p'],
  ['bb', 'b'],
  ['dd', 'd'],
  ['gg', 'g'],
  ['tz', 'z'],
  ['ck', 'k'],
  ['ph', 'f'],
  ['sch', 'sh'],
];

/**
 * Final devoicing: "Hund" is pronounced "Hunt", so that is how it gets written. One way
 * only, and only at the end of a word — nobody turns a final "t" into a "d".
 */
const FINAL_DEVOICING: readonly (readonly [string, string])[] = [
  ['d', 't'],
  ['b', 'p'],
  ['g', 'k'],
];

/**
 * Single letters that spell the same sound. Only swapped before a vowel: inside a cluster
 * they invent something unpronounceable ("Straße" → "Ztraße") rather than a mistake.
 */
const SOUND_ALIKE: readonly (readonly [string, string])[] = [
  ['v', 'f'],
  ['v', 'w'],
  ['s', 'z'],
  ['d', 't'],
];

/**
 * Endings swapped for a neighbouring form — the declension traps. One way each: the mistake
 * is reaching for the wrong form of the word, not shuffling letters.
 */
const ENDINGS: readonly (readonly [string, string])[] = [
  ['e', 'en'],
  ['e', 'er'],
  ['en', 'e'],
  ['en', 'n'],
  ['er', 'e'],
  ['er', 'en'],
  ['n', 'en'],
  ['ung', 'en'],
  ['heit', 'keit'],
  ['keit', 'heit'],
];

/** Shortest stem an ending swap may leave behind, so "die" does not become "dien". */
const MIN_STEM = 3;

const ARTICLES = ['der', 'die', 'das'] as const;

/**
 * A leading article, which the spelling rules leave alone. "das Auto" → "daß Auto" is not a
 * mistake anyone makes; the mistake with an article is picking the wrong one, and that is
 * what `articleSwaps` is for.
 */
const ARTICLE_PREFIX = /^(?:der|die|das)\s+/i;

const isLetter = (char: string | undefined): boolean => char !== undefined && /\p{L}/u.test(char);

const isVowel = (char: string | undefined): boolean =>
  char !== undefined && 'aeiouäöüy'.includes(char.toLowerCase());

/** Replaces `source` at `index`, giving the replacement the casing the original had. */
function replaceAt(text: string, index: number, source: string, target: string): string {
  const first = text[index] as string;
  const upper =
    first !== first.toLowerCase() ? target.charAt(0).toUpperCase() + target.slice(1) : target;
  return text.slice(0, index) + upper + text.slice(index + source.length);
}

/** Every spelling confusion that matches, in both directions where both are plausible. */
function confusions(text: string): string[] {
  const article = ARTICLE_PREFIX.exec(text)?.[0] ?? '';
  const word = text.slice(article.length);
  const lower = word.toLowerCase();
  const found = new Set<string>();

  const swap = (from: string, to: string, allowed: (index: number) => boolean): void => {
    for (let i = lower.indexOf(from); i >= 0; i = lower.indexOf(from, i + 1)) {
      if (allowed(i)) found.add(article + replaceAt(word, i, from, to));
    }
  };

  for (const [a, b] of CONFUSIONS) {
    swap(a, b, () => true);
    swap(b, a, () => true);
  }
  for (const [from, to] of REDUCTIONS) {
    swap(from, to, () => true);
  }
  for (const [voiced, voiceless] of FINAL_DEVOICING) {
    swap(voiced, voiceless, (i) => !isLetter(word[i + 1]));
  }
  for (const [a, b] of SOUND_ALIKE) {
    swap(a, b, (i) => isVowel(word[i + 1]));
    swap(b, a, (i) => isVowel(word[i + 1]));
  }

  return [...found];
}

/** The same noun under the wrong gender: "der Türke" → "die Türke". */
function articleSwaps(text: string): string[] {
  const match = /^(der|die|das)(\s)/i.exec(text);
  if (!match) return [];
  const current = (match[1] as string).toLowerCase();
  return ARTICLES.filter((article) => article !== current).map(
    (article) => article + text.slice(current.length),
  );
}

/** The same word under the wrong ending: "der Türke" → "der Türken". */
function endingSwaps(text: string): string[] {
  const match = /\S+$/.exec(text);
  if (!match) return [];
  const word = match[0];
  const lower = word.toLowerCase();
  const found = new Set<string>();

  for (const [from, to] of ENDINGS) {
    if (!lower.endsWith(from)) continue;
    const stem = word.slice(0, word.length - from.length);
    if (stem.length < MIN_STEM) continue;
    // Not across a seam that doubles a letter: "gehen" → "geheen" is a typo, not a form.
    if (stem.slice(-1).toLowerCase() === to.charAt(0)) continue;
    found.add(text.slice(0, match.index) + stem + to);
  }

  return [...found];
}

/**
 * Letters a slipped keystroke could produce. No ß: it cannot start a word or follow a
 * consonant, so a stray one is a giveaway rather than a believable mistake.
 */
const LETTERS = [...'abcdefghijklmnopqrstuvwxyzäöü'];

/**
 * One letter changed, added or removed, never the first or the last letter of a word. The
 * last resort, for the rare answer no rule above matches — a keystroke slip is at least a
 * mistake someone could make, even if it is not the one they would.
 */
function keystrokeSlips(correct: string): string[] {
  const candidates: string[] = [];

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

  return candidates;
}

/** The rules, grouped, so no family is drowned out by one that happens to match more often. */
function families(correct: string, blocked: Set<string>): string[][] {
  const allow = (values: string[]): string[] =>
    values.filter((value) => !blocked.has(value.toLowerCase()));

  const ruled = [confusions(correct), articleSwaps(correct), endingSwaps(correct)]
    .map(allow)
    .filter((family) => family.length > 0);

  return ruled.length > 0 ? ruled : [allow(keystrokeSlips(correct))];
}

/**
 * Every near miss the rules can produce for `correct`. Exported for tests, which need to
 * recognize the option rather than re-derive the rules.
 */
export function nearMissCandidates(correct: string): string[] {
  return families(correct, new Set([correct.toLowerCase()])).flat();
}

/**
 * One near miss, or null when no rule matches or every candidate collides with `taken`.
 *
 * The accepted answers belong in `taken`, along with the plural and any alternate article —
 * the article and ending rules can otherwise land on a form that is genuinely right.
 */
export function nearMiss(
  correct: string,
  random: Random,
  taken: readonly string[] = [],
): string | null {
  const blocked = new Set(taken.map((value) => value.toLowerCase()));
  blocked.add(correct.toLowerCase());

  // A family first, then a candidate within it: picking straight from the pooled list would
  // hand almost every question to the spelling rules, which match far more often.
  const family = random.pick(families(correct, blocked));
  return family === undefined ? null : (random.pick(family) ?? null);
}
