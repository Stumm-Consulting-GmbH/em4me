// @vitest-environment jsdom
// 4T-0616 (Epic 3E-0116): Der Bereich als dritter Lieferant der Raum-Suche.
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

describe('such-bereich (4T-0616)', () => {
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
