// 4T-001635 (Epic 3E-000295): Verfuegbarkeits-Modell der Kommandos.
//
// Die eine Quelle der Frage «ist dieses Kommando gerade verfuegbar?». Bis
// hierher beantworten Menue (src/main/menu/menu.js, enabled-Ausdruecke je
// Eintrag) und Kommando-Palette (src/renderer/modules/command-palette.js,
// acht Kontext-Mengen plus Sonderfaelle) sie getrennt, mit eigenen Regeln und
// eigenem Zustands-Kontext; die Erhebung in 4T-000918 hat sechs auseinander
// laufende Antworten gemessen und, gewichtiger, den doppelt gebauten Zustand
// gefunden. Diese Datei traegt den Katalog der benannten Bedingungen und ihre
// Auswertung; Menue und Palette werden in 4T-001637 und 4T-001636 zu
// Verbrauchern.
//
// Bauform nach drei Vorbildern des Bestands statt neu erfunden:
//   - command-bindings.js (4T-000993): Nachbardatei der Registry, Import-
//     Richtung einseitig commands.js -> hierher, nie umgekehrt. Diese Datei
//     kennt die Kommando-Liste nicht und arbeitet nur auf uebergebenen Namen
//     und Kontext-Objekten.
//   - command-placement.js (4T-000520): Datenmodell neben der Registry mit
//     defensiver Normalisierung und einem Waechter-Test gegen den realen
//     Bestand.
//   - disabledCommandIdSet in extensions/extensions-core.js: Main und
//     Renderer lesen die EXISTENZ-Achse eines Kommandos bereits gemeinsam aus
//     src/shared/. Die VERFUEGBARKEITS-Achse ist die letzte, die es nicht
//     ist; dieser Vorgang zieht sie an dieselbe Stelle nach.
//
// Prozessneutral (CJS, ohne DOM und ohne Electron), damit Main und Renderer
// dasselbe Modul lesen.
//
// GRENZE, benannt statt verschwiegen (Zuschnitt 4T-000918, Schritt 2): Das
// Modell teilt die REGEL, nicht die QUELLE des Zustands. hasArea, hasBook,
// hasShelf und hasWorkspace sind main-seitige Wahrheit aus der App-Registry,
// hasTab, systemTab und manualTab renderer-seitige; der Renderer haelt von den
// ersten vier nur eine per Broadcast nachgezogene Kopie. Ein Waechter kann
// deshalb pruefen, dass beide Seiten dieselbe Regel auf dieselben Feldnamen
// anwenden, nicht dass beide denselben WERT sehen. Das Restrisiko eines
// ausbleibenden Broadcasts deckt 4T-001638 mit zwei E2E-Faellen ab.
'use strict';

// --- Kontext-Vertrag ---------------------------------------------------------
//
// Die Felder, auf denen der Katalog arbeitet. Jede Prozess-Seite baut ihn an
// GENAU EINER Stelle: der Renderer in der Palette (4T-001636), der Main aus
// dem normalisierten Menue-Zustand (4T-001637). Bis dahin ist der Vertrag hier
// nur beschrieben und geprueft, nicht befuellt.
//
// Die neun gemeinsamen Felder kennen beide Seiten; die zwei renderer-eigenen
// braucht nur, wer die drei menuefreien Bedingungen auswertet (tabelle,
// editorUndKalender) — im Menue gibt es zu ihnen keinen Eintrag, gegen den
// sie divergieren koennten.
const SHARED_CONTEXT_FIELDS = [
  'hasTab',
  'manualTab',
  'systemTab',
  'viewMode',
  'editMode',
  'hasArea',
  'hasBook',
  'hasShelf',
  'hasWorkspace',
  // 4T-001697 (Epic 3E-000287): Traegt das aktive Dokument eine
  // Canvas-Flaeche? Das zehnte gemeinsame Feld und das einzige, das eine
  // Eigenschaft des INHALTS meldet statt eine des Zustands; beide Seiten
  // ermitteln es aus derselben Quelle (istCanvasModusVerfuegbar in tabs.js),
  // der Main ueber den normalisierten Menue-Zustand, der Renderer direkt.
  'canvasTab',
];
const RENDERER_CONTEXT_FIELDS = ['inTable', 'hasCalendarConfig'];
const AVAILABILITY_CONTEXT_FIELDS = [...SHARED_CONTEXT_FIELDS, ...RENDERER_CONTEXT_FIELDS];

// viewMode ist das einzige nicht-boolsche Feld: 'source' | 'split' | 'live' |
// 'rendered' | 'mindmap' | 'canvas' | null. Alles Uebrige ist boolsch.
// ('canvas' seit 4T-001653, im Katalog gebraucht von 4T-001697.)
const VIEW_MODE_FIELD = 'viewMode';

