import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadSessionHistory, loadSessionRecord, useSessionStore } from './sessionStore';
import { db } from '@/features/persistence/db';
import { loadPilotDataset } from '@/test/fixtures/pilotDataset';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';

let pilot: readonly VocabularyEntry[];

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

beforeEach(async () => {
  await Promise.all([db.sessions.clear(), db.exerciseHistory.clear()]);
  useSessionStore.getState().reset();
});

async function startSession(sessionId = 'test-session'): Promise<void> {
  await useSessionStore.getState().start({
    sessionId,
    mode: 'review',
    entries: pilot,
    targetExerciseCount: 5,
  });
}

describe('session store', () => {
  it('builds and persists a session record on start', async () => {
    await startSession();

    const state = useSessionStore.getState();
    expect(state.exercises).toHaveLength(5);
    expect(state.status).toBe('active');

    const record = await loadSessionRecord('test-session');
    expect(record?.status).toBe('active');
    expect(record?.plannedExerciseCount).toBe(5);
  });

  it('rebuilds the identical session for the same id', async () => {
    await startSession('stable-id');
    const first = useSessionStore.getState().exercises.map((e) => e.id);

    useSessionStore.getState().reset();
    await startSession('stable-id');
    const second = useSessionStore.getState().exercises.map((e) => e.id);

    expect(second).toEqual(first);
  });

  it('writes each answer to exercise history', async () => {
    await startSession();
    const exercise = useSessionStore.getState().exercises[0]!;

    await useSessionStore.getState().recordAnswer({
      exerciseId: exercise.id,
      entryId: exercise.entryId,
      result: { correct: true, issues: [], submittedAnswer: 'x', expectedAnswer: 'x' },
      attempts: 1,
      revealed: false,
      hintUsed: false,
      responseMs: 1234,
    });

    const history = await loadSessionHistory('test-session');
    expect(history).toHaveLength(1);
    expect(history[0]?.correct).toBe(true);
    expect(history[0]?.firstAttempt).toBe(true);
    expect(history[0]?.responseMs).toBe(1234);
    expect(history[0]?.exerciseType).toBe(exercise.type);
  });

  it('stores the error categories of a wrong answer', async () => {
    await startSession();
    const exercise = useSessionStore.getState().exercises[0]!;

    await useSessionStore.getState().recordAnswer({
      exerciseId: exercise.id,
      entryId: exercise.entryId,
      result: {
        correct: false,
        issues: [
          { category: 'wrongCapitalization', message: 'x' },
          { category: 'ssInsteadOfEszett', message: 'y' },
        ],
        submittedAnswer: 'die strasse',
        expectedAnswer: 'die Straße',
      },
      attempts: 1,
      revealed: false,
      hintUsed: false,
      responseMs: 900,
    });

    const history = await loadSessionHistory('test-session');
    expect(history[0]?.errorCategories).toEqual(['wrongCapitalization', 'ssInsteadOfEszett']);
  });

  it('grades a revealed answer as 0 and a retried answer as 1', async () => {
    await startSession();
    const [first, second] = useSessionStore.getState().exercises;

    await useSessionStore.getState().recordAnswer({
      exerciseId: first!.id,
      entryId: first!.entryId,
      result: { correct: false, issues: [], submittedAnswer: '', expectedAnswer: 'x' },
      attempts: 1,
      revealed: true,
      hintUsed: false,
      responseMs: 100,
    });
    await useSessionStore.getState().recordAnswer({
      exerciseId: second!.id,
      entryId: second!.entryId,
      result: { correct: true, issues: [], submittedAnswer: 'x', expectedAnswer: 'x' },
      attempts: 2,
      revealed: false,
      hintUsed: false,
      responseMs: 100,
    });

    const history = await loadSessionHistory('test-session');
    const byId = new Map(history.map((row) => [row.id, row]));
    expect(byId.get(`test-session:${first!.id}`)?.grade).toBe(0);
    expect(byId.get(`test-session:${second!.id}`)?.grade).toBe(1);
  });

  it('marks the session completed after the last exercise', async () => {
    await startSession();
    const total = useSessionStore.getState().exercises.length;

    for (let i = 0; i < total; i += 1) {
      await useSessionStore.getState().advance();
    }

    expect(useSessionStore.getState().status).toBe('completed');
    const record = await loadSessionRecord('test-session');
    expect(record?.status).toBe('completed');
    expect(record?.completedAt).toBeDefined();
  });

  it('keeps a running tally of correct answers on the session record', async () => {
    await startSession();
    const exercises = useSessionStore.getState().exercises;

    for (const [index, exercise] of exercises.slice(0, 3).entries()) {
      await useSessionStore.getState().recordAnswer({
        exerciseId: exercise.id,
        entryId: exercise.entryId,
        result: {
          correct: index < 2,
          issues: [],
          submittedAnswer: 'x',
          expectedAnswer: 'x',
        },
        attempts: 1,
        revealed: false,
        hintUsed: false,
        responseMs: 500,
      });
    }

    const record = await loadSessionRecord('test-session');
    expect(record?.completedExerciseCount).toBe(3);
    expect(record?.correctCount).toBe(2);
    expect(record?.firstAttemptCorrectCount).toBe(2);
  });

  it('survives a store reset, because results live in IndexedDB', async () => {
    await startSession('durable');
    const exercise = useSessionStore.getState().exercises[0]!;
    await useSessionStore.getState().recordAnswer({
      exerciseId: exercise.id,
      entryId: exercise.entryId,
      result: { correct: true, issues: [], submittedAnswer: 'x', expectedAnswer: 'x' },
      attempts: 1,
      revealed: false,
      hintUsed: false,
      responseMs: 200,
    });

    useSessionStore.getState().reset();
    expect(useSessionStore.getState().exercises).toHaveLength(0);

    const history = await loadSessionHistory('durable');
    expect(history).toHaveLength(1);
  });
});

