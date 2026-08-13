'use strict';

// 4T-0355 (Epic 3E-0065): Renderer-seitige Anzeige der Frontmatter-Abfrage.
// Der perspective-query-Fence rendert (aus 4T-0354) als leerer Platzhalter
// <div class="perspective-query" data-fm-query="…">. Dieses Modul befüllt den
// Platzhalter asynchron über das Abfrage-IPC mit der klickbaren Datei-Liste,
// hält sie über die Index-Invalidierung aktuell und stellt die Idle-Barriere
// für den PDF-Export bereit.
//
// Modus-agnostisch: derselbe Resolver läuft in Render-Pane, Reading und im
// Live-Block-Widget; den Klick übernehmen die zentralen Klick-Handler
// (data-fm-path -> openInPane), nicht dieses Modul. Der Container merkt sich
// den Basis-Pfad in data-fm-base, damit die Index-Invalidierung ohne Pane-
// Kontext neu befüllen kann.

import { api } from '../app/api.js';
import { t } from '../../i18n.js';
// 4T-0502 (Epic 3E-0096): Task-Treffer des TASKS-Scopes — die View parst die
// Roh-Zeile des Payloads mit dem Marker-Kern und baut die Task-Optik aus der
// gemeinsamen Badge-Spec (Paritaet zu Render-Pane/Live-Modus). Bewusst nur
// shared-Importe (kein Renderer-Modul), damit der jsdom-Unit-Test der reinen
// Bau-Funktionen ohne Preload-Bruecke laeuft.
import { parseTaskLine, stripGlobalFilter } from '../../../shared/tasks/task-markers.js';
import { primaryDateField } from '../../../shared/tasks/task-recurrence.js';
import { taskMarkerBadgeSpec, getTaskMarkersConfig } from '../../../shared/markdown/plugins.js';

// Bekannte Syntaxfehler-Codes des Parsers (src/shared/query/perspective-query.js) auf
// i18n-Keys abgebildet. Die deutschsprachige `message` des Parsers wird bewusst
// NICHT angezeigt (i18n-Regel); der Code bestimmt den lokalisierten Text, die
// Position füllt {pos} (bzw. {clause}/{name} für Klausel- und Funktions-Fehler).
// Unbekannte Codes fallen auf den generischen Text zurück.
// 4T-0401 (Epic 3E-0076): Codes der Klausel-Grammatik ergänzt; die bereits
// bestehenden Parser-Codes (expectedOperator, expectedValue, …) erhalten dabei
// eigene Texte statt des generischen Fallbacks.
const SYNTAX_ERROR_KEYS = {
  unexpectedChar: 'query.syntax.unexpectedChar',
  unterminatedString: 'query.syntax.unterminatedString',
  empty: 'query.syntax.empty',
  trailing: 'query.syntax.trailing',
  syntax: 'query.syntax.syntax',
  expectedOperator: 'query.syntax.expectedOperator',
  expectedValue: 'query.syntax.expectedValue',
  expectedParen: 'query.syntax.expectedParen',
  unexpectedEnd: 'query.syntax.unexpectedEnd',
  emptyList: 'query.syntax.emptyList',
  expectedIn: 'query.syntax.expectedIn',
  unexpectedToken: 'query.syntax.unexpectedToken',
  unterminatedLink: 'query.syntax.unterminatedLink',
  unknownClause: 'query.syntax.unknownClause',
  duplicateClause: 'query.syntax.duplicateClause',
  misplacedType: 'query.syntax.misplacedType',
  expectedField: 'query.syntax.expectedField',
  expectedColumn: 'query.syntax.expectedColumn',
  expectedAlias: 'query.syntax.expectedAlias',
  expectedId: 'query.syntax.expectedId',
  expectedNumber: 'query.syntax.expectedNumber',
  invalidLimit: 'query.syntax.invalidLimit',
  invalidColumns: 'query.syntax.invalidColumns',
  expectedSource: 'query.syntax.expectedSource',
  invalidDate: 'query.syntax.invalidDate',
  invalidDuration: 'query.syntax.invalidDuration',
  // 4T-0402 (Epic 3E-0076): Funktions-Validierung (seit 4T-0987 in
  // src/shared/query/query-functions.js) laeuft ueber denselben
  // queryError-Pfad wie die Parser-Codes.
  unknownFunction: 'query.syntax.unknownFunction',
  functionArity: 'query.syntax.functionArity',
  // 4T-0502 (Epic 3E-0096): TASKS-Scope bei deaktivierter Erweiterung
  // "Aufgaben" (Gate im Main-Query-Pfad, kein Parser-Fehler).
  tasksScopeDisabled: 'query.syntax.tasksScopeDisabled',
  // 4T-0503 (Epic 3E-0096): Gruppierung und Task-Layout (GROUP BY, HIDE/
  // SHOW/SHORT) — Parser-Codes plus Aktivierungs-Grenze des Main-Pfads.
  expectedBy: 'query.syntax.expectedBy',
  expectedElement: 'query.syntax.expectedElement',
  unknownLayoutElement: 'query.syntax.unknownLayoutElement',
  groupByTasksOnly: 'query.syntax.groupByTasksOnly',
  layoutTasksOnly: 'query.syntax.layoutTasksOnly',
  // 4T-0505 (Epic 3E-0096): fehlerhafte globale Abfrage (Einstellungen) —
  // eigener Code, damit die Anzeige global von lokal unterscheidet.
  globalQueryInvalid: 'query.syntax.globalQueryInvalid',
};

