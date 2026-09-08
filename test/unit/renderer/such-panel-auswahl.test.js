// @vitest-environment jsdom
// 4T-001525 (Epic 3E-000169): Die Auswahl je Fundstelle in der Trefferliste.
//
// Geprüft wird die Auswahl-Ebene selbst: dass sie neben dem Auswahl-Index
// steht statt an seiner Stelle, dass «alles ausgewählt» die Vorgabe ist, dass
// die Gruppen-Anzeige dreiwertig aus ihren Treffern folgt, was ein Klappen und
// ein zweiter Suchlauf mit ihr machen — und dass das Panel ohne Ersetzen-Modus
// Element für Element das von 4T-000759 bleibt.
//
// Der letzte Punkt ist der Grund für den Vergleich ganzer Element-Folgen statt
// einzelner Zählungen: Die Zusicherung lautet «unverändert», und eine Zählung
// bewiese nur «ungefähr gleich viel».
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Das Grundgerüst des Stubs kennt die Panel-Abschnitte nicht; sie kommen hier
// dazu, bevor app-state.js seine Element-Verweise baut (das geschieht beim
// ersten getPaneEls, also nach diesem Einschub).
for (const pane of document.querySelectorAll('.pane-group')) {
  pane.innerHTML = `
    <section class="sidebar-section sidebar-searchresults">
      <div class="search-results-status"></div>
      <div class="search-results-list"></div>
    </section>`;
}

// jsdom kennt scrollIntoView nicht. Das Panel hält den gewählten Treffer
// sichtbar; für die Auswahl-Ebene ist das ohne Belang, also genügt hier ein
// stiller Platzhalter statt einer Verrenkung im Produktiv-Code.
Element.prototype.scrollIntoView = () => {};

const {
  zeigeTreffer,
  leereTreffer,
  setzeErsetzenModus,
  setzeAuswahl,
  aktuelleAuswahl,
  ausgewaehlteFundstellen,
  anzahlAusgewaehlt,
  setzeSprungHandler,
} = await import('../../../src/renderer/modules/search/search-panel.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const DATEI_A = 'C:/Bereich/alpha.md';
const DATEI_B = 'C:/Bereich/unter/beta.md';

// Ein Treffer in der Form, die der Suchraum-Kern liefert (shared/search-scope.js).
function treffer(gruppe, kennung, offset) {
  return {
    gruppe,
    gruppeTitel: gruppe,
    quelle: 'area',
    sprung: { offset, zeile: 0, spalte: offset, kennung },
    ausschnitt: `… Notiz bei ${offset} …`,
    von: 2,
    bis: 7,
  };
}

// Zwei Dateien, drei plus zwei Fundstellen.
function bestand(muster = 'Notiz') {
  return {
    raum: 'area',
    muster,
    flags: 'gm',
    abgeschnitten: false,
    gruppen: [
      { gruppe: 'alpha.md', titel: 'alpha', anzahl: 3 },
      { gruppe: 'unter/beta.md', titel: 'unter/beta', anzahl: 2 },
    ],
    treffer: [
      treffer('alpha.md', DATEI_A, 10),
      treffer('alpha.md', DATEI_A, 40),
      treffer('alpha.md', DATEI_A, 90),
      treffer('unter/beta.md', DATEI_B, 5),
      treffer('unter/beta.md', DATEI_B, 60),
    ],
  };
}

function liste() {
  return document.querySelector('.pane-group[data-pane="0"] .search-results-list');
}

// Die Element-Folge der Liste als lesbare Kurzform: 'gruppe', 'treffer' oder
// 'feld'. Sie ist der Massstab fuer «unveraendert».
function folge() {
  return [...liste().children].map((el) => {
    if (el.classList.contains('search-results-check')) return 'feld';
    if (el.classList.contains('search-results-group')) return 'gruppe';
    return 'treffer';
  });
}

function felder() {
  return [...liste().querySelectorAll('.search-results-check')];
}

// Die Ankreuzfelder der Treffer, ohne die der Gruppen.
function trefferFelder() {
  return felder().filter((f) => !f.classList.contains('search-results-check-group'));
}

function gruppenFelder() {
  return felder().filter((f) => f.classList.contains('search-results-check-group'));
}

// Ein Ankreuzfeld so umschalten, wie der Anwender es tut: Zustand setzen und
// das change-Ereignis auslösen.
function schalte(feld, an) {
  feld.checked = an;
  feld.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  state.searchResults.visibleByPane[0] = true;
  state.searchResults.visibleByPane[1] = false;
  state.activePaneIndex = 0;
  setzeErsetzenModus(false);
  leereTreffer(null);
  setzeSprungHandler(null);
});

