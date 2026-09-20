// @vitest-environment jsdom
// 4T-001805 (Epic 3E-000292): Der Ausgabe-Weg der Canvas-Fläche im Renderer.
//
// Geprüft wird die Naht, die dieser Task einzieht, und nur sie: dass die
// **gewählte** Fläche ausgegeben wird (AK5), dass der Speichern-Dialog den
// Namen des Dokuments mit der Endung `.canvas` und die neue Datei-Art bekommt
// (AK4), dass die Verweis- und Bild-Ziele vor dem Kern über den Hauptprozess zu
// Pfaden werden und ein Anker dabei in das eigene Feld des fremden Formats
// wandert (AK6), dass ein nicht auflösbares Ziel unverändert hinausgeht und im
// Bericht steht (AK7), dass die Meldung erst nach dem Schreiben kommt und der
// Abbruch stumm bleibt (AK10) und dass das Dokument dabei unberührt bleibt
// (AK11).
//
// Die Übersetzung selbst steht nicht hier: Sie liegt im prozessneutralen Kern
// und ist in canvas-austausch.test.js an 66 Fällen abgesichert. Dieser Fall
// benutzt den ECHTEN Kern, damit die Naht gegen das gemessene Verhalten läuft
// und nicht gegen eine Nachbildung davon.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Die Fläche, die der Griff der Canvas-Einbettung liefert. Sie ist gemockt,
// weil die echte Einbettung eine offene Ansicht samt DOM bräuchte — geprüft
// wird hier der Weg, nicht die Reiter-Wahl (die deckt canvas-pane.test.js).
let gewaehlt = null;
vi.mock('../../../src/renderer/modules/canvas/canvas-pane.js', () => ({
  aktiveCanvasFlaeche: () => gewaehlt,
  // Der Mermaid-Render-Weg trägt sich beim Laden mit seinem Teilbaum-Schritt
  // hier ein (render-mermaid.js, Modul-Ende); ohne diesen Namen bricht schon
  // der Import von save-export.js.
  registriereCanvasTeilbaumSchritte: () => {},
}));

const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', async (echt) => {
  const modul = await echt();
  return { ...modul, showStatusbarHint: (schluessel) => hinweise.push(schluessel) };
});

const { exportCurrentCanvasAsJsonCanvas } =
  await import('../../../src/renderer/modules/views/save-export.js');
const { parseCanvasFence } = await import('../../../src/shared/canvas/canvas-core.js');

const FLAECHE = [
  '!gruppe g1 x=-360 y=-200 b=700 h=280 farbe=grün',
  'Vorbereitung',
  '!karte k1 x=-320 y=-140 b=220 h=120',
  '## Zielbild',
  '!karte k2 x=40 y=-140 b=220 h=120 doc="Notizen/Konzept#Ziele"',
  'Konzept nachlesen',
  '!karte k3 x=-320 y=160 b=220 h=140 bild="Bilder/Skizze.png"',
  '!form f1 x=40 y=160 b=200 h=100 art=raute rand=blau',
  'Entscheidung?',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'folgt aus',
].join('\n');

let gespeichert;
let gemeldet;
let aufgeloest;
let speicherAntwort;

function flaecheAus(rumpf, extra = {}) {
  return {
    flaeche: { model: parseCanvasFence(rumpf), rumpf },
    dokumentPfad: 'C:\\Bereich\\Ordner\\Plan.md',
    uebrige: 0,
    ...extra,
  };
}

