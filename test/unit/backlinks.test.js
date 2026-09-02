// 4T-000168: Unit-Tests fuer src/main/backlinks.js ueber die oeffentliche API
// mit Temp-Verzeichnis-Fixtures (Muster siehe test/README.md).
//
// Teardown-Muster: backlinksFor() baut den Index auf (refCount 1, Watcher).
// releaseRoot() startet nur den 60-s-Soft-Timer; ein sofortiges Teardown
// bietet die Modul-API nicht. Der Test feuert den Timer deshalb per
// Fake-Timer-Advance, damit watcher.close() synchron im Test laeuft und
// keine Watcher offen bleiben.
//
// Regressionstests fuer die 4T-000175-Fixes sind im hinteren Teil der Datei
// gebuendelt (Befund-IDs in den describe-Titeln).
// Bewusste Auslassung: Watcher-abhaengige Index-Updates (awaitWriteFinish
// 200 ms + Debounce) bleiben als Integrations-Luecke dokumentiert, nicht
// flakefrei unit-testbar — das gilt auch fuer B-11 (Lesefehler beim
// Change-Event), dessen Schutzlogik ein Watcher-Event voraussetzt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  tagsFor,
  frontmatterQueryFor,
  existingWikiTargets,
  releaseRoot,
  releaseAllForOwner,
  resolveWikiTargetInIndex,
  rootForActiveFile,
  wikiLinkAutocompleteSuggestions,
  anchorAutocompleteSuggestions,
} from '../../src/main/backlinks.js';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bl-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Baut den Index fuer die aktive Datei auf und merkt die Wurzel fuer
// Teardown. B-14 (4T-000181): der Aufbau ist asynchron — der erste Aufruf
// liefert 'indexing'; hier wird bis zum Endzustand (ready/oversized)
// gepollt, weil die Tests den fertigen Index pruefen.
async function indexFor(activeFile, ownerKey) {
  let result = backlinksFor(activeFile, ownerKey);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey);
  }
  return result;
}

afterEach(() => {
  // Soft-Timer sofort feuern, damit teardownIndex den Watcher schliesst.
  vi.useFakeTimers();
  for (const root of openRoots) {
    releaseRoot(root);
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();

  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// --- Tests ------------------------------------------------------------------

describe('backlinks.js — Index-Aufbau und Link-Varianten', () => {
  it('erfasst Wiki-Links, Labels, Anker, Markdown-Links und Embeds mit Zeile und Snippet', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '# Ziel\n');
    write(
      root,
      'quelle.md',
      [
        'Siehe [[Ziel]] hier.', // Z. 1: wiki
        'Auch [[Ziel|Mit Label]].', // Z. 2: wiki mit Label
        'Anker: [[Ziel#Abschnitt]].', // Z. 3: wiki mit Anker
        'Md: [Link](Ziel.md)', // Z. 4: md-Link
        'MdAnker: [Link](Ziel.md#a)', // Z. 5: md-Link mit Anker
        'Embed: ![[Ziel]]', // Z. 6: Embed zaehlt als Referenz
      ].join('\n'),
    );

    const res = await indexFor(ziel);
    expect(res.status).toBe('ready');
    expect(res.meta.fileCount).toBe(2);
    expect(res.results).toHaveLength(1);

    const { quelldatei, hits } = res.results[0];
    expect(path.basename(quelldatei)).toBe('quelle.md');
    expect(hits.map((h) => h.zeile)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hits.map((h) => h.linkTyp)).toEqual(['wiki', 'wiki', 'wiki', 'md', 'md', 'wiki']);
    expect(hits[2].anker).toBe('Abschnitt');
    expect(hits[4].anker).toBe('a');
    expect(hits[0].snippet).toBe('Siehe [[Ziel]] hier.');
    expect(hits[0].viaAlias).toBeNull();
  });

  it('indexiert Links im Frontmatter nicht', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'nurfm.md', '---\nnotiz: "[[Ziel]]"\n---\nBody ohne Link.\n');

    const res = await indexFor(ziel);
    expect(res.status).toBe('ready');
    expect(res.results).toHaveLength(0);
  });
});

describe('backlinks.js — Frontmatter-Aliases', () => {
  it('liefert Alias-Backlinks mit viaAlias', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '---\naliases: [MV, Zweitname]\n---\n# Ziel\n');
    write(root, 'quelle.md', 'Verweis auf [[MV]] per Alias.\n');

    const res = await indexFor(ziel);
    expect(res.status).toBe('ready');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].viaAlias).toBe('MV');
  });
});

