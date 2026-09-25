// 4T-000204 (Epic 3E-000017): Renderer-Verwaltung der erweiterten Task-States.
//
// Aufgaben des Moduls:
// - Store-Stand (electron-store-Key `taskStates`, Voll-Array) mit dem
//   Default-Set aus der shared Pipeline mergen — Default-Eintraege, die
//   im Store fehlen (z.B. nach spaeterer Set-Erweiterung), kommen mit
//   Default-Werten dazu (saubere Migration, Entscheidungs-Kriterium des
//   Tasks); Default-Labels werden bei jeder Aufloesung frisch ueber t()
//   lokalisiert.
// - Beide Pipeline-Instanzen konfigurieren: die PRELOAD-Instanz (Render-
//   Pane/Portable) via api.configureTaskStates und die Bundle-Instanz
//   (Live-Block-Widgets rendern ueber api.renderMarkdown ohnehin im
//   Preload; die hiesige configureTaskStates-Kopie dient den direkten
//   Bundle-Nutzern) — beides idempotent.
// - Vorbereitete Strukturen fuer den Live-Modus (Marker-Regex, aktive
//   Map) bereitstellen.
// - Aenderungen als DOM-Event 'scg:taskstates-changed' melden; die
//   Re-Render-/Rebuild-Hooks haengen zyklenfrei in app-init.js bzw.
//   live-widgets.js (Muster 'i18n-language-changed').
'use strict';

import { api } from './app/api.js';
import { t } from '../i18n.js';
import {
  TASK_STATE_DEFAULTS,
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  configureTaskStates,
  taskStatusType,
  taskToggleTarget,
} from '../../shared/markdown/plugins.js';

export { TASK_STATE_FORBIDDEN_CHARS, TASK_STATE_TYPES };

// Aktueller, aufgeloester Stand (inkl. lokalisierter Labels).
export let taskStatesResolved = [];

let activeMap = new Map(); // char -> { color, label }
let liveTaskMarkerRe = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)(\[[ xX]\])(?=[ \t])/;
let renderedToggleRe = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

export function activeTaskStateMap() {
  return activeMap;
}

export function getLiveTaskMarkerRe() {
  return liveTaskMarkerRe;
}

// 4T-000497: renderedToggleRe wird nicht mehr exportiert — der Toggle-Pfad
// laeuft ueber computeStatusToggle/performStatusToggle in diesem Modul.

function escapeForCharClass(ch) {
  return ch.replace(/[\\\]^-]/g, '\\$&');
}

function rebuildDerived() {
  activeMap = new Map();
  for (const s of taskStatesResolved) {
    if (!s.enabled) continue;
    // 4T-000497: Typ und Folge-Symbol wandern mit in die aktive Map
    // (Ketten-Toggle und Semantik-Hooks lesen hier).
    activeMap.set(s.char, { color: s.color, label: s.label, type: s.type, next: s.next });
  }
  const extra = [...activeMap.keys()].map(escapeForCharClass).join('');
  liveTaskMarkerRe = new RegExp(
    `^([ \\t]*(?:[-*+]|\\d+[.)])[ \\t]+)(\\[[ xX${extra}]\\])(?=[ \\t])`,
  );
  renderedToggleRe = new RegExp(`^(\\s*(?:[-*+]|\\d+[.)])\\s+\\[)([ xX${extra}])(\\])`);
}

// 4T-000497: Typ-/Folge-Symbol-Normalisierung der Migration. Bestands-
// Konfigurationen ohne die neuen Felder erhalten verhaltensneutrale
// Defaults (builtin: Typ aus dem Default-Set; custom: TODO; Folge-Symbol
// ueberall 'x' = Abschliessen wie bisher hart kodiert).
function normalizeType(type, fallback) {
  return TASK_STATE_TYPES.includes(type) ? type : fallback;
}

