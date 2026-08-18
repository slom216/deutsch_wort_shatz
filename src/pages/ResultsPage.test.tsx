import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { renderRoute } from '@/test/helpers/renderRoute';
import { db } from '@/features/persistence/db';
import { useSessionStore } from '@/features/practice/session/sessionStore';
import { expectedAnswerOf, questionOf } from '@/components/exercises/expectedAnswer';
import { loadPilotDataset } from '@/test/fixtures/pilotDataset';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';

let pilot: readonly VocabularyEntry[];

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

beforeEach(async () => {
  await Promise.all([db.sessions.clear(), db.exerciseHistory.clear(), db.entryProgress.clear()]);
  useSessionStore.getState().reset();
});

describe('ResultsPage', () => {
  it('shows the answer of every exercise the learner got wrong', async () => {
    await useSessionStore.getState().start({
      sessionId: 'results-test',
      mode: 'review',
      entries: pilot,
      targetExerciseCount: 3,
    });

    const exercise = useSessionStore.getState().exercises[0]!;
    await useSessionStore.getState().recordAnswer({
      exerciseId: exercise.id,
      entryId: exercise.entryId,
      result: {
        correct: false,
        issues: [{ category: 'wrongMeaning', message: 'Nope.' }],
        submittedAnswer: 'nonsense',
        expectedAnswer: expectedAnswerOf(exercise),
      },
      attempts: 1,
      revealed: false,
      hintUsed: false,
      responseMs: 1_000,
    });

    renderRoute('/results/results-test');

    await waitFor(() => {
      expect(screen.getByText('The answers you missed')).toBeInTheDocument();
    });
    expect(screen.getAllByText(expectedAnswerOf(exercise)).length).toBeGreaterThan(0);
    // The row shows what was asked, not the headword — otherwise an English→German row
    // would print the same German word twice.
    expect(screen.getAllByText(questionOf(exercise)).length).toBeGreaterThan(0);
  });
});