describe('Trefferliste ohne Ersetzen-Modus (AK6)', () => {
  it('zeigt kein einziges Ankreuzfeld und keine Raster-Klasse', () => {
    zeigeTreffer(bestand());
    expect(folge()).toEqual([
      'gruppe',
      'treffer',
      'treffer',
      'treffer',
      'gruppe',
      'treffer',
      'treffer',
    ]);
    expect(felder()).toHaveLength(0);
    expect(liste().classList.contains('auswahl-modus')).toBe(false);
  });

  it('zeigt auch im Ersetzen-Modus keine Felder ausserhalb des Bereichs-Raums', () => {
    // Handbuch und Einstellungen sind schreibgeschuetzt; eine Auswahl zum
    // Ersetzen waere dort eine Zusage, die niemand einloest.
    zeigeTreffer({ ...bestand(), raum: 'manual' });
    setzeErsetzenModus(true);
    expect(felder()).toHaveLength(0);
    expect(liste().classList.contains('auswahl-modus')).toBe(false);
  });

  it('kehrt beim Verlassen des Modus zur unveraenderten Folge zurueck', () => {
    zeigeTreffer(bestand());
    const vorher = folge();
    setzeErsetzenModus(true);
    expect(folge()).not.toEqual(vorher);
    setzeErsetzenModus(false);
    expect(folge()).toEqual(vorher);
    expect(liste().classList.contains('auswahl-modus')).toBe(false);
  });
});

describe('Ankreuzfelder im Ersetzen-Modus (AK1, AK2)', () => {
  beforeEach(() => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
  });

  it('traegt je Treffer und je Gruppe ein Feld, das Feld vor seiner Zeile', () => {
    expect(folge()).toEqual([
      'feld',
      'gruppe',
      'feld',
      'treffer',
      'feld',
      'treffer',
      'feld',
      'treffer',
      'feld',
      'gruppe',
      'feld',
      'treffer',
      'feld',
      'treffer',
    ]);
    expect(trefferFelder()).toHaveLength(5);
    expect(gruppenFelder()).toHaveLength(2);
    expect(liste().classList.contains('auswahl-modus')).toBe(true);
  });

  it('hat alles ausgewaehlt, ohne dass jemand etwas anklicken muss', () => {
    expect(trefferFelder().every((f) => f.checked)).toBe(true);
    expect(gruppenFelder().every((f) => f.checked && !f.indeterminate)).toBe(true);
    expect(anzahlAusgewaehlt()).toBe(5);
  });
});

describe('Dreiwertigkeit der Gruppe (AK3)', () => {
  beforeEach(() => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
  });

  it('meldet teilweise, sobald ein Treffer der Gruppe abgewaehlt ist', () => {
    schalte(trefferFelder()[0], false);
    const gruppe = gruppenFelder()[0];
    expect(gruppe.indeterminate).toBe(true);
    // Die zweite Gruppe ist davon unberuehrt.
    expect(gruppenFelder()[1].indeterminate).toBe(false);
    expect(gruppenFelder()[1].checked).toBe(true);
    expect(anzahlAusgewaehlt()).toBe(4);
  });

  it('meldet keine, wenn alle Treffer der Gruppe abgewaehlt sind', () => {
    for (let i = 0; i < 3; i++) schalte(trefferFelder()[i], false);
    const gruppe = gruppenFelder()[0];
    expect(gruppe.checked).toBe(false);
    expect(gruppe.indeterminate).toBe(false);
    expect(anzahlAusgewaehlt()).toBe(2);
  });

  it('setzt ueber das Gruppen-Feld die ganze Gruppe und nur sie', () => {
    schalte(gruppenFelder()[0], false);
    expect(anzahlAusgewaehlt()).toBe(2);
    expect(
      trefferFelder()
        .slice(0, 3)
        .every((f) => !f.checked),
    ).toBe(true);
    expect(
      trefferFelder()
        .slice(3)
        .every((f) => f.checked),
    ).toBe(true);

    schalte(gruppenFelder()[0], true);
    expect(anzahlAusgewaehlt()).toBe(5);
  });

  it('macht aus einer Teilauswahl beim Klick die ganze Gruppe', () => {
    schalte(trefferFelder()[1], false);
    expect(gruppenFelder()[0].indeterminate).toBe(true);
    // Ein Anwender, der zum Gruppen-Feld greift, will die Gruppe als Ganzes
    // setzen — nicht seine Teilauswahl gespiegelt bekommen.
    schalte(gruppenFelder()[0], true);
    expect(anzahlAusgewaehlt()).toBe(5);
    expect(gruppenFelder()[0].indeterminate).toBe(false);
  });
});

