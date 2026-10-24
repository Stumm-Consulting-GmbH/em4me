// 4T-002333 (Epic 3E-000264, T2, T3): Die eine Auflösungs-Ordnung eines
// Datensatz-Verweises `[[Tabelle#^…]]`.
//
// Setup-Muster aus `datensatz-verweis.test.js` (Temp-Wurzel, echter Index,
// Warteschleife bis «ready»).
//
// **Die tragenden Zusagen dieser Datei.** Die Reihenfolge ist fest: erst die
// Kennung, lang oder kurz, dann die Anzeige-Form. Ein mehrdeutiger Name ist
// ein benannter Zustand mit allen Fundorten und nie ein stiller Erst-Treffer.
// Der Klick-Weg (`verweisZiel`) antwortet aus derselben Ordnung, lässt einem
// Block-Anker gleichen Namens den Vortritt und gibt bei einem mehrdeutigen
// Namen kein Ziel. Und die Auflösung baut keine zweite Zuordnung neben der,
// aus der `kennungInTabelle` antwortet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  existingWikiTargets,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { bauZaehler, kennungInTabelle, zwischenspeicherLeeren } = require_(
  '../../src/main/index/datensatz-zugriff.js',
);
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { isFilesystemCaseInsensitive } = require_('../../src/shared/platform.js');
const { loeseDatensatzVerweis, istTabellenDatei, verweisZiel } = require_(
  '../../src/main/index/datensatz-verweis-aufloesung.js',
);

// --- Fixtures ---------------------------------------------------------------

// Zwei Datensätze teilen die Anzeige-Form «Anna»; «Solaris» ist zugleich ein
// Block-Anker im Fließtext der Tabelle.
const SAETZE = [
  '|- id="r-00001"',
  '| K-1',
  '| Max Müller',
  '|- id="r-00002"',
  '| K-2',
  '| Anna',
  '|- id="r-00003"',
  '| K-3',
  '| Anna',
  '|- id="r-00042"',
  '| K-42',
  '| Solaris',
];

function tabelle(extra = []) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Name',
    '  key: Kürzel',
    '  display: Name',
    '---',
    '',
    '# Kundenliste',
    ...extra,
    '',
    '```perspective-records',
    ...SAETZE,
    '```',
    '',
  ].join('\n');
}

// Ein Folge-Segment mit einem weiteren Datensatz und dem schließenden Zaun.
const SEGMENT = [
  '---',
  'doc-part: v1|2|Kunden',
  'db-fields: Kürzel, Name',
  '---',
  '|- id="r-00007"',
  '| K-7',
  '| Cara',
  '```',
  '',
].join('\n');

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dsaufl-'));
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
  return indexes.get(rootForActiveFile(activeFile));
}

// Ein Bereich mit Tabelle, Folge-Segment und einer Prosa-Notiz.
async function bereich(extra = []) {
  const root = makeRoot();
  const kopf = write(root, 'Kunden.md', tabelle(extra));
  const segment = write(root, 'Kunden•part-00002.md', SEGMENT);
  const notiz = write(root, 'Notiz.md', '# Notiz\n\nEin Absatz. ^frei\n');
  const entry = await indexFor(notiz);
  return { root, kopf, segment, notiz, entry };
}

