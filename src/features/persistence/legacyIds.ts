import type { VocabularyLearningDatabase } from './db';

/**
 * Rank-based entry ids (`a1-0006-sechs`) to stable ids (`a1-sechs`).
 *
 * Ids used to carry the global rank, which shifts whenever an earlier level gains or loses
 * a word. Learners' databases and export files still hold the old form; this rewrites them.
 * An old id with no mapping is left untouched, and Repair reports it as unknown.
 */

export type LegacyIdMap = Readonly<Record<string, string>>;

/** Set by the version 6 upgrade, cleared in the same transaction that rewrites the ids. */
export const LEGACY_IDS_PENDING = 'legacy-ids-pending';

let mapPromise: Promise<LegacyIdMap> | null = null;

/** Loaded on demand: 140 KB that only upgrades and old imports need. */
export function loadLegacyIds(): Promise<LegacyIdMap> {
  mapPromise ??= import('@/content/vocabulary/generated/legacy-ids.json').then(
    (module) => module.default as LegacyIdMap,
  );
  return mapPromise;
}

// Old ids also appear inside other ids (`<seed>-a1-0006-sechs#2`), so match anywhere and
// then find the longest prefix the map knows: the slug is hyphenated, the suffix may be too.
const OLD_ID = /(?<![a-z0-9])[ab][12]-\d{4,}-[a-z0-9]+(?:-[a-z0-9]+)*/g;

function remapString(value: string, ids: LegacyIdMap): string {
  return value.replace(OLD_ID, (match) => {
    for (let end = match.length; end > 0; end = match.lastIndexOf('-', end - 1)) {
      const candidate = match.slice(0, end);
      if (Object.hasOwn(ids, candidate)) return `${ids[candidate]}${match.slice(end)}`;
    }
    return match;
  });
}

/** Rewrites every old id in any string of `value`. Returns `value` itself when nothing changed. */
export function remapLegacyIds<T>(value: T, ids: LegacyIdMap): T {
  if (typeof value === 'string') return remapString(value, ids) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item: unknown) => {
      const mapped = remapLegacyIds(item, ids);
      if (mapped !== item) changed = true;
      return mapped;
    });
    return (changed ? next : value) as T;
  }
  if (value !== null && typeof value === 'object') {
    let changed = false;
    const next = Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const mapped = remapLegacyIds(item, ids);
        if (mapped !== item) changed = true;
        return [key, mapped];
      }),
    );
    return (changed ? next : value) as T;
  }
  return value;
}

/** Learner tables and their primary keys. */
const TABLES = [
  ['entryProgress', 'entryId'],
  ['exerciseHistory', 'id'],
  ['sessions', 'id'],
  ['xpEvents', 'id'],
  ['skippedEntries', 'entryId'],
  ['achievements', 'id'],
] as const;

/**
 * Runs once after the version 6 upgrade. Dexie waits for it before serving any other query.
 *
 * It lives in `on('ready')` rather than the upgrade callback because loading the map is a
 * non-Dexie promise, which would commit the upgrade transaction early. The pending flag and
 * the rewrite share one transaction, so an interrupted run simply runs again next load.
 */
export async function migrateLegacyIds(database: VocabularyLearningDatabase): Promise<void> {
  if (!(await database.metadata.get(LEGACY_IDS_PENDING))) return;
  const ids = await loadLegacyIds();

  await database.transaction('rw', [...TABLES.map(([name]) => name), 'metadata'], async () => {
    for (const [name, key] of TABLES) {
      const table = database.table<Record<string, unknown>, string>(name);
      const changed: Record<string, unknown>[] = [];
      const staleKeys: string[] = [];
      for (const row of await table.toArray()) {
        const next = remapLegacyIds(row, ids);
        if (next === row) continue;
        changed.push(next);
        // The primary key itself changed: Dexie cannot rename a key, so delete and re-put.
        if (next[key] !== row[key]) staleKeys.push(row[key] as string);
      }
      await table.bulkDelete(staleKeys);
      await table.bulkPut(changed);
    }

    const schedule = await database.metadata.get('stream-schedule');
    if (schedule) {
      const value = remapString(schedule.value, ids);
      if (value !== schedule.value) await database.metadata.put({ ...schedule, value });
    }
    await database.metadata.delete(LEGACY_IDS_PENDING);
  });
}
