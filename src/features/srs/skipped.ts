import { db, type VocabularyLearningDatabase } from '@/features/persistence/db';
import type { SkippedEntry } from '@/schemas/progressSchema';

/**
 * Skipped words: the ones the learner has set aside for now.
 *
 * A skipped word leaves the stream but keeps everything it has earned — nothing here
 * touches `entryProgress`, so returning a word brings it back at the same mastery score
 * and on the same schedule it left with. That is the whole point: the alternative the
 * learner has today is to answer wrong, which costs them the word's progress.
 */

/** Every skipped word, most recently skipped first. */
export async function loadSkipped(
  database: VocabularyLearningDatabase = db,
): Promise<SkippedEntry[]> {
  const rows = await database.skippedEntries.toArray();
  return rows.sort((a, b) => b.skippedAt.localeCompare(a.skippedAt));
}

/** The same list as a set, which is the shape the word-selection code needs. */
export async function loadSkippedIds(
  database: VocabularyLearningDatabase = db,
): Promise<Set<string>> {
  return new Set((await database.skippedEntries.toArray()).map((row) => row.entryId));
}

export async function skipEntry(
  entryId: string,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  await database.skippedEntries.put({ entryId, skippedAt: new Date().toISOString() });
}

export async function unskipEntry(
  entryId: string,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  await database.skippedEntries.delete(entryId);
}
