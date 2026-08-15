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

    expect(screen.getByRole('status')).toHaveTextContent(/correct/i);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(true);
    expect(outcome.attempts).toBe(1);
    expect(outcome.revealed).toBe(false);
    expect(outcome.responseMs).toBeGreaterThanOrEqual(0);
  });

  it('locks a wrong answer with no second try', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.click(screen.getByRole('radio', { name: 'night' }));

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue/i }));
    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(false);
    expect(outcome.attempts).toBe(1);
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

    await user.click(screen.getByRole('radio', { name: 'day' }));

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(document.activeElement).not.toBe(status);
  });

  it('answers with a number key and continues with Enter', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    // 'day' is the correct option; find its position so the test does not depend on the
    // fixture's option order.
    const position = fixtures.multipleChoice.options.indexOf('day') + 1;
    await user.keyboard(String(position));

    expect(screen.getByRole('status')).toHaveTextContent(/correct/i);

    await user.keyboard('{Enter}');

    const outcome = lastOutcome(onComplete);
    expect(outcome.result.correct).toBe(true);
    expect(outcome.attempts).toBe(1);
  });

  it('ignores a number key beyond the last option', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ExerciseRunner exercise={fixtures.multipleChoice} onComplete={onComplete} />);

    await user.keyboard('9');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('hides the hint until it is asked for, and records that it was used', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const exercise = { ...fixtures.multipleChoice, hint: 'A part of the day.' };
    render(<ExerciseRunner exercise={exercise} onComplete={onComplete} />);

    expect(screen.queryByText('A part of the day.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show hint/i }));
    expect(screen.getByText('A part of the day.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(lastOutcome(onComplete).hintUsed).toBe(true);
  });

  it('reports no hint use when the hint was never opened', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const exercise = { ...fixtures.multipleChoice, hint: 'A part of the day.' };
    render(<ExerciseRunner exercise={exercise} onComplete={onComplete} />);

    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(lastOutcome(onComplete).hintUsed).toBe(false);
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
