import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { useContentManifest } from '@/features/learning/useContentManifest';
import { useReviewState } from '@/features/srs/useReviewState';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useGamification } from '@/features/gamification/useGamification';
import '@/styles/lists.css';
import './SettingsPage.css';
import './AchievementsPage.css';

/**
 * Dashboard (§6).
 *
 * Study figures come from the SRS state stored in IndexedDB. XP, learner level, streaks
 * and achievements arrive with gamification in Phase 7 and are not shown as zeroes here,
 * because a fabricated zero reads as a real measurement (§34).
 */
export default function DashboardPage(): ReactNode {
  const { manifest, error: contentError } = useContentManifest();
  const settings = useSettingsStore((state) => state.settings);
  const { loading, counts, hardest, error: progressError } = useReviewState();
  const { snapshot: game } = useGamification();

  const started = counts.learning + counts.review + counts.mastered;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your German vocabulary at a glance. Everything is stored in this browser."
      />

      {contentError ? (
        <p role="alert" className="page-alert">
          {contentError}
        </p>
      ) : null}
      {progressError ? (
        <p role="alert" className="page-alert">
          {progressError}
        </p>
      ) : null}

      <dl className="stat-grid">
        <StatCard
          label="Reviews due"
          value={loading ? '—' : counts.due}
          hint={counts.overdue > 0 ? `${counts.overdue} overdue` : 'Nothing overdue'}
        />
        <StatCard
          label="Words started"
          value={loading ? '—' : started}
          hint={`of ${manifest ? manifest.totalEntries.toLocaleString('en-US') : '10,000'}`}
        />
        <StatCard
          label="In learning"
          value={loading ? '—' : counts.learning}
          hint="Short intervals"
        />
        <StatCard label="Mastered" value={loading ? '—' : counts.mastered} hint="Long intervals" />
        <StatCard
          label="New words available"
          value={loading ? '—' : counts.newAvailable.toLocaleString('en-US')}
          hint="Not yet introduced"
        />
        <StatCard
          label="Total XP"
          value={game ? game.totalXp.toLocaleString('en-US') : '—'}
          hint={game ? `Level ${game.level.level}` : 'Change your goal in Settings'}
        />
        <StatCard
          label="Streak"
          value={game ? `${game.streak.current} day${game.streak.current === 1 ? '' : 's'}` : '—'}
          hint={
            game
              ? game.streak.todayCounts
                ? 'Today already counts'
                : 'Today does not count yet'
              : ''
          }
        />
      </dl>

      <section className="settings-section" aria-labelledby="dash-today">
        <h2 id="dash-today">Today</h2>
        <p>
          {game
            ? `${game.dailyGoal.completed} of ${settings.dailyGoal} exercises towards your daily goal.`
            : 'Loading your daily goal…'}
          {game?.dailyGoal.met ? ' Goal met — nice work.' : ''}
        </p>
        {game ? (
          <div
            className="meter meter--goal"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={settings.dailyGoal}
            aria-valuenow={game.dailyGoal.completed}
            aria-label="Daily goal progress"
          >
            <span style={{ width: `${game.dailyGoal.fraction * 100}%` }} />
          </div>
        ) : null}
        {game ? (
          <p className="band-summary" style={{ marginTop: 'var(--space-3)' }}>
            Level {game.level.level} · {game.level.xpForNextLevel} XP to level{' '}
            {game.level.level + 1}
          </p>
        ) : null}
      </section>

      <section className="settings-section" aria-labelledby="dash-continue">
        <h2 id="dash-continue">Continue learning</h2>
        {counts.due > 0 ? (
          <p>
            You have <strong>{counts.due}</strong> word{counts.due === 1 ? '' : 's'} to review.{' '}
            <Link to="/review">Start reviewing</Link>.
          </p>
        ) : started === 0 ? (
          <p>
            You have not started any words yet. <Link to="/learn">Learn your first five</Link>.
          </p>
        ) : (
          <p>
            Nothing is due right now. <Link to="/learn">Learn new words</Link> or{' '}
            <Link to="/practice">practise freely</Link>.
          </p>
        )}
      </section>

      <div className="dashboard-columns">
        <section className="settings-section" aria-labelledby="dash-levels">
          <h2 id="dash-levels">Vocabulary by level</h2>
          <ul className="example-list">
            {(['A1', 'A2', 'B1'] as const).map((level) => (
              <li key={level}>
                <Link to={`/learn/${level.toLowerCase()}`}>{level}</Link> —{' '}
                {manifest ? manifest.entriesByLevel[level].toLocaleString('en-US') : '—'} entries
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-section" aria-labelledby="dash-hardest">
          <h2 id="dash-hardest">Hardest words</h2>
          {hardest.length === 0 ? (
            <p className="band-summary">
              Nothing yet — this fills in once you have answered a few exercises.
            </p>
          ) : (
            <ul className="example-list">
              {hardest.slice(0, 5).map((entry) => (
                <li key={entry.entryId}>
                  <Link to={`/word/${entry.entryId}`}>{entry.entryId}</Link> — difficulty{' '}
                  {entry.srs.difficulty.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
