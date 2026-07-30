import '@testing-library/jest-dom/vitest';
// Provides a real in-memory IndexedDB so Dexie code paths are exercised for real
// rather than mocked away (Phase 0 acceptance: "one test record can be created and read").
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
