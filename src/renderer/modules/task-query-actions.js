// 4T-000504 (Epic 3E-000096): Rueckschreiben aus der Abfrage-Ansicht — die drei
// Treffer-Interaktionen der Task-Abfrage (Status-Toggle, Termin-Verschieben,
// Bearbeiten) mit definiertem Schreibweg in die Quelldateien.
//
// Schreibweg-Regeln (Muster Link-Update 3E-000062, offene Tabs werden ueber
// den Editor-Zustand aktualisiert und nie auf der Platte ueberholt):
// - Datei ist der AKTIVE Tab einer Pane: CodeMirror-Transaktion im Puffer
//   (ein Undo-Schritt); war der Tab vorher nicht dirty, wird direkt ueber
//   den regulaeren Save-Pfad gespeichert (die Abfrage zieht dann ueber den
//   Index-Watcher nach). Toggle laeuft ueber performStatusToggle und damit
//   ueber denselben Ketten-Toggle samt Automatik-Daten und Wiederholung
//   wie der Klick im Dokument.
// - 4T-001978 (Epic 3E-000330, E1 und E2): Hält ein ANDERES Fenster den
//   ungespeicherten Stand der Datei, geht der Handgriff dorthin (Kanal
//   taskQuery:edit, Besitzer-Regel im Hauptprozess wie bei den Erinnerungen)
//   und wird dort über genau diese Funktionen ausgeführt, als Änderung im
//   Editor. Auf die Platte wird nicht geschrieben, der Konflikt-Dialog
//   entsteht nicht, und auch eine nur ungespeichert vorhandene Aufgabe lässt
//   sich so bearbeiten. Scheitert die Übergabe selbst, geht es weiter wie
//   bisher (Rückfall wie bei den Erinnerungen).
// - Datei ist offen, aber INAKTIV und dirty (4T-001978, E9 und E10): Die
//   Änderung wirkt im ungespeicherten Stand des Reiters (tab.content), der
//   Reiter bleibt ungespeichert, die Platte bleibt unverändert. Bis dahin
//   stand hier nur ein Statusbar-Hinweis, mit der Begründung, der inaktive
//   Editor-Zustand sei nicht gemountet und ihn blind zu patchen wäre ein
//   zweiter Wahrheits-Stand neben dem Puffer. Die Begründung trägt nicht:
//   Für einen inaktiven Reiter IST tab.content der Puffer — es gibt keinen
//   Editor-Zustand daneben, beim Aktivieren füllt syncEditorForPane den
//   Editor aus tab.content (derselbe Weg wie handleAppendTabFromOtherWindow
//   in tabs.js). Die Zeile wird gesucht wie im Editor (erwartete Nummer, sonst
//   eindeutige Suche), das Abhaken läuft über statusToggleAufText und damit
//   über dieselbe Kette wie der Klick im Dokument; danach ziehen
//   Änderungs-Kennzeichen und Index-Overlay nach wie beim Tippen.
// - Sonst (geschlossen oder inaktiv und nicht dirty): zeilen-genaues
//   Schreiben ueber den Main (task:applyLineEdit, Konflikt-Erkennung im
//   prozessneutralen Kern); offene nicht-dirty Tabs ziehen ueber den
//   file:changed-Reload nach, dirty Tabs anderer Fenster nur noch im
//   Rückfall über den Konflikt-Dialog. Konflikte (Zeile
//   verändert/verschwunden) melden einen Statusbar-Hinweis statt blind zu
//   schreiben.
//
// Der Bearbeiten-Knopf delegiert an einen registrierbaren Handler (Dialog
// aus 4T-000506); ohne Handler oeffnet er die Quelldatei an der Zeile.
'use strict';

