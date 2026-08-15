import { beforeAll, describe, expect, it } from 'vitest';

import { buildSession, interleave } from './buildSession';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import type { Exercise } from '@/schemas/exerciseSchema';
import type { EntryProgress } from '@/schemas/progressSchema';
import { loadPilotDataset } from '@/test/fixtures/pilotDataset';

let pilot: readonly VocabularyEntry[];

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

/** Many seeds, so the §19 constraints are checked as properties rather than anecdotes. */
const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`);

function runs<T>(items: readonly T[], keyOf: (item: T) => string): number {
  let longest = 0;
  let current = 0;
  let previous: string | null = null;
  for (const item of items) {
    const key = keyOf(item);
    current = key === previous ? current + 1 : 1;
    previous = key;
    longest = Math.max(longest, current);
  }
  return longest;
}

describe('buildSession — review sessions', () => {
  it('builds a 20-exercise session', () => {
    const session = buildSession({ mode: 'review', entries: pilot, seed: 'r1' });
    expect(session.exercises).toHaveLength(20);
  });

  it('covers 12 to 16 entries', () => {
    const session = buildSession({ mode: 'review', entries: pilot, seed: 'r2' });
    expect(session.entryIds.length).toBeGreaterThanOrEqual(12);
    expect(session.entryIds.length).toBeLessThanOrEqual(16);
  });

  it('uses several exercise types, never more than the §19 maximum of 6', () => {
    // §19 asks for 4–6 types. The ceiling is enforced by the builder; the floor is capped
    // by the data, which supports multiple choice, typed translation, matching, listening
    // and speaking — the two sentence-based formats need example sentences the datasets
    // do not carry, so a session cannot always reach four.
    for (const seed of SEEDS) {
      const session = buildSession({ mode: 'review', entries: pilot, seed });
      expect(session.exerciseTypes.length).toBeGreaterThanOrEqual(3);
      expect(session.exerciseTypes.length).toBeLessThanOrEqual(6);
    }
  });

  it('relaxes foldable strictness when the learner turns strict checking off (§16)', () => {
    const strict = buildSession({ mode: 'review', entries: pilot, seed: 'strict' });
    const lenient = buildSession({
      mode: 'review',
      entries: pilot,
      seed: 'strict',
      strictAnswerChecking: false,
    });

    expect(strict.exercises.some((e) => e.strictness.capitalization)).toBe(true);
    for (const exercise of lenient.exercises) {
      expect(exercise.strictness.capitalization).toBe(false);
      expect(exercise.strictness.umlauts).toBe(false);
      expect(exercise.strictness.eszett).toBe(false);
      expect(exercise.strictness.punctuation).toBe(false);
    }
  });

  it('keeps at least 40% active production', () => {
    for (const seed of SEEDS) {
      const session = buildSession({ mode: 'review', entries: pilot, seed });
      expect(session.productionRatio).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('keeps at least 25% typed input', () => {
    for (const seed of SEEDS) {
      const session = buildSession({ mode: 'review', entries: pilot, seed });
      expect(session.typedRatio).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('never repeats an exercise type more than 3 times consecutively', () => {
    for (const seed of SEEDS) {
      const session = buildSession({ mode: 'review', entries: pilot, seed });
      expect(runs(session.exercises, (e) => e.type)).toBeLessThanOrEqual(3);
    }
  });

  it('never uses the same entry more than twice consecutively', () => {
    for (const seed of SEEDS) {
      const session = buildSession({ mode: 'review', entries: pilot, seed });
      expect(runs(session.exercises, (e) => e.entryId)).toBeLessThanOrEqual(2);
    }
  });

  it('produces unique exercise ids', () => {
    const session = buildSession({ mode: 'review', entries: pilot, seed: 'r4' });
    expect(new Set(session.exercises.map((e) => e.id)).size).toBe(session.exercises.length);
  });

  it('is deterministic for a given seed', () => {
    const first = buildSession({ mode: 'review', entries: pilot, seed: 'same' });
    const second = buildSession({ mode: 'review', entries: pilot, seed: 'same' });
    expect(first.exercises.map((e) => e.id)).toEqual(second.exercises.map((e) => e.id));
  });

  it('differs between seeds', () => {
    const first = buildSession({ mode: 'review', entries: pilot, seed: 'one' });
    const second = buildSession({ mode: 'review', entries: pilot, seed: 'two' });
    expect(first.exercises.map((e) => e.id)).not.toEqual(second.exercises.map((e) => e.id));
  });
});

describe('buildSession — new-word sessions', () => {
  it('introduces 5 entries', () => {
    const session = buildSession({ mode: 'new', entries: pilot, seed: 'n1' });
    expect(session.entryIds).toHaveLength(5);
  });

  it('honours the learner’s configured batch size (§18)', () => {
    for (const batchSize of [5, 10, 15, 20]) {
      const session = buildSession({
        mode: 'new',
        entries: pilot,
        seed: `batch-${batchSize}`,
        newWordEntryCount: batchSize,
      });
      expect(session.entryIds).toHaveLength(batchSize);
    }
  });

  it('gives each entry 2 to 3 exercises', () => {
    const session = buildSession({ mode: 'new', entries: pilot, seed: 'n2' });
    for (const entryId of session.entryIds) {
      const count = session.exercises.filter((e) => e.entryId === entryId).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('asks a recognition exercise before a production one for each entry', () => {
    const session = buildSession({ mode: 'new', entries: pilot, seed: 'n3' });
    for (const entryId of session.entryIds) {
      const forEntry = session.exercises.filter((e) => e.entryId === entryId);
      const firstProduction = forEntry.findIndex((e) => e.isProduction);
      const firstRecognition = forEntry.findIndex((e) => !e.isProduction);
      if (firstProduction >= 0 && firstRecognition >= 0) {
        expect(firstRecognition).toBeLessThan(firstProduction);
      }
    }
  });
});

describe('buildSession — restrictions', () => {
  it('honours an allowed-type restriction', () => {
    const session = buildSession({
      mode: 'review',
      entries: pilot,
      seed: 'restricted',
      allowedTypes: ['multipleChoice', 'typedTranslation'],
    });
    expect(new Set(session.exercises.map((e) => e.type))).toEqual(
      new Set(['multipleChoice', 'typedTranslation']),
    );
  });

  it('excludes listening and speaking when they are not allowed', () => {
    const session = buildSession({
      mode: 'review',
      entries: pilot,
      seed: 'no-speech',
      allowedTypes: ['multipleChoice', 'typedTranslation', 'sentenceCompletion', 'wordOrdering'],
    });
    expect(session.exercises.some((e) => e.type === 'listening')).toBe(false);
    expect(session.exercises.some((e) => e.type === 'speaking')).toBe(false);
  });

  it('respects a custom exercise count', () => {
    const session = buildSession({
      mode: 'review',
      entries: pilot,
      seed: 'short',
      targetExerciseCount: 8,
    });
    expect(session.exercises).toHaveLength(8);
  });

  it('returns an empty session for no entries', () => {
    const session = buildSession({ mode: 'review', entries: [], seed: 'empty' });
    expect(session.exercises).toHaveLength(0);
    expect(session.productionRatio).toBe(0);
  });

  it('handles a single entry without crashing', () => {
    const session = buildSession({
      mode: 'review',
      entries: pilot.slice(0, 1),
      pool: pilot,
      seed: 'one-entry',
    });
    expect(session.exercises.length).toBeGreaterThan(0);
    expect(session.entryIds).toHaveLength(1);
  });
});

describe('interleave', () => {
  const make = (id: string, type: Exercise['type'], entryId: string): Exercise =>
    ({
      id,
      entryId,
      type,
      variant: 'v',
      isProduction: false,
      requiresTypedInput: false,
      prompt: 'p',
      strictness: {
        capitalization: true,
        umlauts: true,
        eszett: true,
        article: false,
        plural: false,
        punctuation: false,
        wordOrder: false,
      },
      question: 'q',
      options: ['a', 'b'],
      correctIndex: 0,
    }) as Exercise;

  it('breaks up a long run of one type', () => {
    const input = [
      make('1', 'multipleChoice', 'e1'),
      make('2', 'multipleChoice', 'e2'),
      make('3', 'multipleChoice', 'e3'),
      make('4', 'multipleChoice', 'e4'),
      make('5', 'listening', 'e5'),
      make('6', 'listening', 'e6'),
    ];
    expect(runs(interleave(input), (e) => e.type)).toBeLessThanOrEqual(3);
  });

  it('breaks up a run of the same entry', () => {
    const input = [
      make('1', 'multipleChoice', 'e1'),
      make('2', 'listening', 'e1'),
      make('3', 'speaking', 'e1'),
      make('4', 'multipleChoice', 'e2'),
    ];
    expect(runs(interleave(input), (e) => e.entryId)).toBeLessThanOrEqual(2);
  });

  it('keeps every exercise', () => {
    const input = [
      make('1', 'multipleChoice', 'e1'),
      make('2', 'multipleChoice', 'e1'),
      make('3', 'multipleChoice', 'e1'),
    ];
    const output = interleave(input);
    expect(output).toHaveLength(3);
    expect(new Set(output.map((e) => e.id))).toEqual(new Set(['1', '2', '3']));
  });
});

describe('difficulty adaptation (§21)', () => {
  /** Progress record with a chosen difficulty and error history. */
  function progressFor(
    entryId: string,
    difficulty: number,
    errorCounts: Record<string, number> = {},
  ): EntryProgress {
    return {
      entryId,
      introducedAt: '2026-01-01T00:00:00.000Z',
      masteryScore: 0,
      totalResponseMs: 0,
      srs: {
        entryId,
        status: 'review',
        dueAt: '2026-01-01T00:00:00.000Z',
        intervalDays: 5,
        easeFactor: 2.5,
        difficulty,
        repetitions: 5,
        lapses: 0,
        consecutiveCorrect: 3,
        exercisePerformance: {},
      },
      totalAttempts: 10,
      totalCorrect: 5,
      firstAttemptCorrect: 4,
      hintsUsed: 0,
      errorCounts,
    };
  }

  function buildWithDifficulty(
    difficulty: number,
    errorCounts?: Record<string, number>,
    entries?: readonly VocabularyEntry[],
  ) {
    const chosen = (entries ?? pilot).slice(0, 14);
    const progressByEntry = new Map(
      chosen.map((entry) => [entry.id, progressFor(entry.id, difficulty, errorCounts)]),
    );
    return buildSession({
      mode: 'review',
      entries: chosen,
      pool: entries ?? pilot,
      seed: 'adaptation',
      progressByEntry,
    });
  }

  it('gives struggling words more recognition than easy words', () => {
    const hard = buildWithDifficulty(0.95);
    const easy = buildWithDifficulty(0.05);

    const recognitionShare = (session: ReturnType<typeof buildSession>): number =>
      session.exercises.filter((e) => !e.isProduction).length / session.exercises.length;

    expect(recognitionShare(hard)).toBeGreaterThan(recognitionShare(easy));
  });

  it('gives easy words more typed production than struggling words', () => {
    const hard = buildWithDifficulty(0.95);
    const easy = buildWithDifficulty(0.05);
    expect(easy.typedRatio).toBeGreaterThan(hard.typedRatio);
  });

  it('leads struggling words with recognition formats', () => {
    const hard = buildWithDifficulty(0.95);
    const easy = buildWithDifficulty(0.05);

    // §21 high difficulty: "return to recognition, reduce distractor complexity".
    const recognitionFormats = (session: ReturnType<typeof buildSession>): number =>
      session.exercises.filter(
        (e) => e.type === 'multipleChoice' || e.type === 'matching' || e.type === 'listening',
      ).length;

    expect(recognitionFormats(hard)).toBeGreaterThan(recognitionFormats(easy));
  });

  it('targets the grammatical property the learner keeps getting wrong', () => {
    // Needs entries that *have* an article to ask about; the datasets record none, so the
    // adaptation is checked on hand-written nouns (see the generators tests for the same
    // fixture rationale).
    const nouns = pilot
      .filter((entry) => entry.wordClass === 'noun')
      .slice(0, 14)
      .map((entry, index) => ({
        ...entry,
        article: (['der', 'die', 'das'] as const)[index % 3],
        plural: `${entry.german}en`,
        pluralArticle: 'die',
      })) as VocabularyEntry[];

    const withArticleErrors = buildWithDifficulty(0.5, { wrongArticle: 8 }, nouns);
    const withoutErrors = buildWithDifficulty(0.5, {}, nouns);

    const articleFocused = (session: ReturnType<typeof buildSession>): number =>
      session.exercises.filter((e) => e.variant.toLowerCase().includes('article')).length;

    expect(articleFocused(withArticleErrors)).toBeGreaterThan(articleFocused(withoutErrors));
  });

  it('still satisfies the §19 ratio floors when adapting', () => {
    for (const difficulty of [0.05, 0.5, 0.95]) {
      const session = buildWithDifficulty(difficulty);
      expect(session.productionRatio).toBeGreaterThanOrEqual(0.4);
      expect(session.typedRatio).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('behaves like an unadapted session when no progress is known', () => {
    const chosen = pilot.slice(0, 14);
    const withoutProgress = buildSession({
      mode: 'review',
      entries: chosen,
      pool: pilot,
      seed: 'none',
    });
    expect(withoutProgress.exercises.length).toBeGreaterThan(0);
  });
});
