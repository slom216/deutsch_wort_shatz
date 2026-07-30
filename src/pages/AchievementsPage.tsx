import type { ReactNode } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { StatCard } from '@/components/common/StatCard';
import { useGamification } from '@/features/gamification/useGamification';
import type { AchievementStatus } from '@/features/gamification/achievements';
import '@/styles/lists.css';
import './SettingsPage.css';
import './AchievementsPage.css';

const CATEGORY_LABELS: Record<AchievementStatus['definition']['category'], string> = {
  milestone: 'Milestones',
  mastery: 'Mastery',
  streak: 'Streaks',
  skill: 'Skills',
  level: 'CEFR levels',
};

/**
 * Achievements (§23).
 *
 * Progress towards a locked achievement is shown honestly rather than hidden, and there
 * are no leaderboards, no paid currency and no lives.
 */
export default function AchievementsPage(): ReactNode {
  const { loading, snapshot, error } = useGamification();

  if (loading) return <LoadingScreen label="Loading achievements…" />;

  if (error || !snapshot) {
    return (
      <>
        <PageHeader title="Achievements" />
        <p role="alert" className="page-alert">
          {error ?? 'Could not read your progress.'}
        </p>
      </>
    );
  }

  const unlocked = snapshot.achievements.filter((a) => a.unlocked);
  const byCategory = new Map<string, AchievementStatus[]>();
  for (const achievement of snapshot.achievements) {
    const bucket = byCategory.get(achievement.definition.category) ?? [];
    bucket.push(achievement);
    byCategory.set(achievement.definition.category, bucket);
  }

  return (
    <>
      <PageHeader
        title="Achievements"
        description="Badges for milestones, mastery and CEFR completion. No leaderboards, no paid currency."
      />

      <dl className="stat-grid">
        <StatCard
          label="Unlocked"
          value={`${unlocked.length} / ${snapshot.achievements.length}`}
          hint="Achievements earned"
        />
        <StatCard
          label="Total XP"
          value={snapshot.totalXp.toLocaleString('en-US')}
          hint="All time"
        />
        <StatCard
          label="Learner level"
          value={snapshot.level.level}
          hint={`${snapshot.level.xpForNextLevel} XP to next level`}
        />
        <StatCard
          label="Current streak"
          value={`${snapshot.streak.current} day${snapshot.streak.current === 1 ? '' : 's'}`}
          hint={`Longest: ${snapshot.streak.longest}`}
        />
      </dl>

      {[...byCategory.entries()].map(([category, achievements]) => (
        <section key={category} className="settings-section" aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`}>
            {CATEGORY_LABELS[category as AchievementStatus['definition']['category']]}
          </h2>
          <ul className="achievement-list">
            {achievements.map((achievement) => (
              <li
                key={achievement.definition.id}
                className={`achievement ${achievement.unlocked ? 'achievement--unlocked' : ''}`}
              >
                <span className="achievement__icon" aria-hidden="true">
                  {achievement.unlocked ? '★' : '☆'}
                </span>
                <div className="achievement__text">
                  <p className="achievement__name">
                    <span className="achievement__label">{achievement.definition.name}</span>
                    {/* Status in words, never colour alone (§30). */}
                    <span className="achievement__status">
                      {achievement.unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </p>
                  <p className="achievement__description">{achievement.definition.description}</p>
                  {!achievement.unlocked ? (
                    <div
                      className="achievement__bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(achievement.progress * 100)}
                      aria-label={`${achievement.definition.name} progress`}
                    >
                      <span style={{ width: `${achievement.progress * 100}%` }} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
