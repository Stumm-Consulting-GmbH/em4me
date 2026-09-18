// @vitest-environment jsdom
// 4T-001636 (Epic 3E-000295): Die Kommando-Palette entscheidet die
// Verfuegbarkeit nicht mehr selbst, sondern liest das Verfuegbarkeits-Feld der
// Registry ueber den Katalog in shared/commands/command-availability.js.
//
// Drei Dinge sind hier zu belegen, und sie haengen zusammen:
//
//   1. Die sechs in 4T-000918 gemessenen Abweichungen sind geschlossen — jede
//      mit ihrem eigenen Fall gegen das Soll der Erhebungs-Tabelle.
//   2. Der Palette-Kontext fuehrt hasBook und hasShelf. Ohne sie KONNTEN drei
//      der sechs Faelle hier gar nicht richtig entschieden werden; der Weg
//      ueber isCommandIdAvailable prueft deshalb den Kontext-Bau mit, statt
//      einen von Hand gebauten Kontext einzusetzen.
//   3. Sonst hat sich nichts verschoben. Das ist die eigentliche Zusage dieses
//      Vorgangs und der Grund fuer den Vollbestands-Vergleich unten: Er stellt
//      die alte Entscheidungs-Logik als eingefrorene Kopie neben die neue und
//      vergleicht sie ueber ALLE Kommandos und ALLE Kontext-Belegungen. Genau
//      sechs Unterschiede duerfen herauskommen, und es muessen diese sechs sein.
//
// Muster book-panel.test.js: jsdom plus api-Stub vor dem Modul-Import, weil
// command-palette.js den Renderer-Zustand und die Editor-Module nachzieht.
import { describe, expect, it, beforeEach } from 'vitest';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  AVAILABILITY_CONTEXT_FIELDS,
  availabilityContext,
} from '../../../src/shared/commands/command-availability.js';
import { state } from '../../../src/renderer/modules/app/app-state.js';
import {
  isCommandAvailable,
  isCommandIdAvailable,
} from '../../../src/renderer/modules/command-palette.js';

// --- Die alte Entscheidungs-Logik, eingefroren ------------------------------
//
// Woertliche Kopie des Standes vor diesem Vorgang (command-palette.js vor
// 4T-001636): acht Kontext-Mengen, drei eigens behandelte Kennungen, Endpunkt
// `return true`. Sie steht hier als MASSSTAB, nicht als Vorbild — sie ist im
// Programm entfernt, und dieser Vergleich ist der einzige Ort, an dem sie
// weiterlebt. Die einzige Abweichung von der Vorlage: sourceVisible und
// hasCalendarConfig kommen aus dem Kontext statt aus einem eigenen Feld und
// einem Modul-Aufruf; beide Ausdruecke sind woertlich dieselben.
const ALT_AREA = new Set([
  'journal.openToday',
  'journal.openForDate',
  'journal.nachtragen',
  'area.close',
  'graph.openArea',
  'stats.openArea',
]);
const ALT_FILE_TAB = new Set([
  'file.newSubpage',
  'file.save',
  'file.saveAs',
  'file.rename',
  'file.detachSubpage',
  'history.open',
  'view.toggleEdit',
]);
const ALT_CONTENT_TAB = new Set(['file.print', 'file.exportPdf', 'file.exportPortable']);
const ALT_ANY_TAB = new Set(['file.bookmarkAdd', 'tab.close', 'view.toggleScrollSync']);
const ALT_AREA_OR_TAB = new Set(['file.quickOpen']);
const ALT_VIEW_MODE = new Set([
  'view.modeRendered',
  'view.modeSplit',
  'view.modeSource',
  'view.modeLive',
]);
const ALT_SOURCE_TOGGLE = new Set([
  'view.toggleFoldGutter',
  'view.toggleLineNumbers',
  'view.toggleWordWrap',
]);
const ALT_EDITOR_CONTEXT = new Set(['edit.insertTimestamp', 'edit.insertTemplate']);

function altEditorContext(ctx) {
  return (
    ctx.hasTab && !ctx.manualTab && !ctx.systemTab && ctx.editMode && ctx.viewMode !== 'rendered'
  );
}

function altSourceVisible(ctx) {
  return ctx.viewMode === 'source' || ctx.viewMode === 'split' || ctx.viewMode === 'live';
}