// Defensive Normalisierung nach dem Muster normalizeCommandPlacement: ein
// fehlendes oder defektes Feld faellt auf den Wert zurueck, den ein frisch
// gestartetes Fenster ohne Reiter haette, statt undefined durch die Regeln zu
// tragen. Beide Verbraucher rufen sie einmal auf und geben das Ergebnis weiter.
function availabilityContext(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ctx = {};
  for (const feld of AVAILABILITY_CONTEXT_FIELDS) {
    ctx[feld] = feld === VIEW_MODE_FIELD ? null : false;
  }
  for (const feld of AVAILABILITY_CONTEXT_FIELDS) {
    if (feld === VIEW_MODE_FIELD) {
      ctx[feld] = typeof r[feld] === 'string' && r[feld] !== '' ? r[feld] : null;
    } else {
      ctx[feld] = !!r[feld];
    }
  }
  return ctx;
}

// --- Abgeleitete Teil-Bedingungen --------------------------------------------

// Quelltext sichtbar. Heute zweimal gebildet: als sourceVisible in der Palette
// und als togglesEnabled in tabs.js, das der Renderer dem Main meldet. Beide
// Ausdruecke sind woertlich dieser hier; togglesEnabled entfaellt mit
// 4T-001637 als gemeldetes Feld.
function sourceVisible(ctx) {
  return ctx.viewMode === 'source' || ctx.viewMode === 'split' || ctx.viewMode === 'live';
}

// Editor-Kontext: bearbeitbarer Datei-Reiter mit sichtbarem Editor (Guard-
// Muster von edit.insertTimestamp in app-init.js).
function editorContext(ctx) {
  return (
    !!ctx.hasTab &&
    !ctx.manualTab &&
    !ctx.systemTab &&
    !!ctx.editMode &&
    ctx.viewMode !== 'rendered'
  );
}

// --- Der Bedingungs-Katalog --------------------------------------------------
//
// Sechzehn Namen, dreizehn davon heute im Menue belegt, drei nur in der
// Palette. Keiner ist erfunden: Sie sind die Namen der heutigen Palette-Mengen
// (dort bereits benannt), auf die die Erhebung die Menue-Seite abgebildet hat.
//
// `felder` nennt die gelesenen Kontext-Felder. Es ist Dokumentation UND
// Pruefgegenstand: Der Waechter stellt jede Bedingung gegen einen Kontext, in
// dem nur diese Felder gesetzt sind, und faellt auf, wenn eine Regel still ein
// weiteres Feld liest.
//
// Namens-Hinweis: `viewMode` ist zugleich ein Bedingungs-Name und ein
// Kontext-Feld. Das ist bewusst so belassen — der Name stammt aus der Messung
// und aus VIEW_MODE_COMMANDS der Palette, und ein hier erfundener zweiter Name
// haette die Rueckverfolgbarkeit zur Erhebung gekostet.
const AVAILABILITY_CATALOG = [
  { name: 'immer', felder: [], pruefe: () => true },
  { name: 'anyTab', felder: ['hasTab'], pruefe: (c) => !!c.hasTab },
  {
    name: 'contentTab',
    felder: ['hasTab', 'systemTab'],
    pruefe: (c) => !!c.hasTab && !c.systemTab,
  },
  {
    name: 'fileTab',
    felder: ['hasTab', 'manualTab', 'systemTab'],
    pruefe: (c) => !!c.hasTab && !c.manualTab && !c.systemTab,
  },
  { name: 'viewMode', felder: ['systemTab'], pruefe: (c) => !c.systemTab },
  // 4T-001765 (Epic 3E-000186, E6): Die Bedingung der drei Editor-Schalter
  // (Umbruch, Zeilennummern, Gliederung) traegt seit diesem Vorgang die
  // STRENGERE Regel, die die Statusleiste bis dahin zusaetzlich zum Modell
  // selbst mitbrachte: ein geoeffnetes Dokument, das keine System-Seite ist
  // (`hasTab` und `!systemTab`, tabs.js `!sourceVisible || !tab` mit
  // `sourceVisible = !systemTab && …`). Sie wandert hierher und nicht
  // umgekehrt, weil sie das richtigere Verhalten ist: Ein Schalter fuer den
  // Umbruch des Quelltexts hat ohne Quelltext nichts zu schalten. Fuer die
  // LEISTE aendert sich dadurch nichts (AK2/AK4 von 4T-001765); im MENUE
  // stehen die drei Eintraege jetzt auch auf einer System-Seite blass da,
  // deren gespeicherter Ansichts-Modus zufaellig ein Quelltext-Modus ist —
  // genau die Gleichstellung beider Bedienorte, die E6 bezweckt.
  {
    name: 'sourceToggle',
    felder: ['hasTab', 'systemTab', 'viewMode'],
    pruefe: (c) => !!c.hasTab && !c.systemTab && sourceVisible(c),
  },
  { name: 'area', felder: ['hasArea'], pruefe: (c) => !!c.hasArea },
  {
    name: 'areaOhneBuchUndRegal',
    felder: ['hasArea', 'hasBook', 'hasShelf'],
    pruefe: (c) => !!c.hasArea && !c.hasBook && !c.hasShelf,
  },
  {
    name: 'areaOrTab',
    felder: ['hasArea', 'hasTab'],
    pruefe: (c) => !!c.hasArea || !!c.hasTab,
  },
  { name: 'buch', felder: ['hasBook'], pruefe: (c) => !!c.hasBook },
  { name: 'regal', felder: ['hasShelf'], pruefe: (c) => !!c.hasShelf },
  { name: 'workspaceMit', felder: ['hasWorkspace'], pruefe: (c) => !!c.hasWorkspace },
  { name: 'workspaceOhne', felder: ['hasWorkspace'], pruefe: (c) => !c.hasWorkspace },
  // 4T-001697 (Epic 3E-000287): Die beiden Canvas-Bedingungen. Ihre Ausdruecke
  // stammen WOERTLICH aus den enabled-Zeilen von menu.js und sind hier nicht
  // neu erfunden; der Vorgang verschiebt den Ort der Regel und aendert ihr
  // Ergebnis nicht. Der Ansichts-Modus ist der einzige dokument-abhaengige der
  // sechs (Anordnung des Product Owners nach der Abnahme, AK9/AK10 der Story
  // 4S-000916), und die Karten-Anlage wirkt zusaetzlich nur in der offenen
  // Flaeche.
  {
    name: 'canvasAnsicht',
    felder: ['systemTab', 'canvasTab'],
    pruefe: (c) => !c.systemTab && !!c.canvasTab,
  },
  {
    name: 'canvasKarte',
    felder: ['systemTab', 'canvasTab', 'viewMode'],
    pruefe: (c) => !c.systemTab && !!c.canvasTab && c.viewMode === 'canvas',
  },
  {
    name: 'editor',
    felder: ['hasTab', 'manualTab', 'systemTab', 'editMode', 'viewMode'],
    pruefe: (c) => editorContext(c),
  },
  {
    name: 'tabelle',
    felder: ['hasTab', 'manualTab', 'systemTab', 'editMode', 'viewMode', 'inTable'],
    pruefe: (c) => editorContext(c) && !!c.inTable,
  },
  {
    name: 'editorUndKalender',
    felder: [
      'hasTab',
      'manualTab',
      'systemTab',
      'editMode',
      'viewMode',
      'hasArea',
      'hasCalendarConfig',
    ],
    pruefe: (c) => editorContext(c) && !!c.hasArea && !!c.hasCalendarConfig,
  },
];