function normalizeNext(next) {
  const ch = typeof next === 'string' ? next : '';
  if (ch.length !== 1 || ch === '[' || ch === ']' || ch === '\\') return 'x';
  return ch;
}

// Store-Stand mit dem Default-Set mergen. Builtin-Eintraege werden ueber
// `name` identifiziert (char ist bei builtin fest); Custom-Eintraege
// werden validiert uebernommen, Kollisionen mit Default-Zeichen
// verworfen.
export function resolveStoredTaskStates(stored) {
  const list = [];
  const storedArr = Array.isArray(stored) ? stored.filter((s) => s && typeof s === 'object') : [];
  const storedBuiltinByName = new Map();
  const storedCustom = [];
  for (const s of storedArr) {
    if (s.builtin && typeof s.name === 'string') storedBuiltinByName.set(s.name, s);
    else if (!s.builtin) storedCustom.push(s);
  }
  for (const d of TASK_STATE_DEFAULTS) {
    const o = storedBuiltinByName.get(d.name);
    list.push({
      char: d.char,
      name: d.name,
      builtin: true,
      color: o && typeof o.color === 'string' ? o.color : d.color,
      enabled: o ? o.enabled !== false : d.enabled,
      label: t(`taskState.${d.name}.label`),
      type: normalizeType(o && o.type, d.type),
      next: normalizeNext(o && o.next),
    });
  }
  for (const c of storedCustom) {
    const ch = String(c.char || '');
    if (ch.length !== 1 || TASK_STATE_FORBIDDEN_CHARS.has(ch)) continue;
    if (list.some((e) => e.char === ch)) continue;
    list.push({
      char: ch,
      builtin: false,
      color: typeof c.color === 'string' ? c.color : '#888888',
      enabled: c.enabled !== false,
      label: String(c.label || ch),
      type: normalizeType(c.type, 'TODO'),
      next: normalizeNext(c.next),
    });
  }
  return list;
}

// Persistenz-Form (Voll-Array): builtin ohne Label (kommt aus i18n),
// Custom mit Freitext-Label; Typ und Folge-Symbol bei beiden (4T-000497).
export function toStoredTaskStates(resolved) {
  return resolved.map((s) =>
    s.builtin
      ? {
          char: s.char,
          name: s.name,
          builtin: true,
          color: s.color,
          enabled: s.enabled,
          type: s.type,
          next: s.next,
        }
      : {
          char: s.char,
          builtin: false,
          color: s.color,
          enabled: s.enabled,
          label: s.label,
          type: s.type,
          next: s.next,
        },
  );
}

// --- Ketten-Toggle (4T-000497) -------------------------------------------------------
// Naechster Schritt der Toggling-Kette fuer eine Zeile: Basis fest
// (' ' -> 'x' -> ' '), erweiterte Status folgen ihrem konfigurierten
// Folge-Symbol. Reine Funktion fuer Unit-Tests; liefert null, wenn die
// Zeile kein toggelbarer Task ist (Regex deckt Basis plus aktivierte
// Status-Zeichen ab).
export function computeStatusToggle(lineText) {
  const m = lineText.match(renderedToggleRe);
  if (!m) return null;
  const fromChar = m[2];
  const toChar = taskToggleTarget(fromChar);
  if (toChar == null) return null;
  return {
    offset: m[1].length,
    fromChar,
    toChar,
    fromType: taskStatusType(fromChar),
    toType: taskStatusType(toChar),
  };
}

// 4T-000498 (Epic 3E-000090): Semantik-Hook der Erweiterung "Aufgaben".
// Der registrierte Augmenter erhaelt (zeilenText, toggle) und darf den
// Toggle zu einer Zeilen-Transformation erweitern: Rueckgabe null =
// keine Erweiterung (Einzel-Zeichen-Toggle), sonst
// { lineText: string|null, insert: { text, where: 'above'|'below' }|null }
// — lineText ersetzt die ganze Zeile (Automatik-Daten), insert fuegt
// eine neue Zeile ein (Wiederholungs-Instanz, 4T-000499). Alles laeuft in
// EINER Transaktion (ein Undo-Schritt).
let statusToggleAugmenter = null;

