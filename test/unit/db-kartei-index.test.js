// 4T-002387 (Epic 3E-000265, Schritt 2, Entscheidung S2; AK1, AK3, AK4): Die
// Erfassung der Karteikarten im Bereichs-Index und ihre Zahl in der Übersicht.
//
// **Gegen echte Temp-Verzeichnisse**, wie `datensatz-index.test.js`: Der
// Nachlauf hängt an der Reihenfolge des Aufbaus und an den bereits erfassten
// Marken und Werten des Dateikopfs, und beides gibt es nur im echten Index.
// Der Beobachter-Pfad wird über `onWatcherChange` direkt angestoßen (Muster
// `index-rundruf.test.js`), weil ein echter Datei-Beobachter mit
// Schreib-Abwarten und Entprellung nicht flakefrei prüfbar ist.
//
// **Die tragende Zusage** ist dieselbe wie in der Tabellen-Form: Der Index
// führt je Karteikarte Kennung, Schlüssel, Anzeige-Form und Fundort und
// **keine Zellwerte**.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
import { registerDatabaseIpc } from '../../src/main/ipc/database.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { onWatcherChange } = require_('../../src/main/index/build.js');
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { entryWithOverlay, overlaysUnder } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { vergissAlleKarteiTabellen, zahlDerKarteikarten } = require_(
  '../../src/main/index/karteikarten-erfassung.js',
);
const { datensatzNachKennung } = require_('../../src/main/index/datensatz-zugriff.js');

// --- Fixtures ---------------------------------------------------------------

// Eine Kartei-Tabelle mit Schlüssel und Anzeige-Form; `storage` abschaltbar.
function karteiTabelle({ kartei = true, key = 'Kürzel', display = 'Name' } = {}) {
  return [
    '---',
    'db-table:',
    ...(kartei ? ['  storage: cards'] : []),
    '  fields:',
    '    - name: Kürzel',
    '    - name: Name',
    '    - name: Ort',
    `  key: ${key}`,
    `  display: ${display}`,
    '---',
    '',
    'Je Autor eine Karteikarte in diesem Ordner.',
    '',
  ].join('\n');
}

// Eine Karteikarte; ohne Kennung ein Dokument ohne Kennung.
function karte({ kennung = null, kuerzel = 'ADA', name = 'Ada Lovelace', ort = 'London' } = {}) {
  return [
    '---',
    ...(kennung === null ? [] : [`db-record: ${kennung}`]),
    `kürzel: ${kuerzel}`,
    `Name: ${name}`,
    `Ort: ${ort}`,
    '---',
    '',
    `# ${name}`,
    '',
  ].join('\n');
}

// --- Setup/Teardown (Muster aus datensatz-index.test.js) --------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-karteiidx-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, undefined, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, undefined, areaRoot);
  }
  return result;
}

function bestandVon(root, absPath) {
  const eintrag = indexes.get(root);
  return eintrag && eintrag.recordsPerFile.get(absPath);
}

// Ein Bereich mit der Kartei-Tabelle «Autoren» und zwei Karteikarten.
function bereichMitKartei() {
  const root = makeRoot();
  const tabelle = write(root, 'Autoren/Autoren.md', karteiTabelle());
  const ada = write(root, 'Autoren/Ada Lovelace.md', karte({ kennung: 'r-00001' }));
  const alan = write(
    root,
    'Autoren/Alan Turing.md',
    karte({ kennung: 'r-2', kuerzel: 'ALT', name: 'Alan Turing', ort: 'Wilmslow' }),
  );
  return { root, tabelle, ada, alan };
}

