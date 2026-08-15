import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { StatCard } from '@/components/common/StatCard';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { loadAllProgress } from '@/features/srs/repository';
import { hardestEntries, masteredEntries, queueCounts } from '@/features/srs/queue';
import { useEntryLabels } from '@/features/learning/useEntryLabels';
import { db } from '@/features/persistence/db';
import { useGamification } from '@/features/gamification/useGamification';
import {
  activitySummary,
  errorCategoryStats,
  exerciseTypePerformance,
  overallStats,
  progressByBand,
  progressByLevel,
  progressByTopic,
  progressByWordClass,
  weakestTopics,
  type Breakdown,
} from '@/features/progress/analytics';
import type { EntryProgress, ExerciseHistory } from '@/schemas/progressSchema';
import type { VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import '@/styles/lists.css';
import './SettingsPage.css';
import './AchievementsPage.css';
import './ProgressPage.css';

const ERROR_LABELS: Record<string, string> = {
  wrongMeaning: 'Wrong meaning',
  missingArticle: 'Missing article',
  wrongArticle: 'Wrong article',
  wrongCapitalization: 'Capitalization',
  wrongPlural: 'Plural form',
  wrongConjugation: 'Verb form',
  missingUmlaut: 'Umlauts',
  ssInsteadOfEszett: 'ss instead of ß',
  punctuationError: 'Punctuation',
  wordOrderError: 'Word order',
  missingToken: 'Missing word',
  extraToken: 'Extra word',
};

/**
 * Progress (§6, §16).
 *
 * Every figure is derived from stored history joined against the static index, so the
 * numbers always match the underlying record rather than a cached counter.
 */
export default function ProgressPage(): ReactNode {
  const [index, setIndex] = useState<readonly VocabularyIndexRecord[] | null>(null);
  const [progress, setProgress] = useState<readonly EntryProgress[]>([]);
  const [history, setHistory] = useState<readonly ExerciseHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { snapshot: game } = useGamification();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [records, stored, rows] = await Promise.all([
          loadSearchIndex(),
          loadAllProgress(),
          db.exerciseHistory.toArray(),
        ]);
        if (cancelled) return;
        setIndex(records);
        setProgress(stored);
        setHistory(rows);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not read your progress.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byEntry = useMemo(
    () => new Map(progress.map((record) => [record.entryId, record])),
    [progress],
  );

  const stats = useMemo(() => overallStats(progress, history), [progress, history]);
  const typeStats = useMemo(() => exerciseTypePerformance(history), [history]);
  const errors = useMemo(() => errorCategoryStats(history), [history]);
  const activity = useMemo(() => activitySummary(history, 30), [history]);
  const hardest = useMemo(() => hardestEntries(progress, 10), [progress]);
  const mastered = useMemo(() => masteredEntries(progress).slice(0, 20), [progress]);
  const weakTopics = useMemo(() => (index ? weakestTopics(index, byEntry) : []), [index, byEntry]);
  const counts = useMemo(() => queueCounts(progress, index?.length ?? 0), [progress, index]);
  const labels = useEntryLabels([
    ...hardest.map((entry) => entry.entryId),
    ...mastered.map((entry) => entry.entryId),
  ]);

  if (error) {
    return (
      <>
        <PageHeader title="Progress" />
        <p role="alert" className="page-alert">
          {error}
        </p>
      </>
    );
  }

  // Render the header before the data arrives, so the page never looks blank.
  if (!index) {
    return (
      <>
        <PageHeader
          title="Progress"
          description="How much you have learned, and where the gaps are."
        />
        <LoadingScreen label="Loading your progress…" />
      </>
    );
  }

  const percent = (value: number): string => `${Math.round(value * 100)}%`;
  const maxActivity = Math.max(1, ...activity.map((day) => day.exercises));

  return (
    <>
      <PageHeader
        title="Progress"
        description="How much you have learned, and where the gaps are."
      />

      <dl className="stat-grid">
        <StatCard label="Introduced" value={stats.introduced} hint="Entries you have met" />
        <StatCard label="Learning" value={stats.learning} hint="Short intervals" />
        <StatCard label="In review" value={stats.review} hint="Long intervals" />
        <StatCard label="Mastered" value={stats.mastered} hint="Score 5, or every §22 criterion" />
        <StatCard label="Due today" value={counts.due} hint="Ready to review now" />
        <StatCard label="Overdue" value={counts.overdue} hint="More than a day late" />
        <StatCard label="Exercises answered" value={stats.totalAttempts} hint="All time" />
        <StatCard
          label="Total accuracy"
          value={percent(stats.accuracy)}
          hint={`${stats.totalCorrect} of ${stats.totalAttempts}`}
        />
        <StatCard
          label="First-attempt accuracy"
          value={percent(stats.firstAttemptAccuracy)}
          hint="No hint used"
        />
        <StatCard
          label="Average response"
          value={`${(stats.averageResponseMs / 1000).toFixed(1)}s`}
          hint="Per exercise"
        />
        <StatCard label="Study sessions" value={stats.sessions} hint="All time" />
        <StatCard
          label="Total XP"
          value={game ? game.totalXp.toLocaleString('en-US') : '—'}
          hint={game ? `Level ${game.level.level}` : ''}
        />
        <StatCard
          label="Longest streak"
          value={game ? `${game.streak.longest} days` : '—'}
          hint={game ? `Current: ${game.streak.current}` : ''}
        />
      </dl>

      <section className="settings-section" aria-labelledby="activity">
        <h2 id="activity">Activity, last 30 days</h2>
        <ul className="activity">
          {activity.map((day) => (
            <li key={day.date} className="activity__day" title={`${day.date}: ${day.exercises}`}>
              <span
                className="activity__bar"
                style={{ height: `${(day.exercises / maxActivity) * 100}%` }}
                aria-hidden="true"
              />
              <span className="visually-hidden">
                {day.date}: {day.exercises} exercises, {day.correct} correct
              </span>
            </li>
          ))}
        </ul>
      </section>

      <BreakdownSection
        id="by-level"
        title="Progress by level"
        rows={progressByLevel(index, byEntry)}
      />
      <BreakdownSection
        id="by-band"
        title="Progress by frequency band"
        rows={progressByBand(index, byEntry)}
      />
      <BreakdownSection
        id="by-class"
        title="Progress by word class"
        rows={progressByWordClass(index, byEntry).slice(0, 10)}
      />
      <BreakdownSection
        id="by-topic"
        title="Progress by topic"
        rows={progressByTopic(index, byEntry).slice(0, 15)}
      />

      <div className="dashboard-columns">
        <section className="settings-section" aria-labelledby="by-type">
          <h2 id="by-type">Exercise-type performance</h2>
          {typeStats.length === 0 ? (
            <p className="band-summary">No exercises answered yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Format</th>
                  <th scope="col">Answered</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {typeStats.map((stat) => (
                  <tr key={stat.type}>
                    <th scope="row">{stat.type}</th>
                    <td>{stat.attempts}</td>
                    <td>{percent(stat.accuracy)}</td>
                    <td>{(stat.averageResponseMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="settings-section" aria-labelledby="by-error">
          <h2 id="by-error">Most common mistakes</h2>
          {errors.length === 0 ? (
            <p className="band-summary">No mistakes recorded yet.</p>
          ) : (
            <ul className="example-list">
              {errors.slice(0, 8).map((entry) => (
                <li key={entry.category}>
                  {ERROR_LABELS[entry.category] ?? entry.category} — {entry.count}×
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dashboard-columns">
        <section className="settings-section" aria-labelledby="weak-topics">
          <h2 id="weak-topics">Weakest topics</h2>
          {weakTopics.length === 0 ? (
            <p className="band-summary">Answer a few exercises and your weak topics appear here.</p>
          ) : (
            <ul className="example-list">
              {weakTopics.map((topic) => (
                <li key={topic.topic}>
                  {topic.topic} — difficulty {topic.difficulty.toFixed(2)} across {topic.entries}{' '}
                  entries
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-section" aria-labelledby="difficult">
          <h2 id="difficult">Hardest words</h2>
          {hardest.length === 0 ? (
            <p className="band-summary">Nothing yet.</p>
          ) : (
            <ul className="example-list">
              {hardest.map((entry) => (
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

        <section className="settings-section" aria-labelledby="mastered">
          <h2 id="mastered">Mastered words</h2>
          {mastered.length === 0 ? (
            <p className="band-summary">
              Mastery needs a quiz score of 5, or the full §22 evidence: five successful reviews,
              three of them production, and a 30-day interval.
            </p>
          ) : (
            <ul className="example-list">
              {mastered.map((entry) => (
                <li key={entry.entryId}>
                  <Link to={`/word/${entry.entryId}`} lang="de">
                    {labels.get(entry.entryId) ?? entry.entryId}
                  </Link>{' '}
                  — interval {Math.round(entry.srs.intervalDays)} days
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function BreakdownSection({
  id,
  title,
  rows,
}: {
  id: string;
  title: string;
  rows: readonly Breakdown[];
}): ReactNode {
  return (
    <section className="settings-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="breakdown">
        {rows.map((row) => (
          <li key={row.key} className="breakdown__row">
            <span className="breakdown__label">{row.label}</span>
            <span
              className="breakdown__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={row.total}
              aria-valuenow={row.introduced}
              aria-label={`${row.label}: ${row.introduced} of ${row.total} introduced`}
            >
              <span style={{ width: `${row.fraction * 100}%` }} />
            </span>
            <span className="breakdown__count">
              {row.introduced} / {row.total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