export function setStatusToggleAugmenter(fn) {
  statusToggleAugmenter = typeof fn === 'function' ? fn : null;
}

// Gemeinsamer Toggle-Pfad beider Ansichten (Render-Pane views.js,
// Live-Modus live-widgets.js): schaltet das Status-Zeichen der Zeile auf
// das Folge-Symbol und liefert den Uebergang fuer Semantik-Hooks
// (Erledigt-/Abgebrochen-Automatik und Wiederholung ab 4T-000498/4T-000499:
// nur der Uebergang AUF einen DONE-Typ gilt als Abschluss).
export function performStatusToggle(view, lineNumber) {
  if (!view || !Number.isFinite(lineNumber)) return null;
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return null;
  const lineObj = view.state.doc.line(lineNumber);
  const lineText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const toggle = computeStatusToggle(lineText);
  if (!toggle) return null;
  // 4T-000498: Augmenter fragen (Automatik-Daten, Wiederholung). Ein
  // Fehler im Hook darf den Basis-Toggle nie verhindern.
  let augmented = null;
  if (statusToggleAugmenter) {
    try {
      augmented = statusToggleAugmenter(lineText, toggle);
    } catch (err) {
      console.warn('Status-Toggle-Augmenter fehlgeschlagen:', err);
      augmented = null;
    }
  }
  const changes = [];
  if (augmented && typeof augmented.lineText === 'string' && augmented.lineText !== lineText) {
    changes.push({ from: lineObj.from, to: lineObj.to, insert: augmented.lineText });
  } else {
    const from = lineObj.from + toggle.offset;
    changes.push({ from, to: from + 1, insert: toggle.toChar });
  }
  if (augmented && augmented.insert && typeof augmented.insert.text === 'string') {
    if (augmented.insert.where === 'below') {
      changes.push({ from: lineObj.to, insert: `\n${augmented.insert.text}` });
    } else {
      changes.push({ from: lineObj.from, insert: `${augmented.insert.text}\n` });
    }
  }
  // 4T-000484 (Epic 3E-000088): userEvent-Annotation — ohne sie verschmilzt die
  // programmatische Transaktion in der Editor-Historie mit dem vorherigen
  // Ereignis (typisch dem initialen Doc-Set beim Oeffnen); ein Undo leerte
  // dann das ganze Dokument statt nur den Toggle zurueckzunehmen.
  view.dispatch({ changes, userEvent: 'input' });
  return toggle;
}

// --- Derselbe Wechsel auf einem Text (4T-001850) -------------------------------------
//
// Die Tafel-Ansicht muss ein Verschieben und das Abhaken beim Hineinziehen in
// EINER Transaktion schreiben (Story 4S-000976): zwei Aenderungen, ein
// Rueckgaengig-Schritt. Der Weg darueber schreibt aber selbst, und zwei
// dispatch-Aufrufe waeren zwei Schritte. Gebraucht wird deshalb derselbe
// Wechsel als Text-zu-Text-Rechnung, die der Aufrufer mit seiner eigenen
// Aenderung zusammenlegt.
//
// **Es ist dieselbe Kette und keine zweite Logik**: Gerufen wird
// `performStatusToggle` selbst, ueber eine Attrappe aus genau EINER Zeile. Sie
// erfuellt den schmalen Vertrag, den jener Weg an die EditorView stellt
// (`state.doc.lines`, `doc.line`, `doc.sliceString`, `dispatch({changes})`);
// Ketten-Toggle, Augmenter der Erweiterung «Aufgaben», Automatik-Daten und die
// Wiederholung laufen damit unveraendert.
//
// **Eine Zeile genuegt**, weil der Weg nur die eine Zeile liest und nur in ihr
// und unmittelbar um sie herum schreibt. Das ist zugleich die Antwort auf die
// Zeilenenden-Frage: Ein `\r` wird vor dem Lauf abgenommen und danach an jede
// erzeugte Zeile wieder angehaengt — die Wiederholungs-Instanz erbt damit das
// Zeilenende ihrer Quelle, wie es auch der Format-Kern der Tafel tut.
function einZeilenAttrappe(zeile) {
  const zustand = { text: zeile };
  return {
    state: {
      get doc() {
        return {
          lines: 1,
          length: zustand.text.length,
          line: () => ({ from: 0, to: zustand.text.length, number: 1 }),
          sliceString: (von, bis) => zustand.text.slice(von, bis),
        };
      },
    },
    dispatch: ({ changes }) => {
      const liste = Array.isArray(changes) ? changes : [changes];
      // Von hinten nach vorn, damit die Offsets der vorderen gueltig bleiben.
      for (const c of [...liste].sort((a, b) => b.from - a.from)) {
        zustand.text =
          zustand.text.slice(0, c.from) +
          c.insert +
          zustand.text.slice(c.to == null ? c.from : c.to);
      }
    },
    text: () => zustand.text,
  };
}

