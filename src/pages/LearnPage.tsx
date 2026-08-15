import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { CEFR_LEVELS, bandsForLevel, LEVEL_RANK_RANGES } from '@/content/vocabulary/frequencyBands';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { isTopic, topicSlug } from '@/content/vocabulary/topics';
import { progressByBand, progressByLevel, progressByTopic } from '@/features/progress/analytics';
import { useContentManifest } from '@/features/learning/useContentManifest';
import { continuousSessionPath } from '@/features/practice/session/endless';
import { useReviewState } from '@/features/srs/useReviewState';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import './LearnPage.css';
import './SettingsPage.css';

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  A1: 'Essential verbs, pronouns, articles, numbers, greetings and everyday phrases.',
  A2: 'Expanded daily life: work, education, healthcare, housing, travel and services.',
  B1: 'Professional communication, society, media, opinions and abstract vocabulary.',
};

/** Topics listed on this page. The full registry lives on the vocabulary browser. */
const TOPIC_LIMIT = 12;

/**
 * Learn (§6).
 *
 * Shows the real content hierarchy — CEFR level, then frequency band (§8), then topic —
 * with the learner's introduced and mastered counts against each.
 */
export default function LearnPage(): ReactNode {
  const { manifest, error } = useContentManifest();
  const navigate = useNavigate();
  const { loading, counts, progress } = useReviewState();
  const batchSize = useSettingsStore((state) => state.settings.newWordBatchSize);

  const [index, setIndex] = useState<readonly VocabularyIndexRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSearchIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch(() => {
        // The band and topic breakdowns are additive; the page is still usable without
        // them, and `error` from the manifest already reports a missing content build.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progressByEntry = useMemo(
    () => new Map(progress.map((record) => [record.entryId, record])),
    [progress],
  );

  const levels = useMemo(
    () => new Map(progressByLevel(index, progressByEntry).map((row) => [row.key, row])),
    [index, progressByEntry],
  );
  const bands = useMemo(
    () => new Map(progressByBand(index, progressByEntry).map((row) => [row.key, row])),
    [index, progressByEntry],
  );
  const topics = useMemo(
    () =>
      progressByTopic(index, progressByEntry)
        .filter((row) => row.total > 0 && isTopic(row.key))
        .slice(0, TOPIC_LIMIT),
    [index, progressByEntry],
  );

  /**
   * The level the next batch comes from: the first with anything left to introduce.
   *
   * Hardcoding A1 here is what produced empty sessions — a learner past A1 was sent to a
   * level with nothing new in it, and bounced straight to a 0-of-0 results page.
   */
  const nextLevel =
    CEFR_LEVELS.find((level) => {
      const row = levels.get(level);
      return row ? row.introduced < row.total : false;
    }) ??
    CEFR_LEVELS[0] ??
    'A1';

  const startStream = (): void => {
    void navigate(continuousSessionPath());
  };

  const startNewBatch = (): void => {
    const sessionId = `new-${Date.now().toString(36)}`;
    void navigate(
      `/practice/session/${sessionId}?mode=new&level=${nextLevel.toLowerCase()}&band=all`,
    );
  };

  return (
    <>
      <PageHeader
        title="Learn"
        description="Vocabulary is organised by CEFR level, then frequency band, then topic. High-frequency words come first."
      />

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      <section className="settings-section" aria-labelledby="learn-next">
        <h2 id="learn-next">Keep learning</h2>
        {loading ? (
          <p className="band-summary">Checking what you have already started…</p>
        ) : (
          <>
            <p>
              {counts.newAvailable > 0
                ? `New ${nextLevel} words in frequency order, mixed with whatever is due for review. The stream does not end — stop whenever you like.`
                : 'You have met every entry in the vocabulary. The stream now keeps your existing words in rotation.'}
            </p>
            <p className="band-summary">
              {counts.learning + counts.review + counts.mastered} started ·{' '}
              {counts.newAvailable.toLocaleString('en-US')} still new
              {counts.due > 0 ? ` · ${counts.due} due for review` : ''}
            </p>
            <button type="button" className="exercise__submit" onClick={startStream}>
              Start learning
            </button>
            {counts.newAvailable > 0 ? (
              <button type="button" className="page-action" onClick={startNewBatch}>
                A fixed batch of {batchSize} instead
              </button>
            ) : null}
          </>
        )}
      </section>

      <div className="level-list">
        {CEFR_LEVELS.map((level) => {
          const levelBands = bandsForLevel(level);
          const range = LEVEL_RANK_RANGES[level];
          const count = manifest?.entriesByLevel[level];
          const levelProgress = levels.get(level);

          return (
            <section key={level} className="level-card" aria-labelledby={`level-${level}`}>
              <div className="level-card__header">
                <h2 id={`level-${level}`}>
                  <Link to={`/learn/${level.toLowerCase()}`}>{level}</Link>
                </h2>
                <p className="level-card__meta">
                  {count ? `${count.toLocaleString('en-US')} entries` : '—'} · ranks{' '}
                  {range.from.toLocaleString('en-US')}–{range.to.toLocaleString('en-US')}
                </p>
              </div>
              <p className="level-card__description">{LEVEL_DESCRIPTIONS[level]}</p>

              {levelProgress ? (
                <p className="band-summary">
                  {levelProgress.introduced.toLocaleString('en-US')} introduced ·{' '}
                  {levelProgress.mastered.toLocaleString('en-US')} mastered ·{' '}
                  {Math.round(levelProgress.fraction * 100)}% started ·{' '}
                  {(levelProgress.pointsFraction * 100).toFixed(1)}% complete
                </p>
              ) : null}

              <h3 className="level-card__bands-heading">Frequency bands</h3>
              <ul className="band-list">
                {levelBands.map((band) => {
                  const bandProgress = bands.get(band.id);
                  return (
                    <li key={band.id}>
                      <Link className="band-chip" to={`/learn/${level.toLowerCase()}/${band.slug}`}>
                        <span className="band-chip__name">{band.id}</span>
                        <span className="band-chip__range">
                          {bandProgress
                            ? `${bandProgress.introduced}/${bandProgress.total} introduced · ${bandProgress.mastered} mastered · ${(bandProgress.pointsFraction * 100).toFixed(1)}% complete`
                            : `${band.from.toLocaleString('en-US')}–${band.to.toLocaleString('en-US')}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {topics.length > 0 ? (
        <section className="settings-section" aria-labelledby="learn-topics">
          <h2 id="learn-topics">Topics</h2>
          <p className="band-summary">
            The largest topics in the vocabulary. Open one to browse it or practise it.
          </p>
          <ul className="band-list">
            {topics.map((topic) => (
              <li key={topic.key}>
                <Link
                  className="band-chip"
                  to={`/topic/${isTopic(topic.key) ? topicSlug(topic.key) : ''}`}
                >
                  <span className="band-chip__name">{topic.label}</span>
                  <span className="band-chip__range">
                    {topic.introduced}/{topic.total} introduced · {topic.mastered} mastered
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="band-summary">
            <Link to="/vocabulary">Browse every topic in the vocabulary</Link>
          </p>
        </section>
      ) : null}
    </>
  );
}
