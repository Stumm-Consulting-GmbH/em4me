// 4T-0498 (Epic 3E-0090) und 4T-0528 (Epic 3E-0095): Bereiche „Aufgaben"
// und „Erinnerungen" — beide konfigurieren das Arbeiten mit Aufgaben und
// bleiben deshalb zusammen.
'use strict';

import { SNOOZE_UNITS, normalizeRemindersConfig } from '../../../shared/reminders.js';
import { t } from '../../i18n.js';
import { showDateTimePicker } from '../calendar/date-picker.js';
import { currentRemindersConfig } from '../reminders.js';
import { applyTasksConfig, normalizeTasksConfig, tasksConfig } from '../tasks.js';
import { persistSetting } from '../views/views.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

// Spiegelt applyTasksSection (normalisierte Konfiguration gegen die
// wirksame tasksConfig).
export function dirtyTasksSection(draft) {
  if (!draft.tasks) return false;
  return !jsonEqual(normalizeTasksConfig(draft.tasks), tasksConfig);
}

// Spiegelt applyRemindersSection (normalisierte Konfiguration gegen die
// wirksame Erinnerungs-Konfiguration).
export function dirtyRemindersSection(draft) {
  if (!draft.reminders) return false;
  return !jsonEqual(normalizeRemindersConfig(draft.reminders), currentRemindersConfig());
}

