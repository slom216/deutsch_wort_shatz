import { beforeEach, describe, expect, it } from 'vitest';

import {
  DATABASE_SCHEMA_VERSION,
  VocabularyLearningDatabase,
  initializeDatabase,
  resetAllProgress,
} from './db';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '@/schemas/settingsSchema';
import type { EntryProgress } from '@/schemas/progressSchema';

/**
 * Phase 0 acceptance criteria: "IndexedDB initializes" and "one test record can be
 * created and read". These run against fake-indexeddb, so the Dexie schema, indexes and
 * transactions are genuinely exercised.
 */

function makeProgress(entryId: string): EntryProgress {
  return {
    entryId,
    introducedAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    srs: {
      entryId,
      status: 'learning',
      dueAt: new Date('2026-01-01T10:10:00.000Z').toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      difficulty: 0.4,
      repetitions: 1,
      lapses: 0,
      consecutiveCorrect: 1,
      exercisePerformance: {},
    },
    totalAttempts: 1,
    totalCorrect: 1,
    firstAttemptCorrect: 1,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore: 0,
    totalResponseMs: 0,
  };
}

describe('VocabularyLearningDatabase', () => {
  let db: VocabularyLearningDatabase;

  beforeEach(async () => {
    // A unique name per test keeps fake-indexeddb state isolated.
    db = new VocabularyLearningDatabase(`test-db-${crypto.randomUUID()}`);
    await db.open();
  });

  it('initializes and records its schema version', async () => {
    await initializeDatabase(db);

    const metadata = await db.metadata.get('schemaVersion');
    expect(metadata?.value).toBe(String(DATABASE_SCHEMA_VERSION));
  });

  it('creates default settings on first run and reuses them afterwards', async () => {
    const created = await initializeDatabase(db);
    expect(created.id).toBe(SETTINGS_KEY);
    expect(created.dailyGoal).toBe(DEFAULT_SETTINGS.dailyGoal);
    expect(created.strictAnswerChecking).toBe(true);

    await db.settings.update(SETTINGS_KEY, { dailyGoal: 50 });
    const second = await initializeDatabase(db);
    expect(second.dailyGoal).toBe(50);
  });

  it('writes and reads back a progress record', async () => {
    const record = makeProgress('a1-0003-sein');
    await db.entryProgress.put(record);

    const read = await db.entryProgress.get('a1-0003-sein');
    expect(read).toEqual(record);
  });

  it('queries progress by SRS status using the declared index', async () => {
    await db.entryProgress.bulkPut([makeProgress('a1-0001-hallo'), makeProgress('a1-0003-sein')]);

    const learning = await db.entryProgress.where('srs.status').equals('learning').toArray();
    expect(learning).toHaveLength(2);
  });

  it('clears every learner table on reset', async () => {
    await initializeDatabase(db);
    await db.entryProgress.put(makeProgress('a1-0001-hallo'));
    await db.achievements.put({
      id: 'first-word',
      unlockedAt: new Date().toISOString(),
      progress: 1,
    });

    await resetAllProgress(db);

    expect(await db.entryProgress.count()).toBe(0);
    expect(await db.achievements.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    // Metadata is deliberately preserved so migrations can still reason about the schema.
    expect(await db.metadata.get('schemaVersion')).toBeDefined();
  });
});
