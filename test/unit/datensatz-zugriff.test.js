// 4T-001611 (Epic 3E-000252): Zugriff auf einen einzelnen Datensatz über seine
// interne Kennung und über seinen fachlichen Schlüssel.
//
// Setup-Muster aus `datensatz-index.test.js`, das die Vorwärts-Zuordnung prüft,
// auf der dieser Zugriff ruht.
//
// **Die tragenden Zusagen dieser Datei sind drei.** Der Geltungsbereich ist die
// **Tabelle**: Zwei Tabellen dürfen dieselbe Kennung führen, und keine darf die
// andere verdrängen. Uneindeutigkeit wird **gemeldet**: Ein doppelter
// Schlüssel-Wert ergibt einen benannten Zustand und nie einen stillen
// Erst-Treffer, denn ein Erst-Treffer verbirgt den Fund und liefert trotzdem ein
// Ergebnis. Und «noch nicht bereit» ist nicht «nicht gefunden»: Ein unfertiger
// Index sagt, warum er nichts liefert, statt eine leere Menge auszugeben.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  datensatzNachKennung,
  datensatzNachSchluessel,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { bauZaehler, zwischenspeicherLeeren, tabellenNameVon } = require_(
  '../../src/main/index/datensatz-zugriff.js',
);

// --- Fixtures ---------------------------------------------------------------

// Eine Tabelle mit einteiligem Schlüssel `Kürzel` und Anzeige-Form `Titel`.
function tabelle(datensaetze, { key = 'Kürzel' } = {}) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '    - name: Ort',
    `  key: ${key}`,
    '  display: Titel',
    '---',
    '',
    '```perspective-records',
    ...datensaetze,
    '```',
    '',
  ].join('\n');
}

const ZWEI = [
  '|- id="r-00001"',
  '| K-1',
  '| Anna',
  '| Basel',
  '|- id="r-00002"',
  '| K-2',
  '| Bert',
  '| Bern',
];

// Ein Folge-Segment derselben Tabelle.
function segment(datensaetze) {
  return [
    '---',
    'doc-part: v1|2|Kunden',
    'db-fields: Kürzel, Titel, Ort',
    '---',
    ...datensaetze,
    '```',
    '',
  ].join('\n');
}

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dszug-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  return result;
}