afterEach(() => {
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  vergissAlleKarteiTabellen();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows haelt die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- AK1, AK4: Erfassung im Aufbau ------------------------------------------

describe('Erfassung im Index-Aufbau (4T-002387, AK1, AK4)', () => {
  it('führt je Karteikarte Kennung, Schlüssel, Anzeige-Form und Fundort', async () => {
    const { root, tabelle, ada, alan } = bereichMitKartei();
    await indexFor(ada, root);
    expect(bestandVon(root, ada)).toEqual([
      { id: 'r-00001', key: ['ADA'], display: 'Ada Lovelace', zeile: 0, kartei: tabelle },
    ]);
    // Die Kurzform der Kennung steht aufgefüllt im Index.
    expect(bestandVon(root, alan)).toEqual([
      { id: 'r-00002', key: ['ALT'], display: 'Alan Turing', zeile: 0, kartei: tabelle },
    ]);
    // Die Tabellen-Datei selbst trägt keinen Bestand.
    expect(bestandVon(root, tabelle)).toBeUndefined();
  });

  it('führt KEINE Zellwerte mit (A1): der Ort fehlt im Eintrag', async () => {
    const { root, ada } = bereichMitKartei();
    await indexFor(ada, root);
    expect(JSON.stringify(bestandVon(root, ada))).not.toContain('London');
  });

  it('die Signatur der Tabellen-Definition steht neben dem Bestand', async () => {
    const { root, ada } = bereichMitKartei();
    await indexFor(ada, root);
    expect(indexes.get(root).recordDefSigPerFile.get(ada)).toContain('cards');
  });

  it('ein Dokument ohne Kennung und eines mit unbrauchbarer Kennung bleiben draußen', async () => {
    const { root, ada } = bereichMitKartei();
    const notiz = write(root, 'Autoren/Notiz.md', karte());
    const kaputt = write(root, 'Autoren/Kaputt.md', karte({ kennung: 'x-1' }));
    await indexFor(ada, root);
    expect(bestandVon(root, notiz)).toBeUndefined();
    expect(bestandVon(root, kaputt)).toBeUndefined();
  });

  it('ein Dokument in einem Unterordner bleibt draußen', async () => {
    const { root, ada } = bereichMitKartei();
    const tief = write(root, 'Autoren/Archiv/Grace Hopper.md', karte({ kennung: 'r-00003' }));
    await indexFor(ada, root);
    expect(bestandVon(root, tief)).toBeUndefined();
  });

  it('ohne Kartei-Tabelle im Ordner ist eine Datei mit db-record keine Karteikarte', async () => {
    const root = makeRoot();
    const lose = write(root, 'Lose/Ada Lovelace.md', karte({ kennung: 'r-00001' }));
    write(root, 'Lose/Tabelle.md', karteiTabelle({ kartei: false }));
    await indexFor(lose, root);
    expect(bestandVon(root, lose)).toBeUndefined();
  });

  it('zwei Kartei-Tabellen im Ordner: keine Tabelle bekommt die Karteikarten (AK3)', async () => {
    const { root, ada, alan } = bereichMitKartei();
    write(root, 'Autoren/Personen.md', karteiTabelle());
    await indexFor(ada, root);
    expect(bestandVon(root, ada)).toBeUndefined();
    expect(bestandVon(root, alan)).toBeUndefined();
  });

  it('nach dem Umbenennen der Tabellen-Datei gehört die Karteikarte unverändert dazu', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    const neu = path.join(root, 'Autoren', 'Personen.md');
    fs.renameSync(tabelle, neu);
    await indexFor(ada, root);
    expect(bestandVon(root, ada)).toEqual([
      { id: 'r-00001', key: ['ADA'], display: 'Ada Lovelace', zeile: 0, kartei: neu },
    ]);
  });
});

// --- AK4: Neu-Erfassung ------------------------------------------------------

describe('Neu-Erfassung nach Änderung der Tabellen-Datei (4T-002387, AK4)', () => {
  it('eine geänderte Anzeige-Form erfasst die Karteikarten neu', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    await indexFor(ada, root);
    fs.writeFileSync(tabelle, karteiTabelle({ display: 'Ort' }), 'utf8');
    onWatcherChange(indexes.get(root), tabelle, 'change');
    expect(bestandVon(root, ada)[0].display).toBe('London');
  });

  it('ein geänderter Schlüssel erfasst die Karteikarten neu', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    await indexFor(ada, root);
    fs.writeFileSync(tabelle, karteiTabelle({ key: 'Name' }), 'utf8');
    onWatcherChange(indexes.get(root), tabelle, 'change');
    expect(bestandVon(root, ada)[0].key).toEqual(['Ada Lovelace']);
  });

  it('das Entfernen von storage leert den Bestand', async () => {
    const { root, tabelle, ada, alan } = bereichMitKartei();
    await indexFor(ada, root);
    fs.writeFileSync(tabelle, karteiTabelle({ kartei: false }), 'utf8');
    onWatcherChange(indexes.get(root), tabelle, 'change');
    expect(bestandVon(root, ada)).toBeUndefined();
    expect(bestandVon(root, alan)).toBeUndefined();
  });

  it('das Löschen der Tabellen-Datei leert den Bestand', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    await indexFor(ada, root);
    fs.rmSync(tabelle);
    onWatcherChange(indexes.get(root), tabelle, 'unlink');
    expect(bestandVon(root, ada)).toBeUndefined();
  });

  it('eine neue Karteikarte und eine geänderte Kennung folgen wie jedes Dokument', async () => {
    const { root, ada } = bereichMitKartei();
    await indexFor(ada, root);
    const grace = write(root, 'Autoren/Grace Hopper.md', karte({ kennung: 'r-00003' }));
    onWatcherChange(indexes.get(root), grace, 'add');
    expect(bestandVon(root, grace)[0].id).toBe('r-00003');
    fs.writeFileSync(ada, karte({ kennung: 'r-00009' }), 'utf8');
    onWatcherChange(indexes.get(root), ada, 'change');
    expect(bestandVon(root, ada)[0].id).toBe('r-00009');
  });

  it('der Neu-Aufbau nach geänderter Definition erfasst neu, auch aus dem Zwischenspeicher', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    await indexFor(ada, root);
    expect(bestandVon(root, ada)[0].display).toBe('Ada Lovelace');
    // Die Karteikarte bleibt unverändert und kommt beim Warmstart aus dem
    // Zwischenspeicher; nur die Tabellen-Datei ändert sich.
    fs.writeFileSync(tabelle, karteiTabelle({ display: 'Ort' }), 'utf8');
    releaseRoot(root);
    indexes.delete(root);
    await indexFor(ada, root);
    expect(bestandVon(root, ada)[0].display).toBe('London');
  });
});

