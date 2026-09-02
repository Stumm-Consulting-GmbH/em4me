// 4T-000985 (Epic 3E-000196): aus src/shared/markdown/plugins.js geschnitten.
// Aufgaben-Gruppe: erweiterte Task-Zustaende und Task-Marker-Badges.
//
// Beide konfigurierbaren Zustands-Container des Plugin-Satzes
// (activeTaskStates ueber configureTaskStates, taskMarkersConfig ueber
// configureTaskMarkers) liegen bewusst zusammen mit allen ihren
// Verbrauchern in DIESEM Modul: Eine Teilung ueber zwei Module haette
// zwei Instanzen desselben Zustands erzeugt, sobald ein Verbraucher das
// jeweils andere Modul laedt. taskMarkersPlugin fragt ueber
// taskStatusType den Zustands-Container der Task-States ab; die Kopplung
// ist damit auch technisch bindend.
//
// Electron-frei; die Instanz-Registrierung macht markdown.js in der
// Original-Reihenfolge.
'use strict';

const { escapeHtml } = require('../slug.js');
// 4T-000498 (Epic 3E-000090): Marker-Kern der Task-Zeilen (Parsing der
// Symbol-Marker fuer die Badge-Darstellung und den Global Filter).
const taskMarkers = require('../../tasks/task-markers.js');

