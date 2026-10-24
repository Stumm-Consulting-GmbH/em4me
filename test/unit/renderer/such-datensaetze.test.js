// @vitest-environment jsdom
// 4T-002332 (Epic 3E-000264): Treffer-Zeile und Sprung der Datensatz-Treffer.
//
// Geprüft wird die Anzeige-Seite der Datensatz-Suche: das Erkennungs-Merkmal
// einer Datensatz-Gruppe gegen den Haupt-Prozess, Gruppen-Kopf und Treffer-Zeile
// in der gezeichneten Liste, der Sprung in die Maske über `scg:open-form`, der
// Schlüssel zweier Datensätze mit gleichem Offset und der Filter im
// Ersetzen-Modus. Gezeichnet wird über das Panel selbst (Muster
// such-panel-auswahl.test.js), weil die Zusage die gezeichnete Liste ist und
// nicht der einzelne Helfer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './api-stub.js';

// Das Grundgerüst des Stubs kennt die Panel-Abschnitte nicht; sie kommen hier
// dazu, bevor app-state.js seine Element-Verweise baut.
for (const pane of document.querySelectorAll('.pane-group')) {
  pane.innerHTML = `
    <section class="sidebar-section sidebar-searchresults">
      <div class="search-results-status"></div>
      <div class="search-results-list"></div>
    </section>`;
}

// jsdom kennt scrollIntoView nicht; das Panel hält den gewählten Treffer
// sichtbar, für diese Prüfung ohne Belang.
Element.prototype.scrollIntoView = () => {};