function altIsCommandAvailable(cmd, ctx) {
  if (cmd.id.startsWith('table.')) return altEditorContext(ctx) && !!ctx.inTable;
  if (cmd.editorScoped || ALT_EDITOR_CONTEXT.has(cmd.id)) return altEditorContext(ctx);
  if (cmd.id === 'calendar.insertValue')
    return altEditorContext(ctx) && ctx.hasArea && ctx.hasCalendarConfig;
  if (ALT_AREA.has(cmd.id)) return ctx.hasArea;
  if (cmd.id === 'workspace.saveAs') return !ctx.hasWorkspace;
  if (cmd.id === 'workspace.close') return ctx.hasWorkspace;
  if (ALT_FILE_TAB.has(cmd.id)) return ctx.hasTab && !ctx.manualTab && !ctx.systemTab;
  if (ALT_CONTENT_TAB.has(cmd.id)) return ctx.hasTab && !ctx.systemTab;
  if (ALT_ANY_TAB.has(cmd.id)) return ctx.hasTab;
  if (ALT_AREA_OR_TAB.has(cmd.id)) return ctx.hasTab || ctx.hasArea;
  if (ALT_VIEW_MODE.has(cmd.id)) return !ctx.systemTab;
  if (ALT_SOURCE_TOGGLE.has(cmd.id)) return altSourceVisible(ctx);
  return true;
}

// Die sechs gemessenen Abweichungen aus 4T-000918 mit dem Soll der
// Menue-Seite, das nach diesem Vorgang gilt.
const SECHS_FAELLE = [
  { id: 'area.close', soll: 'areaOhneBuchUndRegal' },
  { id: 'book.close', soll: 'buch' },
  { id: 'shelf.close', soll: 'regal' },
  { id: 'book.moveChapterFile', soll: 'buch' },
  { id: 'file.rejoinParts', soll: 'fileTab' },
  { id: 'view.modeMindmap', soll: 'viewMode' },
];

// 4T-001697 (Epic 3E-000287): Kommandos, die es zur Messung von 4T-000918 noch
// nicht gab, und die deshalb NICHT in den Vollbestands-Vergleich unten gehoeren.
//
// Der Vergleich haelt die neue Entscheidungs-Logik gegen eine eingefrorene
// Kopie der alten und verlangt genau die sechs Abweichungen der Erhebung. Die
// eingefrorene Kopie kennt ein spaeter entstandenes Kommando nicht und faellt
// bei ihm auf ihren Endpunkt (return true) zurueck; ihre Antwort ist dort also
// die ABWESENHEIT einer Regel und kein gemessenes Soll. Eine Abweichung gegen
// diese Abwesenheit ist deshalb kein Befund, sondern die zwangslaeufige Folge
// davon, dass das Kommando juenger ist als der Massstab.
//
// Verworfen ist die naheliegende Alternative, die Erwartung von sechs auf
// sieben zu heben: Sie machte aus der Zusage von 4T-001636 (genau diese sechs
// und sonst nichts) eine mitwachsende Liste, die bei jedem neuen Kommando
// erneut anzupassen waere — und damit aus einem Nachweis eine Buchfuehrung.
//
// 4T-001701 (Epic 3E-000288): Die fuenf Kommandos der Formen und der
// Stapel-Reihenfolge kommen aus demselben Grund hinzu — sie sind juenger als
// der Massstab, und die eingefrorene Kopie kennt sie nicht. 4T-001747 (Epic
// 3E-000289): die Kommandos der Verweis- und der Bild-Karten ebenso. 4T-001770
// (Epic 3E-000290): das Kommando der Verbindung ohne Maus, aus demselben Grund.
// 4T-001759 (Epic 3E-000253): die Uebersicht der Datenbank aus demselben Grund.
const NACH_DER_MESSUNG = new Set([
  'database.openOverview',
  'view.modeCanvas',
  'canvas.addCard',
  'canvas.addShape',
  'canvas.addGroup',
  'canvas.addLinkCard',
  'canvas.addImageCard',
  'canvas.addConnection',
  'canvas.stackFront',
  'canvas.stackForward',
  'canvas.stackBackward',
  'canvas.stackBack',
  'insert.canvas',
]);

const BOOL_FIELDS = AVAILABILITY_CONTEXT_FIELDS.filter((f) => f !== 'viewMode');
const VIEW_MODES = [null, 'source', 'split', 'live', 'rendered', 'mindmap', 'canvas'];

