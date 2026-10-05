// 4T-002023 (Epic 3E-000192, Story 4S-001023): Der Lese-Kanal
// `chart:readTableDocument` — der ganze Text des Dokuments, in dem ein Diagramm
// seine Tabelle nennt (Task AK7, AK12).
//
// Der Kanal wird über seine Registrier-Funktion mit echten Dateien geprüft
// (Muster `kanban-angaben.test.js`): Auflöser, Grenze, Endungs-Regel und
// Inhalts-Leser laufen wie im Programm; ersetzt sind allein die Namens-Suche
// des Bereichs-Index und die Puffer-Auskunft, die in ihren eigenen Prüfdateien
// stehen (`index-puffer-overlay.test.js`, `embed-inhalt.test.js`).
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerEmbedsIpc } = require('../../src/main/ipc/embeds.js');
const embedInhalt = require('../../src/main/documents/embed-content.js');
const fsp = require('node:fs/promises');
const fsSync = require('node:fs');

const EREIGNIS = { sender: { id: 1 } };
const MAX = 5 * 1024 * 1024;
const wurzeln = [];

function wegwerfWurzel() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-tabelle-'));
  wurzeln.push(w);
  return w;
}

function schreibe(wurzel, rel, inhalt) {
  const abs = path.join(wurzel, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt);
  return abs;
}

afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Die Schreib-Wege der Puffer-Schicht werfen: Ein Lese-Kanal darf sie nie
// berühren, sonst machte er das andere Dokument ungespeichert.
function kanal(areaRoot, { puffer = () => null, index = () => null, bedarf = [] } = {}) {
  const handlers = new Map();
  const verboten = () => {
    throw new Error('Schreib-Weg der Puffer-Schicht aufgerufen');
  };
  registerEmbedsIpc((name, fn) => handlers.set(name, fn), {
    areaRootForEvent: () => areaRoot,
    backlinks: {
      ensureIndexForDemand: (...args) => bedarf.push(args),
      resolveWikiTargetInIndex: index,
      bufferTextFor: puffer,
      setBufferOverlay: verboten,
      clearBufferOverlay: verboten,
      clearAllBufferOverlays: verboten,
      extractEmbedSnippet: verboten,
    },
    subpages: {
      isRelativeTarget: () => false,
      expandRelativeTarget: () => null,
      toFileBasename: (s) => s,
    },
    embedInhalt,
    MAX_EMBED_BYTES: MAX,
  });
  return handlers.get('chart:readTableDocument');
}

const TABELLE =
  '# A\n\n```perspective-datatable\ncolumns: Monat:text, Wert:number\n| Jan | 1 |\n```\n^umsatz\n';

describe('chart:readTableDocument — Parameter (AK12)', () => {
  it('prüft seine Parameter und antwortet mit einem Ergebnis-Objekt statt einer Ausnahme', async () => {
    const f = kanal(null);
    const fehlerhaft = [
      undefined,
      null,
      42,
      'text',
      [],
      {},
      { basePath: 'x' },
      { file: 'A' },
      { basePath: '', file: 'A' },
      { basePath: 'x.md', file: '' },
      { basePath: 7, file: 'A' },
      { basePath: 'x.md', file: ['A'] },
      { basePath: ['x.md'], file: 'A' },
      { basePath: 'x.md', file: { toString: () => 'A' } },
      { basePath: 'x.md', file: 'A'.repeat(4097) },
      { basePath: 'x'.repeat(4097), file: 'A' },
    ];
    for (const params of fehlerhaft) {
      expect(await f(EREIGNIS, params)).toEqual({ ok: false, error: 'missing params' });
    }
  });

  it('die Grenze der Länge lässt einen Pfad an ihr durch', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const antwort = await kanal(w)(EREIGNIS, { basePath: b, file: 'A'.repeat(4096) });
    expect(antwort.error).not.toBe('missing params');
  });
});

