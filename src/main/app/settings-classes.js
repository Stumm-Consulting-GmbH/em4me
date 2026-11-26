// 4T-002649 (Epic 3E-000416): Die Tabelle der Einstellungs-Schlüssel in drei
// Klassen und die Prüfung eines Schreib-Wunschs aus dem Fenster
// (Lösungsansatz der Aufgabe, Punkte 1 bis 4; Konzept-Stufe 4T-002645,
// Befund 6, Nachweis N4).
//
// **Wozu.** Der allgemeine Einstellungs-Weg `settings:set` nahm bis hierher
// jeden Schlüssel mit jedem Wert an, auch die Liste der bestätigten Add-ons,
// die Sitzung und die Ordner-Einstellungen. Diese Tabelle sagt je Schlüssel,
// ob das Fenster ihn über den allgemeinen Weg schreiben darf und mit welcher
// Art von Wert.
//
// **Die drei Klassen.**
//   - Klasse 1, Darstellung und Verhalten: Das Fenster schreibt sie über
//     `settings:set`, aber nur mit einem Wert der erklärten Art. Dazu gehören
//     die Schalter der internen Erweiterungen, `restoreSession` und der eigene
//     Speicher eines Add-ons (`extensionData.<id>`).
//   - Klasse 2, Erlaubnisse: Bestätigung, Einschalten und Fehler-Stand der
//     Add-ons und der Schalter der Skript-Blöcke. Der allgemeine Weg weist sie
//     ab; sie schreibt allein der Hauptprozess über eigene Kanäle
//     (`extensions:confirmTrust`, `extensions:setEnabled`,
//     `extensions:reportError`, `settings:setScriptsRun`; 4T-002650). Der
//     Übergangs-Schalter, der sie bis dahin offen hielt, ist mit 4T-002650
//     entfallen.
//   - Klasse 3, Pfade, Sitzung und Listen: Der allgemeine Weg weist sie ab.
//     Sitzung und Listen schreibt der Hauptprozess selbst; der Vorlagen-Ordner
//     hat `templates:setGlobalConfig`, der Workflow-Ordner `workflow:setFolder`.
//
// **Positiv-Liste, kein Ausschluss.** Ein Schlüssel, den die Tabelle nicht
// kennt, wird abgewiesen. Klasse 1 nennt genaue Schlüssel und wenige Familien
// mit fester Form des Rests; kein Eintrag der Klasse 1 liegt über oder unter
// einem Schlüssel der Klassen 2 und 3, sonst wirft das Laden. Grund: Der
// Speicher liest Punkte als Pfad, `templates` als Ganzes überschriebe also
// auch `templates.folder`.
//
// **Wo die Werte-Art herkommt.** Gelesen an den Schreib-Stellen des
// Anzeige-Codes (Liste A der Erhebung vom 2026-11-13, am 2026-11-22 neu
// gezogen). Wo eine geteilte Liste die Werte führt, liest die Tabelle sie
// dort (Auswahl der PDF-Ausgabe, Modi der Uhr, Vorgaben der Kanban-Tafel),
// statt sie abzuschreiben. Zahlen-Bereiche, die allein der Anzeige-Code als
// Konstante führt, stehen hier bewusst nicht: Eine zweite Fassung liefe
// auseinander (Fehlerklasse L5); geprüft wird dort nur, dass es eine endliche
// Zahl ist.
//
// Electron-frei; eigener Zustand: keiner.
'use strict';

