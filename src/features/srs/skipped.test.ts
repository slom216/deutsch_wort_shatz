import { beforeEach, describe, expect, it } from 'vitest';

import { VocabularyLearningDatabase } from '@/features/persistence/db';
import type { EntryProgress } from '@/schemas/progressSchema';
import { loadSkipped, loadSkippedIds, skipEntry, unskipEntry } from './skipped';

/**
 * Setting a word aside must cost the learner nothing but the word's place in the queue.
 * The progress assertion below is the whole promise of the feature: skip is not a demotion.
 */

function makeProgress(entryId: string): EntryProgress {
  return {
    entryId,
    introducedAt: '2026-01-01T10:00:00.000Z',
    srs: {
      entryId,
      status: 'review',
      dueAt: '2026-02-01T10:00:00.000Z',
      intervalDays: 7,
      easeFactor: 2.5,
      difficulty: 0.4,
      repetitions: 3,
      lapses: 0,
      consecutiveCorrect: 3,
      exercisePerformance: {},
    },
    totalAttempts: 4,
    totalCorrect: 3,
    firstAttemptCorrect: 3,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore: 3,
    totalResponseMs: 8_000,
  };
}

describe('skipped words', () => {
  let db: VocabularyLearningDatabase;

  beforeEach(async () => {
    db = new VocabularyLearningDatabase(`test-skip-${crypto.randomUUID()}`);
    await db.open();
  });

  it('sets a word aside and takes it back', async () => {
    await skipEntry('a1-0662-sein', db);
    expect(await loadSkippedIds(db)).toEqual(new Set(['a1-0662-sein']));

    await unskipEntry('a1-0662-sein', db);
    expect(await loadSkippedIds(db)).toEqual(new Set());
  });

  it('lists the most recently skipped word first', async () => {
    await db.skippedEntries.bulkPut([
      { entryId: 'older', skippedAt: '2026-01-01T10:00:00.000Z' },
      { entryId: 'newer', skippedAt: '2026-03-01T10:00:00.000Z' },
    ]);

    expect((await loadSkipped(db)).map((row) => row.entryId)).toEqual(['newer', 'older']);
  });

  it('leaves the word’s progress exactly where it was', async () => {
    const progress = makeProgress('a1-0662-sein');
    await db.entryProgress.put(progress);

    await skipEntry('a1-0662-sein', db);
    await unskipEntry('a1-0662-sein', db);

    expect(await db.entryProgress.get('a1-0662-sein')).toEqual(progress);
  });
});
