// 4T-0498 (Epic 3E-0090): Renderer-Verwaltung der Erweiterung "Aufgaben".
//
// Aufgaben des Moduls:
// - Konfiguration (Store-Key `tasksConfig`: Global Filter, Ausblende-
//   Option, drei Automatik-Schalter, Einfuege-Position der Wiederholungs-
//   Instanz) laden, normalisieren und auf BEIDE Pipeline-Instanzen
//   anwenden (Preload via api.configureTaskMarkers, Bundle direkt) —
//   Muster task-states.js; Labels der Marker-Badges kommen lokalisiert
//   aus i18n und werden bei Sprachwechsel neu gesetzt.
// - Semantik-Hook am Ketten-Toggle (setStatusToggleAugmenter): nur der
//   Uebergang AUF einen DONE-Typ setzt das Erledigt-Datum, der Uebergang
//   auf CANCELLED das Abgebrochen-Datum; der Rueckweg entfernt das
//   jeweilige Datum wieder (die Zeile bleibt ueber Ketten-Zyklen sauber).
//   Alle Automatiken einzeln abschaltbar; im Aus-Zustand der Erweiterung
//   passiert nichts (Querschnitt C).
// - Erstellt-Automatik fuer die Task-Anlage (Kommando paragraph.taskList).
// - Aenderungen als DOM-Event 'scg:tasks-changed' melden; Re-Render-Hooks
//   haengen zyklenfrei in app-init.js (Muster 'scg:taskstates-changed').
'use strict';

import { api } from './app/api.js';
import { t } from '../i18n.js';
import { isExtensionActive } from './extensions/extension-lifecycle.js';
import { setStatusToggleAugmenter } from './task-states.js';
import { configureTaskMarkers } from '../../shared/markdown/plugins.js';
import {
  parseTaskLine,
  serializeTaskLine,
  setStatusChar,
  setDateField,
  modelMatchesGlobalFilter,
} from '../../shared/tasks/task-markers.js';
import { buildRecurrenceInstance } from '../../shared/tasks/task-recurrence.js';

export const TASKS_CONFIG_DEFAULTS = {
  globalFilter: '',
  hideGlobalFilter: false,
  autoCreated: false,
  autoDone: true,
  autoCancelled: true,
  recurrenceInsert: 'above',
  // 4T-0505 (Epic 3E-0096): globale Abfrage — FROM-/WHERE-Vorgabe, die
  // jeder TASKS-Abfrage implizit vorangestellt wird (Auswertung im Main).
  globalQuery: '',
  // 4T-0507 (Epic 3E-0096): Task-Zeilen-Vervollstaendigung — Mindest-
  // Tipplaenge des Trigger-Worts und maximale Vorschlagszahl.
  autocompleteMinLength: 2,
  autocompleteMaxSuggestions: 6,
};

// 4T-0507: Zahl-Einstellung auf einen ganzzahligen Bereich klemmen
// (Fehleingaben konstruktionsbedingt unmoeglich, Rest faellt auf den
// Default zurueck).
function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Aktueller, normalisierter Stand.
export let tasksConfig = { ...TASKS_CONFIG_DEFAULTS };

export function normalizeTasksConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    globalFilter: typeof src.globalFilter === 'string' ? src.globalFilter.trim() : '',
    hideGlobalFilter: !!src.hideGlobalFilter,
    autoCreated: src.autoCreated === true,
    autoDone: src.autoDone !== false,
    autoCancelled: src.autoCancelled !== false,
    recurrenceInsert: src.recurrenceInsert === 'below' ? 'below' : 'above',
    globalQuery: typeof src.globalQuery === 'string' ? src.globalQuery.trim() : '',
    autocompleteMinLength: clampInt(src.autocompleteMinLength, 1, 5, 2),
    autocompleteMaxSuggestions: clampInt(src.autocompleteMaxSuggestions, 3, 12, 6),
  };
}

// Badge-Labels lokalisiert (Tooltips der Marker-Darstellung).
function localizedMarkerLabels() {
  return {
    due: t('taskMarker.due'),
    scheduled: t('taskMarker.scheduled'),
    start: t('taskMarker.start'),
    created: t('taskMarker.created'),
    done: t('taskMarker.done'),
    cancelled: t('taskMarker.cancelled'),
    recurrence: t('taskMarker.recurrence'),
    id: t('taskMarker.id'),
    dependsOn: t('taskMarker.dependsOn'),
    reminder: t('taskMarker.reminder'),
    priority: {
      highest: t('taskMarker.priority.highest'),
      high: t('taskMarker.priority.high'),
      medium: t('taskMarker.priority.medium'),
      low: t('taskMarker.priority.low'),
      lowest: t('taskMarker.priority.lowest'),
    },
  };
}