import { api } from './app/api.js';
import { t } from '../i18n.js';
import { state, contextMenu } from './app/app-state.js';
import { paneEditors, scheduleIndexOverlay, updateWindowTitle } from './editor/editor.js';
import { activatePane, openInPane } from './tabs/tabs.js';
import { performStatusToggle, computeStatusToggle, statusToggleAufText } from './task-states.js';
import { taskToggleAugmenter, todayIsoDate } from './tasks.js';
import {
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setStatusChar,
} from '../../shared/tasks/task-markers.js';
import { shiftIsoDateByDays, primaryDateField } from '../../shared/tasks/task-recurrence.js';
import { showDateTimePicker } from './calendar/date-picker.js';
import { scrollToLineAfterOpen } from './views/anchor-navigation.js';
import { saveTab } from './views/save-export.js';
import { renderTabbar } from './views/tabbar.js';
import { scheduleAutoSave, showStatusbarHint } from './views/views.js';
import { appendContextMenuItem, placeContextMenuAt } from './dialogs/context-menu-utils.js';

// --- Treffer-Aufloesung -------------------------------------------------------

// Offener Tab zur Quelldatei (exakter Pfad-Vergleich wie reloadFile).
function findOpenTab(path) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tab) => tab.path === path);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx, tab: state.panes[p].tabs[idx] };
  }
  return null;
}

// Ziel-Zeile: erwartete Zeilennummer zuerst, sonst eindeutige Suche (Semantik
// wie computeLineReplacement im Main). 0 = fehlt, -1 = mehrdeutig. Die Zeilen
// kommen über einen Zugriff, damit Editor-Doc und ungespeicherter Text eines
// inaktiven Reiters dieselbe Suche teilen (4T-001978).
function findLine(count, textOf, line, expectedText) {
  if (line >= 1 && line <= count && textOf(line) === expectedText) return line;
  let found = 0;
  for (let i = 1; i <= count; i++) {
    if (textOf(i) !== expectedText) continue;
    if (found) return -1;
    found = i;
  }
  return found;
}

function findDocLine(view, line, expectedText) {
  const doc = view.state.doc;
  return findLine(doc.lines, (i) => doc.line(i).text, line, expectedText);
}

function conflictHint() {
  showStatusbarHint(null, { text: t('taskQuery.conflict'), error: true, duration: 3000 });
}

// --- Ungespeicherter Stand eines inaktiven Reiters (4T-001978, E9) ------------

// Den neuen Text in den Puffer des Reiters legen und nachziehen, was beim
// Tippen der Editor-Listener nachzieht (editor.js, createEditorState):
// Änderungs-Kennzeichen samt Reiter-Leiste und Fenster-Titel, automatisches
// Speichern (nur wenn eingeschaltet, dann wie beim Tippen) und den
// Index-Overlay, über den Abfrage und andere Fenster den neuen Stand sehen.
function uebernimmInPuffer(open, text) {
  const tab = open.tab;
  tab.content = text;
  const wasDirty = !!tab.dirty;
  tab.dirty = text !== tab.originalContent;
  if (wasDirty !== tab.dirty) {
    renderTabbar(open.paneIdx);
    updateWindowTitle();
  }
  scheduleAutoSave();
  scheduleIndexOverlay(tab);
}

// Treffer-Zeile im ungespeicherten Text suchen; Konflikt-Hinweis, wenn sie
// fehlt oder mehrdeutig ist. Liefert Zeilen-Liste und 1-basierte Nummer.
function findeImPuffer(open, hit) {
  const zeilen = String(open.tab.content == null ? '' : open.tab.content).split('\n');
  const nr = findLine(zeilen.length, (i) => zeilen[i - 1], hit.line, hit.taskText);
  if (nr <= 0) {
    conflictHint();
    return null;
  }
  return { zeilen, nr };
}

// Abhaken im ungespeicherten Stand: dieselbe Kette wie der Klick im Dokument
// (statusToggleAufText ruft performStatusToggle auf dem Text, samt
// Automatik-Daten und Wiederholungs-Instanz an der eingestellten Stelle).
function togglePuffer(open, hit) {
  const fund = findeImPuffer(open, hit);
  if (!fund) return false;
  const ergebnis = statusToggleAufText(fund.zeilen.join('\n'), fund.nr);
  if (!ergebnis) return false;
  uebernimmInPuffer(open, ergebnis.text);
  return true;
}

// Neue Zeilen-Fassung im ungespeicherten Stand (Verschieben, Dialog).
function ersetzeImPuffer(open, hit, newText) {
  const fund = findeImPuffer(open, hit);
  if (!fund) return false;
  fund.zeilen.splice(fund.nr - 1, 1, String(newText));
  uebernimmInPuffer(open, fund.zeilen.join('\n'));
  return true;
}

