// 4T-001587 (Story 4S-000904, Epic 3E-000160): Die eine Liste der Datenarten,
// die der Ex- und Import kennt.
//
// **Warum eine Registry und nicht je Datenart eine Stelle im Code:** Ausgabe,
// Einlesen, Auswahl-Liste und Prüffälle brauchen dieselbe Antwort auf die Frage,
// was zur Einrichtung gehört. Vier Kopien liefen unweigerlich auseinander
// (Fehlerklasse L5, Doppel-Mechanismen ohne gemeinsame Heimat). Eine neue
// Datenart kommt deshalb hier hinzu und nirgends sonst.
//
// **Das Kriterium ist «global»** (Entscheidung des Product Owners vom
// 2026-09-08, Architekturentscheidung 4 des Epics): Aufgenommen wird, was im
// globalen Speicher liegt und einen Rechner-Wechsel deshalb nicht von selbst
// übersteht. Bereichsgebundenes wandert mit seinem Ordner ohnehin mit — mit
// **einer benannten Ausnahme**, den Kalender-Systemen, deren Weitergabe von
// Bereich zu Bereich ein eigener Anwendungsfall ist und nicht Sicherung.
//
// **Die Sammlung ist fail-closed, und das ist die tragende Eigenschaft dieser
// Datei.** Ausgegeben wird ausschließlich, was hier als Pfad steht; ein
// Schlüssel, den niemand hier eingetragen hat, verlässt den Rechner nicht. Damit
// ist der gefährliche Fall — ein künftiger Schlüssel mit Sitzungs-, Maschinen-
// oder Zugangs-Bezug rutscht unbemerkt in eine Datei, die der Anwender
// weitergibt — technisch ausgeschlossen und nicht bloß durch Sorgfalt vermieden.
// Der Preis ist der umgekehrte Fall: Eine neue Einstellung reist erst mit, wenn
// sie hier eingetragen ist. Er ist bewusst gewählt, weil er sichtbar und
// harmlos ist, während der andere unsichtbar und schädlich wäre.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron, kein
// DOM): Der Hauptprozess sammelt damit, der Renderer beschriftet damit seine
// Auswahl-Liste, und die Prüffälle laden es ohne Umgebung.
'use strict';

const { normalizeCalendarConfig } = require('./calendar/calendar-config.js');

// Schlüssel des globalen Speichers, die zur Datenart «Einstellungen» gehören.
//
// Die Auswahl folgt der Frage «hat der Anwender das eingerichtet, oder ist es
// dem Rechner oder der Sitzung zugewachsen?». Drinnen sind Verhalten,
// Darstellung und die Konfiguration der Funktionen; draußen bleiben
// Sitzungs-Stand (offene Reiter, Fenster-Geometrie, Zuletzt-Listen),
// maschinengebundene Angaben (Arbeitsbereiche und Bereiche mit ihren absoluten
// Pfaden, gesehene Touren, Vertrauens-Entscheidungen über fremde
// Erweiterungen) und laufende Zustände (Uhr-Timer, Stoppuhr).
//
// Der Sitzungs-Stand ist nicht bloß nutzlos, sondern schädlich: Er trägt
// absolute Pfade des Herkunfts-Rechners, die auf dem Ziel-Rechner ins Leere
// zeigen. Und die Vertrauens-Entscheidung über eine externe Erweiterung ist je
// Rechner zu treffen; sie mitzunehmen hieße, sie auf dem Ziel-Rechner
// vorwegzunehmen.
const SETTINGS_PATHS = [
  // Sprache, Erscheinungsbild, Editor und Ansicht
  'language',
  'themePref',
  'appearance',
  'editor',
  'render',
  'input',
  'app',
  'typewriterScroll',
  // Verhalten
  'autoSave',
  'restoreSession',
  'keepUnsavedDrafts',
  'renameUpdateLinks',
  'renameLinkPreview',
  'historyEnabled',
  'historyMaxPacketMinutes',
  'historyInactivityMinutes',
  'attachments',
  'frontmatter',
  'export',
  'scripts',
  // Funktions-Konfiguration
  'tasksConfig',
  'taskStates',
  'remindersConfig',
  'calendar',
  'clock.options',
  // Suche
  'searchCaseSensitive',
  'searchUseRegex',
  // Spalten- und Anzeige-Vorlieben der Panels
  'areaPanel',
  'backlinks',
  'blockProps',
  'bookPanel',
  'bookmarks.areaFirst',
  'bookmarks.visibleColumn0',
  'bookmarks.visibleColumn1',
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
];

