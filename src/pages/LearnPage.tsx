import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { CEFR_LEVELS, bandsForLevel, LEVEL_RANK_RANGES } from '@/content/vocabulary/frequencyBands';
import { useContentManifest } from '@/features/learning/useContentManifest';
import { useReviewState } from '@/features/srs/useReviewState';
import { useSettingsStore } from '@/features/settings/settingsStore';
import './LearnPage.css';
import './SettingsPage.css';

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  A1: 'Essential verbs, pronouns, articles, numbers, greetings and everyday phrases.',
  A2: 'Expanded daily life: work, education, healthcare, housing, travel and services.',
  B1: 'Professional communication, society, media, opinions and abstract vocabulary.',
};

/**
 * Learn (§6).
 *
 * Shows the real content hierarchy — CEFR level, then frequency band (§8). Introduced
 * and mastered counts, plus the recommended next lesson, arrive with the SRS in Phase 2.
 */
export default function LearnPage(): ReactNode {
  const { manifest, error } = useContentManifest();
  const navigate = useNavigate();
  const { loading, counts } = useReviewState();
  const batchSize = useSettingsStore((state) => state.settings.newWordBatchSize);

  /**
   * A new-vocabulary batch (§18): the session page introduces the highest-frequency
   * entries the learner has not met, then teaches each with recognition before production.
   */
  const startNewBatch = (): void => {
    const sessionId = `new-${Date.now().toString(36)}`;
    void navigate(`/practice/session/${sessionId}?mode=new&level=A1&band=all`);
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
        <h2 id="learn-next">Recommended next lesson</h2>
        {loading ? (
          <p className="band-summary">Checking what you have already started…</p>
        ) : (
          <>
            <p>
              {counts.newAvailable > 0
                ? `Learn ${batchSize} new words, taken in frequency order from the highest-ranked entries you have not met yet.`
                : 'You have introduced every entry in the vocabulary.'}
            </p>
            <p className="band-summary">
              {counts.learning + counts.review + counts.mastered} started ·{' '}
              {counts.newAvailable.toLocaleString('en-US')} still new
              {counts.due > 0 ? ` · ${counts.due} due for review` : ''}
            </p>
            {counts.newAvailable > 0 ? (
              <button type="button" className="exercise__submit" onClick={startNewBatch}>
                Learn {batchSize} new words
              </button>
            ) : null}
          </>
        )}
      </section>

      <div className="level-list">
        {CEFR_LEVELS.map((level) => {
          const bands = bandsForLevel(level);
          const range = LEVEL_RANK_RANGES[level];
          const count = manifest?.entriesByLevel[level];

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

              <h3 className="level-card__bands-heading">Frequency bands</h3>
              <ul className="band-list">
                {bands.map((band) => (
                  <li key={band.id}>
                    <Link className="band-chip" to={`/learn/${level.toLowerCase()}/${band.slug}`}>
                      <span className="band-chip__name">{band.id}</span>
                      <span className="band-chip__range">
                        {band.from.toLocaleString('en-US')}–{band.to.toLocaleString('en-US')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
