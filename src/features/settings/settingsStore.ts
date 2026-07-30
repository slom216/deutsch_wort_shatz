import { create } from 'zustand';

import { db, initializeDatabase } from '@/features/persistence/db';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/schemas/settingsSchema';

/**
 * Settings store (Phase 0 deliverable 6).
 *
 * Zustand holds the in-memory copy; IndexedDB is the durable source of truth. Writes go
 * to both, so a refresh keeps the learner's choices.
 */

type DatabaseStatus = 'idle' | 'ready' | 'error';

interface SettingsState {
  readonly settings: Settings;
  readonly status: DatabaseStatus;
  readonly error: string | null;
  readonly hydrate: () => Promise<void>;
  readonly update: (patch: Partial<Omit<Settings, 'id' | 'schemaVersion'>>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  status: 'idle',
  error: null,

  hydrate: async () => {
    try {
      const stored = await initializeDatabase();
      // Validate on read: a corrupt or older row falls back to defaults rather than
      // crashing start-up. Phase 17 adds the explicit repair flow.
      const parsed = settingsSchema.safeParse(stored);
      set({
        settings: parsed.success ? parsed.data : DEFAULT_SETTINGS,
        status: 'ready',
        error: parsed.success ? null : 'Stored settings were invalid; defaults were applied.',
      });
    } catch (cause) {
      set({
        status: 'error',
        error: cause instanceof Error ? cause.message : 'IndexedDB is unavailable.',
      });
    }
  },

  update: async (patch) => {
    const next: Settings = {
      ...get().settings,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    set({ settings: next });
    await db.settings.put(next);
  },
}));