beforeEach(() => {
  hinweise.length = 0;
  gespeichert = [];
  gemeldet = [];
  aufgeloest = [];
  speicherAntwort = { ok: true, path: 'C:\\Bereich\\Ordner\\Plan.canvas' };
  gewaehlt = flaecheAus(FLAECHE);
  window.api.saveFileAs = async (vorschlag, inhalt, art) => {
    gespeichert.push({ vorschlag, inhalt, art });
    return speicherAntwort;
  };
  window.api.showCanvasExchangeReport = async (bericht) => {
    gemeldet.push(bericht);
    return true;
  };
  window.api.showSaveError = async (detail) => {
    gemeldet.push({ fehler: detail });
    return true;
  };
  window.api.resolveCanvasExchangeTargets = async (basePath, ziele) => {
    aufgeloest.push({ basePath, ziele });
    return {
      ok: true,
      treffer: [
        { pfad: 'Notizen/Konzept.md', datei: 'Notizen/Konzept.md' },
        { pfad: 'Bilder/Skizze.png', datei: 'Bilder/Skizze.png' },
      ],
    };
  };
});

describe('Ausgabe der Fläche als JSON-Canvas-Datei (4T-001805)', () => {
  it('schlägt den Namen des Dokuments mit der Endung .canvas vor (AK4)', async () => {
    expect(await exportCurrentCanvasAsJsonCanvas()).toBe(true);
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].vorschlag).toBe('C:\\Bereich\\Ordner\\Plan.canvas');
    expect(gespeichert[0].art).toBe('jsonCanvas');
  });

  it('schreibt die gewählte Fläche mit Tabulator eingerückt', async () => {
    await exportCurrentCanvasAsJsonCanvas();
    const text = gespeichert[0].inhalt;
    expect(text.startsWith('{\n\t"nodes": [')).toBe(true);
    const objekt = JSON.parse(text);
    expect(Object.keys(objekt)).toEqual(['nodes', 'edges']);
    expect(objekt.edges).toHaveLength(1);
    // Lage, Größe und Reihenfolge gehen unverändert über (Festlegung des Epics).
    expect(objekt.nodes[0]).toMatchObject({ id: 'g1', type: 'group', x: -360, y: -200 });
  });

  it('löst Verweis- und Bild-Ziele über den Hauptprozess auf und hält den Anker (AK6)', async () => {
    await exportCurrentCanvasAsJsonCanvas();
    expect(aufgeloest).toHaveLength(1);
    expect(aufgeloest[0].basePath).toBe('C:\\Bereich\\Ordner\\Plan.md');
    // Das Dokument-Ziel geht in seiner Abruf-Fassung hinaus (Endung angehängt),
    // das Bild-Ziel unverändert; der Anker gehört nicht in den Pfad.
    expect(aufgeloest[0].ziele).toEqual([
      { pfad: 'Notizen/Konzept.md', art: 'doc' },
      { pfad: 'Bilder/Skizze.png', art: 'bild' },
    ]);
    const objekt = JSON.parse(gespeichert[0].inhalt);
    const verweis = objekt.nodes.find((k) => k.id === 'k2');
    expect(verweis).toMatchObject({
      type: 'file',
      file: 'Notizen/Konzept.md',
      subpath: '#Ziele',
    });
    expect(objekt.nodes.find((k) => k.id === 'k3')).toMatchObject({
      type: 'file',
      file: 'Bilder/Skizze.png',
    });
  });

  it('übernimmt ein nicht auflösbares Ziel unverändert und nennt es im Bericht (AK7)', async () => {
    window.api.resolveCanvasExchangeTargets = async () => ({ ok: true, treffer: [] });
    await exportCurrentCanvasAsJsonCanvas();
    const objekt = JSON.parse(gespeichert[0].inhalt);
    expect(objekt.nodes.find((k) => k.id === 'k2')).toMatchObject({
      file: 'Notizen/Konzept',
      subpath: '#Ziele',
    });
    const posten = gemeldet[0].verluste.find((p) => p.schluessel === 'zielNichtAufgeloest');
    expect(posten.anzahl).toBe(2);
  });

  it('kommt ohne Dokument-Pfad ohne Auflösungs-Anfrage aus', async () => {
    gewaehlt = flaecheAus(FLAECHE, { dokumentPfad: null });
    await exportCurrentCanvasAsJsonCanvas();
    expect(aufgeloest).toEqual([]);
    expect(gespeichert[0].vorschlag).toBeNull();
  });

  it('meldet Zahlen, Verlust-Posten und die Zahl der übrigen Flächen (AK5, AK10)', async () => {
    gewaehlt = flaecheAus(FLAECHE, { uebrige: 2 });
    await exportCurrentCanvasAsJsonCanvas();
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0].richtung).toBe('export');
    expect(gemeldet[0].uebrigeFlaechen).toBe(2);
    // Zwei Text-Knoten (Karte und ersetzte Form) plus zwei Datei-Knoten; die
    // Gruppen sind die eigene und der Rahmen um die beschriftete Verweis-Karte.
    expect(gemeldet[0].zahlen).toEqual({ karten: 4, gruppen: 2, verbindungen: 1 });
    const schluessel = gemeldet[0].verluste.map((p) => p.schluessel);
    expect(schluessel).toContain('formAlsTextkarte');
    expect(schluessel).toContain('beschriftungAlsRahmen');
  });

  it('lässt das Dokument in der Anwendung unberührt (AK11)', async () => {
    const vorher = gewaehlt.flaeche.rumpf;
    const modellVorher = JSON.stringify(gewaehlt.flaeche.model);
    await exportCurrentCanvasAsJsonCanvas();
    expect(gewaehlt.flaeche.rumpf).toBe(vorher);
    expect(JSON.stringify(gewaehlt.flaeche.model)).toBe(modellVorher);
  });

  it('bleibt beim Abbruch im Speichern-Dialog stumm (AK10)', async () => {
    speicherAntwort = { ok: false, canceled: true };
    expect(await exportCurrentCanvasAsJsonCanvas()).toBe(false);
    expect(gemeldet).toEqual([]);
  });

  it('meldet einen Schreibfehler über den Fehler-Weg des Bestands', async () => {
    speicherAntwort = { ok: false, error: 'Platte voll' };
    expect(await exportCurrentCanvasAsJsonCanvas()).toBe(false);
    expect(gemeldet).toEqual([{ fehler: 'Platte voll' }]);
  });

  it('sagt es, wenn die Canvas-Ansicht keine Fläche zeigt', async () => {
    gewaehlt = null;
    expect(await exportCurrentCanvasAsJsonCanvas()).toBe(false);
    expect(hinweise).toEqual(['canvas.austausch.keineFlaeche']);
    expect(gespeichert).toEqual([]);
  });

  it('gibt aus, was der Auflöser nicht beantwortet, statt abzubrechen', async () => {
    window.api.resolveCanvasExchangeTargets = async () => {
      throw new Error('Kanal weg');
    };
    expect(await exportCurrentCanvasAsJsonCanvas()).toBe(true);
    expect(JSON.parse(gespeichert[0].inhalt).nodes.find((k) => k.id === 'k3').file).toBe(
      'Bilder/Skizze.png',
    );
  });
});

