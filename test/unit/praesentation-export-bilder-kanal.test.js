// 4T-002295 (Epic 3E-000349): Die Kanäle des Bilder-Exports des Foliensatzes
// — `presentationImages:chooseFolder` und `presentationImages:export`
// (Story 4S-001085, AK2 und AK3).
//
// Gemessen am echten Handler aus `src/main/ipc/presentation-export-bilder.js`
// (Muster praesentation-export-pptx-kanal.test.js): Das Render-Fenster der
// Bilder ist eine Attrappe, geschrieben wird in ein Wegwerf-Verzeichnis über
// den echten Schreibweg. Die Registrierung in main.js ist im Unit-Kontext nicht
// ladbar (Electron) und wird gegen den QUELLTEXT geprüft.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  registerPresentationBilderIpc,
  pruefeAuftrag,
  zielOrdnerBilder,
  fehlerAngabe,
  bildName,
  BILD_NAME,
  BILDER_GRUENDE,
} = require('../../src/main/ipc/presentation-export-bilder.js');
const { FOLIE_MAX_ZEICHEN } = require('../../src/main/praesentation-fenster.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DE = JSON.parse(fs.readFileSync(path.join(WURZEL, 'src/i18n/de.json'), 'utf8'));
const wurzeln = [];
function wegwerf() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'folien-bilder-'));
  wurzeln.push(w);
  return w;
}
afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

function png(nr) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`Bild ${nr}`),
  ]);
}

function fenster() {
  const w = new EventEmitter();
  w.zerstoert = false;
  w.isDestroyed = () => w.zerstoert;
  return w;
}

function folie() {
  return { html: '<!doctype html><p>Folie</p>', breite: 1280, hoehe: 720 };
}

function kanal({ absender = fenster(), bilder, dialogAntwort } = {}) {
  const handler = new Map();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const erzeuger = {
    erzeugeFolienBilder: vi.fn(bilder || (async ({ folien }) => folien.map((_f, i) => png(i + 1)))),
  };
  const dialog = {
    showOpenDialog: vi.fn(async () => dialogAntwort || { canceled: true, filePaths: [] }),
  };
  registerPresentationBilderIpc((name, fn) => handler.set(name, fn), {
    app: { getPath: () => 'C:\\Home' },
    dialog,
    senderWindow: () => absender,
    tForWindow: (_w, key) => (key in DE ? DE[key] : `T:${key}`),
    getFolienBilder: () => erzeuger,
    logger,
  });
  const exportiere = (auftrag) => handler.get('presentationImages:export')({}, auftrag);
  const waehle = (params) => handler.get('presentationImages:chooseFolder')({}, params);
  return { exportiere, waehle, erzeuger, absender, logger, dialog };
}

function auftrag(ordner, ueber = {}) {
  return {
    zielOrdner: ordner,
    unterordner: 'Vortrag-Folien',
    folien: [folie(), folie(), folie()],
    ...ueber,
  };
}

const dateien = (ordner) => fs.readdirSync(ordner).sort();

