import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { bandsForLevel, isCefrLevel, LEVEL_RANK_RANGES } from '@/content/vocabulary/frequencyBands';
import { useContentManifest } from '@/features/learning/useContentManifest';
import '@/pages/LearnPage.css';
import '@/styles/lists.css';

/** `/learn/:level` — the frequency bands that make up one CEFR level (§8). */
export default function LevelPage(): ReactNode {
  const { level: levelParam } = useParams<{ level: string }>();
  const level = (levelParam ?? '').toUpperCase();
  const { manifest } = useContentManifest();

  if (!isCefrLevel(level)) {
    return (
      <>
        <PageHeader title="Level not found" />
        <p role="alert">
          &ldquo;{levelParam}&rdquo; is not a CEFR level in this app. Choose A1, A2 or B1 from{' '}
          <Link to="/learn">Learn</Link>.
        </p>
      </>
    );
  }

  const bands = bandsForLevel(level);
  const range = LEVEL_RANK_RANGES[level];
  const count = manifest?.entriesByLevel[level];

  return (
    <>
      <PageHeader
        title={`${level} vocabulary`}
        description={`${count ? count.toLocaleString('en-US') : '—'} entries, global ranks ${range.from.toLocaleString('en-US')}–${range.to.toLocaleString('en-US')}. Frequency rank always takes priority over topic order.`}
      />

      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/learn">Learn</Link> <span aria-hidden="true">/</span> {level}
      </nav>

      <ul className="band-list band-list--roomy">
        {bands.map((band) => (
          <li key={band.id}>
            <Link className="band-chip" to={`/learn/${level.toLowerCase()}/${band.slug}`}>
              <span className="band-chip__name">{band.id}</span>
              <span className="band-chip__range">
                Ranks {band.from.toLocaleString('en-US')}–{band.to.toLocaleString('en-US')} ·{' '}
                {(band.to - band.from + 1).toLocaleString('en-US')} entries
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
