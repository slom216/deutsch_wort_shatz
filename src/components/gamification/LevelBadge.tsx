import type { ReactNode } from 'react';

import { useLiveLevel } from '@/features/gamification/useLiveLevel';
import { avatarSrc } from '@/features/gamification/xp';
import './LevelBadge.css';

/**
 * The learner's rank while they work: card, level, and how far the next level is.
 *
 * Reads the running session itself, so any exercise screen gets the live figure by
 * dropping it in. The bar animates to its new width and the XP just earned floats up
 * beside it — the only feedback that the number moved at all.
 */
export function LevelBadge(): ReactNode {
  const { level, lastXp, answerCount } = useLiveLevel();
  const percent = Math.round(level.fraction * 100);

  return (
    <div className="level-badge">
      {/* Decorative: the level is written out beside it. */}
      <img className="level-badge__avatar" src={avatarSrc(level.level)} alt="" />
      <div className="level-badge__body">
        <p className="level-badge__title">
          Level {level.level}
          {lastXp !== 0 ? (
            <span
              key={answerCount}
              className={
                lastXp > 0 ? 'level-badge__gain' : 'level-badge__gain level-badge__gain--loss'
              }
            >
              {lastXp > 0 ? `+${lastXp}` : lastXp} XP
            </span>
          ) : null}
        </p>
        <div
          className="level-badge__meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Progress to level ${level.level + 1}`}
        >
          <span style={{ width: `${level.fraction * 100}%` }} />
        </div>
        <p className="level-badge__hint">
          {level.xpForNextLevel} XP to level {level.level + 1}
        </p>
      </div>
    </div>
  );
}