describe('presentationImages:export — Bilder und Dateien (AK3)', () => {
  it('erzeugt je Folie ein Bild und schreibt folie-001.png bis folie-003.png', async () => {
    const ordner = wegwerf();
    const { exportiere, erzeuger } = kanal();
    const antwort = await exportiere(auftrag(ordner));
    expect(antwort).toEqual({ ok: true, ordner, bilder: 3 });
    expect(dateien(ordner)).toEqual(['folie-001.png', 'folie-002.png', 'folie-003.png']);
    expect(fs.readFileSync(path.join(ordner, 'folie-002.png'))).toEqual(png(2));
    // Das Render-Fenster bekommt genau die Dokumente und ein Abbruch-Signal.
    const [angaben] = erzeuger.erzeugeFolienBilder.mock.calls[0];
    expect(angaben.folien).toEqual([folie(), folie(), folie()]);
    expect(angaben.abbruch).toBeInstanceOf(AbortSignal);
  });

  it('Dateinamen: drei Stellen, ab 1000 Folien natürlich breiter, alle im Muster', () => {
    expect(bildName(0)).toBe('folie-001.png');
    expect(bildName(41)).toBe('folie-042.png');
    expect(bildName(998)).toBe('folie-999.png');
    expect(bildName(999)).toBe('folie-1000.png');
    for (const i of [0, 9, 99, 999, 1999]) expect(BILD_NAME.test(bildName(i)), i).toBe(true);
    expect(BILD_NAME.test('folie-01.png')).toBe(false);
    expect(BILD_NAME.test('folie-001.html')).toBe(false);
  });

  it('ein Fehler des Render-Fensters kommt mit Folie und Grund zurück, ohne Datei und Ordner', async () => {
    const ordner = path.join(wegwerf(), 'neu');
    const { exportiere } = kanal({
      bilder: async () => {
        const fehler = new Error('Folie 2: zeitbudget');
        fehler.grund = 'zeitbudget';
        fehler.folie = 2;
        throw fehler;
      },
    });
    const antwort = await exportiere(auftrag(ordner));
    expect(antwort).toEqual({ ok: false, fehler: { folie: 2, grund: 'zeitbudget' } });
    expect(JSON.stringify(antwort)).not.toContain('Error');
    expect(fs.existsSync(ordner)).toBe(false);
  });

  it('Schließen des Absender-Fensters bricht den Auftrag ab', async () => {
    const ordner = wegwerf();
    const absender = fenster();
    const { exportiere } = kanal({
      absender,
      bilder: ({ abbruch }) =>
        new Promise((_ok, nein) => {
          abbruch.addEventListener('abort', () => {
            const fehler = new Error('Folie 1: abbruch');
            fehler.grund = 'abbruch';
            fehler.folie = 1;
            nein(fehler);
          });
        }),
    });
    const lauf = exportiere(auftrag(ordner));
    await Promise.resolve();
    absender.zerstoert = true;
    absender.emit('closed');
    expect(await lauf).toEqual({ ok: false, fehler: { folie: 1, grund: 'abbruch' } });
    expect(absender.listenerCount('closed')).toBe(0);
    expect(dateien(ordner)).toEqual([]);
  });

  it('Abbruch-Signal ohne Fehler des Render-Fensters: trotzdem kein Schreiben', async () => {
    const ordner = wegwerf();
    const absender = fenster();
    const { exportiere } = kanal({
      absender,
      bilder: async ({ folien }) => {
        absender.emit('closed');
        return folien.map((_f, i) => png(i + 1));
      },
    });
    expect(await exportiere(auftrag(ordner))).toEqual({
      ok: false,
      fehler: { folie: null, grund: 'abbruch' },
    });
    expect(dateien(ordner)).toEqual([]);
  });

  it('der Zuhörer am Absender wird auch nach Erfolg gelöst', async () => {
    const absender = fenster();
    const { exportiere } = kanal({ absender });
    expect((await exportiere(auftrag(wegwerf()))).ok).toBe(true);
    expect(absender.listenerCount('closed')).toBe(0);
  });

  it('Absender schon geschlossen: Abbruch ohne Render-Fenster', async () => {
    const absender = fenster();
    absender.zerstoert = true;
    const { exportiere, erzeuger } = kanal({ absender });
    expect(await exportiere(auftrag(wegwerf()))).toEqual({
      ok: false,
      fehler: { folie: null, grund: 'abbruch' },
    });
    expect(erzeuger.erzeugeFolienBilder).not.toHaveBeenCalled();
  });

  it('Fehlschlag beim Schreiben: Grund «schreiben», protokolliert', async () => {
    const ordner = wegwerf();
    const datei = path.join(ordner, 'kein-ordner.txt');
    fs.writeFileSync(datei, 'x');
    const { exportiere, logger } = kanal();
    const antwort = await exportiere(auftrag(datei));
    expect(antwort).toEqual({ ok: false, fehler: { folie: null, grund: 'schreiben' } });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('presentationImages:export — Zielordner-Regel (AK2)', () => {
  it('neuer Ordner: wird angelegt, die Bilder liegen direkt darin', async () => {
    const ordner = path.join(wegwerf(), 'Bilder');
    const antwort = await kanal().exportiere(auftrag(ordner));
    expect(antwort).toEqual({ ok: true, ordner, bilder: 3 });
    expect(dateien(ordner)).toHaveLength(3);
  });

  it('leerer Ordner: die Bilder liegen direkt darin', async () => {
    const ordner = wegwerf();
    expect((await kanal().exportiere(auftrag(ordner))).ordner).toBe(ordner);
  });

  it('früherer Bilder-Export: direkt hinein, ersetzt, höher nummerierte bleiben liegen', async () => {
    const ordner = wegwerf();
    const { exportiere } = kanal();
    await exportiere(auftrag(ordner, { folien: [folie(), folie(), folie(), folie()] }));
    // Windows legt in Bilder-Ordnern gelegentlich Thumbs.db an; das macht den
    // Ordner nicht zu einem fremden.
    fs.writeFileSync(path.join(ordner, 'Thumbs.db'), 'x');
    const zweiter = kanal({
      bilder: async ({ folien }) => folien.map((_f, i) => png(100 + i)),
    });
    const antwort = await zweiter.exportiere(auftrag(ordner, { folien: [folie(), folie()] }));
    expect(antwort).toEqual({ ok: true, ordner, bilder: 2 });
    expect(fs.readFileSync(path.join(ordner, 'folie-001.png'))).toEqual(png(100));
    expect(fs.readFileSync(path.join(ordner, 'folie-002.png'))).toEqual(png(101));
    // Verhalten wie der HTML-Export: Überzählige Bilder bleiben liegen.
    expect(fs.readFileSync(path.join(ordner, 'folie-004.png'))).toEqual(png(4));
  });

  it('fremder Inhalt: Unterordner <Name>-Folien, der fremde Inhalt bleibt unberührt', async () => {
    const ordner = wegwerf();
    fs.writeFileSync(path.join(ordner, 'Notizen.txt'), 'fremd');
    const antwort = await kanal().exportiere(auftrag(ordner));
    const unter = path.join(ordner, 'Vortrag-Folien');
    expect(antwort).toEqual({ ok: true, ordner: unter, bilder: 3 });
    expect(dateien(ordner)).toEqual(['Notizen.txt', 'Vortrag-Folien']);
    expect(dateien(unter)).toEqual(['folie-001.png', 'folie-002.png', 'folie-003.png']);
  });

  it('ein früherer HTML-Export gilt nicht als Bilder-Export', async () => {
    const ordner = wegwerf();
    fs.writeFileSync(path.join(ordner, 'index.html'), 'x');
    fs.writeFileSync(path.join(ordner, 'folie-001.html'), 'x');
    expect((await kanal().exportiere(auftrag(ordner))).ordner).toBe(
      path.join(ordner, 'Vortrag-Folien'),
    );
  });

  it('der Unterordner-Name wird bereinigt, ohne Namen gilt der Ersatz-Name', async () => {
    const ordner = wegwerf();
    fs.writeFileSync(path.join(ordner, 'x.txt'), 'x');
    const a = await kanal().exportiere(auftrag(ordner, { unterordner: 'A:B*C. ' }));
    expect(a.ordner).toBe(path.join(ordner, 'A_B_C'));
    const b = await kanal().exportiere(auftrag(ordner, { unterordner: '' }));
    expect(b.ordner).toBe(path.join(ordner, DE['presentation.export.ordnerOhneName']));
  });

  it('zielOrdnerBilder: ein Lese-Fehler außer ENOENT wird weitergereicht', async () => {
    const dateisystem = {
      readdir: async () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      },
    };
    await expect(zielOrdnerBilder('C:\\X', 'N', dateisystem)).rejects.toThrow('EACCES');
  });
});

describe('presentationImages:export — Eingabe-Prüfung', () => {
  const ordner = os.tmpdir();
  const faelle = [
    ['kein Auftrag', null],
    ['relativer Ordner', auftrag('Bilder')],
    ['Ordner kein Text', auftrag(ordner, { zielOrdner: 7 })],
    ['Unterordner kein Text', auftrag(ordner, { unterordner: 3 })],
    ['leere Folien-Liste', auftrag(ordner, { folien: [] })],
    ['Folie ohne Dokument', auftrag(ordner, { folien: [{ ...folie(), html: '' }] })],
    ['Dokument kein Text', auftrag(ordner, { folien: [{ ...folie(), html: { length: 3 } }] })],
    ['Breite keine Ganzzahl', auftrag(ordner, { folien: [{ ...folie(), breite: 12.5 }] })],
    ['Höhe null', auftrag(ordner, { folien: [{ ...folie(), hoehe: 0 }] })],
    ['zu viele Folien', auftrag(ordner, { folien: Array.from({ length: 2001 }, folie) })],
  ];
  for (const [name, eingabe] of faelle) {
    it(`weist ab: ${name}`, async () => {
      const { exportiere, erzeuger } = kanal();
      expect(await exportiere(eingabe)).toEqual({
        ok: false,
        fehler: { folie: null, grund: 'eingabe' },
      });
      expect(erzeuger.erzeugeFolienBilder).not.toHaveBeenCalled();
    });
  }

  it('die Grenze je Folie ist die des Publikums-Fensters', () => {
    const grenze = 'x'.repeat(FOLIE_MAX_ZEICHEN);
    expect(
      pruefeAuftrag(auftrag(ordner, { folien: [{ ...folie(), html: grenze }] })),
    ).not.toBeNull();
    const darueber = `${grenze}x`;
    expect(pruefeAuftrag(auftrag(ordner, { folien: [{ ...folie(), html: darueber }] }))).toBeNull();
  });

  it('übernimmt nur die bekannten Felder, auch keine Notizen, und löst den Ordner auf', () => {
    const geprueft = pruefeAuftrag({
      ...auftrag(ordner),
      fremd: 1,
      folien: [{ ...folie(), notizen: ['Notiz'] }],
    });
    expect(Object.keys(geprueft).sort()).toEqual(['folien', 'unterordner', 'zielOrdner']);
    expect(Object.keys(geprueft.folien[0]).sort()).toEqual(['breite', 'hoehe', 'html']);
    expect(geprueft.zielOrdner).toBe(path.resolve(ordner));
  });
});

describe('fehlerAngabe — Gründe für die Meldung', () => {
  it('übernimmt die Gründe des Render-Fensters samt Folie', () => {
    for (const grund of ['zeitbudget', 'abbruch', 'laden', 'aufnahme', 'masse', 'prozess']) {
      expect(fehlerAngabe(Object.assign(new Error('x'), { grund, folie: 3 }), 'unbekannt')).toEqual(
        { folie: 3, grund },
      );
    }
  });

  it('ein unbekannter Grund fällt auf den Rückfall', () => {
    expect(fehlerAngabe(new Error('EACCES'), 'schreiben')).toEqual({
      folie: null,
      grund: 'schreiben',
    });
    expect(
      fehlerAngabe(Object.assign(new Error('x'), { grund: 'eintraege' }), 'unbekannt'),
    ).toEqual({ folie: null, grund: 'unbekannt' });
  });

  it('jeder Grund hat einen Text in der Sprachdatei (geteilt mit dem PowerPoint-Export)', () => {
    for (const grund of BILDER_GRUENDE) {
      expect(DE[`presentation.export.pptxGrund.${grund}`], grund).toBeTruthy();
    }
  });
});

describe('presentationImages:chooseFolder — Ordner-Dialog (AK2)', () => {
  it('beginnt im Ordner des Dokuments, mit eigenem Titel, Ordner anlegbar', async () => {
    const { waehle, dialog } = kanal({
      dialogAntwort: { canceled: false, filePaths: ['C:\\A\\Bilder'] },
    });
    expect(await waehle({ suggestedDir: 'C:\\A' })).toEqual({
      ok: true,
      path: path.resolve('C:\\A\\Bilder'),
    });
    expect(dialog.showOpenDialog.mock.calls[0][1]).toEqual({
      title: 'Ordner für die Folien-Bilder wählen',
      defaultPath: 'C:\\A',
      properties: ['openDirectory', 'createDirectory'],
    });
  });

  it('pfadloses Dokument: Home-Verzeichnis; Abbruch: nichts gewählt', async () => {
    const { waehle, dialog } = kanal();
    expect(await waehle({ suggestedDir: null })).toEqual({ ok: false, canceled: true });
    expect(await waehle()).toEqual({ ok: false, canceled: true });
    expect(dialog.showOpenDialog.mock.calls[0][1].defaultPath).toBe('C:\\Home');
    expect(dialog.showOpenDialog.mock.calls[1][1].defaultPath).toBe('C:\\Home');
  });
});

describe('Registrierung im Hauptprozess', () => {
  it('main.js lädt und registriert die Kanal-Gruppe', () => {
    const main = fs.readFileSync(path.join(WURZEL, 'src/main/main.js'), 'utf8');
    expect(main).toContain("require('./ipc/presentation-export-bilder')");
    expect(main).toContain('registerPresentationBilderIpc(registriere, ipcDeps);');
    expect(main).toContain('getFolienBilder: () => folienBilder,');
  });
});
