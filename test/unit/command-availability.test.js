// 4T-001635 (Epic 3E-000295): Katalog-Tests des Verfuegbarkeits-Modells
// (src/shared/commands/command-availability.js) plus DER DURCHLAUF-WAECHTER
// mit allen vier Pruefpunkten aus dem Zuschnitt in 4T-000918:
//
//   1. Vollstaendigkeit  — jedes Kommando traegt ein availability-Feld.
//   2. Katalog-Treue     — jeder genannte Name steht im Katalog, und kein Name
//                          des Katalogs ist tot.
//   3. Kein Nebenweg im Menue    (4T-001637) — kein Menue-Eintrag entscheidet
//                          seine Freigabe selbst, und ein Untermenue-Punkt mit
//                          eigener Regel nimmt keinem Kind seine Freigabe.
//   4. Kein Nebenweg in der Palette (4T-001637) — die acht Kontext-Mengen und
//                          der Endpunkt `return true` sind fort.
//
// **Punkt 3 und 4 sind der Kern, nicht der Zierat.** Ohne sie waere das
// gemeinsame Modell eine dritte Fassung der Regeln neben den beiden alten —
// genau der Weg, den 4T-000918 als untauglich ausschliesst. Sie stehen hier und
// nicht je bei ihrer Seite, damit «der Waechter» EIN Ort ist; die Karte der
// Aenderungsklassen fuehrt diese Datei deshalb in Ä4, Ä5 und Ä7, weil sie
// Renderer, Main und den geteilten Kern liest.
//
// Muster command-placement.test.js: Datenmodell-Tests plus Waechter gegen den
// realen Bestand, nicht gegen eine Attrappe.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVAILABILITY_CATALOG,
  AVAILABILITY_CONTEXT_FIELDS,
  AVAILABILITY_NAMES,
  AVAILABILITY_NAMES_OHNE_MENUE,
  RENDERER_CONTEXT_FIELDS,
  SHARED_CONTEXT_FIELDS,
  availabilityCondition,
  availabilityContext,
  isAvailabilityName,
  isAvailable,
} from '../../src/shared/commands/command-availability.js';
import { COMMANDS } from '../../src/shared/commands/commands.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
// 4T-001737 (Epic 3E-000308): Der Menue-Baum ist auf mehrere Dateien verteilt,
// seit das Arbeitsbereiche-Untermenue nach menu-workspaces.js ausgezogen ist.
// Gelesen wird deshalb der GANZE Ordner src/main/menu/ statt allein menu.js —
// sonst faenden die Basislinien-Waechter die vier Lebenszyklus-Eintraege nicht
// mehr und meldeten eine Luecke, die es nicht gibt. Die Ordner-Lesung deckt
// jeden weiteren Auszug aus der Menue-Fabrik mit, ohne dass hier eine
// Datei-Liste nachzupflegen waere. Die zeilenweise Auswertung bleibt gueltig,
// weil ein Menue-Eintrag nie ueber eine Datei-Grenze reicht.
const MENUE_ORDNER = path.join(WURZEL, 'src', 'main', 'menu');
const MENUE_QUELLE = fs
  .readdirSync(MENUE_ORDNER)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => fs.readFileSync(path.join(MENUE_ORDNER, name), 'utf8'))
  .join('\n');
const PALETTE_QUELLE = fs.readFileSync(
  path.join(WURZEL, 'src', 'renderer', 'modules', 'command-palette.js'),
  'utf8',
);

const BOOL_FIELDS = AVAILABILITY_CONTEXT_FIELDS.filter((f) => f !== 'viewMode');
// Die sechs realen Ansichts-Modi plus null (kein Reiter). 'mindmap' ist seit
// 4T-001047 dabei, 'canvas' seit 4T-001697 (Modus aus 4T-001653); sourceToggle
// laesst beide bewusst draussen, weil dort kein Quelltext sichtbar ist.
const VIEW_MODES = [null, 'source', 'split', 'live', 'rendered', 'mindmap', 'canvas'];

// Alle Kontexte ueber den Vertrag: 2^10 boolsche Belegungen mal sechs
// Ansichts-Modi. Das ist die Grundgesamtheit der Feld-Pruefung unten — sie
// soll nicht an einer geschickt gewaehlten Stichprobe haengen.
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

const KONTEXTE = alleKontexte();

function kontext(teil) {
  return availabilityContext(teil);
}

describe('Kontext-Vertrag (4T-001635)', () => {
  it('nennt die zehn gemeinsamen und die zwei renderer-eigenen Felder', () => {
    expect(SHARED_CONTEXT_FIELDS).toEqual([
      'hasTab',
      'manualTab',
      'systemTab',
      'viewMode',
      'editMode',
      'hasArea',
      'hasBook',
      'hasShelf',
      'hasWorkspace',
      // 4T-001697 (Epic 3E-000287): das zehnte Feld, und das einzige, das eine
      // Eigenschaft des INHALTS meldet statt eine des Zustands.
      'canvasTab',
    ]);
    expect(RENDERER_CONTEXT_FIELDS).toEqual(['inTable', 'hasCalendarConfig']);
    expect(AVAILABILITY_CONTEXT_FIELDS).toHaveLength(12);
    expect(new Set(AVAILABILITY_CONTEXT_FIELDS).size).toBe(12);
  });

  it('availabilityContext normalisiert defensiv auf den Vertrag', () => {
    const leer = availabilityContext(null);
    expect(Object.keys(leer).sort()).toEqual([...AVAILABILITY_CONTEXT_FIELDS].sort());
    for (const feld of BOOL_FIELDS) expect(leer[feld]).toBe(false);
    expect(leer.viewMode).toBe(null);

    const gemischt = availabilityContext({
      hasTab: 1,
      systemTab: 'ja',
      viewMode: '',
      unbekannt: true,
    });
    expect(gemischt.hasTab).toBe(true);
    expect(gemischt.systemTab).toBe(true);
    expect(gemischt.viewMode).toBe(null);
    expect(gemischt.hasArea).toBe(false);
    expect('unbekannt' in gemischt).toBe(false);
  });
});

