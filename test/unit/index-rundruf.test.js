// 4T-002023 (Epic 3E-000192, Stories 4S-001023 AK11, 4S-000787 AK6,
// 4S-000207 AK8): Die Meldungen des Hauptprozesses, auf die Einbettungen und
// Diagramme auffrischen.
//
// 1. Der Rundruf der Puffer-Overlay-Schicht: Jedes Setzen und jede Rücknahme
//    über den Kanal `index:overlay` meldet an alle Fenster
//    (`index:overlayChanged`), auch eine Rücknahme ohne Eintrag. Vorher blieb
//    die Meldung im tippenden Fenster (Entscheidung «Beide folgen»).
// 2. Die Invalidierungs-Meldung des Verzeichnis-Beobachters nennt die
//    geänderten Dateien (`dateien`), damit eine Änderung von außen die Ziele
//    erreicht (Entscheidung «Beide frischen auf»).
// 3. Die Brücke im Preload bindet beide Wege des Overlays und die Meldung.
//
// Geprüft gegen die echten Module; der Rundruf an die Fenster ist über
// `attachBroadcast` durch eine Aufzeichnung ersetzt (Muster der Wiring-Naht).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const backlinks = require('../../src/main/backlinks.js');
const store = require('../../src/main/index/store.js');
const { onWatcherChange } = require('../../src/main/index/build.js');
const { registerIndexViewsIpc } = require('../../src/main/ipc/index-views.js');
const { bufferOverlayBridge } = require('../../src/main/preload-buffer-overlay.js');

const meldungen = [];

function zeichneAuf() {
  meldungen.length = 0;
  backlinks.attachBroadcast((kanal, nutzlast) => {
    // Was ein Empfänger im Augenblick der Meldung lesen würde.
    const puffer =
      nutzlast && nutzlast.filePath ? backlinks.bufferTextFor(nutzlast.filePath) : null;
    meldungen.push({ kanal, nutzlast, puffer });
  });
}

function overlayKanal() {
  const handlers = new Map();
  registerIndexViewsIpc((name, fn) => handlers.set(name, fn), {
    senderWindow: () => null,
    areaOfWindow: () => null,
    areaRootForEvent: () => null,
    getStore: () => null,
    backlinks,
    collectAreaStats: () => null,
    sucheImBereich: () => null,
    gibBereichsVorratFrei: () => {},
    readAreaProfilesConfig: () => null,
    resolveAreaStartPage: () => null,
    resolveHistoryFor: () => null,
    readPreviousTextFor: () => null,
    recordMddOnSave: () => {},
  });
  return handlers.get('index:overlay');
}

afterEach(() => {
  backlinks.clearAllBufferOverlays();
  backlinks.attachBroadcast(null);
  vi.useRealTimers();
});

describe('Rundruf der Puffer-Overlay-Schicht (4T-002023, «Beide folgen»)', () => {
  const DATEI = process.platform === 'win32' ? 'C:\\rundruf\\A.md' : '/rundruf/A.md';
  const FENSTER_7 = { sender: { id: 7 } };

  it('Setzen meldet an alle Fenster, und der neue Stand liegt da schon in der Schicht', () => {
    zeichneAuf();
    const kanal = overlayKanal();
    expect(kanal(FENSTER_7, { filePath: DATEI, content: 'NEU' })).toBe(true);
    expect(meldungen).toEqual([
      { kanal: 'index:overlayChanged', nutzlast: { filePath: DATEI }, puffer: 'NEU' },
    ]);
    // Der Melder bleibt Besitzer des Stands (4T-001727), unverändert.
    expect(backlinks.bufferOwnerFor(DATEI)).toBe(7);
  });

  it('Rücknahme meldet ebenso, mit dem Platten-Stand als dem, was dann gilt', () => {
    const kanal = overlayKanal();
    kanal(FENSTER_7, { filePath: DATEI, content: 'NEU' });
    zeichneAuf();
    expect(kanal(FENSTER_7, { filePath: DATEI, content: null })).toBe(true);
    expect(meldungen).toEqual([
      { kanal: 'index:overlayChanged', nutzlast: { filePath: DATEI }, puffer: null },
    ]);
  });

  it('auch eine Rücknahme ohne Eintrag meldet: ein anderes Fenster kann den alten Stand noch zeigen', () => {
    zeichneAuf();
    const kanal = overlayKanal();
    expect(kanal(FENSTER_7, { filePath: DATEI, content: null })).toBe(false);
    expect(meldungen.map((m) => m.kanal)).toEqual(['index:overlayChanged']);
  });

  it('ohne Pfad keine Meldung', () => {
    zeichneAuf();
    const kanal = overlayKanal();
    kanal(FENSTER_7, { filePath: '', content: 'x' });
    kanal(FENSTER_7, { filePath: 3, content: null });
    kanal(FENSTER_7, null);
    expect(meldungen).toEqual([]);
  });

  it('die Meldung zählt nicht als Invalidierung des Verzeichnisses', () => {
    zeichneAuf();
    const vorher = store.indexStand(DATEI);
    overlayKanal()(FENSTER_7, { filePath: DATEI, content: 'NEU' });
    expect(store.indexStand(DATEI)).toBe(vorher);
    expect(meldungen.some((m) => m.kanal === 'backlinks:invalidated')).toBe(false);
  });
});

