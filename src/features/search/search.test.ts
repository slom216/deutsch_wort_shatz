import { beforeAll, describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  facetCounts,
  prepareIndex,
  searchVocabulary,
  type SearchableRecord,
} from './searchIndex';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import {
  activitySummary,
  errorCategoryStats,
  exerciseTypePerformance,
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
  it('indexes all 10,000 entries', () => {
    expect(index).toHaveLength(10_000);
  });

  it('returns everything with no filters', () => {
    expect(search()).toHaveLength(10_000);
  });

  it('finds an entry by its German headword', () => {
    const results = search({ query: 'Straße' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.german.includes('Straße'))).toBe(true);
  });

  it('finds an entry by its English translation', () => {
    expect(search({ query: 'to be' }).some((r) => r.id === 'a1-0003-sein')).toBe(true);
  });

  it('finds a verb by an inflected form', () => {
    // "gewesen" is only the participle of "sein" — it is not the headword.
    expect(search({ query: 'gewesen' }).some((r) => r.id === 'a1-0003-sein')).toBe(true);
  });

  it('searches case-insensitively', () => {
    expect(search({ query: 'STRASSE' }).length).toBeGreaterThan(0);
  });

  it('searches without umlauts and ß', () => {
    const withUmlaut = search({ query: 'Bücher' }).length;
    const without = search({ query: 'Bucher' }).length;
    expect(without).toBeGreaterThan(0);
    expect(without).toBeGreaterThanOrEqual(withUmlaut);
  });

  it('filters by level', () => {
    const results = search({ level: 'A2' });
    expect(results).toHaveLength(3000);
    expect(results.every((r) => r.level === 'A2')).toBe(true);
  });

  it('filters by frequency band', () => {
    const results = search({ band: 'A1 Core 1' });
    expect(results).toHaveLength(250);
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
    const progress = new Map<string, EntryProgress>([
      ['a1-0003-sein', makeProgress('a1-0003-sein', 'mastered', 0.2)],
    ]);
    expect(search({ status: 'mastered' }, progress)).toHaveLength(1);
    // Everything else is "new".
    expect(search({ status: 'new' }, progress)).toHaveLength(9_999);
  });

  it('filters by difficulty band', () => {
    const progress = new Map<string, EntryProgress>([
      ['a1-0003-sein', makeProgress('a1-0003-sein', 'review', 0.9)],
      ['a1-0002-ich', makeProgress('a1-0002-ich', 'review', 0.1)],
    ]);
    expect(search({ difficulty: 'high' }, progress).map((r) => r.id)).toEqual(['a1-0003-sein']);
    expect(search({ difficulty: 'low' }, progress).map((r) => r.id)).toEqual(['a1-0002-ich']);
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
    expect(counts.byLevel.A1).toBe(1000);
    expect(counts.byLevel.B1).toBe(6000);
  });
});

function makeProgress(
  entryId: string,
  status: EntryProgress['srs']['status'],
  difficulty: number,
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
  };
}

/* --------------------------------------------------------------- analytics */

describe('progress analytics (§16)', () => {
  const progress = new Map<string, EntryProgress>([
    ['a1-0003-sein', makeProgress('a1-0003-sein', 'mastered', 0.2)],
    ['a1-0002-ich', makeProgress('a1-0002-ich', 'review', 0.8)],
  ]);

  const history: ExerciseHistory[] = [
    {
      id: 'h1',
      entryId: 'a1-0003-sein',
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
      entryId: 'a1-0002-ich',
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
    expect(a1?.total).toBe(1000);
    expect(a1?.introduced).toBe(2);
    expect(a1?.mastered).toBe(1);
  });

  it('breaks progress down by topic', () => {
    const rows = progressByTopic(index, progress);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(10_000);
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