describe('Bedingungs-Katalog (4T-001635)', () => {
  it('traegt die neunzehn benannten Bedingungen des Katalogs', () => {
    expect(AVAILABILITY_NAMES).toEqual([
      'immer',
      'anyTab',
      'contentTab',
      'fileTab',
      'viewMode',
      'sourceToggle',
      'area',
      'areaOhneBuchUndRegal',
      'areaOrTab',
      'buch',
      'regal',
      'workspaceMit',
      'workspaceOhne',
      // 4T-001697 (Epic 3E-000287): die beiden Canvas-Bedingungen, nach dem
      // freigegebenen Zuschnitt von 4T-001635 hinzugekommen. Ihre Ausdruecke
      // stammen woertlich aus den enabled-Zeilen, die menu.js bis dahin selbst
      // trug; der Katalog ist damit gewachsen, seine Regeln sind es nicht.
      'canvasAnsicht',
      'canvasKarte',
      // 4T-001805 (Epic 3E-000292): die dritte Canvas-Bedingung. Sie traegt
      // die Ausgabe im offenen Format JSON Canvas und nennt `hasTab`
      // ausdruecklich, weil ihr Menue-Eintrag unter einem Untermenue-Punkt mit
      // eigener Freigabe-Regel haengt.
      'canvasFlaecheOffen',
      'editor',
      'tabelle',
      'editorUndKalender',
    ]);
    expect(new Set(AVAILABILITY_NAMES).size).toBe(AVAILABILITY_NAMES.length);
  });

  it('jede Bedingung nennt nur Felder des Vertrags und liefert einen Wahrheitswert', () => {
    for (const bedingung of AVAILABILITY_CATALOG) {
      for (const feld of bedingung.felder) {
        expect(
          AVAILABILITY_CONTEXT_FIELDS.includes(feld),
          `Bedingung ${bedingung.name} liest das vertragsfremde Feld ${feld}`,
        ).toBe(true);
      }
      expect(typeof bedingung.pruefe(kontext({}))).toBe('boolean');
    }
  });

  // Die Feld-Liste ist nicht nur Dokumentation: Sie ist die Zusage, welche
  // Zustands-Felder eine Prozess-Seite fuer diese Bedingung ueberhaupt
  // befuellen muss. Wer still ein weiteres Feld liest, bricht sie — und der
  // Bruch faellt erst beim Verbraucher auf, dem das Feld fehlt.
  it('keine Bedingung liest ein Feld, das sie nicht nennt', () => {
    for (const bedingung of AVAILABILITY_CATALOG) {
      const gesehen = new Map();
      for (const ctx of KONTEXTE) {
        const schluessel = bedingung.felder.map((f) => String(ctx[f])).join('|');
        const wert = bedingung.pruefe(ctx);
        if (!gesehen.has(schluessel)) gesehen.set(schluessel, wert);
        expect(
          gesehen.get(schluessel),
          `Bedingung ${bedingung.name} haengt an einem Feld ausserhalb von [${bedingung.felder.join(', ')}]`,
        ).toBe(wert);
      }
    }
  });

  it('wertet jede Bedingung an ihrer freigebenden und ihrer sperrenden Lage aus', () => {
    expect(isAvailable('immer', kontext({}))).toBe(true);

    expect(isAvailable('anyTab', kontext({ hasTab: true }))).toBe(true);
    expect(isAvailable('anyTab', kontext({}))).toBe(false);

    expect(isAvailable('contentTab', kontext({ hasTab: true, manualTab: true }))).toBe(true);
    expect(isAvailable('contentTab', kontext({ hasTab: true, systemTab: true }))).toBe(false);

    expect(isAvailable('fileTab', kontext({ hasTab: true }))).toBe(true);
    expect(isAvailable('fileTab', kontext({ hasTab: true, manualTab: true }))).toBe(false);
    expect(isAvailable('fileTab', kontext({ hasTab: true, systemTab: true }))).toBe(false);

    expect(isAvailable('viewMode', kontext({}))).toBe(true);
    expect(isAvailable('viewMode', kontext({ systemTab: true }))).toBe(false);

    // 4T-001765 (Epic 3E-000186, E6): sourceToggle verlangt seither
    // zusaetzlich ein geoeffnetes Dokument, das keine System-Seite ist — die
    // strengere Regel, die die Statusleiste bis dahin selbst mitbrachte. Der
    // eigene Pruefblock dazu steht weiter unten.
    for (const modus of ['source', 'split', 'live']) {
      expect(isAvailable('sourceToggle', kontext({ viewMode: modus, hasTab: true }))).toBe(true);
    }
    for (const modus of ['rendered', 'mindmap']) {
      expect(isAvailable('sourceToggle', kontext({ viewMode: modus, hasTab: true }))).toBe(false);
    }

    expect(isAvailable('area', kontext({ hasArea: true }))).toBe(true);
    expect(isAvailable('area', kontext({}))).toBe(false);

    expect(isAvailable('areaOhneBuchUndRegal', kontext({ hasArea: true }))).toBe(true);
    expect(isAvailable('areaOhneBuchUndRegal', kontext({ hasArea: true, hasBook: true }))).toBe(
      false,
    );
    expect(isAvailable('areaOhneBuchUndRegal', kontext({ hasArea: true, hasShelf: true }))).toBe(
      false,
    );

    expect(isAvailable('areaOrTab', kontext({ hasTab: true }))).toBe(true);
    expect(isAvailable('areaOrTab', kontext({ hasArea: true }))).toBe(true);
    expect(isAvailable('areaOrTab', kontext({}))).toBe(false);

    expect(isAvailable('buch', kontext({ hasBook: true }))).toBe(true);
    expect(isAvailable('buch', kontext({}))).toBe(false);

    expect(isAvailable('regal', kontext({ hasShelf: true }))).toBe(true);
    expect(isAvailable('regal', kontext({}))).toBe(false);

    expect(isAvailable('workspaceMit', kontext({ hasWorkspace: true }))).toBe(true);
    expect(isAvailable('workspaceMit', kontext({}))).toBe(false);
    expect(isAvailable('workspaceOhne', kontext({}))).toBe(true);
    expect(isAvailable('workspaceOhne', kontext({ hasWorkspace: true }))).toBe(false);

    // 4T-001805 (Epic 3E-000292): die dritte Canvas-Bedingung, an jeder ihrer
    // vier Voraussetzungen einzeln gemessen. Sie traegt die Ausgabe im offenen
    // Format JSON Canvas: waehlbar in der OFFENEN Canvas-Ansicht, sonst
    // ausgegraut (Freigabe des Product Owners vom 2026-09-19 zu F2).
    const flaecheOffen = { hasTab: true, canvasTab: true, viewMode: 'canvas' };
    expect(isAvailable('canvasFlaecheOffen', kontext(flaecheOffen))).toBe(true);
    // Dokument mit Flaeche, aber in einer anderen Ansicht: gesperrt.
    expect(
      isAvailable('canvasFlaecheOffen', kontext({ ...flaecheOffen, viewMode: 'rendered' })),
    ).toBe(false);
    // Kein Reiter: gesperrt — und zwar ausgeschrieben, weil der
    // Untermenue-Punkt «Exportieren» dieselbe Voraussetzung traegt.
    expect(isAvailable('canvasFlaecheOffen', kontext({ ...flaecheOffen, hasTab: false }))).toBe(
      false,
    );
    // Einstellungs-Reiter: gesperrt.
    expect(isAvailable('canvasFlaecheOffen', kontext({ ...flaecheOffen, systemTab: true }))).toBe(
      false,
    );
    // Dokument ohne Flaeche: gesperrt.
    expect(isAvailable('canvasFlaecheOffen', kontext({ ...flaecheOffen, canvasTab: false }))).toBe(
      false,
    );

    const imEditor = { hasTab: true, editMode: true, viewMode: 'source' };
    expect(isAvailable('editor', kontext(imEditor))).toBe(true);
    expect(isAvailable('editor', kontext({ ...imEditor, editMode: false }))).toBe(false);
    expect(isAvailable('editor', kontext({ ...imEditor, viewMode: 'rendered' }))).toBe(false);
    expect(isAvailable('editor', kontext({ ...imEditor, manualTab: true }))).toBe(false);
    expect(isAvailable('editor', kontext({ ...imEditor, systemTab: true }))).toBe(false);

    expect(isAvailable('tabelle', kontext({ ...imEditor, inTable: true }))).toBe(true);
    expect(isAvailable('tabelle', kontext(imEditor))).toBe(false);

    const mitKalender = { ...imEditor, hasArea: true, hasCalendarConfig: true };
    expect(isAvailable('editorUndKalender', kontext(mitKalender))).toBe(true);
    expect(isAvailable('editorUndKalender', kontext({ ...mitKalender, hasArea: false }))).toBe(
      false,
    );
    expect(
      isAvailable('editorUndKalender', kontext({ ...mitKalender, hasCalendarConfig: false })),
    ).toBe(false);
  });

  // 4T-001765 (Epic 3E-000186, E6): die strengere Editor-Regel im Katalog.
  //
  // **Warum hier ein eigener Prüfblock steht.** Die Menü-Basislinie weiter
  // unten hält je Kommando den NAMEN seiner Bedingung, und der Name
  // 'sourceToggle' hat sich nicht geändert — ihr Schweigen ist deshalb kein
  // Nachweis, dass die Regel unverändert ist. Geändert hat sich ihr AUSDRUCK,
  // und zwar absichtlich: Die drei Editor-Schalter verlangen jetzt auch im
  // Modell ein geöffnetes Dokument, das keine System-Seite ist. Dieser Block
  // schreibt die neue Regel fest, damit die Absicht belegt ist und nicht in
  // der Lücke zwischen Name und Ausdruck verschwindet.
  it('sourceToggle verlangt Quelltext UND ein geoeffnetes Dokument ohne System-Seite', () => {
    const bedingung = availabilityCondition('sourceToggle');
    expect(bedingung.felder).toEqual(['hasTab', 'systemTab', 'viewMode']);

    // Freigebend: die drei Quelltext-Modi an einem geöffneten Dokument.
    for (const modus of ['source', 'split', 'live']) {
      expect(isAvailable('sourceToggle', kontext({ viewMode: modus, hasTab: true }))).toBe(true);
      // Handbuch-Seiten bleiben ausdrücklich freigegeben: Ihr Quelltext ist
      // lesbar, und Umbruch, Zeilennummern und Gliederung wirken dort.
      expect(
        isAvailable('sourceToggle', kontext({ viewMode: modus, hasTab: true, manualTab: true })),
      ).toBe(true);
    }

    // Sperrend, und das ist der Zuwachs dieses Vorgangs: ohne Dokument und auf
    // einer System-Seite, deren gespeicherter Modus zufällig ein
    // Quelltext-Modus ist.
    for (const modus of ['source', 'split', 'live']) {
      expect(isAvailable('sourceToggle', kontext({ viewMode: modus }))).toBe(false);
      expect(
        isAvailable('sourceToggle', kontext({ viewMode: modus, hasTab: true, systemTab: true })),
      ).toBe(false);
    }

    // Und sie ist wirklich strenger und nicht anders: Was die alte Regel
    // (allein sourceVisible) sperrte, sperrt die neue auch.
    const altSourceVisible = (c) => ['source', 'split', 'live'].includes(c.viewMode);
    for (const ctx of KONTEXTE) {
      if (isAvailable('sourceToggle', ctx)) {
        expect(altSourceVisible(ctx), 'neue Regel gibt frei, wo die alte sperrte').toBe(true);
      }
    }
  });

  it('isAvailabilityName und availabilityCondition antworten ueber den Katalog', () => {
    for (const name of AVAILABILITY_NAMES) {
      expect(isAvailabilityName(name)).toBe(true);
      expect(availabilityCondition(name).name).toBe(name);
    }
    expect(isAvailabilityName('gibtEsNicht')).toBe(false);
    expect(availabilityCondition('gibtEsNicht')).toBe(null);
  });

  // Bewusst NICHT fail-closed; die Begruendung steht bei isAvailable. Der
  // Fall wird hier festgeschrieben, damit die Entscheidung nicht als
  // Nachlaessigkeit gelesen und still umgedreht wird.
  it('ein unbekannter Name gilt als verfuegbar, statt ein Kommando still zu sperren', () => {
    expect(isAvailable('gibtEsNicht', kontext({}))).toBe(true);
    expect(isAvailable(undefined, kontext({}))).toBe(true);
  });

  it('isAvailable ohne Kontext faellt auf den leeren Vertrag zurueck', () => {
    expect(isAvailable('anyTab')).toBe(false);
    expect(isAvailable('workspaceOhne')).toBe(true);
  });
});