// --- Übergabe an das Fenster des ungespeicherten Stands (4T-001978, E2) ---------

// Hält ein ANDERES Fenster den ungespeicherten Stand der Datei, bekommt es den
// Auftrag (Hauptprozess, Besitzer-Regel wie reminders:edit). true heißt: Das
// andere Fenster schreibt, hier ist nichts mehr zu tun. Scheitert die Anfrage
// selbst, schreibt dieses Fenster wie bisher (Rückfall, AK8).
async function uebergibAnPufferFenster(hit, bearbeitung) {
  if (typeof api.taskQueryEdit !== 'function') return false;
  try {
    const antwort = await api.taskQueryEdit({
      hit: { path: hit.path, line: hit.line, taskText: hit.taskText },
      bearbeitung,
    });
    return !!(antwort && antwort.delegiert);
  } catch (err) {
    console.warn('taskQuery:edit fehlgeschlagen:', err);
    return false;
  }
}

// Auftrag aus dem Hauptprozess: Dieses Fenster hält den ungespeicherten Stand.
// Ausgeführt über dieselben beiden Funktionen, genau so, als wäre hier
// geklickt worden; nur eine erneute Übergabe entfällt (kein Hin und Her).
// Scheitert es, steht der Hinweis in der Statusleiste dieses Fensters.
async function fuehreAbfrageAuftragAus(auftrag) {
  const hit = auftrag && auftrag.hit;
  const bearbeitung = auftrag && auftrag.bearbeitung;
  if (!hit || typeof hit.path !== 'string' || typeof hit.taskText !== 'string') return;
  if (!bearbeitung) return;
  const ziel = { path: hit.path, line: hit.line, taskText: hit.taskText };
  if (bearbeitung.art === 'toggle') await toggleTaskFromQuery(ziel, { uebergeben: true });
  else if (bearbeitung.art === 'zeile' && typeof bearbeitung.newText === 'string') {
    await writeTaskHitLine(ziel, bearbeitung.newText, { uebergeben: true });
  }
}
// Am Modulkopf angemeldet wie der Auftrag der Erinnerungen (reminders.js): Ein
// Fenster mit geändertem Reiter ist ohnehin fertig initialisiert.
api.onTaskQueryEdit?.((auftrag) => {
  void fuehreAbfrageAuftragAus(auftrag);
});

// Aktiver Tab seiner Pane? Nur dann ist der Editor-Zustand gemountet.
function isActiveTab(open) {
  return state.panes[open.paneIdx].activeIndex === open.tabIdx;
}

// Nach einer Puffer-Transaktion: war der Tab vorher nicht dirty, direkt
// ueber den regulaeren Save-Pfad persistieren (die Abfrage-Ansicht zieht
// dann ueber den Index-Watcher nach; ein dirty Puffer bleibt Sache des
// Nutzers — dokumentierte Semantik).
async function persistIfWasClean(open, wasDirty) {
  if (!wasDirty) await saveTab(open.paneIdx, open.tabIdx);
}

// Zeilen-Ersetzung in geschlossenen bzw. inaktiven sauberen Dateien ueber
// den Main; Konflikt-Antworten werden als Hinweis gemeldet.
async function writeLineViaMain(hit, newText, insert) {
  let res;
  try {
    res = await api.applyTaskLineEdit({
      filePath: hit.path,
      line: hit.line,
      expectedText: hit.taskText,
      newText,
      insert: insert || null,
    });
  } catch {
    res = null;
  }
  if (res && res.ok) return true;
  if (res && (res.reason === 'missing' || res.reason === 'ambiguous')) conflictHint();
  else showStatusbarHint(null, { text: t('taskQuery.writeFailed'), error: true, duration: 3000 });
  return false;
}

// --- Status-Toggle -------------------------------------------------------------