describe('chart:readTableDocument — Suchen und Finden wie die Einbettung (AK9)', () => {
  it('liefert den ganzen Text samt Pfad; ohne Endung ist `.md` gemeint', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const a = schreibe(w, 'A.md', TABELLE);
    expect(await kanal(w)(EREIGNIS, { basePath: b, file: 'A' })).toEqual({
      ok: true,
      path: a,
      content: TABELLE,
      quelle: 'platte',
    });
    expect((await kanal(w)(EREIGNIS, { basePath: b, file: 'A.md' })).path).toBe(a);
  });

  it('meldet einen Bedarf am Verzeichnis, auch wenn die Datei neben dem Dokument liegt', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    schreibe(w, 'A.md', TABELLE);
    const bedarf = [];
    await kanal(w, { bedarf })(EREIGNIS, { basePath: b, file: 'A' });
    expect(bedarf).toEqual([[b, '1:demand', w]]);
  });

  it('findet ein Ziel im Unterordner über den Pfad und über die Namens-Suche', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const a = schreibe(w, 'Ordner/tief/A.md', TABELLE);
    expect((await kanal(w)(EREIGNIS, { basePath: b, file: 'Ordner/tief/A' })).path).toBe(a);
    const index = (_basis, logisch) =>
      logisch === 'A' ? { status: 'ready', candidates: [a] } : null;
    expect((await kanal(w, { index })(EREIGNIS, { basePath: b, file: 'A' })).path).toBe(a);
  });

  it('ein fehlendes Dokument: feste Kennung, der geschriebene Ort und der Stand des Verzeichnisses', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const erwarteterPfad = path.join(w, 'Fehlt.md');
    const vorAufbau = await kanal(w, { index: () => ({ status: 'indexing', candidates: [] }) })(
      EREIGNIS,
      { basePath: b, file: 'Fehlt' },
    );
    expect(vorAufbau).toEqual({
      ok: false,
      error: 'not found',
      path: erwarteterPfad,
      indexBereit: false,
    });
    const bereit = await kanal(w, { index: () => ({ status: 'ready', candidates: [] }) })(
      EREIGNIS,
      { basePath: b, file: 'Fehlt' },
    );
    expect(bereit).toEqual({
      ok: false,
      error: 'not found',
      path: erwarteterPfad,
      indexBereit: true,
    });
  });

  it('ein Ziel außerhalb der Grenze und eine fremde Endung werden nicht gelesen', async () => {
    const w = wegwerfWurzel();
    const bereich = path.join(w, 'Bereich');
    const b = schreibe(w, 'Bereich/B.md', '# B');
    schreibe(w, 'Draussen.md', TABELLE);
    schreibe(w, 'Bereich/daten.txt', TABELLE);
    expect(await kanal(bereich)(EREIGNIS, { basePath: b, file: '../Draussen' })).toEqual({
      ok: false,
      error: 'outside area root',
    });
    expect(await kanal(bereich)(EREIGNIS, { basePath: b, file: 'daten.txt' })).toEqual({
      ok: false,
      error: 'extension not allowed',
    });
  });

  it('außerhalb eines Bereichs gilt der Ordner des Dokuments samt Unterordnern', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'Ordner/B.md', '# B');
    const a = schreibe(w, 'Ordner/Unter/A.md', TABELLE);
    schreibe(w, 'Nachbar.md', TABELLE);
    expect((await kanal(null)(EREIGNIS, { basePath: b, file: 'Unter/A' })).path).toBe(a);
    expect((await kanal(null)(EREIGNIS, { basePath: b, file: '../Nachbar' })).error).toBe(
      'outside area root',
    );
  });

  it('ein Ziel in einem verknüpften Bereich wird nicht aufgelöst (Entscheidung «Eigenes Vorhaben danach»)', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const bedarf = [];
    expect(await kanal(w, { bedarf })(EREIGNIS, { basePath: b, file: '@zt:A' })).toEqual({
      ok: false,
      error: 'area-link',
    });
    expect(bedarf).toEqual([]);
  });
});