describe('Bestaendigkeit der Auswahl (AK4)', () => {
  beforeEach(() => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
  });

  it('ueberlebt das Zu- und Aufklappen einer Gruppe', () => {
    schalte(trefferFelder()[0], false);
    const kopf = liste().querySelector('.search-results-group');
    kopf.click(); // zuklappen
    expect(trefferFelder()).toHaveLength(2); // nur noch die zweite Gruppe
    kopf.click(); // wieder auf
    expect(trefferFelder()[0].checked).toBe(false);
    expect(anzahlAusgewaehlt()).toBe(4);
  });

  it('ueberlebt einen erneuten Lauf mit demselben Muster', () => {
    schalte(trefferFelder()[0], false);
    zeigeTreffer(bestand());
    expect(anzahlAusgewaehlt()).toBe(4);
    expect(trefferFelder()[0].checked).toBe(false);
  });

  it('wird von einem anderen Muster zurueckgesetzt', () => {
    schalte(trefferFelder()[0], false);
    zeigeTreffer(bestand('Merk'));
    expect(anzahlAusgewaehlt()).toBe(5);
    expect(trefferFelder().every((f) => f.checked)).toBe(true);
  });

  it('wird von einem Raum-Wechsel zurueckgesetzt', () => {
    schalte(trefferFelder()[0], false);
    zeigeTreffer({ ...bestand(), raum: 'manual' });
    expect(anzahlAusgewaehlt()).toBe(5);
  });
});

describe('Herausgabe der Auswahl (AK7)', () => {
  beforeEach(() => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
  });

  // 4T-001531 (Epic 3E-000175): Dazu gekommen ist die zweite Liste je Datei.
  // Sie bleibt leer, solange die Treffer aus einem Suchlauf stammen — eine
  // Fundstelle im Frontmatter-Feld kennt nur die Tag-Umbenennung, und sie
  // wandert dorthin, weil sie ueber das Feld geschrieben wird und nicht ueber
  // ihre Position.
  it('buendelt die Offsets nach Datei', () => {
    expect(ausgewaehlteFundstellen()).toEqual([
      { pfad: DATEI_A, offsets: [10, 40, 90], frontmatter: [] },
      { pfad: DATEI_B, offsets: [5, 60], frontmatter: [] },
    ]);
  });

  it('laesst abgewaehlte Fundstellen weg und eine leere Datei ganz entfallen', () => {
    schalte(trefferFelder()[1], false);
    schalte(gruppenFelder()[1], false);
    expect(ausgewaehlteFundstellen()).toEqual([
      { pfad: DATEI_A, offsets: [10, 90], frontmatter: [] },
    ]);
  });

  it('legt eine Fundstelle des Frontmatter-Feldes in die zweite Liste (4T-001531)', () => {
    // Der Schnitt entscheidet ueber den Schreibweg: Offsets gehen durch die
    // Ersetzen-Strecke, ein Feld-Index ueber writeFrontmatter. Landete beides
    // in einer Liste, aenderte der Lauf dieselbe Stelle zweimal.
    const mitFeld = bestand();
    mitFeld.treffer[0] = {
      ...mitFeld.treffer[0],
      zusatz: { art: 'frontmatter', index: 2, alt: 'projekt', neu: 'arbeit', kind: false },
    };
    zeigeTreffer(mitFeld);
    const [ersteDatei] = ausgewaehlteFundstellen();
    expect(ersteDatei.frontmatter).toEqual([2]);
    expect(ersteDatei.offsets).not.toContain(mitFeld.treffer[0].sprung.offset);
  });

  it('gibt ausserhalb des Bereichs-Raums nichts heraus', () => {
    // Handbuch und Einstellungen sind schreibgeschuetzt; eine Auswahl dort
    // haette kein Ziel.
    zeigeTreffer({ ...bestand(), raum: 'manual' });
    expect(ausgewaehlteFundstellen()).toEqual([]);
  });
});

