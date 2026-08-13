// CodeMirror-Autocomplete (Wiki-Links/Anker/Tags), Tag-Sidebar-Rendering und Funktions-Katalog-Quelle.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../../i18n.js';
import { autocompletion } from '@codemirror/autocomplete';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
// 4T-0716 (Epic 3E-0137): Die Daten und die Markdown-Erzeugung der Funktions-
// und Tastenkürzel-Seite liegen im geteilten, prozessneutralen Modul
// manual-generated.js. Hier bleiben nur die Tasten-Helfer, die andere
// Renderer-Teile (settings-page.js) und ein Unit-Test nutzen: splitShortcutKeys
// rein, localizeKey mit der Renderer-Übersetzung.
import {
  splitShortcutKeys,
  localizeKey as localizeKeyShared,
} from '../../../shared/manual/manual-generated.js';
// 4T-0337 (Epic 3E-0061): Unterseiten — '[[/' schlaegt die Unterseiten der
// aktiven Datei vor (logische Namen in Slash-Schreibweise).
import { toLogicalName } from '../../../shared/subpages.js';
// 4T-0294 (Epic 3E-0052): Autocomplete ist eine schaltbare Erweiterung; die
// Trigger prüfen zusätzlich den Zustand von wiki-links bzw. tags.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { paneEditors } from './editor.js';
import { openInPane } from '../tabs/tabs.js';
// 4T-0507 (Epic 3E-0096): dritte Vervollstaendigungs-Quelle auf Task-Zeilen
// (Marker-Vorschlaege; Datums-Eintraege oeffnen den Picker aus 3E-0091).
import { tasksConfig } from '../tasks.js';
import { taskStatesResolved } from '../task-states.js';
import { showDateTimePicker } from '../calendar/date-picker.js';
import {
  parseTaskLine,
  serializeTaskLine,
  modelMatchesGlobalFilter,
  setDateField,
  setPriority,
  setStatusChar,
  setReminder,
  PRIORITY_ORDER,
} from '../../../shared/tasks/task-markers.js';
import { setRecurrence } from '../../../shared/tasks/task-recurrence.js';
import { setTaskId, generateTaskId } from '../../../shared/tasks/task-dependencies.js';
// 4T-0347 (Epic 3E-0062): bereichsrelative Ordner-Anzeige (gemeinsam mit dem
// Backlinks-Panel), damit gleichnamige Dateien aus verschiedenen Ordnern des
// Bereichs eindeutig unterscheidbar sind.
import { relativeDirFromRoot } from '../path-format.js';

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

// --- Tasten-Helfer (4T-0716) ------------------------------------------------
// Die Daten (HELP_FEATURE_GROUPS, STATIC_HELP_SHORTCUTS) und die Markdown-
// Erzeugung der Funktions- und Tastenkürzel-Seite sind seit 4T-0716 in das
// geteilte, prozessneutrale Modul src/shared/manual/manual-generated.js gewandert, das
// App (manual.js) und Web-Bau gemeinsam nutzen. Hier verbleiben nur die von
// anderen Renderer-Teilen genutzten Tasten-Helfer: settings-page.js bindet
// splitShortcutKeys/localizeKey für die <kbd>-Anzeige, der Renderer-Unit-Test
// prüft splitShortcutKeys. splitShortcutKeys ist rein und wird unverändert
// durchgereicht; localizeKey bindet die Renderer-Übersetzung an die geteilte
// Logik.
export { splitShortcutKeys };

export function localizeKey(token) {
  return localizeKeyShared(token, t);
}
