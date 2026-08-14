import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyImport,
  exportFilename,
  exportProgress,
  inspectImport,
  repairDatabase,
  serializeExport,
} from './transfer';
import { db, resetAllProgress } from './db';
import type { EntryProgress, ExerciseHistory } from '@/schemas/progressSchema';

function progressRow(entryId: string, attempts = 3): EntryProgress {
  return {
    entryId,
    introducedAt: '2026-05-01T10:00:00.000Z',
    srs: {
      entryId,
      status: 'review',
      dueAt: '2026-06-01T10:00:00.000Z',
      intervalDays: 12,
      easeFactor: 2.5,
      difficulty: 0.4,
      repetitions: attempts,
      lapses: 0,
      consecutiveCorrect: attempts,
      exercisePerformance: {},
    },
    totalAttempts: attempts,
    totalCorrect: attempts,
    firstAttemptCorrect: attempts,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore: 0,
    totalResponseMs: 0,
  };
}

function historyRow(id: string): ExerciseHistory {
  return {
    id,
    entryId: 'a1-0001-hallo',
    sessionId: 's1',
    exerciseType: 'multipleChoice',
    correct: true,
    firstAttempt: true,
    revealed: false,
    hintUsed: false,
    responseMs: 3000,
    grade: 2,
    errorCategories: [],
    answeredAt: '2026-05-01T10:00:00.000Z',
    xpAwarded: 5,
  };
}

beforeEach(async () => {
  await resetAllProgress();
});

describe('export (§25)', () => {
  it('includes the schema version, app version and timestamp', async () => {
    const file = await exportProgress();
    expect(file.kind).toBe('deutsch-wort-shatz-progress');
    expect(file.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(file.appVersion).toBeTruthy();
    expect(() => new Date(file.exportedAt).toISOString()).not.toThrow();
  });

  it('includes learner data', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    await db.exerciseHistory.put(historyRow('h1'));

    const file = await exportProgress();
    expect(file.entryProgress).toHaveLength(1);
    expect(file.exerciseHistory).toHaveLength(1);
  });

  it('never includes the static vocabulary', async () => {
    const file = await exportProgress();
    const text = serializeExport(file);
    expect(text).not.toContain('exampleSentences');
    expect(text).not.toContain('exerciseConfig');
    expect(Object.keys(file)).not.toContain('vocabulary');
  });

  it('produces a dated filename', () => {
    expect(exportFilename(new Date('2026-05-10T09:00:00Z'))).toBe(
      'deutsch-wort-shatz-progress-2026-05-10.json',
    );
  });
});

describe('import validation (§25)', () => {
  it('rejects a file that is not JSON', async () => {
    const result = await inspectImport('not json at all');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not valid JSON/i);
  });

  it('rejects unrelated JSON', async () => {
    const result = await inspectImport(JSON.stringify({ hello: 'world' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not a Deutsch Wort Shatz/i);
  });

  it('rejects a malformed export and explains why', async () => {
    const broken = {
      kind: 'deutsch-wort-shatz-progress',
      schemaVersion: 3,
      appVersion: '0.1.0',
      exportedAt: new Date().toISOString(),
      entryProgress: [{ entryId: 'x' }],
      exerciseHistory: [],
      sessions: [],
      achievements: [],
      xpEvents: [],
      settings: null,
    };
    const result = await inspectImport(JSON.stringify(broken));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/malformed/i);
      expect(result.details?.length).toBeGreaterThan(0);
    }
  });

  it('rejects an export from a newer app version', async () => {
    const future = { ...(await exportProgress()), schemaVersion: 99 };
    const result = await inspectImport(JSON.stringify(future));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/newer version/i);
  });

  it('accepts a valid export and previews its contents', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    await db.exerciseHistory.put(historyRow('h1'));
    const text = serializeExport(await exportProgress());

    await resetAllProgress();
    const result = await inspectImport(text);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.counts.entryProgress).toBe(1);
      expect(result.newEntryProgress).toBe(1);
    }
  });

  it('writes nothing while previewing', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    const text = serializeExport(await exportProgress());
    await resetAllProgress();

    await inspectImport(text);
    expect(await db.entryProgress.count()).toBe(0);
  });

  it('migrates an older export rather than rejecting it', async () => {
    const legacy = {
      kind: 'deutsch-wort-shatz-progress',
      schemaVersion: 1,
      appVersion: '0.0.1',
      exportedAt: new Date().toISOString(),
      entryProgress: [
        {
          entryId: 'a1-0001-hallo',
          introducedAt: '2026-01-01T00:00:00.000Z',
          srs: {
            entryId: 'a1-0001-hallo',
            status: 'review',
            dueAt: '2026-02-01T00:00:00.000Z',
            intervalDays: 10,
            easeFactor: 2.5,
            repetitions: 3,
          },
          totalAttempts: 3,
          totalCorrect: 3,
          firstAttemptCorrect: 3,
        },
      ],
      exerciseHistory: [],
      sessions: [],
      achievements: [],
      settings: null,
      // no xpEvents: predates version 3
    };

    const result = await inspectImport(JSON.stringify(legacy));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.migrated).toBe(true);
      expect(result.file.entryProgress[0]?.srs.difficulty).toBe(0.5);
    }
  });
});