describe('backlinks.js — Tag-Index', () => {
  it('zaehlt Inline- und Frontmatter-Tags und filtert Maskierungs-Ausschluesse', async () => {
    const root = makeRoot();
    const a = write(
      root,
      'a.md',
      [
        'Text mit #alpha und #shared.',
        'Kein Tag: #fff #1234 `#imcode`.',
        '```',
        '#imfence',
        '```',
      ].join('\n'),
    );
    write(root, 'b.md', '---\ntags: [gamma]\n---\nBody mit #beta und #shared.\n');

    await indexFor(a); // tagsFor nutzt nur einen vorhandenen Index
    const res = tagsFor(a);
    expect(res.status).toBe('ready');

    const byTag = Object.fromEntries(res.tags.map((t) => [t.tag, t.count]));
    expect(byTag).toEqual({ alpha: 1, beta: 1, gamma: 1, shared: 2 });
    // Sortierung: Haeufigkeit absteigend, dann alphabetisch.
    expect(res.tags.map((t) => t.tag)).toEqual(['shared', 'alpha', 'beta', 'gamma']);

    const filtered = tagsFor(a, 'shared');
    expect(filtered.files.map((f) => path.basename(f))).toEqual(['a.md', 'b.md']);
  });
});

describe('backlinks.js — Anker-Erfassung (Headings und Block-IDs)', () => {
  it('prueft Heading-Slugs und Block-Anker ueber existingWikiTargets', async () => {
    const root = makeRoot();
    write(root, 'Ziel.md', '# Ziel\n\n## Mein Abschnitt\n\nAbsatz mit Anker. ^block1\n');
    const quelle = write(root, 'quelle.md', 'Link auf [[Ziel]].\n');

    await indexFor(quelle);
    const res = existingWikiTargets(quelle, [
      'Ziel',
      'Ziel#Mein Abschnitt',
      'Ziel#^block1',
      'Ziel#Fehlt',
      'Ziel#^fehlt',
      'GibtEsNicht',
    ]);
    expect(res.status).toBe('ready');
    expect(res.existing).toEqual(['Ziel', 'Ziel#Mein Abschnitt', 'Ziel#^block1']);
    expect(res.brokenAnchor).toEqual(['Ziel#Fehlt', 'Ziel#^fehlt']);
    // 'GibtEsNicht' taucht in keiner Liste auf (broken-link-Fall des Linters).
  });
});

describe('backlinks.js — Scan-Tiefe', () => {
  it('erfasst Wurzel + 2 Ebenen, Ebene 3 nicht', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Tief.md', '# Tief\n');
    write(root, 'e1/q1.md', 'Ebene 1: [[Tief]]\n');
    write(root, 'e1/e2/q2.md', 'Ebene 2: [[Tief]]\n');
    write(root, 'e1/e2/e3/q3.md', 'Ebene 3: [[Tief]]\n');

    const res = await indexFor(ziel);
    expect(res.status).toBe('ready');
    const quellen = res.results.map((r) => path.basename(r.quelldatei)).sort();
    expect(quellen).toEqual(['q1.md', 'q2.md']);
  });
});

describe('backlinks.js — Caps-Verhalten', () => {
  // 4T-000287 (Nebenbefund): explizites Timeout — die 2001 Datei-Anlagen
  // brauchen unter Voll-Suite-Parallellast (alle Worker gleichzeitig auf
  // dem Datenträger) reproduzierbar mehr als die 5-s-Default-Grenze,
  // isoliert läuft der Test in unter 3 s.
  it(
    'meldet oversized bei Ueberschreiten von MAX_FILES (2000)',
    { timeout: BESTAND_ZEITLIMIT },
    async () => {
      const root = makeRoot();
      // 2001 Dateien: die Cap-Pruefung schlaegt beim Ueberschreiten an.
      for (let i = 0; i <= 2000; i++) {
        fs.writeFileSync(path.join(root, `f${i}.md`), `# ${i}\n`, 'utf8');
      }
      const res = await indexFor(path.join(root, 'f0.md'));
      expect(res.status).toBe('oversized');
      expect(res.meta.fileCount).toBeGreaterThan(2000);
    },
  );
});

// === Regressionstests 4T-000181 ===============================================

