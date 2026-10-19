// 4T-002294 (Epic 3E-000349): Der Kanal der PowerPoint-Datei des Foliensatzes
// — `presentationPptx:export` — und der Speichern-Dialog `pptx:chooseTarget`
// (Story 4S-001084, AK2 und AK3).
//
// Gemessen am echten Handler aus `src/main/ipc/presentation-export-pptx.js`
// (Muster praesentation-export-kanal.test.js): Das Render-Fenster der Bilder
// ist eine Attrappe, der Container läuft echt, geschrieben wird in ein
// Wegwerf-Verzeichnis über den echten Schreibweg. Den Speichern-Dialog misst
// der echte Handler aus dialogs.js mit einer Dialog-Attrappe. Die
// Registrierung in main.js ist im Unit-Kontext nicht ladbar (Electron) und
// wird gegen den QUELLTEXT geprüft.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { zipInhalt } from './zip-leser-helfer.js';

const require = createRequire(import.meta.url);
const {
  registerPresentationPptxIpc,
  pruefeAuftrag,
  fehlerAngabe,
  PPTX_GRUENDE,
} = require('../../src/main/ipc/presentation-export-pptx.js');
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');
const { FOLIE_MAX_ZEICHEN } = require('../../src/main/praesentation-fenster.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DE = JSON.parse(fs.readFileSync(path.join(WURZEL, 'src/i18n/de.json'), 'utf8'));
const wurzeln = [];
function wegwerf() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'folien-pptx-'));
  wurzeln.push(w);
  return w;
}
afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

// Ein PNG genügt dem Container mit seiner Signatur; der Rest sind Daten.
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

function folie(notizen = []) {
  return { html: '<!doctype html><p>Folie</p>', breite: 1280, hoehe: 720, notizen };
}

function kanal({ absender = fenster(), bilder } = {}) {
  const handler = new Map();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const erzeuger = {
    erzeugeFolienBilder: vi.fn(bilder || (async ({ folien }) => folien.map((_f, i) => png(i + 1)))),
  };
  registerPresentationPptxIpc(
    (name, fn) => handler.set(name, fn),
    {
      app: { getVersion: () => '9.8.7' },
      senderWindow: () => absender,
      // Der Bild-Name in einer anderen Sprache als die Vorgabe des Containers,
      // damit die Übergabe messbar ist.
      tForWindow: (_w, key) => (key === 'presentation.export.pptxBildName' ? 'Slide' : DE[key]),
      getFolienBilder: () => erzeuger,
    },
    { logger, jetzt: () => new Date('2026-10-17T12:34:56Z') },
  );
  const exportiere = (auftrag) => handler.get('presentationPptx:export')({}, auftrag);
  return { exportiere, erzeuger, absender, logger };
}

function auftrag(ordner, ueber = {}) {
  return {
    zielPfad: path.join(ordner, 'Vortrag.pptx'),
    format: '16:9',
    titel: 'Vortrag',
    folien: [folie(['Erste Notiz', 'Zweite\nZeile']), folie([]), folie(['  '])],
    ...ueber,
  };
}

function notizText(teile, nr) {
  const xml = teile.get(`ppt/notesSlides/notesSlide${nr}.xml`).toString('utf8');
  return Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) => m[1]);
}

