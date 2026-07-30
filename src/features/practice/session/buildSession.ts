import type { Exercise } from '@/schemas/exerciseSchema';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';
import type { EntryProgress } from '@/schemas/progressSchema';
import { planFor, scoreExercise } from '@/features/srs/adaptation';
import { createRandom, type Random } from '../random';
import { generateAllForEntry } from '../generators';
import { availableMatchingVariants, generateMatching } from '../generators/matching';

/**
 * Session construction (§19).
 *
 * Default review session:
 *   - 20 exercises over 12–16 entries, using 4–6 exercise types;
 *   - no more than 3 identical exercise types consecutively;
 *   - no more than 2 exercises for the same entry consecutively;
 *   - at least 40% active production, at least 25% typed input;
 *   - listening and speaking only when enabled and supported.
 *
 * Default new-word session:
 *   - 5 entries, 2–3 exercises each, recognition first then production, mixed recap.
 *
 * The builder is deterministic given a seed, so a session survives a page refresh.
 */

export type SessionMode = 'new' | 'review' | 'topic' | 'free';

export interface BuildSessionOptions {
  readonly mode: SessionMode;
  readonly entries: readonly VocabularyEntry[];
  /** Distractor pool. Defaults to `entries`; pass a wider set for better distractors. */
  readonly pool?: readonly VocabularyEntry[];
  readonly seed: string;
  readonly targetExerciseCount?: number;
  /** Types the learner has enabled; listening/speaking are excluded when unsupported. */
  readonly allowedTypes?: readonly ExerciseType[];
  /**
   * Stored progress, keyed by entry id. When present, each entry's exercises are chosen
   * to suit its automatic difficulty (§21): a struggling word returns to recognition with
   * simpler choices, an easy word is pushed towards typed production, and whichever
   * grammatical property the learner keeps getting wrong is targeted first.
   *
   * Omitted for a learner with no history, where every entry is treated as medium.
   */
  readonly progressByEntry?: ReadonlyMap<string, EntryProgress>;
}

export interface BuiltSession {
  readonly exercises: readonly Exercise[];
  readonly entryIds: readonly string[];
  readonly exerciseTypes: readonly ExerciseType[];
  /** Share of exercises requiring German production, 0–1. */
  readonly productionRatio: number;
  /** Share of exercises requiring typed input, 0–1. */
  readonly typedRatio: number;
}

const DEFAULT_REVIEW_EXERCISES = 20;
const REVIEW_MIN_ENTRIES = 12;
const REVIEW_MAX_ENTRIES = 16;
const NEW_WORD_ENTRIES = 5;
const MAX_SAME_TYPE_RUN = 3;
const MAX_SAME_ENTRY_RUN = 2;
const MIN_PRODUCTION_RATIO = 0.4;
const MIN_TYPED_RATIO = 0.25;

/**
 * Reorders exercises so no more than `maxTypeRun` share a consecutive type and no more
 * than `maxEntryRun` consecutively belong to one entry.
 *
 * Greedy with a bounded look-ahead: at each step it takes the first candidate that does
 * not violate a constraint, falling back to the next best when none qualifies. This
 * cannot fail — in the worst case it emits the remaining items in order.
 */
