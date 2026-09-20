// 4T-001806 (Epic 3E-000292): Die Haupt-Prozess-Seite des Einlesens einer
// Datei im offenen Format JSON Canvas.
//
// Drei Gegenstaende, alle am ECHTEN Modul und nicht an einer Nachbildung:
//
//   1. Der neue Kanal `canvas:importJsonCanvas` — Oeffnen-Dialog mit
//      Mehrfach-Auswahl und eigenem Dateityp-Eintrag, Anlage des Dokuments
//      neben der Quelle, Namens-Vergabe bei belegtem Namen, Unberuehrtheit von
//      Quelle und bestehendem Dokument, Bereichs-Grenze (AK2, AK3, AK5).
//   2. Die Umrechnung der fremden Ziele in ihren drei Lagen und ihre
//      Containment-Grenze (AK6), dazu die Fehlerfaelle je Datei (AK9, AK10).
//   3. Der gemeinsame Bericht ueber mehrere Dateien mit seinen Abschnitten
//      (AK11).
//
// Die Datei-Faelle laufen ueber eine Wegwerf-Wurzel im Temp-Verzeichnis
// (Muster canvas-austausch-ausgabe.test.js): Der Weg schreibt wirklich, und
// eine Nachbildung des Dateisystems haette genau die Aussage verloren, um die
// es geht — dass neben der Quelle ein Dokument entsteht und keines
// ueberschrieben wird.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerCanvasImportIpc } = require('../../src/main/ipc/canvas-import.js');
const {
  austauschBericht,
  verlustZeilen,
} = require('../../src/shared/canvas/canvas-austausch-bericht.js');
const { VERLUST_POSTEN } = require('../../src/shared/canvas/canvas-austausch.js');

const EREIGNIS = { sender: { id: 1 } };

const wurzeln = [];

function wegwerfWurzel() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-einlesen-'));
  wurzeln.push(w);
  return w;
}

function schreibe(wurzel, rel, inhalt = 'x') {
  const abs = path.join(wurzel, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt, 'utf8');
  return abs;
}

function canvasDatei(wurzel, rel, objekt) {
  return schreibe(wurzel, rel, JSON.stringify(objekt));
}

afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

// Eine kleine Flaeche mit allem, worauf es ankommt: Gruppe, Text-Karte,
// Verweis mit Anker, Bild und eine Verbindung.
function beispiel(datei = 'Notizen/Konzept.md', bild = 'Bilder/Skizze.png') {
  return {
    nodes: [
      { id: 'g1', type: 'group', x: -360, y: -200, width: 700, height: 280, label: 'Vorbereitung' },
      { id: 'k1', type: 'text', x: -320, y: -140, width: 220, height: 120, text: '## Zielbild' },
      {
        id: 'k2',
        type: 'file',
        x: 40,
        y: -140,
        width: 220,
        height: 120,
        file: datei,
        subpath: '#Ziele',
      },
      { id: 'k3', type: 'file', x: -320, y: 160, width: 220, height: 140, file: bild },
    ],
    edges: [
      { id: 'e1', fromNode: 'k1', toNode: 'k2', fromSide: 'right', toSide: 'left', label: 'folgt' },
    ],
  };
}

// --- Der Kanal an einer Attrappe des Dialogs ------------------------------------

let dialogAufrufe;
let meldungen;
let gewaehlt;
let areaRoot;
let kanal;

function baueKanal(grenze = Infinity) {
  const handlers = new Map();
  registerCanvasImportIpc((k, fn) => handlers.set(k, fn), {
    dialog: {
      showOpenDialog: async (_win, optionen) => {
        dialogAufrufe.push(optionen);
        if (gewaehlt === null) return { canceled: true, filePaths: [] };
        return { canceled: false, filePaths: gewaehlt };
      },
      showMessageBox: async (_win, optionen) => {
        meldungen.push(optionen);
        return { response: 0 };
      },
    },
    senderWindow: () => null,
    areaOfWindow: () => (areaRoot ? { rootPath: areaRoot } : null),
    tForWindow: (_win, key) => key,
    MAX_EMBED_BYTES: grenze,
  });
  return handlers.get('canvas:importJsonCanvas');
}

beforeEach(() => {
  dialogAufrufe = [];
  meldungen = [];
  gewaehlt = [];
  areaRoot = null;
  kanal = baueKanal();
});

