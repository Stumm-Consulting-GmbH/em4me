'use strict';

// 4T-002035 (Epic 3E-000260): Darstellung einer Ergebnismenge der Aufgaben-Ebene
// als Aufgaben-Liste (`LIST TASKS`). Das Modul beantwortet eine Frage: wie das
// DOM der Aufgaben-Liste samt Gruppen, Aufgaben-Layout (`HIDE`, `SHOW`,
// `SHORT`), Dringlichkeit, Kennzeichnungen, Zusatz-Spalte und Treffer-Zähler
// aus der Ergebnismenge (`resultSet`, Format-Vertrag in
// src/shared/query/result-set.js) entsteht. Es liest allein die Menge und nimmt
// Anzeige-Name, Anzeige-Stücke, gerundete Dringlichkeit und Gruppen-Durchlauf
// aus dem Darstellungs-Kern (src/shared/query/result-display.js); die
// Gruppen-Hülle samt Überschrift teilt es seit 4T-002077 mit der gruppierten
// Liste der übrigen Ebenen (display-list-table.js).
//
// Das gezeichnete Ergebnis ist byte-gleich zur bisherigen Bau-Funktion
// `buildQueryTaskListDom` in frontmatter-query-view.js (Entscheidung F3,
// Festlegung 6 des Epics): dieselben Elemente, Klassen, Texte und Reihenfolge,
// insbesondere die Treffer-Identität `data-task-path`, `data-task-line` und
// `data-task-text` am Listeneintrag und `data-task-action` an Status-Box und
// Knöpfen. Die Treffer-Aktionen (Abhaken, Verschieben, Dialog-Übernahme in
// task-query-actions.js) lesen allein diese Angaben und bleiben deshalb
// unberührt. Nachweis ist der Vergleichs-Prüffall
// test/unit/renderer/ergebnismenge-vorher-nachher.test.js.
//
// Titel der Status-Box, der Knöpfe und der Kennzeichnungen kommen wie bisher
// aus dem modul-eigenen `t`, Treffer-Zähler und Gruppe ohne Wert aus dem
// injizierten `tFn` des Einstiegs; nur so bleibt das Bild gleich.

import { t } from '../../i18n.js';
// 4T-000502 (Epic 3E-000096): Die Roh-Zeile der Herkunft wird mit dem
// Marker-Kern geparst, die Optik kommt aus der gemeinsamen Badge-Spec
// (Parität zu Render-Pane und Live-Modus). Bewusst nur shared-Importe neben
// `t`, damit der jsdom-Unit-Test ohne Preload-Brücke läuft.
import { parseTaskLine, stripGlobalFilter } from '../../../shared/tasks/task-markers.js';
import { primaryDateField } from '../../../shared/tasks/task-recurrence.js';
import { taskMarkerBadgeSpec, getTaskMarkersConfig } from '../../../shared/markdown/plugins.js';
import {
  cellSegments,
  displayName,
  roundUrgency,
  walkGroups,
} from '../../../shared/query/result-display.js';
// 4T-002077: Gruppen-Hülle und -Überschrift teilt die gruppierte Liste der
// übrigen Ebenen; sie stehen deshalb in display-list-table.js.
import { appendSegments, groupWrap } from './display-list-table.js';

// 4T-000503 (Epic 3E-000096): Aufgaben-Layout aus den Wünschen der Menge
// (HIDE, SHOW, SHORT). Sichtbarkeits-Regel: HIDE gewinnt; standardmäßig
// verborgene Elemente (aktuell 'urgency', wirksam ab 4T-000505) erscheinen
// nur über SHOW.
const DEFAULT_HIDDEN_ELEMENTS = new Set(['urgency']);

function taskLayout(wishes) {
  const hide = new Set(Array.isArray(wishes && wishes.hide) ? wishes.hide : []);
  const show = new Set(Array.isArray(wishes && wishes.show) ? wishes.show : []);
  return {
    short: !!(wishes && wishes.short),
    visible(element) {
      if (hide.has(element)) return false;
      if (DEFAULT_HIDDEN_ELEMENTS.has(element)) return show.has(element);
      return true;
    },
  };
}

// 4T-000503: Layout-Element eines Marker-Segments (HIDE/SHOW-Filterung);
// Toleranz-Marker (kind 'unknown') haben kein Element und bleiben sichtbar.
function segmentElement(seg) {
  if (seg.kind === 'date') return seg.field;
  if (seg.kind === 'priority') return 'priority';
  if (seg.kind === 'recurrence') return 'recurrence';
  if (seg.kind === 'id') return 'id';
  if (seg.kind === 'dependsOn') return 'dependson';
  return null;
}

