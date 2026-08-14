import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { evaluateChoice } from '@/features/practice/evaluation/evaluateAnswer';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Multiple choice (§15).
 *
 * A native radio group, so arrow keys, Space and Tab all behave as the platform intends
 * and the options are announced as a set.
 *
 * Options are numbered and the matching number key answers immediately — one keystroke
 * per question, rather than select-then-confirm. The mouse path still has a Check answer
 * button, and the number keys are additive: nothing is only reachable through them.
 */
export function MultipleChoiceExercise({
  exercise,
  onSubmit,
  locked,
  attempt,
  revealed,
}: ExerciseComponentProps<MultipleChoiceExerciseType>): ReactNode {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [attempt, exercise.id]);

  const answer = useCallback(
    (index: number): void => {
      if (locked) return;
      setSelected(index);
      onSubmit(
        evaluateChoice(
          index,
          exercise.correctIndex,
          exercise.options[exercise.correctIndex] as string,
          exercise.options[index] as string,
        ),
      );
    },
    [locked, onSubmit, exercise],
  );

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
      if (!Number.isInteger(index) || index < 0 || index >= exercise.options.length) return;
      event.preventDefault();
      answer(index);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [answer, locked, exercise.options.length]);

  const groupName = `mc-${exercise.id}-${attempt}`;

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__question" lang="de">
        {exercise.question}
      </p>

      <p className="exercise__hint">Press 1–{exercise.options.length} to answer.</p>

      <fieldset className="exercise__options" disabled={locked}>
        <legend className="visually-hidden">{exercise.prompt}</legend>
        {exercise.options.map((option, index) => {
          const isCorrect = index === exercise.correctIndex;
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
                name={groupName}
                value={index}
                checked={selected === index}
                disabled={locked}
                onChange={() => {
                  answer(index);
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
    </div>
  );
}
