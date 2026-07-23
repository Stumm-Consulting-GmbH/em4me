// CodeMirror-Autocomplete (Wiki-Links/Anker/Tags), Tag-Sidebar-Rendering und Funktions-Katalog-Quelle.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../i18n.js';
import { autocompletion } from '@codemirror/autocomplete';

import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
// 4T-0207 (Epic 3E-0015): Hilfe-Tab "Tastenkuerzel" wird aus der Kommando-
// Registry generiert (effektive Bindings inkl. User-Overrides).
import { COMMANDS, mergeBindings, bindingToDisplayString } from '../../shared/commands.js';
// 4T-0294 (Epic 3E-0052): Autocomplete ist eine schaltbare Erweiterung;
// die Trigger pruefen zusaetzlich den Zustand von wiki-links bzw. tags.
// Die generierte Tastenkuerzel-Seite filtert Kommandos deaktivierter
// Erweiterungen (keine toten Kuerzel-Zeilen).
import { disabledCommandIdSet } from '../../shared/extensions.js';
// 4T-0337 (Epic 3E-0061): Unterseiten — '[[/' schlaegt die Unterseiten der
// aktiven Datei vor (logische Namen in Slash-Schreibweise).
import { toLogicalName } from '../../shared/subpages.js';
import { getDisabledExtensionIds, isExtensionActive } from './extension-lifecycle.js';
import { paneEditors } from './editor.js';
import { openInPane } from './tabs.js';
// 4T-0507 (Epic 3E-0096): dritte Vervollstaendigungs-Quelle auf Task-Zeilen
// (Marker-Vorschlaege; Datums-Eintraege oeffnen den Picker aus 3E-0091).
import { tasksConfig } from './tasks.js';
import { taskStatesResolved } from './task-states.js';
import { showDateTimePicker } from './date-picker.js';
import {
  parseTaskLine,
  serializeTaskLine,
  modelMatchesGlobalFilter,
  setDateField,
  setPriority,
  setStatusChar,
  setRecurrence,
  setReminder,
  setTaskId,
  generateTaskId,
  PRIORITY_ORDER,
} from '../../shared/task-markers.js';
// 4T-0347 (Epic 3E-0062): bereichsrelative Ordner-Anzeige (gemeinsam mit dem
// Backlinks-Panel), damit gleichnamige Dateien aus verschiedenen Ordnern des
// Bereichs eindeutig unterscheidbar sind.
import { relativeDirFromRoot } from './path-format.js';

// --- Autocomplete-Quellen (4T-0057, Epic 3E-0011) ---------------------------
// Zwei Completion-Sources fuer CodeMirror: Wiki-Link (`[[…`) und Tag (`#…`).
// Beide arbeiten asynchron mit IPC-Lookups gegen den Backlinks-Index. Render-
// Limit pro Dropdown: 30 Eintraege (clientseitig nach Sortierung).

export const AUTOCOMPLETE_RENDER_LIMIT = 30;

export function paneIdxForCmView(view) {
  return paneEditors.indexOf(view);
}

export function activeFileForCmView(view) {
  const paneIdx = paneIdxForCmView(view);
  if (paneIdx < 0) return null;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return null;
  const tab = pane.tabs[pane.activeIndex];
  return tab && tab.path ? tab.path : null;
}

export async function wikiLinkCompletionSource(context) {
  // 4T-0294: Trigger nur bei aktivem Autocomplete UND aktiven Wiki-Links.
  if (!isExtensionActive('autocomplete') || !isExtensionActive('wiki-links')) return null;
  const lineObj = context.state.doc.lineAt(context.pos);
  const lineText = lineObj.text;
  const offsetInLine = context.pos - lineObj.from;
  const textBefore = lineText.slice(0, offsetInLine);

  // Sind wir in einem offenen [[-Block? Letzte [[-Position muss nach
  // letzter ]]-Position liegen.
  const lastOpen = textBefore.lastIndexOf('[[');
  if (lastOpen < 0) return null;
  const lastClose = textBefore.lastIndexOf(']]');
  if (lastClose > lastOpen) return null;

  const inner = textBefore.slice(lastOpen + 2);
  if (inner.includes('\n') || inner.includes('[')) return null;
  // Im Label-Modus (nach '|') kein Autocomplete.
  if (inner.includes('|')) return null;

  const activeFile = activeFileForCmView(context.view);
  if (!activeFile) return null;

  const hashIdx = inner.indexOf('#');

  // Anker-Modus: [[Datei#... oder [[Datei#^...
  if (hashIdx >= 0) {
    const basename = inner.slice(0, hashIdx).trim();
    const anchorSofar = inner.slice(hashIdx + 1);
    const isBlock = anchorSofar.startsWith('^');
    const anchorType = isBlock ? 'block' : 'heading';
    const anchorQuery = isBlock ? anchorSofar.slice(1) : anchorSofar;
    let result;
    try {
      result = await api.autocompleteAnchors(activeFile, basename, anchorType);
    } catch {
      return null;
    }
    if (!result || result.status !== 'ready') return null;
    const queryLower = anchorQuery.toLowerCase();
    const items = (result.suggestions || [])
      .filter((s) => !queryLower || s.toLowerCase().includes(queryLower))
      .sort((a, b) => {
        const aPrefix = a.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bPrefix = b.toLowerCase().startsWith(queryLower) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.localeCompare(b);
      })
      .slice(0, AUTOCOMPLETE_RENDER_LIMIT)
      .map((s) => ({
        label: isBlock ? '^' + s : s,
        type: 'variable',
        detail: isBlock ? t('autocomplete.detail.blockId') : t('autocomplete.detail.heading'),
      }));
    return {
      from: context.pos - anchorQuery.length,
      options: items,
      validFor: /^[\p{L}\p{N}_^/-]*$/u,
    };
  }

  // 4T-0337 (Epic 3E-0061): '[[/' — Unterseiten der aktiven Datei
  // vorschlagen (relative Schreibweise). Kandidaten sind alle Dateien,
  // deren logischer Name mit '<aktive Seite>/' beginnt; angezeigt und
  // eingefuegt wird die relative Form ('/Entwurf', '/Umsetzung/Detail').
  if (inner.startsWith('/')) {
    const relPrefix = inner;
    let result;
    try {
      result = await api.autocompleteWikiTargets(activeFile);
    } catch {
      return null;
    }
    if (!result || result.status !== 'ready') return null;
    const activeLogical = toLogicalName(
      api.basename(activeFile).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
    );
    const childPrefixLower = (activeLogical + '/').toLowerCase();
    const relPrefixLower = relPrefix.toLowerCase();
    const items = (result.suggestions || [])
      .filter((s) => s.kind === 'file' && s.name.toLowerCase().startsWith(childPrefixLower))
      .map((s) => ({ rel: '/' + s.name.slice(activeLogical.length + 1), detail: s.detail }))
      .filter((c) => c.rel.toLowerCase().includes(relPrefixLower))
      .sort((a, b) => {
        const aPrefix = a.rel.toLowerCase().startsWith(relPrefixLower) ? 0 : 1;
        const bPrefix = b.rel.toLowerCase().startsWith(relPrefixLower) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.rel.localeCompare(b.rel);
      })
      .slice(0, AUTOCOMPLETE_RENDER_LIMIT)
      .map((c) => ({
        label: c.rel,
        type: 'class',
        detail: t('autocomplete.detail.file'),
      }));
    return {
      from: context.pos - relPrefix.length,
      options: items,
      validFor: /^[^\]#|\n]*$/,
    };
  }

  // Basename-Modus: [[Prefix
  const prefix = inner;
  let result;
  try {
    result = await api.autocompleteWikiTargets(activeFile);
  } catch {
    return null;
  }
  if (!result || result.status !== 'ready') return null;
  const prefixLower = prefix.toLowerCase();
  const items = (result.suggestions || [])
    .filter((s) => !prefixLower || s.name.toLowerCase().includes(prefixLower))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(prefixLower) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(prefixLower) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      // Dateien vor Aliases bei gleichem Rang.
      if (a.kind !== b.kind) return a.kind === 'file' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, AUTOCOMPLETE_RENDER_LIMIT)
    .map((s) => ({
      label: s.name,
      type: s.kind === 'alias' ? 'keyword' : 'class',
      detail:
        s.kind === 'alias'
          ? t('autocomplete.detail.alias') + (s.detail ? ' → ' + s.detail : '')
          : t('autocomplete.detail.file'),
    }));
  return {
    from: context.pos - prefix.length,
    options: items,
    validFor: /^[\p{L}\p{N}_-]*$/u,
  };
}

