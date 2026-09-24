import type { CSSProperties, ReactNode } from 'react';

import firstWord from '@/assets/art/first-word.png';
import wordsIntroduced100 from '@/assets/art/100-words-introduced.png';
import './AchievementBadge.css';

/** Achievements that have their own collage art (61 × 60, drawn at native size). */
const BADGE_ART: Readonly<Record<string, string>> = {
  'first-word': firstWord,
  'words-introduced-100': wordsIntroduced100,
};

const COLOURS = ['red', 'mustard', 'sky', 'ink'] as const;
const SHAPES = ['circle', 'quarter', 'triangle'] as const;

export interface BadgeVariant {
  readonly ground: (typeof COLOURS)[number];
  readonly corner: (typeof COLOURS)[number];
  readonly mark: (typeof COLOURS)[number];
  readonly shape: (typeof SHAPES)[number];
}

/**
 * A cut-paper collage for an achievement without its own art: a square split on the
 * diagonal between two palette colours, with one shape in a third. Derived from the id
 * alone, so a badge is the same on every render and every device.
 */
export function badgeVariant(id: string): BadgeVariant {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const ground = hash % 4;
  const corner = (ground + 1 + ((hash >>> 2) % 3)) % 4;
  const rest = [0, 1, 2, 3].filter((index) => index !== ground && index !== corner);
  const mark = rest[(hash >>> 4) % 2] ?? 0;
  return {
    ground: COLOURS[ground] ?? 'red',
    corner: COLOURS[corner] ?? 'sky',
    mark: COLOURS[mark] ?? 'ink',
    shape: SHAPES[(hash >>> 6) % 3] ?? 'circle',
  };
}

/** Decorative: the achievement's name is always written beside it. */
export function AchievementBadge({ id }: { readonly id: string }): ReactNode {
  const art = BADGE_ART[id];
  if (art) {
    return <img className="achievement-badge" src={art} alt="" width={61} height={60} />;
  }
  const variant = badgeVariant(id);
  return (
    <span
      className={`achievement-badge achievement-badge--drawn achievement-badge--${variant.shape}`}
      data-variant={`${variant.ground}-${variant.corner}-${variant.mark}-${variant.shape}`}
      style={
        {
          '--badge-ground': `var(--badge-${variant.ground})`,
          '--badge-corner': `var(--badge-${variant.corner})`,
          '--badge-mark': `var(--badge-${variant.mark})`,
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