// --- Bereich Aufgaben (4T-0498, Epic 3E-0090) ----------------------------------
// Global Filter (Text plus Ausblende-Option), die drei Automatik-Schalter
// (Erstellt/Erledigt/Abgebrochen) und die Einfüge-Position der neuen
// Wiederholungs-Instanz. Alle Werte leben im Entwurf (draft.tasks, eine in
// resetPageState synchron erstellte Arbeitskopie von tasksConfig); Wirkung
// erst bei Anwenden/OK (Muster Task-Status).
export function renderTasksSection(container, draft) {
  if (!draft.tasks) draft.tasks = { ...tasksConfig };
  const values = draft.tasks;

  // (a) Global Filter (Text-Eingabe) plus Erklärungs-Hinweis.
  const filterInput = document.createElement('input');
  filterInput.id = 'settings-tasks-global-filter';
  filterInput.type = 'text';
  filterInput.className = 'settings-input';
  filterInput.autocomplete = 'off';
  filterInput.spellcheck = false;
  filterInput.value = values.globalFilter || '';
  filterInput.addEventListener('input', () => {
    values.globalFilter = filterInput.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.globalFilter', filterInput));
  const filterHint = document.createElement('p');
  filterHint.className = 'settings-row-hint';
  filterHint.textContent = t('settings.tasks.globalFilterHint');
  container.appendChild(filterHint);

  // (a2) 4T-0505 (Epic 3E-0096): globale Abfrage — FROM-/WHERE-Vorgabe,
  // die jeder TASKS-Abfrage implizit vorangestellt wird.
  const globalQuery = document.createElement('textarea');
  globalQuery.id = 'settings-tasks-global-query';
  globalQuery.className = 'settings-input';
  globalQuery.rows = 2;
  globalQuery.spellcheck = false;
  globalQuery.value = values.globalQuery || '';
  globalQuery.addEventListener('input', () => {
    values.globalQuery = globalQuery.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.globalQuery', globalQuery));
  const queryHint = document.createElement('p');
  queryHint.className = 'settings-row-hint';
  queryHint.textContent = t('settings.tasks.globalQueryHint');
  container.appendChild(queryHint);

  // (b) Filter-Text in Anzeigen ausblenden.
  const hideFilter = document.createElement('input');
  hideFilter.id = 'settings-tasks-hide-filter';
  hideFilter.type = 'checkbox';
  hideFilter.checked = values.hideGlobalFilter === true;
  hideFilter.addEventListener('change', () => {
    values.hideGlobalFilter = hideFilter.checked;
  });
  container.appendChild(buildSettingsRow('settings.tasks.hideGlobalFilter', hideFilter));

  // (c) Drei Automatik-Schalter (Erstellt/Erledigt/Abgebrochen). Die Kopie
  // ist bereits normalisiert, daher spiegelt der Bool-Wert direkt den Stand.
  const buildAuto = (id, key, labelKey) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'checkbox';
    input.checked = !!values[key];
    input.addEventListener('change', () => {
      values[key] = input.checked;
    });
    container.appendChild(buildSettingsRow(labelKey, input));
  };
  buildAuto('settings-tasks-auto-created', 'autoCreated', 'settings.tasks.autoCreated');
  buildAuto('settings-tasks-auto-done', 'autoDone', 'settings.tasks.autoDone');
  buildAuto('settings-tasks-auto-cancelled', 'autoCancelled', 'settings.tasks.autoCancelled');

  // (d) Einfüge-Position der neuen Wiederholungs-Instanz.
  const insertSelect = document.createElement('select');
  insertSelect.id = 'settings-tasks-recurrence-insert';
  insertSelect.className = 'settings-input';
  for (const [value, key] of [
    ['above', 'settings.tasks.recurrenceInsert.above'],
    ['below', 'settings.tasks.recurrenceInsert.below'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    insertSelect.appendChild(option);
  }
  insertSelect.value = values.recurrenceInsert === 'below' ? 'below' : 'above';
  insertSelect.addEventListener('change', () => {
    values.recurrenceInsert = insertSelect.value;
  });
  container.appendChild(buildSettingsRow('settings.tasks.recurrenceInsert', insertSelect));

  // (e) 4T-0507 (Epic 3E-0096): Task-Zeilen-Vervollstaendigung — Mindest-
  // Tipplaenge und Vorschlagszahl (Zahl-Steuerungen mit festen Grenzen;
  // die Normalisierung klemmt zusaetzlich).
  const buildNumber = (id, key, labelKey, min, max) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.className = 'settings-input';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(values[key]);
    input.addEventListener('input', () => {
      values[key] = input.value;
    });
    container.appendChild(buildSettingsRow(labelKey, input));
  };
  buildNumber(
    'settings-tasks-ac-minlength',
    'autocompleteMinLength',
    'settings.tasks.autocompleteMinLength',
    1,
    5,
  );
  buildNumber(
    'settings-tasks-ac-max',
    'autocompleteMaxSuggestions',
    'settings.tasks.autocompleteMaxSuggestions',
    3,
    12,
  );
}

export async function applyTasksSection(draft) {
  if (!draft.tasks) return;
  const normalized = normalizeTasksConfig(draft.tasks);
  // Unveränderter Stand ist ein No-op: sonst würde JEDER OK der
  // Einstellungs-Seite einen tasksConfig-Broadcast samt Voll-Re-Render
  // aller Fenster auslösen und die Persistenz nachfolgender Sektionen
  // messbar verzögern (EW-01-Befund im Voll-Suite-Gate von 4T-0501).
  // Schlüssel-Reihenfolge ist stabil (beide Seiten aus
  // normalizeTasksConfig), der JSON-Vergleich damit verlässlich.
  if (JSON.stringify(normalized) === JSON.stringify(tasksConfig)) {
    draft.tasks = { ...normalized };
    return;
  }
  // Lokal anwenden (beide Pipeline-Instanzen, Labels, Re-Render-Event) und
  // persistieren; der settings:set-Broadcast erreicht zusätzlich alle
  // Fenster inkl. diesem (idempotent, Muster taskStates).
  applyTasksConfig(normalized);
  await persistSetting('tasksConfig', normalized);
  draft.tasks = { ...normalized };
}

// --- Bereich Erinnerungen (4T-0528, Epic 3E-0095) --------------------------------
// Default-Uhrzeit (Wert plus Aendern-Knopf ueber den Zeit-Picker, kein
// Freitext — Eingabe-Komfort-Konvention), Snooze-Optionen als editierbare
// Liste (Zahl plus Einheiten-Auswahl) und der System-Notification-Schalter.
// Werte leben im Entwurf (draft.reminders); Wirkung erst bei Anwenden/OK.
export function renderRemindersSection(container, draft) {
  if (!draft.reminders) {
    const current = currentRemindersConfig();
    draft.reminders = {
      defaultTime: current.defaultTime,
      snoozeOptions: current.snoozeOptions.map((o) => ({ ...o })),
      systemNotification: current.systemNotification,
    };
  }
  const values = draft.reminders;

  // (a) Default-Uhrzeit fuer Anker ohne Zeitanteil.
  const timeWrap = document.createElement('span');
  const timeValue = document.createElement('span');
  timeValue.id = 'settings-reminders-default-time';
  timeValue.className = 'task-dialog-date-value';
  timeValue.textContent = values.defaultTime;
  timeWrap.appendChild(timeValue);
  const timeBtn = document.createElement('button');
  timeBtn.type = 'button';
  timeBtn.className = 'btn task-dialog-date-btn';
  timeBtn.textContent = t('settings.reminders.pickTime');
  timeBtn.addEventListener('click', async () => {
    const rect = timeBtn.getBoundingClientRect();
    const picked = await showDateTimePicker({
      x: rect.left,
      y: rect.bottom + 4,
      time: values.defaultTime,
      dateEnabled: false,
      timeEnabled: true,
    });
    if (!picked || !picked.time) return;
    values.defaultTime = picked.time;
    timeValue.textContent = picked.time;
    // Mutation nach dem await — Dirty-Erkennung explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  timeWrap.appendChild(timeBtn);
  container.appendChild(buildSettingsRow('settings.reminders.defaultTime', timeWrap));
  const timeHint = document.createElement('p');
  timeHint.className = 'settings-row-hint';
  timeHint.textContent = t('settings.reminders.defaultTimeHint');
  container.appendChild(timeHint);

  // (b) Snooze-Optionen als editierbare Liste (Zahl plus Einheit; Muster
  // Regel-Editor der Vorlagen — strukturelle Aenderung baut die Liste neu).
  const listWrap = document.createElement('div');
  listWrap.id = 'settings-reminders-snooze-list';
  const rebuildList = () => {
    listWrap.innerHTML = '';
    values.snoozeOptions.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'settings-reminders-snooze-row';
      const amount = document.createElement('input');
      amount.type = 'number';
      amount.className = 'settings-input';
      amount.min = '1';
      amount.max = '999';
      amount.step = '1';
      amount.value = String(opt.amount);
      amount.addEventListener('input', () => {
        opt.amount = amount.value;
      });
      row.appendChild(amount);
      const unit = document.createElement('select');
      unit.className = 'settings-input';
      for (const u of SNOOZE_UNITS) {
        const option = document.createElement('option');
        option.value = u;
        option.textContent = t(`settings.reminders.unit.${u}`);
        unit.appendChild(option);
      }
      unit.value = opt.unit;
      unit.addEventListener('change', () => {
        opt.unit = unit.value;
      });
      row.appendChild(unit);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn task-dialog-date-btn';
      remove.textContent = '✕';
      remove.title = t('settings.reminders.snoozeRemove');
      remove.addEventListener('click', () => {
        values.snoozeOptions.splice(idx, 1);
        rebuildList();
      });
      row.appendChild(remove);
      listWrap.appendChild(row);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn task-dialog-date-btn';
    add.textContent = t('settings.reminders.snoozeAdd');
    add.addEventListener('click', () => {
      values.snoozeOptions.push({ amount: 1, unit: 'h' });
      rebuildList();
    });
    listWrap.appendChild(add);
  };
  rebuildList();
  container.appendChild(buildSettingsRow('settings.reminders.snoozeOptions', listWrap));

  // (c) System-Notification (Standard aus).
  const notify = document.createElement('input');
  notify.id = 'settings-reminders-system-notification';
  notify.type = 'checkbox';
  notify.checked = values.systemNotification === true;
  notify.addEventListener('change', () => {
    values.systemNotification = notify.checked;
  });
  container.appendChild(buildSettingsRow('settings.reminders.systemNotification', notify));
  const notifyHint = document.createElement('p');
  notifyHint.className = 'settings-row-hint';
  notifyHint.textContent = t('settings.reminders.systemNotificationHint');
  container.appendChild(notifyHint);
}

export async function applyRemindersSection(draft) {
  if (!draft.reminders) return;
  const normalized = normalizeRemindersConfig(draft.reminders);
  // No-op-Erkennung wie beim Aufgaben-Bereich (kein unnoetiger Broadcast).
  if (JSON.stringify(normalized) === JSON.stringify(currentRemindersConfig())) {
    draft.reminders = normalized;
    return;
  }
  await persistSetting('remindersConfig', normalized);
  draft.reminders = normalized;
}