afterEach(() => {
  setzeDatensatzErfassung(true);
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
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- Auflösungs-Ordnung -----------------------------------------------------

describe('loeseDatensatzVerweis: Kennung vor Anzeige-Form (4T-002333, T2)', () => {
  it('löst die lange Kennung auf', async () => {
    const { kopf, entry } = await bereich();
    expect(loeseDatensatzVerweis(entry, kopf, 'r-00042')).toEqual({
      status: 'kennung',
      kennung: 'r-00042',
      treffers: ['r-00042'],
    });
  });

  it('löst die Kurzform über die aufgefüllte Form auf', async () => {
    const { kopf, entry } = await bereich();
    expect(loeseDatensatzVerweis(entry, kopf, 'r-42')).toMatchObject({
      status: 'kennung',
      kennung: 'r-00042',
    });
    expect(loeseDatensatzVerweis(entry, kopf, ' r-1 ')).toMatchObject({
      status: 'kennung',
      kennung: 'r-00001',
    });
  });

  it('löst eine eindeutige Anzeige-Form getrimmt und mit Schreibung wie geschrieben auf', async () => {
    const { kopf, entry } = await bereich();
    expect(loeseDatensatzVerweis(entry, kopf, 'Max Müller')).toEqual({
      status: 'anzeige',
      kennung: 'r-00001',
      treffers: ['r-00001'],
    });
    expect(loeseDatensatzVerweis(entry, kopf, '  Max Müller ').kennung).toBe('r-00001');
    // Groß- und Kleinschreibung zählen: Ein anders geschriebener Name trifft nicht.
    expect(loeseDatensatzVerweis(entry, kopf, 'max müller').status).toBe('keiner');
  });

  it('meldet eine mehrdeutige Anzeige-Form mit allen Kennungen und ohne Erst-Treffer', async () => {
    const { kopf, entry } = await bereich();
    expect(loeseDatensatzVerweis(entry, kopf, 'Anna')).toEqual({
      status: 'mehrdeutig',
      kennung: null,
      treffers: ['r-00002', 'r-00003'],
    });
  });

  it('liefert «keiner» für unbekannte Namen, unbekannte Kennungen und leere Anker', async () => {
    const { kopf, notiz, entry } = await bereich();
    for (const anker of ['Niemand', 'r-09999', 'r-0', '', '   ', null, undefined, 42]) {
      expect(loeseDatensatzVerweis(entry, kopf, anker), String(anker)).toEqual({
        status: 'keiner',
        kennung: null,
        treffers: [],
      });
    }
    // Eine Prosa-Datei ist keine Tabelle; auch ein fehlender Eintrag wirft nicht.
    expect(loeseDatensatzVerweis(entry, notiz, 'r-00001').status).toBe('keiner');
    expect(loeseDatensatzVerweis(null, kopf, 'r-00001').status).toBe('keiner');
  });

  it('löst einen Namen außerhalb der Anker-Zeichen nicht als Anzeige-Form auf', async () => {
    const root = makeRoot();
    const kopf = write(
      root,
      'Firmen.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: Name',
        '  key: Name',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Müller & Söhne',
        '|- id="r-00002"',
        '| Meier, Huber (AG)',
        '```',
        '',
      ].join('\n'),
    );
    const entry = await indexFor(kopf);
    // `&` behält der Verweis-Bau nicht als Anker; der Name gälte sonst, ohne
    // dass der Klick ihn erreichte.
    expect(loeseDatensatzVerweis(entry, kopf, 'Müller & Söhne').status).toBe('keiner');
    expect(verweisZiel(entry, kopf, 'Müller & Söhne')).toBeNull();
    // Die erlaubten Satzzeichen tragen; der Kennungs-Zweig bleibt unberührt.
    expect(loeseDatensatzVerweis(entry, kopf, 'Meier, Huber (AG)').kennung).toBe('r-00002');
    expect(loeseDatensatzVerweis(entry, kopf, 'r-1').kennung).toBe('r-00001');
  });

  it('findet einen Datensatz im Folge-Segment, über Kopf und Segment', async () => {
    const { kopf, segment, entry } = await bereich();
    expect(loeseDatensatzVerweis(entry, kopf, 'r-7')).toMatchObject({ kennung: 'r-00007' });
    expect(loeseDatensatzVerweis(entry, kopf, 'Cara')).toMatchObject({
      status: 'anzeige',
      kennung: 'r-00007',
    });
    expect(loeseDatensatzVerweis(entry, segment, 'Max Müller').kennung).toBe('r-00001');
  });

  it('nutzt die Zuordnung von kennungInTabelle mit, ohne zweiten Bau', async () => {
    const { kopf, entry } = await bereich();
    zwischenspeicherLeeren();
    expect(kennungInTabelle(entry, kopf, 'r-42')).toBe(true);
    expect(kennungInTabelle(entry, kopf, 'r-00042')).toBe(true);
    expect(kennungInTabelle(entry, kopf, 'Solaris')).toBe(false);
    loeseDatensatzVerweis(entry, kopf, 'Anna');
    loeseDatensatzVerweis(entry, kopf, 'r-1');
    expect(bauZaehler()).toBe(1);
  });

  it('liefert im Aus-Zustand «keiner» ohne Wurf, und der Verweis gilt wie bisher', async () => {
    const { kopf, notiz, entry } = await bereich();
    setzeDatensatzErfassung(false);
    expect(loeseDatensatzVerweis(entry, kopf, 'r-00042').status).toBe('keiner');
    expect(loeseDatensatzVerweis(entry, kopf, 'Max Müller').status).toBe('keiner');
    expect(verweisZiel(entry, kopf, 'r-00042')).toBeNull();
    // Die Gültigkeit nimmt im Aus-Zustand jeden Datensatz-Anker als bestehend
    // (4T-001761), ohne Hinweis auf einen mehrdeutigen Namen.
    const r = existingWikiTargets(notiz, ['Kunden#^Niemand', 'Kunden#^Anna']);
    expect(r.existing).toEqual(['Kunden#^Niemand', 'Kunden#^Anna']);
    expect(r.ambiguousRecord).toEqual([]);
  });
});

// --- Tabellen-Datei ---------------------------------------------------------

describe('istTabellenDatei (4T-002333)', () => {
  it('erkennt Kopf-Datei und Folge-Segment, nicht aber eine Prosa-Datei', async () => {
    const { kopf, segment, notiz, entry } = await bereich();
    expect(istTabellenDatei(entry, kopf)).toBe(true);
    expect(istTabellenDatei(entry, segment)).toBe(true);
    expect(istTabellenDatei(entry, notiz)).toBe(false);
    expect(istTabellenDatei(entry, '')).toBe(false);
    expect(istTabellenDatei(null, kopf)).toBe(false);
  });
});

// --- Klick-Weg --------------------------------------------------------------

describe('verweisZiel: das Ziel des Klicks in die Maske (4T-002333, T3)', () => {
  it('liefert Kopf-Datei und aufgefüllte Kennung für Kennung, Kurzform und Anzeige-Form', async () => {
    const { kopf, entry } = await bereich();
    const ziel = { tabelle: kopf, kennung: 'r-00001' };
    expect(verweisZiel(entry, kopf, 'r-00001')).toEqual(ziel);
    expect(verweisZiel(entry, kopf, 'r-1')).toEqual(ziel);
    expect(verweisZiel(entry, kopf, 'Max Müller')).toEqual(ziel);
  });

  it('nennt bei einem Ziel im Folge-Segment die Kopf-Datei als Tabelle', async () => {
    const { kopf, segment, entry } = await bereich();
    expect(verweisZiel(entry, segment, 'Cara')).toEqual({ tabelle: kopf, kennung: 'r-00007' });
  });

  it('gibt kein Ziel bei mehrdeutigem Namen, unbekanntem Anker und Prosa-Datei', async () => {
    const { kopf, notiz, entry } = await bereich();
    expect(verweisZiel(entry, kopf, 'Anna')).toBeNull();
    expect(verweisZiel(entry, kopf, 'Niemand')).toBeNull();
    expect(verweisZiel(entry, notiz, 'frei')).toBeNull();
    expect(verweisZiel(entry, kopf, '')).toBeNull();
    expect(verweisZiel(null, kopf, 'r-1')).toBeNull();
  });

  it('lässt einem Block-Anker gleichen Namens den Vortritt (E5.2)', async () => {
    const { kopf, entry } = await bereich(['', 'Ein Absatz über das Buch. ^Solaris']);
    expect(verweisZiel(entry, kopf, 'Solaris')).toBeNull();
    // Die Kennung desselben Datensatzes führt weiterhin in die Maske.
    expect(verweisZiel(entry, kopf, 'r-00042')).toEqual({ tabelle: kopf, kennung: 'r-00042' });
  });

  it.runIf(isFilesystemCaseInsensitive())(
    'findet die Tabelle auch bei abweichender Schreibung des Pfades',
    async () => {
      const { kopf, entry } = await bereich();
      const anders = path.join(path.dirname(kopf), 'kunden.md');
      expect(verweisZiel(entry, anders, 'r-42')).toEqual({ tabelle: kopf, kennung: 'r-00042' });
    },
  );
});
