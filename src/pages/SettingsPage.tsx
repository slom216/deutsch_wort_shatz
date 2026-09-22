import { useState, type ReactNode } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { useGamification } from '@/features/gamification/useGamification';
import { FREEZE_EARN_DAYS, MAX_FREEZES } from '@/features/gamification/streak';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { switchLearningMode } from '@/features/settings/switchLearningMode';
import { LEARNING_MODES, LEARNING_MODE_LABELS, MASTERY_TARGETS } from '@/features/srs/learningMode';
import type { BatchSize, DailyGoal, LearningMode } from '@/schemas/settingsSchema';
import './SettingsPage.css';

const DAILY_GOALS: readonly DailyGoal[] = [10, 20, 30, 50];
const BATCH_SIZES: readonly BatchSize[] = [5, 10, 15, 20];

const LEARNING_MODE_HINTS: Readonly<Record<LearningMode, string>> = {
  normal:
    'Four clean answers, walking the full ladder: recognise it both ways, then type it both ways.',
  fast: 'Three clean answers. Drops the last rung — you still type the German at least once.',
  ultraFast:
    'Two clean answers, no typing: pick the English from six choices, then the German. The quickest way through the vocabulary, and the shallowest.',
};

/**
 * Settings (§23 daily goal, §18 batch size, §26 speech).
 *
 * These controls are live in Phase 0: each write goes to Zustand and IndexedDB, which
 * is what proves the persistence path works end to end.
 */
export default function SettingsPage(): ReactNode {
  const settings = useSettingsStore((state) => state.settings);
  const status = useSettingsStore((state) => state.status);
  const update = useSettingsStore((state) => state.update);
  const freezes = useGamification().snapshot?.streak.freezes;

  /** The mode the learner has asked for but not yet confirmed. */
  const [pendingMode, setPendingMode] = useState<LearningMode | null>(null);
  const [switching, setSwitching] = useState(false);

  const confirmSwitch = async (mode: LearningMode): Promise<void> => {
    setSwitching(true);
    try {
      await switchLearningMode(mode);
    } finally {
      setSwitching(false);
      setPendingMode(null);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Saved in this browser. Nothing is sent anywhere." />

      <section className="settings-section" aria-labelledby="settings-study">
        <h2 id="settings-study">Study</h2>

        <div className="settings-field">
          <label htmlFor="daily-goal">Daily goal</label>
          <select
            id="daily-goal"
            value={settings.dailyGoal}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ dailyGoal: Number(event.target.value) as DailyGoal });
            }}
          >
            {DAILY_GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {goal} correct answers
              </option>
            ))}
          </select>
          <p className="settings-hint">
            A day counts towards your streak at 10 correct answers or 50 XP. Wrong answers do not
            count towards the streak or the daily goal.
          </p>
        </div>

        <div className="settings-field">
          <label htmlFor="batch-size">New words per batch</label>
          <select
            id="batch-size"
            value={settings.newWordBatchSize}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ newWordBatchSize: Number(event.target.value) as BatchSize });
            }}
          >
            {BATCH_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} entries
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-speech">
        <h2 id="settings-speech">Speech</h2>

        <div className="settings-field settings-field--checkbox">
          <input
            id="listening-enabled"
            type="checkbox"
            checked={settings.listeningEnabled}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ listeningEnabled: event.target.checked });
            }}
          />
          <label htmlFor="listening-enabled">Include listening exercises</label>
        </div>

        <div className="settings-field settings-field--checkbox">
          <input
            id="speaking-enabled"
            type="checkbox"
            checked={settings.speakingEnabled}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ speakingEnabled: event.target.checked });
            }}
          />
          <label htmlFor="speaking-enabled">Include speaking exercises</label>
        </div>

        <div className="settings-field">
          <label htmlFor="speech-rate">Speech rate</label>
          <input
            id="speech-rate"
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.speechRate}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ speechRate: Number(event.target.value) });
            }}
          />
          <p className="settings-hint">
            {settings.speechRate.toFixed(1)}× — used for German (de-DE) playback.
          </p>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-mode">
        <h2 id="settings-mode">Learning mode</h2>
        <div className="settings-field">
          <label htmlFor="learning-mode">How many clean answers master a word</label>
          <select
            id="learning-mode"
            // Shows the pending choice while the confirm is up: snapping back to the
            // current mode would read as the click not having registered.
            value={pendingMode ?? settings.learningMode}
            disabled={status !== 'ready' || switching}
            onChange={(event) => {
              const mode = event.target.value as LearningMode;
              // Re-picking the current mode is not a change, and must not offer to wipe
              // the learner's progress for one.
              if (mode !== settings.learningMode) setPendingMode(mode);
            }}
          >
            {LEARNING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {LEARNING_MODE_LABELS[mode]} — {MASTERY_TARGETS[mode]} answers
              </option>
            ))}
          </select>
          <p className="settings-hint">{LEARNING_MODE_HINTS[settings.learningMode]}</p>
        </div>

        {pendingMode ? (
          <div className="data-reset__confirm" role="alertdialog" aria-labelledby="mode-confirm">
            <p id="mode-confirm">
              <strong>Switch to {LEARNING_MODE_LABELS[pendingMode]}?</strong> This resets all of
              your learning progress — every word&rsquo;s score, your XP, your level and your best
              streaks. It cannot be undone.
            </p>
            <p className="settings-hint">{LEARNING_MODE_HINTS[pendingMode]}</p>
            <div className="data-reset__actions">
              <button
                type="button"
                className="data-reset__button data-reset__button--danger"
                disabled={switching}
                onClick={() => {
                  void confirmSwitch(pendingMode);
                }}
              >
                {switching ? 'Resetting…' : 'Yes, switch and reset'}
              </button>
              <button
                type="button"
                className="runner__retry"
                disabled={switching}
                onClick={() => setPendingMode(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="settings-section" aria-labelledby="settings-answers">
        <h2 id="settings-answers">Answer checking</h2>
        <div className="settings-field settings-field--checkbox">
          <input
            id="strict-checking"
            type="checkbox"
            checked={settings.strictAnswerChecking}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ strictAnswerChecking: event.target.checked });
            }}
          />
          <label htmlFor="strict-checking">Strict German answer checking</label>
        </div>
        <p className="settings-hint">
          Strict mode is the default. Capitalization, articles, umlauts, ß, spelling, punctuation,
          word order, verb forms and plurals are all significant. Turning it off also accepts a
          missing umlaut or ß, which can be a different word: <i lang="de">schon</i> (already) for{' '}
          <i lang="de">schön</i> (beautiful), or <i lang="de">zahlen</i> (to pay) for{' '}
          <i lang="de">zählen</i> (to count).
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-streak">
        <h2 id="settings-streak">Streak</h2>
        <p>
          Streak freezes held: <strong>{freezes ?? '…'}</strong> of {MAX_FREEZES}
        </p>
        <p className="settings-hint">
          You earn a freeze for every {FREEZE_EARN_DAYS} days in a row you study, and can hold up to{' '}
          {MAX_FREEZES}. A missed day uses one up automatically, so your streak carries on.
        </p>
      </section>
    </>
  );
}