describe('import application (§25)', () => {
  it('merges without losing existing progress', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo', 9));
    const incoming = {
      ...(await exportProgress()),
      entryProgress: [progressRow('a1-0001-hallo', 2), progressRow('a1-0002-ich', 4)],
    };

    await applyImport(incoming, 'merge');

    const kept = await db.entryProgress.get('a1-0001-hallo');
    // The local record had more attempts, so a merge keeps it.
    expect(kept?.totalAttempts).toBe(9);
    expect(await db.entryProgress.count()).toBe(2);
  });

  it('does not import history for an entry whose local counters it kept', async () => {
    // Local record wins on attempts, so importing that entry's history anyway would leave
    // more history rows than `totalAttempts` accounts for — and the progress screens count
    // history rows directly, so the two would disagree forever.
    await db.entryProgress.put(progressRow('a1-0001-hallo', 9));
    const incoming = {
      ...(await exportProgress()),
      entryProgress: [progressRow('a1-0001-hallo', 2)],
      exerciseHistory: [historyRow('other:1'), historyRow('other:2')],
    };

    await applyImport(incoming, 'merge');

    expect((await db.entryProgress.get('a1-0001-hallo'))?.totalAttempts).toBe(9);
    expect(await db.exerciseHistory.count()).toBe(0);
  });

  it('imports history for an entry whose incoming record it took', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo', 2));
    const incoming = {
      ...(await exportProgress()),
      entryProgress: [progressRow('a1-0001-hallo', 12)],
      exerciseHistory: [historyRow('other:1'), historyRow('other:2')],
    };

    await applyImport(incoming, 'merge');
    expect(await db.exerciseHistory.count()).toBe(2);
  });

  it('takes the incoming record when it reflects more study', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo', 2));
    const incoming = {
      ...(await exportProgress()),
      entryProgress: [progressRow('a1-0001-hallo', 12)],
    };

    await applyImport(incoming, 'merge');
    expect((await db.entryProgress.get('a1-0001-hallo'))?.totalAttempts).toBe(12);
  });

  it('replaces everything in replace mode', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    await db.entryProgress.put(progressRow('a1-0002-ich'));

    const incoming = {
      ...(await exportProgress()),
      entryProgress: [progressRow('a1-0003-sein')],
    };
    await applyImport(incoming, 'replace');

    const all = await db.entryProgress.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.entryId).toBe('a1-0003-sein');
  });

  it('does not duplicate history rows on a repeated import', async () => {
    await db.exerciseHistory.put(historyRow('h1'));
    const file = await exportProgress();

    await applyImport(file, 'merge');
    await applyImport(file, 'merge');

    expect(await db.exerciseHistory.count()).toBe(1);
  });

  it('round-trips into an empty database', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    await db.exerciseHistory.put(historyRow('h1'));
    await db.xpEvents.put({
      id: 'daily:2026-05-01',
      type: 'dailyGoal',
      amount: 25,
      awardedAt: '2026-05-01T10:00:00.000Z',
    });
    const text = serializeExport(await exportProgress());

    await resetAllProgress();
    const inspection = await inspectImport(text);
    expect(inspection.valid).toBe(true);
    if (!inspection.valid) return;
    await applyImport(inspection.file, 'replace');

    expect(await db.entryProgress.count()).toBe(1);
    expect(await db.exerciseHistory.count()).toBe(1);
    expect(await db.xpEvents.count()).toBe(1);
  });
});

describe('repair (§17)', () => {
  it('reports a clean database', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    const report = await repairDatabase();
    expect(report.ok).toBe(true);
    expect(report.removedProgress).toBe(0);
  });

  it('removes a corrupt record and keeps valid ones', async () => {
    await db.entryProgress.put(progressRow('a1-0001-hallo'));
    // A row that no longer satisfies the schema, as a partial write might leave.
    await db.entryProgress.put({ entryId: 'broken' } as unknown as EntryProgress);

    const report = await repairDatabase();
    expect(report.ok).toBe(false);
    expect(report.removedProgress).toBe(1);
    expect(await db.entryProgress.count()).toBe(1);
  });
});