// Toggle eines Abfrage-Treffers. Aktiver Tab: derselbe Editor-Toggle-Weg wie
// der Klick im Dokument (performStatusToggle: Ketten-Toggle, Automatik-Daten,
// Wiederholung, ein Undo-Schritt). Sonst: identische Semantik ueber
// computeStatusToggle plus taskToggleAugmenter, geschrieben ueber den Main.
// 4T-001727 (Epic 3E-000305): Liefert true, wenn geschrieben wurde; der
// Erinnerungs-Dialog gibt seinen Anspruch sonst zurueck.
// 4T-001978 (Epic 3E-000330): Weiche in fester Reihenfolge — aktiver Reiter,
// Übergabe an ein anderes Fenster mit ungespeichertem Stand, inaktiver
// geänderter Reiter dieses Fensters, Platte. true auch, wenn ein anderes
// Fenster den Auftrag übernommen hat. optionen.uebergeben: Der Auftrag kam
// bereits aus dem Hauptprozess und wird nicht erneut uebergeben.
export async function toggleTaskFromQuery(hit, optionen = {}) {
  const open = findOpenTab(hit.path);
  if (open && isActiveTab(open)) {
    const view = paneEditors[open.paneIdx];
    if (!view) return false;
    const line = findDocLine(view, hit.line, hit.taskText);
    if (line <= 0) {
      conflictHint();
      return false;
    }
    const wasDirty = !!open.tab.dirty;
    if (!performStatusToggle(view, line)) return false;
    await persistIfWasClean(open, wasDirty);
    return true;
  }
  if (!optionen.uebergeben && (await uebergibAnPufferFenster(hit, { art: 'toggle' }))) {
    return true;
  }
  if (open && open.tab.dirty) return togglePuffer(open, hit);
  const toggle = computeStatusToggle(hit.taskText);
  if (!toggle) return false;
  // Augmenter zuerst (Automatik-Daten plus Wiederholungs-Instanz); ohne
  // Erweiterung liefert er null — dann nur das Einzel-Zeichen schalten.
  let augmented;
  try {
    augmented = taskToggleAugmenter(hit.taskText, toggle);
  } catch {
    augmented = null;
  }
  let newText;
  let insert = null;
  if (augmented && typeof augmented.lineText === 'string') {
    newText = augmented.lineText;
    insert = augmented.insert || null;
  } else {
    const model = parseTaskLine(hit.taskText);
    if (!model) return false;
    setStatusChar(model, toggle.toChar);
    newText = serializeTaskLine(model);
  }
  return writeLineViaMain(hit, newText, insert);
}

// --- Termin-Verschieben ---------------------------------------------------------

// Neuer Termin-Wert beim Verschieben: Basis ist der bestehende Termin,
// ueberfaellige Termine rechnen ab heute (damit "morgen" nie in der
// Vergangenheit landet); die Uhrzeit bleibt unveraendert (Querschnitt B).
export function postponedDateValue(value, mode, todayIso) {
  const base = value.date < todayIso ? todayIso : value.date;
  return { date: shiftIsoDateByDays(base, mode === 'week' ? 7 : 1), time: value.time };
}

// Neue Zeilen-Fassung eines Treffers schreiben — gemeinsamer Schreibweg
// des Verschiebe-Menues und des Bearbeitungs-Dialogs (4T-000506): aktiver
// Tab per CodeMirror-Transaktion (ein Undo-Schritt, Save nur wenn der Tab
// vorher sauber war), sonst Übergabe an ein anderes Fenster mit
// ungespeichertem Stand, inaktiver dirty Tab im eigenen Puffer (beides
// 4T-001978), sonst Main-Schreibweg. optionen wie bei toggleTaskFromQuery.
export async function writeTaskHitLine(hit, newText, optionen = {}) {
  const open = findOpenTab(hit.path);
  if (open && isActiveTab(open)) {
    const view = paneEditors[open.paneIdx];
    if (!view) return false;
    const line = findDocLine(view, hit.line, hit.taskText);
    if (line <= 0) {
      conflictHint();
      return false;
    }
    const wasDirty = !!open.tab.dirty;
    const lineObj = view.state.doc.line(line);
    view.dispatch({
      changes: { from: lineObj.from, to: lineObj.to, insert: newText },
      userEvent: 'input',
    });
    await persistIfWasClean(open, wasDirty);
    return true;
  }
  if (
    !optionen.uebergeben &&
    (await uebergibAnPufferFenster(hit, { art: 'zeile', newText: String(newText) }))
  ) {
    return true;
  }
  if (open && open.tab.dirty) return ersetzeImPuffer(open, hit, newText);
  return writeLineViaMain(hit, newText, null);
}

