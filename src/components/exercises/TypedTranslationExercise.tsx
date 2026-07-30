import { useEffect, useRef, useState, type ReactNode } from 'react';

import { evaluateAnswer } from '@/features/practice/evaluation/evaluateAnswer';
import type { TypedTranslationExercise as TypedTranslationExerciseType } from '@/schemas/exerciseSchema';
import { GermanCharacterHelper } from './GermanCharacterHelper';
import { handleGermanCharacterShortcut } from './germanCharacters';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/** Maps a generator variant onto the answer role the evaluator uses for classification. */
function answerRole(variant: string) {
  if (variant === 'verbForm') return 'verbForm' as const;
  if (variant === 'nounWithArticleAndPlural') return 'plural' as const;
  if (variant === 'fullPhrase') return 'phrase' as const;
  return 'translation' as const;
}

export function TypedTranslationExercise({
  exercise,
  onSubmit,
  locked,
  attempt,
  revealed,
}: ExerciseComponentProps<TypedTranslationExerciseType>): ReactNode {
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
        requireArticle: exercise.variant.startsWith('nounWithArticle'),
      }),
    );
  };

  const inputId = `typed-${exercise.id}`;

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__question" lang={exercise.answerLanguage === 'de' ? 'en' : 'de'}>
        {exercise.question}
      </p>
      {exercise.hint ? <p className="exercise__hint">{exercise.hint}</p> : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="exercise__label" htmlFor={inputId}>
          Your answer
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className="exercise__input"
          type="text"
          value={value}
          lang={exercise.answerLanguage}
          disabled={locked}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            handleGermanCharacterShortcut(event);
          }}
        />

        {exercise.answerLanguage === 'de' ? (
          <GermanCharacterHelper targetRef={inputRef} disabled={locked} />
        ) : null}

        {revealed ? (
          <p className="exercise__revealed" lang="de">
            {exercise.canonicalAnswer}
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
