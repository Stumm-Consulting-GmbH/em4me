// @vitest-environment jsdom
// 4T-000616 (Epic 3E-000116): Der Bereich als dritter Lieferant der Raum-Suche.
//
// Geprüft wird die Renderer-Seite: Was der Lieferant über die Prozess-Grenze
// schickt (Muster, Flags, Editor-Stand der offenen Datei), wie er auf einen
// gescheiterten oder unvollständigen Abruf reagiert und dass er ohne
// geöffneten Bereich gar nicht erst fragt. Die Such-Arbeit selbst liegt im
// Hauptprozess und ist in test/unit/area-search.test.js abgedeckt.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

let auftraege = [];
let antwort = () => ({
  treffer: [{ gruppe: 'a.md', sprung: { kennung: 'C:/Bereich/a.md' } }],
  gruppen: [{ gruppe: 'a.md', titel: 'a', anzahl: 1 }],
  abgeschnitten: false,
  vorratModus: 'vorrat',
});

window.api.searchArea = async (params) => {
  auftraege.push(params);
  return antwort(params);
};
window.api.releaseAreaSearch = async () => true;

const { bereichsTreffer } = await import('../../../src/renderer/modules/search/search-area.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

// Legt einen aktiven Reiter an. Die Suche liest ihn über activeTab().
function setzeReiter(tab) {
  state.panes[0].tabs = tab ? [tab] : [];
  state.panes[0].activeIndex = tab ? 0 : -1;
  state.activePaneIndex = 0;
}

function dokument(pfad, inhalt) {
  return { path: pfad, content: inhalt, viewMode: 'rendered', editMode: false };
}

describe('such-bereich (4T-000616)', () => {
  beforeEach(() => {
    auftraege = [];
    state.areaPath = 'C:/Bereich';
    setzeReiter(dokument('C:/Bereich/a.md', 'Inhalt mit Treffer'));
  });

  it('fragt ohne geoeffneten Bereich gar nicht erst', async () => {
    state.areaPath = null;
    const res = await bereichsTreffer(/Treffer/gm);
    expect(auftraege).toHaveLength(0);
    expect(res.treffer).toHaveLength(0);
  });

  it('schickt Muster und Flags des uebergebenen Ausdrucks', async () => {
    await bereichsTreffer(/Tref+er/gim);
    expect(auftraege).toHaveLength(1);
    expect(auftraege[0].muster).toBe('Tref+er');
    // RegExp.flags gibt die Flags in fester alphabetischer Reihenfolge aus,
    // aus 'gmi' wird 'gim'. Für new RegExp im Hauptprozess ist das gleich.
    expect(auftraege[0].flags).toBe('gim');
  });

  it('reicht Pfad und Editor-Stand der offenen Datei mit', async () => {
    setzeReiter(dokument('C:/Bereich/notiz.md', 'ungespeicherter Stand'));
    await bereichsTreffer(/Treffer/gm);
    expect(auftraege[0].aktiv).toEqual({
      pfad: 'C:/Bereich/notiz.md',
      text: 'ungespeicherter Stand',
    });
  });

  it('meldet keine offene Datei, wenn der Reiter eine Handbuch-Seite ist', async () => {
    setzeReiter({ path: null, manualPage: 'overview', content: 'egal', viewMode: 'rendered' });
    await bereichsTreffer(/Treffer/gm);
    expect(auftraege[0].aktiv).toBeNull();
  });

  it('meldet keine offene Datei, wenn der Reiter eine System-Seite ist', async () => {
    setzeReiter({ path: null, systemPage: 'settings', content: 'egal', viewMode: 'rendered' });
    await bereichsTreffer(/Treffer/gm);
    expect(auftraege[0].aktiv).toBeNull();
  });

  it('zaehlt die Generation je Auftrag hoch, damit der Hauptprozess abbrechen kann', async () => {
    await bereichsTreffer(/a/gm);
    await bereichsTreffer(/b/gm);
    expect(auftraege[1].generation).toBeGreaterThan(auftraege[0].generation);
  });

  it('reicht das Ergebnis samt Vorrat-Modus durch', async () => {
    const res = await bereichsTreffer(/Treffer/gm);
    expect(res.treffer).toHaveLength(1);
    expect(res.gruppen).toHaveLength(1);
    expect(res.vorratModus).toBe('vorrat');
  });

  it('haelt einer unvollstaendigen Antwort stand', async () => {
    antwort = () => ({ treffer: null, gruppen: undefined });
    const res = await bereichsTreffer(/Treffer/gm);
    expect(res.treffer).toEqual([]);
    expect(res.gruppen).toEqual([]);
    expect(res.abgeschnitten).toBe(false);
  });

  it('liefert leer, wenn der Abruf scheitert', async () => {
    antwort = () => {
      throw new Error('IPC weg');
    };
    const res = await bereichsTreffer(/Treffer/gm);
    expect(res.treffer).toEqual([]);
  });
});

// 4T-001609 (Epic 3E-000252): Der Sprung zählt nicht mehr ab, sondern trifft die
// Stelle.
//
// Beide Wege haben je einen eigenen Prüfgegenstand, weil die beiden Ansichten
// verschiedene Handhaben bieten: Im Editor gibt es Zeichen-Positionen, in der
// Lese-Ansicht nur DOM-Marken. Geprüft werden hier die beiden Entscheidungen
// selbst; ihre Verdrahtung in markiereOffeneDatei ist eine Zeile je Weg.
describe('such-bereich: Sprung in ein Tabellen-Dokument (4T-001609)', () => {
  it('findet die Fundstelle über Zeile und Spalte statt über die Ordnungszahl', async () => {
    const { trefferIndexNachStelle } =
      await import('../../../src/renderer/modules/search/search-area.js');
    const { search } = await import('../../../src/renderer/modules/search/search.js');
    // Ein Dokument mit Prosa vor und hinter dem Datenblock. Die Fundstellen im
    // Block stehen NICHT in der Bereichs-Trefferliste, wohl aber in den
    // Fundstellen des Editors — genau daran ging das Abzählen fehl.
    const inhalt = ['Merkwort oben', '|- id="r-1"', '| Merkwort im Satz', 'Merkwort unten'].join(
      '\n',
    );
    search.matches = [];
    let ab = 0;
    for (const zeile of inhalt.split('\n')) {
      const pos = zeile.indexOf('Merkwort');
      if (pos >= 0) search.matches.push({ from: ab + pos, to: ab + pos + 8 });
      ab += zeile.length + 1;
    }
    expect(search.matches).toHaveLength(3);
    // Der Bereichs-Treffer ist der zweite der LISTE (Zeile 3), im Dokument aber
    // die dritte Fundstelle. Das Abzählen läge auf der zweiten und damit falsch.
    const treffer = { sprung: { zeile: 3, spalte: 0, kennung: 'C:/Bereich/t.md' } };
    const idx = trefferIndexNachStelle(dokument('C:/Bereich/t.md', inhalt), treffer);
    expect(idx).toBe(2);
  });

  it('meldet -1, wenn an der Stelle keine Fundstelle liegt', async () => {
    const { trefferIndexNachStelle } =
      await import('../../../src/renderer/modules/search/search-area.js');
    const { search } = await import('../../../src/renderer/modules/search/search.js');
    search.matches = [{ from: 0, to: 3 }];
    const treffer = { sprung: { zeile: 99, spalte: 0 } };
    expect(trefferIndexNachStelle(dokument('C:/Bereich/t.md', 'kurz'), treffer)).toBe(-1);
  });

  it('nimmt die Marken im gerenderten Datensatz-Block aus der Zählung', async () => {
    const { zaehlbareMarken } = await import('../../../src/renderer/modules/search/search-area.js');
    document.body.innerHTML =
      '<div id="w"><mark id="a"></mark>' +
      '<div class="perspective-records"><mark id="b"></mark></div>' +
      '<mark id="c"></mark></div>';
    const alle = [...document.querySelectorAll('mark')];
    expect(alle).toHaveLength(3);
    const gezaehlt = zaehlbareMarken(alle);
    expect(gezaehlt.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('lässt ein Dokument ohne Datensatz-Block unverändert zählen', async () => {
    const { zaehlbareMarken } = await import('../../../src/renderer/modules/search/search-area.js');
    document.body.innerHTML = '<div id="w"><mark id="a"></mark><mark id="b"></mark></div>';
    const alle = [...document.querySelectorAll('mark')];
    expect(zaehlbareMarken(alle)).toEqual(alle);
  });
});