// 4T-000204 (Epic 3E-000017): Erweiterte Task-States. Heute kennt die App
// `[ ]`/`[x]` (markdown-it-task-lists); zusaetzliche Status-Marker wie
// `[/]` (in Arbeit) oder `[!]` (wichtig) rendern als farbige Status-Box
// mit dem Marker-Zeichen als Glyph (Obsidian-Minimal-Stil — skaliert
// ohne Icon-Pflege, ein nutzerdefinierter Status braucht nur Zeichen +
// Farbe).
//
// Das aktive Set kommt ueber configureTaskStates(states) von aussen
// (Renderer: electron-store + lokalisierte Labels); das Modul selbst
// bleibt Electron-frei und startet mit dem Default-Set — Unit-/
// Snapshot-Tests laufen deterministisch ohne Store. Die Basis-Zustaende
// ` `/`x`/`X` bleiben fest beim task-lists-Plugin und sind nicht
// konfigurierbar.
// 4T-000497 (Epic 3E-000090): jeder Status traegt zusaetzlich einen Typ
// (Semantik fuer Erledigt-Automatik und Wiederholung) und ein Folge-
// Symbol (Ketten-Toggle beim Checkbox-Klick). Defaults verhaltensneutral
// zum Bestand: alle Folge-Symbole 'x' (Klick schliesst ab, wie bisher
// hart kodiert); Typen '/' IN_PROGRESS und '-' CANCELLED, alle uebrigen
// TODO. Nur der Uebergang AUF einen DONE-Typ gilt als Abschluss
// (Architekturentscheidung 4 des Epics).
const TASK_STATE_DEFAULTS = [
  {
    char: '/',
    name: 'inProgress',
    label: 'In Arbeit',
    color: '#0d6efd',
    enabled: true,
    builtin: true,
    type: 'IN_PROGRESS',
    next: 'x',
  },
  {
    char: '-',
    name: 'cancelled',
    label: 'Abgebrochen',
    color: '#6c757d',
    enabled: true,
    builtin: true,
    type: 'CANCELLED',
    next: 'x',
  },
  {
    char: '>',
    name: 'forwarded',
    label: 'Delegiert',
    color: '#6f42c1',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '?',
    name: 'question',
    label: 'Frage',
    color: '#fd7e14',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '!',
    name: 'important',
    label: 'Wichtig',
    color: '#dc3545',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '*',
    name: 'star',
    label: 'Markiert',
    color: '#d4a900',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
];

// Zeichen, die als Status-Marker ausscheiden: Basis-Zustaende und
// Syntax-brechende Zeichen.
const TASK_STATE_FORBIDDEN_CHARS = new Set([' ', 'x', 'X', '[', ']', '\\']);

// 4T-000497: die sechs Status-Typen der Referenz-Semantik. Die Zuordnung
// ist frei (auch '*' = DONE ist legitim, belegte PO-Nutzung); 'not done'
// im Sinne der Referenz sind TODO, IN_PROGRESS und ON_HOLD.
const TASK_STATE_TYPES = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED', 'NON_TASK'];

// Folge-Symbol darf jedes Einzelzeichen sein, das die Checkbox-Syntax
// nicht bricht — ausdruecklich auch die Basis-Zustaende ' ' und 'x'.
const TASK_STATE_NEXT_FORBIDDEN_CHARS = new Set(['[', ']', '\\']);

function normalizeTaskStateType(type) {
  return TASK_STATE_TYPES.includes(type) ? type : 'TODO';
}

function normalizeTaskStateNext(next) {
  const ch = typeof next === 'string' ? next : '';
  if (ch.length !== 1 || TASK_STATE_NEXT_FORBIDDEN_CHARS.has(ch)) return 'x';
  return ch;
}

let activeTaskStates = new Map(); // char -> { color, label, type, next }

function configureTaskStates(states) {
  const map = new Map();
  for (const s of Array.isArray(states) ? states : []) {
    if (!s || !s.enabled) continue;
    const ch = String(s.char || '');
    if (ch.length !== 1 || TASK_STATE_FORBIDDEN_CHARS.has(ch)) continue;
    map.set(ch, {
      color: String(s.color || '#888888'),
      label: String(s.label || ''),
      type: normalizeTaskStateType(s.type),
      next: normalizeTaskStateNext(s.next),
    });
  }
  activeTaskStates = map;
}
configureTaskStates(TASK_STATE_DEFAULTS);

function getActiveTaskStates() {
  return activeTaskStates;
}

// 4T-000497: Typ eines Status-Zeichens. Basis-Zustaende sind fest
// (' ' TODO, 'x'/'X' DONE, nicht konfigurierbar); unbekannte Zeichen
// liefern null (keine Status-Semantik).
function taskStatusType(ch) {
  if (ch === ' ') return 'TODO';
  if (ch === 'x' || ch === 'X') return 'DONE';
  const def = activeTaskStates.get(ch);
  return def ? def.type : null;
}

// 4T-000497: Folge-Symbol der Toggling-Kette. Basis bleibt fest
// (' ' -> 'x' -> ' '); erweiterte Status folgen ihrem konfigurierten
// Folge-Symbol (Default 'x' = Abschliessen, verhaltensgleich zum
// Bestand). null fuer unbekannte Zeichen.
function taskToggleTarget(ch) {
  if (ch === ' ') return 'x';
  if (ch === 'x' || ch === 'X') return ' ';
  const def = activeTaskStates.get(ch);
  return def ? def.next : null;
}

// 4T-000502 (Epic 3E-000096): Status-Typ-Resolver aus der Persistenz-Form des
// taskStates-Stores (toStoredTaskStates in task-states.js) — fuer den Main-
// Query-Pfad des TASKS-Scopes, der nicht an der konfigurierten Pipeline-
// Instanz (activeTaskStates) haengt. Merge-Regeln wie der Renderer
// (resolveStoredTaskStates, ohne Labels/Farben): builtin ueber `name` gegen
// das Default-Set, Custom-Eintraege validiert, nur aktivierte Eintraege
// zaehlen. Basis-Zeichen sind fest (' ' = TODO, 'x'/'X' = DONE); unbekannte
// oder deaktivierte Zeichen liefern null (keine Status-Semantik).
function createTaskStatusTypeResolver(stored) {
  const map = new Map();
  const storedArr = Array.isArray(stored) ? stored.filter((s) => s && typeof s === 'object') : [];
  const byName = new Map();
  const custom = [];
  for (const s of storedArr) {
    if (s.builtin && typeof s.name === 'string') byName.set(s.name, s);
    else if (!s.builtin) custom.push(s);
  }
  for (const d of TASK_STATE_DEFAULTS) {
    const o = byName.get(d.name);
    if (o ? o.enabled === false : !d.enabled) continue;
    map.set(d.char, o && TASK_STATE_TYPES.includes(o.type) ? o.type : d.type);
  }
  for (const c of custom) {
    const ch = String(c.char || '');
    if (ch.length !== 1 || TASK_STATE_FORBIDDEN_CHARS.has(ch)) continue;
    if (map.has(ch) || c.enabled === false) continue;
    map.set(ch, normalizeTaskStateType(c.type));
  }
  return (ch) => {
    if (ch === ' ') return 'TODO';
    if (ch === 'x' || ch === 'X') return 'DONE';
    return map.get(ch) || null;
  };
}

// K-06 (4T-000307): Task-Status-Farben stammen aus den Nutzer-Settings, nicht
// aus fremdem Markdown, fliessen aber in einen Inline-Style. Defense-in-Depth:
// nur Hex, rgb()/rgba() und benannte Farben zulassen; sonst auf currentColor
// zurueckfallen, damit ein Wert wie 'red;<property>' keine weiteren CSS-
// Deklarationen einschleusen kann.
const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]+)$/;
function sanitizeCssColor(color) {
  const value = String(color == null ? '' : color).trim();
  return CSS_COLOR_RE.test(value) ? value : 'currentColor';
}