describe('Verdrahtung des Befehls (AK1, AK2, AK3)', () => {
  it('steht in der Registry mit Beschriftung, Beschreibung und Bedingung', () => {
    const cmd = COMMANDS.find((c) => c.id === 'file.exportJsonCanvas');
    expect(cmd).toBeTruthy();
    expect(cmd.labelKey).toBe('menu.file.exportJsonCanvas');
    expect(cmd.descKey).toBe('help.shortcut.exportJsonCanvas');
    expect(cmd.categoryKey).toBe('help.group.file');
    expect(cmd.menu).toBe(true);
    // Ohne Vorgabe-Kürzel wie der portable Export daneben.
    expect(cmd.defaultBindings).toEqual([]);
    // Wählbar nur in der OFFENEN Canvas-Ansicht (Freigabe des Product Owners
    // vom 2026-09-19 zu F2); die Bedingung selbst prüft
    // command-availability.test.js an allen vier Voraussetzungen.
    expect(cmd.availability).toBe('canvasFlaecheOffen');
  });

  it('hängt an der Erweiterung der Fläche (AK2)', () => {
    expect(extensionById('canvas').commands).toContain('file.exportJsonCanvas');
  });

  it('Menü-Kanal, Brücke und Dispatcher rufen denselben Weg', () => {
    const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
    expect(lies('src/main/menu/menu.js')).toContain("click: send('menu:exportJsonCanvas')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:exportJsonCanvas'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuExportJsonCanvas(() => exportCurrentCanvasAsJsonCanvas())',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'file.exportJsonCanvas': () => {",
    );
  });
});

