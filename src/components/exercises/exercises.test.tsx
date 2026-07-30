import { useRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { TypedTranslationExercise } from './TypedTranslationExercise';
import { SentenceCompletionExercise } from './SentenceCompletionExercise';
import { MatchingExercise } from './MatchingExercise';
import { WordOrderingExercise } from './WordOrderingExercise';
import { ListeningExercise } from './ListeningExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { GermanCharacterHelper } from './GermanCharacterHelper';
import * as fixtures from '@/test/fixtures/exercises';
import type { EvaluationResult } from '@/schemas/exerciseSchema';

const defaults = { locked: false, attempt: 1, revealed: false };

function lastResult(onSubmit: ReturnType<typeof vi.fn>): EvaluationResult {
  return onSubmit.mock.calls.at(-1)?.[0] as EvaluationResult;
}

describe('MultipleChoiceExercise', () => {
  it('renders the question and all options as a radio group', () => {
    render(
      <MultipleChoiceExercise
        {...defaults}
        exercise={fixtures.multipleChoice}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('der Tag')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('reports a correct choice', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MultipleChoiceExercise
        {...defaults}
        exercise={fixtures.multipleChoice}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('reports a wrong choice and names the correct answer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MultipleChoiceExercise
        {...defaults}
        exercise={fixtures.multipleChoice}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'night' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const result = lastResult(onSubmit);
    expect(result.correct).toBe(false);
    expect(result.issues[0]?.message).toMatch(/day/);
  });

  it('cannot be submitted before an option is chosen', () => {
    render(
      <MultipleChoiceExercise
        {...defaults}
        exercise={fixtures.multipleChoice}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled();
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MultipleChoiceExercise
        {...defaults}
        exercise={fixtures.multipleChoice}
        onSubmit={onSubmit}
      />,
    );

    await user.tab();
    await user.keyboard(' ');
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('TypedTranslationExercise', () => {
  it('accepts an exactly correct German answer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TypedTranslationExercise
        {...defaults}
        exercise={fixtures.typedTranslation}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/your answer/i), 'die Straße');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('rejects a lowercase noun spelled with ss and explains both problems', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TypedTranslationExercise
        {...defaults}
        exercise={fixtures.typedTranslation}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/your answer/i), 'die strasse');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const result = lastResult(onSubmit);
    expect(result.correct).toBe(false);
    expect(result.issues.map((i) => i.category)).toEqual(
      expect.arrayContaining(['wrongCapitalization', 'ssInsteadOfEszett']),
    );
  });

  it('flags a missing article', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TypedTranslationExercise
        {...defaults}
        exercise={fixtures.typedTranslation}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/your answer/i), 'Straße');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).issues.map((i) => i.category)).toContain('missingArticle');
  });

  it('offers the German character helper for German answers', () => {
    render(
      <TypedTranslationExercise
        {...defaults}
        exercise={fixtures.typedTranslation}
        onSubmit={vi.fn()}
      />,
    );
    // Exact names: a case-insensitive pattern would match both "ä" and "Ä".
    for (const name of [
      'Insert a umlaut ä',
      'Insert o umlaut ö',
      'Insert u umlaut ü',
      'Insert capital A umlaut Ä',
      'Insert capital O umlaut Ö',
      'Insert capital U umlaut Ü',
      'Insert eszett ß',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TypedTranslationExercise
        {...defaults}
        exercise={fixtures.typedTranslation}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/your answer/i), 'die Straße{Enter}');
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('SentenceCompletionExercise', () => {
  it('shows the sentence around the gap and its translation', () => {
    render(
      <SentenceCompletionExercise
        {...defaults}
        exercise={fixtures.sentenceCompletion}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/ist lang\./)).toBeInTheDocument();
    expect(screen.getByText('The day is long.')).toBeInTheDocument();
  });

  it('accepts the correct word', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SentenceCompletionExercise
        {...defaults}
        exercise={fixtures.sentenceCompletion}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/missing word/i), 'Tag');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('rejects a lowercase noun in the gap', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SentenceCompletionExercise
        {...defaults}
        exercise={fixtures.sentenceCompletion}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/missing word/i), 'tag');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).issues.map((i) => i.category)).toContain('wrongCapitalization');
  });

  it('shows the full sentence when revealed', () => {
    render(
      <SentenceCompletionExercise
        {...defaults}
        revealed
        exercise={fixtures.sentenceCompletion}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Der Tag ist lang.')).toBeInTheDocument();
  });
});