// Schlüssel, die ausdrücklich NIE ausgegeben werden, mit ihrem Grund.
//
// Die Sammlung braucht diese Liste nicht — sie ist fail-closed und gibt ohnehin
// nur aus, was in einer Datenart steht. Sie steht hier, weil ein Leser sonst
// nicht unterscheiden könnte, ob ein Schlüssel bewusst draußen ist oder bloß
// vergessen wurde, und weil ein Prüffall gegen sie hält.
const NEVER_EXPORTED = {
  apps: 'Sitzungs-Stand: offene Applikationen mit ihren Fenstern und Reitern.',
  workspaces: 'Maschinengebunden: Arbeitsbereiche mit absoluten Pfaden.',
  windows: 'Sitzungs-Stand (Altformat der Fenster-Liste).',
  openTabs: 'Sitzungs-Stand: offene Reiter mit absoluten Pfaden.',
  panes: 'Sitzungs-Stand: Aufteilung der Arbeitsfläche.',
  windowBounds: 'Maschinengebunden: Fenster-Geometrie des Bildschirms.',
  windowMaximized: 'Maschinengebunden: Fenster-Zustand.',
  recentFiles: 'Maschinengebunden: Zuletzt-Liste mit absoluten Pfaden.',
  recentAreas: 'Maschinengebunden: Zuletzt-Liste mit absoluten Pfaden.',
  recentBooks: 'Maschinengebunden: Zuletzt-Liste mit absoluten Pfaden.',
  recentShelves: 'Maschinengebunden: Zuletzt-Liste mit absoluten Pfaden.',
  memoryEntries: 'Maschinengebunden: Gefäß-Liste mit absoluten Pfaden (4T-001602).',
  shelfViewModes: 'Maschinengebunden: Ansichts-Modus je Regal-Pfad.',
  tourSeen: 'Maschinengebunden: welche Einführung dieser Rechner gezeigt hat.',
  sidebarCollapsed: 'Augenblicks-Zustand der Seitenleiste, keine Einrichtung.',
  focusMode: 'Augenblicks-Zustand des Fokus-Modus, keine Einrichtung.',
  'clock.alarms': 'Persönlicher Betriebs-Stand, kein Einrichtungs-Merkmal.',
  'clock.timers': 'Laufender Zustand: Timer mit Restlaufzeit.',
  'clock.stopwatch': 'Laufender Zustand der Stoppuhr.',
  'bookmarks.sortMigrationDone':
    'Migrations-Marke des Rechners; mitgenommen unterdrückte sie eine fällige Migration auf dem Ziel-Rechner.',
  'extensionsExternal.trusted':
    'Vertrauens-Entscheidung über fremden Code, je Rechner zu treffen (Befund B5).',
  'extensionsExternal.lastError': 'Vorübergehender Fehler-Stand eines Ladeversuchs.',
  extensionData:
    'Freier Ablage-Raum externer Erweiterungen — der Bestand, den die Anwendung gerade nicht kennt (Befund B5). Seit 4T-001589 nicht nur unerwähnt, sondern ausdrücklich ausgeschlossen: Der Filter in exchange-collect.js entfernt den Namensraum als Ganzes, auch wenn eine künftige Datenart ihn nennt.',
};

// Zahl der Einträge einer Datenart. Bewusst je Datenart eine eigene Regel statt
// einer allgemeinen: Eine allgemeine Zählung über Schlüssel oder Listen-Länge
// meldete für die Farbschemas den Wert 3 (die drei Felder des Zustands-Objekts)
// statt der Zahl der eigenen Schemas — eine Zahl, die den Anwender in die Irre
// führte, weil AK2 sie ihm als Umfang anbietet.
function zaehleBaum(knoten) {
  if (!knoten || typeof knoten !== 'object') return 0;
  const kinder = Array.isArray(knoten) ? knoten : knoten.children || knoten.kinder || [];
  let summe = 0;
  for (const kind of Array.isArray(kinder) ? kinder : []) {
    summe += 1 + zaehleBaum(kind);
  }
  return summe;
}

