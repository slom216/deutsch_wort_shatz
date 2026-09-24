import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { ACHIEVEMENTS } from '@/features/gamification/achievements';
import { AchievementBadge, badgeVariant } from './AchievementBadge';

describe('AchievementBadge', () => {
  it('uses the collage art for the two achievements that have it', () => {
    for (const id of ['first-word', 'words-introduced-100']) {
      const { container, unmount } = render(<AchievementBadge id={id} />);
      expect(container.querySelector('img')).not.toBeNull();
      unmount();
    }
  });

  it('draws every other achievement with a stable, three-colour variant', () => {
    const { container } = render(<AchievementBadge id="streak-7" />);
    expect(container.querySelector('img')).toBeNull();
    expect(badgeVariant('streak-7')).toEqual(badgeVariant('streak-7'));

    for (const { id } of ACHIEVEMENTS) {
      const { ground, corner, mark } = badgeVariant(id);
      expect(new Set([ground, corner, mark]).size).toBe(3);
    }
  });
});
