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
const { vergissAlleDefinitionen, ohneVerdeckteFolgeteile } = require_(
  '../../src/main/index/datensatz-erfassung.js',
);
const { isFilesystemCaseInsensitive } = require_('../../src/shared/platform.js');
const { bauZaehler, zwischenspeicherLeeren, tabellenNameVon } = require_(
  '../../src/main/index/datensatz-zugriff.js',
);
const { planeZerlegung } = require_('../../src/shared/document-split.js');
const { assembleParts } = require_('../../src/shared/document-assembly.js');

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

// --- 4T-001927: Schlüssel in der letzten Spalte -------------------------------

describe('Schlüssel in der letzten Spalte (4T-001927, Nebenbefund am Index)', () => {
  // Die Leerzeile zwischen zwei Datensätzen ist der Trennabstand des Formats.
  // Beim Auslegen hängt sie am Text der LETZTEN Zelle des vorderen Datensatzes;
  // zum Wert gehört sie nicht (`zellTexte` in `record-write.js`). Steht der
  // Schlüssel in dieser Spalte, darf er im Index nicht mit dem Umbruch geführt
  // werden, sonst findet ihn der echte Wert nicht.
  it('findet den Datensatz mit dem Wert ohne den Trennabstand', async () => {
    const root = makeRoot();
    const datei = write(
      root,
      'Kunden.md',
      tabelle(
        [
          '|- id="r-00001"',
          '| K-1',
          '| Anna',
          '| Basel',
          '',
          '|- id="r-00002"',
          '| K-2',
          '| Bert',
          '| Bern',
        ],
        { key: 'Ort' },
      ),
    );
    await indexFor(datei);
    const ergebnis = datensatzNachSchluessel(datei, null, 'Kunden', 'Basel');
    expect(ergebnis.status).toBe('ready');
    expect(ergebnis.uneindeutig).toBe(false);
    expect(ergebnis.treffer && ergebnis.treffer.id).toBe('r-00001');
    // Der hintere Datensatz ohne folgende Leerzeile war nie betroffen.
    expect(datensatzNachSchluessel(datei, null, 'Kunden', 'Bern').treffer.id).toBe('r-00002');
  });
});

// --- 4T-002046: geöffnete geteilte Tabelle ------------------------------------