function alleKontexte() {
  const out = [];
  for (let maske = 0; maske < 1 << BOOL_FIELDS.length; maske += 1) {
    for (const viewMode of VIEW_MODES) {
      const roh = { viewMode };
      BOOL_FIELDS.forEach((feld, i) => {
        roh[feld] = (maske & (1 << i)) !== 0;
      });
      out.push(availabilityContext(roh));
    }
  }
  return out;
}

// --- Renderer-Zustand fuer den Weg ueber isCommandIdAvailable ---------------
//
// isCommandIdAvailable baut den Kontext selbst aus dem Renderer-Zustand. Genau
// deshalb laeuft der Nachweis der sechs Faelle ueber diese Funktion und nicht
// ueber einen von Hand gebauten Kontext: Ein Kontext, der hasBook nicht fuehrt,
// waere der Fehler, den dieser Vorgang behebt, und ein Test mit selbstgebautem
// Kontext haette ihn nicht gesehen.
function setzeZustand({ tab = null, areaPath = null, bookName = null, shelfName = null } = {}) {
  state.activePaneIndex = 0;
  state.panes[0].tabs = tab ? [tab] : [];
  state.panes[0].activeIndex = tab ? 0 : -1;
  state.areaPath = areaPath;
  state.bookName = bookName;
  state.shelfName = shelfName;
  state.workspaceName = null;
}

const DATEI_TAB = { manualPage: false, systemPage: false, viewMode: 'source', editMode: false };

beforeEach(() => {
  setzeZustand();
});

describe('Palette liest aus dem Verfügbarkeits-Modell (4T-001636)', () => {
  it('entscheidet über das Registry-Feld und nicht mehr über die Kennung', () => {
    // Dieselbe Kennung, zwei Bedingungen: Wer die Kennung noch in einer
    // eigenen Menge nachschlüge, käme hier zweimal zum selben Ergebnis.
    const ohneBuch = availabilityContext(null);
    expect(isCommandAvailable({ id: 'probe.x', availability: 'buch' }, ohneBuch)).toBe(false);
    expect(isCommandAvailable({ id: 'probe.x', availability: 'immer' }, ohneBuch)).toBe(true);
    // Und das Feld schlägt auch die beiden Regeln, die früher VOR allen
    // Mengen kamen (Präfix table. und editorScoped).
    expect(
      isCommandAvailable(
        { id: 'table.probe', availability: 'immer', editorScoped: true },
        ohneBuch,
      ),
    ).toBe(true);
  });

  it('der Endpunkt "immer verfügbar" ist ausgewertete Bedingung statt Rückfall', () => {
    const immerKommandos = COMMANDS.filter((c) => c.availability === 'immer');
    expect(immerKommandos.length, 'kein Kommando mit der Bedingung "immer"').toBeGreaterThan(0);
    for (const cmd of immerKommandos) {
      expect(isCommandAvailable(cmd, availabilityContext(null)), cmd.id).toBe(true);
    }
  });

  // Dass der Endpunkt `return true` und die acht Kontext-Mengen wirklich aus
  // dieser Datei verschwunden sind, prüft der Durchlauf-Wächter als Punkt 4
  // (test/unit/command-availability.test.js). Die Aussage stand mit 4T-001636
  // hier; 4T-001637 hat sie dorthin gezogen, weil die vier Prüfpunkte des
  // Zuschnitts EIN Wächter sind und eine Abwesenheits-Aussage genau einen Ort
  // braucht. Hier bleibt, was den laufenden Code misst statt seinen Text.

  it('der Kontext führt hasBook und hasShelf aus dem Renderer-Zustand', () => {
    setzeZustand({ bookName: 'Handbuch' });
    expect(isCommandIdAvailable('book.close')).toBe(true);
    expect(isCommandIdAvailable('shelf.close')).toBe(false);

    setzeZustand({ shelfName: 'Regal 1' });
    expect(isCommandIdAvailable('book.close')).toBe(false);
    expect(isCommandIdAvailable('shelf.close')).toBe(true);
  });
});