const { SPELLCHECK_KEY } = require('../../shared/spellcheck');
const { TOUR_SEEN_KEY } = require('../../shared/erststart');
const { COLOR_SCHEMES_KEY } = require('../../shared/color-schemes');
const { EXTENSIONS_DISABLED_KEY } = require('../../shared/extensions/extensions');
const { EXTENSION_MODES_KEY } = require('../../shared/extensions/extension-modes');
const {
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ERRORS_KEY,
  EXTENSION_DATA_PREFIX,
  EXTENSION_ID_RE,
} = require('../../shared/extensions/extensions-external');
const { FORMAT_TOOLBAR_KEY } = require('../../shared/format-toolbar');
const { COMMAND_PLACEMENT_KEY } = require('../../shared/commands/command-placement');
const { PRESENTATION_THEMES_KEY } = require('../../shared/presentation/presentation-eigene-themes');
const { CLOCK_ALARMS_KEY } = require('../../shared/clock/clock-alarms');
const { CLOCK_TIMERS_KEY, CLOCK_STOPWATCH_KEY } = require('../../shared/clock/clock-timers');
const {
  CLOCK_OPTIONS_KEY,
  CLOCK_MODES,
  CLOCK_MODE_KEYS,
} = require('../../shared/clock/clock-options');
const { PDF_PAGE_SIZES, PDF_MARGIN_PRESETS } = require('../../shared/pdf-options');
const { KANBAN_VORGABEN } = require('../../shared/kanban-anzeige');

const DISPLAY = 1;
const PERMISSION = 2;
const PROTECTED = 3;

// Höchstlänge eines Schlüssels; ein längerer ist kein Schlüssel dieser Tabelle.
const MAX_KEY_LENGTH = 200;

// --- Arten von Werten ------------------------------------------------------------
const bool = () => ({ kind: 'boolean' });
const num = (integer = false) => ({ kind: 'number', integer });
const text = (max, pattern) => ({ kind: 'string', max, ...(pattern ? { pattern } : {}) });
const oneOf = (values) => ({ kind: 'enum', values: Object.freeze([...values]) });
const obj = () => ({ kind: 'object' });
const list = (items) => ({ kind: 'array', ...(items ? { items } : {}) });
// Nur `null`: die beiden Aufräum-Schreibungen alter Schlüssel.
const onlyNull = () => ({ kind: 'null' });