afterEach(() => {
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
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

// --- AK1 bis AK4: die beiden Zuordnungen ------------------------------------

describe('Zugriff über Kennung und Schlüssel (4T-001611, AK1 bis AK4)', () => {
  it('findet einen Datensatz über seine interne Kennung', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    const { status, treffer } = datensatzNachKennung(datei, null, 'Kunden', 'r-00002');
    expect(status).toBe('ready');
    expect(treffer.datei).toBe(datei);
    expect(treffer.id).toBe('r-00002');
    // Der Fundort zeigt auf die Marker-Zeile des Datensatzes in der Datei.
    expect(tabelle(ZWEI).split('\n')[treffer.zeile]).toBe('|- id="r-00002"');
  });

  it('findet ihn ebenso über seinen fachlichen Schlüssel', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    const { status, treffer, uneindeutig } = datensatzNachSchluessel(datei, null, 'Kunden', 'K-2');
    expect(status).toBe('ready');
    expect(uneindeutig).toBe(false);
    expect(treffer.id).toBe('r-00002');
  });

  it('trägt einen mehrteiligen Schlüssel in der Reihenfolge der Definition', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI, { key: '[Kürzel, Ort]' }));
    await indexFor(datei);
    expect(datensatzNachSchluessel(datei, null, 'Kunden', ['K-1', 'Basel']).treffer.id).toBe(
      'r-00001',
    );
    // Vertauschte Teile sind ein anderer Schlüssel und kein Treffer.
    expect(datensatzNachSchluessel(datei, null, 'Kunden', ['Basel', 'K-1']).treffer).toBeNull();
  });

  it('erreicht einen Datensatz im Folge-Segment wie einen in der Kopf-Datei', async () => {
    const root = makeRoot();
    const kopf = write(root, 'Kunden.md', tabelle(ZWEI));
    const teil = write(
      root,
      'Kunden•part-00002.md',
      segment(['|- id="r-00003"', '| K-3', '| Cara', '| Chur']),
    );
    await indexFor(kopf);
    const ueberKennung = datensatzNachKennung(kopf, null, 'Kunden', 'r-00003');
    expect(ueberKennung.treffer.datei).toBe(teil);
    // Dieselbe Tabelle, obwohl eine andere Datei — der Name kommt vom Grundnamen.
    expect(datensatzNachSchluessel(kopf, null, 'Kunden', 'K-3').treffer.datei).toBe(teil);
  });

  it('zwei Tabellen mit derselben Kennung stören einander nicht (AK4)', async () => {
    const root = makeRoot();
    const kunden = write(root, 'Kunden.md', tabelle(ZWEI));
    const artikel = write(
      root,
      'Artikel.md',
      tabelle(['|- id="r-00001"', '| A-1', '| Schraube', '| Lager']),
    );
    await indexFor(kunden);
    expect(datensatzNachKennung(kunden, null, 'Kunden', 'r-00001').treffer.datei).toBe(kunden);
    expect(datensatzNachKennung(kunden, null, 'Artikel', 'r-00001').treffer.datei).toBe(artikel);
    // Und derselbe Schlüssel-Wert in beiden Tabellen bleibt getrennt.
    expect(datensatzNachSchluessel(kunden, null, 'Artikel', 'K-1').treffer).toBeNull();
  });

  it('der Tabellen-Name ist der des Katalogs, für Kopf-Datei wie Segment', () => {
    expect(tabellenNameVon(path.join('C:', 'x', 'Kunden.md'))).toBe('Kunden');
    expect(tabellenNameVon(path.join('C:', 'x', 'Kunden•part-00007.md'))).toBe('Kunden');
  });
});

// --- AK5, AK6, AK8: die Sonderfälle -----------------------------------------

describe('Sonderfälle des Zugriffs (4T-001611, AK5, AK6, AK8)', () => {
  it('ein doppelter Schlüssel-Wert ergibt einen benannten Uneindeutigkeits-Zustand', async () => {
    const root = makeRoot();
    const datei = write(
      root,
      'Kunden.md',
      tabelle([
        '|- id="r-00001"',
        '| K-1',
        '| Anna',
        '| Basel',
        '|- id="r-00002"',
        '| K-1',
        '| Bert',
        '| Bern',
      ]),
    );
    await indexFor(datei);
    const ergebnis = datensatzNachSchluessel(datei, null, 'Kunden', 'K-1');
    expect(ergebnis.uneindeutig).toBe(true);
    // Kein stiller Erst-Treffer: Er verbärge den Fund und lieferte trotzdem
    // ein Ergebnis, die schlechteste der drei Möglichkeiten.
    expect(ergebnis.treffer).toBeNull();
    expect(ergebnis.treffers.map((t) => t.id)).toEqual(['r-00001', 'r-00002']);
    // Über die Kennung bleiben beide getrennt erreichbar.
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00002').treffer.id).toBe('r-00002');
  });

  it('eine unbekannte Kennung ist eine leere Auskunft und kein Fehler (AK6)', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-09999')).toEqual({
      status: 'ready',
      treffer: null,
    });
    // Ebenso eine Tabelle, die es nicht gibt, und ein leerer Schlüssel.
    expect(datensatzNachKennung(datei, null, 'GibtsNicht', 'r-00001').treffer).toBeNull();
    expect(datensatzNachSchluessel(datei, null, 'Kunden', '').treffer).toBeNull();
  });

  it('ein nicht bereiter Index sagt warum, statt eine leere Menge zu melden (AK8)', () => {
    const root = makeRoot();
    const datei = path.join(root, 'Kunden.md');
    // Ohne vorherigen Aufbau gibt es keinen Eintrag zu dieser Wurzel.
    const ueberKennung = datensatzNachKennung(datei, null, 'Kunden', 'r-00001');
    expect(ueberKennung.status).toBe('unavailable');
    expect(ueberKennung.treffer).toBeNull();
    const ueberSchluessel = datensatzNachSchluessel(datei, null, 'Kunden', 'K-1');
    expect(ueberSchluessel.status).toBe('unavailable');
    expect(ueberSchluessel.uneindeutig).toBe(false);
    // Ohne Datei ebenso — «kein Bezug» ist auch kein leeres Ergebnis.
    expect(datensatzNachKennung(null, null, 'Kunden', 'r-00001').status).toBe('unavailable');
  });

  it('vergleicht Schlüssel-Werte zeichengenau', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    expect(datensatzNachSchluessel(datei, null, 'Kunden', 'K-1').treffer).not.toBeNull();
    // Ein Datenwert ist kein Name: Gross- und Kleinschreibung unterscheiden.
    expect(datensatzNachSchluessel(datei, null, 'Kunden', 'k-1').treffer).toBeNull();
    // Der Tabellen-NAME dagegen ist einer und wird unabhängig davon getroffen.
    expect(datensatzNachKennung(datei, null, 'kunden', 'r-00001').treffer).not.toBeNull();
  });
});

