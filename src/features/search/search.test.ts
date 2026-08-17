import { beforeAll, describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  facetCounts,
  prepareIndex,
  searchVocabulary,
  type SearchableRecord,
} from './searchIndex';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { MASTERY_SCORE_TARGET } from '@/features/srs/repository';
import {
  bandEntryCount,
  bandById,
  LEVEL_ENTRY_COUNTS,
  TOTAL_ENTRY_COUNT,
} from '@/content/vocabulary/frequencyBands';
import {
  activitySummary,
  errorCategoryStats,
  exerciseTypePerformance,
  levelCompletion,
  overallStats,
  progressByLevel,
  progressByTopic,
  weakestTopics,
} from '@/features/progress/analytics';
import type { EntryProgress, ExerciseHistory } from '@/schemas/progressSchema';

let index: SearchableRecord[];

beforeAll(async () => {
  index = prepareIndex(await loadSearchIndex());
});

function search(
  overrides: Partial<typeof EMPTY_FILTERS> = {},
  progress?: Map<string, EntryProgress>,
) {
  return searchVocabulary(index, {
    filters: { ...EMPTY_FILTERS, ...overrides },
    ...(progress ? { progressByEntry: progress } : {}),
  });
}

describe('vocabulary search (§16)', () => {
  it('indexes every entry in the datasets', () => {
    expect(index).toHaveLength(TOTAL_ENTRY_COUNT);
  });

  it('returns everything with no filters', () => {
    expect(search()).toHaveLength(TOTAL_ENTRY_COUNT);
  });

  it('finds an entry by its German headword', () => {
    const results = search({ query: 'Straße' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.german.includes('Straße'))).toBe(true);
  });

  it('finds an entry by its English translation', () => {
    expect(search({ query: 'to be' }).some((r) => r.english.includes('to be'))).toBe(true);
  });

  it('finds an entry by any of its searchable forms', () => {
    // §16 searches every stored form, not just the headword. The current datasets record
    // one form per entry, so this covers the mechanism on a record that has two.
    const withForm = prepareIndex([
      {
        ...(index[0] as SearchableRecord),
        id: 'test-0001-form',
        german: 'sein',
        searchableForms: ['sein', 'gewesen'],
      },
    ]);
    const results = searchVocabulary(withForm, {
      filters: { ...EMPTY_FILTERS, query: 'gewesen' },
    });
    expect(results.map((r) => r.id)).toEqual(['test-0001-form']);
  });

  it('searches case-insensitively', () => {
    expect(search({ query: 'STRASSE' }).length).toBeGreaterThan(0);
  });

  it('searches without umlauts and ß', () => {
    const withUmlaut = search({ query: 'Frühling' }).length;
    const without = search({ query: 'Fruhling' }).length;
    expect(without).toBeGreaterThan(0);
    expect(without).toBeGreaterThanOrEqual(withUmlaut);
  });

  it('filters by level', () => {
    const results = search({ level: 'A2' });
    expect(results).toHaveLength(LEVEL_ENTRY_COUNTS.A2);
    expect(results.every((r) => r.level === 'A2')).toBe(true);
  });

  it('filters by frequency band', () => {
    const results = search({ band: 'A1 Core 1' });
    expect(results).toHaveLength(bandEntryCount(bandById('A1 Core 1')!));
  });

  it('filters by word class', () => {
    const results = search({ wordClass: 'verb' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.wordClass === 'verb')).toBe(true);
  });

  it('filters by topic', () => {
    const results = search({ topic: 'Food and drink' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.primaryTopic === 'Food and drink')).toBe(true);
  });

  it('combines filters with AND', () => {
    const results = search({ level: 'A1', wordClass: 'noun', band: 'A1 Core 1' });
    expect(
      results.every(
        (r) => r.level === 'A1' && r.wordClass === 'noun' && r.frequencyBand === 'A1 Core 1',
      ),
    ).toBe(true);
    expect(results.length).toBeLessThan(search({ level: 'A1' }).length);
  });

  it('filters by learning status', () => {
    const first = index[0] as SearchableRecord;
    const progress = new Map<string, EntryProgress>([
      [first.id, makeProgress(first.id, 'mastered', 0.2)],
    ]);
    expect(search({ status: 'mastered' }, progress)).toHaveLength(1);
    // Everything else is "new".
    expect(search({ status: 'new' }, progress)).toHaveLength(TOTAL_ENTRY_COUNT - 1);
  });

  it('filters by difficulty band', () => {
    const [hard, easy] = [index[0] as SearchableRecord, index[1] as SearchableRecord];
    const progress = new Map<string, EntryProgress>([
      [hard.id, makeProgress(hard.id, 'review', 0.9)],
      [easy.id, makeProgress(easy.id, 'review', 0.1)],
    ]);
    expect(search({ difficulty: 'high' }, progress).map((r) => r.id)).toEqual([hard.id]);
    expect(search({ difficulty: 'low' }, progress).map((r) => r.id)).toEqual([easy.id]);
  });

  it('returns nothing for an impossible combination', () => {
    expect(search({ level: 'A1', band: 'B1 High 1' })).toHaveLength(0);
  });

  it('completes a typical search well within the 100 ms budget', () => {
    const started = performance.now();
    search({ query: 'haus', level: 'A1' });
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('counts facets', () => {
    const counts = facetCounts(index);
    expect(counts.byLevel.A1).toBe(LEVEL_ENTRY_COUNTS.A1);
    expect(counts.byLevel.B1).toBe(LEVEL_ENTRY_COUNTS.B1);
  });
});

function makeProgress(
  entryId: string,
  status: EntryProgress['srs']['status'],
  difficulty: number,
  masteryScore = 0,
): EntryProgress {
  return {
    entryId,
    introducedAt: '2026-05-01T00:00:00.000Z',
    srs: {
      entryId,
      status,
      dueAt: '2026-05-02T00:00:00.000Z',
      intervalDays: 5,
      easeFactor: 2.5,
      difficulty,
      repetitions: 4,
      lapses: 0,
      consecutiveCorrect: 4,
      exercisePerformance: {},
    },
    totalAttempts: 8,
    totalCorrect: 6,
    firstAttemptCorrect: 5,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore,
    totalResponseMs: 0,
  };
}

/* --------------------------------------------------------------- analytics */

describe('progress analytics (§16)', () => {
  // Two real A1 entries, read from the built index: ids move whenever the datasets do.
  let progress: Map<string, EntryProgress>;
  let history: ExerciseHistory[];

  beforeAll(() => {
    const [mastered, struggling] = [index[0] as SearchableRecord, index[1] as SearchableRecord];
    progress = new Map<string, EntryProgress>([
      [mastered.id, makeProgress(mastered.id, 'mastered', 0.2)],
      [struggling.id, makeProgress(struggling.id, 'review', 0.8)],
    ]);
    history = [
      { ...historyTemplate[0], entryId: mastered.id } as ExerciseHistory,
      { ...historyTemplate[1], entryId: struggling.id } as ExerciseHistory,
    ];
  });

  const historyTemplate: ExerciseHistory[] = [
    {
      id: 'h1',
      entryId: 'placeholder',
      sessionId: 's1',
      exerciseType: 'multipleChoice',
      correct: true,
      firstAttempt: true,
      revealed: false,
      hintUsed: false,
      responseMs: 2000,
      grade: 2,
      errorCategories: [],
      answeredAt: new Date().toISOString(),
      xpAwarded: 5,
    },
    {
      id: 'h2',
      entryId: 'placeholder',
      sessionId: 's1',
      exerciseType: 'typedTranslation',
      correct: false,
      firstAttempt: true,
      revealed: false,
      hintUsed: false,
      responseMs: 9000,
      grade: 0,
      errorCategories: ['wrongCapitalization', 'missingUmlaut'],
      answeredAt: new Date().toISOString(),
      xpAwarded: 0,
    },
  ];

  it('breaks progress down by level against the true totals', () => {
    const rows = progressByLevel(index, progress);
    const a1 = rows.find((row) => row.key === 'A1');
    expect(a1?.total).toBe(LEVEL_ENTRY_COUNTS.A1);
    expect(a1?.introduced).toBe(2);
    expect(a1?.mastered).toBe(1);
  });

  it('counts a word as practised once its score passes zero, and never below mastered', () => {
    const [first, second] = [index[0] as SearchableRecord, index[1] as SearchableRecord];
    const scored = new Map<string, EntryProgress>([
      // Mastered on §22 evidence alone — score still zero, but it must count as practised.
      [first.id, makeProgress(first.id, 'mastered', 0.2, 0)],
      [second.id, makeProgress(second.id, 'review', 0.2, 1)],
    ]);
    const a1 = progressByLevel(index, scored).find((row) => row.key === 'A1');
    expect(a1?.practised).toBe(2);
    expect(a1?.mastered).toBe(1);
    expect(a1?.practisedFraction).toBeCloseTo(2 / LEVEL_ENTRY_COUNTS.A1);
    expect(a1?.masteredFraction).toBeCloseTo(1 / LEVEL_ENTRY_COUNTS.A1);
  });

  it('weights level progress by mastery points, not by words met', () => {
    const [first, second] = [index[0] as SearchableRecord, index[1] as SearchableRecord];
    const scored = new Map<string, EntryProgress>([
      [first.id, makeProgress(first.id, 'review', 0.2, 2)],
      [second.id, makeProgress(second.id, 'review', 0.2, 3)],
    ]);

    const a1 = progressByLevel(index, scored).find((row) => row.key === 'A1');
    expect(a1?.points).toBe(5);
    expect(a1?.pointsFraction).toBeCloseTo(5 / (LEVEL_ENTRY_COUNTS.A1 * MASTERY_SCORE_TARGET), 10);
    // Two words met counts as 0.25% complete, not the 0.25% *started* the old figure gave.
    expect(a1?.fraction).toBeCloseTo(2 / LEVEL_ENTRY_COUNTS.A1, 10);
  });

  it('caps each entry at the target so completion never passes 100%', () => {
    const everything = new Map(
      index.map((record) => [record.id, makeProgress(record.id, 'mastered', 0.1, 99)]),
    );
    for (const row of progressByLevel(index, everything)) {
      expect(row.pointsFraction).toBe(1);
    }
  });

  it('reports level completion straight from progress records', () => {
    const empty = levelCompletion([]);
    expect(empty.A1).toEqual({
      points: 0,
      max: LEVEL_ENTRY_COUNTS.A1 * MASTERY_SCORE_TARGET,
      fraction: 0,
    });
    expect(empty.B1.fraction).toBe(0);

    const scored = levelCompletion([
      makeProgress('a1-0001-eins', 'review', 0.2, 3),
      makeProgress('a1-0002-zwei', 'review', 0.2, 7), // above the target: capped at 4
      makeProgress('xx-0001-nonsense', 'review', 0.2, 4), // unknown level: ignored
    ]);
    expect(scored.A1.points).toBe(7);
    expect(scored.A1.fraction).toBeCloseTo(7 / (LEVEL_ENTRY_COUNTS.A1 * MASTERY_SCORE_TARGET), 10);
    expect(scored.A2.points).toBe(0);
  });

  it('agrees with the index-based breakdown for A1', () => {
    const a1 = progressByLevel(index, progress).find((row) => row.key === 'A1');
    expect(levelCompletion([...progress.values()]).A1.fraction).toBeCloseTo(
      a1?.pointsFraction ?? -1,
      10,
    );
  });

  it('breaks progress down by topic', () => {
    const rows = progressByTopic(index, progress);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(TOTAL_ENTRY_COUNT);
    expect(rows.reduce((sum, row) => sum + row.introduced, 0)).toBe(2);
  });

  it('reports per-exercise-type performance', () => {
    const stats = exerciseTypePerformance(history);
    const mc = stats.find((s) => s.type === 'multipleChoice');
    expect(mc?.attempts).toBe(1);
    expect(mc?.accuracy).toBe(1);
    const typed = stats.find((s) => s.type === 'typedTranslation');
    expect(typed?.accuracy).toBe(0);
  });

  it('aggregates error categories, most frequent first', () => {
    const stats = errorCategoryStats([...history, ...history]);
    expect(stats[0]?.count).toBe(2);
    expect(stats.map((s) => s.category)).toContain('wrongCapitalization');
  });

  it('summarises activity over the requested window', () => {
    const days = activitySummary(history, 7);
    expect(days).toHaveLength(7);
    expect(days.at(-1)?.exercises).toBe(2);
  });

  it('computes overall statistics', () => {
    const stats = overallStats([...progress.values()], history);
    expect(stats.introduced).toBe(2);
    expect(stats.mastered).toBe(1);
    expect(stats.totalAttempts).toBe(2);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.sessions).toBe(1);
  });

  it('identifies the weakest topics', () => {
    const weak = weakestTopics(index, progress);
    expect(weak.length).toBeGreaterThan(0);
    // The 0.8-difficulty entry's topic must rank above the 0.2 one.
    expect(weak[0]?.difficulty).toBeGreaterThanOrEqual(weak.at(-1)?.difficulty ?? 0);
  });

  it('reports zeroes for a learner with no history', () => {
    const stats = overallStats([], []);
    expect(stats.accuracy).toBe(0);
    expect(stats.introduced).toBe(0);
  });
});