// --- Puffer-Overlay und Verbraucher ------------------------------------------

describe('Puffer-Overlay und Verbraucher (4T-002387)', () => {
  it('eine ungespeicherte Kennung erscheint im überlagerten Bestand', async () => {
    const { root, ada } = bereichMitKartei();
    await indexFor(ada, root);
    setBufferOverlay(ada, karte({ kennung: 'r-00007' }));
    const sicht = entryWithOverlay(indexes.get(root), overlaysUnder(root));
    expect(sicht.recordsPerFile.get(ada)[0].id).toBe('r-00007');
    expect(bestandVon(root, ada)[0].id).toBe('r-00001');
  });

  // 4T-002388: Seit Abfrage und Verweis über Karteikarten trifft der Zugriff
  // die Karteikarte unter ihrer Kartei-Tabelle (vorher übergangen).
  it('der Zugriff über Kennung trifft die Karteikarte unter ihrer Tabelle (4T-002388)', async () => {
    const { root, ada } = bereichMitKartei();
    await indexFor(ada, root);
    expect(datensatzNachKennung(ada, root, 'Autoren', 'r-00001').treffer).toEqual({
      datei: ada,
      zeile: 0,
      id: 'r-00001',
    });
    // Und sie gilt nicht als eigene Tabelle ihres Namens.
    const eigene = datensatzNachKennung(ada, root, 'Ada Lovelace', 'r-00001');
    expect(eigene.status).toBe('ready');
    expect(eigene.treffer).toBeNull();
  });
});

// --- AK4: Zahl in der Übersicht ----------------------------------------------

describe('Zahl der Karteikarten in der Übersicht (4T-002387, AK4)', () => {
  it('zählt je Kartei-Tabelle ihre Karteikarten', async () => {
    const { root, tabelle, ada } = bereichMitKartei();
    write(root, 'Autoren/Notiz.md', karte());
    await indexFor(ada, root);
    const zahlen = zahlDerKarteikarten(indexes.get(root));
    expect([...zahlen.values()]).toEqual([2]);
    expect(zahlen.size).toBe(1);
    expect(zahlen.has(tabelle) || zahlen.has(tabelle.toLowerCase())).toBe(true);
  });

  it('der Kanal database:overview trägt die Zahl am Eintrag der Kartei-Tabelle', async () => {
    const { root, ada } = bereichMitKartei();
    write(root, 'Orte.md', karteiTabelle({ kartei: false }));
    await indexFor(ada, root);
    const kanaele = new Map();
    registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
      areaRootForEvent: () => root,
      backlinks: {
        ensureIndexForDemand: () => {},
        datenbankSicht: () => ({ status: 'ready', meta: null, sicht: indexes.get(root) }),
        bufferTextFor: () => null,
      },
      isMarkdownPath: (p) => /\.md$/i.test(p),
      datenbankAktiv: () => true,
      schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
    });
    const antwort = await kanaele.get('database:overview')({ sender: { id: 1 } }, {});
    const autoren = antwort.tabellen.find((t) => t.name === 'Autoren');
    const orte = antwort.tabellen.find((t) => t.name === 'Orte');
    expect(autoren.karteikarten).toBe(2);
    expect(orte).toBeDefined();
    expect('karteikarten' in orte).toBe(false);
  });
});