describe('Schließen eines Fensters nimmt seine geschriebenen Stände zurück (4T-002023)', () => {
  const pfad = (name) =>
    process.platform === 'win32' ? `C:\\rundruf\\${name}` : `/rundruf/${name}`;

  it('alle Einträge des Fensters fallen, jeder mit Meldung; Stände anderer Fenster bleiben', () => {
    const kanal = overlayKanal();
    kanal({ sender: { id: 7 } }, { filePath: pfad('A.md'), content: 'A-UNGESPEICHERT' });
    kanal({ sender: { id: 7 } }, { filePath: pfad('B.md'), content: 'B-UNGESPEICHERT' });
    kanal({ sender: { id: 8 } }, { filePath: pfad('C.md'), content: 'C-UNGESPEICHERT' });
    zeichneAuf();
    backlinks.releaseAllForOwner(7);
    expect(meldungen).toEqual([
      { kanal: 'index:overlayChanged', nutzlast: { filePath: pfad('A.md') }, puffer: null },
      { kanal: 'index:overlayChanged', nutzlast: { filePath: pfad('B.md') }, puffer: null },
    ]);
    expect(backlinks.bufferTextFor(pfad('C.md'))).toBe('C-UNGESPEICHERT');
    // Ein zweites Schließen findet nichts mehr und meldet nichts.
    backlinks.releaseAllForOwner(7);
    expect(meldungen).toHaveLength(2);
  });

  it('Grenze: derselbe Stand, zuletzt von einem anderen Fenster gemeldet, gehört diesem', () => {
    const kanal = overlayKanal();
    kanal({ sender: { id: 7 } }, { filePath: pfad('A.md'), content: 'VON-7' });
    kanal({ sender: { id: 8 } }, { filePath: pfad('A.md'), content: 'VON-8' });
    zeichneAuf();
    backlinks.releaseAllForOwner(7);
    expect(meldungen).toEqual([]);
    expect(backlinks.bufferTextFor(pfad('A.md'))).toBe('VON-8');
    // Umgekehrt fällt der Stand mit dem zuletzt meldenden Fenster, auch wenn
    // das andere dieselbe Datei noch ungespeichert hält (benannte Grenze).
    backlinks.releaseAllForOwner(8);
    expect(backlinks.bufferTextFor(pfad('A.md'))).toBeNull();
  });
});

describe('Invalidierungs-Meldung nennt die geänderten Dateien (4T-002023, «Beide frischen auf»)', () => {
  it('gebündelt je Entprellung, jede Datei einmal, danach wieder ohne', () => {
    vi.useFakeTimers();
    zeichneAuf();
    const eintrag = { wurzel: '/w' };
    store.merkeGeaenderteDatei(eintrag, '/w/A.md', 'change');
    store.scheduleInvalidate(eintrag);
    store.merkeGeaenderteDatei(eintrag, '/w/B.md', 'change');
    store.merkeGeaenderteDatei(eintrag, '/w/A.md', 'change');
    store.scheduleInvalidate(eintrag);
    vi.advanceTimersByTime(250);
    expect(meldungen).toEqual([
      {
        kanal: 'backlinks:invalidated',
        nutzlast: { wurzel: '/w', dateien: ['/w/A.md', '/w/B.md'] },
        puffer: null,
      },
    ]);
    // Eine Meldung ohne Beobachter-Anlass (Block-Daten) bleibt, wie sie war.
    store.scheduleInvalidate(eintrag);
    vi.advanceTimersByTime(250);
    expect(meldungen[1].nutzlast).toEqual({ wurzel: '/w' });
  });

  it('eine hinzugekommene Datei steht zusätzlich unter «hinzugekommen», Ändern und Entfernen nicht', () => {
    vi.useFakeTimers();
    zeichneAuf();
    const eintrag = { wurzel: '/w' };
    store.merkeGeaenderteDatei(eintrag, '/w/Neu.md', 'add');
    store.merkeGeaenderteDatei(eintrag, '/w/Alt.md', 'change');
    store.merkeGeaenderteDatei(eintrag, '/w/Weg.md', 'unlink');
    store.scheduleInvalidate(eintrag);
    vi.advanceTimersByTime(250);
    expect(meldungen[0].nutzlast).toEqual({
      wurzel: '/w',
      dateien: ['/w/Neu.md', '/w/Alt.md', '/w/Weg.md'],
      hinzugekommen: ['/w/Neu.md'],
    });
    store.merkeGeaenderteDatei(eintrag, '/w/Alt.md', 'change');
    store.scheduleInvalidate(eintrag);
    vi.advanceTimersByTime(250);
    expect(meldungen[1].nutzlast).toEqual({ wurzel: '/w', dateien: ['/w/Alt.md'] });
  });
});

