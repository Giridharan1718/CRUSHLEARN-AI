// The Settings surface.
//
// Every control here changes real behaviour. Where a capability is not
// connected, the page says so instead of offering a switch that would do
// nothing: a setting the app cannot honour is not a setting.
//
// The sections are:
//   - Learning: explanation level, language, motion, evidence labels
//   - AI provider: what is actually running, and what is not
//   - Your data: export, import, and a real wipe
//   - Privacy: activity tracking, with the derived figures that follow from it

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { listCapabilities } from '../ai/orchestrator.mjs';
import { checkGatewayStatus } from '../notebooks/groundedChat.mjs';
import { resolveGatewayBaseUrl } from '../notebooks/gatewayClient.mjs';
import {
  applyReducedMotion,
  LANGUAGES,
  EXPLANATION_LEVELS,
  EXPLANATION_LEVEL_LABELS,
  readSettings,
  writeSettings,
} from '../utils/settingsStore.mjs';
import {
  clearActivityHistory,
  getActivitySummary,
  setActivityTrackingEnabled,
} from '../utils/learningActivity.mjs';
import {
  applyImport,
  buildExport,
  parseImport,
  serializeExport,
  wipeAllData,
} from '../utils/dataPortability.mjs';
import {
  flushNotebookStorage,
  getAppNotebookStorage,
} from '../notebooks/notebookStorage.mjs';
import { showToast } from '../components/ui/Toast';

const CAPABILITY_LABELS = {
  working: 'Working',
  partial: 'Partial',
  mocked: 'Not connected',
  missing: 'Missing',
  unverified: 'Unverified',
};

