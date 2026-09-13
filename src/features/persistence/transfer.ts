import { z } from 'zod';

import { db, DATABASE_SCHEMA_VERSION, type VocabularyLearningDatabase } from './db';
import { loadLegacyIds, remapLegacyIds } from './legacyIds';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { XP_COMPLETE_LEVEL } from '@/features/gamification/xp';
import {
  achievementRecordSchema,
  entryProgressSchema,
  exerciseHistorySchema,
  pastDatetimeSchema,
  skippedEntrySchema,
} from '@/schemas/progressSchema';
import { practiceSessionRecordSchema } from '@/schemas/sessionSchema';
import { settingsSchema } from '@/schemas/settingsSchema';

/**
 * Progress export and import (§25).
 *
 * The export carries a schema version, a timestamp and the app version, and contains only
 * *learner* data. The static vocabulary is never exported — it ships with the app, and
 * including it would bloat the file and let an import silently replace content.
 *
 * Imports are validated before anything is written, previewed, and applied either as a
 * merge or a replace. A malformed file is rejected with a readable reason.
 */

export const APP_VERSION = '0.1.0';

const xpEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  // Bonuses are positive and the largest is a completed CEFR level (§23).
  amount: z.number().int().min(0).max(XP_COMPLETE_LEVEL),
  awardedAt: pastDatetimeSchema,
});

export const exportFileSchema = z.object({
  /** Format marker, so an unrelated JSON file is rejected immediately. Kept for compatibility. */
  kind: z.literal('deutsch-wort-shatz-progress'),
  schemaVersion: z.number().int().min(1),
  appVersion: z.string(),
  exportedAt: z.string(),
  entryProgress: z.array(entryProgressSchema),
  exerciseHistory: z.array(exerciseHistorySchema),
  sessions: z.array(practiceSessionRecordSchema),
  achievements: z.array(achievementRecordSchema),
  xpEvents: z.array(xpEventSchema),
  // Defaulted rather than migrated: an export written before skipping existed simply has
  // no skipped words, which is exactly what an empty array says.
  skippedEntries: z.array(skippedEntrySchema).default([]),
  settings: settingsSchema.nullable(),
});

export type ExportFile = z.infer<typeof exportFileSchema>;

export async function exportProgress(
  database: VocabularyLearningDatabase = db,
): Promise<ExportFile> {
  const [
    entryProgress,
    exerciseHistory,
    sessions,
    achievements,
    xpEvents,
    skippedEntries,
    settings,
  ] = await Promise.all([
    database.entryProgress.toArray(),
    database.exerciseHistory.toArray(),
    database.sessions.toArray(),
    database.achievements.toArray(),
    database.xpEvents.toArray(),
    database.skippedEntries.toArray(),
    database.settings.get('user-settings'),
  ]);

  return {
    kind: 'deutsch-wort-shatz-progress',
    schemaVersion: DATABASE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    entryProgress,
    exerciseHistory,
    sessions,
    achievements,
    xpEvents,
    skippedEntries,
    settings: settings ?? null,
  };
}

export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

export function exportFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `deulern-deutsch-wortschatz-progress-${stamp}.json`;
}

/* ------------------------------------------------------------------- import */

export type ImportMode = 'merge' | 'replace';

export interface ImportPreview {
  readonly valid: true;
  readonly file: ExportFile;
  readonly exportedAt: string;
  readonly schemaVersion: number;
  readonly migrated: boolean;
  readonly counts: {
    readonly entryProgress: number;
    readonly exerciseHistory: number;
    readonly sessions: number;
    readonly achievements: number;
    readonly xpEvents: number;
  };
  /** What a merge would add on top of what is already stored. */
  readonly newEntryProgress: number;
  readonly newExerciseHistory: number;
}

export interface ImportRejection {
  readonly valid: false;
  readonly reason: string;
  readonly details?: readonly string[];
}

export type ImportInspection = ImportPreview | ImportRejection;

