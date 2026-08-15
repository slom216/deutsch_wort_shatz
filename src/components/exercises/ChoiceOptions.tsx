import { useEffect, type ReactNode } from 'react';

import './exercises.css';

/**
 * A numbered radio group that answers on selection.
 *
 * Every choice-style exercise uses this, so the keyboard contract is the same wherever
 * options appear: the options are numbered, the matching number key answers outright, and
 * Enter is left alone for the runner's Continue. One keystroke per question, rather than
 * select-then-confirm.
 *
 * The number keys are additive — clicking, Tab and the arrow keys all still work, because
 * this is a native radio group.
 */

interface ChoiceOptionsProps {
  readonly options: readonly string[];
  readonly correctIndex: number;
  /** Radio group name; must differ per exercise so a new question starts unselected. */
  readonly name: string;
  readonly selected: number | null;
  readonly locked: boolean;
  /** Marks the right answer even when the learner never chose it (§15). */
  readonly revealed?: boolean;
  readonly legend: string;
  readonly onAnswer: (index: number) => void;
}

export function ChoiceOptions({
  options,
  correctIndex,
  name,
  selected,
  locked,
  revealed = false,
  legend,
  onAnswer,
}: ChoiceOptionsProps): ReactNode {
  // A digit answers the question outright. Modifier combinations are left alone so
  // browser shortcuts (Alt+1 and friends) keep working.
  useEffect(() => {
    if (locked) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type !== 'radio') return;
      if (target instanceof HTMLTextAreaElement) return;

      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= options.length) return;
      event.preventDefault();
      onAnswer(index);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [locked, onAnswer, options.length]);

  return (
    <>
      <p className="exercise__hint">Press 1–{options.length} to answer.</p>

      <fieldset className="exercise__options" disabled={locked}>
        <legend className="visually-hidden">{legend}</legend>
        {options.map((option, index) => {
          const isCorrect = index === correctIndex;
          const showAsCorrect = (locked || revealed) && isCorrect;
          return (
            <label
              key={option}
              className={`option ${showAsCorrect ? 'option--correct' : ''} ${
                locked && selected === index && !isCorrect ? 'option--wrong' : ''
              }`}
            >
              <input
                type="radio"
                name={name}
                value={index}
                checked={selected === index}
                disabled={locked}
                onChange={() => {
                  onAnswer(index);
                }}
              />
              <span className="option__number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{option}</span>
              {showAsCorrect ? <span className="option__tag">Correct answer</span> : null}
            </label>
          );
        })}
      </fieldset>
    </>
  );
}