// Sprache: mitgelieferter Code oder eingespielte eigene Sprache `custom:<code>`
// (Muster des Codes wie `localeDateiIn` in `custom-locales.js`).
const LANGUAGE_RE = /^(?:[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*|custom:[a-zA-Z0-9-]{1,35})$/;

// Die Seitenleisten-Panels mit Sichtbarkeit je Spalte (`<panel>.visibleColumn0/1`).
const PANELS_WITH_VISIBILITY = Object.freeze([
  'areaPanel',
  'backlinks',
  'blockProps',
  'bookPanel',
  'bookmarks',
  'calendar',
  'canvasList',
  'clockPanel',
  'fileGraph',
  'notes',
  'outgoing',
  'outline',
  'properties',
  'remindersPanel',
  'searchResults',
  'subpages',
  'tags',
]);

/** Klasse 1: genaue Schlüssel und die Art ihres Werts. */
const DISPLAY_KEYS = Object.freeze({
  // Datei-Menü, Fenster und Sitzung
  autoSave: bool(),
  restoreSession: bool(),
  focusMode: bool(),
  typewriterScroll: bool(),
  language: text(64, LANGUAGE_RE),
  [TOUR_SEEN_KEY]: bool(),
  sidebarCollapsed: obj(),
  'app.fileSettings': onlyNull(),
  'app.defaultViewMode': oneOf(['rendered', 'split', 'source', 'live']),
  'app.editViewMode': oneOf(['split', 'source', 'live']),
  // Lesezeichen
  bookmarksTree: list(),
  bookmarks: onlyNull(),
  'bookmarks.sortMigrationDone': bool(),
  'bookmarks.areaFirst': bool(),
  // Darstellung
  'appearance.editorFont': text(200),
  'appearance.renderFont': text(200),
  'appearance.editorSize': num(true),
  'appearance.renderSize': num(true),
  'appearance.contentWidth': num(true),
  'appearance.roundedTabs': bool(),
  'appearance.highlightActiveLine': bool(),
  'render.showFrontmatter': bool(),
  'render.frontmatterExpanded': bool(),
  'render.headingNumbering': obj(),
  'render.mindmap': obj(),
  'notes.previewByDefault': bool(),
  [COLOR_SCHEMES_KEY]: obj(),
  [PRESENTATION_THEMES_KEY]: obj(),
  shelfViewModes: obj(),
  // Editor und Eingabe
  'editor.defaultWrapLines': bool(),
  'editor.defaultLineNumbers': bool(),
  'editor.defaultFoldGutter': bool(),
  'editor.listFoldTrackPosition': oneOf(['aussen', 'struktur']),
  [SPELLCHECK_KEY]: bool(),
  'input.tabIndents': bool(),
  'input.cursorSprung': bool(),
  'input.pasteUrlAsLink': bool(),
  hotkeys: obj(),
  [FORMAT_TOOLBAR_KEY]: obj(),
  [COMMAND_PLACEMENT_KEY]: obj(),
  searchCaseSensitive: bool(),
  searchUseRegex: bool(),
  // Verhalten
  renameUpdateLinks: bool(),
  renameLinkPreview: bool(),
  keepUnsavedDrafts: bool(),
  historyEnabled: bool(),
  historyMaxPacketMinutes: num(),
  historyInactivityMinutes: num(),
  'frontmatter.createdEnabled': bool(),
  'frontmatter.createdField': text(200),
  'frontmatter.updatedEnabled': bool(),
  'frontmatter.updatedField': text(200),
  'frontmatter.timestampFormat': oneOf(['date', 'datetime']),
  'frontmatter.autoCreateField': bool(),
  'export.folien.notizen': bool(),
  'export.pdf.pageSize': oneOf(PDF_PAGE_SIZES),
  'export.pdf.landscape': bool(),
  'export.pdf.margins': oneOf(Object.keys(PDF_MARGIN_PRESETS)),
  taskStates: list(),
  tasksConfig: obj(),
  remindersConfig: obj(),
  // Erweiterungen
  [EXTENSIONS_DISABLED_KEY]: list(text(200)),
  [EXTENSION_MODES_KEY]: list(),
  // Seitenleiste und Statusleiste
  'panelToggle.order': list(text(200)),
  'sidebar.heightMode': oneOf(['panel', 'group']),
  'sidebar.groupHeights': obj(),
  'sidebar.panelHeights': obj(),
  'sidebar.layout': obj(),
  'sidebar.layoutVariants': list(),
  'sidebar.activeByColumn': obj(),
  'sidebar.iconHeadings': bool(),
  'sidebar.widthLeft': num(true),
  'sidebar.widthRight': num(true),
  'statusbar.unavailableMode': oneOf(['blass', 'ausgeblendet']),
  'statusbar.collapseMode': oneOf(['auto', 'always']),
  // Uhr
  [CLOCK_ALARMS_KEY]: list(),
  [CLOCK_TIMERS_KEY]: list(),
  [CLOCK_STOPWATCH_KEY]: obj(),
  [CLOCK_OPTIONS_KEY]: obj(),
  ...Object.fromEntries(CLOCK_MODE_KEYS.map((key) => [key, oneOf(CLOCK_MODES)])),
  // Kanban-Tafel: die Vorgaben aus ihrer geteilten Liste.
  ...Object.fromEntries(
    KANBAN_VORGABEN.map((v) => [v.schluessel, v.art === 'zahl' ? num(true) : bool()]),
  ),
  // Sichtbarkeit der Panels je Spalte
  ...Object.fromEntries(
    PANELS_WITH_VISIBILITY.flatMap((panel) => [
      [`${panel}.visibleColumn0`, bool()],
      [`${panel}.visibleColumn1`, bool()],
    ]),
  ),
});

/**
 * Klasse 1: Familien `<prefix>.<rest>`; der Rest muss dem Muster genügen und
 * enthält damit keinen Punkt, kommt also nicht tiefer in den Speicher.
 */
const DISPLAY_FAMILIES = Object.freeze([
  Object.freeze({ prefix: EXTENSION_DATA_PREFIX, rest: EXTENSION_ID_RE, value: obj() }),
]);

/** Klasse 2: Erlaubnisse; der allgemeine Weg weist sie ab (4T-002650). */
const PERMISSION_KEYS = Object.freeze([
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_ERRORS_KEY,
  'scripts.run',
]);

/** Klasse 3: Pfade, Sitzung und Listen. */
const PROTECTED_KEYS = Object.freeze([
  'templates.folder',
  'templates.rules',
  'workflows.folder',
  'apps',
  'workspaces',
  'windows',
  'panes',
  'openTabs',
  'recentFiles',
  'recentAreas',
  'recentBooks',
  'recentShelves',
  'memoryEntries',
]);

// Liegt `a` über, unter oder auf `b` (Punkt-Pfade des Speichers)?
function related(a, b) {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

// Beim Laden: Klasse 1 berührt keinen Schlüssel der Klassen 2 und 3.
function assertSeparated() {
  const guarded = [...PERMISSION_KEYS, ...PROTECTED_KEYS];
  const display = [...Object.keys(DISPLAY_KEYS), ...DISPLAY_FAMILIES.map((f) => f.prefix)];
  for (const key of display) {
    const hit = guarded.find((g) => related(key, g));
    if (hit) throw new TypeError(`Einstellungs-Klassen: ${key} berührt ${hit}`);
  }
}
assertSeparated();

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Hat der Wert die erklärte Art?
 *
 * @param {object} kind Art aus der Tabelle.
 * @param {*} value
 * @returns {boolean}
 */
function matchesKind(kind, value) {
  switch (kind.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (!kind.integer || Number.isInteger(value))
      );
    case 'string':
      return (
        typeof value === 'string' &&
        value.length <= kind.max &&
        (!kind.pattern || kind.pattern.test(value))
      );
    case 'enum':
      return kind.values.includes(value);
    case 'object':
      return isPlainObject(value);
    case 'array':
      return (
        Array.isArray(value) && (!kind.items || value.every((v) => matchesKind(kind.items, v)))
      );
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/**
 * Klasse und Art eines Schlüssels; `null`, wenn die Tabelle ihn nicht kennt.
 * Ein Schlüssel über oder unter einem der Klassen 2 und 3 gehört zu deren
 * Klasse, damit der Grund der Abweisung stimmt.
 *
 * @param {*} key
 * @returns {{klass: 1|2|3, value?: object}|null}
 */
function classOf(key) {
  if (typeof key !== 'string' || key === '' || key.length > MAX_KEY_LENGTH) return null;
  if (Object.prototype.hasOwnProperty.call(DISPLAY_KEYS, key)) {
    return { klass: DISPLAY, value: DISPLAY_KEYS[key] };
  }
  for (const family of DISPLAY_FAMILIES) {
    if (
      key.startsWith(`${family.prefix}.`) &&
      family.rest.test(key.slice(family.prefix.length + 1))
    ) {
      return { klass: DISPLAY, value: family.value };
    }
  }
  if (PERMISSION_KEYS.some((k) => related(key, k))) return { klass: PERMISSION };
  if (PROTECTED_KEYS.some((k) => related(key, k))) return { klass: PROTECTED };
  return null;
}

/**
 * Darf das Fenster diesen Wert über den allgemeinen Weg schreiben?
 *
 * @param {*} key Schlüssel aus dem Aufruf.
 * @param {*} value Wert aus dem Aufruf.
 * @returns {{ok: true}|{ok: false, reason: string}} `reason` ist einer von
 *   `invalidKey`, `unknownKey`, `permission`, `protected`, `invalidValue`.
 */
function checkWindowWrite(key, value) {
  if (typeof key !== 'string' || key === '') return { ok: false, reason: 'invalidKey' };
  const entry = classOf(key);
  if (!entry) return { ok: false, reason: 'unknownKey' };
  if (entry.klass === PROTECTED) return { ok: false, reason: 'protected' };
  if (entry.klass === PERMISSION) return { ok: false, reason: 'permission' };
  if (!matchesKind(entry.value, value)) return { ok: false, reason: 'invalidValue' };
  return { ok: true };
}

module.exports = {
  DISPLAY,
  PERMISSION,
  PROTECTED,
  DISPLAY_KEYS,
  DISPLAY_FAMILIES,
  PERMISSION_KEYS,
  PROTECTED_KEYS,
  classOf,
  related,
  matchesKind,
  checkWindowWrite,
};
