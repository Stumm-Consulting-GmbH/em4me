// @vitest-environment jsdom
// 4T-001526 (Epic 3E-000169): Prüffälle des Ersetzen-Laufs im Anzeige-Prozess.
//
// Der Schwerpunkt ist der Schnitt zwischen Puffer und Platte (Entscheidung E5):
// Eine Datei mit ungespeicherten Änderungen wird gar nicht erst an den
// Hauptprozess geschickt, sondern auf ihrem Puffer ersetzt — als EINE
// Rückgängig-Einheit, und sie bleibt geändert (AK3). Eine ungeänderte Datei
// geht an den Hauptprozess und lädt danach den geschriebenen Stand nach (AK4).
//
// Die Nachbarn sind ersetzt, nicht mitgeladen: Tabbar, Pane-Aufbau und der
// Bericht-Dialog haben mit dieser Frage nichts zu tun und brächten nur ihr
// eigenes DOM mit. Der Ersetzungs-Kern läuft dagegen echt — er IST die Regel,
// um die es geht.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

// Der Bericht ist Text für den Anwender; ohne geladene Sprachdatei prüfte man
// Schlüssel statt Sätze (Muster eigenschaften-abgeleitet.test.js).
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const berichte = [];
const gezeichneteTabbars = [];

vi.mock('../../../src/renderer/modules/views/tabbar.js', () => ({
  renderTabbar: (p) => gezeichneteTabbars.push(p),
}));
vi.mock('../../../src/renderer/modules/views/pane-render.js', () => ({
  invalidatePaneRenderCache: () => {},
  renderPaneContent: () => {},
}));
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showLinkReportDialog: async (opts) => {
    berichte.push(opts);
  },
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [null, null] }));

let auswahl = [];
vi.mock('../../../src/renderer/modules/search/search-panel.js', () => ({
  ausgewaehlteFundstellen: () => auswahl,
}));

const { ersetzeAuswahlImBereich } =
  await import('../../../src/renderer/modules/search/search-ersetzen.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');

const DATEI_A = 'C:/Bereich/alpha.md';
const DATEI_B = 'C:/Bereich/beta.md';

let auftraege = [];
let antwort = null;
let gelesen = {};

function reiter(pfad, inhalt, dirty) {
  return { path: pfad, content: inhalt, originalContent: inhalt, dirty, viewMode: 'source' };
}

function setzeReiter(tabs, aktivIdx = 0) {
  // Der Stub kennt eine Spalte; mehr braucht die Frage nach dem Schnitt nicht.
  state.panes[0].tabs = tabs;
  state.panes[0].activeIndex = aktivIdx;
  state.activePaneIndex = 0;
}

// Ein Editor-Doppel: Es hält nur, was der Lauf anfasst — die Dokument-Länge und
// den Auftrag, den er absetzt. Die echten Editor-Instanzen hängen an einem DOM,
// das für diese Frage nichts beiträgt.
function editorDoppel(laenge) {
  const auftraegeDesEditors = [];
  return {
    auftraege: auftraegeDesEditors,
    state: { doc: { length: laenge } },
    dispatch: (tr) => auftraegeDesEditors.push(tr),
  };
}

const OPTS = { muster: 'Notiz', flags: 'gm', ersetzung: 'Merk', regexModus: false };

beforeEach(() => {
  auftraege = [];
  berichte.length = 0;
  gezeichneteTabbars.length = 0;
  antwort = { geaendert: [], fehlgeschlagen: [], veraendert: [] };
  gelesen = {};
  auswahl = [];
  paneEditors[0] = null;
  paneEditors[1] = null;
  state.areaPath = 'C:/Bereich';
  setzeReiter([]);
  window.api.replaceInArea = async (params) => {
    auftraege.push(params);
    return antwort;
  };
  window.api.readFile = async (pfad) => ({ ok: true, content: gelesen[pfad] ?? '' });
  window.api.basename = (p) => String(p).split(/[\\/]/).pop();
});

