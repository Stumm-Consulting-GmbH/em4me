// 4T-001805 (Epic 3E-000292): Die Haupt-Prozess-Seite der Ausgabe einer
// Canvas-Flaeche im offenen Format JSON Canvas.
//
// Drei Gegenstaende, alle drei am ECHTEN Modul und nicht an einer Nachbildung:
//
//   1. Der neue Kanal, der die Ziele einer Flaeche zu Pfaden aufloest — mit
//      Bereich, ohne Bereich, nicht aufloesbar und gegen die Containment-Grenze
//      (AK6, AK7, AK8 des Tasks).
//   2. Der Speichern-Kanal mit seiner neuen Datei-Art: Filter-Eintrag,
//      Vorschlags-Endung und die beiden Eigenschaften, die ein
//      Austausch-Erzeugnis von einem Dokument unterscheiden — keine
//      Begleitdatei der Historie und kein Eintrag in «Zuletzt geoeffnet»
//      (AK4, AK9).
//   3. Die Saetze der Ergebnis-Meldung aus den gezaehlten Posten des Kerns
//      (AK10).
//
// Die Datei-Faelle laufen ueber eine Wegwerf-Wurzel im Temp-Verzeichnis
// (Muster datei-groessen.test.js): Der Aufloeser fragt das Dateisystem, und
// eine Nachbildung davon haette genau die Aussage verloren, um die es geht.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerEmbedsIpc } = require('../../src/main/ipc/embeds.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');
const {
  austauschBericht,
  verlustZeilen,
} = require('../../src/shared/canvas/canvas-austausch-bericht.js');
const { VERLUST_POSTEN } = require('../../src/shared/canvas/canvas-austausch.js');

// Ein Ereignis, wie es der Registrier-Weg des Hauptprozesses liefert: Die dritte
// Stufe des Auflösers nennt den Absender, wenn sie den Bereichs-Index anfordert.
const EREIGNIS = { sender: { id: 1 } };

const wurzeln = [];

function wegwerfWurzel() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-austausch-'));
  wurzeln.push(w);
  return w;
}

function schreibe(wurzel, rel, inhalt = 'x') {
  const abs = path.join(wurzel, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt, 'utf8');
  return abs;
}

afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

// --- 1. Der Kanal, der die Ziele aufloest --------------------------------------

function zielKanal(areaRoot) {
  const handlers = new Map();
  registerEmbedsIpc((kanal, fn) => handlers.set(kanal, fn), {
    areaRootForEvent: () => areaRoot,
    // Die Namens-Suche des Bereichs-Index ist die dritte Stufe des Auflösers.
    // Sie bleibt hier leer: Geprueft wird die Umrechnung auf den Bereichs-Bezug,
    // nicht der Index, der in seinen eigenen Pruefdateien steht.
    backlinks: {
      ensureIndexForDemand: () => {},
      resolveWikiTargetInIndex: () => null,
      bufferTextFor: () => null,
    },
    subpages: {
      isRelativeTarget: () => false,
      expandRelativeTarget: () => null,
      toFileBasename: (s) => s,
    },
    embedInhalt: { liesEmbedInhalt: async () => ({ ok: false }) },
    MAX_EMBED_BYTES: 1024,
  });
  return handlers.get('canvas:loeseAustauschZiele');
}