// 4T-000503: Inline-Tags aus der Beschreibung entfernen (HIDE tags) —
// dieselbe Tag-Form wie der Index-Scan; Rest-Weißraum kollabiert.
function stripInlineTags(description) {
  return description
    .replace(/(^|[\s])#[\p{L}\p{N}_/-]+/gu, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Aufgaben-Liste (`LIST TASKS`): die Treffer als Liste oder, bei `GROUP BY`,
 * als verschachtelte Gruppen, darunter der Treffer-Zähler (per `HIDE count`
 * abschaltbar). Zustände, Abfrage-Fehler und Leer-Fall setzt der Einstieg
 * (frontmatter-query-view.js), bevor er hierher verteilt.
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet
 * @param {(key: string) => string} tFn
 * @returns {DocumentFragment}
 */
export function buildTaskListDom(resultSet, tFn) {
  const frag = document.createDocumentFragment();
  const layout = taskLayout(resultSet.wishes);
  // LIST trägt höchstens ein Zusatzfeld; es ist die erste Spalte der Menge.
  const withExtra = Array.isArray(resultSet.columns) && resultSet.columns.length > 0;
  const rows = resultSet.rows;
  const listOf = (indices) =>
    buildRowList(
      indices.map((i) => rows[i]),
      layout,
      withExtra,
    );
  if (Array.isArray(resultSet.groups)) {
    // 4T-000503: je Gruppe eine Überschrift (Ebene über data-level, Optik in
    // styles.css), darunter die Untergruppen oder die Aufgaben der Gruppe.
    walkGroups(
      resultSet,
      (group, level, parent) => {
        const wrap = groupWrap(group, level, tFn);
        if (!Array.isArray(group.groups)) wrap.appendChild(listOf(group.rows));
        parent.appendChild(wrap);
        return wrap;
      },
      frag,
    );
  } else {
    frag.appendChild(listOf(rows.map((_, i) => i)));
  }
  if (layout.visible('count')) {
    const count = document.createElement('div');
    count.className = 'perspective-query-task-count';
    count.textContent =
      rows.length === 1
        ? tFn('query.tasks.count.one')
        : tFn('query.tasks.count.other').replace('{n}', String(rows.length));
    frag.appendChild(count);
  }
  return frag;
}

// 4T-000502 (Epic 3E-000096): Aufgaben-Trefferliste. Pro Zeile ein Eintrag aus
// Status-Box, klickbarer Beschreibung (data-fm-path plus data-fm-line für den
// Zeilen-Sprung), Marker-Badges aus der gemeinsamen Badge-Spec und gedämpftem
// Datei-Namen. Globaler-Filter-Text wird gemäß Ausblende-Option der Erweiterung
// entfernt (getTaskMarkersConfig, dieselbe Quelle wie Render-Pane und
// Live-Modus). 4T-000503: das Layout steuert Element-Sichtbarkeit (HIDE/SHOW)
// und Kurz-Modus (SHORT: Badges nur als Symbol, voller Wert am Tooltip).
function buildRowList(rows, layout, withExtra) {
  const cfg = getTaskMarkersConfig();
  const list = document.createElement('ul');
  list.className = 'perspective-query-list perspective-query-tasks';
  for (const row of rows) list.appendChild(buildRowItem(row, layout, withExtra, cfg));
  return list;
}

function buildRowItem(row, layout, withExtra, cfg) {
  const origin = row.origin;
  const name = displayName(origin);
  const raw = origin.raw;
  const info = row.taskInfo || {};
  const li = document.createElement('li');
  li.className = 'perspective-query-task';
  const model = typeof raw === 'string' ? parseTaskLine(raw) : null;
  if (!model) {
    // Defensiv (Menge über die Prozess-Grenze): ohne parsebares Modell bleibt
    // der Treffer ein einfacher Datei-Link wie in der Datei-Liste.
    li.appendChild(taskItemLink(origin, name));
    return li;
  }
  // 4T-000504 (Epic 3E-000096): Treffer-Identität für die Rückschreib-Aktionen
  // (task-query-actions.js liest sie im Klick-Dispatch); aus der Herkunft.
  li.dataset.taskPath = origin.path;
  if (typeof origin.line === 'number') li.dataset.taskLine = String(origin.line);
  li.dataset.taskText = raw;
  const status = document.createElement('span');
  status.className = 'perspective-query-task-status';
  status.dataset.statusChar = model.statusChar;
  // 4T-000504: klickbare Status-Box (Ketten-Toggle mit Quelldatei-Schreibweg).
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
  if (!layout.visible('tags')) description = stripInlineTags(description);
  li.appendChild(taskItemLink(origin, description || name));
  appendMarkerBadges(li, model, layout, cfg);
  // 4T-000505 (Epic 3E-000096): einblendbarer Dringlichkeits-Score (SHOW
  // urgency; standardmäßig verborgen). Die Menge trägt ihn ungerundet
  // (Festlegung 4 des Epics): erst auf zwei Stellen runden, dann mit zwei
  // Nachkommastellen zeigen, wie bisher.
  if (layout.visible('urgency') && typeof info.urgency === 'number') {
    li.appendChild(
      badge(
        'task-marker task-marker-urgency',
        'taskQuery.urgency',
        `⚡ ${roundUrgency(info.urgency).toFixed(2)}`,
      ),
    );
  }
  // 4T-000508 (Epic 3E-000096): dezente Kennzeichnungen, blockiert durch
  // offene Vorgänger bzw. mehrfach vergebene Kennung.
  if (info.blocked === true) {
    li.appendChild(badge('task-marker task-marker-blocked', 'taskQuery.blocked', '⛔'));
    li.classList.add('perspective-query-task-blocked');
  }
  if (info.duplicateId === true) {
    li.appendChild(badge('task-marker task-marker-invalid', 'taskQuery.duplicateId', '⚠'));
  }
  // 4T-000504 (Epic 3E-000096): Aktions-Knöpfe pro Treffer; Verschieben nur
  // bei verwertbarem Termin-Feld (Layout-Elemente 'postpone' und 'edit').
  if (layout.visible('postpone') && primaryDateField(model)) {
    li.appendChild(taskActionButton('postpone', '⇥', t('taskQuery.postpone')));
  }
  if (layout.visible('edit')) {
    li.appendChild(taskActionButton('edit', '✎', t('taskQuery.edit')));
  }
  if (layout.visible('backlink')) {
    const fileRef = document.createElement('span');
    fileRef.className = 'perspective-query-task-file';
    fileRef.textContent = name;
    li.appendChild(fileRef);
  }
  const extra = withExtra ? cellSegments(row.values[0]) : [];
  if (extra.length > 0) {
    const span = document.createElement('span');
    span.className = 'perspective-query-extra';
    appendSegments(span, extra);
    li.appendChild(span);
  }
  return li;
}

// Marker-Badges der Aufgaben-Zeile aus der gemeinsamen Badge-Spec, gefiltert
// nach dem Layout; im Kurz-Modus nur das Marker-Symbol, der volle Wert wandert
// in den Tooltip (Titel plus Wert-Teil des Badge-Texts).
function appendMarkerBadges(li, model, layout, cfg) {
  const labels = (cfg && cfg.labels) || {};
  for (const seg of model.segments) {
    const element = segmentElement(seg);
    if (element && !layout.visible(element)) continue;
    const spec = taskMarkerBadgeSpec(seg, labels);
    const node = document.createElement('span');
    node.className = spec.cls;
    if (layout.short) {
      const spaceIdx = spec.text.indexOf(' ');
      const symbol = spaceIdx > 0 ? spec.text.slice(0, spaceIdx) : spec.text;
      const rest = spaceIdx > 0 ? spec.text.slice(spaceIdx + 1) : '';
      node.textContent = symbol;
      node.title = spec.title ? (rest ? `${spec.title}: ${rest}` : spec.title) : rest;
    } else {
      if (spec.title) node.title = spec.title;
      node.textContent = spec.text;
    }
    li.appendChild(node);
  }
}

// Kennzeichnungs-Badge mit Titel aus dem modul-eigenen `t`.
function badge(className, titleKey, text) {
  const node = document.createElement('span');
  node.className = className;
  node.title = t(titleKey);
  node.textContent = text;
  return node;
}

// 4T-000504 (Epic 3E-000096): Aktions-Knopf eines Aufgaben-Treffers
// (Verschieben, Bearbeiten); die Klick-Behandlung liegt im zentralen Dispatch
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

// Klickbarer Treffer-Link eines Aufgaben-Eintrags aus der Herkunft
// (Zeilen-Sprung über data-fm-line, zentrale Klick-Handler wie die Datei-Liste).
function taskItemLink(origin, text) {
  const a = document.createElement('a');
  a.className = 'perspective-query-item perspective-query-task-desc';
  a.href = '#';
  a.textContent = text;
  a.title = origin.path;
  a.dataset.fmPath = origin.path;
  if (typeof origin.line === 'number') a.dataset.fmLine = String(origin.line);
  return a;
}