// --- Der Griff auf die gewählte Fläche (AK5) ------------------------------------
//
// Er ist oben mit Absicht ersetzt; hier läuft er ECHT, weil sonst niemand
// prüfte, dass die Ausgabe wirklich der Reiter-Wahl folgt. Geladen wird das
// Modul an der Attrappe vorbei (`importActual`).
describe('aktiveCanvasFlaeche: die Fläche des gewählten Reiters (AK5)', () => {
  const ZWEI_FLAECHEN = [
    '```perspective-canvas',
    '!karte k1 x=0 y=0 b=200 h=100',
    'Erste',
    '```',
    '',
    '```perspective-canvas',
    '!karte k2 x=9 y=9 b=200 h=100',
    'Zweite',
    '```',
  ].join('\n');

  async function echteEinbettung(tab) {
    const modul = await vi.importActual('../../../src/renderer/modules/canvas/canvas-pane.js');
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    modul.initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      schreibeDokument: () => true,
    });
    modul.renderCanvas(0);
    return { modul, canvasEl };
  }

  it('liefert in der offenen Ansicht die gezeigte Fläche und zählt die übrigen', async () => {
    const tab = { viewMode: 'canvas', content: ZWEI_FLAECHEN, path: 'C:\\B\\Plan.md' };
    const { modul } = await echteEinbettung(tab);
    const stand = modul.aktiveCanvasFlaeche(0);
    expect(stand.flaeche.model.elemente[0].id).toBe('k1');
    expect(stand.uebrige).toBe(1);
    expect(stand.dokumentPfad).toBe('C:\\B\\Plan.md');
    modul.destroyCanvas(0);
  });

  it('meldet nichts, solange die Ansicht nicht offen ist — kein Rückfall auf die erste', async () => {
    // Freigegebene Regel des Product Owners vom 2026-09-19: «nur in der
    // Canvas-Ansicht wählbar und sonst ausgegraut». Ein Rückfall gäbe eine
    // Fläche aus, die der Anwender gar nicht vor sich hat.
    const tab = { viewMode: 'canvas', content: ZWEI_FLAECHEN, path: 'C:\\B\\Plan.md' };
    const { modul } = await echteEinbettung(tab);
    tab.viewMode = 'rendered';
    expect(modul.aktiveCanvasFlaeche(0)).toBeNull();
    modul.destroyCanvas(0);
  });

  it('folgt dem gewählten Reiter der offenen Ansicht', async () => {
    const tab = { viewMode: 'canvas', content: ZWEI_FLAECHEN, path: 'C:\\B\\Plan.md' };
    const { modul, canvasEl } = await echteEinbettung(tab);
    const reiter = canvasEl.querySelectorAll('[role="tab"]');
    expect(reiter).toHaveLength(2);
    reiter[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(modul.aktiveCanvasFlaeche(0).flaeche.model.elemente[0].id).toBe('k2');
    modul.destroyCanvas(0);
  });

  it('meldet nichts, wenn das Dokument keine Fläche trägt', async () => {
    const tab = { viewMode: 'canvas', content: '# Ohne Fläche', path: 'C:\\B\\Plan.md' };
    const { modul } = await echteEinbettung(tab);
    expect(modul.aktiveCanvasFlaeche(0)).toBeNull();
    modul.destroyCanvas(0);
  });
});