describe('canvas:loeseAustauschZiele — Ziele als Pfade (AK6, AK7, AK8)', () => {
  it('schreibt ein gefundenes Ziel relativ zur Bereichs-Wurzel, mit Schraegstrichen', async () => {
    const w = wegwerfWurzel();
    schreibe(w, 'Notizen/Konzept.md', '# Konzept');
    schreibe(w, 'Bilder/Skizze.png');
    const dokument = schreibe(w, 'Ordner/Flaeche.md', '# Flaeche');
    const kanal = zielKanal(w);
    const antwort = await kanal(EREIGNIS, {
      basePath: dokument,
      ziele: [
        { pfad: '../Notizen/Konzept.md', art: 'doc' },
        { pfad: '../Bilder/Skizze.png', art: 'bild' },
      ],
    });
    expect(antwort.ok).toBe(true);
    expect(antwort.treffer).toEqual([
      { pfad: '../Notizen/Konzept.md', datei: 'Notizen/Konzept.md' },
      { pfad: '../Bilder/Skizze.png', datei: 'Bilder/Skizze.png' },
    ]);
  });

  it('nimmt ohne Bereich den Ordner des Dokuments als Bezug (AK8)', async () => {
    const w = wegwerfWurzel();
    schreibe(w, 'Ordner/Unter/Ziel.md', '# Ziel');
    const dokument = schreibe(w, 'Ordner/Flaeche.md', '# Flaeche');
    const kanal = zielKanal(null);
    const antwort = await kanal(EREIGNIS, {
      basePath: dokument,
      ziele: [{ pfad: 'Unter/Ziel.md' }],
    });
    expect(antwort.treffer).toEqual([{ pfad: 'Unter/Ziel.md', datei: 'Unter/Ziel.md' }]);
  });

  it('laesst ein nicht auffindbares Ziel aus der Liste (AK7)', async () => {
    const w = wegwerfWurzel();
    const dokument = schreibe(w, 'Flaeche.md', '# Flaeche');
    const kanal = zielKanal(w);
    const antwort = await kanal(EREIGNIS, { basePath: dokument, ziele: [{ pfad: 'Fehlt.md' }] });
    expect(antwort.ok).toBe(true);
    expect(antwort.treffer).toEqual([]);
  });

  it('gibt nichts heraus, was ausserhalb der Containment-Grenze liegt', async () => {
    const w = wegwerfWurzel();
    const bereich = path.join(w, 'Bereich');
    fs.mkdirSync(bereich, { recursive: true });
    schreibe(w, 'Geheim.md', '# Geheim');
    const dokument = schreibe(w, 'Bereich/Flaeche.md', '# Flaeche');
    const kanal = zielKanal(bereich);
    const antwort = await kanal(EREIGNIS, {
      basePath: dokument,
      ziele: [{ pfad: '../Geheim.md' }],
    });
    expect(antwort.treffer).toEqual([]);
  });

  it('weist eine Anfrage ohne Dokument-Pfad ab und ueberspringt leere Ziele', async () => {
    const w = wegwerfWurzel();
    const dokument = schreibe(w, 'Flaeche.md', '# Flaeche');
    const kanal = zielKanal(w);
    expect((await kanal(EREIGNIS, { ziele: [] })).ok).toBe(false);
    const antwort = await kanal(EREIGNIS, { basePath: dokument, ziele: [{ pfad: '' }, {}] });
    expect(antwort).toEqual({ ok: true, treffer: [] });
  });

  it('antwortet nie mit einem absoluten Pfad', async () => {
    const w = wegwerfWurzel();
    schreibe(w, 'Ziel.md', '# Ziel');
    const dokument = schreibe(w, 'Flaeche.md', '# Flaeche');
    const kanal = zielKanal(w);
    const antwort = await kanal(EREIGNIS, { basePath: dokument, ziele: [{ pfad: 'Ziel.md' }] });
    for (const treffer of antwort.treffer) {
      expect(path.isAbsolute(treffer.datei)).toBe(false);
      expect(treffer.datei).not.toContain(w);
    }
  });
});

// --- 2. Der Speichern-Kanal mit der neuen Datei-Art -----------------------------