describe('canvas:importJsonCanvas — Dialog und Anlage (AK2, AK3, AK5)', () => {
  it('waehlt mehrere Dateien und fuehrt einen eigenen Dateityp-Eintrag', async () => {
    const w = wegwerfWurzel();
    gewaehlt = null;
    const antwort = await kanal(EREIGNIS);
    expect(antwort).toEqual({ ok: false, canceled: true });
    expect(dialogAufrufe[0].properties).toEqual(['openFile', 'multiSelections']);
    expect(dialogAufrufe[0].filters[0]).toEqual({
      name: 'dialog.filterJsonCanvas',
      extensions: ['canvas'],
    });
    // Ohne Bereich schlaegt der Dialog keinen Ort vor.
    expect(dialogAufrufe[0].defaultPath).toBeUndefined();
    expect(fs.readdirSync(w)).toEqual([]);
  });

  it('legt neben der Quelle ein Dokument mit ihrem Namen und der Endung .md an', async () => {
    const w = wegwerfWurzel();
    schreibe(w, 'Notizen/Konzept.md', '# Konzept');
    schreibe(w, 'Bilder/Skizze.png');
    const quelle = canvasDatei(w, 'Plan.canvas', beispiel());
    gewaehlt = [quelle];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ok).toBe(true);
    expect(antwort.ergebnisse).toHaveLength(1);
    const ergebnis = antwort.ergebnisse[0];
    expect(ergebnis.name).toBe('Plan.canvas');
    expect(ergebnis.pfad).toBe(path.join(w, 'Plan.md'));
    const text = fs.readFileSync(ergebnis.pfad, 'utf8');
    expect(text.startsWith('# Plan\n\n```perspective-canvas\n')).toBe(true);
    expect(text.endsWith('```\n')).toBe(true);
    expect(text).toContain('!gruppe g1 x=-360 y=-200 b=700 h=280');
    expect(text).toContain('!linie e1 k1 -> k2 von=rechts nach=links');
    // Gemeldet wird, was angekommen ist.
    expect(ergebnis.zahlen).toEqual({ karten: 3, gruppen: 1, verbindungen: 1 });
    // Die gewaehlte Datei bleibt unveraendert liegen.
    expect(JSON.parse(fs.readFileSync(quelle, 'utf8'))).toEqual(beispiel());
  });

  it('haengt bei belegtem Namen eine Zahl an und ueberschreibt nie (AK5, AK22 der Story)', async () => {
    const w = wegwerfWurzel();
    const quelle = canvasDatei(w, 'Plan.canvas', beispiel());
    const bestand = schreibe(w, 'Plan.md', '# Von Hand geschrieben');
    gewaehlt = [quelle];
    const erste = await kanal(EREIGNIS);
    expect(erste.ergebnisse[0].pfad).toBe(path.join(w, 'Plan-2.md'));
    const zweite = await kanal(EREIGNIS);
    expect(zweite.ergebnisse[0].pfad).toBe(path.join(w, 'Plan-3.md'));
    expect(fs.readFileSync(bestand, 'utf8')).toBe('# Von Hand geschrieben');
  });

  it('liest mehrere gewaehlte Dateien und legt je eine an (AK30 der Story)', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [
      canvasDatei(w, 'Eins.canvas', beispiel()),
      canvasDatei(w, 'Zwei.canvas', { nodes: [], edges: [] }),
    ];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse.map((e) => path.basename(e.pfad))).toEqual(['Eins.md', 'Zwei.md']);
    // Eine Datei ohne Knoten und Verbindungen ergibt eine leere Flaeche.
    expect(fs.readFileSync(antwort.ergebnisse[1].pfad, 'utf8')).toBe(
      '# Zwei\n\n```perspective-canvas\n\n```\n',
    );
  });

  it('weist eine Auswahl ausserhalb des Bereichs ab und nennt sie', async () => {
    const w = wegwerfWurzel();
    const bereich = path.join(w, 'Bereich');
    fs.mkdirSync(bereich, { recursive: true });
    areaRoot = bereich;
    const drinnen = canvasDatei(w, 'Bereich/Innen.canvas', beispiel());
    const draussen = canvasDatei(w, 'Aussen.canvas', beispiel());
    gewaehlt = [drinnen, draussen];
    const antwort = await kanal(EREIGNIS);
    expect(dialogAufrufe[0].defaultPath).toBe(bereich);
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0].detail).toBe(draussen);
    expect(antwort.ergebnisse.map((e) => e.name)).toEqual(['Innen.canvas']);
    // Neben der abgewiesenen Datei ist nichts entstanden.
    expect(fs.existsSync(path.join(w, 'Aussen.md'))).toBe(false);
  });
});

