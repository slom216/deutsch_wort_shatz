import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExerciseRunner, type ExerciseOutcome } from './ExerciseRunner';
import * as fixtures from '@/test/fixtures/exercises';

function lastOutcome(onComplete: ReturnType<typeof vi.fn>): ExerciseOutcome {
  return onComplete.mock.calls.at(-1)?.[0] as ExerciseOutcome;
}

describe('ExerciseRunner', () => {
  it('shows progress and the exercise', () => {
    render(
      <ExerciseRunner
        exercise={fixtures.multipleChoice}
        onComplete={vi.fn()}
        progressLabel="Exercise 1 of 20"
      />,
    );
    expect(screen.getByText('Exercise 1 of 20')).toBeInTheDocument();
    expect(screen.getByText('der Tag')).toBeInTheDocument();
  });

  it('reports a first-attempt correct answer', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/correct/i);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(true);
    expect(outcome.attempts).toBe(1);
    expect(outcome.revealed).toBe(false);
    expect(outcome.responseMs).toBeGreaterThanOrEqual(0);
  });

  it('offers one retry after a wrong answer, then locks', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.click(screen.getByRole('radio', { name: 'night' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    // First wrong answer: a retry is offered and the exercise is not yet locked.
    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry).toBeInTheDocument();

    await user.click(retry);
    await user.click(screen.getByRole('radio', { name: 'year' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    // Second wrong answer: no further retry.
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue/i }));
    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(false);
    expect(outcome.attempts).toBe(2);
  });

  it('records a correct second attempt with attempts = 2', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.click(screen.getByRole('radio', { name: 'night' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(true);
    expect(outcome.attempts).toBe(2);
  });

  it('marks a revealed answer as incorrect', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /show answer/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/answer revealed/i);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    const outcome = lastOutcome(onComplete);
    expect(outcome.revealed).toBe(true);
    expect(outcome.result.correct).toBe(false);
    expect(outcome.result.expectedAnswer).toBe('day');
  });

  it('shows the full corrected sentence after a sentence-completion answer', async () => {
    const user = userEvent.setup();
    render(<ExerciseRunner exercise={fixtures.sentenceCompletion} onComplete={vi.fn()} />);

    await user.type(screen.getByLabelText(/missing word/i), 'Tag');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Der Tag ist lang.');
  });

  it('announces feedback in a live region without moving focus', async () => {
    const user = userEvent.setup();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /check answer/i });
    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(submit);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(document.activeElement).not.toBe(status);
  });

  it('runs every exercise type without crashing', () => {
    for (const exercise of [
      fixtures.multipleChoice,
      fixtures.typedTranslation,
      fixtures.sentenceCompletion,
      fixtures.matching,
      fixtures.wordOrdering,
      fixtures.listeningChoice,
      fixtures.speaking,
    ]) {
      const { unmount } = render(<ExerciseRunner exercise={exercise} onComplete={vi.fn()} />);
      // `getAllByText`: option-based formats repeat the prompt in a visually hidden
      // <legend> so the radio group is labelled for assistive technology.
      expect(screen.getAllByText(exercise.prompt).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
