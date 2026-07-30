import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { CEFR_LEVELS, bandsForLevel } from '@/content/vocabulary/frequencyBands';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { ExerciseType } from '@/schemas/vocabularySchema';
import './SettingsPage.css';

/**
 * Free practice setup (§18).
 *
 * Selections are encoded into the session URL so a session is addressable and can be
 * rebuilt deterministically after a refresh.
 */

const EXERCISE_TYPES: ReadonlyArray<{ value: ExerciseType; label: string }> = [
  { value: 'multipleChoice', label: 'Multiple choice' },
  { value: 'typedTranslation', label: 'Typed translation' },
  { value: 'sentenceCompletion', label: 'Sentence completion' },
  { value: 'matching', label: 'Matching' },
  { value: 'wordOrdering', label: 'Word ordering' },
  { value: 'listening', label: 'Listening' },
  { value: 'speaking', label: 'Speaking' },
];

const SESSION_LENGTHS = [10, 20, 30] as const;

export default function PracticePage(): ReactNode {
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);

  const [level, setLevel] = useState<string>('A1');
  const [band, setBand] = useState<string>('all');
  const [length, setLength] = useState<number>(20);
  const [types, setTypes] = useState<Set<ExerciseType>>(
    () =>
      new Set(
        EXERCISE_TYPES.map((t) => t.value).filter(
          (value) =>
            (value !== 'listening' || settings.listeningEnabled) &&
            (value !== 'speaking' || settings.speakingEnabled),
        ),
      ),
  );

  const toggle = (value: ExerciseType): void => {
    setTypes((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const start = (): void => {
    const sessionId = `free-${Date.now().toString(36)}`;
    const params = new URLSearchParams({
      mode: 'free',
      level,
      band,
      length: String(length),
      types: [...types].join(','),
    });
    void navigate(`/practice/session/${sessionId}?${params.toString()}`);
  };

  const bands = CEFR_LEVELS.includes(level as (typeof CEFR_LEVELS)[number])
    ? bandsForLevel(level as (typeof CEFR_LEVELS)[number])
    : [];

  return (
    <>
      <PageHeader
        title="Practice"
        description="Choose what to practise. Nothing here affects your review schedule."
      />

      <section className="settings-section" aria-labelledby="practice-scope">
        <h2 id="practice-scope">Vocabulary</h2>

        <div className="settings-field">
          <label htmlFor="practice-level">Level</label>
          <select
            id="practice-level"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setBand('all');
            }}
          >
            {CEFR_LEVELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label htmlFor="practice-band">Frequency band</label>
          <select id="practice-band" value={band} onChange={(event) => setBand(event.target.value)}>
            <option value="all">All bands in {level}</option>
            {bands.map((value) => (
              <option key={value.slug} value={value.slug}>
                {value.id}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="practice-format">
        <h2 id="practice-format">Session</h2>

        <div className="settings-field">
          <label htmlFor="practice-length">Length</label>
          <select
            id="practice-length"
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
          >
            {SESSION_LENGTHS.map((value) => (
              <option key={value} value={value}>
                {value} exercises
              </option>
            ))}
          </select>
        </div>

        <fieldset className="settings-field">
          <legend>Exercise types</legend>
          {EXERCISE_TYPES.map((type) => (
            <div key={type.value} className="settings-field--checkbox">
              <input
                id={`type-${type.value}`}
                type="checkbox"
                checked={types.has(type.value)}
                onChange={() => toggle(type.value)}
              />
              <label htmlFor={`type-${type.value}`}>{type.label}</label>
            </div>
          ))}
        </fieldset>
      </section>

      <button
        type="button"
        className="exercise__submit"
        onClick={start}
        disabled={types.size === 0}
      >
        Start practice
      </button>
      {types.size === 0 ? (
        <p className="exercise__hint">Choose at least one exercise type.</p>
      ) : null}
    </>
  );
}