const panel = await import('../../../src/renderer/modules/search/search-panel.js');
const records = await import('../../../src/renderer/modules/search/search-records.js');
const { springeZuTreffer } = await import('../../../src/renderer/modules/search/search-jump.js');
const { schluessel } = await import('../../../src/renderer/modules/search/search-auswahl.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const TABELLE = 'C:/Bereich/Library.md';
const GRUPPE = 'Library.md#datensaetze';

// Ein Dokument-Treffer in der Form des Suchraum-Kerns.
function dokumentTreffer(offset) {
  return {
    gruppe: 'alpha.md',
    gruppeTitel: 'alpha',
    quelle: 'area',
    sprung: { offset, zeile: 0, spalte: offset, kennung: 'C:/Bereich/alpha.md' },
    ausschnitt: `… Umberto bei ${offset} …`,
    von: 2,
    bis: 9,
  };
}

// Ein Datensatz-Treffer in der Form von 4T-002331: Fund im Feld-Wert.
function datensatzTreffer(kennung, anzeige) {
  return {
    gruppe: GRUPPE,
    gruppeTitel: 'Library',
    quelle: 'record',
    sprung: { tabelle: TABELLE, kennung, offset: 0, zeile: 0, spalte: 0 },
    anzeige,
    feld: 'author',
    ausschnitt: 'Umberto Eco',
    von: 0,
    bis: 7,
  };
}

// Eine Dokument-Gruppe mit einem Treffer, dahinter die Datensatz-Gruppe mit
// zwei Treffern an derselben Stelle ihres Werts.
function bestand() {
  return {
    raum: 'area',
    muster: 'Umberto',
    flags: 'gim',
    abgeschnitten: false,
    gruppen: [
      { gruppe: 'alpha.md', titel: 'alpha', anzahl: 1 },
      { gruppe: GRUPPE, titel: 'Library', anzahl: 2 },
    ],
    treffer: [
      dokumentTreffer(10),
      datensatzTreffer('r-00001', 'The Name of the Rose'),
      datensatzTreffer('r-00002', "Foucault's Pendulum"),
    ],
  };
}

function liste() {
  return document.querySelector('.pane-group[data-pane="0"] .search-results-list');
}

function status() {
  return document.querySelector('.pane-group[data-pane="0"] .search-results-status');
}

let ereignisse = [];
function merke(ev) {
  ereignisse.push(ev.detail);
}

beforeEach(() => {
  state.searchResults.visibleByPane[0] = true;
  state.searchResults.visibleByPane[1] = false;
  state.activePaneIndex = 0;
  panel.setzeErsetzenModus(false);
  panel.leereTreffer(null);
  panel.setzeSprungHandler(null);
  ereignisse = [];
  document.addEventListener('scg:open-form', merke);
});

afterEach(() => {
  document.removeEventListener('scg:open-form', merke);
});

describe('Erkennungs-Merkmal (a, b)', () => {
  it('das Suffix ist das des geteilten Suchkerns', async () => {
    // Die Konstante liegt im geteilten Suchkern, den beide Prozesse laden; der
    // Haupt-Prozess reicht dieselbe weiter. Ein Modul des Haupt-Prozesses wird
    // hier bewusst nicht geladen, weil es Index und Tabellen-Leser nachzieht.
    const kern = await import('../../../src/shared/search-scope.js');
    expect(records.DATENSATZ_GRUPPEN_SUFFIX).toBe(kern.DATENSATZ_GRUPPEN_SUFFIX);
    expect(records.DATENSATZ_GRUPPEN_SUFFIX).toBe('#datensaetze');
  });

  it('erkennt Datensatz-Gruppe und Datensatz-Treffer', () => {
    expect(records.istDatensatzGruppe(GRUPPE)).toBe(true);
    expect(records.istDatensatzGruppe('Library.md')).toBe(false);
    expect(records.istDatensatzGruppe(undefined)).toBe(false);
    expect(records.istDatensatzTreffer(datensatzTreffer('r-00001', 'x'))).toBe(true);
    expect(records.istDatensatzTreffer(dokumentTreffer(1))).toBe(false);
    expect(records.istDatensatzTreffer(null)).toBe(false);
  });
});

describe('Zeichnung in der Liste (c, d)', () => {
  it('der Kopf einer Datensatz-Gruppe trägt Klasse und Zusatz, der Dokument-Kopf nicht', () => {
    panel.zeigeTreffer(bestand());
    const koepfe = [...liste().querySelectorAll('.search-results-group')];
    expect(koepfe).toHaveLength(2);
    const [dokument, datensaetze] = koepfe;
    expect(dokument.classList.contains('search-results-group-records')).toBe(false);
    expect(dokument.querySelector('.search-results-group-kind')).toBeNull();
    expect(datensaetze.classList.contains('search-results-group-records')).toBe(true);
    expect(datensaetze.querySelector('.search-results-group-title').textContent).toBe('Library');
    // In jsdom liefert t() den Schlüssel; er ist damit der Beleg für den Zugang.
    const art = datensaetze.querySelector('.search-results-group-kind');
    expect(art.textContent).toBe('database.search.groupSuffix');
    // Der Zusatz steht hinter dem Titel und vor der Zahl.
    expect(art.previousElementSibling.className).toBe('search-results-group-title');
    expect(datensaetze.querySelector('.search-results-group-count').textContent).toBe('2');
  });

  it('die Datensatz-Gruppe steht hinter der Dokument-Gruppe', () => {
    panel.zeigeTreffer(bestand());
    const titel = [...liste().querySelectorAll('.search-results-group-title')].map(
      (el) => el.textContent,
    );
    expect(titel).toEqual(['alpha', 'Library']);
  });

  it('die Zeile nennt Anzeige-Form und Feld vor dem Ausschnitt, der Fund steht im mark', () => {
    panel.zeigeTreffer(bestand());
    const zeilen = [...liste().querySelectorAll('.search-results-item')];
    expect(zeilen).toHaveLength(3);
    const [dokument, rose] = zeilen;
    expect(dokument.classList.contains('search-results-item-record')).toBe(false);
    expect(dokument.querySelector('.search-results-record-meta')).toBeNull();

    expect(rose.classList.contains('search-results-item-record')).toBe(true);
    expect(rose.title).toBe('database.search.openForm');
    const meta = rose.querySelector('.search-results-record-meta');
    expect(meta.textContent).toBe('The Name of the Rose · author: ');
    // Die Meta-Angabe ist das erste Kind, der Ausschnitt folgt ihr.
    expect(rose.firstChild).toBe(meta);
    expect(rose.querySelector('mark.search-results-match').textContent).toBe('Umberto');
    expect(rose.textContent).toBe('The Name of the Rose · author: Umberto Eco');
  });

  it('die Gesamtzahl zählt Dokument- und Datensatz-Treffer', () => {
    panel.zeigeTreffer(bestand());
    // Schlüssel der Zählung im Bereich, «{n} Treffer in {g} Dateien».
    expect(status().textContent).toBe('searchResults.countFiles');
    expect(panel.zaehlSchluessel('area', 3, 2)).toBe('searchResults.countFiles');
  });
});

describe('Sprung in die Maske (e)', () => {
  it('springeZuDatensatz löst scg:open-form mit Tabelle und Kennung aus', () => {
    const ok = records.springeZuDatensatz(datensatzTreffer('r-00002', 'x'));
    expect(ok).toBe(true);
    expect(ereignisse).toEqual([{ filePath: TABELLE, recordId: 'r-00002' }]);
  });

  it('ohne Tabelle oder Kennung geschieht nichts', () => {
    const ohne = datensatzTreffer('', 'x');
    expect(records.springeZuDatensatz(ohne)).toBe(false);
    expect(records.springeZuDatensatz({ quelle: 'record' })).toBe(false);
    expect(ereignisse).toEqual([]);
  });

  it('ein Klick auf die Zeile führt über den Sprung-Weg der Herkunft in die Maske', async () => {
    panel.setzeSprungHandler(springeZuTreffer);
    panel.zeigeTreffer(bestand());
    const zeilen = [...liste().querySelectorAll('.search-results-item-record')];
    zeilen[0].click();
    await Promise.resolve();
    expect(ereignisse).toEqual([{ filePath: TABELLE, recordId: 'r-00001' }]);
  });
});

describe('Schlüssel zweier Datensätze (f)', () => {
  it('gleicher Offset, verschiedene Kennung: verschiedene Schlüssel', () => {
    const a = datensatzTreffer('r-00001', 'A');
    const b = datensatzTreffer('r-00002', 'B');
    expect(a.sprung.offset).toBe(b.sprung.offset);
    expect(schluessel(a)).not.toBe(schluessel(b));
    // Dasselbe Feld eines Datensatzes bleibt über zwei Läufe derselbe Schlüssel.
    expect(schluessel(a)).toBe(schluessel(datensatzTreffer('r-00001', 'A')));
  });

  it('der Schlüssel eines Dokument-Treffers bleibt Gruppe und Offset', () => {
    expect(schluessel(dokumentTreffer(40))).toBe('alpha.md\u000040');
  });

  it('beide Zeilen tragen in der Liste verschiedene Schlüssel', () => {
    panel.zeigeTreffer(bestand());
    const schl = [...liste().querySelectorAll('.search-results-item-record')].map(
      (el) => el.dataset.schluessel,
    );
    expect(new Set(schl).size).toBe(2);
  });
});

describe('Ersetzen-Modus (g)', () => {
  it('der Filter liefert im Ersetzen-Modus keine Datensatz-Gruppen und -Treffer', () => {
    const b = bestand();
    const aus = records.sichtbareGruppenUndTreffer(b, false);
    expect(aus.gruppen.map((g) => g.gruppe.gruppe)).toEqual(['alpha.md', GRUPPE]);
    expect(aus.gruppen.map((g) => g.start)).toEqual([0, 1]);
    expect(aus.treffer).toHaveLength(3);
    const an = records.sichtbareGruppenUndTreffer(b, true);
    expect(an.gruppen.map((g) => g.gruppe.gruppe)).toEqual(['alpha.md']);
    expect(an.treffer).toEqual([b.treffer[0]]);
    // Der Bestand selbst bleibt unverändert.
    expect(b.treffer).toHaveLength(3);
    expect(b.gruppen).toHaveLength(2);
  });

  it('die Liste zeichnet im Ersetzen-Modus keine Datensatz-Gruppe, zählt aber alle', () => {
    panel.zeigeTreffer(bestand());
    panel.setzeErsetzenModus(true);
    expect(liste().querySelectorAll('.search-results-group-records')).toHaveLength(0);
    expect(liste().querySelectorAll('.search-results-item-record')).toHaveLength(0);
    expect(liste().querySelectorAll('.search-results-group')).toHaveLength(1);
    // Ein Ankreuzfeld für die Gruppe, eines für ihren Treffer.
    expect(liste().querySelectorAll('.search-results-check')).toHaveLength(2);
    expect(status().textContent).toBe('searchResults.countFiles');
  });

  it('ein Datensatz-Treffer zählt nie zur Auswahl des Ersetzens', () => {
    panel.zeigeTreffer(bestand());
    panel.setzeErsetzenModus(true);
    expect(panel.anzahlAusgewaehlt()).toBe(1);
    expect(panel.ausgewaehlteFundstellen()).toEqual([
      { pfad: 'C:/Bereich/alpha.md', offsets: [10], frontmatter: [] },
    ]);
  });

  it('außerhalb des Ersetzen-Modus erscheinen sie wieder', () => {
    panel.zeigeTreffer(bestand());
    panel.setzeErsetzenModus(true);
    panel.setzeErsetzenModus(false);
    expect(liste().querySelectorAll('.search-results-item-record')).toHaveLength(2);
  });
});