export function interleave(
  exercises: readonly Exercise[],
  maxTypeRun = MAX_SAME_TYPE_RUN,
  maxEntryRun = MAX_SAME_ENTRY_RUN,
  /**
   * When true, an entry's exercises keep their relative order. Required for new-word
   * sessions (recognition before production, §19). Review sessions leave this off, which
   * gives the scheduler enough freedom to always satisfy the run limits.
   */
  preserveEntryOrder = false,
): Exercise[] {
  const remaining = [...exercises];
  const ordered: Exercise[] = [];

  /** 0 when the candidate breaks nothing; higher is worse. Type runs are the worse sin. */
  const penalty = (candidate: Exercise): number => {
    const typeRun = countTrailing(ordered, (e) => e.type === candidate.type);
    const entryRun = countTrailing(ordered, (e) => e.entryId === candidate.entryId);
    return (typeRun >= maxTypeRun ? 2 : 0) + (entryRun >= maxEntryRun ? 1 : 0);
  };

  while (remaining.length > 0) {
    // Only the earliest remaining exercise of each entry is eligible, so reordering can
    // never disturb the within-entry sequence — a new-word entry must keep its
    // recognition exercise ahead of its production one (§19).
    const eligible: number[] = [];
    if (preserveEntryOrder) {
      const seenEntries = new Set<string>();
      remaining.forEach((exercise, index) => {
        if (seenEntries.has(exercise.entryId)) return;
        seenEntries.add(exercise.entryId);
        eligible.push(index);
      });
    } else {
      remaining.forEach((_, index) => eligible.push(index));
    }

    // Among non-violating candidates, take the type with the most exercises still to
    // place. Draining the dominant type steadily is what stops it bunching into a long
    // run at the tail — the usual failure mode of a purely violation-avoiding greedy.
    const remainingByType = new Map<string, number>();
    for (const exercise of remaining) {
      remainingByType.set(exercise.type, (remainingByType.get(exercise.type) ?? 0) + 1);
    }

    let index = eligible[0] ?? 0;
    let bestPenalty = Number.POSITIVE_INFINITY;
    let bestFrequency = -1;
    for (const position of eligible) {
      const candidate = remaining[position] as Exercise;
      const score = penalty(candidate);
      const frequency = remainingByType.get(candidate.type) ?? 0;
      if (score < bestPenalty || (score === bestPenalty && frequency > bestFrequency)) {
        bestPenalty = score;
        bestFrequency = frequency;
        index = position;
      }
    }

    ordered.push(remaining[index] as Exercise);
    remaining.splice(index, 1);
  }

  return ordered;
}

function countTrailing(items: readonly Exercise[], predicate: (e: Exercise) => boolean): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!item || !predicate(item)) break;
    count += 1;
  }
  return count;
}

/**
 * Picks exercises for one entry, preferring a recognition exercise before a production
 * one so a newly introduced word is always recognised before it must be produced.
 */
function orderRecognitionFirst(exercises: readonly Exercise[]): Exercise[] {
  const recognition = exercises.filter((e) => !e.isProduction);
  const production = exercises.filter((e) => e.isProduction);
  return [...recognition, ...production];
}

/**
 * Raises the production and typed-input share to the §19 minimums by swapping in
 * production exercises that were generated but not selected.
 */