// --- AK7: der ungespeicherte Stand ------------------------------------------

describe('Ungespeicherter Stand (4T-001611, AK7, E25)', () => {
  it('ein noch nicht gespeicherter Datensatz ist erreichbar, ein gelöschter nicht mehr', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00009').treffer).toBeNull();

    setBufferOverlay(datei, tabelle([...ZWEI, '|- id="r-00009"', '| K-9', '| Zoe', '| Zug']));
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00009').treffer.datei).toBe(datei);
    expect(datensatzNachSchluessel(datei, null, 'Kunden', 'K-9').treffer.id).toBe('r-00009');

    // Im Puffer entfernt: sofort wieder unauffindbar, ohne Speichern.
    setBufferOverlay(datei, tabelle(ZWEI));
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00009').treffer).toBeNull();
    // Die Platten-Datensätze bleiben davon unberührt.
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00001').treffer).not.toBeNull();
  });
});

// --- AK9: die Ableitung und ihr Zwischenspeicher -----------------------------

describe('Ableitung statt zweiter Pflege (4T-001611, AK9)', () => {
  it('baut die Zuordnung einmal und danach nicht wieder', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    zwischenspeicherLeeren();

    datensatzNachKennung(datei, null, 'Kunden', 'r-00001');
    expect(bauZaehler()).toBe(1);
    for (let i = 0; i < 20; i++) {
      datensatzNachKennung(datei, null, 'Kunden', 'r-00002');
      datensatzNachSchluessel(datei, null, 'Kunden', 'K-1');
    }
    // Der Nachweis zählt Bauvorgänge und nicht Laufzeit: Bei einer Handvoll
    // Testdateien wäre eine Zeitmessung ohne Aussage. Die Messung über echte
    // Größenordnungen steht im Lösungs-Kapitel des Tasks.
    expect(bauZaehler()).toBe(1);
  });

  it('ein geänderter Puffer-Stand baut sie neu', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle(ZWEI));
    await indexFor(datei);
    zwischenspeicherLeeren();

    datensatzNachKennung(datei, null, 'Kunden', 'r-00001');
    expect(bauZaehler()).toBe(1);
    setBufferOverlay(datei, tabelle([...ZWEI, '|- id="r-00009"', '| K-9', '| Zoe', '| Zug']));
    datensatzNachKennung(datei, null, 'Kunden', 'r-00009');
    expect(bauZaehler()).toBe(2);
  });
});