describe('B-14: Asynchroner Index-Aufbau blockiert den Prozess nicht', () => {
  // 4T-000287 (Nebenbefund): explizites Timeout wie beim Caps-Test — die
  // 500 Datei-Anlagen plus Index-Lauf überschreiten unter Parallellast
  // gelegentlich die 5-s-Default-Grenze.
  it(
    'backlinksFor liefert sofort indexing und ist danach vollstaendig',
    { timeout: BESTAND_ZEITLIMIT },
    async () => {
      const root = makeRoot();
      // 500-Dateien-Fixture; f0 verweist auf das Ziel.
      fs.writeFileSync(path.join(root, 'Ziel.md'), '# Ziel\n', 'utf8');
      for (let i = 0; i < 500; i++) {
        fs.writeFileSync(path.join(root, `f${i}.md`), `# ${i}\n\nText [[Ziel]] mehr.\n`, 'utf8');
      }
      const t0 = Date.now();
      const first = backlinksFor(path.join(root, 'Ziel.md'), 'b14:0');
      const elapsed = Date.now() - t0;
      openRoots.add(rootForActiveFile(path.join(root, 'Ziel.md')));
      // Der synchrone Anteil des Requests bleibt unter der 50-ms-Schwelle
      // (vorher fror der Scan+Parse den Main-Prozess komplett ein).
      expect(first.status).toBe('indexing');
      expect(elapsed).toBeLessThan(50);

      const ready = await indexFor(path.join(root, 'Ziel.md'), 'b14:0');
      expect(ready.status).toBe('ready');
      expect(ready.results).toHaveLength(500);
    },
  );
});

describe('B-16: Tag-Display-Casing aus der Index-Pflege', () => {
  it('behaelt das erste gesehene Casing', async () => {
    const root = makeRoot();
    const a = write(root, 'a.md', 'Text #ProJekt\n');
    write(root, 'b.md', 'Text #projekt\n');
    await indexFor(a);
    const res = tagsFor(a);
    expect(res.tags).toHaveLength(1);
    expect(res.tags[0].count).toBe(2);
    expect(res.tags[0].tag.toLowerCase()).toBe('projekt');
  });
});

// === Regressionstests 4T-000175 ===============================================

describe('B-01/B-02: Owner-Modell des Index-Lifecycles', () => {
  it('Mehrfach-Requests desselben Owners leaken nicht; Release baut ab', async () => {
    const root = makeRoot();
    const file = write(root, 'a.md', '# A\n#tagx\n');
    // Dreimal derselbe Owner — zaehlt als EINE Referenz.
    await indexFor(file, '7:0');
    backlinksFor(file, '7:0');
    backlinksFor(file, '7:0');
    expect(tagsFor(file).status).toBe('ready');

    vi.useFakeTimers();
    releaseRoot(rootForActiveFile(file), '7:0');
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    // Index ist abgebaut: tagsFor findet keinen Eintrag mehr.
    expect(tagsFor(file).status).toBe('unavailable');
  });

  it('releaseAllForOwner gibt alle Panes eines Fensters frei', async () => {
    const root = makeRoot();
    const file = write(root, 'a.md', '# A\n');
    await indexFor(file, '9:0');
    backlinksFor(file, '9:1');
    expect(tagsFor(file).status).toBe('ready');

    vi.useFakeTimers();
    releaseAllForOwner(9);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    expect(tagsFor(file).status).toBe('unavailable');
  });
});

describe('B-04/B-23: Case-insensitive Wiki-Aufloesung', () => {
  it('[[readme]] trifft README.md (Backlink, Linter, Index-Resolver)', async () => {
    const root = makeRoot();
    const ziel = write(root, 'README.md', '# Readme\n');
    const quelle = write(root, 'quelle.md', 'Siehe [[readme]] und [[KÖLN]].\n');
    write(root, 'Köln.md', '# K\n');

    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    const lint = existingWikiTargets(quelle, ['readme', 'KÖLN']);
    expect(lint.existing).toEqual(['readme', 'KÖLN']);
    const idx = resolveWikiTargetInIndex(quelle, 'readme');
    expect(idx.status).toBe('ready');
    expect(idx.candidates.map((f) => path.basename(f))).toEqual(['README.md']);
  });
});

describe('B-05: %-kodierte Markdown-Link-Ziele', () => {
  it('[Text](Mein%20Ziel.md) erzeugt einen Backlink', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Mein Ziel.md', '# Ziel\n');
    write(root, 'quelle.md', 'Link: [Text](Mein%20Ziel.md)\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].linkTyp).toBe('md');
  });
});