function enforceRatios(
  selected: Exercise[],
  spare: readonly Exercise[],
  targetCount: number,
): Exercise[] {
  const result = [...selected];

  const productionNeeded = Math.ceil(targetCount * MIN_PRODUCTION_RATIO);
  const typedNeeded = Math.ceil(targetCount * MIN_TYPED_RATIO);

  const floors: ReadonlyArray<{
    predicate: (exercise: Exercise) => boolean;
    required: number;
  }> = [
    { predicate: (exercise) => exercise.isProduction, required: productionNeeded },
    { predicate: (exercise) => exercise.requiresTypedInput, required: typedNeeded },
  ];

  /**
   * True when replacing `removing` with `adding` would push an already-satisfied floor
   * back below its minimum. Without this the typed-input pass could displace a
   * production exercise and silently undo the production pass.
   */
  const wouldBreakSatisfiedFloor = (removing: Exercise, adding: Exercise): boolean =>
    floors.some(({ predicate, required }) => {
      const before = result.filter(predicate).length;
      if (before < required) return false;
      const after = before - (predicate(removing) ? 1 : 0) + (predicate(adding) ? 1 : 0);
      return after < required;
    });

  const swapIn = (predicate: (exercise: Exercise) => boolean, required: number): void => {
    const have = () => result.filter(predicate).length;

    while (have() < required) {
      // Swap same-entry-for-same-entry wherever possible, so raising the production or
      // typed share never changes how many exercises each entry contributes.
      let replacedIndex = -1;
      let replacement: Exercise | undefined;

      for (let index = 0; index < result.length; index += 1) {
        const current = result[index] as Exercise;
        if (predicate(current)) continue;
        replacement = spare.find(
          (candidate) =>
            candidate.entryId === current.entryId &&
            predicate(candidate) &&
            !result.some((existing) => existing.id === candidate.id) &&
            !wouldBreakSatisfiedFloor(current, candidate),
        );
        if (replacement) {
          replacedIndex = index;
          break;
        }
      }

      // Fall back to a cross-entry swap. The §19 ratio floors are hard requirements,
      // whereas perfectly even entry coverage is only a preference.
      if (!replacement) {
        for (let index = 0; index < result.length; index += 1) {
          const current = result[index] as Exercise;
          if (predicate(current)) continue;
          // Never strand an entry: only displace one that appears more than once.
          if (result.filter((e) => e.entryId === current.entryId).length < 2) continue;
          replacement = spare.find(
            (candidate) =>
              predicate(candidate) &&
              !result.some((existing) => existing.id === candidate.id) &&
              !wouldBreakSatisfiedFloor(current, candidate),
          );
          if (replacement) {
            replacedIndex = index;
            break;
          }
        }
      }

      if (!replacement || replacedIndex < 0) return;
      result[replacedIndex] = replacement;
    }
  };

  swapIn((exercise) => exercise.isProduction, productionNeeded);
  swapIn((exercise) => exercise.requiresTypedInput, typedNeeded);

  return result;
}

function pickEntries(
  entries: readonly VocabularyEntry[],
  mode: SessionMode,
  random: Random,
): VocabularyEntry[] {
  if (mode === 'new') return entries.slice(0, NEW_WORD_ENTRIES);

  const desired = Math.min(
    Math.max(REVIEW_MIN_ENTRIES, Math.min(REVIEW_MAX_ENTRIES, entries.length)),
    entries.length,
  );
  // Keep frequency order rather than shuffling entries: high-frequency first (§3).
  return entries.slice(0, desired === 0 ? entries.length : desired).length > 0
    ? entries.slice(0, desired)
    : random.shuffle(entries).slice(0, desired);
}

