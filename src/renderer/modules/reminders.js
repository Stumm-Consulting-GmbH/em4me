// 4T-000526 (Epic 3E-000095): Erinnerungs-Dialog und Snooze — die nutzer-
// sichtbare Kern-Mechanik des Erinnerungs-Systems im Renderer.
//
// Aufgaben des Moduls:
// - Faellige Anker vom Main-Pruefer entgegennehmen ('reminders:due',
//   4T-000525) und in einer Warteschlange sammeln. Die Anzeige wartet die
//   Tipp-Ruhe ab (10 Sekunden seit dem letzten Editor-Edit, Workshop-
//   Punkt 7; Zeitstempel editorActivity in app-state.js).
// - Ein Dialog-Geruest fuer Einzel-Fall, Sammel-Liste und Nachholen
//   (catchUp-Flag steuert die Ueberschrift, Punkt 6). Pro Eintrag:
//   Beschreibung, Quell-Datei-Link (oeffnet an der Zeile), Zeitpunkt,
//   Aktionen "Erledigt" und "Spaeter erinnern".
// - Erledigt laeuft ueber toggleTaskFromQuery und damit ueber dieselbe
//   Toggling-Kette wie der Klick im Dokument (Automatik-Daten,
//   Wiederholung; der ⏰-Marker wandert verschoben in die Folge-Instanz).
// - Snooze schreibt den neuen Zeitpunkt ueber setReminder direkt in den
//   Marker der Quelldatei (writeTaskHitLine: aktiver Tab per Transaktion,
//   inaktiver dirty Tab Hinweis, sonst Main-Schreibweg mit Konflikt-
//   Schutz). Optionen aus den Einstellungen plus freie Picker-Wahl.
// - Wegklicken (Escape, Backdrop, Schliessen) mutet die verbliebenen
//   Eintraege bis zum Neustart (Punkt 3); Wiederausloesung uebernimmt die
//   Ueberfaellig-Sektion des Panels (4T-000527).
// - System-Notification (Einstellung, Standard aus): nach der Tipp-Ruhe
//   und nur bei nicht fokussiertem Fenster; Anzeige im Main
//   (reminders:systemNotify), Klick holt das Fenster nach vorn.
'use strict';

import { api, $ } from './app/api.js';
import { t } from '../i18n.js';
import { state, activeTab, contextMenu, editorActivity } from './app/app-state.js';
import { paneEditors } from './editor/editor.js';
import { activeNotesEditorView } from './panels/notes-panel.js';
import { activatePane, openInPane } from './tabs/tabs.js';
import { scrollToLineAfterOpen } from './views/anchor-navigation.js';
import { showStatusbarHint } from './views/views.js';
import { toggleTaskFromQuery, writeTaskHitLine } from './task-query-actions.js';
import { parseTaskLine, serializeTaskLine, setReminder } from '../../shared/tasks/task-markers.js';
import { showDateTimePicker } from './calendar/date-picker.js';
import { appendContextMenuItem, placeContextMenuAt } from './dialogs/context-menu-utils.js';
import {
  normalizeRemindersConfig,
  snoozedReminderValue,
  localNowString,
} from '../../shared/reminders.js';
import { isExtensionActive } from './extensions/extension-lifecycle.js';

// Tipp-Ruhe vor der Anzeige (Workshop-Punkt 7, fester Wert).
const TYPING_QUIET_MS = 10000;

// --- Modul-Zustand -----------------------------------------------------------------

let modal = null;
let titleEl = null;
let listEl = null;
let closeBtn = null;

// Wartende Eintraege (key -> Item aus dem Pruefer) plus Nachhol-Flag.
const pending = new Map();
let pendingCatchUp = false;
let showTimer = null;
let dialogOpen = false;

// Zuletzt geladene Konfiguration; wird bei jeder Anzeige frisch geholt
// (kein eigener Broadcast noetig, Einstellungs-Aenderungen wirken damit
// bei der naechsten Nutzung).
let remindersConfig = normalizeRemindersConfig(null);

async function refreshConfig() {
  try {
    remindersConfig = normalizeRemindersConfig(await api.getSetting('remindersConfig'));
  } catch (err) {
    console.warn('remindersConfig laden fehlgeschlagen:', err);
  }
}