describe('Schnitt zwischen Puffer und Platte (E5)', () => {
  it('schickt eine ungeaenderte Datei an den Hauptprozess', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', false)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];
    antwort = { geaendert: [{ pfad: DATEI_A, anzahl: 1 }], fehlgeschlagen: [], veraendert: [] };
    gelesen[DATEI_A] = 'Merk eins\n';

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(auftraege).toHaveLength(1);
    expect(auftraege[0].dateien).toEqual([{ pfad: DATEI_A, offsets: [0] }]);
    expect(erg.geaendert).toEqual([{ pfad: DATEI_A, anzahl: 1 }]);
  });

  it('schickt eine geaenderte Datei GAR NICHT an den Hauptprozess', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', true)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];

    await ersetzeAuswahlImBereich(OPTS);

    // Kein Auftrag: Der Hauptprozess wuerde die Datei ohnehin als «offen»
    // abweisen; ihn danach zu fragen waere eine Runde ohne Gegenwert.
    expect(auftraege).toHaveLength(0);
  });

  it('teilt einen gemischten Auftrag auf beide Wege auf', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', true), reiter(DATEI_B, 'Notiz zwei\n', false)]);
    auswahl = [
      { pfad: DATEI_A, offsets: [0] },
      { pfad: DATEI_B, offsets: [0] },
    ];
    antwort = { geaendert: [{ pfad: DATEI_B, anzahl: 1 }], fehlgeschlagen: [], veraendert: [] };
    gelesen[DATEI_B] = 'Merk zwei\n';

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(auftraege[0].dateien).toEqual([{ pfad: DATEI_B, offsets: [0] }]);
    expect(erg.geaendert).toHaveLength(2);
    expect(erg.geaendert.find((g) => g.pfad === DATEI_A).imPuffer).toBe(true);
    expect(erg.geaendert.find((g) => g.pfad === DATEI_B).imPuffer).toBeUndefined();
  });

  it('fragt den Hauptprozess gar nicht, wenn nichts ausgewaehlt ist', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', false)]);
    auswahl = [];

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(erg).toBeNull();
    expect(auftraege).toHaveLength(0);
    expect(berichte).toHaveLength(0);
  });
});