// 4T-000476 (Epic 3E-000088): CommonMark-Destination in spitzen Klammern
// ([Text](<Mein Ziel.md>)) erlaubt Leerzeichen im Ziel. Der Backlinks-Index
// liest Ziel/Anker ueber mdLinkTargetFromMatch und muss die <…>-Form aufloesen;
// ein rohes Leerzeichen ohne Klammern ist dagegen kein gueltiges CommonMark-Ziel.
describe('4T-000476: <…>-Destination mit Leerzeichen im Ziel', () => {
  it('[Text](<Meine Notiz.md>) erzeugt einen Backlink auf die Datei', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Meine Notiz.md', '# Notiz\n');
    write(root, 'quelle.md', 'Link: [Text](<Meine Notiz.md>)\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].linkTyp).toBe('md');
  });

  it('[Text](<Mein%20Ziel.md>) wird innerhalb der Klammern dekodiert aufgeloest', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Mein Ziel.md', '# Ziel\n');
    write(root, 'quelle.md', 'Link: [Text](<Mein%20Ziel.md>)\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].linkTyp).toBe('md');
  });

  it('[Text](Meine Notiz.md) mit rohem Leerzeichen ohne Klammern erzeugt KEINEN Link', async () => {
    // CommonMark-konform: ein unkodiertes Leerzeichen bricht das klammerlose
    // Ziel ab, der Index findet keinen Markdown-Link.
    const root = makeRoot();
    const ziel = write(root, 'Meine Notiz.md', '# Notiz\n');
    write(root, 'quelle.md', 'Kein Link: [Text](Meine Notiz.md)\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(0);
  });

  it('[Text](<Meine Notiz.md#abschnitt>) traegt den Anker mit', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Meine Notiz.md', '# Notiz\n\n## Abschnitt\n');
    write(root, 'quelle.md', 'Link: [Text](<Meine Notiz.md#abschnitt>)\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].anker).toBe('abschnitt');
  });
});

describe('B-06: Block-Anker auf eigener Zeile', () => {
  it('^id als einziger Zeileninhalt wird indexiert', async () => {
    const root = makeRoot();
    write(root, 'Ziel.md', '# Ziel\n\nAbsatz.\n\n^solo\n');
    const quelle = write(root, 'quelle.md', '[[Ziel]]\n');
    await indexFor(quelle);
    const res = existingWikiTargets(quelle, ['Ziel#^solo']);
    expect(res.existing).toEqual(['Ziel#^solo']);
  });
});

describe('B-07: Links in Inline-Code', () => {
  it('`[[Ziel]]` im Code-Span erzeugt keinen Backlink', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'quelle.md', 'Beispiel: `[[Ziel]]` und `[Link](Ziel.md)`.\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(0);
  });
});

describe('B-08: [[#Heading]] ist kein Tag', () => {
  it('Wiki-Anker-Links tauchen nicht im Tag-Index auf', async () => {
    const root = makeRoot();
    const a = write(root, 'a.md', 'Springe zu [[#Abschnitt]] und [[Ziel#Teil]]. Echt: #echt\n');
    await indexFor(a);
    const res = tagsFor(a);
    expect(res.tags.map((t) => t.tag)).toEqual(['echt']);
  });
});

describe('B-09: Escapte Pipe in Tabellen-Wiki-Links', () => {
  it('[[Ziel\\|Label]] erzeugt einen Backlink auf Ziel', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'tabelle.md', '| Spalte |\n|---|\n| [[Ziel\\|Label]] |\n');
    const res = await indexFor(ziel);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].linkTyp).toBe('wiki');
  });
});

describe('B-10: Anker-Index wie der Renderer', () => {
  it('dedupliziert Slug-Duplikate mit -1-Suffix', async () => {
    const root = makeRoot();
    write(root, 'Ziel.md', '# Ziel\n\n## Doppelt\n\nText.\n\n## Doppelt\n');
    const quelle = write(root, 'quelle.md', '[[Ziel]]\n');
    await indexFor(quelle);
    const res = existingWikiTargets(quelle, ['Ziel#Doppelt', 'Ziel#doppelt-1', 'Ziel#doppelt-2']);
    expect(res.existing).toEqual(['Ziel#Doppelt', 'Ziel#doppelt-1']);
    expect(res.brokenAnchor).toEqual(['Ziel#doppelt-2']);
  });

  it('erkennt Setext-Headings und reduziert Link-Syntax im Heading', async () => {
    const root = makeRoot();
    write(root, 'Ziel.md', 'Setext Titel\n===\n\n## Mit [[Anders|Label]] drin\n');
    const quelle = write(root, 'quelle.md', '[[Ziel]]\n');
    await indexFor(quelle);
    const res = existingWikiTargets(quelle, ['Ziel#Setext Titel', 'Ziel#Mit Label drin']);
    expect(res.existing).toEqual(['Ziel#Setext Titel', 'Ziel#Mit Label drin']);
  });
});

// === Unterseiten (4T-000336, Epic 3E-000061) =====================================