// Der Beobachter selbst, an einem echten Verzeichnis ohne Datei-Beobachter:
// Der Eintrag wird über den Bedarfs-Weg aufgebaut, sein Beobachter danach
// geschlossen, und die Meldungen des Beobachters werden über seinen Rückruf
// nachgestellt. So bleibt der Fall frei von Datei-Ereignissen und echter Uhr.
describe('Verzeichnis-Beobachter meldet Dateien und Art (4T-002023)', () => {
  const wurzeln = [];

  afterEach(() => {
    vi.useFakeTimers();
    for (const w of wurzeln) backlinks.releaseRoot(w);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
    wurzeln.length = 0;
  });

  async function beobachteterEintrag() {
    const w = fs.mkdtempSync(path.join(os.tmpdir(), 'index-rundruf-'));
    wurzeln.push(w);
    const alt = path.join(w, 'Alt.md');
    fs.writeFileSync(alt, '# Alt\n', 'utf8');
    let stand = backlinks.backlinksFor(alt, 'rundruf');
    for (let i = 0; i < 500 && stand.status === 'indexing'; i++) {
      await new Promise((r) => setTimeout(r, 10));
      stand = backlinks.backlinksFor(alt, 'rundruf');
    }
    expect(stand.status).toBe('ready');
    const eintrag = store.indexes.get(store.rootForActiveFile(alt));
    if (eintrag.watcher) await eintrag.watcher.close();
    eintrag.watcher = null;
    return { w, alt, eintrag };
  }

  it('Anlegen, Ändern und Entfernen einer Markdown-Datei reisen mit, Nicht-Markdown nicht', async () => {
    const { w, alt, eintrag } = await beobachteterEintrag();
    vi.useFakeTimers();
    zeichneAuf();
    const neu = path.join(w, 'Neu.md');
    fs.writeFileSync(neu, '# Neu\n', 'utf8');
    fs.writeFileSync(alt, '# Alt geändert\n', 'utf8');
    fs.writeFileSync(path.join(w, 'bild.png'), 'x');
    onWatcherChange(eintrag, neu, 'add');
    onWatcherChange(eintrag, alt, 'change');
    onWatcherChange(eintrag, path.join(w, 'bild.png'), 'add');
    vi.advanceTimersByTime(250);
    const invalidiert = meldungen.filter((m) => m.kanal === 'backlinks:invalidated');
    expect(invalidiert.map((m) => m.nutzlast)).toEqual([
      { wurzel: eintrag.wurzel, dateien: [neu, alt], hinzugekommen: [neu] },
    ]);
    fs.rmSync(neu);
    onWatcherChange(eintrag, neu, 'unlink');
    vi.advanceTimersByTime(250);
    expect(meldungen.filter((m) => m.kanal === 'backlinks:invalidated')[1].nutzlast).toEqual({
      wurzel: eintrag.wurzel,
      dateien: [neu],
    });
  });
});

describe('Brücke der Puffer-Overlay-Schicht im Preload (4T-002023)', () => {
  it('Setzen und Rücknahme über denselben Kanal wie bisher, Meldung als Zuhörer', async () => {
    const aufrufe = [];
    const zuhoerer = new Map();
    const ipc = {
      invoke: async (...args) => {
        aufrufe.push(args);
        return true;
      },
      on: (kanal, fn) => zuhoerer.set(kanal, fn),
    };
    const bruecke = bufferOverlayBridge(ipc);
    expect(Object.keys(bruecke)).toEqual([
      'setIndexOverlay',
      'clearIndexOverlay',
      'onIndexOverlayChanged',
    ]);
    await bruecke.setIndexOverlay('/a.md', 'x');
    await bruecke.clearIndexOverlay('/a.md');
    expect(aufrufe).toEqual([
      ['index:overlay', { filePath: '/a.md', content: 'x' }],
      ['index:overlay', { filePath: '/a.md', content: null }],
    ]);
    const empfangen = [];
    bruecke.onIndexOverlayChanged((nutzlast) => empfangen.push(nutzlast));
    zuhoerer.get('index:overlayChanged')({}, { filePath: '/a.md' });
    expect(empfangen).toEqual([{ filePath: '/a.md' }]);
  });
});
