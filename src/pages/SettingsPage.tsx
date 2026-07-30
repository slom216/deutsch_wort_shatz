import type { ReactNode } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { BatchSize, DailyGoal } from '@/schemas/settingsSchema';
import './SettingsPage.css';

const DAILY_GOALS: readonly DailyGoal[] = [10, 20, 30, 50];
const BATCH_SIZES: readonly BatchSize[] = [5, 10, 15, 20];

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
                {goal} exercises
              </option>
            ))}
          </select>
          <p className="settings-hint">
            A day counts towards your streak at 10 graded exercises or 50 XP.
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
          word order, verb forms and plurals are all significant.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-streak">
        <h2 id="settings-streak">Streak</h2>
        <div className="settings-field">
          <label htmlFor="streak-freezes">Streak freezes</label>
          <select
            id="streak-freezes"
            value={settings.streakFreezes}
            disabled={status !== 'ready'}
            onChange={(event) => {
              void update({ streakFreezes: Number(event.target.value) });
            }}
          >
            {[0, 1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className="settings-hint">
            Each freeze bridges one missed day so a single skipped day does not end your streak.
          </p>
        </div>
      </section>
    </>
  );
}
