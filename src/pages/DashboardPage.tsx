import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { isTopic, topicSlug } from '@/content/vocabulary/topics';
import { progressByLevel, weakestTopics } from '@/features/progress/analytics';
import { continuousSessionPath } from '@/features/practice/session/endless';
import { useContentManifest } from '@/features/learning/useContentManifest';
import { useEntryLabels } from '@/features/learning/useEntryLabels';
import { useReviewState } from '@/features/srs/useReviewState';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useGamification } from '@/features/gamification/useGamification';
import { avatarSrc, MAX_AVATAR_LEVEL } from '@/features/gamification/xp';
import type { VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';
import './SettingsPage.css';
import './AchievementsPage.css';

/**
 * Dashboard (§6).
 *
 * Every figure is derived from what is stored in IndexedDB — SRS state, exercise history
 * and XP events. Nothing is shown as a fabricated zero (§34).
 */
export default function DashboardPage(): ReactNode {
  const { manifest, error: contentError } = useContentManifest();
  const settings = useSettingsStore((state) => state.settings);
  const { loading, counts, hardest, progress, error: progressError } = useReviewState();
  const { snapshot: game } = useGamification();
  const navigate = useNavigate();
  const startStream = (): void => {
    void navigate(continuousSessionPath());
  };

  const started = counts.learning + counts.review + counts.mastered;
  const hardestFive = hardest.slice(0, 5);
  const labels = useEntryLabels(hardestFive.map((entry) => entry.entryId));

  const [index, setIndex] = useState<readonly VocabularyIndexRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadSearchIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch(() => {
        // The level and topic panels are additive; `contentError` already reports a
        // missing content build.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progressByEntry = useMemo(
    () => new Map(progress.map((record) => [record.entryId, record])),
    [progress],
  );
  const levels = useMemo(() => progressByLevel(index, progressByEntry), [index, progressByEntry]);
  const weakest = useMemo(() => weakestTopics(index, progressByEntry, 5), [index, progressByEntry]);

  /** Achievements the learner unlocked most recently (§6). */
  const recentAchievements = (game?.achievements ?? [])
    .filter((status) => status.unlockedAt)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
    .slice(0, 5);

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

      {/*
        The single obvious next action, above the statistics. One button starts the endless
        stream, which mixes due reviews with new words itself — the dashboard does not have
        to decide which of the two the learner needs.
      */}
      <section className="settings-section" aria-labelledby="dash-continue">
        <h2 id="dash-continue">Continue learning</h2>
        <p>
          {loading
            ? 'Checking what is waiting for you…'
            : counts.due > 0
              ? `${counts.due} word${counts.due === 1 ? '' : 's'} due for review${counts.overdue > 0 ? `, ${counts.overdue} overdue` : ''}, and new words in between. Stop whenever you like.`
              : started === 0
                ? 'Nothing started yet. Words arrive one after another — stop whenever you like.'
                : 'Nothing due right now, so the stream will bring new words. Stop whenever you like.'}
        </p>
        <button type="button" className="exercise__submit" onClick={startStream}>
          {started === 0 ? 'Start learning' : 'Continue learning'}
        </button>
        {counts.due > 0 ? (
          <button type="button" className="page-action" onClick={() => void navigate('/review')}>
            Review only ({counts.due})
          </button>
        ) : null}
        <button type="button" className="page-action" onClick={() => void navigate('/practice')}>
          Practise
        </button>
      </section>

      {/* The rank card, at the size the artwork was drawn for. */}
      {game ? (
        <section className="wizard-card" aria-labelledby="dash-wizard">
          <img
            className="wizard-card__art"
            src={avatarSrc(game.level.level)}
            alt={`Word Wizard rank card, level ${Math.min(game.level.level, MAX_AVATAR_LEVEL)}`}
            width={1254}
            height={1254}
          />
          <div className="wizard-card__body">
            <h2 id="dash-wizard">Word Wizard</h2>
            <p className="wizard-card__level">Level {game.level.level}</p>
            <p className="wizard-card__xp">
              {game.totalXp.toLocaleString('en-US')} <span>XP</span>
            </p>
            <div
              className="wizard-card__meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(game.level.fraction * 100)}
              aria-label={`Progress to level ${game.level.level + 1}`}
            >
              <span style={{ width: `${game.level.fraction * 100}%` }} />
            </div>
            <p className="wizard-card__hint">
              {game.level.xpIntoLevel.toLocaleString('en-US')} XP into this level ·{' '}
              <strong>{game.level.xpForNextLevel.toLocaleString('en-US')} XP</strong> to level{' '}
              {game.level.level + 1}
            </p>
          </div>
        </section>
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
          hint={`of ${manifest ? manifest.totalEntries.toLocaleString('en-US') : '—'}`}
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
      </section>

      <div className="dashboard-columns">
        <section className="settings-section" aria-labelledby="dash-levels">
          <h2 id="dash-levels">Progress by level</h2>
          <ul className="example-list">
            {(['A1', 'A2', 'B1'] as const).map((level) => {
              const row = levels.find((entry) => entry.key === level);
              const total = row?.total ?? manifest?.entriesByLevel[level];
              return (
                <li key={level}>
                  <Link to={`/learn/${level.toLowerCase()}`}>{level}</Link> —{' '}
                  {row
                    ? `${(row.practisedFraction * 100).toFixed(1)}% practised · ${(row.masteredFraction * 100).toFixed(1)}% mastered · ${row.introduced.toLocaleString('en-US')} of ${row.total.toLocaleString('en-US')} introduced`
                    : `${total ? total.toLocaleString('en-US') : '—'} entries`}
                  {row ? (
                    <div
                      className="meter meter--stack"
                      role="img"
                      aria-label={`${level}: ${row.practised.toLocaleString('en-US')} of ${row.total.toLocaleString('en-US')} words practised, ${row.mastered.toLocaleString('en-US')} mastered`}
                    >
                      <span
                        className="meter__practised"
                        style={{ width: `${row.practisedFraction * 100}%` }}
                      />
                      <span
                        className="meter__mastered"
                        style={{ width: `${row.masteredFraction * 100}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="meter-legend">
            <span>
              <i className="meter-legend__practised" /> Practised — score above zero
            </span>
            <span>
              <i className="meter-legend__mastered" /> Mastered
            </span>
          </p>
        </section>

        <section className="settings-section" aria-labelledby="dash-hardest">
          <h2 id="dash-hardest">Hardest words</h2>
          {hardestFive.length === 0 ? (
            <p className="band-summary">
              Nothing yet — this fills in once you have answered a few exercises.
            </p>
          ) : (
            <ul className="example-list">
              {hardestFive.map((entry) => (
                <li key={entry.entryId}>
                  <Link to={`/word/${entry.entryId}`} lang="de">
                    {labels.get(entry.entryId) ?? entry.entryId}
                  </Link>{' '}
                  — difficulty {entry.srs.difficulty.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-section" aria-labelledby="dash-weakest">
          <h2 id="dash-weakest">Weakest topics</h2>
          {weakest.length === 0 ? (
            <p className="band-summary">
              Nothing yet — this fills in once you have studied words across a few topics.
            </p>
          ) : (
            <ul className="example-list">
              {weakest.map((topic) => (
                <li key={topic.topic}>
                  {isTopic(topic.topic) ? (
                    <Link to={`/topic/${topicSlug(topic.topic)}`}>{topic.topic}</Link>
                  ) : (
                    topic.topic
                  )}{' '}
                  — difficulty {topic.difficulty.toFixed(2)} across {topic.entries} entr
                  {topic.entries === 1 ? 'y' : 'ies'}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-section" aria-labelledby="dash-achievements">
          <h2 id="dash-achievements">Recent achievements</h2>
          {recentAchievements.length === 0 ? (
            <p className="band-summary">
              None yet. <Link to="/achievements">See what you can unlock</Link>.
            </p>
          ) : (
            <ul className="example-list">
              {recentAchievements.map((status) => (
                <li key={status.definition.id}>
                  <Link to="/achievements">{status.definition.name}</Link> —{' '}
                  {new Date(status.unlockedAt as string).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
