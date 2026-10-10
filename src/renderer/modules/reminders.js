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
//   inaktiver dirty Tab im ungespeicherten Stand des Reiters (seit
//   4T-001978), sonst Main-Schreibweg mit Konflikt-Schutz). Optionen aus den
//   Einstellungen plus freie Picker-Wahl.
// - Wegklicken (Escape, Backdrop, Schliessen) mutet die verbliebenen
//   Eintraege bis zum Neustart (Punkt 3); Wiederausloesung uebernimmt die
//   Ueberfaellig-Sektion des Panels (4T-000527).
// - System-Notification (Einstellung, Standard aus): nach der Tipp-Ruhe
//   und nur bei nicht fokussiertem Fenster; Anzeige im Main
//   (reminders:systemNotify), Klick holt das Fenster nach vorn.
// - 4T-001727 (Epic 3E-000305): Die Meldung steht in ALLEN Fenstern. Jede
//   Bearbeitung beansprucht sie zuerst im Hauptprozess (reminders:claim); der
//   erste Anspruch gewinnt und räumt sie über 'reminders:handled' in allen
//   Fenstern, ein verweigerter räumt sie hier ohne Meldung (E9). Scheitert
//   das Schreiben, geht der Anspruch zurück und die Erinnerung erscheint
//   erneut. Ein spät geöffnetes Fenster holt den offenen Stand nach (E10),
//   und jeder Eintrag nennt seine Herkunft (E3). Stammt die Erinnerung aus dem
//   ungespeicherten Editor eines anderen Fensters, schreibt dieses Fenster
//   (reminders:edit, Befund der Abnahme vom 2026-09-24).
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
// 4T-001775 (Epic 3E-000304): Beschriftung ohne Markdown-Endung aus der
// gemeinsamen Quelle (keine zweite Endungs-Liste).
import { fileLabelFromBasename } from '../../shared/subpages.js';
import { showDateTimePicker } from './calendar/date-picker.js';
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
} from './dialogs/context-menu-utils.js';
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

// 4T-001727: Schlüssel, die in irgendeinem Fenster bearbeitet sind. Der
// nachgeholte Stand (reminders:open) kann eine Räum-Meldung überholen; ohne
// diesen Vermerk käme eine eben geräumte Erinnerung zurück. Eine erneute
// Zustellung hebt den Vermerk auf.
const geraeumt = new Set();
// Erster Eintrag des offenen Aufschub-Menüs samt seiner Erinnerung. Das Menü
// teilt sich das Element mit allen Kontextmenüs; geschlossen wird es beim
// Räumen nur, wenn es noch dieses Menü ist.
let aufschubMenue = null;

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

// --- Anspruch und Rückgabe (4T-001727) ---------------------------------------------

// Anspruch vor jeder Bearbeitung. Verweigert heißt: Ein anderes Fenster war
// schneller; die Erinnerung verschwindet hier ohne Fehlermeldung (E9). Scheitert
// die Anfrage selbst, bleibt es beim bisherigen Verhalten eines Fensters.
async function beanspruche(item) {
  let antwort;
  try {
    antwort = await api.remindersClaim({ root: item.root || null, key: item.key });
  } catch (err) {
    console.warn('reminders:claim fehlgeschlagen:', err);
    return true;
  }
  if (antwort && antwort.granted) return true;
  raeumen([item.key]);
  return false;
}

// Das Schreiben ist gescheitert (Konflikt; der Hinweis steht bereits in der
// Statusleiste). Eine ungesicherte Datei ist seit 4T-001978 kein Grund mehr. Die Erinnerung ist damit nicht
// bearbeitet und wird allen Fenstern erneut zugestellt.
async function gibZurueck(item) {
  try {
    await api.remindersRelease({ root: item.root || null, key: item.key });
  } catch (err) {
    console.warn('reminders:release fehlgeschlagen:', err);
  }
}

// --- Schreib-Ort (4T-001727, Befund der Abnahme vom 2026-09-24) -------------------

// Der Prüfer liest den ungespeicherten Stand geöffneter Dateien mit. Stammt die
// Erinnerung aus dem Editor eines ANDEREN Fensters, steht ihre Zeile so noch
// nicht auf der Platte; dieses Fenster schriebe ins Leere und meldete «Zeile
// nicht mehr gefunden». Der Hauptprozess kennt das Fenster, dessen Stand gilt,
// und übergibt ihm den Auftrag (E4: die Aktion wirkt auf die Daten ihrer
// Herkunft). true heißt: Das andere Fenster schreibt, hier ist nichts mehr zu
// tun. Scheitert die Anfrage selbst, schreibt dieses Fenster wie bisher.
async function uebergibAnPufferFenster(item, bearbeitung) {
  try {
    const antwort = await api.remindersEdit({ item: auftragsDaten(item), bearbeitung });
    return !!(antwort && antwort.delegiert);
  } catch (err) {
    console.warn('reminders:edit fehlgeschlagen:', err);
    return false;
  }
}