describe('resuming after a reload', () => {
  async function answerFirst(count: number, sessionId: string): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const exercise = useSessionStore.getState().exercises[index]!;
      await useSessionStore.getState().recordAnswer({
        exerciseId: exercise.id,
        entryId: exercise.entryId,
        result: { correct: true, issues: [], submittedAnswer: 'x', expectedAnswer: 'x' },
        attempts: 1,
        revealed: false,
        hintUsed: false,
        responseMs: 900,
      });
      await useSessionStore.getState().advance();
    }
    expect(await loadSessionHistory(sessionId)).toHaveLength(count);
  }

  beforeEach(async () => {
    await db.entryProgress.clear();
  });

  it('picks up where the learner left off instead of starting over', async () => {
    await startSession('resumed');
    await answerFirst(2, 'resumed');

    // A reload: the store is empty and the page calls start() again with the same id.
    useSessionStore.getState().reset();
    await startSession('resumed');

    const state = useSessionStore.getState();
    expect(state.currentIndex).toBe(2);
    expect(state.answers).toHaveLength(2);
    expect(state.status).toBe('active');
  });

  it('does not re-grade the answers it replays', async () => {
    await startSession('no-double-count');
    await answerFirst(2, 'no-double-count');

    const before = await db.entryProgress.toArray();
    const attemptsBefore = before.reduce((sum, row) => sum + row.totalAttempts, 0);
    expect(attemptsBefore).toBe(2);

    useSessionStore.getState().reset();
    await startSession('no-double-count');

    const after = await db.entryProgress.toArray();
    expect(after.reduce((sum, row) => sum + row.totalAttempts, 0)).toBe(attemptsBefore);
  });

  it('keeps the answered count on the session record rather than resetting it to zero', async () => {
    await startSession('summary-kept');
    await answerFirst(2, 'summary-kept');

    useSessionStore.getState().reset();
    await startSession('summary-kept');

    const record = await loadSessionRecord('summary-kept');
    expect(record?.completedExerciseCount).toBe(2);
    expect(record?.correctCount).toBe(2);
  });

  it('drops a skipped exercise so a resumed stream does not stop on it', async () => {
    // A skipped exercise is never answered, and `start` replays history only as far as the
    // first exercise without a row. Left in the list it would be where every later reload
    // resumed, stranding the answers after it — so it has to leave the list entirely.
    await startSession('borrowed');
    const [first, second, third] = useSessionStore.getState().exercises;
    useSessionStore.getState().reset();

    const store = useSessionStore.getState();
    await store.start({ sessionId: 'stream', mode: 'continuous', entries: [] });
    await store.serve(first!);
    await store.recordAnswer({
      exerciseId: first!.id,
      entryId: first!.entryId,
      result: { correct: true, issues: [], submittedAnswer: 'x', expectedAnswer: 'x' },
      attempts: 1,
      revealed: false,
      hintUsed: false,
      responseMs: 800,
    });
    await store.serve(second!);
    await store.dropCurrent();
    await store.serve(third!);

    useSessionStore.getState().reset();
    await useSessionStore.getState().start({
      sessionId: 'stream',
      mode: 'continuous',
      entries: [],
    });

    const resumed = useSessionStore.getState();
    expect(resumed.exercises.map((exercise) => exercise.id)).toEqual([first!.id, third!.id]);
    expect(resumed.currentIndex).toBe(1);
  });

  it('records the XP earned on the session', async () => {
    await startSession('xp-session');
    await answerFirst(3, 'xp-session');

    const record = await loadSessionRecord('xp-session');
    const history = await loadSessionHistory('xp-session');
    const expected = history.reduce((sum, row) => sum + row.xpAwarded, 0);

    expect(expected).toBeGreaterThan(0);
    expect(record?.xpEarned).toBe(expected);
  });
});
