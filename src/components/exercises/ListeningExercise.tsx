import { useEffect, useRef, useState, type ReactNode } from 'react';

import { evaluateAnswer, evaluateChoice } from '@/features/practice/evaluation/evaluateAnswer';
import { useSpeechSynthesis } from '@/features/speech/useSpeechSynthesis';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { ListeningExercise as ListeningExerciseType } from '@/schemas/exerciseSchema';
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
  attempt,
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
  }, [attempt, exercise.id]);

  const play = (): void => {
    speak(exercise.spokenText);
    setPlayCount((count) => count + 1);
  };

  const submit = (): void => {
    if (locked) return;

    if (exercise.mode === 'chooseEnglish') {
      if (selected === null || exercise.correctIndex === undefined || !exercise.options) return;
      onSubmit(
        evaluateChoice(
          selected,
          exercise.correctIndex,
          exercise.options[exercise.correctIndex] as string,
          exercise.options[selected] as string,
        ),
      );
      return;
    }

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
          {speaking ? 'Playing…' : playCount === 0 ? 'Play audio' : 'Play again'}
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
        <>
          <fieldset className="exercise__options" disabled={locked}>
            <legend className="visually-hidden">{exercise.prompt}</legend>
            {exercise.options.map((option, index) => {
              const isCorrect = index === exercise.correctIndex;
              return (
                <label
                  key={option}
                  className={`option ${locked && isCorrect ? 'option--correct' : ''} ${
                    locked && selected === index && !isCorrect ? 'option--wrong' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name={`listen-${exercise.id}-${attempt}`}
                    checked={selected === index}
                    disabled={locked}
                    onChange={() => setSelected(index)}
                  />
                  <span>{option}</span>
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
        </>
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