// Verschobene Zeile schreiben (gemeinsamer Schreibweg).
async function writePostponedLine(hit, field, nextValue) {
  const model = parseTaskLine(hit.taskText);
  if (!model) return;
  setDateField(model, field, nextValue);
  await writeTaskHitLine(hit, serializeTaskLine(model));
}

// Verschiebe-Menue am Knopf: morgen, eine Woche, freie Wahl per Picker.
export function showPostponeMenu(hit, x, y) {
  const model = parseTaskLine(hit.taskText);
  const field = model ? primaryDateField(model) : null;
  if (!field) {
    showStatusbarHint(null, { text: t('taskQuery.postpone.noDate'), duration: 2000 });
    return;
  }
  const value = model[field];
  contextMenu.innerHTML = '';
  const items = [
    {
      key: 'taskQuery.postpone.tomorrow',
      action: () =>
        writePostponedLine(hit, field, postponedDateValue(value, 'day', todayIsoDate())),
    },
    {
      key: 'taskQuery.postpone.nextWeek',
      action: () =>
        writePostponedLine(hit, field, postponedDateValue(value, 'week', todayIsoDate())),
    },
    {
      key: 'taskQuery.postpone.pick',
      action: async () => {
        const picked = await showDateTimePicker({
          x,
          y,
          date: value.date,
          time: value.time || undefined,
          dateEnabled: true,
          timeEnabled: !!value.time,
        });
        if (!picked || !picked.date) return;
        await writePostponedLine(hit, field, { date: picked.date, time: picked.time || null });
      },
    },
  ];
  for (const item of items) appendContextMenuItem(contextMenu, item);
  placeContextMenuAt(contextMenu, x, y);
}

// --- Bearbeiten ------------------------------------------------------------------

// Andock-Punkt des Task-Dialogs (4T-000506). Ohne registrierten Handler
// oeffnet der Bearbeiten-Knopf die Quelldatei an der Treffer-Zeile.
let taskEditHandler = null;

export function setTaskQueryEditHandler(fn) {
  taskEditHandler = typeof fn === 'function' ? fn : null;
}

export async function editTaskFromQuery(hit, paneIdx) {
  if (taskEditHandler) {
    await taskEditHandler(hit);
    return;
  }
  const target = typeof paneIdx === 'number' && paneIdx >= 0 ? paneIdx : state.activePaneIndex;
  activatePane(target);
  // 4T-000631 (Epic 3E-000102): Bearbeiten-Klick im Abfrage-Treffer des Dokuments
  // erbt die Gruppe (beide Aufruf-Pfade sind Dokument-Klicks: Render-Pane und
  // Live-Widget).
  const realPane = await openInPane(target, [hit.path], { inheritGroup: true });
  scrollToLineAfterOpen(realPane, hit.line);
}

// --- Klick-Dispatch ----------------------------------------------------------------

// Zentraler Einstieg beider Klick-Pfade (Render-Pane views.js, Live-Widget
// bindFrontmatterQueryClicks): behandelt Klicks auf die Aktions-Elemente
// der Task-Treffer (data-task-action) und meldet true, wenn der Klick
// verbraucht wurde.
export function handleTaskQueryAction(target, paneIdx) {
  const actionEl = target instanceof Element ? target.closest('[data-task-action]') : null;
  if (!actionEl) return false;
  const li = actionEl.closest('li.perspective-query-task');
  if (!li || !li.dataset.taskPath || !li.dataset.taskText) return false;
  const hit = {
    path: li.dataset.taskPath,
    line: parseInt(li.dataset.taskLine || '', 10) || 1,
    taskText: li.dataset.taskText,
  };
  const kind = actionEl.dataset.taskAction;
  if (kind === 'toggle') {
    void toggleTaskFromQuery(hit);
    return true;
  }
  if (kind === 'postpone') {
    const rect = actionEl.getBoundingClientRect();
    showPostponeMenu(hit, rect.left, rect.bottom + 2);
    return true;
  }
  if (kind === 'edit') {
    void editTaskFromQuery(hit, paneIdx);
    return true;
  }
  return false;
}