describe('Durchlauf-Waechter ueber die Registry (4T-001635)', () => {
  // Punkt 1: Vollstaendigkeit. Bis hierher fielen 66 der 144 Kommandos auf den
  // stillen Endpunkt `return true` der Palette; danach steht an jedem ein Name,
  // den jemand geschrieben hat.
  it('jedes Kommando traegt ein availability-Feld', () => {
    const ohne = COMMANDS.filter(
      (c) => typeof c.availability !== 'string' || c.availability === '',
    );
    expect(
      ohne.map((c) => c.id),
      'Kommandos ohne availability-Feld (Pflichtfeld seit 4T-001635)',
    ).toEqual([]);
  });

  // Punkt 2, erste Haelfte: Katalog-Treue.
  it('jeder genannte Name steht im Katalog', () => {
    const fremd = COMMANDS.filter((c) => !isAvailabilityName(c.availability));
    expect(
      fremd.map((c) => `${c.id}: ${c.availability}`),
      'availability-Werte ausserhalb des Katalogs',
    ).toEqual([]);
  });

  // Punkt 2, zweite Haelfte: tote Namen fallen auf. Ein Katalog-Eintrag, den
  // kein Kommando mehr benutzt, ist entweder ein Ueberbleibsel oder das
  // Symptom eines vergessenen Nachzugs — beides gehoert gesehen.
  it('kein Katalog-Name ist tot', () => {
    const benutzt = new Set(COMMANDS.map((c) => c.availability));
    const tot = AVAILABILITY_NAMES.filter((n) => !benutzt.has(n));
    expect(tot, 'Katalog-Namen, die kein Kommando benutzt').toEqual([]);
  });

  // Die Zusage des Katalog-Kommentars, gegengeprueft am Bestand statt
  // geglaubt: Die drei menuefreien Bedingungen tragen wirklich kein
  // Menue-Kommando. Sie traegt den Waechter-Punkt 3 aus 4T-001637, der diese
  // drei aus der Menue-Pruefung nimmt.
  it('die drei menuefreien Bedingungen tragen kein Kommando mit Menue-Eintrag', () => {
    const verletzt = COMMANDS.filter(
      (c) => c.menu && AVAILABILITY_NAMES_OHNE_MENUE.includes(c.availability),
    );
    expect(verletzt.map((c) => `${c.id}: ${c.availability}`)).toEqual([]);
  });

  // Die beiden Regeln, aus denen die Palette ihre Antwort heute VOR allen
  // Kontext-Mengen zieht (Praefix table. und editorScoped), muessen sich im
  // Feld wiederfinden — sonst entschiede das Modell nach der Umstellung in
  // 4T-001636 anders als die Palette heute.
  it('Tabellen- und editorScoped-Kommandos tragen ihre bisherige Regel', () => {
    for (const cmd of COMMANDS) {
      if (cmd.id.startsWith('table.')) {
        expect(cmd.availability, `${cmd.id} muss die Tabellen-Bedingung tragen`).toBe('tabelle');
      } else if (cmd.editorScoped) {
        expect(cmd.availability, `${cmd.id} muss die Editor-Bedingung tragen`).toBe('editor');
      }
    }
  });
});