// Core-Ruler-Postprocessor nach dem Inline-Parsing: Listen-Items, deren
// Inline-Text mit `[<char>] ` fuer ein aktiviertes Zeichen beginnt (und
// die markdown-it-task-lists mangels ` `/`x` unveraendert liess),
// werden zur Status-Box transformiert. data-source-line bleibt erhalten
// (sourceLineMapper laeuft als gepushter Core-Ruler danach), der
// Toggle-Pfad im Renderer findet die Quell-Zeile darueber. Nicht
// aktivierte Zeichen bleiben sichtbarer Roh-Text (bewusste Abgrenzung).
function extendedTaskStatesPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  mdInstance.core.ruler.after('inline', 'extended_task_states', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const first = inline.children && inline.children[0];
      if (!first || first.type !== 'text') continue;
      const m = first.content.match(/^\[(.)\][ \t]/);
      if (!m) continue;
      const def = activeTaskStates.get(m[1]);
      if (!def) continue;
      const li = tokens[i - 2];
      li.attrJoin('class', 'task-list-item task-state-item');
      li.attrSet('data-task-state', m[1]);
      first.content = first.content.slice(m[0].length);
      const box = new state.Token('html_inline', '', 0);
      const glyph = escapeHtml(m[1]);
      const title = escapeHtml(def.label);
      const color = escapeHtml(sanitizeCssColor(def.color));
      if (isPortable) {
        // Vollstaendige inline-Styles — beim Empfaenger gibt es kein
        // Stylesheet (Muster der uebrigen Portable-Rules).
        box.content = `<span class="task-state-box" title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:1.1em;height:1.1em;border:1.5px solid ${color};border-radius:3px;color:${color};font-weight:700;font-size:0.85em;line-height:1;margin-right:0.4em;vertical-align:text-bottom;">${glyph}</span>`;
      } else {
        // Viewer: Farbe als CSS-Custom-Property, Optik kommt aus
        // styles.css (.task-state-box); title liefert das Label-Tooltip.
        box.content = `<span class="task-state-box" data-task-state="${glyph}" title="${title}" style="--task-state-color:${color}">${glyph}</span>`;
      }
      inline.children.unshift(box);
    }
  });
}

// ---------------------------------------------------------------------------
// 4T-000498 (Epic 3E-000090): Task-Marker-Darstellung der Erweiterung
// "Aufgaben". Symbol-Marker am Zeilenende von Task-Zeilen (Termine,
// Prioritaet, Wiederholung, ID/Abhaengigkeiten) rendern als dezente
// Badges statt Roh-Text. Ein Core-Ruler per push — er laeuft nach
// task-lists, extended_task_states und source_line_mapper, findet also
// fertig klassifizierte Task-Items vor.
//
// Erkennungs-Grundlage ist die ROH-Quellzeile (li.map auf state.src),
// nicht der Token-Text: der Global Filter muss auch Filter-Strings
// treffen, die Inline-Regeln bereits umgebaut haben (z.B. #tag ->
// Tag-Link). Die Badge-Ersetzung selbst arbeitet auf dem letzten
// Text-Child des Inline-Tokens — Marker stehen als Klartext am
// Zeilenende und landen dort.
//
// Konfiguration kommt wie bei configureTaskStates von aussen
// (Renderer: Settings + lokalisierte Labels); das Modul startet mit
// deutschen Default-Labels und leerem Filter — Unit-/Snapshot-Tests
// laufen deterministisch ohne Store.

