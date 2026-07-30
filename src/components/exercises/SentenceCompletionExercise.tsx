import { useEffect, useRef, useState, type ReactNode } from 'react';

import { evaluateAnswer } from '@/features/practice/evaluation/evaluateAnswer';
import type { SentenceCompletionExercise as SentenceCompletionExerciseType } from '@/schemas/exerciseSchema';
import { GermanCharacterHelper } from './GermanCharacterHelper';
import { handleGermanCharacterShortcut } from './germanCharacters';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

function answerRole(variant: string) {
  if (variant === 'articleGap') return 'article' as const;
  if (variant === 'pluralGap') return 'plural' as const;
  if (variant === 'verbFormGap') return 'verbForm' as const;
  return 'sentenceGap' as const;
}

/**
 * Sentence completion (§15).
 *
 * The gap is an inline input inside the sentence, so the learner sees the context they
 * are completing. The full corrected sentence is shown by the runner after submission.
 */
export function SentenceCompletionExercise({
  exercise,
  onSubmit,
  locked,
  attempt,
  revealed,
}: ExerciseComponentProps<SentenceCompletionExerciseType>): ReactNode {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue('');
    inputRef.current?.focus();
  }, [attempt, exercise.id]);

  const submit = (): void => {
    if (locked) return;
    onSubmit(
      evaluateAnswer(value, exercise.acceptedAnswers, {
        strictness: exercise.strictness,
        language: exercise.answerLanguage,
        answerRole: answerRole(exercise.variant),
      }),
    );
  };

  const inputId = `gap-${exercise.id}`;

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      {exercise.hint ? <p className="exercise__hint">{exercise.hint}</p> : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="visually-hidden" htmlFor={inputId}>
          Missing word in the sentence
        </label>
        <p className="exercise__sentence" lang="de">
          <span>{exercise.sentenceBefore}</span>
          <input
            id={inputId}
            ref={inputRef}
            className="exercise__gap-input"
            type="text"
            value={value}
            disabled={locked}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            size={Math.max(8, exercise.canonicalAnswer.length + 2)}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              handleGermanCharacterShortcut(event);
            }}
          />
          <span>{exercise.sentenceAfter}</span>
        </p>

        <p className="exercise__translation">{exercise.englishSentence}</p>

        <GermanCharacterHelper targetRef={inputRef} disabled={locked} />

        {revealed ? (
          <p className="exercise__revealed" lang="de">
            {exercise.fullSentence}
          </p>
        ) : null}

        {!locked ? (
          <button type="submit" className="exercise__submit" disabled={value.trim().length === 0}>
            Check answer
          </button>
        ) : null}
      </form>
    </div>
  );
}