// Die Bedingung, die jedes der 55 Menue-Kommandos VOR dem Umbau trug —
// gemessen am 2026-09-09 mit scripts/erhebung-kommando-verfuegbarkeit.js am
// damaligen Stand von menu.js, nicht geschaetzt. Sie ist die Basislinie fuer
// AK4 von 4T-001637: Das sichtbare Menue-Verhalten ist unveraendert, wenn jedes
// dieser Kommandos heute dieselbe Bedingung traegt. Die sechs Abweichungen aus
// 4T-000918 lagen auf der Palette-Seite; die Menue-Seite hat sich bei keinem
// einzigen Kommando bewegt.
//
// **Was diese Basislinie NICHT misst, und wo es gemessen wird** (4T-001765,
// Epic 3E-000186): Sie haelt je Kommando den NAMEN seiner Bedingung, nicht
// deren Ausdruck. Aendert ein Vorgang die Regel HINTER einem Namen, schweigt
// sie — und genau das tut E6 von 3E-000186 mit 'sourceToggle', das seither
// zusaetzlich ein geoeffnetes Dokument ohne System-Seite verlangt. Die drei
// Editor-Eintraege des Menues stehen damit auf einer System-Seite mit
// gespeichertem Quelltext-Modus blass statt freigegeben da; das ist die
// beabsichtigte Gleichstellung mit der Statusleiste und keine Regression. Den
// Ausdruck selbst haelt der Pruefblock «sourceToggle verlangt Quelltext UND
// ein geoeffnetes Dokument ohne System-Seite» weiter oben fest.
const MENUE_BASISLINIE = new Map([
  ['file.newTab', 'immer'],
  // 4T-001738 (Epic 3E-000308): «Neues Fenster» stand am 2026-09-09 nicht im
  // gemessenen Menue, weil es erst hier entsteht; seine Basislinie ist deshalb
  // die Bedingung, mit der es eingehaengt wird. Sie ist 'immer' wie bei seinem
  // Nachbarn, und aus einem Grund, der in der Bauart liegt: Ein Menue existiert
  // nur in einem Fenster, und jedes Fenster gehoert einer Applikation.
  ['window.newWindow', 'immer'],
  ['app.newApplication', 'immer'],
  ['file.open', 'immer'],
  ['file.quickOpen', 'areaOrTab'],
  ['file.newSubpage', 'fileTab'],
  ['file.newFromTemplate', 'immer'],
  // Zug 3E-000281 (Rebase auf 1.131.1 am 2026-09-11): die sechs Datei-Menue-Eintraege
  // des Ex- und Imports der Einrichtung (3E-000160) und der eigenen Sprache
  // (3E-000129), im Zug ohne Bedingung angelegt und damit 'immer'.
  ['file.exportSetup', 'immer'],
  ['file.importSetup', 'immer'],
  ['file.exportLocaleTemplate', 'immer'],
  ['file.importLocale', 'immer'],
  ['file.removeLocale', 'immer'],
  ['file.updateLocale', 'immer'],
  ['journal.openToday', 'area'],
  ['journal.openForDate', 'area'],
  ['area.open', 'immer'],
  ['area.close', 'areaOhneBuchUndRegal'],
  ['area.createDemo', 'immer'],
  ['book.open', 'immer'],
  ['book.create', 'immer'],
  ['book.close', 'buch'],
  ['shelf.open', 'immer'],
  ['shelf.create', 'immer'],
  ['shelf.close', 'regal'],
  ['book.moveChapterFile', 'buch'],
  ['workspace.saveAs', 'workspaceOhne'],
  ['workspace.create', 'immer'],
  ['workspace.close', 'workspaceMit'],
  ['workspace.manage', 'immer'],
  ['file.save', 'fileTab'],
  ['file.saveAs', 'fileTab'],
  ['file.rename', 'fileTab'],
  ['file.detachSubpage', 'fileTab'],
  ['file.rejoinParts', 'fileTab'],
  ['file.print', 'contentTab'],
  ['file.exportPdf', 'contentTab'],
  ['file.exportPortable', 'contentTab'],
  ['app.openSettings', 'immer'],
  ['history.open', 'fileTab'],
  ['graph.openArea', 'area'],
  ['stats.openArea', 'area'],
  // 4T-001759 (Epic 3E-000253): Die Uebersicht der Datenbank. Sie stand am
  // 2026-09-09 nicht im gemessenen Menue, weil sie erst hier entsteht; ihre
  // Basislinie ist deshalb die Bedingung, mit der sie in das Menue eingehaengt
  // wird — der gebundene Bereich, wie bei ihren beiden Nachbarn. Dass der
  // Bereich auch eine Datenbank fuehrt, entscheidet der Anzeige-Prozess.
  ['database.openOverview', 'area'],
  // 4T-001599 (Epic 3E-000191): My Extended Memory ist an keinen Bereich gebunden.
  ['memory.openPage', 'immer'],
  ['view.toggleEdit', 'fileTab'],
  ['view.modeRendered', 'viewMode'],
  ['view.modeSplit', 'viewMode'],
  ['view.modeSource', 'viewMode'],
  ['view.modeLive', 'viewMode'],
  ['view.modeMindmap', 'viewMode'],
  // 4T-001697 (Epic 3E-000287): Die beiden Canvas-Eintraege. Sie standen am
  // 2026-09-09 nicht im gemessenen Menue, weil sie auf dem Zug-Zweig der
  // Canvas entstanden; ihre Basislinie ist deshalb der enabled-Ausdruck, den
  // sie DORT vor der Umstellung trugen — '!systemTab && canvasTab' und
  // derselbe Ausdruck plus offener Canvas-Ansicht. Die Aussage der Basislinie
  // bleibt damit dieselbe: unveraendertes Menue-Verhalten.
  ['view.modeCanvas', 'canvasAnsicht'],
  ['canvas.addCard', 'canvasKarte'],
  // 4T-001701 (Epic 3E-000288): Form-Anlage und die vier Stapel-Befehle.
  // Dieselbe Begruendung wie eine Zeile darueber — sie entstehen auf dem
  // Zug-Zweig der Canvas, und ihre Basislinie ist die Bedingung, mit der sie
  // in das Menue eingehaengt werden: offene Flaeche in der Canvas-Ansicht.
  ['canvas.addShape', 'canvasKarte'],
  // 4T-001702 (Epic 3E-000288): die Gruppen-Anlage, aus demselben Grund und
  // mit derselben Bedingung.
  ['canvas.addGroup', 'canvasKarte'],
  // 4T-001747 (Epic 3E-000289): die Verweis-Karte der Stufe 3, aus demselben
  // Grund und mit derselben Bedingung.
  ['canvas.addLinkCard', 'canvasKarte'],
  // 4T-001748 (Epic 3E-000289): die Bild-Karte derselben Stufe.
  ['canvas.addImageCard', 'canvasKarte'],
  // 4T-001770 (Epic 3E-000290): die Verbindung ohne Maus, aus demselben Grund
  // und mit derselben Bedingung; dass eine Karte GEWAEHLT sein muss, faengt der
  // Guard der Karten-Liste und nicht der Bedingungs-Katalog.
  ['canvas.addConnection', 'canvasKarte'],
  ['canvas.stackFront', 'canvasKarte'],
  ['canvas.stackForward', 'canvasKarte'],
  ['canvas.stackBackward', 'canvasKarte'],
  ['canvas.stackBack', 'canvasKarte'],
  ['view.toggleFocusMode', 'immer'],
  ['view.toggleSidebarLeft', 'immer'],
  ['view.toggleSidebarRight', 'immer'],
  ['file.bookmarkAdd', 'anyTab'],
  ['sidebar.saveVariant', 'immer'],
  ['help.open', 'immer'],
  ['help.tour', 'immer'],
  ['app.commandPalette', 'immer'],
  ['file.toggleAutoSave', 'immer'],
  ['app.toggleRestoreSession', 'immer'],
  ['view.toggleScrollSync', 'anyTab'],
  ['view.toggleFoldGutter', 'sourceToggle'],
  ['view.toggleLineNumbers', 'sourceToggle'],
  ['view.toggleWordWrap', 'sourceToggle'],
  ['view.toggleTypewriterScroll', 'immer'],
  // 4T-001805 (Epic 3E-000292): Die Ausgabe der Flaeche im offenen Format JSON
  // Canvas. Sie stand am 2026-09-09 nicht im gemessenen Menue, weil sie erst
  // hier entsteht; ihre Basislinie ist deshalb die Bedingung, mit der sie in
  // das Untermenue «Exportieren» eingehaengt wird: die offene Canvas-Ansicht
  // (Freigabe des Product Owners vom 2026-09-19 zu F2, im Wortlaut «nur in der
  // Canvas-Ansicht waehlbar und sonst ausgegraut»).
  ['file.exportJsonCanvas', 'canvasFlaecheOffen'],
  // 4T-001806 (Epic 3E-000292): Das Einlesen einer solchen Datei. Es stand am
  // 2026-09-09 ebenso wenig im gemessenen Menue; seine Basislinie ist die
  // Bedingung, mit der es in das neue Untermenue «Importieren» eingehaengt
  // wird — `immer`, weil es weder Reiter noch offene Flaeche braucht. Der
  // Untermenue-Punkt darueber traegt bewusst keine eigene Regel.
  ['file.importJsonCanvas', 'immer'],
]);