// Normalisierten Stand anwenden: Modul-Zustand, beide Pipeline-Instanzen,
// Event fuer Re-Render-Hooks (app-init.js).
export function applyTasksConfig(raw) {
  tasksConfig = normalizeTasksConfig(raw);
  const pipelineCfg = {
    globalFilter: tasksConfig.globalFilter,
    hideGlobalFilter: tasksConfig.hideGlobalFilter,
    labels: localizedMarkerLabels(),
  };
  configureTaskMarkers(pipelineCfg);
  try {
    api.configureTaskMarkers(pipelineCfg);
  } catch (err) {
    console.warn('configureTaskMarkers (Preload) fehlgeschlagen:', err);
  }
  document.dispatchEvent(new CustomEvent('scg:tasks-changed'));
}

// Sprachwechsel: Labels neu lokalisieren (Konfiguration bleibt).
export function refreshTaskMarkerLabels() {
  applyTasksConfig(tasksConfig);
}

// Heutiges Datum als lokales ISO-Datum (Termin-Automatiken schreiben
// bewusst nur das Datum ohne Uhrzeit — referenz-identische Zeilen).
export function todayIsoDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 4T-0499 (Epic 3E-0090): Einhak-Punkt der Wiederholung. Wird beim
// DONE-Uebergang mit dem fertig datierten Modell aufgerufen und liefert
// den Zeilen-Text der neuen Instanz oder null.
let recurrenceInstanceBuilder = null;

export function setRecurrenceInstanceBuilder(fn) {
  recurrenceInstanceBuilder = typeof fn === 'function' ? fn : null;
}

// Semantik-Hook am Ketten-Toggle (Signatur siehe setStatusToggleAugmenter
// in task-states.js). Liefert null, wenn nur das Einzel-Zeichen zu
// schalten ist.
export function taskToggleAugmenter(lineText, toggle) {
  if (!isExtensionActive('tasks')) return null;
  if (toggle.fromType === 'NON_TASK' || toggle.toType === 'NON_TASK') return null;
  const model = parseTaskLine(lineText);
  if (!model) return null;
  if (!modelMatchesGlobalFilter(model, tasksConfig.globalFilter)) return null;
  const today = todayIsoDate();
  let dated = false;
  const becameDone = toggle.toType === 'DONE' && toggle.fromType !== 'DONE';
  if (tasksConfig.autoDone) {
    if (becameDone) {
      setDateField(model, 'done', { date: today });
      dated = true;
    } else if (toggle.fromType === 'DONE' && toggle.toType !== 'DONE' && model.done) {
      setDateField(model, 'done', null);
      dated = true;
    }
  }
  if (tasksConfig.autoCancelled) {
    if (toggle.toType === 'CANCELLED' && toggle.fromType !== 'CANCELLED') {
      setDateField(model, 'cancelled', { date: today });
      dated = true;
    } else if (
      toggle.fromType === 'CANCELLED' &&
      toggle.toType !== 'CANCELLED' &&
      model.cancelled
    ) {
      setDateField(model, 'cancelled', null);
      dated = true;
    }
  }
  // Wiederholung (4T-0499): nur der echte Abschluss erzeugt die naechste
  // Instanz; der Builder arbeitet auf dem bereits datierten Modell.
  let insert = null;
  if (becameDone && model.recurrence && recurrenceInstanceBuilder) {
    try {
      const instanceText = recurrenceInstanceBuilder(model);
      if (typeof instanceText === 'string' && instanceText !== '') {
        insert = { text: instanceText, where: tasksConfig.recurrenceInsert };
      }
    } catch (err) {
      console.warn('Wiederholungs-Instanz fehlgeschlagen:', err);
    }
  }
  if (!dated && !insert) return null;
  setStatusChar(model, toggle.toChar);
  return { lineText: serializeTaskLine(model), insert };
}

// Erstellt-Automatik der Task-Anlage (Kommando paragraph.taskList): haengt
// beim Umwandeln einer Zeile in eine Task-Zeile das Erstellt-Datum an.
// Nur bei aktiver Erweiterung, aktivem Schalter, passendem Global Filter
// und ohne bestehendes Erstellt-Datum.
export function withCreatedDate(lineText) {
  if (!isExtensionActive('tasks') || !tasksConfig.autoCreated) return lineText;
  const model = parseTaskLine(lineText);
  if (!model || model.created) return lineText;
  if (!modelMatchesGlobalFilter(model, tasksConfig.globalFilter)) return lineText;
  setDateField(model, 'created', { date: todayIsoDate() });
  return serializeTaskLine(model);
}

// App-Start: Store lesen, anwenden, Augmenter und Wiederholungs-Builder
// registrieren (4T-0499: Instanz-Erzeugung im Marker-Kern; Abschluss-Tag
// und Erstellt-Automatik kommen aus dem aktuellen Konfigurations-Stand).
export async function initTasks() {
  let stored = null;
  try {
    stored = await api.getSetting('tasksConfig');
  } catch (err) {
    console.warn('tasksConfig laden fehlgeschlagen:', err);
  }
  setStatusToggleAugmenter(taskToggleAugmenter);
  setRecurrenceInstanceBuilder((model) =>
    buildRecurrenceInstance(model, {
      completionDate: todayIsoDate(),
      autoCreated: tasksConfig.autoCreated,
    }),
  );
  applyTasksConfig(stored);
}