describe('Geöffnete geteilte Tabelle (4T-002046, Nebenbefund aus 4T-002038)', () => {
  // Der Editor hält eine auf mehrere Dateien verteilte Tabelle als EIN
  // zusammengesetztes Dokument unter dem Pfad der Kopf-Datei; eine Folge-Datei
  // hat nie einen eigenen Puffer. Dieser Puffer trägt damit schon alle
  // Datensätze. Die überlagerte Sicht darf die Folge-Dateien der Platte nicht
  // zusätzlich führen, sonst steht jeder Datensatz eines Folgeteils doppelt da.
  const VIERZIG = [];
  for (let i = 1; i <= 40; i++) {
    const nr = String(i).padStart(5, '0');
    VIERZIG.push(`|- id="r-${nr}"`, `| K-${i}`, `| Titel ${i} ${'x'.repeat(60)}`, '| Basel');
  }
  const GESAMT = tabelle(VIERZIG);

  // Zerlegt wird über den Teiler des Speicherns, zusammengesetzt wie beim
  // Öffnen: genau der Text, den der Editor an die Puffer-Schicht meldet.
  function schreibeGeteilt(root) {
    const plan = planeZerlegung({
      text: GESAMT,
      base: 'Kunden',
      schwelle: 1500,
      segmentFelder: ['Kürzel', 'Titel', 'Ort'],
    });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile.length).toBeGreaterThanOrEqual(3);
    const dateien = plan.teile.map((teil) => write(root, `${teil.basename}.md`, teil.text));
    const dokument = assembleParts(
      plan.teile.map((teil) => ({ index: teil.index, content: teil.text })),
    ).text;
    return { kopf: dateien[0], letzteDatei: dateien[dateien.length - 1], dokument };
  }

  const marker = (i) => `|- id="r-${String(i).padStart(5, '0')}"`;

  it('führt jeden Datensatz genau einmal, mit dem Fundort im geöffneten Dokument', async () => {
    const root = makeRoot();
    const { kopf, letzteDatei, dokument } = schreibeGeteilt(root);
    await indexFor(kopf);
    // Vor dem Öffnen: der Datensatz des letzten Teils liegt in seiner Folge-Datei.
    expect(datensatzNachSchluessel(kopf, null, 'Kunden', 'K-40').treffer.datei).toBe(letzteDatei);

    setBufferOverlay(kopf, dokument);
    const zeilen = dokument.split('\n');
    for (let i = 1; i <= 40; i++) {
      const ueberSchluessel = datensatzNachSchluessel(kopf, null, 'Kunden', `K-${i}`);
      expect(ueberSchluessel.uneindeutig, `K-${i}`).toBe(false);
      expect(ueberSchluessel.treffers, `K-${i}`).toHaveLength(1);
      const { treffer } = datensatzNachKennung(
        kopf,
        null,
        'Kunden',
        `r-${String(i).padStart(5, '0')}`,
      );
      // Fundort ist die Kopf-Datei mit der Zeile im zusammengesetzten Text:
      // das Dokument, das der Editor in diesem Moment zeigt.
      expect(treffer.datei, `r-${i}`).toBe(kopf);
      expect(zeilen[treffer.zeile], `r-${i}`).toBe(marker(i));
      expect(ueberSchluessel.treffer).toEqual(treffer);
    }
  });

  it('ein im Puffer gelöschter Datensatz eines Folgeteils ist nicht mehr auffindbar', async () => {
    const root = makeRoot();
    const { kopf, dokument } = schreibeGeteilt(root);
    await indexFor(kopf);
    const ohne40 = dokument.replace(
      `${marker(40)}\n| K-40\n| Titel 40 ${'x'.repeat(60)}\n| Basel\n`,
      '',
    );
    expect(ohne40).not.toContain(marker(40));
    setBufferOverlay(kopf, ohne40);
    // Die Folge-Datei der Platte trägt ihn noch; der geschriebene Stand gilt.
    expect(datensatzNachKennung(kopf, null, 'Kunden', 'r-00040').treffer).toBeNull();
    expect(datensatzNachSchluessel(kopf, null, 'Kunden', 'K-40').treffers).toEqual([]);
    // Die übrigen bleiben erreichbar.
    expect(datensatzNachKennung(kopf, null, 'Kunden', 'r-00039').treffer.datei).toBe(kopf);
  });

  it('nach dem Verwerfen des Puffers gilt wieder die Platte samt Folge-Dateien', async () => {
    const root = makeRoot();
    const { kopf, letzteDatei, dokument } = schreibeGeteilt(root);
    await indexFor(kopf);
    setBufferOverlay(kopf, dokument);
    expect(datensatzNachKennung(kopf, null, 'Kunden', 'r-00040').treffer.datei).toBe(kopf);
    clearAllBufferOverlays();
    expect(datensatzNachKennung(kopf, null, 'Kunden', 'r-00040').treffer.datei).toBe(letzteDatei);
    expect(datensatzNachSchluessel(kopf, null, 'Kunden', 'K-40').uneindeutig).toBe(false);
  });

  it('der Puffer eines anderen Dokuments verdeckt keine Folge-Datei', async () => {
    const root = makeRoot();
    const { kopf, letzteDatei } = schreibeGeteilt(root);
    const notiz = write(root, 'Notiz.md', '# Notiz\n');
    await indexFor(kopf);
    setBufferOverlay(notiz, '# Notiz\n\nungespeichert\n');
    expect(datensatzNachKennung(kopf, null, 'Kunden', 'r-00040').treffer.datei).toBe(letzteDatei);
  });

  it('erkennt die Kopf-Datei unabhängig von Normalform und, wo das Dateisystem es tut, Schreibung', () => {
    const dir = path.join('C:', 'bereich');
    const kopfNfc = path.join(dir, 'Bücher.md');
    const teil = path.join(dir, 'Bücher•part-00002.md');
    const fremd = path.join(dir, 'Andere•part-00002.md');
    const bestand = new Map([
      [kopfNfc, [{ id: 'r-00001' }]],
      [teil, [{ id: 'r-00002' }]],
      [fremd, [{ id: 'r-00003' }]],
    ]);
    // Ohne Puffer einer Kopf-Datei bleibt die Sicht dieselbe.
    expect(ohneVerdeckteFolgeteile(bestand, [teil])).toBe(bestand);
    const pufferPfade = [path.join(dir, 'Bücher.md'.normalize('NFD'))];
    if (isFilesystemCaseInsensitive()) pufferPfade[0] = pufferPfade[0].toUpperCase();
    const sicht = ohneVerdeckteFolgeteile(bestand, pufferPfade);
    expect(sicht.get(teil)).toEqual([]);
    expect(sicht.get(fremd)).toEqual([{ id: 'r-00003' }]);
    expect(sicht.get(kopfNfc)).toEqual([{ id: 'r-00001' }]);
    expect(sicht.size).toBe(3);
    expect(sicht.has(teil)).toBe(true);
    expect([...sicht.keys()]).toEqual([kopfNfc, teil, fremd]);
    expect(new Map([...sicht]).get(teil)).toEqual([]);
  });
});