const AVAILABILITY_NAMES = AVAILABILITY_CATALOG.map((b) => b.name);
const AVAILABILITY_BY_NAME = new Map(AVAILABILITY_CATALOG.map((b) => [b.name, b]));

// Die drei Bedingungen ohne jeden Menue-Eintrag. Gegengeprueft an der
// vollstaendigen Liste der 55 Menue-Kommandos (Erhebung 4T-000918): kein
// table.*- und kein editorScoped-Kommando hat einen Menue-Eintrag. Sie stehen
// im Katalog, damit die Palette auch ihre Regel aus derselben Quelle liest wie
// alle uebrigen; der Durchlauf-Waechter des Menues (4T-001637) nimmt sie
// bewusst aus.
const AVAILABILITY_NAMES_OHNE_MENUE = ['editor', 'tabelle', 'editorUndKalender'];

function isAvailabilityName(name) {
  return AVAILABILITY_BY_NAME.has(name);
}

function availabilityCondition(name) {
  return AVAILABILITY_BY_NAME.get(name) || null;
}

// Auswertung eines Bedingungs-Namens gegen einen Kontext.
//
// Ein unbekannter Name liefert `true`, also verfuegbar. Das ist bewusst NICHT
// fail-closed, und der Grund liegt in der Fehler-Richtung: Der Waechter dieses
// Vorgangs faengt jeden unbekannten Namen im Gate ab, also bevor ein Bau
// entsteht; was in der ausgelieferten Anwendung dennoch ankaeme, waere durch
// `false` ein still verschwundenes Kommando — ein Funktions-Verlust beim
// Anwender — und durch `true` hoechstens ein Kommando, dessen eigener Handler
// den Fall abfaengt. Es ist zugleich der heutige Endpunkt der Palette
// (`return true`), womit die Umstellung an dieser Stelle nichts aendert.
function isAvailable(name, ctx) {
  const bedingung = AVAILABILITY_BY_NAME.get(name);
  if (!bedingung) return true;
  return !!bedingung.pruefe(ctx || availabilityContext(null));
}

module.exports = {
  AVAILABILITY_CATALOG,
  AVAILABILITY_NAMES,
  AVAILABILITY_NAMES_OHNE_MENUE,
  AVAILABILITY_CONTEXT_FIELDS,
  SHARED_CONTEXT_FIELDS,
  RENDERER_CONTEXT_FIELDS,
  availabilityContext,
  availabilityCondition,
  isAvailabilityName,
  isAvailable,
};