const TASK_MARKER_DEFAULT_LABELS = {
  due: 'Fällig',
  scheduled: 'Geplant',
  start: 'Start',
  created: 'Erstellt',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
  recurrence: 'Wiederholung',
  id: 'ID',
  dependsOn: 'Abhängig von',
  reminder: 'Erinnerung',
  priority: {
    highest: 'Höchste Priorität',
    high: 'Hohe Priorität',
    medium: 'Mittlere Priorität',
    low: 'Niedrige Priorität',
    lowest: 'Niedrigste Priorität',
  },
};

let taskMarkersConfig = {
  globalFilter: '',
  hideGlobalFilter: false,
  labels: TASK_MARKER_DEFAULT_LABELS,
};

function configureTaskMarkers(cfg) {
  const labels = cfg && typeof cfg.labels === 'object' && cfg.labels ? cfg.labels : null;
  taskMarkersConfig = {
    globalFilter: String((cfg && cfg.globalFilter) || '').trim(),
    hideGlobalFilter: !!(cfg && cfg.hideGlobalFilter),
    labels: labels ? { ...TASK_MARKER_DEFAULT_LABELS, ...labels } : TASK_MARKER_DEFAULT_LABELS,
  };
}

function getTaskMarkersConfig() {
  return taskMarkersConfig;
}

// Ueberfaellig: Faellig-Termin liegt vor dem Zeitpunkt now (Datum-only:
// vor heute; mit Uhrzeit: heute und Uhrzeit vorbei). Ungueltige Werte
// sind nie ueberfaellig.
function isDueOverdue(value, now = new Date()) {
  if (!value || value.invalid) return false;
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (value.date < today) return true;
  if (value.date > today) return false;
  if (!value.time) return false;
  return value.time < `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Badge-Beschreibung eines Marker-Segments: { cls, title, text } —
// gemeinsame Quelle fuer den Render-/Portable-Pfad (taskMarkerBadgeHtml)
// und die Live-Widgets (Paritaets-Garantie). Anzeige in kanonischer Form
// (Symbol plus geparster Wert); der Quelltext behaelt seine
// Roh-Schreibweise (Round-Trip-Garantie des Marker-Kerns).
function taskMarkerBadgeSpec(seg, labels) {
  let cls = 'task-marker';
  let title = '';
  let text;
  if (seg.kind === 'date') {
    const overdue = seg.field === 'due' && isDueOverdue(seg.value);
    cls += ` task-marker-date task-marker-${seg.field}`;
    if (seg.value.invalid) cls += ' task-marker-invalid';
    if (overdue) cls += ' task-marker-overdue';
    title = String(labels[seg.field] || '');
    text = `${taskMarkers.DATE_MARKER_SYMBOLS[seg.field]} ${seg.value.date}${
      seg.value.time ? ` ${seg.value.time}` : ''
    }`;
  } else if (seg.kind === 'priority') {
    cls += ' task-marker-priority';
    title = String((labels.priority && labels.priority[seg.level]) || '');
    text = taskMarkers.PRIORITY_MARKER_SYMBOLS[seg.level];
  } else if (seg.kind === 'recurrence') {
    cls += ' task-marker-recurrence';
    title = String(labels.recurrence || '');
    text = `${taskMarkers.RECURRENCE_SYMBOL} ${seg.text}`;
  } else if (seg.kind === 'id') {
    cls += ' task-marker-other';
    title = String(labels.id || '');
    text = `${taskMarkers.ID_SYMBOL} ${seg.id}`;
  } else if (seg.kind === 'dependsOn') {
    cls += ' task-marker-other';
    title = String(labels.dependsOn || '');
    text = `${taskMarkers.DEPENDS_SYMBOL} ${seg.ids.join(', ')}`;
  } else if (seg.kind === 'reminder') {
    // 4T-000525 (Epic 3E-000095): Erinnerungs-Badge in kanonischer Form
    // (Melde-Zeitpunkt; bewusst ohne Ueberfaellig-Faerbung — Ueberfaellig-
    // Behandlung ist Sache des Erinnerungs-Systems, nicht der Anzeige).
    cls += ' task-marker-reminder';
    if (seg.value.invalid) cls += ' task-marker-invalid';
    title = String(labels.reminder || '');
    text = `${taskMarkers.REMINDER_SYMBOL} ${seg.value.date}${
      seg.value.time ? ` ${seg.value.time}` : ''
    }`;
  } else {
    // Toleranz-Marker (Abschluss-Aktion, nackter Wecker): neutral gedimmt,
    // Roh-Inhalt ohne fuehrenden Weissraum.
    cls += ' task-marker-other';
    text = seg.raw.replace(/^[ \t]+/, '');
  }
  return { cls, title, text };
}

// Badge-HTML eines Marker-Segments. Viewer: Klassen + styles.css;
// Portable: vollstaendige Inline-Styles (Muster Status-Box).
function taskMarkerBadgeHtml(seg, isPortable, labels) {
  const { cls, title, text } = taskMarkerBadgeSpec(seg, labels);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  if (isPortable) {
    const extra = cls.includes('task-marker-overdue')
      ? 'border-color:#dc3545;color:#b02a37;'
      : cls.includes('task-marker-invalid')
        ? 'border-color:#dc3545;color:#b02a37;text-decoration:line-through;'
        : '';
    return (
      `<span class="${cls}"${titleAttr} style="display:inline-block;margin-left:0.45em;` +
      `padding:0 0.35em;border:1px solid #bbb;border-radius:0.7em;font-size:0.82em;` +
      `color:#555;white-space:nowrap;${extra}">${escapeHtml(text)}</span>`
    );
  }
  return `<span class="${cls}"${titleAttr}>${escapeHtml(text)}</span>`;
}

