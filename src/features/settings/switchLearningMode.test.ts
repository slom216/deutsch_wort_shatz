import { beforeEach, describe, expect, it } from 'vitest';

import { switchLearningMode } from './switchLearningMode';
import { useSettingsStore } from './settingsStore';
import { db } from '@/features/persistence/db';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '@/schemas/settingsSchema';
import { introduceEntry, loadAllProgress } from '@/features/srs/repository';

describe('switching learning mode', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await db.entryProgress.clear();
    await db.exerciseHistory.clear();
    await db.xpEvents.clear();
    localStorage.clear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, status: 'idle', error: null });
    await useSettingsStore.getState().hydrate();
  });

  it('records the new mode', async () => {
    await switchLearningMode('ultraFast');

    expect(useSettingsStore.getState().settings.learningMode).toBe('ultraFast');
    expect((await db.settings.get(SETTINGS_KEY))?.learningMode).toBe('ultraFast');
  });

  it('wipes progress earned under the old target', async () => {
    await introduceEntry('a1-0001-eins');
    await db.xpEvents.put({
      id: 'daily:2026-04-01',
      type: 'daily',
      amount: 25,
      awardedAt: '2026-04-01',
    });
    expect(await loadAllProgress()).toHaveLength(1);

    await switchLearningMode('fast');

    expect(await loadAllProgress()).toHaveLength(0);
    expect(await db.xpEvents.count()).toBe(0);
  });

  it('keeps the learner’s other settings, which are not progress', async () => {
    await useSettingsStore
      .getState()
      .update({ dailyGoal: 50, speechRate: 1.5, strictAnswerChecking: false });

    await switchLearningMode('fast');

    const settings = useSettingsStore.getState().settings;
    expect(settings.learningMode).toBe('fast');
    expect(settings.dailyGoal).toBe(50);
    expect(settings.speechRate).toBe(1.5);
    expect(settings.strictAnswerChecking).toBe(false);

    // …and durably, not just in memory.
    expect((await db.settings.get(SETTINGS_KEY))?.dailyGoal).toBe(50);
  });

  it('clears the best streaks, which no IndexedDB transaction can reach', async () => {
    localStorage.setItem('practice-best-streak', '42');
    localStorage.setItem('practice-best-streak-easy', '17');

    await switchLearningMode('fast');

    expect(localStorage.getItem('practice-best-streak')).toBeNull();
    expect(localStorage.getItem('practice-best-streak-easy')).toBeNull();
  });

  it('does nothing at all when the mode is already the current one', async () => {
    await introduceEntry('a1-0001-eins');

    await switchLearningMode('normal');

    expect(await loadAllProgress()).toHaveLength(1);
  });
});
