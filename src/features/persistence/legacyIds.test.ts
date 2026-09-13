import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

import legacyIds from '@/content/vocabulary/generated/legacy-ids.json';
import { DATABASE_SCHEMA_VERSION, VocabularyLearningDatabase, initializeDatabase } from './db';
import { remapLegacyIds } from './legacyIds';

const ids = legacyIds as Record<string, string>;
const [[oldId, newId]] = Object.entries(ids) as [[string, string]];

describe('stable id migration (schema 6)', () => {
  it('rewrites ids embedded in other ids and leaves unknown ones alone', () => {
    expect(remapLegacyIds(`seed-${oldId}#2`, ids)).toBe(`seed-${newId}#2`);
    expect(remapLegacyIds('a1-9999-nothing', ids)).toBe('a1-9999-nothing');
    const untouched = { entryId: 'a1-9999-nothing' };
    expect(remapLegacyIds(untouched, ids)).toBe(untouched);
  });

  it('opens a version 5 database with old ids as version 6 with new ids', async () => {
    const name = `legacy-${crypto.randomUUID()}`;
    const v5 = new Dexie(name);
    v5.version(5).stores({
      entryProgress: 'entryId, srs.status, srs.dueAt, srs.difficulty, masteryScore, introducedAt',
      exerciseHistory: 'id, entryId, sessionId, exerciseType, answeredAt',
      sessions: 'id, mode, status, startedAt',
      achievements: 'id, unlockedAt',
      settings: 'id',
      metadata: 'key',
      xpEvents: 'id, type, awardedAt',
      skippedEntries: 'entryId, skippedAt',
    });
    await v5.open();
    await v5
      .table('entryProgress')
      .put({ entryId: oldId, srs: { entryId: oldId, status: 'mastered', intervalDays: 12 } });
    await v5
      .table('entryProgress')
      .put({ entryId: 'a1-9999-gone', srs: { entryId: 'a1-9999-gone' } });
    await v5
      .table('exerciseHistory')
      .put({ id: `s1:s1-${oldId}`, entryId: oldId, sessionId: 's1' });
    await v5.table('sessions').put({
      id: 's1',
      entryIds: [oldId],
      exercises: [{ id: `s1-${oldId}`, entryId: oldId }],
    });
    await v5.table('xpEvents').put({ id: `mastery:${oldId}`, type: 'mastery', amount: 10 });
    await v5.table('skippedEntries').put({ entryId: oldId, skippedAt: '2026-01-01T00:00:00.000Z' });
    await v5.table('metadata').put({
      key: 'stream-schedule',
      value: JSON.stringify({ position: 3, requeued: [{ entryId: oldId, at: 9 }] }),
    });
    v5.close();

    const db = new VocabularyLearningDatabase(name);
    await initializeDatabase(db);

    expect(db.verno).toBe(DATABASE_SCHEMA_VERSION);
    expect((await db.entryProgress.toCollection().primaryKeys()).sort()).toEqual(
      ['a1-9999-gone', newId].sort(),
    );
    expect((await db.entryProgress.get(newId))?.srs).toMatchObject({
      entryId: newId,
      // Mastered on a 12-day interval predates the full §22 criteria, so it is demoted.
      status: 'review',
    });
    const history = await db.exerciseHistory.toArray();
    expect(history.map((row) => [row.id, row.entryId])).toEqual([[`s1:s1-${newId}`, newId]]);
    const session = await db.sessions.get('s1');
    expect(session?.entryIds).toEqual([newId]);
    expect(session?.exercises?.[0]).toEqual({ id: `s1-${newId}`, entryId: newId });
    expect(await db.xpEvents.get(`mastery:${newId}`)).toBeDefined();
    expect(await db.skippedEntries.get(newId)).toBeDefined();
    expect((await db.metadata.get('stream-schedule'))?.value).toContain(newId);
    expect(await db.metadata.get('legacy-ids-pending')).toBeUndefined();
    db.close();
  });

  it('refuses a database written by a newer app version', async () => {
    const db = new VocabularyLearningDatabase(`newer-${crypto.randomUUID()}`);
    await db.open();
    await db.metadata.put({
      key: 'schemaVersion',
      value: '99',
      updatedAt: new Date().toISOString(),
    });
    await expect(initializeDatabase(db)).rejects.toThrow(/newer/i);
    db.close();
  });
});