export function buildSession(options: BuildSessionOptions): BuiltSession {
  const { mode, entries, seed, allowedTypes } = options;
  const pool = options.pool ?? entries;
  const random = createRandom(seed);

  if (entries.length === 0) {
    return {
      exercises: [],
      entryIds: [],
      exerciseTypes: [],
      productionRatio: 0,
      typedRatio: 0,
    };
  }

  const sessionEntries = pickEntries(entries, mode, random);
  const targetCount =
    options.targetExerciseCount ??
    (mode === 'new' ? sessionEntries.length * 3 : DEFAULT_REVIEW_EXERCISES);

  // Generate everything available, then choose from it.
  const byEntry = new Map<string, Exercise[]>();
  for (const entry of sessionEntries) {
    const generated = generateAllForEntry({
      entry,
      pool,
      random,
      id: `${seed}-${entry.id}`,
      ...(allowedTypes ? { allowedTypes } : {}),
    });
    if (generated.length > 0) byEntry.set(entry.id, generated);
  }

  // Matching is generated from the entry group rather than per entry, so a session
  // restricted to matching alone legitimately has no per-entry exercises at all. Only
  // give up once matching has also been ruled out.
  const matchingAllowed = !allowedTypes || allowedTypes.includes('matching');
  if (byEntry.size === 0 && !(matchingAllowed && sessionEntries.length >= 5)) {
    return { exercises: [], entryIds: [], exerciseTypes: [], productionRatio: 0, typedRatio: 0 };
  }

  const perEntryTarget =
    mode === 'new' ? 3 : Math.max(1, Math.ceil(targetCount / Math.max(1, byEntry.size)));

  const spare: Exercise[] = [];
  // Per-entry queues, each ordered so distinct formats come first — a learner should not
  // be asked the same format twice for one entry while another format is still available.
  const queues: Exercise[][] = [];

  for (const [entryId, generated] of byEntry) {
    // Difficulty-aware ordering (§21). A new-word session always leads with recognition;
    // otherwise the adaptation plan for this entry decides which formats come first, so a
    // hard word is not handed a word-ordering exercise while an easy one still gets
    // multiple choice.
    const progress = options.progressByEntry?.get(entryId);
    let ordered: Exercise[];
    if (mode === 'new') {
      ordered = orderRecognitionFirst(generated);
    } else if (progress) {
      const plan = planFor(progress);
      // Shuffle first so equally-scored exercises still vary between sessions, then sort
      // by score. `sort` is stable, so the shuffle survives within a score band.
      ordered = random
        .shuffle(generated)
        .map((exercise, index) => ({ exercise, index, score: scoreExercise(plan, exercise) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((scored) => scored.exercise);
    } else {
      ordered = random.shuffle(generated);
    }

    const seenTypes = new Set<string>();
    const preferred: Exercise[] = [];
    const rest: Exercise[] = [];
    for (const exercise of ordered) {
      if (!seenTypes.has(exercise.type)) {
        seenTypes.add(exercise.type);
        preferred.push(exercise);
      } else {
        rest.push(exercise);
      }
    }
    queues.push(preferred.slice(0, perEntryTarget));
    spare.push(...preferred.slice(perEntryTarget), ...rest);
  }

  // Round-robin across entries rather than concatenating per-entry blocks: truncating a
  // concatenated list to the target count would silently drop the last entries entirely.
  const selected: Exercise[] = [];
  for (let round = 0; round < perEntryTarget; round += 1) {
    for (const queue of queues) {
      const exercise = queue[round];
      if (exercise) selected.push(exercise);
    }
  }

  // A matching exercise covers several entries at once and counts as one exercise.
  // In a mixed session one is plenty; when matching is the only enabled type, build as
  // many as the target needs from successive groups of entries.
  if (matchingAllowed && mode !== 'new' && sessionEntries.length >= 5) {
    const matchingOnly = byEntry.size === 0;
    const wanted = matchingOnly ? targetCount : 1;
    const GROUP_SIZE = 8;

    for (let index = 0, built = 0; built < wanted; index += GROUP_SIZE) {
      const group = sessionEntries.slice(index, index + GROUP_SIZE);
      if (group.length < 5) break;

      const variant = availableMatchingVariants(group)[0];
      if (!variant) continue;

      const matching = generateMatching(
        { entries: group, random, id: `${seed}-matching-${index}` },
        variant,
      );
      if (!matching) continue;
      selected.push(matching);
      built += 1;
    }
  }

  let chosen = selected.slice(0, targetCount);
  // Top up from spares when entries could not each supply their quota.
  for (const candidate of spare) {
    if (chosen.length >= targetCount) break;
    chosen.push(candidate);
  }

  // The production and typed-input floors in §19 are stated for review sessions. A
  // new-word session follows its own rule instead: recognition first, production second.
  if (mode !== 'new') {
    chosen = enforceRatios(chosen, spare, chosen.length);
  }
  const ordered = interleave(chosen, MAX_SAME_TYPE_RUN, MAX_SAME_ENTRY_RUN, mode === 'new');

  const productionCount = ordered.filter((e) => e.isProduction).length;
  const typedCount = ordered.filter((e) => e.requiresTypedInput).length;

  return {
    exercises: ordered,
    entryIds: [...new Set(ordered.map((e) => e.entryId))],
    exerciseTypes: [...new Set(ordered.map((e) => e.type))],
    productionRatio: ordered.length === 0 ? 0 : productionCount / ordered.length,
    typedRatio: ordered.length === 0 ? 0 : typedCount / ordered.length,
  };
}