describe('chart:readTableDocument — geschriebener Stand und Grenzen (AK4, AK6)', () => {
  it('der Puffer eines geöffneten Dokuments geht der Platte vor', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const a = schreibe(w, 'A.md', TABELLE);
    const puffer = (abs) => (abs === a ? 'UNGESPEICHERT' : null);
    expect(await kanal(w, { puffer })(EREIGNIS, { basePath: b, file: 'A' })).toEqual({
      ok: true,
      path: a,
      content: 'UNGESPEICHERT',
      quelle: 'puffer',
    });
  });

  it('ein Dokument, das nur im Puffer existiert, ist über seinen Ort lesbar', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const neu = path.join(w, 'Neu.md');
    const puffer = (abs) => (abs === neu ? 'NUR IM PUFFER' : null);
    const antwort = await kanal(w, { puffer })(EREIGNIS, { basePath: b, file: 'Neu' });
    expect(antwort).toMatchObject({ ok: true, path: neu, content: 'NUR IM PUFFER' });
  });

  it('ohne Puffer gilt wieder die Platte (Schließen ohne Speichern)', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    schreibe(w, 'A.md', TABELLE);
    let text = 'UNGESPEICHERT';
    const f = kanal(w, { puffer: () => text });
    expect((await f(EREIGNIS, { basePath: b, file: 'A' })).content).toBe('UNGESPEICHERT');
    text = null;
    expect((await f(EREIGNIS, { basePath: b, file: 'A' })).content).toBe(TABELLE);
  });

  it('zu groß: feste Kennung, auf der Platte wie im Puffer, genau an der Grenze nicht', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const gross = schreibe(w, 'Gross.md', 'x'.repeat(MAX + 1));
    const passt = schreibe(w, 'Passt.md', 'y'.repeat(MAX));
    expect(await kanal(w)(EREIGNIS, { basePath: b, file: 'Gross' })).toEqual({
      ok: false,
      error: 'too large',
      path: gross,
    });
    expect((await kanal(w)(EREIGNIS, { basePath: b, file: 'Passt' })).ok).toBe(true);
    const puffer = (abs) => (abs === passt ? 'z'.repeat(MAX + 1) : null);
    expect(await kanal(w, { puffer })(EREIGNIS, { basePath: b, file: 'Passt' })).toEqual({
      ok: false,
      error: 'too large',
      path: passt,
    });
  });

  it('ein nicht lesbares Ziel liefert die feste Kennung, keine Systemmeldung', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    // Ein Ordner mit Markdown-Endung besteht die Endungs-Regel und ist nicht
    // als Datei lesbar.
    const ordner = path.join(w, 'Ordner.md');
    fs.mkdirSync(ordner);
    vi.spyOn(fsp, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('EISDIR: illegal operation'), { code: 'EISDIR' }),
    );
    expect(await kanal(w)(EREIGNIS, { basePath: b, file: 'Ordner' })).toEqual({
      ok: false,
      error: 'unreadable',
      path: ordner,
    });
  });
});

describe('chart:readTableDocument — liest nur (AK7)', () => {
  it('Inhalt und Zeitstempel bleiben gleich, kein Schreib-Aufruf an Datei oder Puffer', async () => {
    const w = wegwerfWurzel();
    const b = schreibe(w, 'B.md', '# B');
    const a = schreibe(w, 'A.md', TABELLE);
    const vorher = fs.statSync(a).mtimeMs;
    const schreibWege = [
      vi.spyOn(fsp, 'writeFile'),
      vi.spyOn(fsp, 'appendFile'),
      vi.spyOn(fsp, 'rename'),
      vi.spyOn(fsp, 'unlink'),
      vi.spyOn(fsp, 'utimes'),
      vi.spyOn(fsSync, 'writeFileSync'),
      vi.spyOn(fsSync, 'renameSync'),
    ];
    const antwort = await kanal(w)(EREIGNIS, { basePath: b, file: 'A' });
    expect(antwort.ok).toBe(true);
    for (const weg of schreibWege) expect(weg).not.toHaveBeenCalled();
    expect(fs.readFileSync(a, 'utf8')).toBe(TABELLE);
    expect(fs.statSync(a).mtimeMs).toBe(vorher);
  });
});