function laenge(wert) {
  return Array.isArray(wert) ? wert.length : 0;
}

function schluesselZahl(wert) {
  return wert && typeof wert === 'object' && !Array.isArray(wert) ? Object.keys(wert).length : 0;
}

// Auflösung der Weg-Deklaration `at`, die weiter unten in `merge.lists` und in
// `auswahl` steht: Sie beschreibt, wo innerhalb des Pfad-Werts die benannte
// Liste liegt (`['blocks']`, `['custom']`, `['macros']`). Deklaration und
// Auflösung liegen deshalb an derselben Stelle — Ausgabe (4T-001590) und
// Einlesen (4T-001588) lesen denselben Weg, und zwei Leser desselben Wegs
// wären zwei Wahrheiten (Fehlerklasse L5).
function holeTief(objekt, weg) {
  let k = objekt;
  for (const teil of weg || []) {
    if (k === null || typeof k !== 'object') return undefined;
    k = k[teil];
  }
  return k;
}

// Setzt einen Wert auf einer Kopie; fehlende Zwischenstufen entstehen als
// Objekte. Der Aufrufer arbeitet damit nie auf dem Ist-Stand der Anwendung.
function setzeTief(objekt, weg, wert) {
  const wurzel = objekt && typeof objekt === 'object' ? objekt : {};
  if (!weg || weg.length === 0) return wert;
  let k = wurzel;
  for (let i = 0; i < weg.length - 1; i += 1) {
    const teil = weg[i];
    if (k[teil] === null || typeof k[teil] !== 'object') k[teil] = {};
    k = k[teil];
  }
  k[weg[weg.length - 1]] = wert;
  return wurzel;
}

// 4T-001590 (AK6): Ist ein eingelesener Zeitrechnungs-Block vollständig?
//
// Gemessen wird an der **bestehenden** Prüfung des Definitions-Modells und
// nicht an einer nachgebauten: `normalizeCalendarConfig` lässt einen defekten
// Block und jede defekte Zeitrechnung einzeln entfallen (Fehler-Isolation je
// Kalender, `calendar-config.js`). Genau diese Eigenschaft wird hier zur
// Prüfung umgedreht — überlebt der Block mit allen seinen Zeitrechnungen, ist
// er vollständig; fehlt auch nur eine, wäre das Ergebnis ein halber Eintrag.
//
// Ein Block OHNE Zeitrechnungen ist nicht unvollständig, sondern leer: Er
// entsteht in der Oberfläche mit dem ersten Klick auf «Block hinzufügen» und
// trägt keine halbe Definition. Er wird deshalb übernommen.
function istVollstaendigerKalenderBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
  const geprueft = normalizeCalendarConfig({ blocks: [block] });
  if (!geprueft || geprueft.blocks.length !== 1) return false;
  const roh = Array.isArray(block.calendars) ? block.calendars : [];
  return geprueft.blocks[0].calendars.length === roh.length;
}

// 4T-001588 (Epic 3E-000160): Zusammenführungs-Regel je Datenart für das
// Einlesen. **Eine Regel, zehn Anwendungen** (Entscheidung des Product Owners
// vom 2026-09-08): Ergänzt wird, was der Anwender als benannten Gegenstand
// angelegt hat; ersetzt wird, was eine Einstellung oder eine Anordnung ist.
//
// Sie steht hier und nicht im Zusammenführungs-Modul, weil sie eine Aussage
// ÜBER die Datenart ist — dieselbe Begründung, aus der schon Umfang und
// Zählung hier stehen. Eine neue Datenart wählt eine der drei Formen; die
// Formen selbst leben in `exchange-merge.js`.
//
// - `replace` — der eingelesene Wert tritt an die Stelle des vorhandenen, je
//   Pfad. Für Einstellungen (ein Wert kennt keine Mehrzahl) und für
//   Anordnungen (zwei verschränkte Anordnungen ergäben eine dritte, die
//   niemand eingerichtet hat).
// - `append` — die benannten Listen im Wert werden ergänzt, alles Übrige des
//   Werts wird ersetzt. `at` ist der Weg zur Liste innerhalb des Pfad-Werts,
//   `refs` sind Verweise daneben, die eine Umbenennung mittragen müssen.
// - `appendTree` — die Wurzel-Ebene eines Knoten-Baums wird ergänzt.
//
// `formen` erklärt, welchen Grundtyp ein Pfad tragen muss. Ein Pfad in anderer
// Form wird nicht geschrieben, sondern verworfen und im Bericht genannt — das
// ist die Absicherung gegen eine Datei aus einer neueren Programm-Fassung, in
// der eine bekannte Datenart ihre Struktur gewechselt hat.
const MERGE_REPLACE = 'replace';
const MERGE_APPEND = 'append';
const MERGE_APPEND_TREE = 'appendTree';

