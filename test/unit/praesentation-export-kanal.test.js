// 4T-002163 (Epic 3E-000149): Die Kanaele des Hauptprozesses fuer die beiden
// Ausgaben des Foliensatzes — `presentationPdf:print`,
// `presentationHtml:chooseFolder` und `presentationHtml:write`.
//
// Gemessen am echten Handler aus `src/main/ipc/presentation-export.js` (Muster
// praesentation-vollbild-kanal.test.js): Fenster und Dialog sind Attrappen,
// geschrieben wird in ein Wegwerf-Verzeichnis ueber den echten Schreibweg.
// Die Registrierung in main.js ist im Unit-Kontext nicht ladbar (Electron) und
// wird gegen den QUELLTEXT geprueft.
import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  registerPresentationExportIpc,
  zielOrdner,
  sichererOrdnerName,
} = require('../../src/main/ipc/presentation-export.js');
const { folienPdfOptionen } = require('../../src/shared/pdf-options.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wurzeln = [];
function wegwerf() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'folien-export-'));
  wurzeln.push(w);
  return w;
}
afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

function fenster() {
  const w = {
    hintergrund: '#1e1e1e',
    isDestroyed: () => false,
    getBackgroundColor: () => w.hintergrund,
    setBackgroundColor: vi.fn((farbe) => {
      w.hintergrund = farbe;
    }),
    webContents: {
      printToPDF: vi.fn(async () => {
        w.druckHintergrund = w.hintergrund;
        return Buffer.from('%PDF-1.7 Folien');
      }),
    },
  };
  return w;
}

function kanaele({ absender = fenster(), dialogAntwort = { canceled: true } } = {}) {
  const handler = new Map();
  const dialog = { showOpenDialog: vi.fn(async () => dialogAntwort) };
  registerPresentationExportIpc((name, fn) => handler.set(name, fn), {
    app: { getPath: () => 'C:\\Home' },
    dialog,
    senderWindow: () => absender,
    tForWindow: (_w, key) => `T:${key}`,
  });
  return { handler, dialog, absender };
}

describe('presentationPdf:print', () => {
  it('druckt im Folien-Format ohne Rand und schreibt die Datei', async () => {
    const { handler, absender } = kanaele();
    const ziel = path.join(wegwerf(), 'Vortrag.pdf');
    const antwort = await handler.get('presentationPdf:print')({}, ziel, '4:3');
    expect(antwort).toEqual({ ok: true, path: path.resolve(ziel) });
    expect(absender.webContents.printToPDF).toHaveBeenCalledWith(folienPdfOptionen('4:3'));
    expect(fs.readFileSync(ziel, 'utf8')).toBe('%PDF-1.7 Folien');
    // Weisser Grund fuer die Druck-Dauer, danach der alte.
    expect(absender.druckHintergrund).toBe('#ffffff');
    expect(absender.hintergrund).toBe('#1e1e1e');
  });

  it('ohne Pfad: Fehler statt Druck', async () => {
    const { handler, absender } = kanaele();
    const antwort = await handler.get('presentationPdf:print')({}, '', '16:9');
    expect(antwort.ok).toBe(false);
    expect(absender.webContents.printToPDF).not.toHaveBeenCalled();
  });

  it('ein Format, das kein Text ist, faellt auf 16:9', async () => {
    const { handler, absender } = kanaele();
    await handler.get('presentationPdf:print')({}, path.join(wegwerf(), 'a.pdf'), 42);
    expect(absender.webContents.printToPDF).toHaveBeenCalledWith(folienPdfOptionen('16:9'));
  });
});

describe('presentationHtml:chooseFolder', () => {
  it('Abbruch: nichts gewaehlt', async () => {
    const { handler } = kanaele();
    expect(await handler.get('presentationHtml:chooseFolder')({}, {})).toEqual({
      ok: false,
      canceled: true,
    });
  });

  it('Ordner-Dialog mit Anlegen, Vorgabe der Ordner des Dokuments', async () => {
    const { handler, dialog } = kanaele({
      dialogAntwort: { canceled: false, filePaths: ['C:\\Ziel'] },
    });
    const antwort = await handler.get('presentationHtml:chooseFolder')(
      {},
      { suggestedDir: 'C:\\Dokumente' },
    );
    expect(antwort).toEqual({ ok: true, path: path.resolve('C:\\Ziel') });
    const [, optionen] = dialog.showOpenDialog.mock.calls[0];
    expect(optionen.properties).toEqual(['openDirectory', 'createDirectory']);
    expect(optionen.defaultPath).toBe('C:\\Dokumente');
    expect(optionen.title).toBe('T:presentation.export.ordnerDialogTitel');
  });

  it('pfadloses Dokument: Vorgabe Home-Verzeichnis', async () => {
    const { handler, dialog } = kanaele();
    await handler.get('presentationHtml:chooseFolder')({}, { suggestedDir: null });
    expect(dialog.showOpenDialog.mock.calls[0][1].defaultPath).toBe('C:\\Home');
  });
});

