// 4T-001612 (Epic 3E-000252): Der Verweis auf einen einzelnen Datensatz,
// `[[Tabelle#^r-00042]]`.
//
// Der Funktions-Katalog sagt diese Schreibweise seit dem Epic der
// Tabellen-Definition zu; sie lief bis zu diesem Task als **gebrochener
// Verweis**, weil die Erfassung der Block-Anker Fence-Inhalt ausdrücklich
// überspringt und die Datensatz-Kennung genau dort steht.
//
// **Die tragende Zusage dieser Datei ist, was NICHT passiert.** Die dritte
// Anker-Herkunft darf die beiden bestehenden nicht berühren: Ein Anker in einem
// Code-Beispiel zählt weiterhin nicht, und eine Datei mit Block-Anker UND
// gleichlautender Kennung behält ihr bisheriges Verhalten. Deshalb prüft diese
// Datei die Gegenrichtungen ebenso ausführlich wie den neuen Fall.
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
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require_('../../src/main/index/datensatz-zugriff.js');

// --- Fixtures ---------------------------------------------------------------

const SAETZE = ['|- id="r-00001"', '| K-1', '| Anna', '|- id="r-00002"', '| K-2', '| Bert'];

function tabelle(datensaetze = SAETZE, extra = []) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '  key: Kürzel',
    '---',
    '',
    '# Kundenliste',
    ...extra,
    '',
    '```perspective-records',
    ...datensaetze,
    '```',
    '',
  ].join('\n');
}

// Ein gewöhnliches Dokument, dessen Code-Beispiel wie ein Datensatz aussieht.
// Ohne Marke im Frontmatter bleibt seine Kennung kein Anker — das ist die
// Zusicherung der Block-Anker-Erfassung, und sie darf nicht fallen.
const NUR_BEISPIEL = [
  '---',
  'tags: notiz',
  '---',
  '',
  '# Erklärung',
  '',
  'So sieht ein Datensatz aus:',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| K-1',
  '```',
  '',
].join('\n');

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dsverw-'));
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

// Kurzform: Wie führt die Ziel-Auflösung dieses eine Verweis-Ziel?
function urteil(quelle, ziel) {
  const r = existingWikiTargets(quelle, [ziel]);
  if (r.status !== 'ready') return r.status;
  if (r.existing.includes(ziel)) return 'gültig';
  if (r.brokenAnchor.includes(ziel)) return 'gebrochener Anker';
  return 'kein Treffer';
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

// --- AK1 bis AK3: der neue Fall ---------------------------------------------

describe('Verweis auf einen Datensatz (4T-001612, AK1 bis AK3)', () => {
  it('eine vorhandene Kennung ergibt einen gültigen Verweis', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00002]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^r-00002')).toBe('gültig');
  });

  it('eine nicht vorhandene Kennung bleibt ein gebrochener Verweis', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-09999]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^r-09999')).toBe('gebrochener Anker');
  });

  it('gilt auch, wenn der Datensatz in einem Folge-Segment liegt', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    write(
      root,
      'Kunden•part-00002.md',
      [
        '---',
        'doc-part: v1|2|Kunden',
        'db-fields: Kürzel, Titel',
        '---',
        '|- id="r-00003"',
        '| K-3',
        '| Cara',
        '```',
        '',
      ].join('\n'),
    );
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00003]].');
    await indexFor(quelle);
    // Der Verweis nennt die TABELLE; in welcher Datei der Datensatz steht,
    // beantwortet die Zuordnung und nicht der Verweis.
    expect(urteil(quelle, 'Kunden#^r-00003')).toBe('gültig');
  });

  it('ein Verweis ohne Anker und ein Überschriften-Anker bleiben unberührt', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden]] und [[Kunden#kundenliste]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden')).toBe('gültig');
    expect(urteil(quelle, 'Kunden#kundenliste')).toBe('gültig');
    expect(urteil(quelle, 'Kunden#gibt-es-nicht')).toBe('gebrochener Anker');
  });
});

// --- AK5, AK6: was NICHT passieren darf -------------------------------------

describe('Die beiden bestehenden Anker-Herkünfte (4T-001612, AK5, AK6)', () => {
  it('eine Kennung im Code-Beispiel einer Nicht-Tabelle zählt weiterhin nicht', async () => {
    const root = makeRoot();
    write(root, 'Erklärung.md', NUR_BEISPIEL);
    const quelle = write(root, 'Notiz.md', 'Siehe [[Erklärung#^r-00001]].');
    await indexFor(quelle);
    // Die Zusicherung der Block-Anker-Erfassung: Anker in Code-Beispielen
    // zählen nicht. Sie fällt nicht, weil eine Tabellen-Marke fehlt.
    expect(urteil(quelle, 'Erklärung#^r-00001')).toBe('gebrochener Anker');
  });

  it('ein echter Block-Anker gilt unverändert, in Tabelle wie Notiz', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle(SAETZE, ['', 'Ein Absatz mit Anker. ^merk']));
    write(root, 'Notiz2.md', '# Notiz\n\nEin Absatz. ^frei\n');
    const quelle = write(root, 'Notiz.md', 'x');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^merk')).toBe('gültig');
    expect(urteil(quelle, 'Notiz2#^frei')).toBe('gültig');
  });

  it('Block-Anker und gleichlautende Kennung: das bisherige Verhalten gewinnt', async () => {
    const root = makeRoot();
    // Derselbe Text `r-00001` einmal als echter Block-Anker im Fließtext und
    // einmal als Datensatz-Kennung. Der Block-Anker wird zuerst geprüft; damit
    // kann die neue Herkunft keinen bestehenden Verweis umdeuten.
    write(root, 'Kunden.md', tabelle(SAETZE, ['', 'Ein Absatz. ^r-00001']));
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00001]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^r-00001')).toBe('gültig');
  });

  it('eine Tabellen-Datei ohne die gesuchte Kennung meldet weiterhin gebrochen', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle([]));
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00001]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^r-00001')).toBe('gebrochener Anker');
  });
});

// --- AK7: Rückverweise ------------------------------------------------------

describe('Rückverweise (4T-001612, AK7)', () => {
  it('behandeln den Datensatz-Verweis wie jeden anderen Verweis auf die Datei', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Kunden.md', tabelle());
    write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00002]].');
    const ergebnis = await indexFor(ziel);
    expect(ergebnis.status).toBe('ready');
    const quellen = ergebnis.results.map((r) => path.basename(r.quelldatei));
    expect(quellen).toContain('Notiz.md');
    // Der Anker reist im Treffer mit, wie bei jedem anderen Verweis auch.
    const treffer = ergebnis.results.find((r) => path.basename(r.quelldatei) === 'Notiz.md');
    expect(treffer.hits[0].anker).toBe('^r-00002');
  });
});