// Core-Ruler: Task-Items finden, Global Filter pruefen, Marker-Segmente
// des letzten Text-Childs durch Badges ersetzen.
function taskMarkersPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);
  mdInstance.core.ruler.push('task_markers', (state) => {
    const cfg = taskMarkersConfig;
    let srcLines = null;
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline' || !inline.children) continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const li = tokens[i - 2];
      const cls = String(li.attrGet('class') || '');
      if (!cls.includes('task-list-item')) continue;
      // NON_TASK-Status: Zeile gilt nicht als Task (Workshop-Punkt 4).
      const stateChar = li.attrGet('data-task-state');
      if (stateChar && taskStatusType(stateChar) === 'NON_TASK') continue;
      // Global Filter auf der Roh-Quellzeile (li.map ist 0-basiert auf
      // state.src; Inline-Umbauten wie Tag-Links verfaelschen sonst).
      if (cfg.globalFilter !== '') {
        if (srcLines === null) srcLines = state.src.split('\n');
        const rawLine = li.map ? srcLines[li.map[0]] : null;
        if (rawLine == null || !taskMarkers.isTaskLine(rawLine, cfg.globalFilter)) continue;
      }
      // Marker-Segmente aus dem letzten Text-Child.
      const children = inline.children;
      let lastTextIdx = -1;
      for (let c = children.length - 1; c >= 0; c--) {
        if (children[c].type === 'text') {
          lastTextIdx = c;
          break;
        }
      }
      if (lastTextIdx >= 0) {
        const lastText = children[lastTextIdx];
        const parsed = taskMarkers.parseMarkerSegments(lastText.content);
        if (parsed.segments.length > 0) {
          lastText.content = parsed.description;
          const badges = parsed.segments.map((seg) => {
            const tok = new state.Token('html_inline', '', 0);
            tok.content = taskMarkerBadgeHtml(seg, isPortable, cfg.labels);
            return tok;
          });
          children.splice(lastTextIdx + 1, 0, ...badges);
        }
      }
      // Ausblende-Option: erstes Vorkommen des Filter-Strings aus dem
      // Beschreibungs-Text entfernen (nur wenn er als Klartext vorliegt;
      // von Inline-Regeln umgebaute Filter bleiben sichtbar).
      if (cfg.hideGlobalFilter && cfg.globalFilter !== '') {
        for (const child of children) {
          if (child.type !== 'text') continue;
          if (!child.content.includes(cfg.globalFilter)) continue;
          child.content = taskMarkers.stripGlobalFilter(child.content, cfg.globalFilter);
          break;
        }
      }
    }
  });
}

module.exports = {
  TASK_STATE_DEFAULTS,
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  TASK_STATE_NEXT_FORBIDDEN_CHARS,
  configureTaskStates,
  getActiveTaskStates,
  taskStatusType,
  taskToggleTarget,
  createTaskStatusTypeResolver,
  extendedTaskStatesPlugin,
  configureTaskMarkers,
  getTaskMarkersConfig,
  taskMarkersPlugin,
  taskMarkerBadgeSpec,
  isDueOverdue,
};