describe('file:saveAs — die Datei-Art JSON Canvas (AK4, AK9)', () => {
  let dialogAufrufe;
  let zuletzt;
  let historie;
  let kanal;

  beforeEach(() => {
    dialogAufrufe = [];
    zuletzt = [];
    historie = [];
    const handlers = new Map();
    registerFilesIpc((k, fn) => handlers.set(k, fn), {
      dialog: {
        showSaveDialog: async (_win, optionen) => {
          dialogAufrufe.push(optionen);
          // Ein Vorschlag ohne absoluten Pfad wird nur GEMESSEN, nicht
          // geschrieben: Sonst legte der Prueffall eine Datei im Arbeitsbaum an.
          if (!path.isAbsolute(optionen.defaultPath)) return { canceled: true };
          return { canceled: false, filePath: optionen.defaultPath };
        },
        showMessageBox: async () => ({ response: 0 }),
      },
      senderWindow: () => null,
      areaOfWindow: () => null,
      tForWindow: (_win, key) => key,
      isMddPath: () => false,
      isMarkdownPath: () => true,
      watchFile: () => {},
      unwatchFile: () => {},
      resolveHistoryFor: async () => ({ effective: true }),
      recordMddExternalOnOpen: async () => {},
      readPreviousTextFor: async () => null,
      recordMddOnSave: async (_win, abs) => historie.push(abs),
      saveGuard: {},
      pushRecent: (p) => zuletzt.push(p),
      readAreaLinks: async () => [],
    });
    kanal = handlers.get('file:saveAs');
  });

  it('fuehrt einen eigenen Dateityp-Eintrag und schlaegt die Endung .canvas vor', async () => {
    const w = wegwerfWurzel();
    const ziel = path.join(w, 'Flaeche.canvas');
    const ergebnis = await kanal(EREIGNIS, ziel, '{"nodes":[],"edges":[]}', 'jsonCanvas');
    expect(ergebnis.ok).toBe(true);
    expect(dialogAufrufe[0].filters[0]).toEqual({
      name: 'dialog.filterJsonCanvas',
      extensions: ['canvas'],
    });
    // Ohne Vorschlag baut der Kanal den Namen selbst — mit der Endung der Art.
    await kanal(EREIGNIS, null, '{}', 'jsonCanvas');
    expect(dialogAufrufe[1].defaultPath).toBe('save.untitled.canvas');
  });

  it('schreibt die Datei in UTF-8 ohne Vorspann, mit Tabulator eingerueckt (AK9)', async () => {
    const w = wegwerfWurzel();
    const ziel = path.join(w, 'Flaeche.canvas');
    const inhalt = '{\n\t"nodes": [],\n\t"edges": []\n}';
    await kanal(EREIGNIS, ziel, inhalt, 'jsonCanvas');
    const bytes = fs.readFileSync(ziel);
    expect(bytes[0]).not.toBe(0xef);
    expect(bytes.toString('utf8')).toBe(inhalt);
  });

  it('legt fuer das Austausch-Erzeugnis weder Historie noch Zuletzt-Eintrag an', async () => {
    const w = wegwerfWurzel();
    await kanal(EREIGNIS, path.join(w, 'Flaeche.canvas'), '{}', 'jsonCanvas');
    expect(historie).toEqual([]);
    expect(zuletzt).toEqual([]);
  });

  it('laesst den Markdown-Weg unveraendert (AK12)', async () => {
    const w = wegwerfWurzel();
    const ziel = path.join(w, 'Text.md');
    await kanal(EREIGNIS, ziel, '# Text');
    expect(dialogAufrufe[0].filters[0]).toEqual({
      name: 'dialog.filterMarkdown',
      extensions: ['md', 'markdown', 'mdown', 'mkd'],
    });
    expect(historie).toEqual([path.resolve(ziel)]);
    expect(zuletzt).toEqual([path.resolve(ziel)]);
  });

  it('faellt bei unbekannter Art auf Markdown zurueck', async () => {
    const w = wegwerfWurzel();
    await kanal(EREIGNIS, path.join(w, 'Text.md'), '# Text', 'gibtEsNicht');
    expect(dialogAufrufe[0].filters[0].name).toBe('dialog.filterMarkdown');
  });
});

// --- 3. Die Saetze der Ergebnis-Meldung -----------------------------------------

const tId = (key) => {
  const texte = {
    'canvas.austausch.titel': 'Titel',
    'canvas.austausch.ok': 'OK',
    'canvas.austausch.kopfExport':
      'gesichert: {karten} Karten, {gruppen} Gruppen, {verbindungen} Verbindungen',
    'canvas.austausch.kopfImport':
      'eingelesen: {karten} Karten, {gruppen} Gruppen, {verbindungen} Verbindungen',
    'canvas.austausch.ohneVerlust': 'nichts entfallen',
    'canvas.austausch.uebrigeFlaechen': 'weitere Flaechen: {n}',
  };
  if (texte[key]) return texte[key];
  return `${key}={n}`;
};

