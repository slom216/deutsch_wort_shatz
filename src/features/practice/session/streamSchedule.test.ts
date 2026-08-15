import { beforeEach, describe, expect, it } from 'vitest';

import { db, resetAllProgress } from '@/features/persistence/db';
import {
  clearStreamSchedule,
  EMPTY_SCHEDULE,
  loadStreamSchedule,
  saveStreamSchedule,
} from './streamSchedule';

describe('stream schedule', () => {
  beforeEach(async () => {
    await clearStreamSchedule();
  });

  it('starts empty', async () => {
    expect(await loadStreamSchedule()).toEqual(EMPTY_SCHEDULE);
  });

  it('survives a round trip, so spacing outlives a sitting', async () => {
    await saveStreamSchedule({
      position: 81,
      requeued: [
        { entryId: 'a1-0001-eins', at: 120 },
        { entryId: 'a1-0002-zwei', at: 95 },
      ],
    });

    const loaded = await loadStreamSchedule();
    expect(loaded.position).toBe(81);
    // Soonest first, so the cap drops the words furthest from returning.
    expect(loaded.requeued.map((item) => item.entryId)).toEqual(['a1-0002-zwei', 'a1-0001-eins']);
  });

  it('falls back to an empty schedule on a corrupt row', async () => {
    await db.metadata.put({
      key: 'stream-schedule',
      value: 'not json',
      updatedAt: new Date().toISOString(),
    });

    expect(await loadStreamSchedule()).toEqual(EMPTY_SCHEDULE);
  });

  it('is cleared by resetting progress, but the schema version is not', async () => {
    await saveStreamSchedule({ position: 10, requeued: [] });
    await db.metadata.put({
      key: 'schemaVersion',
      value: '4',
      updatedAt: new Date().toISOString(),
    });

    await resetAllProgress();

    expect(await loadStreamSchedule()).toEqual(EMPTY_SCHEDULE);
    expect((await db.metadata.get('schemaVersion'))?.value).toBe('4');
  });
});