// --- Punkt 3: kein Nebenweg im Menue (4T-001637) ----------------------------

// Grenzen der Objekt-Klammer, in der eine Zeile steht: rueckwaerts zur
// oeffnenden, vorwaerts zur zugehoerigen schliessenden Klammer.
function objektBereich(zeilen, idx) {
  let tiefe = 0;
  let start = -1;
  for (let i = idx; i >= 0 && start < 0; i--) {
    for (const ch of [...zeilen[i]].reverse()) {
      if (ch === '}') tiefe++;
      else if (ch === '{') {
        if (tiefe === 0) {
          start = i;
          break;
        }
        tiefe--;
      }
    }
  }
  tiefe = 0;
  let ende = -1;
  for (let i = start; i < zeilen.length && ende < 0; i++) {
    for (const ch of zeilen[i]) {
      if (ch === '{') tiefe++;
      else if (ch === '}') {
        tiefe--;
        if (tiefe === 0) {
          ende = i;
          break;
        }
      }
    }
  }
  return [start, ende];
}

// Die Menue-Eintraege mit literaler Kommando-Kennung: je die Kennung aus dem
// Accelerator und die enabled-Zeilen derselben Eintrags-Klammer. Gelesen wird
// der Quelltext, weil menu.js Electron nachzieht und im Unit-Kontext nicht
// ladbar ist (Muster kommando-dispatcher.test.js).
function menueEintraege() {
  const zeilen = MENUE_QUELLE.split('\n');
  const eintraege = [];
  zeilen.forEach((z, i) => {
    const m = /^(\s*)accelerator: acc\('([^']+)'\),\s*$/.exec(z);
    if (!m) return;
    const einzug = m[1];
    const [start, ende] = objektBereich(zeilen, i);
    const enabledZeilen = [];
    for (let k = start; k <= ende; k++) {
      if (new RegExp('^' + einzug + 'enabled: ').test(zeilen[k])) enabledZeilen.push(zeilen[k]);
    }
    eintraege.push({ id: m[2], zeile: i + 1, enabledZeilen });
  });
  return eintraege;
}