// 4T-000527: Snooze-Menue und Konfigurations-Zugriff auch fuer das Panel.
export function currentRemindersConfig() {
  return remindersConfig;
}

// --- Snooze -------------------------------------------------------------------------

// Lokalisiertes Label einer Snooze-Option (Einzahl/Mehrzahl pro Einheit).
function snoozeOptionLabel(opt) {
  const key = `reminders.snooze.${opt.unit}.${opt.amount === 1 ? 'one' : 'other'}`;
  return t(key).replace('{n}', String(opt.amount));
}

// Neuen Erinnerungs-Wert in die Quell-Zeile schreiben (gemeinsamer Weg
// von Snooze-Optionen und Picker-Wahl). true bei erfolgtem Schreiben.
async function writeReminderValue(item, value) {
  const model = parseTaskLine(item.taskText);
  if (!model) return false;
  setReminder(model, value);
  return writeTaskHitLine(
    { path: item.path, line: item.line, taskText: item.taskText },
    serializeTaskLine(model),
  );
}

// Snooze-Menue am Aufruf-Punkt: konfigurierte Optionen plus freie
// Picker-Wahl (Workshop-Punkt 4). onWritten laeuft nach erfolgreichem
// Schreiben (Dialog- und Panel-Aufrufer raeumen damit ihren Eintrag ab).
export function showSnoozeMenu(item, x, y, onWritten) {
  contextMenu.innerHTML = '';
  const nowLocal = localNowString();
  for (const opt of remindersConfig.snoozeOptions) {
    appendContextMenuItem(contextMenu, {
      label: snoozeOptionLabel(opt),
      action: async () => {
        if (await writeReminderValue(item, snoozedReminderValue(nowLocal, opt))) {
          if (onWritten) onWritten();
        }
      },
    });
  }
  appendContextMenuItem(contextMenu, {
    key: 'reminders.snooze.pick',
    action: async () => {
      const picked = await showDateTimePicker({
        x,
        y,
        date: item.date,
        time: item.time || undefined,
        dateEnabled: true,
        timeEnabled: true,
      });
      if (!picked || !picked.date) return;
      if (await writeReminderValue(item, { date: picked.date, time: picked.time || null })) {
        if (onWritten) onWritten();
      }
    },
  });
  placeContextMenuAt(contextMenu, x, y);
}

// --- Kommando "Erinnerung setzen" (4T-000528) ------------------------------------------

// Editor-Aufloesung wie die Picker-Kommandos (Muster task-dialog.js):
// Notiz-Feld hat Vorrang, sonst der Haupt-Editor der aktiven Spalte im
// Edit-Modus.
function resolveEditorView() {
  const notes = activeNotesEditorView();
  if (notes) return notes;
  const tab = activeTab();
  if (!tab || !tab.editMode || tab.viewMode === 'rendered') return null;
  return paneEditors[state.activePaneIndex];
}

// Kommando task.setReminder: Picker (Datum plus Uhrzeit) auf der Checkbox-
// Zeile unter dem Cursor; setzt oder aktualisiert den ⏰-Marker (auf einer
// Zeile mit Marker vorbelegt, sonst Default-Uhrzeit aus den Einstellungen).
// Doc-Guard gegen Blind-Schreiben, EIN Undo-Schritt.
export async function runSetReminderCommand() {
  if (!isExtensionActive('reminders') || !isExtensionActive('tasks')) return false;
  const view = resolveEditorView();
  if (!view || view.state.readOnly) return false;
  const lineObj = view.state.doc.lineAt(view.state.selection.main.head);
  const lineText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const model = parseTaskLine(lineText);
  if (!model) {
    showStatusbarHint(null, { text: t('taskDialog.notATask'), duration: 2500 });
    return false;
  }
  await refreshConfig();
  const coords = view.coordsAtPos(lineObj.from);
  const current = model.reminder;
  const picked = await showDateTimePicker({
    x: coords ? coords.left : undefined,
    y: coords ? coords.bottom + 4 : undefined,
    date: current && !current.invalid ? current.date : undefined,
    time: current && current.time ? current.time : remindersConfig.defaultTime,
    dateEnabled: true,
    timeEnabled: true,
  });
  if (!picked || !picked.date) return true;
  if (lineObj.number > view.state.doc.lines) return true;
  const nowLine = view.state.doc.line(lineObj.number);
  if (view.state.doc.sliceString(nowLine.from, nowLine.to) !== lineText) return true;
  setReminder(model, { date: picked.date, time: picked.time || null });
  view.dispatch({
    changes: { from: nowLine.from, to: nowLine.to, insert: serializeTaskLine(model) },
    userEvent: 'input',
  });
  view.focus();
  return true;
}

