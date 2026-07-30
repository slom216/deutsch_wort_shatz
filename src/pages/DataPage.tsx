import { useRef, useState, type ReactNode } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { resetAllProgress } from '@/features/persistence/db';
import {
  applyImport,
  exportFilename,
  exportProgress,
  inspectImport,
  repairDatabase,
  serializeExport,
  type ImportInspection,
  type ImportMode,
  type RepairReport,
} from '@/features/persistence/transfer';
import { useSettingsStore } from '@/features/settings/settingsStore';
import '@/styles/lists.css';
import './SettingsPage.css';

/**
 * Data management (§25).
 *
 * Export, import with preview, merge and replace modes, repair, and a confirmed reset.
 * Everything happens locally: the export is produced in the browser and downloaded via an
 * object URL, and nothing is ever uploaded.
 */
export default function DataPage(): ReactNode {
  const hydrate = useSettingsStore((state) => state.hydrate);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [repair, setRepair] = useState<RepairReport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const download = async (): Promise<void> => {
    const file = await exportProgress();
    const blob = new Blob([serializeExport(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename();
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const choose = async (file: File): Promise<void> => {
    setImportMessage(null);
    setInspection(await inspectImport(await file.text()));
  };

  const confirmImport = async (): Promise<void> => {
    if (!inspection?.valid) return;
    const result = await applyImport(inspection.file, mode);
    await hydrate();
    setInspection(null);
    if (fileRef.current) fileRef.current.value = '';
    setImportMessage(
      `Imported ${result.imported.entryProgress} entries and ${result.imported.exerciseHistory} exercises (${result.mode} mode).`,
    );
  };

  const reset = async (): Promise<void> => {
    await resetAllProgress();
    await hydrate();
    setConfirming(false);
    setResetDone(true);
  };

  return (
    <>
      <PageHeader
        title="Data"
        description="Export, import and reset your progress. Everything stays on this device."
      />

      {/* ---------------------------------------------------------- export */}
      <section className="settings-section" aria-labelledby="data-export">
        <h2 id="data-export">Export progress</h2>
        <p>
          Downloads a JSON file with your entry progress, review schedule, exercise history,
          sessions, achievements and XP. The vocabulary itself is not included — it ships with the
          app.
        </p>
        <button
          type="button"
          className="exercise__submit"
          onClick={() => {
            void download();
          }}
        >
          Download progress file
        </button>
      </section>

      {/* ---------------------------------------------------------- import */}
      <section className="settings-section" aria-labelledby="data-import">
        <h2 id="data-import">Import progress</h2>
        <p>Choose a file to preview what it contains. Nothing is written until you confirm.</p>

        <div className="settings-field">
          <label htmlFor="import-file">Progress file</label>
          <input
            id="import-file"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void choose(file);
            }}
          />
        </div>

        {importMessage ? (
          <p role="status" className="data-reset__done">
            {importMessage}
          </p>
        ) : null}

        {inspection && !inspection.valid ? (
          <div role="alert" className="page-alert">
            <p>{inspection.reason}</p>
            {inspection.details ? (
              <ul className="example-list">
                {inspection.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {inspection?.valid ? (
          <div className="import-preview">
            <h3>Preview</h3>
            <p className="band-summary">
              Exported {new Date(inspection.exportedAt).toLocaleString()} · schema{' '}
              {inspection.schemaVersion}
              {inspection.migrated ? ' (will be migrated to the current schema)' : ''}
            </p>
            <ul className="example-list">
              <li>{inspection.counts.entryProgress} entry progress records</li>
              <li>{inspection.counts.exerciseHistory} exercise history rows</li>
              <li>{inspection.counts.sessions} sessions</li>
              <li>{inspection.counts.achievements} achievements</li>
              <li>{inspection.counts.xpEvents} XP awards</li>
            </ul>
            <p className="band-summary">
              A merge would add {inspection.newEntryProgress} new entries and{' '}
              {inspection.newExerciseHistory} new exercises.
            </p>

            <fieldset className="settings-field">
              <legend>How should this be applied?</legend>
              <div className="settings-field--checkbox">
                <input
                  id="mode-merge"
                  type="radio"
                  name="import-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />
                <label htmlFor="mode-merge">
                  Merge — keep what you have, add anything new. Never loses reviews.
                </label>
              </div>
              <div className="settings-field--checkbox">
                <input
                  id="mode-replace"
                  type="radio"
                  name="import-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <label htmlFor="mode-replace">
                  Replace — discard everything stored here first. Destructive.
                </label>
              </div>
            </fieldset>

            <div className="data-reset__actions">
              <button
                type="button"
                className={`exercise__submit ${mode === 'replace' ? 'data-reset__button--danger' : ''}`}
                onClick={() => {
                  void confirmImport();
                }}
              >
                {mode === 'replace' ? 'Replace all progress' : 'Merge into my progress'}
              </button>
              <button
                type="button"
                className="runner__retry"
                onClick={() => {
                  setInspection(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- repair */}
      <section className="settings-section" aria-labelledby="data-repair">
        <h2 id="data-repair">Repair database</h2>
        <p>
          Checks every stored record against its schema and removes any that are corrupt. Valid
          progress is left untouched.
        </p>
        <button
          type="button"
          className="data-reset__button"
          onClick={() => {
            void repairDatabase().then(setRepair);
          }}
        >
          Check and repair
        </button>
        {repair ? (
          <p role="status" className="data-reset__done">
            {repair.ok
              ? 'No problems found. Every stored record is valid.'
              : `Removed ${repair.removedProgress} corrupt progress records and ${repair.removedHistory} corrupt history rows.`}
          </p>
        ) : null}
      </section>

      {/* ----------------------------------------------------------- reset */}
      <section className="settings-section" aria-labelledby="data-reset">
        <h2 id="data-reset">Reset progress</h2>
        <p>
          This permanently deletes every entry&rsquo;s progress and review schedule, your whole
          exercise history, all sessions, and all XP, streaks and achievements. It cannot be undone.
        </p>

        {resetDone ? (
          <p role="status" className="data-reset__done">
            Progress reset. Everything has been cleared from this browser.
          </p>
        ) : null}

        {!confirming ? (
          <button
            type="button"
            className="data-reset__button"
            onClick={() => {
              setResetDone(false);
              setConfirming(true);
            }}
          >
            Reset all progress…
          </button>
        ) : (
          <div className="data-reset__confirm" role="alertdialog" aria-labelledby="reset-confirm">
            <p id="reset-confirm">
              <strong>Are you sure?</strong> This deletes all of your learning data permanently.
              Consider exporting first.
            </p>
            <div className="data-reset__actions">
              <button
                type="button"
                className="data-reset__button data-reset__button--danger"
                onClick={() => {
                  void reset();
                }}
              >
                Yes, delete everything
              </button>
              <button type="button" className="runner__retry" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