// Datenarten in der Reihenfolge, in der sie in Auswahl-Liste und Datei stehen.
//
// `paths` sind Pfade des globalen Speichers (Punkt-Schreibweise wie überall in
// den Einstellungen); `areaSection` benennt stattdessen eine Sektion der
// Bereichsdatei. `zaehle` bekommt die gesammelten Werte als Objekt unter genau
// diesen Pfaden und liefert die Zahl, die der Anwender in der Auswahl sieht.
const DATA_KINDS = [
  {
    id: 'settings',
    labelKey: 'exchange.kind.settings',
    paths: SETTINGS_PATHS,
    zaehle: (werte) => Object.keys(werte).length,
    // Ein Einstellungs-Wert kennt keine Mehrzahl; zwei Werte nebeneinander
    // wären kein Ergänzen, sondern ein unentschiedener Zustand.
    merge: { mode: MERGE_REPLACE },
  },
  {
    id: 'colorSchemes',
    labelKey: 'exchange.kind.colorSchemes',
    paths: ['colorSchemes'],
    zaehle: (werte) => laenge(werte.colorSchemes && werte.colorSchemes.custom),
    // Eigene Schemas sind benannte Arbeit. Die beiden Aktiv-Verweise sind
    // dagegen Einstellungen — sie werden ersetzt, ziehen aber eine
    // Umbenennung mit, damit sie nach der Zusammenführung nicht ins Leere
    // zeigen (normalizeState setzte sie sonst still auf die Vorgabe zurück).
    merge: {
      mode: MERGE_APPEND,
      lists: [
        {
          path: 'colorSchemes',
          at: ['custom'],
          idKey: 'id',
          nameKey: 'name',
          refs: [['activeLight'], ['activeDark']],
        },
      ],
    },
    formen: { colorSchemes: 'object' },
  },
  {
    id: 'hotkeys',
    labelKey: 'exchange.kind.hotkeys',
    paths: ['hotkeys'],
    zaehle: (werte) => schluesselZahl(werte.hotkeys),
    // Ein Kommando hat genau ein Kürzel.
    merge: { mode: MERGE_REPLACE },
    formen: { hotkeys: 'object' },
  },
  {
    id: 'formatToolbar',
    labelKey: 'exchange.kind.formatToolbar',
    paths: ['formatToolbar'],
    zaehle: (werte) => laenge(werte.formatToolbar),
    // Eine Anordnung.
    merge: { mode: MERGE_REPLACE },
    formen: { formatToolbar: 'object' },
  },
  {
    id: 'commandPlacement',
    labelKey: 'exchange.kind.commandPlacement',
    paths: ['commandPlacement'],
    zaehle: (werte) => schluesselZahl(werte.commandPlacement),
    // Makros sind aufgebaute Arbeit wie ein Kalender-System; Statusleisten-
    // Belegung, Kontextmenü-Sektion und Ausblend-Liste sind Anordnungen.
    merge: {
      mode: MERGE_APPEND,
      // `refPrefix`: Ein Makro wird über `macro.<Kennung>` angesprochen —
      // aus der Statusleiste, aus der Kontextmenü-Sektion, aus den Schritten
      // eines anderen Makros und aus der Format-Toolbar, also sogar aus einer
      // anderen Datenart. Bekommt es wegen einer Kollision eine neue Kennung,
      // ziehen diese Verweise mit; sonst zeigten eingelesene Schaltflächen
      // still ins Leere.
      lists: [
        {
          path: 'commandPlacement',
          at: ['macros'],
          idKey: 'id',
          nameKey: 'name',
          refPrefix: 'macro.',
        },
      ],
    },
    formen: { commandPlacement: 'object' },
  },
  {
    id: 'extensions',
    labelKey: 'exchange.kind.extensions',
    paths: ['extensions.disabled', 'extensionsExternal.enabled'],
    zaehle: (werte) =>
      laenge(werte['extensions.disabled']) + laenge(werte['extensionsExternal.enabled']),
    // Schalt-Zustand, kein Bestand: Die Vereinigung zweier Listen schaltete
    // beim Anwender etwas ab, was er eingeschaltet hatte.
    merge: { mode: MERGE_REPLACE },
    formen: { 'extensions.disabled': 'array', 'extensionsExternal.enabled': 'array' },
  },
  {
    id: 'sidebar',
    labelKey: 'exchange.kind.sidebar',
    paths: ['sidebar', 'panelToggle'],
    zaehle: (werte) => schluesselZahl(werte.sidebar) + schluesselZahl(werte.panelToggle),
    // Die Varianten sind benannte Arbeit, das übrige Layout ist Anordnung.
    merge: {
      mode: MERGE_APPEND,
      lists: [{ path: 'sidebar', at: ['layoutVariants'], idKey: 'id', nameKey: 'name' }],
    },
    formen: { sidebar: 'object', panelToggle: 'object' },
  },
  {
    id: 'templates',
    labelKey: 'exchange.kind.templates',
    paths: ['templates'],
    zaehle: (werte) => laenge(werte.templates && werte.templates.rules),
    // Der Ordner ist ein Wert, die Regeln sind eine geordnete Kette, in der
    // die Reihenfolge über den Treffer entscheidet (`matchFolderRule`).
    // Gemischt ergäbe sie eine Kette, die niemand entworfen hat.
    merge: { mode: MERGE_REPLACE },
    formen: { templates: 'object' },
  },
  {
    id: 'bookmarksTree',
    labelKey: 'exchange.kind.bookmarksTree',
    paths: ['bookmarksTree'],
    zaehle: (werte) => zaehleBaum(werte.bookmarksTree),
    merge: { mode: MERGE_APPEND_TREE, path: 'bookmarksTree' },
    formen: { bookmarksTree: 'array' },
  },
  {
    // Die benannte Ausnahme vom Kriterium «global»: bereichsgebunden, aber mit
    // eigenem Anwendungsfall (Weitergabe von Bereich zu Bereich, 4T-001590).
    id: 'calendarSystems',
    labelKey: 'exchange.kind.calendarSystems',
    areaSection: 'calendarSystems',
    // 4T-001588: Die Sektion ist `{ blocks: [...] }` und keine Liste; die
    // frühere Regel `laenge(werte.calendarSystems)` meldete deshalb IMMER
    // null, und die Zeile zeigte dauerhaft «vorhanden» statt der Anzahl.
    // Gezählt werden die Zeitrechnungen aller Blöcke — das ist, was der
    // Anwender unter einem Kalender-System versteht.
    zaehle: (werte) => {
      const blocks =
        werte.calendarSystems && Array.isArray(werte.calendarSystems.blocks)
          ? werte.calendarSystems.blocks
          : [];
      return blocks.reduce((summe, block) => summe + laenge(block && block.calendars), 0);
    },
    // Ergänzt wird auf BLOCK-Ebene: Ein Block ist in sich stimmig, seine
    // Ableitungen verweisen über `derivedFrom` nur innerhalb desselben Blocks.
    // Wandert er als Ganzes, bleiben diese Verweise unberührt.
    merge: {
      mode: MERGE_APPEND,
      lists: [
        {
          path: 'calendarSystems',
          at: ['blocks'],
          idKey: 'id',
          nameKey: 'name',
          // 4T-001590 (AK6): Ein Block, dessen Definition unvollständig ist,
          // wird nicht geschrieben, sondern verworfen und benannt. Ohne diese
          // Prüfung liesse ihn der Schreib-Weg zwar auch nicht durch — aber
          // STILL: `normalizeCalendarConfig` entfernt defekte Zeitrechnungen
          // einzeln, und der Anwender bekäme einen Block, dem ohne ein Wort
          // die Hälfte fehlt. Genau das schliesst Zug-Entscheidung Z3 aus.
          pruefe: istVollstaendigerKalenderBlock,
        },
      ],
    },
    formen: { calendarSystems: 'object' },
    // 4T-001590: Diese Datenart lässt sich auf EINTRAGS-Ebene auswählen — ein
    // einzelner Zeitrechnungs-Block statt der ganzen Sektion. Damit trägt
    // derselbe Weg beide Fälle: alle Blöcke zur Sicherung, ein einzelner zur
    // Weitergabe von Bereich zu Bereich.
    //
    // **Der Block ist die Einheit, nicht die einzelne Zeitrechnung.** Blöcke
    // sind unabhängig, Zeitrechnungen desselben Blocks dagegen einander
    // zuordenbar: Eine Ableitung verweist über `derivedFrom` auf eine
    // Zeitrechnung IHRES Blocks. Eine einzeln herausgelöste Zeitrechnung
    // risse diese Verbindung, ein ganzer Block nimmt sie unberührt mit — und
    // es ist derselbe Gegenstand, den das Einlesen daneben ergänzt.
    //
    // `liste` zeigt auf die Stelle in `merge.lists`, statt Pfad, Weg und
    // Schlüssel ein zweites Mal zu schreiben: Wählbar ist genau das, was beim
    // Einlesen als Einheit ergänzt wird. Zwei Deklarationen desselben
    // Gegenstands liefen unweigerlich auseinander.
    auswahl: {
      liste: 0,
      // Die Zahl je Block ist die Zahl seiner Zeitrechnungen — dieselbe
      // Grösse, welche die Datenart als Ganzes zählt. Die Summe der
      // Block-Zeilen ergibt deshalb die Zahl der Datenart-Zeile darüber.
      zaehleEintrag: (block) => laenge(block && block.calendars),
    },
  },
];