// Was die Schreib-Kette des anderen Fensters braucht, mehr nicht.
function auftragsDaten(item) {
  return {
    key: item.key,
    root: item.root || null,
    path: item.path,
    line: item.line,
    taskText: item.taskText,
  };
}

// Erledigen über die Schreib-Kette DIESES Fensters. true, wenn geschrieben wurde.
function schreibeErledigt(item) {
  return toggleTaskFromQuery({ path: item.path, line: item.line, taskText: item.taskText });
}

// Auftrag aus dem Hauptprozess: Dieses Fenster hält den ungespeicherten Stand
// der Datei. Der Anspruch ist im klickenden Fenster bereits gewährt; hier wird
// nur geschrieben, genau so, als wäre hier geklickt worden. Ist die Datei hier
// ein inaktiver, geänderter Reiter, wirkt die Bearbeitung seit 4T-001978 (Epic
// 3E-000330, E10) in dessen ungespeichertem Stand und gilt als geschrieben; die
// Erinnerung geht in diesem Fall nicht mehr zurück. Scheitert es dennoch (etwa
// weil die Zeile dort nicht mehr steht; der Hinweis steht dann in der
// Statusleiste dieses Fensters), geht der Anspruch zurück, und die Erinnerung
// erscheint wieder in allen Fenstern.
async function fuehreAuftragAus(auftrag) {
  const item = auftrag && auftrag.item;
  const bearbeitung = auftrag && auftrag.bearbeitung;
  if (!item || typeof item.path !== 'string' || !bearbeitung) return;
  let ok = false;
  if (bearbeitung.art === 'erledigt') ok = await schreibeErledigt(item);
  else if (bearbeitung.art === 'aufschub' && bearbeitung.wert) {
    ok = await writeReminderValue(item, bearbeitung.wert);
  }
  if (!ok) await gibZurueck(item);
}
// Am Modulkopf angemeldet wie Zustellung und Räum-Meldung: Ein Fenster mit
// geändertem Reiter ist ohnehin fertig initialisiert.
api.onRemindersEdit?.((auftrag) => {
  void fuehreAuftragAus(auftrag);
});

// Erledigen aus Dialog und Erinnerungs-Liste: ein Weg für beide. true, wenn
// geschrieben wurde oder das Fenster mit dem ungespeicherten Stand den Auftrag
// übernommen hat.
export async function erledigeErinnerung(item) {
  if (!(await beanspruche(item))) return false;
  if (await uebergibAnPufferFenster(item, { art: 'erledigt' })) return true;
  const ok = await schreibeErledigt(item);
  if (!ok) await gibZurueck(item);
  return ok;
}

// Verschieben mit Anspruch: gemeinsamer Weg von Snooze-Optionen und Picker.
// onWritten läuft auch bei verweigertem Anspruch, weil der Aufrufer seinen
// Eintrag dann ebenso abräumt.
async function schiebeAuf(item, value, onWritten) {
  if (!(await beanspruche(item))) {
    if (onWritten) onWritten();
    return;
  }
  if (
    (await uebergibAnPufferFenster(item, { art: 'aufschub', wert: value })) ||
    (await writeReminderValue(item, value))
  ) {
    if (onWritten) onWritten();
    return;
  }
  await gibZurueck(item);
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
      action: () => schiebeAuf(item, snoozedReminderValue(nowLocal, opt), onWritten),
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
      await schiebeAuf(item, { date: picked.date, time: picked.time || null }, onWritten);
    },
  });
  aufschubMenue = { key: item.key, erster: contextMenu.firstElementChild };
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

async function oeffneAnZeile(pfad, zeile) {
  const target = state.activePaneIndex;
  activatePane(target);
  const realPane = await openInPane(target, [pfad]);
  scrollToLineAfterOpen(realPane, zeile);
}

// 4T-001727 (Epic 3E-000305): Eine Erinnerung mit Herkunft (Dialog) öffnet ihre
// Datei im Fenster ihres Bereichs; der Hauptprozess entscheidet, welches das
// ist, und holt es nach vorn. Ist es dieses Fenster, öffnet es wie bisher
// selbst. Ohne Herkunft (Erinnerungs-Liste des eigenen Bereichs) bleibt es beim
// bisherigen Weg, ebenso als Rückfall, wenn der Bereich nicht zu öffnen ist.
export async function openReminderSource(item) {
  if (item.root) {
    let antwort = null;
    try {
      antwort = await api.remindersOpenSource({
        root: item.root,
        path: item.path,
        line: item.line,
      });
    } catch (err) {
      console.warn('reminders:openSource fehlgeschlagen:', err);
    }
    if (antwort && antwort.ok && !antwort.hier) return;
  }
  await oeffneAnZeile(item.path, item.line);
}

