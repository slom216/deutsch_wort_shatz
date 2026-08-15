import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { evaluateChoice } from '@/features/practice/evaluation/evaluateAnswer';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/schemas/exerciseSchema';
import { ChoiceOptions } from './ChoiceOptions';
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
  revealed,
}: ExerciseComponentProps<MultipleChoiceExerciseType>): ReactNode {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [exercise.id]);

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

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__question" lang="de">
        {exercise.question}
      </p>

      <ChoiceOptions
        options={exercise.options}
        correctIndex={exercise.correctIndex}
        name={`mc-${exercise.id}`}
        selected={selected}
        locked={locked}
        revealed={revealed}
        legend={exercise.prompt}
        onAnswer={answer}
      />
    </div>
  );
}
