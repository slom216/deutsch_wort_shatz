import { useEffect, useRef, useState, type ReactNode } from 'react';

import type {
  ErrorCategory,
  MatchingExercise as MatchingExerciseType,
} from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Matching (§15, §30).
 *
 * Interaction is click-to-select: choose a term in either column, then its match in the
 * other. After each pick focus moves to the other column (and back to the next unmatched
 * German term), so a keyboard user never tabs through a whole column to reach the other.
 * Because the controls are real buttons this works identically with a mouse, with the
 * keyboard (Tab plus Enter or Space), and with a screen reader — satisfying the rule
 * that drag-and-drop must never be the only way to answer.
 */
export function MatchingExercise({
  exercise,
  onSubmit,
  locked,
}: ExerciseComponentProps<MatchingExerciseType>): ReactNode {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** pair id → chosen right-hand value */
  const [matches, setMatches] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
  }, [exercise.id]);

  /** Focuses the first enabled control matching `selector` once React has rendered. */
  const focusNext = (selector: string): void => {
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  };

  const usedRight = new Set(Object.values(matches));
  const allMatched = Object.keys(matches).length === exercise.pairs.length;

  const match = (pairId: string, right: string): void => {
    const next = { ...matches };
    // A right-hand value can only be used once; clear any previous owner.
    for (const [owner, value] of Object.entries(next)) {
      if (value === right) delete next[owner];
    }
    next[pairId] = right;
    setMatches(next);
    setSelectedLeft(null);
    setSelectedRight(null);
    const done = Object.keys(next).length === exercise.pairs.length;
    focusNext(
      done ? '.exercise__submit' : '[data-side="left"][data-matched="false"]:not(:disabled)',
    );
  };

  const chooseLeft = (pairId: string): void => {
    if (locked) return;
    if (selectedRight !== null) {
      match(pairId, selectedRight);
      return;
    }
    const deselect = selectedLeft === pairId;
    setSelectedLeft(deselect ? null : pairId);
    if (!deselect) focusNext('[data-side="right"][data-used="false"]');
  };

  const chooseRight = (right: string): void => {
    if (locked) return;
    if (selectedLeft !== null) {
      match(selectedLeft, right);
      return;
    }
    const deselect = selectedRight === right;
    setSelectedRight(deselect ? null : right);
    if (!deselect) focusNext('[data-side="left"][data-matched="false"]');
  };

  /** What a mismatch means for this matching variant (§16 error categories). */
  const categoryFor = (variant: string): ErrorCategory => {
    if (variant === 'nounToPlural') return 'wrongPlural';
    if (variant === 'verbToParticiple') return 'wrongConjugation';
    return 'wrongMeaning';
  };

  const submit = (): void => {
    if (!allMatched || locked) return;

    const wrong = exercise.pairs.filter((pair) => matches[pair.id] !== pair.right);
    const correct = wrong.length === 0;

    onSubmit({
      correct,
      issues: correct
        ? []
        : wrong.map((pair) => ({
            // The variant says what a mismatch actually was. Filing a wrong plural under
            // "wrong meaning" would put it in the wrong column of the error statistics.
            category: categoryFor(exercise.variant),
            message: `"${pair.left}" matches "${pair.right}".`,
          })),
      submittedAnswer: exercise.pairs
        .map((pair) => `${pair.left} → ${matches[pair.id] ?? '—'}`)
        .join('; '),
      expectedAnswer: exercise.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; '),
    });
  };

  return (
    <div className="exercise" ref={rootRef}>
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__hint">
        Choose a term in either column, then its match in the other. Works with the mouse or the
        keyboard.
      </p>

      <div className="matching">
        <div className="matching__column">
          <h3 className="matching__heading" id={`left-${exercise.id}`}>
            German
          </h3>
          <ul className="matching__list" aria-labelledby={`left-${exercise.id}`}>
            {exercise.pairs.map((pair) => {
              const matched = matches[pair.id];
              const isSelected = selectedLeft === pair.id;
              const isCorrect = locked && matched === pair.right;
              const isWrong = locked && matched !== pair.right;
              return (
                <li key={pair.id}>
                  <button
                    type="button"
                    disabled={locked}
                    data-side="left"
                    data-matched={matched !== undefined}
                    aria-pressed={isSelected}
                    className={`matching__item ${isSelected ? 'matching__item--selected' : ''} ${
                      isCorrect ? 'matching__item--correct' : ''
                    } ${isWrong ? 'matching__item--wrong' : ''}`}
                    onClick={() => chooseLeft(pair.id)}
                  >
                    <span lang="de">{pair.left}</span>
                    {matched ? <span className="matching__match">→ {matched}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="matching__column">
          <h3 className="matching__heading" id={`right-${exercise.id}`}>
            English
          </h3>
          <ul className="matching__list" aria-labelledby={`right-${exercise.id}`}>
            {exercise.shuffledRight.map((right) => (
              <li key={right}>
                <button
                  type="button"
                  disabled={locked}
                  data-side="right"
                  data-used={usedRight.has(right)}
                  aria-pressed={selectedRight === right}
                  className={`matching__item ${usedRight.has(right) ? 'matching__item--used' : ''} ${
                    selectedRight === right ? 'matching__item--selected' : ''
                  }`}
                  onClick={() => chooseRight(right)}
                >
                  {right}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="exercise__progress" role="status" aria-live="polite">
        {Object.keys(matches).length} of {exercise.pairs.length} matched
        {selectedLeft
          ? `. Selected: ${exercise.pairs.find((p) => p.id === selectedLeft)?.left}`
          : ''}
        {selectedRight ? `. Selected: ${selectedRight}` : ''}
      </p>

      {!locked ? (
        <button type="button" className="exercise__submit" onClick={submit} disabled={!allMatched}>
          Check answers
        </button>
      ) : null}
    </div>
  );
}