// Wertet den rohen enabled-Ausdruck eines Untermenue-Punkts gegen einen Kontext
// aus. Die Ausdrucks-Formen des Bestands sind endlich und in der Messung
// benannt; eine unbekannte Form wirft, statt still mit einem Ja zu antworten.
function elternFreigabe(ausdruck, ctx) {
  const normiert = ausdruck.replace(/\s+/g, '').replace(/!!\((state&&[^)]+)\)/g, '$1');
  const formen = {
    'state&&state.hasActiveTab&&!systemTab': (c) => !!c.hasTab && !c.systemTab,
    'state&&state.hasActiveTab': (c) => !!c.hasTab,
    '!systemTab': (c) => !c.systemTab,
    'state&&state.hasArea': (c) => !!c.hasArea,
  };
  const f = formen[normiert];
  if (!f)
    throw new Error('unbekannte Untermenue-Regel: ' + ausdruck + ' (normiert: ' + normiert + ')');
  return f(ctx);
}

describe('Durchlauf-Wächter Punkt 3: kein Nebenweg im Menü (4T-001637)', () => {
  const eintraege = menueEintraege();

  it('liest eine plausible Zahl von Menü-Einträgen aus der Quelle', () => {
    // Bricht die Form der Datei, fällt der Wächter hier auf und nicht still
    // durch eine leere Trefferliste.
    expect(eintraege.length).toBeGreaterThanOrEqual(50);
    expect(new Set(eintraege.map((e) => e.id)).size).toBe(eintraege.length);
  });

  it('jeder Eintrag ruft das Modell auf, mit der Kennung seines eigenen Accelerators', () => {
    const befunde = [];
    for (const e of eintraege) {
      if (e.enabledZeilen.length !== 1) {
        befunde.push(`${e.id} (Zeile ${e.zeile}): ${e.enabledZeilen.length} enabled-Zeilen`);
        continue;
      }
      const soll = `enabled: avail('${e.id}'),`;
      if (e.enabledZeilen[0].trim() !== soll)
        befunde.push(`${e.id} (Zeile ${e.zeile}): "${e.enabledZeilen[0].trim()}" statt "${soll}"`);
    }
    expect(befunde, 'Menü-Einträge mit eigener Freigabe-Regel').toEqual([]);
  });

  it('der dynamisch gebaute Panel-Zweig ruft das Modell ebenfalls auf', () => {
    // Die sechzehn Panel-Umschalter tragen kein literales acc('<id>') und sind
    // der Erhebung vom 2026-09-08 entgangen — sie hat 55 von 71 Menü-Einträgen
    // gemessen. Ihre Bedingung ist 'immer' wie ihr Zustand vorher; gesehen hat
    // sie bis zu diesem Wächter niemand.
    expect(MENUE_QUELLE.includes('enabled: avail(meta.commandId),')).toBe(true);
  });

  it('kein Menü-Kommando trägt eine der drei menüfreien Bedingungen', () => {
    const ids = new Set(eintraege.map((e) => e.id));
    const verletzt = COMMANDS.filter(
      (c) => ids.has(c.id) && AVAILABILITY_NAMES_OHNE_MENUE.includes(c.availability),
    );
    expect(verletzt.map((c) => `${c.id}: ${c.availability}`)).toEqual([]);
  });

  // Die Untermenü-Vererbung bleibt als Tatsache der Oberfläche: Electron sperrt
  // mit einem Untermenü-Punkt auch dessen Kinder. Ein solcher Punkt ist kein
  // Kommando und bekommt keinen Modell-Eintrag — aber seine eigene Regel darf
  // keinem Kind die Freigabe nehmen, die dessen Bedingung ihm gibt. Gemessen
  // statt geglaubt, über alle Kontext-Belegungen.
  it('ein Untermenü-Punkt mit eigener Regel nimmt keinem Kind seine Freigabe', () => {
    const zeilen = MENUE_QUELLE.split('\n');
    const eigene = [];
    zeilen.forEach((z, i) => {
      const m = /^\s*enabled: (.+),\s*$/.exec(z);
      if (!m) return;
      if (m[1].startsWith('avail(')) return;
      // Statische Beschriftungen (Gruppen-Titel, Leer-Hinweis) sind keine
      // Kommando-Regeln und bleiben unberührt.
      if (m[1] === 'false') return;
      eigene.push({ zeile: i, ausdruck: m[1] });
    });

    for (const e of eigene) {
      const [start, ende] = objektBereich(zeilen, e.zeile);
      const kinder = [
        ...zeilen
          .slice(start, ende + 1)
          .join('\n')
          .matchAll(/enabled: avail\('([^']+)'\)/g),
      ].map((m) => m[1]);
      expect(
        kinder.length,
        `eigene enabled-Regel in Zeile ${e.zeile + 1} ohne Kommando darunter: ${e.ausdruck}`,
      ).toBeGreaterThan(0);
      for (const kind of kinder) {
        const cmd = COMMANDS.find((c) => c.id === kind);
        for (const ctx of KONTEXTE) {
          if (!isAvailable(cmd.availability, ctx)) continue;
          expect(
            elternFreigabe(e.ausdruck, ctx),
            `Untermenü-Regel "${e.ausdruck}" sperrt ${kind}, obwohl dessen Bedingung "${cmd.availability}" freigibt`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('Durchlauf-Wächter Punkt 4: kein Nebenweg in der Palette (4T-001637)', () => {
  it('die acht Kontext-Mengen und die drei Sonderfälle sind verschwunden', () => {
    const reste = [
      'AREA_COMMANDS',
      'FILE_TAB_COMMANDS',
      'CONTENT_TAB_COMMANDS',
      'ANY_TAB_COMMANDS',
      'AREA_OR_TAB_COMMANDS',
      'VIEW_MODE_COMMANDS',
      'SOURCE_TOGGLE_COMMANDS',
      'EDITOR_CONTEXT_COMMANDS',
      'editorContextAvailable',
    ].filter((name) => PALETTE_QUELLE.includes(name));
    expect(reste, 'eigene Verfügbarkeits-Logik in der Palette').toEqual([]);
  });

  it('der Endpunkt "return true" ist fort, und der Modell-Aufruf steht da', () => {
    expect(PALETTE_QUELLE.includes('return true;')).toBe(false);
    expect(PALETTE_QUELLE.includes('isAvailable(cmd.availability, ctx)')).toBe(true);
    expect(PALETTE_QUELLE.includes('availabilityContext({')).toBe(true);
  });
});

// Befunde der Basislinien-Prüfung über eine gegebene Kommando-Liste. Die Liste
// ist Parameter und nicht fest die Registry, damit die Negativ-Probe unten
// dieselbe Prüfung gegen eine künstlich zurückgedrehte Vorlage laufen lassen
// kann — sonst bliebe der Nachweis, dass sie anschlägt, eine Behauptung.
function basislinienBefunde(kommandos) {
  const befunde = [];
  for (const [id, soll] of MENUE_BASISLINIE) {
    const cmd = kommandos.find((c) => c.id === id);
    if (!cmd) {
      befunde.push(`${id}: nicht mehr in der Registry`);
      continue;
    }
    if (cmd.availability !== soll) befunde.push(`${id}: "${cmd.availability}" statt "${soll}"`);
  }
  return befunde;
}

describe('Menü-Verhalten unverändert (AK4 von 4T-001637)', () => {
  it('jedes Menü-Kommando trägt die Bedingung, die es vor dem Umbau trug', () => {
    expect(
      basislinienBefunde(COMMANDS),
      'gegenüber der Messung vom 2026-09-09 veränderte Menü-Regeln',
    ).toEqual([]);
  });

  it('die Basislinie deckt jeden Menü-Eintrag mit literaler Kennung ab', () => {
    // Die Lehre aus dem Panel-Zweig: Eine Vollständigkeits-Aussage prüft nicht
    // nur ihr Suchmuster, sondern auch die MENGE, auf die sie es anwendet.
    const ids = menueEintraege().map((e) => e.id);
    const fehlend = ids.filter((id) => !MENUE_BASISLINIE.has(id));
    expect(fehlend, 'Menü-Einträge ohne Basislinie').toEqual([]);
    expect(MENUE_BASISLINIE.size).toBe(ids.length);
  });
});

// --- Negativ-Probe (4T-001638) ------------------------------------------------
//
// AK4 von 4T-000918 verlangt den Nachweis, dass die Absicherung vor dem Umbau
// gegriffen hätte. Er ist hier ohne Kunstgriff zu haben: Die sechs Fälle, an
// denen Menü und Palette auseinanderliefen, sind gemessen belegt, und ihr
// damaliger Palette-Wert steht im Erhebungs-Vorgang.
//
// **Die Probe ist ein dauerhafter Prüffall und kein einmal geführtes
// Protokoll.** Ein einmaliger Nachweis veraltet mit der nächsten Änderung; ein
// Prüffall, der die Prüfung gegen eine künstlich zurückgedrehte Vorlage laufen
// lässt, wiederholt ihn bei jedem Lauf. Zurückgedreht wird eine KOPIE der
// Registry, nie sie selbst.
//
// **Welche Prüfung hier antwortet, ist eine Feststellung wert.** Die vier
// Punkte des Durchlauf-Wächters sichern die STRUKTUR — eine Quelle, keine
// Nebenwege — und würden bei einem falschen, aber gültigen Bedingungs-Namen
// schweigen. Die WERTE sichern zwei Basislinien: die Menü-Basislinie oben und
// der Vollbestands-Vergleich in
// test/unit/renderer/kommando-verfuegbarkeit-palette.test.js. Auf die
// Menü-Basislinie zielt diese Probe, weil alle sechs Fälle Menü-Kommandos sind
// und sie den Fall beim Namen nennt.

// Die sechs Fälle mit dem Wert, den die PALETTE vor dem Umbau trug, und dem
// Wert des Menüs, der seither für beide gilt. Beide Spalten stammen aus dem
// Lauf von scripts/erhebung-kommando-verfuegbarkeit.js vom 2026-09-09, nicht
// aus einer Rekonstruktion.
const SECHS_FAELLE_ZURUECK = [
  { id: 'area.close', alt: 'area', gilt: 'areaOhneBuchUndRegal' },
  { id: 'book.close', alt: 'immer', gilt: 'buch' },
  { id: 'shelf.close', alt: 'immer', gilt: 'regal' },
  { id: 'book.moveChapterFile', alt: 'immer', gilt: 'buch' },
  { id: 'file.rejoinParts', alt: 'immer', gilt: 'fileTab' },
  { id: 'view.modeMindmap', alt: 'immer', gilt: 'viewMode' },
];

// Kopie der Registry mit genau einem zurückgedrehten Kommando.
function zurueckgedreht(id, wert) {
  return COMMANDS.map((c) => (c.id === id ? { ...c, availability: wert } : c));
}

describe('Negativ-Probe: die Absicherung schlägt bei jedem der sechs Fälle an (4T-001638)', () => {
  it('deckt genau die sechs gemessenen Fälle ab', () => {
    // Die Menge vor dem Muster: Sechs Fälle hat die Erhebung gefunden, sechs
    // stehen hier, und jeder trägt heute den Wert, den die Menü-Seite trug.
    expect(SECHS_FAELLE_ZURUECK).toHaveLength(6);
    for (const fall of SECHS_FAELLE_ZURUECK) {
      const cmd = COMMANDS.find((c) => c.id === fall.id);
      expect(cmd, `${fall.id} fehlt in der Registry`).toBeTruthy();
      expect(cmd.availability, `${fall.id} trägt nicht mehr den Wert der Menü-Seite`).toBe(
        fall.gilt,
      );
      expect(fall.alt, `${fall.id}: alter und heutiger Wert sind gleich`).not.toBe(fall.gilt);
    }
  });

  for (const fall of SECHS_FAELLE_ZURUECK) {
    it(`${fall.id}: zurück auf "${fall.alt}" wird erkannt und beim Namen genannt`, () => {
      const befunde = basislinienBefunde(zurueckgedreht(fall.id, fall.alt));
      // Genau ein Befund — die Probe reagiert auf die Ursache und nicht auf
      // einen Nebenumstand.
      expect(befunde).toHaveLength(1);
      // Und er benennt den Fall: Kennung, gefundener und erwarteter Wert.
      expect(befunde[0]).toContain(fall.id);
      expect(befunde[0]).toContain(fall.alt);
      expect(befunde[0]).toContain(fall.gilt);
    });
  }

  it('ohne Rückdrehung schweigt sie', () => {
    // Die Gegenprobe zur Probe: Eine Prüfung, die immer rot ist, beweist
    // nichts. Sie ist am unveränderten Bestand grün.
    expect(basislinienBefunde(COMMANDS)).toEqual([]);
  });
});
