import { db, type VocabularyLearningDatabase } from '@/features/persistence/db';
import type { Requeued } from './endless';

/**
 * The continuous stream's spacing state, stored across sessions.
 *
 * The in-session spacing is measured in exercises — a word answered wrong returns 25–50
 * exercises later — so it only means anything if the count survives leaving the stream.
 * Held in memory alone, a learner who studies in short sittings would meet every word
 * exactly once and never see a repetition, which is the opposite of the intent.
 *
 * One `metadata` row is enough: the queue holds only the words in flight, bounded by the
 * longest offset.
 */

const KEY = 'stream-schedule';
/** Queue cap. The longest offset is 100, so this is far above what is ever in flight. */
const MAX_ENTRIES = 500;

export interface StreamSchedule {
  /** Exercises answered in the stream, lifetime. The unit offsets are measured in. */
  readonly position: number;
  readonly requeued: readonly Requeued[];
}

export const EMPTY_SCHEDULE: StreamSchedule = { position: 0, requeued: [] };

export async function loadStreamSchedule(
  database: VocabularyLearningDatabase = db,
): Promise<StreamSchedule> {
  const row = await database.metadata.get(KEY);
  if (!row) return EMPTY_SCHEDULE;

  try {
    const parsed = JSON.parse(row.value) as Partial<StreamSchedule>;
    const position = typeof parsed.position === 'number' ? parsed.position : 0;
    const requeued = Array.isArray(parsed.requeued)
      ? parsed.requeued.filter(
          (item): item is Requeued =>
            typeof item?.entryId === 'string' && typeof item?.at === 'number',
        )
      : [];
    return { position, requeued };
  } catch {
    // A corrupt row costs the learner their spacing, not their progress: start over.
    return EMPTY_SCHEDULE;
  }
}

export async function saveStreamSchedule(
  schedule: StreamSchedule,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  // Soonest first, so the cap drops the words furthest from returning.
  const requeued = [...schedule.requeued].sort((a, b) => a.at - b.at).slice(0, MAX_ENTRIES);

  await database.metadata.put({
    key: KEY,
    value: JSON.stringify({ position: schedule.position, requeued }),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearStreamSchedule(
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  await database.metadata.delete(KEY);
}