describe('Umrechnung der fremden Ziele (AK6)', () => {
  it('schreibt ein bereichs-relativ gefundenes Ziel relativ zum neuen Dokument', async () => {
    const w = wegwerfWurzel();
    areaRoot = w;
    schreibe(w, 'Notizen/Konzept.md', '# Konzept');
    schreibe(w, 'Bilder/Skizze.png');
    gewaehlt = [canvasDatei(w, 'Ordner/Plan.canvas', beispiel())];
    const antwort = await kanal(EREIGNIS);
    const text = fs.readFileSync(antwort.ergebnisse[0].pfad, 'utf8');
    // Das Dokument liegt in «Ordner», die Ziele an der Wurzel: eine Stufe hinauf.
    expect(text).toContain('doc="../Notizen/Konzept.md#Ziele"');
    expect(text).toContain('bild="../Bilder/Skizze.png"');
    expect(antwort.ergebnisse[0].verluste).toEqual([]);
  });

  it('nimmt ohne Bereich den Ordner der gewaehlten Datei als Wurzel', async () => {
    const w = wegwerfWurzel();
    schreibe(w, 'Ordner/Notizen/Konzept.md', '# Konzept');
    schreibe(w, 'Ordner/Bilder/Skizze.png');
    gewaehlt = [canvasDatei(w, 'Ordner/Plan.canvas', beispiel())];
    const antwort = await kanal(EREIGNIS);
    const text = fs.readFileSync(antwort.ergebnisse[0].pfad, 'utf8');
    expect(text).toContain('doc="Notizen/Konzept.md#Ziele"');
    expect(text).toContain('bild="Bilder/Skizze.png"');
  });

  it('schreibt ein nicht gefundenes Ziel mit seinem blossen Namen und zaehlt es', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [canvasDatei(w, 'Plan.canvas', beispiel())];
    const antwort = await kanal(EREIGNIS);
    const text = fs.readFileSync(antwort.ergebnisse[0].pfad, 'utf8');
    expect(text).toContain('doc="Konzept.md#Ziele"');
    expect(text).toContain('bild="Skizze.png"');
    expect(antwort.ergebnisse[0].verluste).toEqual([
      { schluessel: VERLUST_POSTEN.zielNichtAufgeloest, anzahl: 2 },
    ]);
  });

  it('folgt keinem Pfad ueber die Containment-Grenze hinaus', async () => {
    const w = wegwerfWurzel();
    const bereich = path.join(w, 'Bereich');
    fs.mkdirSync(bereich, { recursive: true });
    areaRoot = bereich;
    schreibe(w, 'Geheim.md', '# Geheim');
    gewaehlt = [canvasDatei(w, 'Bereich/Plan.canvas', beispiel('../Geheim.md', 'Bild.png'))];
    const antwort = await kanal(EREIGNIS);
    const text = fs.readFileSync(antwort.ergebnisse[0].pfad, 'utf8');
    // Der bloße Name bleibt; der Pfad hinaus wird nicht geschrieben.
    expect(text).toContain('doc="Geheim.md#Ziele"');
    expect(text).not.toContain('..');
  });
});

describe('Fehlerfaelle je Datei (AK9, AK10)', () => {
  it('meldet eine Datei ohne gueltiges JSON und legt kein Dokument an', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [schreibe(w, 'Kaputt.canvas', '{ das ist kein JSON')];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse[0]).toEqual({ name: 'Kaputt.canvas', fehler: 'keinJson' });
    expect(fs.existsSync(path.join(w, 'Kaputt.md'))).toBe(false);
  });

  it('meldet eine Datei ohne beide Listen und legt kein Dokument an', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [canvasDatei(w, 'Leer.canvas', { version: '1.0' })];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse[0]).toEqual({ name: 'Leer.canvas', fehler: 'keineListen' });
    expect(fs.existsSync(path.join(w, 'Leer.md'))).toBe(false);
  });

  it('meldet eine Datei ueber der Groessen-Grenze, ohne sie zu lesen', async () => {
    const w = wegwerfWurzel();
    kanal = baueKanal(10);
    gewaehlt = [canvasDatei(w, 'Gross.canvas', beispiel())];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse[0]).toEqual({ name: 'Gross.canvas', fehler: 'zuGross' });
    expect(fs.existsSync(path.join(w, 'Gross.md'))).toBe(false);
  });

  it('meldet eine nicht lesbare Datei, ohne den Vorgang abzubrechen', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [path.join(w, 'GibtEsNicht.canvas'), canvasDatei(w, 'Gut.canvas', beispiel())];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse[0].fehler).toBe('unlesbar');
    // Die zweite Datei laeuft trotzdem durch — eine unbrauchbare Datei bricht
    // nur sich selbst ab (Entscheidung F1).
    expect(antwort.ergebnisse[1].pfad).toBe(path.join(w, 'Gut.md'));
  });

  it('ueberspringt einzelne unbrauchbare Knoten und zaehlt sie', async () => {
    const w = wegwerfWurzel();
    gewaehlt = [
      canvasDatei(w, 'Teils.canvas', {
        nodes: [
          { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Gut' },
          { id: 'k2', type: 'text', x: 0, y: 0 },
          { id: 'k3', type: 'unbekannt', x: 0, y: 0, width: 200, height: 100 },
        ],
        edges: [],
      }),
    ];
    const antwort = await kanal(EREIGNIS);
    expect(antwort.ergebnisse[0].zahlen.karten).toBe(1);
    expect(antwort.ergebnisse[0].verluste).toEqual([
      { schluessel: VERLUST_POSTEN.knotenUebersprungen, anzahl: 2 },
    ]);
  });
});