export async function tagCompletionSource(context) {
  // 4T-0294: Trigger nur bei aktivem Autocomplete UND aktivem Tag-System.
  if (!isExtensionActive('autocomplete') || !isExtensionActive('tags')) return null;
  const lineObj = context.state.doc.lineAt(context.pos);
  const lineText = lineObj.text;
  const offsetInLine = context.pos - lineObj.from;
  const textBefore = lineText.slice(0, offsetInLine);

  // # darf nicht direkt in einem [[-Block stehen — sonst geht der Wiki-
  // Anker-Pfad in wikiLinkCompletionSource.
  const lastOpen = textBefore.lastIndexOf('[[');
  const lastClose = textBefore.lastIndexOf(']]');
  if (lastOpen >= 0 && lastClose < lastOpen) return null;

  // Heading-Marker am Zeilenanfang ist kein Tag-Trigger. Erkennung:
  // 1-6 Hashes plus ein Leerzeichen am Anfang der ungetrimmten Zeile.
  if (/^\s*#{1,6}\s/.test(lineText)) return null;

  // Tag-Pattern: # nach Zeilenanfang oder Nicht-Wort-Zeichen.
  const tagMatch = textBefore.match(/(?:^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_/-]*)$/u);
  if (!tagMatch) return null;

  const activeFile = activeFileForCmView(context.view);
  if (!activeFile) return null;
  const tagPrefix = tagMatch[1];
  // R5-12 (4T-0187): Ein einzelnes '#' als erstes Nicht-Whitespace der
  // Zeile ist fast immer der Beginn einer Ueberschrift — Vorschlaege erst
  // ab dem ersten Tag-Zeichen oder bei explizitem Trigger (Strg+Leertaste).
  if (!tagPrefix && !context.explicit && /^\s*#$/.test(textBefore)) return null;

  let result;
  try {
    result = await api.autocompleteTags(activeFile);
  } catch {
    return null;
  }
  if (!result || result.status !== 'ready') return null;
  const prefixLower = tagPrefix.toLowerCase();
  const items = (result.suggestions || [])
    .filter((entry) => !prefixLower || entry.tag.toLowerCase().includes(prefixLower))
    .sort((a, b) => {
      const aPrefix = a.tag.toLowerCase().startsWith(prefixLower) ? 0 : 1;
      const bPrefix = b.tag.toLowerCase().startsWith(prefixLower) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    })
    .slice(0, AUTOCOMPLETE_RENDER_LIMIT)
    .map((entry) => ({
      label: entry.tag,
      type: 'keyword',
      detail: t('autocomplete.detail.tag') + ' (' + entry.count + ')',
    }));
  return {
    from: context.pos - tagPrefix.length,
    options: items,
    validFor: /^[\p{L}\p{N}_/-]*$/u,
  };
}

// --- Task-Zeilen-Vervollstaendigung (4T-0507, Epic 3E-0096) -------------------
// Dritte Quelle: Marker-Vorschlaege auf Task-Zeilen (Workshop-Punkt 8).
// Aktiv nur bei aktiven Erweiterungen autocomplete UND tasks, auf Zeilen,
// die der Marker-Kern als Task erkennt (Global Filter respektiert), hinter
// der Status-Box. Trigger: getipptes Wort ab der konfigurierten Mindest-
// Tipplaenge (tasksConfig) bzw. explizit per Strg+Leertaste; Vorschlagszahl
// ebenfalls konfigurierbar. Datums-Eintraege oeffnen den Picker aus 3E-0091
// (keine natuerlichsprachigen Daten, PO-Entscheidung); alle Anwendungen
// laufen ueber den Marker-Kern in EINER Transaktion (das getippte Wort
// wird dabei mit ersetzt — ein Undo-Schritt).

// Zeile nach Modell-Mutation ersetzen: Basis ist der Zeilen-Text OHNE das
// getippte Wort ([wordFrom, wordTo) relativ zur Zeile); mutate arbeitet auf
// dem frisch geparsten Modell. Eine Transaktion, userEvent 'input'.
function applyTaskLineMutation(view, lineNumber, wordFrom, wordTo, mutate) {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return false;
  const lineObj = view.state.doc.line(lineNumber);
  const lineText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const stripped = lineText.slice(0, wordFrom) + lineText.slice(wordTo);
  const model = parseTaskLine(stripped);
  if (!model) return false;
  mutate(model);
  view.dispatch({
    changes: { from: lineObj.from, to: lineObj.to, insert: serializeTaskLine(model) },
    userEvent: 'input',
  });
  return true;
}

// Picker-Anwendung eines Termin-Vorschlags: erst waehlen, dann die Zeile
// ersetzen. Aendert sich das Dokument waehrend der Picker offen ist
// (Zeilen-Text weicht ab), wird nicht geschrieben (kein Blind-Schreiben).
async function applyTaskDateSuggestion(view, lineNumber, wordFrom, wordTo, field) {
  const lineObj = view.state.doc.line(lineNumber);
  const expectedText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const coords = view.coordsAtPos(Math.min(lineObj.from + wordFrom, view.state.doc.length));
  const picked = await showDateTimePicker({
    x: coords ? coords.left : undefined,
    y: coords ? coords.bottom + 4 : undefined,
    dateEnabled: true,
    timeEnabled: false,
  });
  if (!picked || !picked.date) return;
  if (lineNumber > view.state.doc.lines) return;
  const nowLine = view.state.doc.line(lineNumber);
  if (view.state.doc.sliceString(nowLine.from, nowLine.to) !== expectedText) return;
  applyTaskLineMutation(view, lineNumber, wordFrom, wordTo, (model) => {
    setDateField(model, field, { date: picked.date, time: picked.time || null });
  });
  view.focus();
}

// 4T-0528 (Epic 3E-0095): Picker-Anwendung des Erinnerungs-Vorschlags —
// wie der Termin-Weg, aber mit Uhrzeit-Teil (Melde-Zeitpunkt) und
// setReminder. Doc-Guard gegen Blind-Schreiben nach Doc-Aenderung.
async function applyTaskReminderSuggestion(view, lineNumber, wordFrom, wordTo) {
  const lineObj = view.state.doc.line(lineNumber);
  const expectedText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const coords = view.coordsAtPos(Math.min(lineObj.from + wordFrom, view.state.doc.length));
  const picked = await showDateTimePicker({
    x: coords ? coords.left : undefined,
    y: coords ? coords.bottom + 4 : undefined,
    dateEnabled: true,
    timeEnabled: true,
  });
  if (!picked || !picked.date) return;
  if (lineNumber > view.state.doc.lines) return;
  const nowLine = view.state.doc.line(lineNumber);
  if (view.state.doc.sliceString(nowLine.from, nowLine.to) !== expectedText) return;
  applyTaskLineMutation(view, lineNumber, wordFrom, wordTo, (model) => {
    setReminder(model, { date: picked.date, time: picked.time || null });
  });
  view.focus();
}

// 4T-0508: ID-Vergabe mit Eindeutigkeits-Pruefung — die Bereichs-IDs
// kommen aus der Task-Abfrage (LIST TASKS, kein eigener IPC); danach
// Zeilen-Mutation mit Doc-Guard (kein Blind-Schreiben nach Doc-Aenderung).
async function applyTaskIdSuggestion(view, lineNumber, wordFrom, wordTo) {
  const lineObj = view.state.doc.line(lineNumber);
  const expectedText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  const activeFile = activeFileForCmView(view);
  const existing = [];
  if (activeFile) {
    try {
      const payload = await api.runFrontmatterQuery(activeFile, 'LIST TASKS');
      if (payload && payload.status === 'ready' && Array.isArray(payload.files)) {
        for (const hit of payload.files) {
          const m = typeof hit.taskText === 'string' ? parseTaskLine(hit.taskText) : null;
          if (m && m.id) existing.push(m.id);
        }
      }
    } catch {
      /* Best-Effort: ohne Index-Antwort wird gegen die leere Menge geprueft */
    }
  }
  if (lineNumber > view.state.doc.lines) return;
  const nowLine = view.state.doc.line(lineNumber);
  if (view.state.doc.sliceString(nowLine.from, nowLine.to) !== expectedText) return;
  applyTaskLineMutation(view, lineNumber, wordFrom, wordTo, (m) => {
    setTaskId(m, generateTaskId(existing));
  });
  view.focus();
}

// Haeufige Wiederholungs-Muster als Vorlagen (Referenz-Regelsprache).
const TASK_RECURRENCE_TEMPLATES = [
  'every day',
  'every week',
  'every month',
  'every year',
  'every weekday',
];

export function taskMarkerCompletionSource(context) {
  if (!isExtensionActive('autocomplete') || !isExtensionActive('tasks')) return null;
  const lineObj = context.state.doc.lineAt(context.pos);
  const lineText = lineObj.text;
  const offsetInLine = context.pos - lineObj.from;
  const textBefore = lineText.slice(0, offsetInLine);

  const model = parseTaskLine(lineText);
  if (!model) return null;
  if (!modelMatchesGlobalFilter(model, tasksConfig.globalFilter)) return null;
  // Nur hinter der Status-Box (Kopf: Einzug, Aufzaehlungszeichen, [x]).
  const headLen = model.indent.length + model.bullet.length + model.bulletGap.length + 2 + 1;
  if (offsetInLine <= headLen) return null;
  // Wiki-Link- und Tag-Kontexte gehoeren den bestehenden Quellen.
  const lastOpen = textBefore.lastIndexOf('[[');
  const lastClose = textBefore.lastIndexOf(']]');
  if (lastOpen >= 0 && lastClose < lastOpen) return null;
  if (/(?:^|[^\p{L}\p{N}_#])#[\p{L}\p{N}_/-]*$/u.test(textBefore)) return null;

  const wordMatch = textBefore.match(/[\p{L}\p{N}_-]+$/u);
  const word = wordMatch ? wordMatch[0] : '';
  if (!context.explicit && word.length < tasksConfig.autocompleteMinLength) return null;
  const wordFrom = offsetInLine - word.length;
  const lineNumber = lineObj.number;

  const options = [];
  // Termine (nur fehlende Felder; die Anwendung oeffnet den Picker).
  for (const field of ['due', 'scheduled', 'start']) {
    if (model[field]) continue;
    options.push({
      label: `${t(`taskMarker.${field}`)}…`,
      type: 'function',
      detail: t('autocomplete.detail.taskDate'),
      apply: (view) => {
        void applyTaskDateSuggestion(view, lineNumber, wordFrom, offsetInLine, field);
      },
    });
  }
  // 4T-0528 (Epic 3E-0095): Erinnerung setzen (Picker mit Datum und
  // Uhrzeit; nur ohne bestehenden Anker und bei aktiver Erweiterung).
  if (!model.reminder && isExtensionActive('reminders')) {
    options.push({
      label: `${t('taskMarker.reminder')}…`,
      type: 'function',
      detail: t('autocomplete.detail.taskDate'),
      apply: (view) => {
        void applyTaskReminderSuggestion(view, lineNumber, wordFrom, offsetInLine);
      },
    });
  }
  // Prioritaet (fuenf Marker-Stufen; 'normal' hat keinen Marker).
  for (const level of PRIORITY_ORDER) {
    if (level === 'normal') continue;
    options.push({
      label: `${t('taskDialog.priority')}: ${t(`taskDialog.priority.${level}`)}`,
      type: 'keyword',
      detail: t('autocomplete.detail.taskMarker'),
      apply: (view) => {
        applyTaskLineMutation(view, lineNumber, wordFrom, offsetInLine, (m) =>
          setPriority(m, level),
        );
      },
    });
  }
  // Wiederholungs-Vorlagen.
  for (const template of TASK_RECURRENCE_TEMPLATES) {
    options.push({
      label: `${t('taskDialog.recurrence')}: ${template}`,
      type: 'keyword',
      detail: t('autocomplete.detail.taskMarker'),
      apply: (view) => {
        applyTaskLineMutation(view, lineNumber, wordFrom, offsetInLine, (m) =>
          setRecurrence(m, template),
        );
      },
    });
  }
  // Status-Wechsel (aktivierte Status der task-states-Konfiguration).
  for (const s of taskStatesResolved) {
    if (!s.enabled || s.char === model.statusChar) continue;
    options.push({
      label: `${t('taskDialog.status')}: ${s.label}`,
      type: 'keyword',
      detail: t('autocomplete.detail.taskMarker'),
      apply: (view) => {
        applyTaskLineMutation(view, lineNumber, wordFrom, offsetInLine, (m) =>
          setStatusChar(m, s.char),
        );
      },
    });
  }
  // 4T-0508: eindeutige ID erzeugen (Bereichs-IDs werden vor der Vergabe
  // abgefragt; Vorgaenger-Bezuege brauchen die Task-Suche und bleiben
  // bewusst beim Dialog). Doc-Guard wie beim Picker-Weg.
  if (!model.id) {
    options.push({
      label: t('taskDialog.generateId'),
      type: 'function',
      detail: t('autocomplete.detail.taskMarker'),
      apply: (view) => {
        void applyTaskIdSuggestion(view, lineNumber, wordFrom, offsetInLine);
      },
    });
  }

  const wordLower = word.toLowerCase();
  const filtered = wordLower
    ? options.filter((o) => o.label.toLowerCase().includes(wordLower))
    : options;
  if (filtered.length === 0) return null;
  return {
    from: lineObj.from + wordFrom,
    options: filtered.slice(0, tasksConfig.autocompleteMaxSuggestions),
    validFor: /^[\p{L}\p{N}_-]*$/u,
  };
}

// 4T-0057: Extension fuer CodeMirror. override=[...] ersetzt die Default-
// Completion-Quellen. activateOnTyping=true triggert bei jedem Wortzeichen.
// 4T-0507: dritte Quelle fuer Task-Zeilen-Marker.
export const autocompleteExtension = autocompletion({
  override: [wikiLinkCompletionSource, tagCompletionSource, taskMarkerCompletionSource],
  activateOnTyping: true,
  defaultKeymap: true,
  closeOnBlur: true,
  maxRenderedOptions: AUTOCOMPLETE_RENDER_LIMIT,
});

// 4T-0056: Render-Token pro Pane verhindert Race bei mehrfachen Triggern.
// Zwischen innerHTML='' und appendChild-Schleife liegt ein await; ohne
// Token-Check wuerden parallele renderTags-Aufrufe die Tags doppelt bis
// vierfach in den Container appenden (gleiches Phaenomen wie der
// Properties-Race in 4T-0051).
export const tagsRenderToken = [0, 0];

// R5-14 (4T-0180): letzte Tags-Payload pro Pane. Das Filter-Eingabefeld
// loeste zuvor pro Tastendruck einen IPC-Roundtrip aus, obwohl die
// Query-Filterung ohnehin clientseitig in renderTagsTreeView passiert.
// renderTagsFromCache rendert bei unveraendertem Kontext (Datei, Tag-
// Filter) direkt aus diesem Cache; jeder echte renderTags-Lauf
// aktualisiert ihn.
export const tagsPayloadCache = [null, null];

export function renderTagsFromCache(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.tagsSection) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const filePath = tab && tab.path ? tab.path : null;
  const filterTag = state.tags.filterByPane[paneIdx] || null;
  const cached = tagsPayloadCache[paneIdx];
  if (
    !cached ||
    !filePath ||
    cached.filePath !== filePath ||
    cached.filterTag !== filterTag ||
    !cached.payload ||
    cached.payload.status !== 'ready'
  ) {
    renderTags(paneIdx);
    return;
  }
  // Laufende async-Renders entwerten (gleiche Token-Mechanik wie
  // renderTags), dann synchron aus dem Cache zeichnen.
  ++tagsRenderToken[paneIdx];
  els.tagsTree.innerHTML = '';
  els.tagsFiles.hidden = true;
  els.tagsFiles.innerHTML = '';
  els.tagsStatus.hidden = true;
  els.tagsStatus.textContent = '';
  if (filterTag && cached.payload.files) {
    renderTagsFilesView(
      paneIdx,
      els,
      filterTag,
      cached.payload.files,
      cached.payload.meta && cached.payload.meta.wurzel,
    );
  } else {
    renderTagsTreeView(paneIdx, els, cached.payload.tags || []);
  }
}

export async function renderTags(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.tagsSection) return;
  const myToken = ++tagsRenderToken[paneIdx];
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const filePath = tab && tab.path ? tab.path : null;

  els.tagsTree.innerHTML = '';
  els.tagsFiles.hidden = true;
  els.tagsFiles.innerHTML = '';
  els.tagsStatus.hidden = true;
  els.tagsStatus.textContent = '';

  if (!filePath) {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.unavailable');
    return;
  }
  const filterTag = state.tags.filterByPane[paneIdx];
  let payload;
  try {
    payload = await api.requestTags(filePath, filterTag);
  } catch {
    payload = { status: 'unavailable' };
  }
  // Token-Check nach dem await: wenn zwischenzeitlich ein neuer Aufruf
  // gestartet wurde, verwerfen wir das Ergebnis dieses Aufrufs.
  if (myToken !== tagsRenderToken[paneIdx]) return;
  // R5-14 (4T-0180): Payload fuer den lokalen Filter-Pfad merken.
  tagsPayloadCache[paneIdx] = {
    filePath,
    filterTag: filterTag || null,
    payload,
  };
  // Defensiv: Container nochmals leeren, falls ein paralleler Aufruf
  // doch noch Items angehaengt hat.
  els.tagsTree.innerHTML = '';
  els.tagsFiles.innerHTML = '';
  els.tagsFiles.hidden = true;
  els.tagsStatus.hidden = true;
  els.tagsStatus.textContent = '';

  if (!payload || payload.status === 'unavailable') {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.unavailable');
    return;
  }
  if (payload.status === 'indexing') {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.indexing');
    return;
  }
  // B-21 (4T-0187): Watcher-Fehler sichtbar machen.
  if (payload.status === 'error') {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.watchError');
    return;
  }
  if (payload.status === 'oversized') {
    els.tagsStatus.hidden = false;
    const meta = payload.meta || {};
    const files = meta.fileCount || 0;
    const mb = meta.byteSize ? Math.round(meta.byteSize / (1024 * 1024)) : 0;
    const tmpl = t('tags.oversized');
    els.tagsStatus.textContent = tmpl.replace('{files}', String(files)).replace('{mb}', String(mb));
    return;
  }
  if (filterTag && payload.files) {
    renderTagsFilesView(
      paneIdx,
      els,
      filterTag,
      payload.files,
      payload.meta && payload.meta.wurzel,
    );
  } else {
    renderTagsTreeView(paneIdx, els, payload.tags || []);
  }
}

export function renderTagsTreeView(paneIdx, els, tags) {
  if (!tags || tags.length === 0) {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.empty');
    return;
  }
  const query = (state.tags.queryByPane[paneIdx] || '').trim().toLowerCase();
  const filtered = query ? tags.filter((entry) => entry.tag.toLowerCase().includes(query)) : tags;
  if (filtered.length === 0) {
    els.tagsStatus.hidden = false;
    els.tagsStatus.textContent = t('tags.noMatch');
    return;
  }
  for (const entry of filtered) {
    const item = document.createElement('div');
    item.className = 'tags-tree-item';
    // 4T-0056: Tags werden flach mit ihrem vollen Slash-Pfad angezeigt
    // (z.B. '#projekt/markdown-viewer'). Eine echte Baum-Struktur mit
    // ableitbaren Eltern-Knoten (Parent-Counts, Prefix-Filter) ist eine
    // Folge-Erweiterung und kommt in einer spaeteren Iteration.
    const name = document.createElement('span');
    name.className = 'tags-tree-name';
    name.textContent = '#' + entry.tag;
    const count = document.createElement('span');
    count.className = 'tags-tree-count';
    count.textContent = String(entry.count);
    item.appendChild(name);
    item.appendChild(count);
    item.title = entry.tag;
    item.addEventListener('click', () => {
      state.tags.filterByPane[paneIdx] = entry.tag;
      renderTags(paneIdx);
    });
    els.tagsTree.appendChild(item);
  }
}

export function renderTagsFilesView(paneIdx, els, filterTag, files, wurzel) {
  els.tagsFiles.hidden = false;
  // Header mit aktivem Tag und Back-Button.
  const header = document.createElement('div');
  header.className = 'tags-files-header';
  const label = document.createElement('span');
  label.className = 'tags-files-header-tag';
  label.textContent = '#' + filterTag;
  header.appendChild(label);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'tags-files-back';
  back.textContent = t('tags.back');
  back.addEventListener('click', () => {
    state.tags.filterByPane[paneIdx] = null;
    renderTags(paneIdx);
  });
  header.appendChild(back);
  els.tagsFiles.appendChild(header);
  // Datei-Liste.
  const list = document.createElement('div');
  list.className = 'tags-files-list';
  if (!files || files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tags-status';
    empty.textContent = t('tags.noFiles');
    list.appendChild(empty);
  } else {
    for (const filePath of files) {
      const item = document.createElement('div');
      item.className = 'tags-files-item';
      const name = document.createElement('span');
      name.className = 'tags-files-item-name';
      name.textContent = api.basename(filePath);
      item.appendChild(name);
      // 4T-0347 (Epic 3E-0062): Ordner relativ zur Index-Wurzel statt absolut,
      // damit gleichnamige Dateien im Bereich eindeutig sind; Datei direkt in
      // der Wurzel -> keine Ordner-Zeile.
      const relDir = relativeDirFromRoot(wurzel, filePath);
      if (relDir) {
        const dir = document.createElement('div');
        dir.className = 'tags-files-item-dir';
        dir.textContent = relDir;
        item.appendChild(dir);
      }
      item.title = filePath;
      item.addEventListener('click', () => openInPane(paneIdx, [filePath]));
      list.appendChild(item);
    }
  }
  els.tagsFiles.appendChild(list);
}

// --- Hilfe-Katalog ------------------------------------------------------------
// 4T-0027: Funktionen sind gruppiert nach Oberbegriffen; 4T-0216 (Epic
// 3E-0042): das Hilfe-Modal ist durch das Handbuch ersetzt — die Gruppen
// sind jetzt die kanonische Quelle der generierten Funktions-Seite
// (generateFunctionsPage in manual.js). Reihenfolge innerhalb einer
// Gruppe bestimmt die Zeilen-Reihenfolge der Tabelle; Gruppen-Titel aus
// help.group.*, Eintraege aus help.feature.* plus Kurzname-/Zugang-Keys
// (help.featureName.* / help.featureAccess.*, 4T-0212).
export const HELP_FEATURE_GROUPS = [
  {
    groupKey: 'help.group.file',
    features: [
      'help.feature.openFiles',
      'help.feature.newTab',
      // 4T-0342 (Epic 3E-0061): Unterseite anlegen und Datei umbenennen —
      // Datei-Verwaltung direkt hinter dem Anlage-Cluster.
      'help.feature.subpageCreate',
      'help.feature.renameFile',
      // 4T-0349 (Epic 3E-0062): Link-Update beim Umbenennen, direkt hinter der
      // Umbenennen-Grundfunktion.
      'help.feature.renameLinkUpdate',
      // 4T-0585 (Epic 3E-0108): Titelzeile mit Direkt-Umbenennen, direkt
      // hinter dem Umbenennen-Cluster (gleiche Datei-Operation über einen
      // neuen Bedien-Zugang).
      'help.feature.titleLine',
      // 4T-0429 (Epic 3E-0080): Vorlagen und Ordner-Regeln — Datei-Anlage-
      // Funktionen, direkt hinter dem Anlage-/Verwaltungs-Cluster.
      'help.feature.templates',
      'help.feature.templateRules',
      // 4T-0433 (Epic 3E-0081): Journale — periodische Dokumente, direkt
      // hinter dem Vorlagen-Cluster (der Anlage-Pfad koppelt an die
      // Vorlagen-Infrastruktur). 4T-0437: plus der Navigations-Block.
      'help.feature.journals',
      'help.feature.journalNav',
      'help.feature.save',
      'help.feature.autoSave',
      // 4T-0334 (Epic 3E-0060): Dokument-Historie — Protokollierung,
      // Drei-Ebenen-Schalter und Historien-Ansicht, direkt hinter dem
      // Speicher-Cluster (dokumentbezogene Persistenz).
      'help.feature.history',
      'help.feature.historyControl',
      'help.feature.historyView',
      // 4T-0360 (Epic 3E-0066): Dokument-Notizen — dokumentgebundene .mdd-Daten
      // wie die Historie, direkt hinter dem Historie-Cluster.
      'help.feature.documentNotes',
      // 4T-0366 (Epic 3E-0067): Block-Metadaten — blockgebundene .mdd-Daten,
      // direkt hinter den uebrigen Begleitdatei-Funktionen.
      'help.feature.blockMetadata',
      // 4T-0042 (Epic 3E-0008): Export 'Portables Markdown...' fuer Perspective-Tabellen.
      'help.feature.exportPortable',
      // 4T-0305 (Epic 3E-0054): PDF-Export direkt neben dem Portable-Export.
      'help.feature.exportPdf',
      'help.feature.autoReload',
      'help.feature.restoreSession',
      // 4T-0370 (Epic 3E-0068): Entwurfs-Zwischenspeicher — was ueberlebt das
      // Beenden, direkt neben der Sitzungs-Wiederherstellung.
      'help.feature.unsavedDrafts',
      'help.feature.windowState',
      // 4T-0538 (Epic 3E-0098): Arbeitsbereiche — benannte Fenster- und
      // Tab-Sammlungen, direkt hinter dem Sitzungs-/Fenster-Cluster.
      'help.feature.workspaces',
      // 4T-0604 (Epic 3E-0113): Erstellungs- und Änderungszeitpunkt — die
      // Automatik wirkt beim Speichern, deshalb im Datei-Cluster hinter den
      // Sitzungs- und Fenster-Funktionen.
      'help.feature.frontmatterTimestamps',
    ],
  },
  {
    groupKey: 'help.group.editing',
    features: [
      'help.feature.editMode',
      'help.feature.tabIndent',
      // 4T-0601 (Epic 3E-0112): Listen-Outliner — Struktur-Bearbeitung,
      // automatische Nummerierung und das Fortsetzen/Beenden beim
      // Zeilenumbruch, direkt hinter der Listen-Einrückung (dieselbe
      // Funktions-Familie).
      'help.feature.listOutline',
      'help.feature.listNumbering',
      'help.feature.listExit',
      // 4T-0074 (Epic 3E-0013): Tabellen-Editor-Komfort (Tab/Shift+Tab/Enter).
      'help.feature.tableEditor',
      // 4T-0590 (Epic 3E-0109): Tabellen-Werkzeuge (Kontextmenü-Untermenü
      // „Tabelle") direkt hinter dem Tabellen-Editor-Komfort.
      'help.feature.tableTools',
      // 4T-0209 (Epic 3E-0015): Timestamp-Kommando, hinter dem
      // Editier-Komfort-Bestand.
      'help.feature.insertTimestamp',
      // 4T-0488 (Epic 3E-0091): Datums-/Uhrzeit-Picker mit klickbaren
      // Werten, direkt hinter dem thematisch verwandten Timestamp.
      'help.feature.datePicker',
      'help.feature.search',
      'help.feature.searchReplace',
      'help.feature.linter',
      // 4T-0035 (Epic 3E-0006): perspective-table mit Querverweis auf den eigenen Tab.
      'help.feature.perspectiveTable',
      // 4T-0047 (Epic 3E-0009): Sortierung, Status-Hervorhebung, Spalten-Default.
      'help.feature.perspectiveTableExtended',
      // 4T-0052 (Epic 3E-0010): Frontmatter-Erkennung und Properties-Sidebar.
      'help.feature.frontmatter',
      'help.feature.properties',
      // 4T-0448 (Epic 3E-0083): Eigenschafts-Profile — zentrale Feld-
      // Definitionen, direkt hinter dem Properties-Editor, auf dem sie wirken.
      'help.feature.propertyProfiles',
      // 4T-0491 (Epic 3E-0093): Komplett-Übernahme der Profil-Felder, direkt
      // hinter den Eigenschafts-Profilen, auf denen sie aufsetzt.
      'help.feature.profileBulkFill',
      // 4T-0356 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query),
      // baut auf den Frontmatter-Properties auf.
      'help.feature.frontmatterQuery',
      // 4T-0406 (Epic 3E-0076): Ausbau der Abfrage-Sprache — Quellen-Auswahl,
      // Tabellen-Ausgabe sowie Sortierung/Limit/Mehrspaltigkeit als eigene
      // Katalog-Eintraege direkt hinter der Basis-Abfrage.
      'help.feature.querySources',
      'help.feature.queryTable',
      'help.feature.querySort',
      // 4T-0410 (Epic 3E-0077): Block-Abfrage (BLOCKS-Scope) direkt hinter
      // den uebrigen Abfrage-Eintraegen.
      'help.feature.queryBlocks',
      // 4T-0422 (Epic 3E-0079): Perspective Datatable — Konstrukt, Grid-
      // Bearbeitung und Ansichts-Funktionen direkt hinter dem Abfrage-
      // Cluster (nutzt dessen Ausdrucks-Sprache).
      'help.feature.datatable',
      'help.feature.datatableGrid',
      'help.feature.datatableView',
      // 4T-0415 (Epic 3E-0078): Skript-Blöcke (perspective-script) direkt
      // hinter dem Abfrage-/Datentabellen-Cluster (nutzen dessen Daten-Modell).
      'help.feature.scriptBlocks',
      // 4T-0595 (Epic 3E-0111): Inline-Berechnungen direkt hinter dem
      // Abfrage-Cluster (gleiche Ausdrucks-Sprache der Perspective-Abfrage).
      'help.feature.inlineCalc',
      // 4T-0058 (Epic 3E-0011): Block-Anker schreiben und Autocomplete fuer [[ und #.
      'help.feature.blockAnchors',
      'help.feature.autocomplete',
      // 4T-0065 (Epic 3E-0012): Markdown-Syntax-Erweiterungen.
      'help.feature.callouts',
      'help.feature.highlight',
      'help.feature.footnotes',
      // 4T-0205 (Epic 3E-0017): Markdown-Erweiterungen 0.27.0, direkt
      // hinter dem Bestands-Cluster callouts/highlight/footnotes.
      'help.feature.emoji',
      'help.feature.abbreviations',
      'help.feature.implicitFigures',
      'help.feature.imageSize',
      'help.feature.definitionLists',
      'help.feature.lineBlocks',
      'help.feature.customContainers',
      // 4T-0384 (Epic 3E-0072): Mehrspalten-Block direkt hinter dem
      // Container-Bestand (gleiche ::: -Syntax-Familie).
      'help.feature.multiColumns',
      'help.feature.subSup',
      'help.feature.insertion',
      'help.feature.headingAttributes',
      'help.feature.spoiler',
      'help.feature.criticMarkup',
      // 4T-0479 (Epic 3E-0089): %%-Kommentare direkt nach Critic Markup.
      'help.feature.comments',
      'help.feature.taskStates',
      // 4T-0500 (Epic 3E-0090): Task-Marker und Global Filter direkt hinter den Task-Status.
      'help.feature.taskMarkers',
      'help.feature.taskGlobalFilter',
      // 4T-0509 (Epic 3E-0096): Abfrage- und Komfort-Stufe des Aufgaben-
      // Ausbaus direkt hinter dem Task-Fundament.
      'help.feature.taskQuery',
      'help.feature.taskQueryActions',
      'help.feature.taskDialog',
      'help.feature.taskAutocomplete',
      'help.feature.taskDependencies',
      'help.feature.taskUrgency',
      // 4T-0529 (Epic 3E-0095): Erinnerungs-System (⏰-Melde-Marker,
      // Benachrichtigungen, Erinnerungs-Liste) direkt hinter dem
      // Aufgaben-Cluster (setzt auf den Task-Zeilen auf).
      'help.feature.reminders',
      'help.feature.reminderNotifications',
      'help.feature.reminderList',
      // 4T-0518 (Epic 3E-0092): Ereignis-Verwaltung — datums-getriebene
      // Eintrags-Pflege, direkt hinter dem Erinnerungs-Cluster (gleiche
      // Termin-Domäne); Aggregation und Verknüpfungen als eigene Einträge.
      'help.feature.events',
      'help.feature.eventsAggregation',
      'help.feature.eventsLinks',
      // 4T-0547 (Epic 3E-0097): Kalender-Systeme direkt hinter dem
      // Ereignis-Cluster (gleiche Termin-/Zeit-Domäne).
      'help.feature.customCalendars',
      // 4T-0071 (Epic 3E-0013): Code-Block Copy-Button im Render-Pane.
      'help.feature.codeCopyButton',
      // 4T-0380 (Epic 3E-0071): Editor-Kontextmenue als zentraler Editier-
      // Zugang; die einzelnen Format-/Absatz-/Einfuege-Kommandos gehen hier auf.
      'help.feature.editorContextMenu',
      // 4T-0523 (Epic 3E-0094): die nutzerdefinierte Sektion direkt hinter
      // dem Editor-Kontextmenue, dessen Ende sie bildet.
      'help.feature.contextMenuCommands',
      // 4T-0607 (Epic 3E-0114): die Format-Toolbar direkt hinter den
      // uebrigen Editier-Zugaengen (loest dieselben Format-, Absatz-,
      // Einfuege- und Link-Kommandos aus wie das Kontextmenue).
      'help.feature.formatToolbar',
      // 4T-0603 (Epic 3E-0113): Link-Einfügen in die Auswahl — Editier-
      // Automatik beim Einfügen, hinter den übrigen Editier-Zugängen.
      'help.feature.pasteLink',
    ],
  },
  {
    groupKey: 'help.group.view',
    features: [
      'help.feature.viewModes',
      // 4T-0085 (Epic 3E-0014): Live-Modus als vierter View-Modus.
      'help.feature.livePreview',
      'help.feature.sourceToggles',
      // 4T-0290 (Epic 3E-0051): dynamische Sidebar (Seite, Reihenfolge,
      // Reiter-Gruppen) — Ansicht-Eigenschaft, die Panels selbst bleiben
      // in der Navigations-Gruppe.
      'help.feature.sidebarLayout',
      // 4T-0373 (Epic 3E-0069): Darstellung der Panel-Überschriften, direkt
      // hinter der Anordnung (beides Sidebar-Konfiguration).
      'help.feature.sidebarIconHeadings',
      // 4T-0475 (Epic 3E-0088): manuell einstellbare Panel-Höhen, direkt hinter
      // der Sidebar-Anordnung (beide steuern das Layout der Seitenleiste).
      'help.feature.panelHeights',
      // 4T-0570 (Epic 3E-0104): Reihenfolge der Panel-Zugänge (Untermenü und
      // Statusbar-Leiste) — Anordnungs-Eigenschaft wie sidebarLayout/
      // panelHeights, die Panels selbst bleiben in der Navigations-Gruppe.
      'help.feature.panelToggleOrder',
      // 4T-0627 (Epic 3E-0119): benannte Sidebar-Varianten direkt hinter den
      // übrigen Anordnungs-Eigenschaften (Snapshots genau dieser Anordnung).
      'help.feature.sidebarVariants',
      // 4T-0699 (Epic 3E-0141): Ein-/Ausklappen ganzer Sidebar-Spalten direkt
      // hinter den übrigen Sidebar-Eigenschaften (Zustand über der Panel-
      // Sichtbarkeit, je Editor-Spalte).
      'help.feature.sidebarCollapse',
      // 4T-0523 (Epic 3E-0094): nutzerdefinierte Statusbar-Zugaenge direkt
      // hinter der Panel-Zugangs-Reihenfolge (gleiche Statusbar-Familie).
      'help.feature.statusbarCommandButtons',
      'help.feature.statusbarHideList',
      'help.feature.foldGutter',
      // 4T-0573 (Epic 3E-0105): dokument-gebundene Editor-Ansicht-Schalter
      // direkt hinter dem Gliederungs-Folding (gleiche Schalter-Familie).
      'help.feature.editorViewSettings',
      // 4T-0579 (Epic 3E-0106): Hervorhebung der Cursor-Zeile, direkt hinter
      // den uebrigen Editor-Ansicht-Schaltern.
      'help.feature.activeLine',
      'help.feature.zoom',
      // 4T-0384 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht
      // direkt hinter dem Zoom (beides Größen-Steuerung der Ansicht).
      'help.feature.contentWidth',
      'help.feature.settings',
      'help.feature.focusMode',
      'help.feature.typewriterScroll',
      // 4T-0072 (Epic 3E-0013): Word Count in der Statusbar mit Detail-Dialog.
      'help.feature.wordCount',
      // 4T-0372 (Epic 3E-0069): Uhr-Panel direkt hinter der Wort-Statistik —
      // beides reine Anzeige-Funktionen ohne Dokument-Bezug.
      'help.feature.clock',
      // 4T-0373 (Epic 3E-0069): die drei Zeit-Werkzeuge des Uhr-Panels
      // schließen direkt an die Uhr an.
      'help.feature.clockAlarms',
      'help.feature.clockTimers',
      // 4T-0028 (Render-Lift 0.10.0): drei neue Features im Render-Pane.
      'help.feature.codeHighlight',
      'help.feature.katex',
      'help.feature.mermaid',
      // 4T-0065 (Epic 3E-0012): Scroll-Synchronisation in der Split-Ansicht.
      'help.feature.scrollSync',
      // 4T-0285 (Epic 3E-0050): Frontmatter-Zeile im Gerenderten.
      'help.feature.frontmatterDisplay',
      'help.feature.headingNumbering',
    ],
  },
  {
    groupKey: 'help.group.navigation',
    features: [
      'help.feature.tabs',
      // 4T-0676 (Epic 3E-0130): Einfuege-Position neuer Reiter direkt hinter
      // dem Tab-Eintrag — sie gilt mit UND ohne Gruppen und steht deshalb vor
      // dem Gruppen-Eintrag.
      'help.feature.tabPlacement',
      // 4T-0462 (Epic 3E-0085): Tab-Gruppen direkt hinter dem Tab-Eintrag
      // (Struktur desselben Tab-Streifens).
      'help.feature.tabGroups',
      // 4T-0579 (Epic 3E-0106): Ecken-Form der Reiter, direkt hinter den
      // Tab-Eintraegen (dieselbe Leiste, reine Darstellungs-Option).
      'help.feature.roundedTabs',
      'help.feature.multiWindow',
      // 4T-0321 (Epic 3E-0057): logische Applikationen (Mehrfachstart).
      'help.feature.multiApp',
      // 4T-0326 (Epic 3E-0058): Bereiche und Zuletzt-geoeffnete-Bereiche.
      'help.feature.area',
      'help.feature.recentAreas',
      // 4T-0632 (Epic 3E-0102): mitgelieferte Demo-Area, direkt hinter den
      // Bereichs-Einstiegen (sie erzeugt und oeffnet einen Bereich).
      'help.feature.demoArea',
      // 4T-0329 (Epic 3E-0059): Bereichs-Panel (Ordnerbaum plus Dateiliste).
      'help.feature.areaPanel',
      // 4T-0437 (Epic 3E-0081): Kalender-Panel der Journale, direkt hinter
      // dem Bereichs-Panel (beide bereichsgebundene Einstiegs-Panels).
      'help.feature.journalCalendar',
      'help.feature.outline',
      'help.feature.backlinks',
      // 4T-0073 (Epic 3E-0013): Outgoing-Links-Sidebar.
      'help.feature.outgoingLinks',
      // 4T-0457 (Epic 3E-0084): Graphenansicht — beide Formen direkt hinter
      // den Link-Beziehungs-Panels (Backlinks/Outgoing-Links).
      'help.feature.areaGraph',
      'help.feature.fileGraph',
      // 4T-0052 (Epic 3E-0010): Aliases als alternative Wiki-Link-Ziele.
      'help.feature.aliases',
      // 4T-0058 (Epic 3E-0011): Wiki-Link-Anker, Wiki-Embeds und Tag-System.
      'help.feature.wikiLinkAnchors',
      'help.feature.wikiEmbeds',
      // 4T-0342 (Epic 3E-0061): Unterseiten direkt im Vernetzungs-Cluster
      // hinter Wiki-Links/Embeds.
      'help.feature.subpages',
      'help.feature.subpagesNavigation',
      'help.feature.tags',
      'help.feature.anchorLinks',
      'help.feature.links',
      // 4T-0075/4T-0078/4T-0079 (Epic 3E-0013): Lesezeichen-Sidebar mit
      // Tree-Struktur, Ordnern und Drag-and-Drop.
      'help.feature.bookmarks',
    ],
  },
  {
    groupKey: 'help.group.general',
    features: [
      'help.feature.theme',
      // 4T-0467 (Epic 3E-0086): Farbschemas neben Theme (app-weite Darstellung).
      'help.feature.colorSchemes',
      'help.feature.languages',
      'help.feature.menuBar',
      // 4T-0209 (Epic 3E-0015): konfigurierbare Tastenkuerzel als
      // app-weite Eigenschaft, neben Theme/Sprachen/Menueleiste.
      'help.feature.customHotkeys',
      // 4T-0523 (Epic 3E-0094): Makros als app-weite Bedien-Eigenschaft
      // neben den konfigurierbaren Tastenkuerzeln (Registrierungs-Kniff:
      // jedes Makro ist ein regulaeres Kommando).
      'help.feature.macros',
      // 4T-0296 (Epic 3E-0052): das Erweiterungs-System als app-weite
      // Eigenschaft (Schalten interner Erweiterungen).
      'help.feature.extensions',
      // 4T-0301 (Epic 3E-0053): externe Erweiterungen (Installieren,
      // Vertrauens-Ablauf, Erweiterungs-API) direkt neben dem internen
      // Erweiterungs-Eintrag.
      'help.feature.extensionsExternal',
      // 4T-0216 (Epic 3E-0042): das Handbuch selbst als Katalog-Eintrag.
      'help.feature.manual',
    ],
  },
];

// Shortcuts-Tabelle (4T-0207, Epic 3E-0015): wird aus der Kommando-
// Registry mit den effektiven Bindings generiert (User-Overrides aus den
// Einstellungen erscheinen damit automatisch korrekt). Registry-Eintraege
// mit gleichem descKey buendeln in eine Zeile (z.B. Strg+1/2/3 ->
// viewModes); Kommandos ohne Binding erscheinen nicht. Die statische
// Rest-Liste traegt die bewusst nicht konfigurierbaren Bindings (Esc-
// Kaskade, Alt-Menue, Tab-Indent, Maus, Such-Enter) hinter den
// generierten Zeilen. Die frueher hier gepflegte HELP_SHORTCUTS-Konstante
// (zuletzt 34 Eintraege) ist damit entfallen.
export const STATIC_HELP_SHORTCUTS = [
  { keys: ['Strg+Mausrad'], descKey: 'help.shortcut.zoomWheel' },
  { keys: ['Tab', 'Umschalt+Tab'], descKey: 'help.shortcut.tabIndent' },
  { keys: ['Mittlere Maustaste'], descKey: 'help.shortcut.middleClickClose' },
  { keys: ['Enter', 'Umschalt+Enter'], descKey: 'help.shortcut.searchNavEnter' },
  // K-16 (4T-0191): "Alle ersetzen" im Ersetzen-Feld.
  { keys: ['Umschalt+Enter', 'Alt+Enter'], descKey: 'help.shortcut.replaceAll' },
  { keys: ['Esc'], descKey: 'help.shortcut.escape' },
  { keys: ['Alt'], descKey: 'help.shortcut.menuBar' },
];

export function buildHelpShortcutRows() {
  const effective = mergeBindings(state.hotkeyOverrides);
  // 4T-0294: Kommandos effektiv deaktivierter Erweiterungen erscheinen
  // nicht (die generierte Handbuch-Seite zeigt keine toten Kuerzel).
  const disabledCommands = disabledCommandIdSet(getDisabledExtensionIds());
  const rows = [];
  const rowByDescKey = new Map();
  for (const cmd of COMMANDS) {
    if (!cmd.descKey) continue;
    if (disabledCommands.has(cmd.id)) continue;
    const bindings = effective[cmd.id] || [];
    if (bindings.length === 0) continue;
    let row = rowByDescKey.get(cmd.descKey);
    if (!row) {
      row = { keys: [], descKey: cmd.descKey };
      rowByDescKey.set(cmd.descKey, row);
      rows.push(row);
    }
    for (const binding of bindings) {
      const display = bindingToDisplayString(binding);
      if (display && !row.keys.includes(display)) row.keys.push(display);
    }
  }
  return [...rows, ...STATIC_HELP_SHORTCUTS];
}

// Da Tastennamen je nach Sprache anders aussehen ("Strg" vs. "Ctrl",
// "Umschalt" vs. "Shift", "Mittlere Maustaste" vs. "Middle click"), liefern wir
// die Tasten auch ueber i18n-Keys, mit deutschen Defaults als Fallback.
export const KEY_LABEL_KEY = {
  Strg: 'help.key.ctrl',
  Umschalt: 'help.key.shift',
  Alt: 'help.key.alt',
  Tab: 'help.key.tab',
  Enter: 'help.key.enter',
  Esc: 'help.key.esc',
  'Mittlere Maustaste': 'help.key.middleClick',
  // 4T-0027: Mausrad als eigene "Taste" fuer den Zoom-per-Mausrad-Shortcut.
  Mausrad: 'help.key.mouseWheel',
};

export function localizeKey(token) {
  const key = KEY_LABEL_KEY[token];
  if (!key) return token;
  const translated = t(key);
  return translated === key ? token : translated;
}

// 4T-0027: Helper fuer den '+'-Split. "Strg+E" -> ["Strg", "E"], aber
// "Strg++" muss zu ["Strg", "+"] werden (die zweite Plus-Taste ist Inhalt,
// nicht Trenner). Trick: nur EINMAL splitten und alles zwischen den Trennern
// als Tokens nehmen. Naehrungslogik: Wenn der letzte Char '+' ist, dann ist
// die "Taste" '+' selbst. Behandle das gesondert. 4T-0216: Konsument ist
// die generierte Tastenkuerzel-Seite (generateShortcutsPage in manual.js);
// die Modal-Renderer (renderHelpContent, switchHelpTab, showHelp/hideHelp,
// loadPerspectiveTableHelpContent) sind mit dem Popup-Rueckbau entfallen.
export function splitShortcutKeys(k) {
  if (k.endsWith('+') && k.length >= 2 && k[k.length - 2] === '+') {
    const head = k.slice(0, -1); // "Strg+"
    const headTokens = head.split('+').filter((s) => s !== '');
    return [...headTokens, '+'];
  }
  return k.split('+');
}