// Auftrag aus dem Hauptprozess: Dieses Fenster gehört zum Herkunfts-Bereich
// einer in einem anderen Fenster angeklickten Erinnerung. Wie die Zustellung
// am Modulkopf angemeldet; ein eben erst geöffnetes Fenster hält den Auftrag,
// bis seine Initialisierung durch ist (oeffneWartendeQuellen).
const wartendeQuellen = [];
let quellenBereit = false;
api.onRemindersOpenSource?.((ziel) => {
  if (!ziel || typeof ziel.path !== 'string') return;
  if (quellenBereit) void oeffneAnZeile(ziel.path, ziel.line);
  else wartendeQuellen.push(ziel);
});

export async function oeffneWartendeQuellen() {
  quellenBereit = true;
  for (const ziel of wartendeQuellen.splice(0)) await oeffneAnZeile(ziel.path, ziel.line);
}

// --- Dialog -------------------------------------------------------------------------

function hideDialog() {
  dialogOpen = false;
  pendingCatchUp = false;
  if (modal) modal.hidden = true;
}

// Wegklicken: verbliebene Eintraege muten (bis Neustart), Dialog zu.
function dismissDialog() {
  // 4T-001727: je Eintrag mit seinem Bereich (E4) — das Fenster kann einen
  // anderen zeigen oder keinen.
  const keys = [...pending.values()].map((it) => ({ root: it.root || null, key: it.key }));
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

// 4T-001727: Räumen nach einer Bearbeitung, gleich in welchem Fenster (E2).
// Vor der Bindung der Dialog-Elemente genügt es, die Sammlung zu bereinigen.
function raeumen(keys) {
  let getroffen = false;
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    geraeumt.add(key);
    if (pending.delete(key)) getroffen = true;
    if (aufschubMenue && aufschubMenue.key === key) {
      if (aufschubMenue.erster && contextMenu.contains(aufschubMenue.erster)) hideContextMenu();
      aufschubMenue = null;
    }
  }
  if (!getroffen || !dialogBereit || !dialogOpen) return;
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
    // 4T-001727 (E3): Die Meldung steht auch in Fenstern anderer Bereiche und
    // nennt deshalb ihre Herkunft.
    if (item.origin) {
      const herkunft = document.createElement('span');
      herkunft.className = 'reminders-item-origin';
      herkunft.textContent = t('reminders.dialog.origin').replace('{name}', item.origin);
      meta.appendChild(herkunft);
      meta.appendChild(document.createTextNode(' · '));
    }
    const fileLink = document.createElement('a');
    fileLink.href = '#';
    fileLink.className = 'reminders-item-file';
    // 4T-001775 (Epic 3E-000304): Der Datei-Name steht ohne Markdown-Endung —
    // derselbe Eintrag soll im Dialog und im Panel nicht zwei Schreibweisen
    // tragen. Der Kurzhinweis nennt seither den vollen Pfad und behaelt den
    // bisherigen Hinweis-Text in der zweiten Zeile (Muster der
    // Start-Seiten-Zeile im Bereichs-Panel).
    fileLink.textContent = fileLabelFromBasename(api.basename(item.path));
    fileLink.title = `${item.path}\n${t('reminders.dialog.openFile')}`;
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
      if (await erledigeErinnerung(item)) removeItem(item.key);
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
      // 4T-001727 (E12): Die Schlüssel lassen den Hauptprozess die
      // Benachrichtigung je Meldung genau einmal zeigen, gleich wie viele
      // Fenster sie anfordern.
      void api.remindersSystemNotify({
        title: t('reminders.dialog.title'),
        body,
        keys: items.map((it) => it.key),
      });
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
    if (!item || typeof item.key !== 'string') continue;
    geraeumt.delete(item.key);
    pending.set(item.key, item);
  }
  if (payload.catchUp) pendingCatchUp = true;
  // Vor der Bindung bleibt es beim Puffern: showDialog() greift auf modal,
  // titleEl, listEl und closeBtn zu, die es dann noch nicht gibt.
  if (dialogBereit) scheduleShow();
});

// 4T-001727: Räum-Meldung aus dem Hauptprozess, aus demselben Grund wie die
// Zustellung am Modulkopf angemeldet.
api.onRemindersHandled((payload) => {
  if (payload && Array.isArray(payload.keys)) raeumen(payload.keys);
});

// 4T-001727 (E10): Offenen Stand nachholen — für ein Fenster, das nach dem
// Fälligwerden geöffnet wurde, und für Meldungen, die während des
// Fenster-Starts zugestellt wurden, bevor der Zuhörer bestand.
async function holeOffeneNach() {
  if (!isExtensionActive('reminders') || !isExtensionActive('tasks')) return;
  let stand;
  try {
    stand = await api.remindersOpen();
  } catch (err) {
    console.warn('reminders:open fehlgeschlagen:', err);
    return;
  }
  if (!stand || !Array.isArray(stand.items)) return;
  let neu = false;
  for (const item of stand.items) {
    if (!item || typeof item.key !== 'string') continue;
    if (geraeumt.has(item.key) || pending.has(item.key)) continue;
    pending.set(item.key, item);
    neu = true;
  }
  if (!neu) return;
  if (stand.catchUp) pendingCatchUp = true;
  scheduleShow();
}

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
  void holeOffeneNach();

  void refreshConfig();
}