/**
 * Migrates an older export to the current shape.
 *
 * Version 1 and 2 exports predate `xpEvents`; a missing table is simply empty rather than
 * an error, so an older file still imports and keeps every review it contains (§24: never
 * lose progress).
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  const migrated = { ...raw };

  if (version < 4) {
    // Versions 1–3 predate the per-entry quiz score and the cumulative response time.
    // Both start at zero: a learner who imports an old export keeps every review, and
    // simply has to earn the score. Their §22 mastery is untouched.
    const rows = Array.isArray(migrated.entryProgress) ? migrated.entryProgress : [];
    migrated.entryProgress = rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ...record,
        masteryScore: record.masteryScore ?? 0,
        totalResponseMs: record.totalResponseMs ?? 0,
      };
    });
  }
  if (version < 3) {
    migrated.xpEvents ??= [];
  }
  if (version < 2) {
    // Version 1 progress rows may lack the fields the difficulty model needs.
    const rows = Array.isArray(migrated.entryProgress) ? migrated.entryProgress : [];
    migrated.entryProgress = rows.map((row) => {
      const record = row as Record<string, unknown>;
      const srs = (record.srs ?? {}) as Record<string, unknown>;
      return {
        ...record,
        hintsUsed: record.hintsUsed ?? 0,
        errorCounts: record.errorCounts ?? {},
        srs: {
          ...srs,
          difficulty: srs.difficulty ?? 0.5,
          lapses: srs.lapses ?? 0,
          consecutiveCorrect: srs.consecutiveCorrect ?? 0,
          exercisePerformance: srs.exercisePerformance ?? {},
        },
      };
    });
  }

  return migrated;
}

/** Parses and validates a file without writing anything (§25 "preview before import"). */
export async function inspectImport(
  text: string,
  database: VocabularyLearningDatabase = db,
): Promise<ImportInspection> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { valid: false, reason: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, reason: 'That file does not contain a progress export.' };
  }

  const raw = parsed as Record<string, unknown>;
  if (raw.kind !== 'deutsch-wort-shatz-progress') {
    return {
      valid: false,
      reason: 'That file is not a DeuLern Deutsch Wortschatz progress export.',
    };
  }

  const originalVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (originalVersion > DATABASE_SCHEMA_VERSION) {
    return {
      valid: false,
      reason: `That export was made by a newer version of the app (schema ${originalVersion}, this app understands ${DATABASE_SCHEMA_VERSION}).`,
    };
  }

  // Exports before version 6 use rank-based entry ids; rewrite them like the database upgrade.
  const source = originalVersion < 6 ? remapLegacyIds(raw, await loadLegacyIds()) : raw;
  const result = exportFileSchema.safeParse({
    ...migrate(source),
    schemaVersion: DATABASE_SCHEMA_VERSION,
  });
  if (!result.success) {
    return {
      valid: false,
      reason: 'That export is missing or malformed in places, so it was not imported.',
      details: result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`),
    };
  }

  const file = result.data;
  const [existingProgress, existingHistory] = await Promise.all([
    database.entryProgress.toArray(),
    database.exerciseHistory.toArray(),
  ]);
  const knownEntries = new Set(existingProgress.map((row) => row.entryId));
  const knownHistory = new Set(existingHistory.map((row) => row.id));

  return {
    valid: true,
    file,
    exportedAt: file.exportedAt,
    schemaVersion: originalVersion,
    migrated: originalVersion < DATABASE_SCHEMA_VERSION,
    counts: {
      entryProgress: file.entryProgress.length,
      exerciseHistory: file.exerciseHistory.length,
      sessions: file.sessions.length,
      achievements: file.achievements.length,
      xpEvents: file.xpEvents.length,
    },
    newEntryProgress: file.entryProgress.filter((row) => !knownEntries.has(row.entryId)).length,
    newExerciseHistory: file.exerciseHistory.filter((row) => !knownHistory.has(row.id)).length,
  };
}

export interface ImportResult {
  readonly imported: {
    readonly entryProgress: number;
    readonly exerciseHistory: number;
    readonly sessions: number;
    readonly achievements: number;
    readonly xpEvents: number;
  };
  readonly mode: ImportMode;
}

/**
 * Applies a validated import.
 *
 * `replace` clears the learner tables first. `merge` keeps whatever is already stored and
 * takes the *better* of the two records for each entry — the one with more attempts —
 * so merging an older export can never erase newer progress.
 */
export async function applyImport(
  file: ExportFile,
  mode: ImportMode,
  database: VocabularyLearningDatabase = db,
): Promise<ImportResult> {
  await database.transaction(
    'rw',
    [
      database.entryProgress,
      database.exerciseHistory,
      database.sessions,
      database.achievements,
      database.xpEvents,
      database.skippedEntries,
      database.settings,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          database.entryProgress.clear(),
          database.exerciseHistory.clear(),
          database.sessions.clear(),
          database.achievements.clear(),
          database.xpEvents.clear(),
          database.skippedEntries.clear(),
          // "Discard everything stored here first" has to include settings, or the
          // learner's old preferences quietly survive a replace they asked for.
          database.settings.clear(),
        ]);
        await database.entryProgress.bulkPut(file.entryProgress);
      } else {
        const existing = new Map(
          (await database.entryProgress.toArray()).map((row) => [row.entryId, row]),
        );
        const merged = file.entryProgress.map((incoming) => {
          const current = existing.get(incoming.entryId);
          if (!current) return incoming;
          // Keep whichever record reflects more study, so a merge never loses reviews.
          return incoming.totalAttempts >= current.totalAttempts ? incoming : current;
        });
        await database.entryProgress.bulkPut(merged);

        // Where the local counters won, the incoming history for that entry is dropped.
        // Importing it anyway would leave more history rows than the kept counters
        // account for, and the progress screens count history rows directly — the two
        // would then disagree permanently, with no way to tell which is right.
        const keptLocal = new Set(
          merged.filter((row) => existing.get(row.entryId) === row).map((row) => row.entryId),
        );
        await database.exerciseHistory.bulkPut(
          file.exerciseHistory.filter((row) => !keptLocal.has(row.entryId)),
        );
      }

      if (mode === 'replace') await database.exerciseHistory.bulkPut(file.exerciseHistory);

      // Sessions, achievements and XP events have stable ids, so `bulkPut` deduplicates
      // naturally in both modes.
      await database.sessions.bulkPut(file.sessions);
      await database.achievements.bulkPut(file.achievements);
      await database.xpEvents.bulkPut(file.xpEvents);
      // Keyed by entry id, so a merge unions the two lists rather than duplicating them.
      await database.skippedEntries.bulkPut(file.skippedEntries);
      // "Merge — keep what you have" includes the learner's settings.
      if (mode === 'replace' && file.settings) await database.settings.put(file.settings);
    },
  );

  return {
    mode,
    imported: {
      entryProgress: file.entryProgress.length,
      exerciseHistory: file.exerciseHistory.length,
      sessions: file.sessions.length,
      achievements: file.achievements.length,
      xpEvents: file.xpEvents.length,
    },
  };
}

/* -------------------------------------------------------------------- repair */

/** Every learner store, the schema its rows must satisfy (the same one import uses), and its key. */
const REPAIR_STORES = {
  entryProgress: [entryProgressSchema, 'entryId'],
  exerciseHistory: [exerciseHistorySchema, 'id'],
  sessions: [practiceSessionRecordSchema, 'id'],
  settings: [settingsSchema, 'id'],
  xpEvents: [xpEventSchema, 'id'],
  skippedEntries: [skippedEntrySchema, 'entryId'],
  achievements: [achievementRecordSchema, 'id'],
} as const;

export type RepairStore = keyof typeof REPAIR_STORES;

/** Stores whose rows belong to one vocabulary entry. */
const ENTRY_STORES: ReadonlySet<RepairStore> = new Set([
  'entryProgress',
  'exerciseHistory',
  'skippedEntries',
]);

export interface RepairReport {
  /** Rows per store that fail their schema. */
  readonly invalid: Readonly<Record<RepairStore, number>>;
  /** Progress, history and skipped rows for entry ids the vocabulary no longer has. */
  readonly unknownEntries: number;
  readonly ok: boolean;
}

interface RepairPlan {
  readonly report: RepairReport;
  readonly keys: Readonly<Record<RepairStore, readonly string[]>>;
}

async function planRepair(database: VocabularyLearningDatabase): Promise<RepairPlan> {
  const known = new Set((await loadSearchIndex()).map((record) => record.id));
  const invalid = {} as Record<RepairStore, number>;
  const keys = {} as Record<RepairStore, string[]>;
  let unknownEntries = 0;

  for (const store of Object.keys(REPAIR_STORES) as RepairStore[]) {
    const [schema, key] = REPAIR_STORES[store];
    const rows = await database.table<Record<string, unknown>, string>(store).toArray();
    invalid[store] = 0;
    keys[store] = [];
    for (const row of rows) {
      if (!schema.safeParse(row).success) {
        invalid[store] += 1;
      } else if (ENTRY_STORES.has(store) && !known.has(row.entryId as string)) {
        unknownEntries += 1;
      } else {
        continue;
      }
      keys[store].push(row[key] as string);
    }
  }

  const ok = unknownEntries === 0 && Object.values(invalid).every((count) => count === 0);
  return { report: { invalid, unknownEntries, ok }, keys };
}

/**
 * Reports what a repair *would* delete, without touching anything (§25 "preview").
 *
 * Repair is a deletion, so the learner sees the count first and confirms it.
 */
export async function inspectRepair(
  database: VocabularyLearningDatabase = db,
): Promise<RepairReport> {
  return (await planRepair(database)).report;
}

/**
 * Database repair (§17): drops rows that no longer satisfy their schema, and rows for entries
 * the vocabulary no longer has, which is what lets a learner recover from a partially
 * corrupted database without losing everything.
 *
 * §24 forbids deleting progress silently, so this is deliberately awkward to reach: the
 * caller previews with `inspectRepair`, confirms, and gets a full export back as a backup
 * before anything is removed.
 */
export async function repairDatabase(
  database: VocabularyLearningDatabase = db,
): Promise<RepairReport & { readonly backup: string }> {
  const backup = await exportProgress(database);
  const { report, keys } = await planRepair(database);

  for (const store of Object.keys(keys) as RepairStore[]) {
    if (keys[store].length > 0) await database.table(store).bulkDelete([...keys[store]]);
  }

  return { ...report, backup: JSON.stringify(backup, null, 2) };
}