// --- Quell-Datei oeffnen -------------------------------------------------------------

export async function openReminderSource(item) {
  const target = state.activePaneIndex;
  activatePane(target);
  const realPane = await openInPane(target, [item.path]);
  scrollToLineAfterOpen(realPane, item.line);
}

// --- Dialog -------------------------------------------------------------------------

function hideDialog() {
  dialogOpen = false;
  pendingCatchUp = false;
  if (modal) modal.hidden = true;
}

// Wegklicken: verbliebene Eintraege muten (bis Neustart), Dialog zu.
function dismissDialog() {
  const keys = [...pending.keys()];
  pending.clear();
  hideDialog();
  if (keys.length > 0) {
    try {
      void api.remindersMute(keys);
    } catch (err) {
      console.warn('reminders:mute fehlgeschlagen:', err);
    }
  }
}

function removeItem(key) {
  pending.delete(key);
  if (pending.size === 0) hideDialog();
  else renderList();
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';
  const items = [...pending.values()].sort((a, b) =>
    a.instant < b.instant ? -1 : a.instant > b.instant ? 1 : 0,
  );
  for (const item of items) {
    const li = document.createElement('li');

    const main = document.createElement('span');
    main.className = 'reminders-item-main';
    const desc = document.createElement('span');
    desc.className = 'reminders-item-desc';
    desc.textContent = item.description || item.taskText;
    main.appendChild(desc);
    const meta = document.createElement('span');
    meta.className = 'reminders-item-meta';
    const fileLink = document.createElement('a');
    fileLink.href = '#';
    fileLink.className = 'reminders-item-file';
    fileLink.textContent = api.basename(item.path);
    fileLink.title = t('reminders.dialog.openFile');
    fileLink.addEventListener('click', (e) => {
      e.preventDefault();
      void openReminderSource(item);
    });
    meta.appendChild(fileLink);
    meta.appendChild(document.createTextNode(` · ${item.date}${item.time ? ` ${item.time}` : ''}`));
    main.appendChild(meta);
    li.appendChild(main);

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = t('reminders.dialog.done');
    doneBtn.addEventListener('click', async () => {
      await toggleTaskFromQuery({ path: item.path, line: item.line, taskText: item.taskText });
      removeItem(item.key);
    });
    li.appendChild(doneBtn);

    const snoozeBtn = document.createElement('button');
    snoozeBtn.type = 'button';
    snoozeBtn.className = 'btn';
    snoozeBtn.textContent = t('reminders.dialog.snooze');
    snoozeBtn.addEventListener('click', () => {
      const rect = snoozeBtn.getBoundingClientRect();
      showSnoozeMenu(item, rect.left, rect.bottom + 2, () => removeItem(item.key));
    });
    li.appendChild(snoozeBtn);

    listEl.appendChild(li);
  }
}

async function showDialog() {
  if (pending.size === 0) return;
  await refreshConfig();
  if (titleEl) {
    titleEl.textContent = t(
      pendingCatchUp ? 'reminders.dialog.catchUpTitle' : 'reminders.dialog.title',
    );
  }
  if (closeBtn) closeBtn.textContent = t('reminders.dialog.close');
  renderList();
  const wasOpen = dialogOpen;
  dialogOpen = true;
  if (modal) modal.hidden = false;
  // System-Notification als Zusatz-Signal, nur wenn das Fenster nicht im
  // Vordergrund steht (im Vordergrund ist der Dialog selbst das Signal).
  if (!wasOpen && remindersConfig.systemNotification && !document.hasFocus()) {
    const items = [...pending.values()];
    const body =
      items.length === 1
        ? items[0].description || items[0].taskText
        : t('reminders.notification.count').replace('{n}', String(items.length));
    try {
      void api.remindersSystemNotify({ title: t('reminders.dialog.title'), body });
    } catch (err) {
      console.warn('reminders:systemNotify fehlgeschlagen:', err);
    }
  }
  if (closeBtn) closeBtn.focus();
}