// 4T-0405 (Epic 3E-0076): Hinweis-Codes des Main-Payloads (payload.hint) auf
// i18n-Keys abgebildet — Linter-artige Hinweise, keine Fehler.
const HINT_KEYS = {
  columnsIgnored: 'query.hint.columnsIgnored',
};

function syntaxErrorText(err, translate) {
  const tr = typeof translate === 'function' ? translate : t;
  const code = (err && err.code) || 'syntax';
  const key = SYNTAX_ERROR_KEYS[code] || SYNTAX_ERROR_KEYS.syntax;
  const pos = err && typeof err.pos === 'number' ? err.pos : -1;
  return tr(key)
    .replace('{pos}', String(pos))
    .replace('{clause}', String((err && err.clause) || ''))
    .replace('{name}', String((err && err.name) || ''));
}

// --- Reine Bau-Funktion ------------------------------------------------------
// Erzeugt aus der IPC-Antwort (bzw. dem Renderer-internen Lade-Status) das
// Listen-DOM. Prozess-nah, aber nur von `document` und dem injizierten `tFn`
// abhängig, damit im jsdom-Unit-Test deterministisch prüfbar (t als Stub).
// Gibt ein DocumentFragment zurück, das der Aufrufer in den Container hängt.
export function buildQueryListDom(payload, tFn) {
  const translate = typeof tFn === 'function' ? tFn : t;
  const frag = document.createDocumentFragment();
  const status = payload && payload.status;

  // Status ohne Treffer-Liste: je ein lokalisierter Hinweis.
  if (status === 'loading') return append(frag, statusNode('query.loading', translate));
  if (status === 'unavailable') return append(frag, statusNode('query.unavailable', translate));
  if (status === 'indexing') return append(frag, statusNode('query.indexing', translate));
  if (status === 'error') return append(frag, statusNode('query.error', translate));
  if (status === 'oversized') {
    const meta = (payload && payload.meta) || {};
    const node = statusNode('query.oversized', translate, {
      '{files}': String(meta.fileCount || 0),
    });
    return append(frag, node);
  }

  // ready: zuerst der Query-Syntaxfehler (leere Liste), dann Leer-Fall, dann
  // Liste bzw. Tabelle (4T-0404).
  if (payload && payload.queryError) {
    const node = statusNode(null, translate);
    node.classList.add('perspective-query-error');
    node.textContent = syntaxErrorText(payload.queryError, translate);
    return append(frag, node);
  }
  const files = payload && Array.isArray(payload.files) ? payload.files : [];
  // 4T-0503 (Epic 3E-0096): gruppierte Task-Ausgabe (GROUP BY) — die Treffer
  // liegen dann in payload.groups statt in der flachen files-Liste.
  const taskGroups =
    payload && payload.queryScope === 'tasks' && Array.isArray(payload.groups)
      ? payload.groups
      : null;
  if (files.length === 0 && (!taskGroups || taskGroups.length === 0)) {
    return append(frag, statusNode('query.empty', translate));
  }

  // 4T-0405 (Epic 3E-0076): Linter-artiger Hinweis oberhalb des Ergebnisses
  // (aktuell: COLUMNS bei TABLE ignoriert). Kein Fehler, Ergebnis folgt darunter.
  if (payload.hint && HINT_KEYS[payload.hint]) {
    const hint = document.createElement('div');
    hint.className = 'perspective-query-hint';
    hint.textContent = translate(HINT_KEYS[payload.hint]);
    frag.appendChild(hint);
  }

  // 4T-0404 (Epic 3E-0076): TABLE-Ausgabe als eigene Bau-Funktion; die Liste
  // bleibt der Default (Alt-Payloads ohne queryType rendern unverändert).
  if (payload.queryType === 'table' && payload.table) {
    return append(frag, buildQueryTableDom(payload.table, translate));
  }

  // 4T-0502 (Epic 3E-0096): Task-Treffer des TASKS-Scopes als eigene Liste
  // (Status-Box, klickbare Beschreibung mit Zeilen-Sprung, Marker-Badges).
  // 4T-0503: optional gruppiert (GROUP BY), mit Layout-Optionen (HIDE/SHOW/
  // SHORT) und Treffer-Zähler (Element 'count', per HIDE abschaltbar).
  if (payload.queryScope === 'tasks') {
    const layout = normalizeTaskLayout(payload.taskLayout);
    if (taskGroups) appendTaskGroups(frag, taskGroups, 0, layout, translate);
    else frag.appendChild(buildQueryTaskListDom(files, layout));
    if (layout.visible('count') && typeof payload.totalCount === 'number') {
      const count = document.createElement('div');
      count.className = 'perspective-query-task-count';
      count.textContent =
        payload.totalCount === 1
          ? translate('query.tasks.count.one')
          : translate('query.tasks.count.other').replace('{n}', String(payload.totalCount));
      frag.appendChild(count);
    }
    return frag;
  }

  const list = document.createElement('ul');
  list.className = 'perspective-query-list';
  // 4T-0405 (Epic 3E-0076): Mehrspalten-Layout der Ergebnis-Liste. Reines
  // Anzeige-Attribut; die column-count-Regeln (2–8) liegen in styles.css.
  if (
    typeof payload.layoutColumns === 'number' &&
    payload.layoutColumns >= 2 &&
    payload.layoutColumns <= 8
  ) {
    list.dataset.fmColumns = String(payload.layoutColumns);
  }
  for (const file of files) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'perspective-query-item';
    a.href = '#';
    a.textContent = file.name;
    a.title = file.path;
    // Absoluter Index-Pfad; der zentrale Klick-Handler öffnet darüber die
    // exakte Zieldatei (openInPane), ohne erneute Namensauflösung.
    a.dataset.fmPath = file.path;
    // 4T-0409 (Epic 3E-0077): Block-Treffer tragen den Anker; der Klick-Pfad
    // springt nach dem Öffnen zum Block (bestehende Anker-Sprung-Mechanik).
    if (typeof file.anchor === 'string' && file.anchor) {
      a.dataset.fmAnchor = '^' + file.anchor;
    }
    li.appendChild(a);
    // 4T-0404: LIST-Zusatzfeld — ausgewerteter Ausdruck als gedämpfter
    // Anhang hinter dem Datei-Link (Segmente, Links bleiben klickbar).
    if (Array.isArray(file.extra) && file.extra.length > 0) {
      const span = document.createElement('span');
      span.className = 'perspective-query-extra';
      appendSegments(span, file.extra);
      li.appendChild(span);
    }
    list.appendChild(li);
  }
  frag.appendChild(list);
  return frag;
}