const Settings = () => {
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const [settings, setSettings] = useState(() => readSettings());
  const [activity, setActivity] = useState(() => getActivitySummary());
  const [gateway, setGateway] = useState({
    state: 'checking',
    providerConfigured: false,
    model: null,
    error: null,
  });
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('merge');
  const [busy, setBusy] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    applyReducedMotion(settings.reducedMotion);
  }, [settings.reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    checkGatewayStatus({ baseUrl: resolveGatewayBaseUrl() })
      .then((status) => {
        if (cancelled) return;
        setGateway({
          state: status.available ? 'running' : 'offline',
          providerConfigured: status.providerConfigured,
          model: status.model,
          error: status.error,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGateway({
          state: 'offline',
          providerConfigured: false,
          model: null,
          error: 'The gateway could not be reached.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The activity figures change when the learner works in another tab.
  useEffect(() => {
    const refresh = () => setActivity(getActivitySummary());
    window.addEventListener('crushlearn:activity-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('crushlearn:activity-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const updateSetting = useCallback((patch) => {
    const result = writeSettings(patch);
    if (result.ok) {
      setSettings(result.settings);
    } else {
      showToast(result.errors[0] || 'The setting could not be saved.', {
        tone: 'danger',
      });
    }
  }, []);

  const handleExport = () => {
    setBusy('export');
    try {
      const result = buildExport(getAppNotebookStorage());
      if (!result.ok) {
        showToast(result.errors[0] || 'Nothing could be exported.', { tone: 'danger' });
        return;
      }

      const text = serializeExport(result.envelope);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = result.envelope.exportedAt.slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `crushlearn_export_${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(
        `Exported ${result.count} item${result.count === 1 ? '' : 's'}. Your password was not included.`,
        { tone: 'success' }
      );
    } catch {
      showToast('The export could not be prepared.', { tone: 'danger' });
    } finally {
      setBusy('');
    }
  };

  const handleImportText = async () => {
    setBusy('import');
    try {
      const parsed = parseImport(importText);
      if (!parsed.ok) {
        showToast(parsed.errors[0] || 'The file was not imported.', { tone: 'danger' });
        return;
      }

      const applied = applyImport(parsed.entries, getAppNotebookStorage(), {
        mode: importMode,
      });
      if (!applied.ok) {
        showToast(applied.errors[0] || 'The file was not imported.', { tone: 'danger' });
        return;
      }

      const storageResult = await flushNotebookStorage();
      if (!storageResult.ok) {
        showToast(
          `Imported ${applied.written.length} item${
            applied.written.length === 1 ? '' : 's'
          }, but source text is using browser fallback storage: ${
            storageResult.lastError || 'the local database did not confirm the write.'
          }`,
          { tone: 'warning' }
        );
      }

      setImportText('');
      setActivity(getActivitySummary());
      if (storageResult.ok) {
        showToast(
          `Imported ${applied.written.length} item${
            applied.written.length === 1 ? '' : 's'
          }. Reload to see the changes.`,
          { tone: 'success' }
        );
      }
    } catch {
      showToast('The file was not imported.', { tone: 'danger' });
    } finally {
      setBusy('');
    }
  };

  const handleFileChosen = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
    };
    reader.onerror = () => {
      showToast('The file could not be read.', { tone: 'danger' });
    };
    reader.readAsText(file);
    // Allow the same file to be chosen again.
    event.target.value = '';
  };

  const handleTrackingToggle = (enabled) => {
    setActivityTrackingEnabled(enabled);
    setActivity(getActivitySummary());
    showToast(
      enabled
        ? 'Activity tracking is on. Your streak is derived from what you do.'
        : 'Activity tracking is off. No new activity is recorded.',
      { tone: 'info' }
    );
  };

  const handleClearActivity = () => {
    if (!window.confirm('Clear your activity history? Your lessons and notes are not affected.')) {
      return;
    }
    clearActivityHistory();
    setActivity(getActivitySummary());
    showToast('Activity history cleared.', { tone: 'info' });
  };

  const handleWipe = async () => {
    const confirmed = window.confirm(
      'Delete everything stored by CrushLearn in this browser? This includes your account, notebooks, sources, notes and progress. It cannot be undone.'
    );
    if (!confirmed) return;

    const second = window.confirm(
      'This is permanent. Export your data first if you want to keep it. Delete everything now?'
    );
    if (!second) return;

    const result = wipeAllData(getAppNotebookStorage());
    if (!result.ok) {
      showToast(result.errors[0] || 'The data could not be deleted.', { tone: 'danger' });
      return;
    }

    const storageResult = await flushNotebookStorage();
    if (!storageResult.ok) {
      showToast(
        `Deleted ${result.removed} stored item${
          result.removed === 1 ? '' : 's'
        }, but the source-text database reported: ${
          storageResult.lastError || 'a pending deletion did not confirm.'
        }`,
        { tone: 'warning' }
      );
    } else {
      showToast(
        `Deleted ${result.removed} stored item${result.removed === 1 ? '' : 's'}.`,
        { tone: 'success' }
      );
    }
    navigate('/');
  };

  if (!user) return null;

  const capabilities = listCapabilities();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">Settings</h1>
        <p className="text-ink-muted">
          Preferences, provider status and your data. Everything here applies
          to this browser.
        </p>
      </div>

      {/* Learning preferences */}
      <section className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <h2 className="text-xl font-bold text-ink mb-2">Learning</h2>
        <p className="text-sm text-ink-muted mb-6">
          How the app explains things to you.
        </p>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="explanation-level"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              Default explanation level
            </label>
            <select
              id="explanation-level"
              value={settings.explanationLevel}
              onChange={(event) => updateSetting({ explanationLevel: event.target.value })}
              className="w-full sm:w-64 px-4 py-3 border border-line rounded-lg bg-surface text-ink focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {EXPLANATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EXPLANATION_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-subtle mt-2">
              Used when you open a passage without choosing a level yourself.
            </p>
          </div>

          <div>
            <span className="block text-sm font-medium text-ink-muted mb-2">
              Language
            </span>
            <ul className="space-y-2">
              {LANGUAGES.map((language) => (
                <li
                  key={language.code}
                  className="flex items-center justify-between rounded-lg border border-line px-4 py-3"
                >
                  <span className="text-sm text-ink">{language.label}</span>
                  {language.local ? (
                    <span className="text-xs font-semibold text-success">
                      Available locally
                    </span>
                  ) : (
                    <span className="text-xs text-ink-subtle">
                      Not connected — no translation service is configured
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label
              htmlFor="reduced-motion"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              Motion
            </label>
            <select
              id="reduced-motion"
              value={settings.reducedMotion}
              onChange={(event) => updateSetting({ reducedMotion: event.target.value })}
              className="w-full sm:w-64 px-4 py-3 border border-line rounded-lg bg-surface text-ink focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="system">Follow my system setting</option>
              <option value="on">Reduce motion</option>
              <option value="off">Allow motion</option>
            </select>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-line px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showGeneratorLabels}
              onChange={(event) =>
                updateSetting({ showGeneratorLabels: event.target.checked })
              }
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Label the origin of generated content
              </span>
              <span className="block text-xs text-ink-subtle">
                Shows whether an answer came from a model or from the local
                extractive reader.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-line px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showCitationDetail}
              onChange={(event) =>
                updateSetting({ showCitationDetail: event.target.checked })
              }
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Show the exact quoted passage behind a citation
              </span>
              <span className="block text-xs text-ink-subtle">
                Every citation stays verifiable either way; this only controls
                how much of the quotation is shown.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* AI provider status */}
      <section className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <h2 className="text-xl font-bold text-ink mb-2">AI provider</h2>
        <p className="text-sm text-ink-muted mb-6">
          What is actually running, and what the app does when it is not.
        </p>

        <div
          className={`rounded-xl border p-4 mb-6 ${
            gateway.state === 'running' && gateway.providerConfigured
              ? 'border-success/40 bg-success-soft'
              : gateway.state === 'running'
                ? 'border-warning/40 bg-warning-soft'
                : 'border-line bg-line-subtle'
          }`}
        >
          <p className="font-semibold text-ink mb-1">
            {gateway.state === 'checking'
              ? 'Checking the gateway…'
              : gateway.state === 'offline'
                ? 'The AI gateway is not running'
                : gateway.providerConfigured
                  ? 'The AI gateway is running with a provider key'
                  : 'The AI gateway is running without a provider key'}
          </p>
          <p className="text-sm text-ink-muted">
            {gateway.state === 'offline'
              ? 'Questions are answered from your own sources by the local extractive reader. Nothing is sent anywhere.'
              : gateway.providerConfigured
                ? `Answers can be grounded in a model. ${gateway.model ? `Model: ${gateway.model}.` : ''} Every citation is re-checked against the stored source text before it is shown.`
                : 'No provider key is configured on the gateway, so answers come from the local extractive reader.'}
          </p>
          {gateway.model && (
            <p className="text-xs text-ink-subtle mt-2">Model: {gateway.model}</p>
          )}
          {gateway.error && (
            <p className="text-xs text-ink-subtle mt-2">{gateway.error}</p>
          )}
        </div>

        <h3 className="text-sm font-semibold text-ink mb-3">Capability status</h3>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {capabilities.map((capability) => (
            <li
              key={capability.service}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-sm text-ink font-mono">{capability.service}</span>
              <span
                className={`text-xs font-semibold ${
                  capability.status === 'working'
                    ? 'text-success'
                    : capability.status === 'partial'
                      ? 'text-warning'
                      : 'text-ink-subtle'
                }`}
              >
                {CAPABILITY_LABELS[capability.status] || capability.status}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-subtle mt-3">
          A capability is marked Partial when part of it works and part of it
          needs a provider or a server that is not connected.
        </p>
      </section>

      {/* Privacy and activity */}
      <section className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <h2 className="text-xl font-bold text-ink mb-2">Privacy</h2>
        <p className="text-sm text-ink-muted mb-6">
          Your learning activity is stored in this browser and is never sent
          anywhere.
        </p>

        <label className="flex items-start gap-3 rounded-lg border border-line px-4 py-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={activity.trackingEnabled}
            onChange={(event) => handleTrackingToggle(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Record my learning activity
            </span>
            <span className="block text-xs text-ink-subtle">
              Each lesson, question and note adds one dated entry. The streak
              is calculated from those dates rather than stored as a number.
            </span>
          </span>
        </label>

        {activity.trackingEnabled ? (
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg bg-line-subtle p-4">
              <p className="text-2xl font-bold text-ink">{activity.streak}</p>
              <p className="text-xs text-ink-muted">Day streak</p>
            </div>
            <div className="rounded-lg bg-line-subtle p-4">
              <p className="text-2xl font-bold text-ink">{activity.total}</p>
              <p className="text-xs text-ink-muted">Recorded actions</p>
            </div>
            <div className="rounded-lg bg-line-subtle p-4">
              <p className="text-2xl font-bold text-ink">
                {activity.activeDays.length}
              </p>
              <p className="text-xs text-ink-muted">Active days</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-subtle mb-4">
            Activity tracking is off, so no streak or activity figures are
            shown. Turning it back on does not recover anything that was
            already deleted.
          </p>
        )}

        <button
          type="button"
          onClick={handleClearActivity}
          className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink-muted hover:bg-line-subtle transition"
        >
          Clear activity history
        </button>
      </section>

      {/* Your data */}
      <section className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <h2 className="text-xl font-bold text-ink mb-2">Your data</h2>
        <p className="text-sm text-ink-muted mb-6">
          Export everything, bring it back, or remove it. Exports never
          include your password.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-line p-5">
            <h3 className="font-semibold text-ink mb-2">Export</h3>
            <p className="text-sm text-ink-muted mb-4">
              Downloads a JSON file with every notebook, source, note, chat
              history and study material stored in this browser.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy === 'export'}
              className="px-4 py-2 bg-accent text-ink-inverse rounded-lg font-semibold hover:bg-accent-strong transition disabled:opacity-50"
            >
              {busy === 'export' ? 'Preparing…' : 'Export my data'}
            </button>
          </div>

          <div className="rounded-xl border border-line p-5">
            <h3 className="font-semibold text-ink mb-2">Import</h3>
            <p className="text-sm text-ink-muted mb-4">
              Restores a file you exported earlier. A file the app does not
              understand is refused without changing anything.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChosen}
              className="block w-full text-sm text-ink-muted mb-3"
              aria-label="Choose an export file"
            />
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="radio"
                  name="import-mode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                />
                Merge with what is here
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                Replace everything
              </label>
            </div>
            <button
              type="button"
              onClick={handleImportText}
              disabled={!importText.trim() || busy === 'import'}
              className="px-4 py-2 border border-line rounded-lg text-sm font-semibold text-ink hover:bg-line-subtle transition disabled:opacity-50"
            >
              {busy === 'import' ? 'Importing…' : 'Import from the file above'}
            </button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="bg-surface rounded-2xl shadow-lg p-8 border-2 border-danger/40">
        <h2 className="text-xl font-bold text-danger mb-2">Delete everything</h2>
        <p className="text-ink-muted mb-4">
          Removes your account and every piece of learning data stored in this
          browser. Export first if you want to keep it. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleWipe}
          className="px-6 py-3 bg-danger text-ink-inverse rounded-lg hover:bg-danger-strong font-semibold transition"
        >
          Delete all my data
        </button>
      </section>
    </div>
  );
};

export default Settings;