describe('4T-000336: Unterseiten-Aufloesung (U+2215) und relative Links', () => {
  const SEP = '∕'; // U+2215

  it('[[A/B]] loest auf die Unterseiten-Datei A∕B.md auf (Index, Linter, Backlinks)', async () => {
    const root = makeRoot();
    const ziel = write(root, `Prozess-A${SEP}Entwurf.md`, '# Entwurf\n');
    const quelle = write(root, 'quelle.md', 'Siehe [[Prozess-A/Entwurf]].\n');

    const res = await indexFor(ziel);
    expect(res.status).toBe('ready');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].linkTyp).toBe('wiki');

    const lint = existingWikiTargets(quelle, ['Prozess-A/Entwurf']);
    expect(lint.existing).toEqual(['Prozess-A/Entwurf']);
    expect(lint.ambiguous).toEqual([]);

    const idx = resolveWikiTargetInIndex(quelle, 'Prozess-A/Entwurf');
    expect(idx.candidates).toEqual([ziel]);
  });

  it('gleichnamige Unterseiten verschiedener Eltern bleiben getrennt aufloesbar', async () => {
    const root = makeRoot();
    const a = write(root, `A${SEP}Entwurf.md`, '# A-Entwurf\n');
    const b = write(root, `B${SEP}Entwurf.md`, '# B-Entwurf\n');
    const quelle = write(root, 'quelle.md', '[[A/Entwurf]] und [[B/Entwurf]]\n');

    await indexFor(quelle);
    expect(resolveWikiTargetInIndex(quelle, 'A/Entwurf').candidates).toEqual([a]);
    expect(resolveWikiTargetInIndex(quelle, 'B/Entwurf').candidates).toEqual([b]);
  });

  it('relative Links: [[/Name]] zeigt auf die eigene Unterseite, [[..]] auf die Eltern-Seite', async () => {
    const root = makeRoot();
    const eltern = write(root, 'Prozess-A.md', 'Vorlage: [[/Entwurf]]\n');
    const kind = write(root, `Prozess-A${SEP}Entwurf.md`, 'Zurueck: [[..]]\n');

    // Backlink der Unterseite: [[/Entwurf]] aus der Eltern-Datei.
    const resKind = await indexFor(kind);
    expect(resKind.results).toHaveLength(1);
    expect(path.basename(resKind.results[0].quelldatei)).toBe('Prozess-A.md');

    // Backlink der Eltern-Seite: [[..]] aus der Unterseite.
    const resEltern = await indexFor(eltern);
    const quellen = resEltern.results.map((r) => path.basename(r.quelldatei));
    expect(quellen).toContain(`Prozess-A${SEP}Entwurf.md`);

    // Linter: beide Formen gelten als existing, gegen die jeweils aktive Datei.
    expect(existingWikiTargets(eltern, ['/Entwurf']).existing).toEqual(['/Entwurf']);
    expect(existingWikiTargets(kind, ['..']).existing).toEqual(['..']);
    // '..' auf Top-Level bleibt broken (weder existing noch brokenAnchor).
    const top = existingWikiTargets(eltern, ['..']);
    expect(top.existing).toEqual([]);
    expect(top.brokenAnchor).toEqual([]);
  });

  it('meldet mehrdeutige Ziele, wenn Ordner-Pfad- und Unterseiten-Form kollidieren', async () => {
    const root = makeRoot();
    write(root, 'A/B.md', '# Ordner-Form\n');
    write(root, `A${SEP}B.md`, '# Unterseiten-Form\n');
    const quelle = write(root, 'quelle.md', '[[A/B]]\n');

    await indexFor(quelle);
    const lint = existingWikiTargets(quelle, ['A/B']);
    expect(lint.ambiguous).toEqual(['A/B']);
    expect(lint.existing).toEqual([]);
    // Klick-Aufloesung: Ordner-Pfad-Form hat Vorrang (Epic-Entscheidung).
    const idx = resolveWikiTargetInIndex(quelle, 'A/B');
    expect(idx.candidates.map((f) => path.basename(f))).toEqual(['B.md']);
  });

  it('Unterseiten in Unterordnern des Suchraums werden gefunden', async () => {
    const root = makeRoot();
    const ziel = write(root, `sub/Prozess-A${SEP}Entwurf.md`, '# Entwurf\n');
    const quelle = write(root, 'quelle.md', '[[Prozess-A/Entwurf]]\n');
    await indexFor(quelle);
    expect(resolveWikiTargetInIndex(quelle, 'Prozess-A/Entwurf').candidates).toEqual([ziel]);
  });

  // 4T-000337: Autocomplete-Paritaet.
  it('Autocomplete-Vorschlaege zeigen Unterseiten in Slash-Schreibweise', async () => {
    const root = makeRoot();
    const quelle = write(root, 'Prozess-A.md', '# A\n');
    write(root, `Prozess-A${SEP}Entwurf.md`, '# Entwurf\n');
    await indexFor(quelle);
    const res = wikiLinkAutocompleteSuggestions(quelle);
    expect(res.status).toBe('ready');
    const names = res.suggestions.filter((s) => s.kind === 'file').map((s) => s.name);
    expect(names).toContain('Prozess-A/Entwurf');
    expect(names.some((n) => n.includes(SEP))).toBe(false);
  });

  // 4T-001307 (Epic 3E-000235): Die Vorschlaege tragen die Aenderungszeit ihrer
  // Datei, damit der Renderer die zuletzt bearbeiteten zuerst anbieten kann.
  it('Autocomplete-Vorschlaege tragen die Aenderungszeit ihrer Datei', async () => {
    const root = makeRoot();
    const alt = write(root, 'Alt.md', '# Alt\n');
    const neu = write(root, 'Neu.md', '# Neu\n');
    // Feste Zeiten statt Schreib-Reihenfolge: Auf schnellen Dateisystemen
    // liegen zwei unmittelbar aufeinander folgende Schreibvorgaenge sonst auf
    // derselben Millisekunde, und der Test waere nicht aussagekraeftig.
    const sek = (n) => new Date(n * 1000);
    fs.utimesSync(alt, sek(1_000_000), sek(1_000_000));
    fs.utimesSync(neu, sek(2_000_000), sek(2_000_000));
    await indexFor(alt);
    const res = wikiLinkAutocompleteSuggestions(alt);
    expect(res.status).toBe('ready');
    const zeitVon = (name) => res.suggestions.find((s) => s.name === name).mtimeMs;
    expect(zeitVon('Alt')).toBe(1_000_000_000);
    expect(zeitVon('Neu')).toBe(2_000_000_000);
    expect(zeitVon('Neu')).toBeGreaterThan(zeitVon('Alt'));
  });

  // 4T-001307: Waehrend des Aufbaus bleibt die Liste stumm statt leer — der
  // Renderer unterdrueckt das Dropdown dann, statt "keine Treffer" zu zeigen.
  it('Autocomplete meldet waehrend des Index-Aufbaus indexing statt einer leeren Liste', async () => {
    const root = makeRoot();
    const quelle = write(root, 'Quelle.md', '# Quelle\n');
    write(root, 'Ziel.md', '# Ziel\n');
    backlinksFor(quelle);
    openRoots.add(rootForActiveFile(quelle));
    const waehrend = wikiLinkAutocompleteSuggestions(quelle);
    expect(waehrend.status).toBe('indexing');
    expect(waehrend.suggestions).toEqual([]);
    await indexFor(quelle);
  });

  it('Ein Zweitname erbt die Aenderungszeit seiner Ziel-Datei', async () => {
    const root = makeRoot();
    const quelle = write(root, 'Quelle.md', '# Quelle\n');
    const ziel = write(root, 'Ziel.md', '---\naliases:\n  - Deckname\n---\n\n# Ziel\n');
    const sek = (n) => new Date(n * 1000);
    fs.utimesSync(ziel, sek(3_000_000), sek(3_000_000));
    await indexFor(quelle);
    const res = wikiLinkAutocompleteSuggestions(quelle);
    const zweitname = res.suggestions.find((s) => s.kind === 'alias' && s.name === 'Deckname');
    expect(zweitname).toBeTruthy();
    expect(zweitname.mtimeMs).toBe(3_000_000_000);
  });

  it('Anker-Autocomplete funktioniert fuer Slash-Form und relative Formen', async () => {
    const root = makeRoot();
    const eltern = write(root, 'Prozess-A.md', '# A\n\n## Oben\n');
    const kind = write(root, `Prozess-A${SEP}Entwurf.md`, '# Entwurf\n\n## Abschnitt\n');
    await indexFor(eltern);
    expect(
      anchorAutocompleteSuggestions(eltern, 'Prozess-A/Entwurf', 'heading').suggestions,
    ).toEqual(['abschnitt', 'entwurf']);
    expect(anchorAutocompleteSuggestions(eltern, '/Entwurf', 'heading').suggestions).toEqual([
      'abschnitt',
      'entwurf',
    ]);
    expect(anchorAutocompleteSuggestions(kind, '..', 'heading').suggestions).toEqual(['a', 'oben']);
  });
});