describe('presentationPptx:export — Bilder, Datei, Schreiben (AK3)', () => {
  it('erzeugt je Folie ein Bild, baut die Datei mit den Notizen und schreibt sie', async () => {
    const ordner = wegwerf();
    const { exportiere, erzeuger } = kanal();
    const antwort = await exportiere(auftrag(ordner));
    const ziel = path.join(ordner, 'Vortrag.pptx');
    expect(antwort).toEqual({ ok: true, path: ziel, folien: 3, notizen: 2 });
    // Das Render-Fenster bekommt nur die Dokumente, nicht die Notizen, und ein
    // Abbruch-Signal.
    const [angaben] = erzeuger.erzeugeFolienBilder.mock.calls[0];
    expect(angaben.folien).toEqual([
      { html: '<!doctype html><p>Folie</p>', breite: 1280, hoehe: 720 },
      { html: '<!doctype html><p>Folie</p>', breite: 1280, hoehe: 720 },
      { html: '<!doctype html><p>Folie</p>', breite: 1280, hoehe: 720 },
    ]);
    expect(angaben.abbruch).toBeInstanceOf(AbortSignal);
    const teile = zipInhalt(new Uint8Array(fs.readFileSync(ziel)));
    expect(teile.get('ppt/media/image2.png')).toEqual(png(2));
    expect(notizText(teile, 1)).toEqual(['Erste Notiz', 'Zweite', 'Zeile']);
    expect(notizText(teile, 2)).toEqual([]);
    // Metadaten: Erzeuger mit der Version der Anwendung, Titel, Erstellzeit.
    const kern = teile.get('docProps/core.xml').toString('utf8');
    expect(kern).toContain('<dc:creator>EM4me 9.8.7</dc:creator>');
    expect(kern).toContain('<dc:title>Vortrag</dc:title>');
    expect(kern).toContain('2026-10-17T12:34:56Z');
    // Der Bild-Name kommt übersetzt aus dem Fenster-Kontext.
    expect(teile.get('ppt/slides/slide1.xml').toString('utf8')).toContain('name="Slide 1"');
  });

  it('4:3 ergibt die Folien-Größe 9144000 x 6858000 EMU', async () => {
    const ordner = wegwerf();
    const { exportiere } = kanal();
    const antwort = await exportiere(auftrag(ordner, { format: '4:3', folien: [folie()] }));
    expect(antwort.ok).toBe(true);
    const teile = zipInhalt(new Uint8Array(fs.readFileSync(antwort.path)));
    expect(teile.get('ppt/presentation.xml').toString('utf8')).toContain(
      '<p:sldSz cx="9144000" cy="6858000"',
    );
  });

  it('ein Fehler des Render-Fensters kommt mit Folie und Grund zurück, ohne Datei', async () => {
    const ordner = wegwerf();
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
    expect(fs.existsSync(path.join(ordner, 'Vortrag.pptx'))).toBe(false);
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
    expect(fs.existsSync(path.join(ordner, 'Vortrag.pptx'))).toBe(false);
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
    const antwort = await exportiere(auftrag(ordner, { zielPfad: path.join(datei, 'V.pptx') }));
    expect(antwort).toEqual({ ok: false, fehler: { folie: null, grund: 'schreiben' } });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('presentationPptx:export — Eingabe-Prüfung', () => {
  const ordner = os.tmpdir();
  const faelle = [
    ['kein Auftrag', null],
    ['relativer Pfad', auftrag(ordner, { zielPfad: 'Vortrag.pptx' })],
    ['falsche Endung', auftrag(ordner, { zielPfad: path.join(ordner, 'Vortrag.pdf') })],
    ['unbekanntes Format', auftrag(ordner, { format: '21:9' })],
    ['Titel kein Text', auftrag(ordner, { titel: 7 })],
    ['leere Folien-Liste', auftrag(ordner, { folien: [] })],
    ['Folie ohne Dokument', auftrag(ordner, { folien: [{ ...folie(), html: '' }] })],
    ['Dokument kein Text', auftrag(ordner, { folien: [{ ...folie(), html: { length: 3 } }] })],
    ['Breite keine Ganzzahl', auftrag(ordner, { folien: [{ ...folie(), breite: 12.5 }] })],
    ['Höhe null', auftrag(ordner, { folien: [{ ...folie(), hoehe: 0 }] })],
    ['Notizen keine Liste', auftrag(ordner, { folien: [{ ...folie(), notizen: 'x' }] })],
    ['Notiz kein Text', auftrag(ordner, { folien: [folie([3])] })],
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

  it('übernimmt nur die bekannten Felder und löst den Pfad auf', () => {
    const geprueft = pruefeAuftrag({ ...auftrag(ordner), fremd: 1 });
    expect(Object.keys(geprueft).sort()).toEqual(['folien', 'format', 'titel', 'zielPfad']);
    expect(Object.keys(geprueft.folien[0]).sort()).toEqual(['breite', 'hoehe', 'html', 'notizen']);
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

  it('die Grenzen des ZIP-Schreibers heißen «groesse», ein TypeError «eingabe»', () => {
    const zip = (grund) => Object.assign(new RangeError('zu groß'), { grund });
    expect(fehlerAngabe(zip('eintraege'), 'x').grund).toBe('groesse');
    expect(fehlerAngabe(zip('groesse'), 'x').grund).toBe('groesse');
    expect(fehlerAngabe(new TypeError('x'), 'schreiben')).toEqual({
      folie: null,
      grund: 'eingabe',
    });
    expect(fehlerAngabe(new Error('EACCES'), 'schreiben')).toEqual({
      folie: null,
      grund: 'schreiben',
    });
  });

  it('jeder Grund hat einen Text in der Sprachdatei', () => {
    for (const grund of PPTX_GRUENDE) {
      expect(DE[`presentation.export.pptxGrund.${grund}`], grund).toBeTruthy();
    }
  });
});

describe('pptx:chooseTarget — Speichern-Dialog (AK2)', () => {
  function dialogKanal(antwort) {
    const handler = new Map();
    const dialog = { showSaveDialog: vi.fn(async () => antwort) };
    registerDialogsIpc((name, fn) => handler.set(name, fn), {
      app: { getPath: () => 'C:\\Home' },
      dialog,
      shell: {},
      session: {},
      senderWindow: () => null,
      tForWindow: (_w, key) => `T:${key}`,
      getStore: () => ({ get: () => undefined }),
    });
    return { waehle: (params) => handler.get('pptx:chooseTarget')({}, params), dialog };
  }

  it('Vorschlag neben dem Dokument, Filter PowerPoint-Präsentation', async () => {
    const { waehle, dialog } = dialogKanal({ canceled: false, filePath: 'C:\\A\\Vortrag.pptx' });
    const antwort = await waehle({ suggestedPath: 'C:\\A\\Vortrag.pptx', suggestedName: null });
    expect(antwort).toEqual({ ok: true, path: path.resolve('C:\\A\\Vortrag.pptx') });
    expect(dialog.showSaveDialog.mock.calls[0][1]).toEqual({
      title: 'T:presentation.export.pptxDialogTitel',
      defaultPath: 'C:\\A\\Vortrag.pptx',
      filters: [{ name: 'T:dialog.filterPptx', extensions: ['pptx'] }],
    });
  });

  it('pfadloses Dokument: Name im Home-Verzeichnis, ohne Namen der Ersatz-Name', async () => {
    const { waehle, dialog } = dialogKanal({ canceled: true });
    await waehle({ suggestedPath: null, suggestedName: 'Unbenannt 2.pptx' });
    await waehle({});
    expect(dialog.showSaveDialog.mock.calls[0][1].defaultPath).toBe(
      path.join('C:\\Home', 'Unbenannt 2.pptx'),
    );
    expect(dialog.showSaveDialog.mock.calls[1][1].defaultPath).toBe(
      path.join('C:\\Home', 'T:presentation.export.ordnerOhneName.pptx'),
    );
  });

  it('Abbruch: nichts gewählt', async () => {
    const { waehle } = dialogKanal({ canceled: true });
    expect(await waehle({ suggestedPath: 'C:\\A\\V.pptx' })).toEqual({ ok: false, canceled: true });
  });

  it('der Filter-Name steht in der Sprachdatei', () => {
    expect(DE['dialog.filterPptx']).toBe('PowerPoint-Präsentation');
    expect(DE['presentation.export.pptxDialogTitel']).toBe(
      'Als PowerPoint-Präsentation exportieren',
    );
  });
});

describe('Registrierung im Hauptprozess', () => {
  it('main.js lädt und registriert die Kanal-Gruppe mit dem Erzeuger der Bilder', () => {
    const main = fs.readFileSync(path.join(WURZEL, 'src/main/main.js'), 'utf8');
    expect(main).toContain("require('./ipc/presentation-export-pptx')");
    expect(main).toContain('registerPresentationPptxIpc(registriere, ipcDeps);');
    expect(main).toContain('getFolienBilder: () => folienBilder,');
  });
});
