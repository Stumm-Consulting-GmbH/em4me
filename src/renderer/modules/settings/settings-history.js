// 4T-000332 (Epic 3E-000060) und 4T-000555 (Epic 3E-000100): Dokument-Historie.
//
// Der App-Teil (Schalter und Zeitparameter) erscheint im Bereich
// „Verhalten", der Bereichs-Default als eigene Sektion der Gruppe
// „Aktueller Bereich"; beide teilen sich denselben Entwurfs-Zweig und
// werden über den apply-Hook des Verhaltens-Bereichs persistiert.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { updateHistoryStatus } from '../views/history-status.js';
import { persistSetting } from '../views/views.js';
import { buildSettingsRow } from './settings-shared.js';

// Spiegelt den app-weiten Teil von applyHistorySettings (Feld-Diffs gegen
// den Snapshot; die Minuten-Werte in der geklemmten Persistenz-Form). Der
// Bereichs-Default gehört zur Sektion historyArea (4T-000555).
export function dirtyHistorySettings(draft) {
  if (!draft.history) return false;
  const snap = draft.historySnapshot || {};
  const next = draft.history;
  return (
    next.enabled !== snap.enabled ||
    clampHistoryMinutes(next.maxMinutes, HISTORY_DEFAULTS.maxMinutes) !== snap.maxMinutes ||
    clampHistoryMinutes(next.inactivityMinutes, HISTORY_DEFAULTS.inactivityMinutes) !==
      snap.inactivityMinutes
  );
}

// Spiegelt den Bereichs-Teil von applyHistorySettings (4T-000555).
export function dirtyHistoryAreaSection(draft) {
  if (!draft.history) return false;
  const snap = draft.historySnapshot || {};
  return !!(draft.history.hasArea && draft.history.areaValue !== snap.areaValue);
}

// --- 4T-000332 (Epic 3E-000060): Dokument-Historie im Bereich Verhalten ----------
// App-Schalter (Default aus, PO-Entscheidung), die zwei Zeitparameter der
// Paket-Bildung und — nur bei aktivem Bereich — der Bereichs-Default aus
// der Bereichsdatei Area_Settings.mdda (dreistufig: erben/an/aus).

const HISTORY_MINUTES_MIN = 1;
const HISTORY_MINUTES_MAX = 240;
const HISTORY_DEFAULTS = { maxMinutes: 5, inactivityMinutes: 2 };

function clampHistoryMinutes(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(HISTORY_MINUTES_MIN, Math.min(HISTORY_MINUTES_MAX, Math.round(n)));
}

export async function readHistoryFromStore() {
  const enabled = !!(await api.getSetting('historyEnabled'));
  const maxMinutes = clampHistoryMinutes(
    await api.getSetting('historyMaxPacketMinutes'),
    HISTORY_DEFAULTS.maxMinutes,
  );
  const inactivityMinutes = clampHistoryMinutes(
    await api.getSetting('historyInactivityMinutes'),
    HISTORY_DEFAULTS.inactivityMinutes,
  );
  let areaInfo = { hasArea: false, value: null };
  try {
    areaInfo = (await api.getHistoryAreaDefault()) || areaInfo;
  } catch {
    /* ohne Bereichs-Info rendert der Bereich ohne Bereichs-Zeile */
  }
  return {
    enabled,
    maxMinutes,
    inactivityMinutes,
    hasArea: !!areaInfo.hasArea,
    areaValue: areaInfo.value === true || areaInfo.value === false ? areaInfo.value : null,
  };
}