describe('B-13: Pfad-Ziele und Index-Klick-Fallback', () => {
  it('[[sub/Tief]] matcht per Pfad-Suffix; Resolver liefert den Kandidaten', async () => {
    const root = makeRoot();
    const ziel = write(root, 'sub/Tief.md', '# Tief\n');
    const quelle = write(root, 'quelle.md', 'Pfad-Form: [[sub/Tief]]\n');
    // Index ueber die Wurzel der Quelle (erfasst sub/ in Tiefe 1).
    await indexFor(quelle);

    // Vorher: Basename-Vergleich 'sub/Tief' !== 'Tief' — Linter meldete
    // broken, obwohl der dokument-relative Klick die Datei oeffnete.
    const lint = existingWikiTargets(quelle, ['sub/Tief']);
    expect(lint.existing).toEqual(['sub/Tief']);

    // Klick-Fallback-Resolver (neu): liefert den Suchraum-Kandidaten.
    const idx = resolveWikiTargetInIndex(quelle, 'sub/Tief');
    expect(idx.status).toBe('ready');
    expect(idx.candidates).toEqual([ziel]);
    // Und der umgekehrte Befund-Fall: Basename-Treffer irgendwo im
    // Suchraum ist ueber den Resolver klickbar (Treffer mit Navigation).
    const idx2 = resolveWikiTargetInIndex(quelle, 'Tief');
    expect(idx2.candidates).toEqual([ziel]);
  });
});

