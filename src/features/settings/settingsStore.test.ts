import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from './settingsStore';
import { db } from '@/features/persistence/db';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '@/schemas/settingsSchema';

describe('settings store', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, status: 'idle', error: null });
  });

  it('hydrates defaults on first run', async () => {
    await useSettingsStore.getState().hydrate();

    const { settings, status, error } = useSettingsStore.getState();
    expect(status).toBe('ready');
    expect(error).toBeNull();
    expect(settings.dailyGoal).toBe(20);
    expect(settings.newWordBatchSize).toBe(5);
    expect(settings.strictAnswerChecking).toBe(true);
  });

  it('persists an update to IndexedDB and survives a re-hydrate', async () => {
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().update({ dailyGoal: 30, speakingEnabled: false });

    expect(useSettingsStore.getState().settings.dailyGoal).toBe(30);

    const stored = await db.settings.get(SETTINGS_KEY);
    expect(stored?.dailyGoal).toBe(30);
    expect(stored?.speakingEnabled).toBe(false);

    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, status: 'idle' });
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().settings.dailyGoal).toBe(30);
  });

  it('falls back to defaults when the stored row is invalid rather than crashing', async () => {
    // A corrupt row, as an older or hand-edited database might contain.
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      // @ts-expect-error deliberately invalid value for this test
      dailyGoal: 999,
    });

    await useSettingsStore.getState().hydrate();

    const { settings, status, error } = useSettingsStore.getState();
    expect(status).toBe('ready');
    expect(settings.dailyGoal).toBe(DEFAULT_SETTINGS.dailyGoal);
    expect(error).toMatch(/invalid/i);
  });

  it('stamps updatedAt on every write', async () => {
    await useSettingsStore.getState().hydrate();
    const before = useSettingsStore.getState().settings.updatedAt;

    await useSettingsStore.getState().update({ dailyGoal: 10 });

    expect(useSettingsStore.getState().settings.updatedAt >= before).toBe(true);
  });
});