describe('Geaenderter Reiter: Ersetzung auf den Puffer (AK3)', () => {
  it('setzt den neuen Text als EINE Rueckgaengig-Einheit in den aktiven Editor', async () => {
    const inhalt = 'Notiz eins\nzweite Notiz\n';
    setzeReiter([reiter(DATEI_A, inhalt, true)]);
    const editor = editorDoppel(inhalt.length);
    paneEditors[0] = editor;
    auswahl = [{ pfad: DATEI_A, offsets: [0, 18] }];

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(editor.auftraege).toHaveLength(1);
    const tr = editor.auftraege[0];
    // Das ganze Dokument in EINEM Dispatch: Ein Strg+Z nimmt den Lauf als
    // Ganzes zurueck und nicht Stelle fuer Stelle.
    expect(tr.changes).toEqual({ from: 0, to: inhalt.length, insert: 'Merk eins\nzweite Merk\n' });
    // Die Annotation ist die eigene Rueckgaengig-Einheit; ohne sie
    // verschmilzt der Lauf mit der letzten Nutzer-Eingabe.
    expect(tr.annotations).toBeTruthy();
    expect(erg.geaendert).toEqual([{ pfad: DATEI_A, anzahl: 2, imPuffer: true }]);
  });

  it('haelt den Reiter geaendert und erzwingt kein Speichern', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', true)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];

    await ersetzeAuswahlImBereich(OPTS);

    const tab = state.panes[0].tabs[0];
    expect(tab.dirty).toBe(true);
    // Ohne sichtbaren Editor wandert die Ersetzung in den Puffer; der
    // Doc-Aufbau beim Aktivieren nutzt ihn.
    expect(tab.content).toBe('Merk eins\n');
  });

  it('meldet einen Puffer, der seit dem Suchlauf nicht mehr passt', async () => {
    // Der Anwender hat weitergetippt: An der gemerkten Stelle steht kein Fund
    // mehr. Geraten wird nicht.
    setzeReiter([reiter(DATEI_A, 'voran Notiz eins\n', true)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(erg.veraendert).toEqual([DATEI_A]);
    expect(erg.geaendert).toEqual([]);
    expect(state.panes[0].tabs[0].content).toBe('voran Notiz eins\n');
  });
});

describe('Ungeaenderter Reiter: Nachladen des geschriebenen Stands (AK4)', () => {
  it('laedt den neuen Platten-Stand nach und bleibt ungeaendert', async () => {
    setzeReiter([reiter(DATEI_A, 'Notiz eins\n', false)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];
    antwort = { geaendert: [{ pfad: DATEI_A, anzahl: 1 }], fehlgeschlagen: [], veraendert: [] };
    gelesen[DATEI_A] = 'Merk eins\n';

    await ersetzeAuswahlImBereich(OPTS);

    const tab = state.panes[0].tabs[0];
    expect(tab.content).toBe('Merk eins\n');
    expect(tab.originalContent).toBe('Merk eins\n');
    expect(tab.dirty).toBe(false);
  });

  it('laedt einen Reiter nicht nach, dessen Datei gar nicht geschrieben wurde', async () => {
    setzeReiter([reiter(DATEI_B, 'Notiz zwei\n', false)]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];
    antwort = { geaendert: [{ pfad: DATEI_A, anzahl: 1 }], fehlgeschlagen: [], veraendert: [] };
    gelesen[DATEI_B] = 'DARF NICHT ERSCHEINEN';

    await ersetzeAuswahlImBereich(OPTS);

    expect(state.panes[0].tabs[0].content).toBe('Notiz zwei\n');
  });
});

describe('Bericht nach dem Lauf (AK6)', () => {
  it('nennt geaenderte, nicht ersetzte und zwischenzeitlich veraenderte Dateien', async () => {
    setzeReiter([]);
    auswahl = [
      { pfad: DATEI_A, offsets: [0] },
      { pfad: DATEI_B, offsets: [0] },
    ];
    antwort = {
      geaendert: [{ pfad: DATEI_A, anzahl: 3 }],
      fehlgeschlagen: [{ pfad: DATEI_B, grund: 'geteilt' }],
      veraendert: ['C:/Bereich/gamma.md'],
    };

    await ersetzeAuswahlImBereich(OPTS);

    expect(berichte).toHaveLength(1);
    const abschnitte = berichte[0].sections;
    expect(abschnitte).toHaveLength(3);
    expect(abschnitte[0].rows).toEqual([
      { text: 'alpha.md', detail: de['areaReplace.hits'].replace('{n}', '3') },
    ]);
    expect(abschnitte[1].rows[0].text).toBe('beta.md');
    // Der Grund erscheint als Satz und nicht als Kennung — sonst stuende im
    // Bericht des Anwenders «geteilt».
    expect(abschnitte[1].rows[0].detail).toBe(de['areaReplace.reason.geteilt']);
    expect(abschnitte[2].rows).toEqual([{ text: 'gamma.md' }]);
  });

  it('nennt einen Fehlschlag der Bruecke, statt ihn zu verschlucken', async () => {
    setzeReiter([]);
    auswahl = [{ pfad: DATEI_A, offsets: [0] }];
    window.api.replaceInArea = async () => {
      throw new Error('Kanal weg');
    };

    const erg = await ersetzeAuswahlImBereich(OPTS);

    expect(erg.fehlgeschlagen).toHaveLength(1);
    expect(erg.fehlgeschlagen[0].grund).toBe('kanal');
    expect(berichte).toHaveLength(1);
  });
});
