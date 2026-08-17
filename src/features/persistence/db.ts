import Dexie, { type Table } from 'dexie';

import type {
  AchievementRecord,
  EntryProgress,
  ExerciseHistory,
  SkippedEntry,
} from '@/schemas/progressSchema';
import type { PracticeSessionRecord } from '@/schemas/sessionSchema';
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from '@/schemas/settingsSchema';

/**
 * IndexedDB shell (Phase 0 deliverable 18, §24).
 *
 * All learner data lives here and nowhere else — no backend, no cloud sync (§1, §31).
 *
 * Versioning rules that later phases must follow:
 *   - every schema change adds a new `version(n).stores(...)` block, never edits an old one;
 *   - progress is never deleted silently — migrations upgrade rows in place;
 *   - `metadata` records the schema version so imports and repairs can reason about it.
 */

/** One bonus-XP award. The id is deterministic so re-awarding is a no-op (§23). */
export interface XpEvent {
  /** e.g. `daily:2026-04-01`, `perfect:<sessionId>`, `mastery:<entryId>`. */
  id: string;
  type: string;
  amount: number;
  awardedAt: string;
}

export interface DatabaseMetadata {
  key: string;
  value: string;
  updatedAt: string;
}

/** Bumped whenever the Dexie schema changes. Mirrored into the `metadata` table. */
export const DATABASE_SCHEMA_VERSION = 5;
export const DATABASE_NAME = 'deutsch-wort-shatz';

export class VocabularyLearningDatabase extends Dexie {
  declare entryProgress: Table<EntryProgress, string>;
  declare exerciseHistory: Table<ExerciseHistory, string>;
  declare sessions: Table<PracticeSessionRecord, string>;
  declare achievements: Table<AchievementRecord, string>;
  declare settings: Table<Settings, string>;
  declare metadata: Table<DatabaseMetadata, string>;
  declare xpEvents: Table<XpEvent, string>;
  declare skippedEntries: Table<SkippedEntry, string>;

  constructor(name: string = DATABASE_NAME) {
    super(name);

    // Version 1 — initial schema. Indexes are chosen for the queries the review queue
    // and progress screens need: due lookups, per-session history, per-entry history.
    this.version(1).stores({
      entryProgress: 'entryId, srs.status, srs.dueAt, introducedAt',
      exerciseHistory: 'id, entryId, sessionId, exerciseType, answeredAt',
      sessions: 'id, mode, status, startedAt',
      achievements: 'id, unlockedAt',
      settings: 'id',
      metadata: 'key',
    });

    // Version 2 (Phase 2) — adds an index on `srs.difficulty` for the hardest-word views
    // and the difficulty-aware review queue.
    //
    // §24: a schema change adds a version, never edits an existing one, and progress is
    // never dropped. The upgrade backfills fields that version 1 rows may predate, so an
    // existing learner keeps every review they have done.
    this.version(2)
      .stores({
        entryProgress: 'entryId, srs.status, srs.dueAt, srs.difficulty, introducedAt',
      })
      .upgrade(async (transaction) =>
        transaction
          .table<EntryProgress, string>('entryProgress')
          .toCollection()
          .modify((progress) => {
            progress.srs.difficulty ??= 0.5;
            progress.srs.exercisePerformance ??= {};
            progress.srs.consecutiveCorrect ??= 0;
            progress.srs.lapses ??= 0;
            progress.errorCounts ??= {};
            progress.hintsUsed ??= 0;
          }),
      );

    // Version 3 (Phase 7) — adds `xpEvents` for bonus XP awards.
    //
    // Bonus XP (perfect session, daily goal, mastery, band and level completion) is stored
    // as one row per award with a deterministic id, e.g. `daily:2026-04-01`. Writing with
    // `put` therefore makes every award idempotent, which is what stops a refresh from
    // granting the same bonus twice (§23 acceptance criterion).
    this.version(3).stores({
      xpEvents: 'id, type, awardedAt',
    });

    // Version 4 — adds the per-entry quiz score and the cumulative response time.
    //
    // Both are backfilled rather than defaulted at read time, so the difficulty model and
    // the mastery check never have to guess whether a row predates them. An existing
    // learner starts at score 0 with mastery already reached under the §22 rules intact:
    // the score is a second route to mastered, not a demotion of the first.
    this.version(4)
      .stores({
        entryProgress: 'entryId, srs.status, srs.dueAt, srs.difficulty, masteryScore, introducedAt',
      })
      .upgrade(async (transaction) =>
        transaction
          .table<EntryProgress, string>('entryProgress')
          .toCollection()
          .modify((progress) => {
            progress.masteryScore ??= 0;
            progress.totalResponseMs ??= 0;
          }),
      );

    // Version 5 — adds `skippedEntries`, the words the learner has set aside.
    //
    // A new table, so nothing is migrated: an existing learner simply has none skipped.
    // The entry's progress row is deliberately not involved — skipping parks a word for
    // later and must leave its mastery score and due date exactly where they were.
    this.version(5).stores({
      skippedEntries: 'entryId, skippedAt',
    });
  }
}

export const db = new VocabularyLearningDatabase();

/**
 * Opens the database and records its schema version.
 * Safe to call repeatedly; returns the settings row, creating defaults on first run.
 */
export async function initializeDatabase(
  database: VocabularyLearningDatabase = db,
): Promise<Settings> {
  await database.open();

  await database.metadata.put({
    key: 'schemaVersion',
    value: String(DATABASE_SCHEMA_VERSION),
    updatedAt: new Date().toISOString(),
  });

  const existing = await database.settings.get(SETTINGS_KEY);
  if (existing) return existing;

  const created: Settings = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  await database.settings.put(created);
  return created;
}

/**
 * Deletes every learner record (§25 "reset progress").
 * Destructive — callers must confirm with the learner first.
 */
export async function resetAllProgress(database: VocabularyLearningDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.entryProgress,
      database.exerciseHistory,
      database.sessions,
      database.achievements,
      database.settings,
      database.xpEvents,
      database.skippedEntries,
      database.metadata,
    ],
    async () => {
      await Promise.all([
        database.entryProgress.clear(),
        database.exerciseHistory.clear(),
        database.sessions.clear(),
        database.achievements.clear(),
        database.settings.clear(),
        database.xpEvents.clear(),
        database.skippedEntries.clear(),
        // The stream's spacing counts exercises the learner has answered, so it goes with
        // them. `metadata` is not cleared wholesale: the schema version has to survive.
        database.metadata.delete('stream-schedule'),
      ]);
    },
  );
}
