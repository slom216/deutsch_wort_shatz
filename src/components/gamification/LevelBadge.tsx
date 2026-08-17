import { useEffect, useRef, type ReactNode } from 'react';

import { useLevelUp } from '@/features/gamification/useLevelUp';
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
  const { level, lastXp, answerCount, ready, totalXp } = useLiveLevel();
  const percent = Math.round(level.fraction * 100);
  const previousLevel = useLevelUp(ready ? level.level : null);

  return (
    <div className="level-badge">
      {/* Keyed so a second promotion remounts the dialog and opens it again. */}
      {previousLevel !== null ? (
        <LevelUpDialog key={previousLevel} from={previousLevel} to={level.level} />
      ) : null}
      {/* Decorative: the level is written out beside it. */}
      <img className="level-badge__avatar" src={avatarSrc(level.level)} alt="" />
      <div className="level-badge__body">
        <p className="level-badge__title">
          Level {level.level} <span className="level-badge__total">({totalXp} XP)</span>
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

/** Old rank card, arrow, new rank card — the promotion, spelled out. */
function LevelUpDialog({ from, to }: { from: number; to: number }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Guarded for jsdom, which has no modal dialog implementation.
    ref.current?.showModal?.();
  }, []);

  return (
    <dialog className="level-up" ref={ref} aria-labelledby="level-up-title">
      <p className="level-up__eyebrow">Level up!</p>
      <div className="level-up__cards">
        <img className="level-up__card" src={avatarSrc(from)} alt={`Level ${from} rank card`} />
        <span className="level-up__arrow" aria-hidden="true">
          →
        </span>
        <img
          className="level-up__card level-up__card--new"
          src={avatarSrc(to)}
          alt={`Level ${to} rank card`}
        />
      </div>
      <h2 className="level-up__title" id="level-up-title">
        Congratulations — you reached level {to}!
      </h2>
      <form method="dialog">
        <button className="level-up__confirm" type="submit">
          Keep going
        </button>
      </form>
    </dialog>
  );
}