// 4T-0503 (Epic 3E-0096): normalisiertes Task-Layout der Ausgabe (HIDE/SHOW/
// SHORT). Sichtbarkeits-Regel: HIDE gewinnt; standardmäßig verborgene
// Elemente (aktuell 'urgency', wirksam ab 4T-0505) erscheinen nur über SHOW.
const DEFAULT_HIDDEN_ELEMENTS = new Set(['urgency']);

function normalizeTaskLayout(raw) {
  const hide = new Set(Array.isArray(raw && raw.hide) ? raw.hide : []);
  const show = new Set(Array.isArray(raw && raw.show) ? raw.show : []);
  return {
    short: !!(raw && raw.short),
    visible(element) {
      if (hide.has(element)) return false;
      if (DEFAULT_HIDDEN_ELEMENTS.has(element)) return show.has(element);
      return true;
    },
  };
}

// 4T-0503: Layout-Element eines Marker-Segments (HIDE/SHOW-Filterung);
// Toleranz-Marker (kind 'unknown') haben kein Element und bleiben sichtbar.
function segmentElement(seg) {
  if (seg.kind === 'date') return seg.field;
  if (seg.kind === 'priority') return 'priority';
  if (seg.kind === 'recurrence') return 'recurrence';
  if (seg.kind === 'id') return 'id';
  if (seg.kind === 'dependsOn') return 'dependson';
  return null;
}