describe('Tastatur-Fuehrung der Ankreuzfelder', () => {
  // Das Umschalten eines Felds zeichnet die Liste neu, und dabei geht das eben
  // benutzte DOM-Element verloren. Ohne die Fokus-Rueckgabe faende ein
  // Anwender, der die Felder mit Tabulator und Leertaste bedient, nach jedem
  // Haken den Fokus im Nichts wieder. Gemessen: Ohne sie steht er auf BODY.
  it('gibt dem umgeschalteten Feld den Fokus zurueck', () => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
    const feld = trefferFelder()[1];
    feld.focus();
    schalte(feld, false);

    const danach = document.activeElement;
    expect(danach.tagName).toBe('INPUT');
    expect(trefferFelder()[1]).toBe(danach);
    expect(danach.checked).toBe(false);
  });

  it('gibt auch dem Gruppen-Feld den Fokus zurueck', () => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
    const feld = gruppenFelder()[1];
    feld.focus();
    schalte(feld, false);

    expect(document.activeElement).toBe(gruppenFelder()[1]);
    expect(document.activeElement.checked).toBe(false);
  });
});

describe('Tastatur-Fuehrung der Trefferliste (4T-001561)', () => {
  // Der Bestands-Fehler, den dieser Prüffall festhält: Das Neuzeichnen verwarf
  // das fokussierte Element, der Fokus fiel auf BODY, und der Handler prüft
  // `ev.target.closest('.sidebar-searchresults')` — der ZWEITE Druck erreichte
  // ihn damit nicht mehr. Gemessen am 2026-09-07; deshalb misst dieser Fall
  // zwei Drücke und nicht einen.
  function druecke(el, taste) {
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: taste, bubbles: true }));
  }

  it('bewegt die Auswahl ueber ZWEI aufeinanderfolgende Druecke', async () => {
    const { initSearchResultsPanel } =
      await import('../../../src/renderer/modules/search/search-panel.js');
    initSearchResultsPanel();
    zeigeTreffer(bestand());
    const zeilen = liste().querySelectorAll('.search-results-item');
    zeilen[0].focus();

    druecke(document.activeElement, 'ArrowDown');
    expect(aktuelleAuswahl()).toBe(1);
    // Der Fokus liegt auf der neu gezeichneten Zeile, nicht auf BODY.
    expect(document.activeElement.className).toContain('search-results-item');

    druecke(document.activeElement, 'ArrowDown');
    expect(aktuelleAuswahl()).toBe(2);
  });

  it('loest Enter danach den Sprung auf die gewaehlte Zeile aus', async () => {
    const { initSearchResultsPanel } =
      await import('../../../src/renderer/modules/search/search-panel.js');
    initSearchResultsPanel();
    const gesprungen = [];
    setzeSprungHandler((tr, index) => gesprungen.push(index));
    zeigeTreffer(bestand());
    liste().querySelectorAll('.search-results-item')[0].focus();

    druecke(document.activeElement, 'ArrowDown');
    druecke(document.activeElement, 'Enter');

    expect(gesprungen).toEqual([1]);
  });

  it('holt den Fokus bei einem Klick NICHT in die Liste zurueck', async () => {
    const { initSearchResultsPanel } =
      await import('../../../src/renderer/modules/search/search-panel.js');
    initSearchResultsPanel();
    setzeSprungHandler(() => {});
    zeigeTreffer(bestand());
    document.body.focus();

    liste().querySelectorAll('.search-results-item')[2].click();

    // Ein Klick springt in das geoeffnete Dokument; dort gehoert der Fokus hin,
    // nicht zurueck in die Liste.
    expect(document.activeElement.className).not.toContain('search-results-item');
  });
});

describe('Trennung von Auswahl und Sprung (AK5)', () => {
  it('laesst den Auswahl-Index vom Abwaehlen unberuehrt', () => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
    setzeAuswahl(3);
    expect(aktuelleAuswahl()).toBe(3);
    schalte(trefferFelder()[3], false);
    expect(aktuelleAuswahl()).toBe(3);
  });

  it('loest ein Klick auf die Trefferzeile weiterhin den Sprung aus', () => {
    const gesprungen = [];
    setzeSprungHandler((tr, index) => gesprungen.push(index));
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
    liste().querySelectorAll('.search-results-item')[2].click();
    expect(gesprungen).toEqual([2]);
    // Der Sprung ist keine Abwahl: Die Auswahl steht unveraendert.
    expect(anzahlAusgewaehlt()).toBe(5);
  });

  it('haelt die Auswahl ueber das Aus- und Einschalten des Modus', () => {
    zeigeTreffer(bestand());
    setzeErsetzenModus(true);
    schalte(trefferFelder()[0], false);
    setzeErsetzenModus(false);
    setzeErsetzenModus(true);
    expect(anzahlAusgewaehlt()).toBe(4);
  });
});