// Anzeige anstossen: offener Dialog wird ergaenzt, sonst wartet die
// Anzeige die Tipp-Ruhe ab (Timer prueft nach Ablauf erneut, weil
// zwischenzeitliches Tippen die Ruhe neu startet).
function scheduleShow() {
  if (pending.size === 0) return;
  if (dialogOpen) {
    void showDialog();
    return;
  }
  if (showTimer) return;
  const elapsed = Date.now() - editorActivity.lastDocEditAt;
  if (elapsed >= TYPING_QUIET_MS) {
    void showDialog();
    return;
  }
  showTimer = setTimeout(
    () => {
      showTimer = null;
      scheduleShow();
    },
    TYPING_QUIET_MS - elapsed + 250,
  );
}

// --- Entgegennahme ------------------------------------------------------------------

// 4T-000635: Die Anmeldung steht am **Modulkopf** und nicht in initReminders().
//
// Der Melde-Weg des Pruefers ist fire-and-forget: Der Hauptprozess sendet
// `reminders:due`, und `ipcRenderer.on` puffert nichts. War der Zuhoerer noch
// nicht angemeldet, ist die Meldung ersatzlos weg — ohne Fehler, ohne Spur.
// Angemeldet wurde er bislang tief in der asynchronen `init()`, nach dutzenden
// `await`-Schritten. Der reale Ausloeser ist die Sitzungs-Wiederherstellung mit
// gebundenem Bereich: Dort laeuft das Binden parallel zur Initialisierung, und
// der Anwender sah seine ueberfaelligen Erinnerungen nicht. Das Rennen wird mit
// wachsendem Renderer-Bundle schlechter (Messung in 4T-000372: von 10/10 grün auf
// 4/5 nach nur drei zusaetzlichen Modulen).
//
// Entgegennahme und Anzeige sind deshalb getrennt: Der frühe Zuhoerer fuellt
// nur die Sammlung; angezeigt wird erst, wenn die Dialog-Elemente gebunden
// sind. `initReminders()` holt das am Ende einmal nach.
let dialogBereit = false;

api.onRemindersDue((payload) => {
  if (!isExtensionActive('reminders') || !isExtensionActive('tasks')) return;
  if (!payload || !Array.isArray(payload.items)) return;
  for (const item of payload.items) {
    if (item && typeof item.key === 'string') pending.set(item.key, item);
  }
  if (payload.catchUp) pendingCatchUp = true;
  // Vor der Bindung bleibt es beim Puffern: showDialog() greift auf modal,
  // titleEl, listEl und closeBtn zu, die es dann noch nicht gibt.
  if (dialogBereit) scheduleShow();
});

// --- Init ---------------------------------------------------------------------------

export function initReminders() {
  modal = $('#reminders-modal');
  titleEl = $('#reminders-modal-title');
  listEl = $('#reminders-modal-list');
  closeBtn = $('#btn-reminders-close');
  if (!modal) return;

  modal.querySelector('.bookmark-modal-backdrop').addEventListener('click', dismissDialog);
  closeBtn.addEventListener('click', dismissDialog);
  // Escape in Capture-Phase am Modal (Muster task-dialog.js), damit die
  // globalen Escape-Handler nicht parallel reagieren.
  modal.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissDialog();
      }
    },
    true,
  );

  // 4T-000528: Konfigurations-Broadcast (Einstellungs-Aenderungen wirken
  // sofort auf Snooze-Menue und Default-Uhrzeit).
  if (typeof api.onRemindersConfigChanged === 'function') {
    api.onRemindersConfigChanged((cfg) => {
      remindersConfig = normalizeRemindersConfig(cfg);
    });
  }

  // 4T-000635: Ab hier sind die Dialog-Elemente gebunden. Was der Zuhoerer am
  // Modulkopf waehrend der Initialisierung gepuffert hat, wird jetzt einmal
  // nachgezogen; ohne wartende Eintraege ist der Aufruf folgenlos.
  dialogBereit = true;
  scheduleShow();

  void refreshConfig();
}