const DATA_KIND_IDS = DATA_KINDS.map((k) => k.id);

// Art der Austausch-Datei im Marker-Feld ihres Frontmatters (siehe
// `exchange-file.js`). Sie steht hier und nicht dort, weil das Format-Modul
// art-neutral ist: Ausgabe (4T-001587) und Einlesen (4T-001588) müssen
// dieselbe Art verwenden, und das ist eine Frage der Fachlichkeit.
const EXCHANGE_KIND = 'setup';

/**
 * Datenart zu ihrer Kennung, oder null.
 *
 * @param {string} id
 * @returns {object|null}
 */
function dataKindById(id) {
  return DATA_KINDS.find((k) => k.id === id) || null;
}

/**
 * 4T-001590: Auswahl-Deklaration einer Datenart, aufgelöst gegen ihre
 * Merge-Liste — oder null, wenn die Datenart nur als Ganzes wählbar ist.
 *
 * @param {object} kind Datenart aus der Registry.
 * @returns {{path: string, at: string[], idKey: string, nameKey: string,
 *   zaehleEintrag: (eintrag: *) => number}|null}
 */
function entrySelectionOf(kind) {
  const auswahl = kind && kind.auswahl;
  if (!auswahl || !kind.merge || !Array.isArray(kind.merge.lists)) return null;
  const liste = kind.merge.lists[auswahl.liste];
  if (!liste) return null;
  return {
    path: liste.path,
    at: liste.at,
    idKey: liste.idKey,
    nameKey: liste.nameKey,
    zaehleEintrag: typeof auswahl.zaehleEintrag === 'function' ? auswahl.zaehleEintrag : () => 0,
  };
}

/**
 * Alle Speicher-Pfade, die überhaupt ausgegeben werden können.
 *
 * Grundlage der Fail-closed-Zusicherung: Was hier nicht steht, verlässt den
 * Rechner nicht.
 *
 * @returns {string[]}
 */
function allExportedPaths() {
  const pfade = [];
  for (const kind of DATA_KINDS) {
    for (const p of kind.paths || []) if (!pfade.includes(p)) pfade.push(p);
  }
  return pfade;
}

module.exports = {
  DATA_KINDS,
  DATA_KIND_IDS,
  EXCHANGE_KIND,
  SETTINGS_PATHS,
  NEVER_EXPORTED,
  MERGE_REPLACE,
  MERGE_APPEND,
  MERGE_APPEND_TREE,
  dataKindById,
  allExportedPaths,
  entrySelectionOf,
  istVollstaendigerKalenderBlock,
  holeTief,
  setzeTief,
};