export function renderHistorySettings(container, draft) {
  const values = draft.history || {
    enabled: false,
    hasArea: false,
    areaValue: null,
    ...HISTORY_DEFAULTS,
  };
  const set = (key, value) => {
    if (!draft.history) draft.history = { ...values };
    draft.history[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.history.group');
  container.appendChild(heading);

  const enabledInput = document.createElement('input');
  enabledInput.id = 'settings-history-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = values.enabled === true;
  enabledInput.addEventListener('change', () => set('enabled', enabledInput.checked));
  container.appendChild(buildSettingsRow('settings.history.enabled', enabledInput));

  const buildMinutes = (id, key, current) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.className = 'settings-input';
    input.min = String(HISTORY_MINUTES_MIN);
    input.max = String(HISTORY_MINUTES_MAX);
    input.value = String(current);
    input.addEventListener('change', () => set(key, input.value));
    return input;
  };
  container.appendChild(
    buildSettingsRow(
      'settings.history.maxPacketMinutes',
      buildMinutes('settings-history-max-minutes', 'maxMinutes', values.maxMinutes),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.history.inactivityMinutes',
      buildMinutes('settings-history-inactivity', 'inactivityMinutes', values.inactivityMinutes),
    ),
  );

  // 4T-000555 (Epic 3E-000100): Der Bereichs-Default lebt als eigene Sektion
  // „Dokument-Historie" in der Navigations-Gruppe „Aktueller Bereich"
  // (renderHistoryAreaSection) — hier bleibt der app-weite Teil.
}

// --- 4T-000555 (Epic 3E-000100): Bereichs-Sektion Dokument-Historie ---------------
// Bereichs-Default (erben/an/aus) aus der Bereichsdatei; vormals ein
// hasArea-Block innerhalb des Bereichs „Verhalten" (PO-Entscheidung E3:
// hybride Bereiche aufteilen). Liest und schreibt denselben draft.history;
// die Bereichsdatei entsteht erst beim ersten Setzen.
export function renderHistoryAreaSection(container, draft) {
  const values = draft.history;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    // Generischer Lade-Text (bewusst geteilter Key, kein Vorlagen-Bezug).
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  // Ohne Bereichs-Bindung ist die Sektion über die Navigation nicht
  // erreichbar (Gruppe fehlt); der Guard deckt den Übergangs-Moment eines
  // Bereichs-Wechsels ab.
  if (!values.hasArea) return;
  const areaSelect = document.createElement('select');
  areaSelect.id = 'settings-history-area-default';
  areaSelect.className = 'settings-input';
  for (const [value, key] of [
    ['inherit', 'settings.history.inherit'],
    ['on', 'settings.history.on'],
    ['off', 'settings.history.off'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    areaSelect.appendChild(option);
  }
  areaSelect.value =
    values.areaValue === true ? 'on' : values.areaValue === false ? 'off' : 'inherit';
  areaSelect.addEventListener('change', () => {
    values.areaValue = areaSelect.value === 'on' ? true : areaSelect.value === 'off' ? false : null;
  });
  container.appendChild(buildSettingsRow('settings.history.areaDefault', areaSelect));
}

export async function applyHistorySettings(draft) {
  if (!draft.history) return;
  const snap = draft.historySnapshot || {};
  const next = {
    ...draft.history,
    maxMinutes: clampHistoryMinutes(draft.history.maxMinutes, HISTORY_DEFAULTS.maxMinutes),
    inactivityMinutes: clampHistoryMinutes(
      draft.history.inactivityMinutes,
      HISTORY_DEFAULTS.inactivityMinutes,
    ),
  };
  if (next.enabled !== snap.enabled) await persistSetting('historyEnabled', !!next.enabled);
  if (next.maxMinutes !== snap.maxMinutes) {
    await persistSetting('historyMaxPacketMinutes', next.maxMinutes);
  }
  if (next.inactivityMinutes !== snap.inactivityMinutes) {
    await persistSetting('historyInactivityMinutes', next.inactivityMinutes);
  }
  if (next.hasArea && next.areaValue !== snap.areaValue) {
    await api.setHistoryAreaDefault(next.areaValue);
  }
  draft.history = { ...next };
  draft.historySnapshot = { ...next };
  // Wirksamkeit kann sich geaendert haben: Statusbar-Zustand nachziehen.
  void updateHistoryStatus();
}