// --- Der gemeinsame Bericht ueber mehrere Dateien (AK11) ------------------------

const tId = (key) => {
  const texte = {
    'canvas.austausch.titel': 'Titel',
    'canvas.austausch.ok': 'OK',
    'canvas.austausch.kopfImport':
      'eingelesen: {karten} Karten, {gruppen} Gruppen, {verbindungen} Verbindungen',
    'canvas.austausch.kopfExport':
      'gesichert: {karten} Karten, {gruppen} Gruppen, {verbindungen} Verbindungen',
    'canvas.austausch.ohneVerlust': 'nichts entfallen',
    'canvas.austausch.dateiKopf': '{datei}:',
  };
  if (texte[key]) return texte[key];
  return `${key}={n}`;
};

describe('Ein gemeinsamer Bericht ueber alle gewaehlten Dateien (AK11)', () => {
  it('gibt je Datei einen Abschnitt und summiert die Zahlen im Kopf', () => {
    const bericht = austauschBericht(
      {
        richtung: 'import',
        dateien: [
          {
            name: 'Eins.canvas',
            zahlen: { karten: 3, gruppen: 1, verbindungen: 1 },
            verluste: [{ schluessel: VERLUST_POSTEN.kartenfarbeEntfallen, anzahl: 2 }],
          },
          { name: 'Zwei.canvas', zahlen: { karten: 1, gruppen: 0, verbindungen: 0 }, verluste: [] },
        ],
      },
      tId,
    );
    expect(bericht.kopf).toBe('eingelesen: 4 Karten, 1 Gruppen, 1 Verbindungen');
    expect(bericht.zeilen).toEqual([
      'Eins.canvas:',
      '  canvas.austausch.verlust.kartenfarbeEntfallen=2',
      'Zwei.canvas:',
      '  nichts entfallen',
    ]);
  });

  it('nennt eine gescheiterte Datei mit ihrem Grund und zaehlt sie nicht mit', () => {
    const bericht = austauschBericht(
      {
        richtung: 'import',
        dateien: [
          { name: 'Kaputt.canvas', fehler: 'keinJson' },
          { name: 'Gut.canvas', zahlen: { karten: 2 }, verluste: [] },
        ],
      },
      tId,
    );
    expect(bericht.kopf).toBe('eingelesen: 2 Karten, 0 Gruppen, 0 Verbindungen');
    expect(bericht.zeilen).toEqual([
      'Kaputt.canvas:',
      '  canvas.austausch.fehler.keinJson={n}',
      'Gut.canvas:',
      '  nichts entfallen',
    ]);
  });

  it('waehlt fuer das nicht aufgeloeste Ziel den Satz der Richtung', () => {
    const posten = [{ schluessel: VERLUST_POSTEN.zielNichtAufgeloest, anzahl: 1 }];
    expect(verlustZeilen(posten, tId, 'export')).toEqual([
      'canvas.austausch.verlust.zielNichtAufgeloest=1',
    ]);
    expect(verlustZeilen(posten, tId, 'import')).toEqual([
      'canvas.austausch.verlust.zielNichtAufgeloestImport=1',
    ]);
    // Ohne Richtung bleibt es beim Satz der Ausgabe — die Form, die der
    // Export-Weg seit 4T-001805 benutzt.
    expect(verlustZeilen(posten, tId)).toEqual(['canvas.austausch.verlust.zielNichtAufgeloest=1']);
  });

  it('laesst die Form der Ausgabe unberuehrt, wenn keine Dateien angegeben sind', () => {
    const bericht = austauschBericht(
      { richtung: 'export', zahlen: { karten: 4, gruppen: 1, verbindungen: 2 } },
      tId,
    );
    expect(bericht.kopf).toBe('gesichert: 4 Karten, 1 Gruppen, 2 Verbindungen');
    expect(bericht.zeilen).toEqual(['nichts entfallen']);
  });
});