/**
 * Schaltet den Status einer Zeile eines Textes — derselbe Weg wie im Editor.
 *
 * @param {string} text Ganzer Dokument-Text.
 * @param {number} lineNumber Zeilen-Nummer, 1-basiert wie im Editor.
 * @returns {{text: string, toggle: object}|null} `null`, wenn die Zeile kein
 *   schaltbarer Task ist oder es sie nicht gibt — dann bleibt der Text, wie er
 *   war, statt dass eine Vermutung entsteht.
 */
export function statusToggleAufText(text, lineNumber) {
  const quelle = String(text == null ? '' : text);
  if (!Number.isFinite(lineNumber)) return null;
  const zeilen = quelle.split('\n');
  if (lineNumber < 1 || lineNumber > zeilen.length) return null;
  const roh = zeilen[lineNumber - 1];
  const cr = roh.endsWith('\r') ? '\r' : '';
  const attrappe = einZeilenAttrappe(cr ? roh.slice(0, -1) : roh);
  const toggle = performStatusToggle(attrappe, 1);
  if (!toggle) return null;
  const neu = attrappe.text().split('\n');
  zeilen.splice(lineNumber - 1, 1, ...neu.map((z) => z + cr));
  return { text: zeilen.join('\n'), toggle };
}

// Basis-Zustaende der Darstellung: alles ausserhalb rendert als Status-Box.
export function isBasicTaskChar(ch) {
  return ch === ' ' || ch === 'x' || ch === 'X';
}

// Aufgeloesten Stand anwenden: Modul-Zustand, beide Pipeline-Instanzen,
// Event fuer Re-Render-/Rebuild-Hooks.
export function applyTaskStates(resolved) {
  taskStatesResolved = resolved;
  rebuildDerived();
  configureTaskStates(resolved);
  try {
    api.configureTaskStates(resolved);
  } catch (err) {
    console.warn('configureTaskStates (Preload) fehlgeschlagen:', err);
  }
  document.dispatchEvent(new CustomEvent('scg:taskstates-changed'));
}

// App-Start: Store lesen, aufloesen, anwenden. Broadcast-Empfaenger
// registriert app-init (synchron beim Modul-Laden, Muster onLanguageChanged).
export async function initTaskStates() {
  let stored = null;
  try {
    stored = await api.getSetting('taskStates');
  } catch (err) {
    console.warn('taskStates laden fehlgeschlagen:', err);
  }
  applyTaskStates(resolveStoredTaskStates(stored));
}

// Sprachwechsel: Default-Labels neu lokalisieren (Farben/enabled bleiben).
export function refreshTaskStateLabels() {
  applyTaskStates(resolveStoredTaskStates(toStoredTaskStates(taskStatesResolved)));
}
