import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { evaluateAnswer, evaluateChoice } from '@/features/practice/evaluation/evaluateAnswer';
import { useSpeechSynthesis } from '@/features/speech/useSpeechSynthesis';
import { usePlayShortcut } from '@/features/speech/usePlayShortcut';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { ListeningExercise as ListeningExerciseType } from '@/schemas/exerciseSchema';
import { ChoiceOptions } from './ChoiceOptions';
import { GermanCharacterHelper } from './GermanCharacterHelper';
import { handleGermanCharacterShortcut } from './germanCharacters';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Listening (§15, §26).
 *
 * Uses the browser's speech synthesis with a German voice, allows replay, and cancels a
 * previous utterance before speaking again. When synthesis is unavailable the German text
 * is shown instead so the exercise is still answerable — the learner is never blocked.
 */
export function ListeningExercise({
  exercise,
  onSubmit,
  locked,
  revealed,
}: ExerciseComponentProps<ListeningExerciseType>): ReactNode {
  const speechRate = useSettingsStore((state) => state.settings.speechRate);
  const { supported, speaking, germanVoiceAvailable, speak } = useSpeechSynthesis(speechRate);

  const [selected, setSelected] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelected(null);
    setValue('');
    setPlayCount(0);
  }, [exercise.id]);

  const play = useCallback((): void => {
    speak(exercise.spokenText);
    setPlayCount((count) => count + 1);
  }, [speak, exercise.spokenText]);

  usePlayShortcut(play, supported);

  /** Answers a choice question outright, matching multiple choice (§15). */
  const answerChoice = useCallback(
    (index: number): void => {
      if (locked || exercise.correctIndex === undefined || !exercise.options) return;
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
    [locked, onSubmit, exercise.correctIndex, exercise.options],
  );

  const submit = (): void => {
    if (locked) return;

    onSubmit(
      evaluateAnswer(value, exercise.acceptedAnswers ?? [exercise.canonicalAnswer], {
        strictness: exercise.strictness,
        language: 'de',
        answerRole: 'translation',
      }),
    );
  };

  const inputId = `listen-${exercise.id}`;
  // The German text must not be revealed before answering in standard mode (§15).
  const showText = !supported || locked || revealed;

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>

      <div className="listening__controls">
        <button type="button" className="listening__play" onClick={play} disabled={!supported}>
          {speaking ? 'Playing…' : playCount === 0 ? 'Play audio' : 'Play again'}{' '}
          <span aria-hidden="true">(P)</span>
        </button>
        {playCount > 0 ? <span className="exercise__hint">Played {playCount}×</span> : null}
      </div>

      {!supported ? (
        <p className="exercise__fallback" role="note">
          Your browser does not support speech synthesis, so the text is shown instead.
        </p>
      ) : !germanVoiceAvailable ? (
        <p className="exercise__fallback" role="note">
          No German voice is installed in this browser, so pronunciation may be inaccurate.
        </p>
      ) : null}

      {showText ? (
        <p className="exercise__question" lang="de">
          {exercise.spokenText}
        </p>
      ) : null}

      {exercise.mode === 'chooseEnglish' && exercise.options ? (
        <ChoiceOptions
          options={exercise.options}
          correctIndex={exercise.correctIndex ?? -1}
          name={`listen-${exercise.id}`}
          selected={selected}
          locked={locked}
          revealed={revealed}
          legend={exercise.prompt}
          onAnswer={answerChoice}
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="exercise__label" htmlFor={inputId}>
            Type what you hear
          </label>
          <input
            id={inputId}
            ref={inputRef}
            className="exercise__input"
            type="text"
            lang="de"
            value={value}
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
          <GermanCharacterHelper targetRef={inputRef} disabled={locked} />
          {!locked ? (
            <button type="submit" className="exercise__submit" disabled={value.trim().length === 0}>
              Check answer
            </button>
          ) : null}
        </form>
      )}
    </div>
  );
}