// 4T-000347 (Epic 3E-000062): Bereichsweiter Index. Fuer Dateien in einer Bereichs-
// Applikation ist die Wurzel der Bereichs-Wurzelordner (voller Baum, keine
// Tiefen-Grenze, keine Caps) statt des Ordners der aktiven Datei plus
// SCAN_DEPTH. Der areaRoot-Parameter kommt in der App vom IPC-Handler.
describe('backlinks.js — Bereichsweiter Index (4T-000347)', () => {
  // Poll-Variante mit Bereichs-Wurzel. Ohne ownerKey, damit das Standard-
  // Teardown im afterEach (releaseRoot ohne Key -> Soft-Timer) greift.
  async function indexForArea(activeFile, areaRoot) {
    let result = backlinksFor(activeFile, undefined, areaRoot);
    openRoots.add(rootForActiveFile(activeFile, areaRoot));
    for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      result = backlinksFor(activeFile, undefined, areaRoot);
    }
    return result;
  }

  it('waehlt die Bereichs-Wurzel im Bereich, sonst den Datei-Ordner', () => {
    const root = makeRoot();
    const tief = write(root, 'a/b/c/D.md', '# D\n');
    // Ohne Bereich: Ordner der Datei.
    expect(rootForActiveFile(tief)).toBe(path.dirname(tief));
    // Mit Bereich: Bereichs-Wurzel, unabhaengig von der Datei-Tiefe.
    expect(rootForActiveFile(tief, root)).toBe(path.resolve(root));
    // Bereich gesetzt, Datei ausserhalb -> zurueck auf den Datei-Ordner.
    const outside = makeRoot();
    const o = write(outside, 'X.md', '# X\n');
    expect(rootForActiveFile(o, root)).toBe(path.dirname(o));
  });

  it('erfasst im Bereich Quellen aus hoeher gelegenen Ordnern, bereichslos nicht', async () => {
    const root = makeRoot();
    // Ziel liegt tief (jenseits SCAN_DEPTH=2), Quelle in der Bereichs-Wurzel.
    const ziel = write(root, 'a/b/c/Ziel.md', '# Ziel\n');
    write(root, 'Quelle.md', 'Verweis auf [[Ziel]]\n');

    // Mit Bereich: voller Baum, die hoeher gelegene Quelle wird gefunden.
    const withArea = await indexForArea(ziel, root);
    expect(withArea.status).toBe('ready');
    expect(withArea.results.map((r) => path.basename(r.quelldatei))).toContain('Quelle.md');

    // Ohne Bereich: Wurzel = Ordner der Datei (a/b/c); die Quelle liegt
    // oberhalb des Suchraums und bleibt unsichtbar.
    const noArea = await indexForArea(ziel, null);
    expect(noArea.status).toBe('ready');
    expect(noArea.results.map((r) => path.basename(r.quelldatei))).not.toContain('Quelle.md');
  });

  it('wertet eine bestehende bereichslose Wurzel bei Bereichs-Anfrage auf (Upgrade)', async () => {
    const root = makeRoot();
    write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'Flach.md', 'Verweis [[Ziel]]\n'); // in der Wurzel (Tiefe 0)
    write(root, 'a/b/c/Tief.md', 'Verweis [[Ziel]]\n'); // jenseits SCAN_DEPTH
    const zielPath = path.join(root, 'Ziel.md');

    // Erst bereichslos: Wurzel = root, aber nur SCAN_DEPTH -> Tief fehlt.
    const flat = await indexForArea(zielPath, null);
    expect(flat.status).toBe('ready');
    let sources = flat.results.map((r) => path.basename(r.quelldatei));
    expect(sources).toContain('Flach.md');
    expect(sources).not.toContain('Tief.md');

    // Dieselbe Wurzel als Bereich angefragt -> Upgrade auf den vollen Baum.
    const upgraded = await indexForArea(zielPath, root);
    expect(upgraded.status).toBe('ready');
    sources = upgraded.results.map((r) => path.basename(r.quelldatei));
    expect(sources).toContain('Flach.md');
    expect(sources).toContain('Tief.md');
  });
});

