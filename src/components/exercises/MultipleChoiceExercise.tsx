import { useEffect, useState, type ReactNode } from 'react';

import { evaluateChoice } from '@/features/practice/evaluation/evaluateAnswer';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Multiple choice (§15).
 *
 * A native radio group, so arrow keys, Space and Tab all behave as the platform intends
 * and the options are announced as a set.
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

  const submit = (): void => {
    if (selected === null || locked) return;
    onSubmit(
      evaluateChoice(
        selected,
        exercise.correctIndex,
        exercise.options[exercise.correctIndex] as string,
        exercise.options[selected] as string,
      ),
    );
  };

  const groupName = `mc-${exercise.id}-${attempt}`;

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__question" lang="de">
        {exercise.question}
      </p>
      {exercise.hint ? <p className="exercise__hint">{exercise.hint}</p> : null}

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
                onChange={() => setSelected(index)}
              />
              <span>{option}</span>
              {showAsCorrect ? <span className="option__tag">Correct answer</span> : null}
            </label>
          );
        })}
      </fieldset>

      {!locked ? (
        <button
          type="button"
          className="exercise__submit"
          onClick={submit}
          disabled={selected === null}
        >
          Check answer
        </button>
      ) : null}
    </div>
  );
}