describe('Die sechs gemessenen Abweichungen (4T-000918, geschlossen mit 4T-001636)', () => {
  it('area.close: Bereich ja, aber nicht bei aktivem Buch oder Regal', () => {
    setzeZustand({ areaPath: 'C:/Bereich' });
    expect(isCommandIdAvailable('area.close')).toBe(true);
    setzeZustand({ areaPath: 'C:/Bereich', bookName: 'Buch' });
    expect(isCommandIdAvailable('area.close')).toBe(false);
    setzeZustand({ areaPath: 'C:/Bereich', shelfName: 'Regal' });
    expect(isCommandIdAvailable('area.close')).toBe(false);
    setzeZustand();
    expect(isCommandIdAvailable('area.close')).toBe(false);
  });

  it('book.close und book.moveChapterFile: nur mit aktivem Buch', () => {
    for (const id of ['book.close', 'book.moveChapterFile']) {
      setzeZustand({ bookName: 'Buch' });
      expect(isCommandIdAvailable(id), `${id} mit Buch`).toBe(true);
      setzeZustand();
      expect(isCommandIdAvailable(id), `${id} ohne Buch`).toBe(false);
    }
  });

  it('shelf.close: nur mit aktivem Regal', () => {
    setzeZustand({ shelfName: 'Regal' });
    expect(isCommandIdAvailable('shelf.close')).toBe(true);
    setzeZustand();
    expect(isCommandIdAvailable('shelf.close')).toBe(false);
  });

  it('file.rejoinParts: nur auf einer echten Datei', () => {
    setzeZustand({ tab: DATEI_TAB });
    expect(isCommandIdAvailable('file.rejoinParts')).toBe(true);
    setzeZustand({ tab: { ...DATEI_TAB, manualPage: true } });
    expect(isCommandIdAvailable('file.rejoinParts')).toBe(false);
    setzeZustand({ tab: { ...DATEI_TAB, systemPage: true } });
    expect(isCommandIdAvailable('file.rejoinParts')).toBe(false);
    setzeZustand();
    expect(isCommandIdAvailable('file.rejoinParts')).toBe(false);
  });

  it('view.modeMindmap: überall außer auf der System-Seite', () => {
    setzeZustand({ tab: DATEI_TAB });
    expect(isCommandIdAvailable('view.modeMindmap')).toBe(true);
    setzeZustand({ tab: { ...DATEI_TAB, systemPage: true } });
    expect(isCommandIdAvailable('view.modeMindmap')).toBe(false);
  });

  it('alle sechs tragen in der Registry das Soll der Menü-Seite', () => {
    for (const fall of SECHS_FAELLE) {
      const cmd = COMMANDS.find((c) => c.id === fall.id);
      expect(cmd, `Kommando ${fall.id} nicht in der Registry`).toBeTruthy();
      expect(cmd.availability, `${fall.id} trägt nicht das Soll der Erhebung`).toBe(fall.soll);
    }
  });
});

describe('Vollbestands-Vergleich gegen die alte Logik (4T-001636)', () => {
  // Die Gegenprobe zu AK4: Was heute in der Palette zu Recht verfügbar ist,
  // bleibt es. Gemessen ueber alle Kommandos der Erhebungs-Zeit und alle
  // Belegungen des Kontext-Vertrags — nicht an einer Stichprobe, die die
  // interessante Lage gerade auslassen koennte.
  const kontexte = alleKontexte();
  const gemessenerBestand = COMMANDS.filter((c) => !NACH_DER_MESSUNG.has(c.id));

  it('genau die sechs gemessenen Kommandos entscheiden anders als vorher', () => {
    const abweichend = new Set();
    for (const cmd of gemessenerBestand) {
      for (const ctx of kontexte) {
        if (isCommandAvailable(cmd, ctx) !== altIsCommandAvailable(cmd, ctx)) {
          abweichend.add(cmd.id);
          break;
        }
      }
    }
    expect([...abweichend].sort()).toEqual(SECHS_FAELLE.map((f) => f.id).sort());
  });

  // Ohne diesen Satz wäre der obige auch dann grün, wenn die Umstellung gar
  // nichts bewirkt hätte und die sechs Fälle zufällig nie auseinanderfielen.
  it('und sie entscheiden wirklich anders, nicht nur potenziell', () => {
    for (const fall of SECHS_FAELLE) {
      const cmd = COMMANDS.find((c) => c.id === fall.id);
      const unterschiede = kontexte.filter(
        (ctx) => isCommandAvailable(cmd, ctx) !== altIsCommandAvailable(cmd, ctx),
      );
      expect(
        unterschiede.length,
        `${fall.id} entscheidet in keiner Lage anders als vorher`,
      ).toBeGreaterThan(0);
      // Und der Unterschied geht in die erwartete Richtung: Die alte Palette
      // war zu großzügig, nie zu streng.
      for (const ctx of unterschiede) {
        expect(altIsCommandAvailable(cmd, ctx), `${fall.id}: alte Logik war strenger`).toBe(true);
        expect(isCommandAvailable(cmd, ctx)).toBe(false);
      }
    }
  });
});