describe('MatchingExercise', () => {
  it('renders five pairs across two columns', () => {
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /der Tag/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'day' })).toBeInTheDocument();
  });

  it('matches with click-to-select and reports success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={onSubmit} />);

    for (const pair of fixtures.matching.pairs) {
      await user.click(screen.getByRole('button', { name: new RegExp(pair.left) }));
      await user.click(screen.getByRole('button', { name: pair.right }));
    }

    await user.click(screen.getByRole('button', { name: /check answers/i }));
    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('reports which pairs were wrong', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={onSubmit} />);

    // Deliberately swap the first two right-hand values.
    const [first, second, ...rest] = fixtures.matching.pairs;
    await user.click(screen.getByRole('button', { name: new RegExp(first!.left) }));
    await user.click(screen.getByRole('button', { name: second!.right }));
    await user.click(screen.getByRole('button', { name: new RegExp(second!.left) }));
    await user.click(screen.getByRole('button', { name: first!.right }));
    for (const pair of rest) {
      await user.click(screen.getByRole('button', { name: new RegExp(pair.left) }));
      await user.click(screen.getByRole('button', { name: pair.right }));
    }

    await user.click(screen.getByRole('button', { name: /check answers/i }));
    const result = lastResult(onSubmit);
    expect(result.correct).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('cannot be submitted until every pair is matched', () => {
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /check answers/i })).toBeDisabled();
  });

  it('is fully operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={vi.fn()} />);

    const first = screen.getByRole('button', { name: /der Tag/ });
    first.focus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  it('announces matching progress', async () => {
    const user = userEvent.setup();
    render(<MatchingExercise {...defaults} exercise={fixtures.matching} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /der Tag/ }));
    await user.click(screen.getByRole('button', { name: 'day' }));

    expect(screen.getByRole('status')).toHaveTextContent('1 of 5 matched');
  });
});

describe('WordOrderingExercise', () => {
  it('renders every token', () => {
    render(
      <WordOrderingExercise {...defaults} exercise={fixtures.wordOrdering} onSubmit={vi.fn()} />,
    );
    for (const token of fixtures.wordOrdering.tokens) {
      expect(screen.getByText(token)).toBeInTheDocument();
    }
  });

  it('offers move buttons as an alternative to dragging', () => {
    render(
      <WordOrderingExercise {...defaults} exercise={fixtures.wordOrdering} onSubmit={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: /move .* left/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /move .* right/i }).length).toBeGreaterThan(0);
  });

  it('accepts the sentence once reordered correctly with the buttons', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WordOrderingExercise {...defaults} exercise={fixtures.wordOrdering} onSubmit={onSubmit} />,
    );

    // Start: ["ist", "Der", "lang.", "Tag"] → target: ["Der", "Tag", "ist", "lang."]
    await user.click(screen.getByRole('button', { name: /move Der left/i }));
    await user.click(screen.getByRole('button', { name: /move Tag left/i }));
    await user.click(screen.getByRole('button', { name: /move Tag left/i }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    const result = lastResult(onSubmit);
    expect(result.submittedAnswer).toBe('Der Tag ist lang.');
    expect(result.correct).toBe(true);
  });

  it('reports a word-order error for the wrong order', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WordOrderingExercise {...defaults} exercise={fixtures.wordOrdering} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole('button', { name: /check answer/i }));
    const result = lastResult(onSubmit);
    expect(result.correct).toBe(false);
    expect(result.issues[0]?.category).toBe('wordOrderError');
  });

  it('announces the current order', () => {
    const { container } = render(
      <WordOrderingExercise {...defaults} exercise={fixtures.wordOrdering} onSubmit={vi.fn()} />,
    );
    // dnd-kit renders its own aria-live region, so target the component's own readout.
    expect(container.querySelector('.exercise__current')).toHaveTextContent('ist Der lang. Tag');
  });
});

