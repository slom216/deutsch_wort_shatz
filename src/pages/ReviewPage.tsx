import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { StatCard } from '@/components/common/StatCard';
import { useReviewState } from '@/features/srs/useReviewState';
import { useEntryLabels } from '@/features/learning/useEntryLabels';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { availableExerciseTypes, EXERCISE_TYPE_LABELS } from '@/features/practice/exerciseTypes';
import '@/styles/lists.css';
import './SettingsPage.css';

/** Estimated exercises for a review session: roughly 1.5 per due entry, capped at 20 (§19). */
function estimateSessionSize(dueCount: number): number {
  return Math.min(20, Math.max(1, Math.round(dueCount * 1.5)));
}

/**
 * Review (§6).
 *
 * Counts come from the SRS queue rebuilt out of IndexedDB, so they are the same after a
 * refresh. Overdue and high-difficulty entries are reviewed first (§18).
 */
export default function ReviewPage(): ReactNode {
  const navigate = useNavigate();
  const { loading, error, counts, due, overdue, forecast } = useReviewState();
  const settings = useSettingsStore((state) => state.settings);

  // §19: listening and speaking only when enabled *and* supported by this browser.
  const types = availableExerciseTypes(settings);
  const labels = useEntryLabels(due.slice(0, 12).map((entry) => entry.entryId));

  const start = (): void => {
    const sessionId = `review-${Date.now().toString(36)}`;
    void navigate(
      `/practice/session/${sessionId}?mode=review&length=${estimateSessionSize(counts.due)}&types=${types.join(',')}`,
    );
  };

  // Header first: the queue is read from IndexedDB and the page should never look blank.
  if (loading) {
    return (
      <>
        <PageHeader
          title="Review"
          description="Due and overdue words, scheduled automatically. You are never asked to rate a word yourself."
        />
        <LoadingScreen label="Loading your review queue…" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Review"
        description="Due and overdue words, scheduled automatically. You are never asked to rate a word yourself."
      />

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      <dl className="stat-grid">
        <StatCard label="Due now" value={counts.due} hint="Ready to review" />
        <StatCard label="Overdue" value={counts.overdue} hint="More than a day late" />
        <StatCard
          label="Estimated session"
          value={counts.due === 0 ? '—' : `${estimateSessionSize(counts.due)} exercises`}
          hint="Mixed formats"
        />
        <StatCard label="In learning" value={counts.learning} hint="Not yet on a long interval" />
        <StatCard label="In review" value={counts.review} hint="Scheduled long-term" />
        <StatCard label="Mastered" value={counts.mastered} hint="Still reviewed occasionally" />
      </dl>

      {counts.due > 0 ? (
        <>
          <section className="settings-section" aria-labelledby="review-mix">
            <h2 id="review-mix">Exercise mix</h2>
            <p className="band-summary">
              This session draws from these formats. Listening and speaking appear only when you
              have enabled them and this browser supports them (§19).
            </p>
            <ul className="band-list">
              {types.map((type) => (
                <li key={type}>
                  <span className="band-chip">
                    <span className="band-chip__name">{EXERCISE_TYPE_LABELS[type]}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="band-summary">
              <Link to="/settings">Change which formats you practise</Link>
            </p>
          </section>

          <button type="button" className="exercise__submit" onClick={start}>
            Start review ({counts.due} due)
          </button>

          <section className="settings-section" aria-labelledby="review-next">
            <h2 id="review-next">Next up</h2>
            <p className="band-summary">
              Overdue and harder words come first. {overdue.length} of these are overdue.
            </p>
            <ol className="entry-list">
              {due.slice(0, 12).map((entry) => (
                <li key={entry.entryId} className="entry-row">
                  <span className="entry-row__rank">{entry.srs.status}</span>
                  <Link className="entry-row__german" to={`/word/${entry.entryId}`} lang="de">
                    {labels.get(entry.entryId) ?? entry.entryId}
                  </Link>
                  <span className="entry-row__english">
                    difficulty {entry.srs.difficulty.toFixed(2)}
                  </span>
                  <span className="entry-row__class">{entry.srs.repetitions} reviews</span>
                  <span className="entry-row__topic">
                    {entry.srs.lapses > 0 ? `${entry.srs.lapses} lapses` : 'no lapses'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section className="settings-section" aria-labelledby="review-empty">
          <h2 id="review-empty">Nothing due right now</h2>
          <p>
            {counts.learning + counts.review + counts.mastered === 0
              ? 'You have not started any words yet.'
              : 'Everything you have started is scheduled for later.'}{' '}
            <Link to="/learn">Learn new words</Link> or <Link to="/practice">practise freely</Link>.
          </p>
        </section>
      )}

      <section className="settings-section" aria-labelledby="review-forecast">
        <h2 id="review-forecast">Review forecast</h2>
        <p className="band-summary">How many entries fall due over the next two weeks.</p>
        <ul className="forecast">
          {forecast.map((day) => (
            <li key={day.date} className="forecast__day">
              <span className="forecast__date">{day.date.slice(5)}</span>
              <span
                className="forecast__bar"
                style={{ width: `${Math.min(100, day.count * 10)}%` }}
                aria-hidden="true"
              />
              <span className="forecast__count">{day.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