describe('backlinks.js — Frontmatter-Abfrage (4T-000354)', () => {
  // Legt einen kleinen Suchraum an und baut den Index auf. frontmatterQueryFor
  // liest wie tagsFor nur den fertigen Index (kein eigener Scan).
  async function buildRoot(files) {
    const root = makeRoot();
    let first = null;
    for (const [rel, content] of Object.entries(files)) {
      const p = write(root, rel, content);
      if (!first) first = p;
    }
    await indexFor(first);
    return first;
  }

  it('wertet Wert-, Listen- und Negations-Abfragen über den Index aus', async () => {
    const a = await buildRoot({
      'Alpha.md': '---\nbereich: Privat\ntags: [rot, rund]\nstatus: offen\n---\n# Alpha\n',
      'Beta.md': '---\nbereich: Beruflich\ntags: [blau]\n---\n# Beta\n',
      'Gamma.md': '---\nbereich: Privat\ntags: [gelb]\nalias: Müller\n---\n# Gamma\n',
      'Delta.md': '# Delta ganz ohne Frontmatter\n',
    });

    // Skalar-Gleichheit: Privat trifft Alpha und Gamma.
    const r1 = frontmatterQueryFor(a, 'bereich = "Privat"');
    expect(r1.status).toBe('ready');
    expect(r1.files.map((f) => f.name)).toEqual(['Alpha', 'Gamma']);
    // Rückgabe trägt logischen Namen und Pfad.
    expect(r1.files.every((f) => f.name && f.path && f.path.endsWith('.md'))).toBe(true);

    // Listen-Feld mit IN: rot (Alpha) und blau (Beta).
    const r2 = frontmatterQueryFor(a, 'tags IN ("rot", "blau")');
    expect(r2.files.map((f) => f.name)).toEqual(['Alpha', 'Beta']);

    // Boolescher Ausdruck mit Negation: Privat, aber nicht Alias Müller -> nur Alpha.
    const r3 = frontmatterQueryFor(a, 'bereich = "Privat" AND NOT alias = "Müller"');
    expect(r3.files.map((f) => f.name)).toEqual(['Alpha']);

    // Ungleichheit schließt Dateien ohne das Feld ein: Beta und Delta.
    const r4 = frontmatterQueryFor(a, 'bereich != "Privat"');
    expect(r4.files.map((f) => f.name)).toEqual(['Beta', 'Delta']);
  });

  it('überspringt verschachtelte Objekte und defektes YAML (nicht abfragbar)', async () => {
    const a = await buildRoot({
      'Nested.md': '---\nmeta:\n  a: 1\nbereich: Privat\n---\n# Nested\n',
      'Broken.md': '---\nbereich: [unbalanced\n---\n# Broken\n',
    });

    // Verschachteltes Objekt ist kein abfragbarer Skalar.
    expect(frontmatterQueryFor(a, 'meta = "1"').files).toEqual([]);
    // Skalar neben dem Objekt bleibt abfragbar.
    expect(frontmatterQueryFor(a, 'bereich = "Privat"').files.map((f) => f.name)).toEqual([
      'Nested',
    ]);
    // Eine nicht passende Wert-Abfrage trifft nichts (auch Broken nicht, dessen
    // defektes YAML keine abfragbaren Properties liefert).
    expect(frontmatterQueryFor(a, 'bereich = "irgendwas"').files).toEqual([]);
    // Broken hat kein abfragbares bereich -> die Ungleichheit trifft es.
    expect(frontmatterQueryFor(a, 'bereich != "Privat"').files.map((f) => f.name)).toContain(
      'Broken',
    );
  });

  it('reicht einen Query-Syntaxfehler als queryError durch, ohne zu werfen', async () => {
    const a = await buildRoot({ 'Alpha.md': '---\nbereich: Privat\n---\n# Alpha\n' });
    const res = frontmatterQueryFor(a, 'bereich =');
    expect(res.status).toBe('ready');
    expect(res.files).toEqual([]);
    expect(res.queryError).toBeTruthy();
    expect(res.queryError.code).toBe('expectedValue');
  });

  it('meldet unavailable ohne aufgebauten Index', () => {
    const root = makeRoot();
    const p = write(root, 'Ohne.md', '# ohne Index\n');
    // Kein indexFor -> kein Eintrag in der Index-Map.
    expect(frontmatterQueryFor(p, 'a = "1"').status).toBe('unavailable');
  });
});