describe('Ergebnis-Meldung aus den gezaehlten Posten (AK10)', () => {
  it('bildet je Posten eine Zeile mit seiner Anzahl, in der Folge des Katalogs', () => {
    const zeilen = verlustZeilen(
      [
        { schluessel: VERLUST_POSTEN.knotenUebersprungen, anzahl: 2 },
        { schluessel: VERLUST_POSTEN.formAlsTextkarte, anzahl: 3 },
      ],
      tId,
    );
    // Die Form steht im Katalog vor dem uebersprungenen Knoten — die Reihenfolge
    // ist die des Katalogs und nicht die der Eingabe.
    expect(zeilen).toEqual([
      'canvas.austausch.verlust.formAlsTextkarte=3',
      'canvas.austausch.verlust.knotenUebersprungen=2',
    ]);
  });

  it('nennt keinen Posten ohne Anzahl und keinen unbekannten Schluessel', () => {
    expect(
      verlustZeilen(
        [
          { schluessel: VERLUST_POSTEN.formAlsTextkarte, anzahl: 0 },
          { schluessel: 'gibtEsNicht', anzahl: 5 },
          null,
        ],
        tId,
      ),
    ).toEqual([]);
  });

  // 4T-001541: Die Zusage ist «jeder Posten hat seinen eigenen Satz», nicht
  // «es gibt dreizehn Posten». Die Zahl stand dreimal im Fall und war die
  // Größe des Verzeichnisses VERLUST_POSTEN, das mit jedem neuen Konstrukt
  // planmäßig wächst; sie wäre beim nächsten Zuwachs rot geworden, ohne dass
  // etwas kaputt gewesen wäre. Gerechnet wird jetzt aus dem Verzeichnis selbst.
  it('jeder Posten hat seinen eigenen Satz', () => {
    const schluessel = Object.keys(VERLUST_POSTEN);
    // Gegenprobe, dass das Verzeichnis überhaupt Posten führt: Ein leeres
    // ergäbe drei Nullen und der Fall bliebe grün.
    expect(schluessel.length).toBeGreaterThan(5);
    const zeilen = verlustZeilen(
      schluessel.map((s) => ({ schluessel: s, anzahl: 1 })),
      tId,
    );
    expect(zeilen).toHaveLength(schluessel.length);
    expect(new Set(zeilen).size).toBe(schluessel.length);
  });

  it('nennt die Zahl der uebrigen Flaechen, wenn es welche gibt (AK5)', () => {
    const bericht = austauschBericht(
      {
        richtung: 'export',
        zahlen: { karten: 4, gruppen: 1, verbindungen: 2 },
        uebrigeFlaechen: 2,
      },
      tId,
    );
    expect(bericht.kopf).toBe('gesichert: 4 Karten, 1 Gruppen, 2 Verbindungen');
    expect(bericht.zeilen).toEqual(['weitere Flaechen: 2']);
    expect(bericht.titel).toBe('Titel');
    expect(bericht.ok).toBe('OK');
  });

  it('sagt ausdruecklich, wenn nichts entfallen ist', () => {
    const bericht = austauschBericht({ richtung: 'export', zahlen: {} }, tId);
    expect(bericht.kopf).toBe('gesichert: 0 Karten, 0 Gruppen, 0 Verbindungen');
    expect(bericht.zeilen).toEqual(['nichts entfallen']);
  });

  it('kennt beide Richtungen mit demselben Posten-Katalog', () => {
    const bericht = austauschBericht(
      {
        richtung: 'import',
        zahlen: { karten: 1 },
        verluste: [{ schluessel: VERLUST_POSTEN.kartenfarbeEntfallen, anzahl: 1 }],
      },
      tId,
    );
    expect(bericht.kopf).toBe('eingelesen: 1 Karten, 0 Gruppen, 0 Verbindungen');
    expect(bericht.zeilen).toEqual(['canvas.austausch.verlust.kartenfarbeEntfallen=1']);
  });
});

describe('canvas:austauschBericht — der Meldungs-Kanal (AK10)', () => {
  it('zeigt Kopf und Zeilen im Meldungs-Dialog des Fensters', async () => {
    const gezeigt = [];
    const handlers = new Map();
    registerDialogsIpc((k, fn) => handlers.set(k, fn), {
      app: { getPath: () => 'C:\\Home' },
      dialog: {
        showMessageBox: async (_win, optionen) => {
          gezeigt.push(optionen);
          return { response: 0 };
        },
      },
      shell: {},
      session: {},
      senderWindow: () => null,
      tForWindow: (_win, key) => tId(key),
      getStore: () => ({ get: () => undefined }),
    });
    await handlers.get('canvas:austauschBericht')(EREIGNIS, {
      richtung: 'export',
      zahlen: { karten: 2, gruppen: 0, verbindungen: 1 },
      uebrigeFlaechen: 0,
      verluste: [{ schluessel: VERLUST_POSTEN.formAlsTextkarte, anzahl: 1 }],
    });
    expect(gezeigt).toHaveLength(1);
    expect(gezeigt[0].type).toBe('info');
    expect(gezeigt[0].title).toBe('Titel');
    expect(gezeigt[0].message).toBe('gesichert: 2 Karten, 0 Gruppen, 1 Verbindungen');
    expect(gezeigt[0].detail).toBe('canvas.austausch.verlust.formAlsTextkarte=1');
  });
});