// 4T-0503: Inline-Tags aus der Beschreibung entfernen (HIDE tags) —
// dieselbe Tag-Form wie der Index-Scan; Rest-Weißraum kollabiert.
function stripInlineTags(description) {
  return description
    .replace(/(^|[\s])#[\p{L}\p{N}_/-]+/gu, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 4T-0502 (Epic 3E-0096): Gruppen-Rendering der Task-Ausgabe (4T-0503):
// pro Gruppe eine Überschrift (Ebene über data-level, Optik in styles.css)
// und darunter rekursiv Untergruppen bzw. die Task-Liste. label null steht
// für Treffer ohne Gruppen-Wert (lokalisierte Beschriftung).
function appendTaskGroups(parent, groups, level, layout, translate) {
  for (const group of groups || []) {
    const wrap = document.createElement('div');
    wrap.className = 'perspective-query-group';
    wrap.dataset.level = String(level);
    const title = document.createElement('div');
    title.className = 'perspective-query-group-title';
    title.textContent = group.label === null ? translate('query.group.none') : group.label;
    wrap.appendChild(title);
    if (Array.isArray(group.groups)) {
      appendTaskGroups(wrap, group.groups, level + 1, layout, translate);
    } else {
      wrap.appendChild(buildQueryTaskListDom(group.items || [], layout));
    }
    parent.appendChild(wrap);
  }
}

// 4T-0502 (Epic 3E-0096): Task-Trefferliste des TASKS-Scopes. Pro Treffer
// eine Zeile aus Status-Box (Darstellung; interaktiv ab 4T-0504), klickbarer
// Beschreibung (data-fm-path plus data-fm-line für den Zeilen-Sprung),
// Marker-Badges aus der gemeinsamen Badge-Spec und gedämpftem Datei-Namen.
// Globaler-Filter-Text wird gemäß Ausblende-Option der Erweiterung entfernt
// (getTaskMarkersConfig — dieselbe Quelle wie Render-Pane und Live-Modus).
// 4T-0503: layout steuert Element-Sichtbarkeit (HIDE/SHOW) und Kurz-Modus
// (SHORT: Badges nur als Symbol, voller Wert am Tooltip); ohne layout bleibt
// alles sichtbar. Exportiert für den jsdom-Unit-Test.
export function buildQueryTaskListDom(files, layout) {
  const lay = layout && typeof layout.visible === 'function' ? layout : normalizeTaskLayout(null);
  const cfg = getTaskMarkersConfig();
  const list = document.createElement('ul');
  list.className = 'perspective-query-list perspective-query-tasks';
  for (const file of files) {
    const li = document.createElement('li');
    li.className = 'perspective-query-task';
    const model = typeof file.taskText === 'string' ? parseTaskLine(file.taskText) : null;
    if (!model) {
      // Defensiv (Payload über IPC): ohne parsebares Modell bleibt der
      // Treffer ein einfacher Datei-Link wie in der Datei-Liste.
      li.appendChild(taskItemLink(file, file.name));
      list.appendChild(li);
      continue;
    }
    // 4T-0504 (Epic 3E-0096): Treffer-Identitaet fuer die Rueckschreib-
    // Aktionen (task-query-actions.js liest sie im Klick-Dispatch).
    li.dataset.taskPath = file.path;
    if (typeof file.line === 'number') li.dataset.taskLine = String(file.line);
    li.dataset.taskText = file.taskText;
    const status = document.createElement('span');
    status.className = 'perspective-query-task-status';
    status.dataset.statusChar = model.statusChar;
    // 4T-0504: klickbare Status-Box (Ketten-Toggle mit Quelldatei-Schreibweg).
    status.dataset.taskAction = 'toggle';
    status.title = t('taskQuery.toggle');
    const isDone = model.statusChar === 'x' || model.statusChar === 'X';
    status.textContent = isDone ? '✓' : model.statusChar === ' ' ? '' : model.statusChar;
    if (isDone) li.classList.add('perspective-query-task-done');
    li.appendChild(status);
    let description = model.description.trim();
    if (cfg && cfg.hideGlobalFilter && cfg.globalFilter) {
      description = stripGlobalFilter(description, cfg.globalFilter).trim();
    }
    if (!lay.visible('tags')) description = stripInlineTags(description);
    li.appendChild(taskItemLink(file, description || file.name));
    const labels = (cfg && cfg.labels) || {};
    for (const seg of model.segments) {
      const element = segmentElement(seg);
      if (element && !lay.visible(element)) continue;
      const spec = taskMarkerBadgeSpec(seg, labels);
      const badge = document.createElement('span');
      badge.className = spec.cls;
      if (lay.short) {
        // Kurz-Modus: nur das Marker-Symbol; der volle Wert wandert in den
        // Tooltip (Titel plus Wert-Teil des Badge-Texts).
        const spaceIdx = spec.text.indexOf(' ');
        const symbol = spaceIdx > 0 ? spec.text.slice(0, spaceIdx) : spec.text;
        const rest = spaceIdx > 0 ? spec.text.slice(spaceIdx + 1) : '';
        badge.textContent = symbol;
        badge.title = spec.title ? (rest ? `${spec.title}: ${rest}` : spec.title) : rest;
      } else {
        if (spec.title) badge.title = spec.title;
        badge.textContent = spec.text;
      }
      li.appendChild(badge);
    }
    // 4T-0505 (Epic 3E-0096): einblendbarer Dringlichkeits-Score
    // (SHOW urgency; standardmäßig verborgen, Wert vom Main gerundet).
    if (lay.visible('urgency') && typeof file.urgency === 'number') {
      const badge = document.createElement('span');
      badge.className = 'task-marker task-marker-urgency';
      badge.title = t('taskQuery.urgency');
      badge.textContent = `⚡ ${file.urgency.toFixed(2)}`;
      li.appendChild(badge);
    }
    // 4T-0508 (Epic 3E-0096): dezente Kennzeichnungen — blockiert durch
    // offene Vorgänger bzw. mehrfach vergebene ID (Eindeutigkeits-Prüfung).
    if (file.blocked === true) {
      const badge = document.createElement('span');
      badge.className = 'task-marker task-marker-blocked';
      badge.title = t('taskQuery.blocked');
      badge.textContent = '⛔';
      li.appendChild(badge);
      li.classList.add('perspective-query-task-blocked');
    }
    if (file.duplicateId === true) {
      const badge = document.createElement('span');
      badge.className = 'task-marker task-marker-invalid';
      badge.title = t('taskQuery.duplicateId');
      badge.textContent = '⚠';
      li.appendChild(badge);
    }
    // 4T-0504 (Epic 3E-0096): Aktions-Knoepfe pro Treffer — Verschieben nur
    // bei verwertbarem Termin-Feld (Layout-Elemente 'postpone' und 'edit').
    if (lay.visible('postpone') && primaryDateField(model)) {
      li.appendChild(taskActionButton('postpone', '⇥', t('taskQuery.postpone')));
    }
    if (lay.visible('edit')) {
      li.appendChild(taskActionButton('edit', '✎', t('taskQuery.edit')));
    }
    if (lay.visible('backlink')) {
      const fileRef = document.createElement('span');
      fileRef.className = 'perspective-query-task-file';
      fileRef.textContent = file.name;
      li.appendChild(fileRef);
    }
    if (Array.isArray(file.extra) && file.extra.length > 0) {
      const span = document.createElement('span');
      span.className = 'perspective-query-extra';
      appendSegments(span, file.extra);
      li.appendChild(span);
    }
    list.appendChild(li);
  }
  return list;
}

// 4T-0504 (Epic 3E-0096): Aktions-Knopf eines Task-Treffers (Verschieben,
// Bearbeiten) — die Klick-Behandlung liegt im zentralen Dispatch
// (task-query-actions.js), hier nur Darstellung und data-Attribut.
function taskActionButton(action, glyph, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'perspective-query-task-btn';
  btn.dataset.taskAction = action;
  btn.textContent = glyph;
  btn.title = title;
  return btn;
}

// Klickbarer Treffer-Link eines Task-Eintrags (Zeilen-Sprung über
// data-fm-line, zentrale Klick-Handler wie die Datei-Liste).
function taskItemLink(file, text) {
  const a = document.createElement('a');
  a.className = 'perspective-query-item perspective-query-task-desc';
  a.href = '#';
  a.textContent = text;
  a.title = file.path;
  a.dataset.fmPath = file.path;
  if (typeof file.line === 'number') a.dataset.fmLine = String(file.line);
  return a;
}

// 4T-0404 (Epic 3E-0076): Segment-Renderer für Tabellen-Zellen und das
// LIST-Zusatzfeld. { text } wird Text-Knoten, { link } ein Link über den
// bestehenden data-fm-path-Klick-Pfad (zentrale Klick-Handler, wie die
// Datei-Liste selbst). Defensive Prüfung, weil die Segmente über IPC kommen.
function appendSegments(el, segments) {
  for (const seg of segments || []) {
    if (seg && seg.link && typeof seg.link.path === 'string') {
      const a = document.createElement('a');
      a.className = 'perspective-query-item';
      a.href = '#';
      a.textContent = seg.link.name || seg.link.path;
      a.title = seg.link.path;
      a.dataset.fmPath = seg.link.path;
      el.appendChild(a);
    } else if (seg && typeof seg.text === 'string') {
      el.appendChild(document.createTextNode(seg.text));
    }
  }
}

// 4T-0404 (Epic 3E-0076): Tabellen-DOM der TABLE-Ausgabe. Erste Spalte ist der
// klickbare Datei-Link (entfällt bei WITHOUT ID), danach je Spalten-Ausdruck
// eine Zelle aus Segmenten; Kopfzeile aus Alias bzw. Ausdrucks-Quelltext (vom
// Main geliefert). Die Optik erbt von .markdown-body table; die Zusatz-Klasse
// perspective-query-table trägt nur Abstände. Exportiert für den jsdom-Test.
export function buildQueryTableDom(table, tFn) {
  const translate = typeof tFn === 'function' ? tFn : t;
  const el = document.createElement('table');
  el.className = 'perspective-query-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  if (!table.withoutId) {
    const th = document.createElement('th');
    th.textContent = translate('query.table.fileColumn');
    headRow.appendChild(th);
  }
  for (const header of table.headers || []) {
    const th = document.createElement('th');
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  el.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of table.rows || []) {
    const tr = document.createElement('tr');
    if (!table.withoutId) {
      const td = document.createElement('td');
      const a = document.createElement('a');
      a.className = 'perspective-query-item';
      a.href = '#';
      a.textContent = row.name;
      a.title = row.path;
      a.dataset.fmPath = row.path;
      // 4T-0409 (Epic 3E-0077): Anker der Block-Treffer (wie die Liste).
      if (typeof row.anchor === 'string' && row.anchor) {
        a.dataset.fmAnchor = '^' + row.anchor;
      }
      // 4T-0502 (Epic 3E-0096): Zeilen-Sprung der Task-Treffer (TABLE TASKS).
      if (typeof row.line === 'number') {
        a.dataset.fmLine = String(row.line);
      }
      td.appendChild(a);
      tr.appendChild(td);
    }
    for (const cell of row.cells || []) {
      const td = document.createElement('td');
      appendSegments(td, cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  el.appendChild(tbody);
  return el;
}

function append(frag, node) {
  frag.appendChild(node);
  return frag;
}

function statusNode(key, translate, replacements) {
  const div = document.createElement('div');
  div.className = 'perspective-query-status';
  if (key) {
    let text = translate(key);
    if (replacements) {
      for (const [ph, val] of Object.entries(replacements)) text = text.replace(ph, val);
    }
    div.textContent = text;
  }
  return div;
}

// --- Idle-Barriere für den PDF-Export ---------------------------------------
// Zählt laufende Befüllungen; der PDF-Export wartet über
// waitForFrontmatterQueriesIdle(), bis alle sichtbaren Container ihre Liste
// haben (analog waitForMermaidIdle). Ohne die Barriere druckt der Export den
// leeren Platzhalter statt der Liste.
let pendingFills = 0;
let idleResolvers = [];

function fillStarted() {
  pendingFills += 1;
}

function fillFinished() {
  pendingFills = Math.max(0, pendingFills - 1);
  if (pendingFills === 0 && idleResolvers.length) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export function waitForFrontmatterQueriesIdle() {
  if (pendingFills === 0) return Promise.resolve();
  return new Promise((resolve) => idleResolvers.push(resolve));
}

// --- Befüllung ---------------------------------------------------------------
// Pro Container ein Generations-Token: trifft während eines laufenden IPC ein
// Refresh ein, verwirft die veraltete Antwort ihren DOM-Tausch (Muster der
// subpageBreadcrumbTokens). WeakMap, damit entfernte Container automatisch aus
// der Buchführung fallen.
const fillTokens = new WeakMap();

function renderPayload(el, payload) {
  el.textContent = '';
  el.appendChild(buildQueryListDom(payload, t));
}

// Befüllt einen einzelnen perspective-query-Container. showLoading zeigt beim
// Erstaufbau (leerer Platzhalter) einen Ladehinweis; beim Invalidierungs-
// Refresh bleibt die bestehende Liste bis zur neuen Antwort stehen (kein
// Flackern). Nicht async, damit fillStarted() synchron vor dem ersten await
// läuft und die Idle-Barriere den Aufruf sicher erfasst.
function fillOneQueryContainer(el, basePath, showLoading) {
  const token = (fillTokens.get(el) || 0) + 1;
  fillTokens.set(el, token);
  if (basePath) el.dataset.fmBase = basePath;

  if (!basePath) {
    // Pfadloser Tab (Unbenannt, Handbuch): keine durchsuchbare Basis.
    renderPayload(el, { status: 'unavailable' });
    return;
  }
  const query = el.dataset.fmQuery || '';
  if (showLoading) renderPayload(el, { status: 'loading' });
  fillStarted();
  api
    .runFrontmatterQuery(basePath, query)
    .then((payload) => {
      if (fillTokens.get(el) === token) renderPayload(el, payload || { status: 'error' });
    })
    .catch(() => {
      if (fillTokens.get(el) === token) renderPayload(el, { status: 'error' });
    })
    .finally(fillFinished);
}

// Findet alle perspective-query-Platzhalter im Container und befüllt sie.
// Aufgerufen aus der Render-Pipeline (Render-Pane/Reading) und aus dem
// Live-Block-Widget. basePath kann leer sein (pfadloser Tab).
export function applyFrontmatterQueriesIfPresent(container, basePath) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const els = container.querySelectorAll('.perspective-query[data-fm-query]');
  for (const el of els) fillOneQueryContainer(el, basePath, true);
}

// --- Live-Aktualisierung über die Index-Invalidierung ------------------------
// Debounced: mehrere Broadcasts in Folge (Massen-Umbenennung) lösen nur eine
// Neubefüllung aus. Modus-agnostisch über die im DOM mit data-fm-base
// markierten Container; kein eigener Watcher.
let refreshTimer = null;

export function refreshVisibleFrontmatterQueries() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const els = document.querySelectorAll('.perspective-query[data-fm-base]');
    for (const el of els) fillOneQueryContainer(el, el.dataset.fmBase, false);
  }, 150);
}