describe('ListeningExercise', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to showing the text when speech synthesis is unavailable', () => {
    // jsdom provides no speechSynthesis, which is exactly the unsupported case.
    render(
      <ListeningExercise {...defaults} exercise={fixtures.listeningChoice} onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(/does not support speech synthesis/i);
    expect(screen.getByText('der Tag')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play audio/i })).toBeDisabled();
  });

  it('still allows answering without audio', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListeningExercise {...defaults} exercise={fixtures.listeningChoice} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole('radio', { name: 'day' }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('checks a typed German answer strictly', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListeningExercise {...defaults} exercise={fixtures.listeningTyped} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/type what you hear/i), 'die strasse');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(lastResult(onSubmit).correct).toBe(false);
  });
});

describe('SpeakingExercise', () => {
  it('shows the target text and its translation', () => {
    render(<SpeakingExercise {...defaults} exercise={fixtures.speaking} onSubmit={vi.fn()} />);
    expect(screen.getByText('Wie geht es Ihnen?')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('states the required privacy disclosure verbatim', () => {
    render(<SpeakingExercise {...defaults} exercise={fixtures.speaking} onSubmit={vi.fn()} />);
    expect(
      screen.getByText(/The app does not record or store your voice\. Browser behavior may vary\./),
    ).toBeInTheDocument();
  });

  it('offers manual self-assessment when recognition is unsupported', () => {
    render(<SpeakingExercise {...defaults} exercise={fixtures.speaking} onSubmit={vi.fn()} />);

    expect(screen.getByRole('note')).toHaveTextContent(/not available in this browser/i);
    expect(screen.getByRole('button', { name: /i said it correctly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i need more practice/i })).toBeInTheDocument();
  });

  it('never blocks progression when unsupported', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SpeakingExercise {...defaults} exercise={fixtures.speaking} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /i said it correctly/i }));
    expect(lastResult(onSubmit).correct).toBe(true);
  });

  it('records a self-assessed failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SpeakingExercise {...defaults} exercise={fixtures.speaking} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /i need more practice/i }));
    expect(lastResult(onSubmit).correct).toBe(false);
  });
});

describe('GermanCharacterHelper', () => {
  function Harness(): React.ReactNode {
    // A real `useRef`, as the exercise components use — a fresh object literal per render
    // would not be populated in time for the helper's click handler.
    const ref = useRef<HTMLInputElement | null>(null);
    return (
      <div>
        <label htmlFor="field">Field</label>
        <input id="field" ref={ref} defaultValue="" />
        <GermanCharacterHelper targetRef={ref} />
      </div>
    );
  }

  // NOTE: these tests never type with userEvent *after* a helper insertion. userEvent
  // keeps its own model of the field's value, and a programmatic insertion it did not
  // perform is discarded on the next simulated keystroke. That is a limitation of the
  // test driver, not of the helper — real typing after an insertion works correctly.
  it('inserts a character at the caret', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Field');
    await user.click(field);
    await user.keyboard('Stra');
    await user.click(screen.getByRole('button', { name: 'Insert eszett ß' }));

    expect(field).toHaveValue('Straß');
    expect((field as HTMLInputElement).selectionStart).toBe(5);
  });

  it('appends when the caret is at the end', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Field');
    await user.click(field);
    await user.keyboard('Gru');
    await user.click(screen.getByRole('button', { name: 'Insert eszett ß' }));

    expect(field).toHaveValue('Gruß');
  });

  it('inserts into the middle of existing text', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Field') as HTMLInputElement;
    await user.click(field);
    await user.keyboard('Fe');
    field.setSelectionRange(1, 1);
    await user.click(screen.getByRole('button', { name: 'Insert a umlaut ä' }));

    expect(field).toHaveValue('Fäe');
  });

  it('labels every character button accessibly', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /insert capital A umlaut/i })).toBeInTheDocument();
  });

  it('keeps focus in the field after inserting', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Field');
    await user.click(field);
    await user.click(screen.getByRole('button', { name: /insert o umlaut/i }));

    expect(field).toHaveFocus();
  });
});