describe('presentationHtml:write', () => {
  const SEITEN = [
    { name: 'index.html', text: '<p>1</p>' },
    { name: 'folie-001.html', text: '<p>1</p>' },
    { name: 'folie-002.html', text: '<p>2</p>' },
  ];

  it('leerer Ordner: die Seiten entstehen darin', async () => {
    const { handler } = kanaele();
    const ordner = wegwerf();
    const antwort = await handler.get('presentationHtml:write')({}, ordner, 'X-Folien', SEITEN);
    expect(antwort.ok).toBe(true);
    expect(antwort.path).toBe(ordner);
    expect(fs.readdirSync(ordner).sort()).toEqual([
      'folie-001.html',
      'folie-002.html',
      'index.html',
    ]);
    expect(fs.readFileSync(path.join(ordner, 'folie-002.html'), 'utf8')).toBe('<p>2</p>');
  });

  it('Ordner mit fremdem Inhalt: Unterordner <Name>-Folien, der fremde Inhalt bleibt', async () => {
    const { handler } = kanaele();
    const ordner = wegwerf();
    fs.writeFileSync(path.join(ordner, 'Vortrag.md'), '# fremd');
    const antwort = await handler.get('presentationHtml:write')(
      {},
      ordner,
      'Vortrag-Folien',
      SEITEN,
    );
    expect(antwort.ok).toBe(true);
    expect(antwort.name).toBe('Vortrag-Folien');
    expect(fs.readdirSync(ordner).sort()).toEqual(['Vortrag-Folien', 'Vortrag.md']);
    expect(fs.readdirSync(path.join(ordner, 'Vortrag-Folien'))).toHaveLength(3);
  });

  it('Ordner mit einem frueheren Export: wird ersetzt statt verschachtelt', async () => {
    const { handler } = kanaele();
    const ordner = wegwerf();
    fs.writeFileSync(path.join(ordner, 'index.html'), 'alt');
    fs.writeFileSync(path.join(ordner, 'folie-001.html'), 'alt');
    const antwort = await handler.get('presentationHtml:write')({}, ordner, 'X-Folien', SEITEN);
    expect(antwort.path).toBe(ordner);
    expect(fs.readFileSync(path.join(ordner, 'index.html'), 'utf8')).toBe('<p>1</p>');
  });

  it('nur Seiten-Namen des Exports; nichts wird geschrieben, wenn einer abweicht', async () => {
    const { handler } = kanaele();
    const ordner = wegwerf();
    for (const name of ['../boese.html', 'notizen.txt', 'folie-1.html', 'index.htm']) {
      const antwort = await handler.get('presentationHtml:write')({}, ordner, 'X', [
        { name: 'index.html', text: 'a' },
        { name, text: 'b' },
      ]);
      expect(antwort.ok, name).toBe(false);
    }
    expect(fs.readdirSync(ordner)).toEqual([]);
  });

  it('ohne Ordner oder ohne Seiten: Fehler', async () => {
    const { handler } = kanaele();
    expect((await handler.get('presentationHtml:write')({}, '', 'X', SEITEN)).ok).toBe(false);
    expect((await handler.get('presentationHtml:write')({}, wegwerf(), 'X', [])).ok).toBe(false);
  });
});

describe('Bausteine des Ziel-Ordners', () => {
  it('sichererOrdnerName ersetzt verbotene Zeichen und faellt auf den Ersatz', () => {
    expect(sichererOrdnerName('A:B/C*-Folien', 'Ersatz')).toBe('A_B_C_-Folien');
    expect(sichererOrdnerName('  ', 'Ersatz')).toBe('Ersatz');
    expect(sichererOrdnerName('..', 'Ersatz')).toBe('Ersatz');
    expect(sichererOrdnerName('Name. ', 'Ersatz')).toBe('Name');
    expect(sichererOrdnerName(null, 'Ersatz')).toBe('Ersatz');
  });

  it('zielOrdner: neu, leer, frueherer Export, fremd', async () => {
    const lesen = (eintraege) => ({ readdir: async () => eintraege });
    const fehlt = {
      readdir: async () => {
        const e = new Error('fehlt');
        e.code = 'ENOENT';
        throw e;
      },
    };
    expect(await zielOrdner('C:\\Z', 'N', fehlt)).toBe('C:\\Z');
    expect(await zielOrdner('C:\\Z', 'N', lesen([]))).toBe('C:\\Z');
    expect(await zielOrdner('C:\\Z', 'N', lesen(['index.html', 'folie-001.html', 'x']))).toBe(
      'C:\\Z',
    );
    expect(await zielOrdner('C:\\Z', 'N', lesen(['index.html']))).toBe(path.join('C:\\Z', 'N'));
  });
});

describe('Registrierung im Hauptprozess', () => {
  it('main.js laedt und registriert die Kanal-Gruppe', () => {
    const main = fs.readFileSync(path.join(WURZEL, 'src/main/main.js'), 'utf8');
    expect(main).toContain("require('./ipc/presentation-export')");
    expect(main).toContain('registerPresentationExportIpc(registriere, ipcDeps);');
  });
});
