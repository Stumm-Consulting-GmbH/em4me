// 4T-0402 (Epic 3E-0076): Integrations-Tests der Perspective-Abfrage gegen den
// echten Backlinks-Index (Temp-Verzeichnis-Fixtures): implizite file.*-Felder
// aus dem Index (Zeiten, Größe, Pfade), FROM-Quellen (Ordner, Tags, Links über
// den Link-Graphen) und der queryError-Pfad der Funktions-Validierung.
// Eigene Datei neben backlinks.test.js (gleiches Setup-/Teardown-Muster),
// damit die Abfrage-Suite unabhängig wächst. 4T-0972 (Datei-Größen-Budget):
// Die Task-Blöcke (TASKS-Scope, Gruppierung, Default-Sortierung,
// Abhängigkeiten, areaTaskLines) liegen seit dem Schnitt in
// perspective-query-tasks.test.js.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
  updateBlockDataForFile,
} from '../../src/main/backlinks.js';

// --- Setup/Teardown (Muster aus backlinks.test.js) ----------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-pq-'));
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

// --- Fixture -------------------------------------------------------------------

// Kleiner Suchraum: Start.md an der Wurzel (aktive Datei), zwei Projekt-Dateien
// (Alpha verlinkt per Wiki-Link auf Beta), eine Notiz mit Markdown-Link auf
// Alpha. Alphas mtime wird künstlich auf 2020 gesetzt (Datums-Vergleiche).
// 4T-0409 (Epic 3E-0077): Alpha und Beta tragen Block-Anker plus .mdd mit
// blockData (Beta zusätzlich einen verwaisten Eintrag), Gamma eine defekte
// .mdd — Fixture für den BLOCKS-Scope.
let start;
let alpha;

function names(res) {
  return res.files.map((f) => f.name);
}

function mddWith(blockData) {
  return JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
}

beforeEach(async () => {
  const root = makeRoot();
  start = write(root, 'Start.md', '# Start\n');
  alpha = write(
    root,
    'Projekte/Alpha.md',
    '---\nprio: 3\ndue: 2026-07-01\n---\n# Alpha\nSiehe [[Beta]].\n\nAufgabe eins. ^a1\n\nAufgabe zwei. ^a2\n',
  );
  write(root, 'Projekte/Beta.md', '---\ntags: [projekt]\nprio: 10\n---\n# Beta\n\nPunkt. ^b1\n');
  write(root, 'Notizen/Gamma.md', '# Gamma\nSiehe [Alpha](../Projekte/Alpha.md).\n');
  write(
    root,
    'Projekte/Alpha.mdd',
    mddWith({
      a1: { values: { status: 'offen', prio: 2 }, updated: '2026-07-01T10:00:00Z' },
      a2: { values: { status: 'erledigt', prio: 9 }, updated: '2026-07-05T10:00:00Z' },
    }),
  );
  write(
    root,
    'Projekte/Beta.mdd',
    mddWith({
      b1: { values: { status: 'offen' }, updated: '2026-07-02T10:00:00Z' },
      weg: { values: { status: 'offen' }, updated: '2026-07-02T10:00:00Z' },
    }),
  );
  // Defekter JSON mit blockData-Substring: Block-Ebene von Gamma ausgesetzt.
  write(root, 'Notizen/Gamma.mdd', '{ "blockData": kaputt');
  fs.utimesSync(alpha, new Date(2020, 0, 1), new Date(2020, 0, 1));
  await indexFor(start);
});

// --- Tests -----------------------------------------------------------------------

describe('perspective-query — Index-Integration (file.*-Felder)', () => {
  it('file.name, file.folder und file.path kommen aus dem Index', async () => {
    expect(names(frontmatterQueryFor(start, 'WHERE file.name = "alpha"'))).toEqual(['Alpha']);
    expect(names(frontmatterQueryFor(start, 'WHERE file.folder = "Projekte"'))).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(names(frontmatterQueryFor(start, 'WHERE file.path = "Notizen/Gamma.md"'))).toEqual([
      'Gamma',
    ]);
  });

  it('nacktes LIST trifft alle Dateien des Suchraums', async () => {
    expect(names(frontmatterQueryFor(start, 'LIST'))).toEqual(['Alpha', 'Beta', 'Gamma', 'Start']);
  });

  it('file.mtime aus dem stat: Datums-Vergleich trifft die alte Datei', async () => {
    expect(names(frontmatterQueryFor(start, 'WHERE file.mtime < date(2021-01-01)'))).toEqual([
      'Alpha',
    ]);
    expect(names(frontmatterQueryFor(start, 'WHERE file.mtime >= date(2021-01-01)'))).toEqual([
      'Beta',
      'Gamma',
      'Start',
    ]);
  });

  it('file.size und file.ctime sind gefüllt', async () => {
    expect(names(frontmatterQueryFor(start, 'WHERE file.size > 0'))).toHaveLength(4);
    // Alle Dateien wurden gerade angelegt: ctime existiert und liegt vor now.
    expect(names(frontmatterQueryFor(start, 'WHERE file.ctime <= date(now)'))).toHaveLength(4);
  });

  it('Zahl-Vergleich über Frontmatter-Properties ist numerisch', async () => {
    // '10' > '5' wäre lexikographisch falsch — numerisch trifft es Beta.
    expect(names(frontmatterQueryFor(start, 'WHERE prio > 5'))).toEqual(['Beta']);
    expect(names(frontmatterQueryFor(start, 'WHERE prio <= 5'))).toEqual(['Alpha']);
  });
});

describe('perspective-query — Index-Integration (FROM-Quellen)', () => {
  it('Ordner- und Tag-Quellen, kombiniert mit Negation', async () => {
    expect(names(frontmatterQueryFor(start, 'FROM "Projekte"'))).toEqual(['Alpha', 'Beta']);
    expect(names(frontmatterQueryFor(start, 'FROM #projekt'))).toEqual(['Beta']);
    expect(names(frontmatterQueryFor(start, 'FROM "Projekte" AND -#projekt'))).toEqual(['Alpha']);
    expect(names(frontmatterQueryFor(start, 'FROM "Notizen" OR #projekt'))).toEqual([
      'Beta',
      'Gamma',
    ]);
  });

  it('Link-Quellen über den Link-Graphen (Wiki- und Markdown-Links)', async () => {
    // Wer verlinkt auf Beta? Alpha (Wiki-Link).
    expect(names(frontmatterQueryFor(start, 'FROM [[Beta]]'))).toEqual(['Alpha']);
    // Wer verlinkt auf Alpha? Gamma (relativer Markdown-Link).
    expect(names(frontmatterQueryFor(start, 'FROM [[Alpha]]'))).toEqual(['Gamma']);
    // Worauf verlinkt Alpha? Beta.
    expect(names(frontmatterQueryFor(start, 'FROM outgoing([[Alpha]])'))).toEqual(['Beta']);
    // Unbekanntes Ziel: leere Treffer-Menge, kein Fehler.
    expect(frontmatterQueryFor(start, 'FROM [[Unbekannt]]').files).toEqual([]);
  });

  // 4T-1070 (Epic 3E-0211): Selbstbezug gegen den echten Index. Träger-Datei
  // ist hier Alpha (eingehend von Gamma, ausgehend auf Beta); sie liegt in
  // einem Unterordner, deshalb läuft die Abfrage über die Bereichs-Wurzel —
  // ohne sie wäre der Suchraum nur der Ordner der Träger-Datei.
  it('Selbstbezugs-Quelle: leerer Wiki-Link und outgoing([[]])', async () => {
    const area = path.dirname(start);
    expect(names(frontmatterQueryFor(alpha, 'FROM [[]]', area))).toEqual(['Gamma']);
    expect(names(frontmatterQueryFor(alpha, 'FROM outgoing([[]])', area))).toEqual(['Beta']);
    // Die Träger-Datei ist nie ihr eigener Treffer (Selbstverlinkung schließt
    // schon der Graph-Aufbau aus).
    expect(names(frontmatterQueryFor(alpha, 'FROM [[]]', area))).not.toContain('Alpha');
    // Träger ohne Links: leere Menge, kein Fehler.
    expect(frontmatterQueryFor(start, 'FROM [[]]', area).files).toEqual([]);
  });

  it('Selbstbezug als Wert-Zugriff über den Index', async () => {
    const area = path.dirname(start);
    // this.prio ist Alphas 3 — Beta (10) fällt heraus.
    expect(names(frontmatterQueryFor(alpha, 'WHERE prio = this.prio', area))).toEqual(['Alpha']);
    // Belegter Anwendungsfall der Referenz-Analyse: wer verlinkt auf mich?
    // Träger ist Beta, Alpha verlinkt darauf.
    const beta = path.join(area, 'Projekte', 'Beta.md');
    expect(
      names(frontmatterQueryFor(beta, 'WHERE contains(file.outlinks, this.file.link)', area)),
    ).toEqual(['Alpha']);
    // Spalten-Ausdruck: derselbe Wert in jeder Zeile.
    const tabelle = frontmatterQueryFor(alpha, 'TABLE this.file.name', area);
    expect(tabelle.table.rows.length).toBeGreaterThan(1);
    expect(tabelle.table.rows.map((r) => r.cells[0])).toEqual(
      tabelle.table.rows.map(() => [{ text: 'Alpha' }]),
    );
  });

  it('ohne Träger-Datei im Index degradiert der Selbstbezug weich', async () => {
    // Pfad im selben Suchraum, aber keine indexierte Datei: kein Fehler,
    // Selbstbezüge sind null und die Selbstbezugs-Quelle liefert leer.
    const area = path.dirname(start);
    const fehlt = path.join(area, 'Fehlt.md');
    const res = frontmatterQueryFor(fehlt, 'FROM [[]]', area);
    expect(res.status).toBe('ready');
    expect(res.queryError).toBeUndefined();
    expect(res.files).toEqual([]);
    expect(frontmatterQueryFor(fehlt, 'WHERE prio = this.prio', area).files).toEqual([]);
  });

  it('Link-Felder in WHERE laufen über denselben Graphen', async () => {
    expect(names(frontmatterQueryFor(start, 'WHERE contains(file.outlinks, "Beta")'))).toEqual([
      'Alpha',
    ]);
    expect(names(frontmatterQueryFor(start, 'WHERE contains(file.inlinks, "Gamma")'))).toEqual([
      'Alpha',
    ]);
    expect(names(frontmatterQueryFor(start, 'WHERE length(file.inlinks) > 0'))).toEqual([
      'Alpha',
      'Beta',
    ]);
  });
});

describe('perspective-query — Index-Integration (SORT/LIMIT, 4T-0403)', () => {
  it('SORT über Properties: fehlende Werte ans Ende, Pfad-Tiebreak', async () => {
    // prio: Beta 10, Alpha 3; Gamma/Start ohne prio -> ans Ende, Pfad-Ordnung.
    expect(names(frontmatterQueryFor(start, 'LIST SORT prio DESC'))).toEqual([
      'Beta',
      'Alpha',
      'Gamma',
      'Start',
    ]);
    expect(names(frontmatterQueryFor(start, 'LIST SORT prio'))).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Start',
    ]);
  });

  it('SORT über Datei-Felder (mtime, name)', async () => {
    // Alpha traegt die kuenstliche 2020er-mtime -> chronologisch zuerst.
    expect(names(frontmatterQueryFor(start, 'LIST SORT file.mtime'))[0]).toBe('Alpha');
    expect(names(frontmatterQueryFor(start, 'LIST SORT file.mtime DESC')).at(-1)).toBe('Alpha');
    expect(names(frontmatterQueryFor(start, 'LIST SORT file.name DESC'))).toEqual([
      'Start',
      'Gamma',
      'Beta',
      'Alpha',
    ]);
  });

  it('LIMIT wirkt nach der Sortierung und auf die Basis-Ordnung', async () => {
    expect(names(frontmatterQueryFor(start, 'LIST SORT prio DESC LIMIT 2'))).toEqual([
      'Beta',
      'Alpha',
    ]);
    expect(names(frontmatterQueryFor(start, 'LIST LIMIT 2'))).toEqual(['Alpha', 'Beta']);
    expect(names(frontmatterQueryFor(start, 'WHERE prio > 0 SORT prio'))).toEqual([
      'Alpha',
      'Beta',
    ]);
  });
});

describe('perspective-query — Index-Integration (TABLE und Zusatzfeld, 4T-0404)', () => {
  it('TABLE liefert Kopfzeilen (Alias/Quelltext) und Zell-Segmente', async () => {
    const res = frontmatterQueryFor(
      start,
      'TABLE prio AS "Priorität", file.folder WHERE prio > 0 SORT prio',
    );
    expect(res.queryType).toBe('table');
    expect(res.table.withoutId).toBe(false);
    expect(res.table.headers).toEqual(['Priorität', 'file.folder']);
    expect(res.table.rows.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    expect(res.table.rows[0].cells).toEqual([[{ text: '3' }], [{ text: 'Projekte' }]]);
    // files bleibt parallel gefuellt (gemeinsamer Leer-/Kompatibilitäts-Pfad).
    expect(res.files.map((f) => f.name)).toEqual(['Alpha', 'Beta']);
  });

  it('TABLE WITHOUT ID setzt das Flag; file.link-Zelle ist ein Link-Segment', async () => {
    const res = frontmatterQueryFor(start, 'TABLE WITHOUT ID file.link WHERE prio > 5');
    expect(res.table.withoutId).toBe(true);
    expect(res.table.rows).toHaveLength(1);
    const seg = res.table.rows[0].cells[0][0];
    expect(seg.link.name).toBe('Beta');
    expect(seg.link.path.toLowerCase().endsWith('beta.md')).toBe(true);
  });

  it('LIST mit Zusatzfeld liefert extra-Segmente je Treffer', async () => {
    const res = frontmatterQueryFor(start, 'LIST prio WHERE prio > 0 SORT prio DESC');
    expect(res.queryType).toBe('list');
    expect(res.files.map((f) => f.name)).toEqual(['Beta', 'Alpha']);
    expect(res.files[0].extra).toEqual([{ text: '10' }]);
    expect(res.files[1].extra).toEqual([{ text: '3' }]);
  });

  it('COLUMNS: layoutColumns bei LIST, Hinweis bei TABLE (4T-0405)', async () => {
    const list = frontmatterQueryFor(start, 'LIST COLUMNS 3');
    expect(list.layoutColumns).toBe(3);
    expect(list.hint).toBeUndefined();
    const table = frontmatterQueryFor(start, 'TABLE prio COLUMNS 3');
    expect(table.layoutColumns).toBeUndefined();
    expect(table.hint).toBe('columnsIgnored');
    const plain = frontmatterQueryFor(start, 'LIST');
    expect(plain.layoutColumns).toBeUndefined();
  });
});

describe('perspective-query — Index-Integration (Fehler-Pfad)', () => {
  it('unbekannte Funktion läuft als queryError durch, ohne zu werfen', async () => {
    const res = frontmatterQueryFor(start, 'WHERE foo(1)');
    expect(res.status).toBe('ready');
    expect(res.files).toEqual([]);
    expect(res.queryError).toMatchObject({ code: 'unknownFunction', name: 'foo' });
  });

  it('falsche Stelligkeit läuft als queryError durch', async () => {
    const res = frontmatterQueryFor(start, 'WHERE contains(tags)');
    expect(res.queryError).toMatchObject({ code: 'functionArity', name: 'contains' });
  });
});

// --- 4T-0409 (Epic 3E-0077): Block-Ebene (BLOCKS-Scope) --------------------------

describe('perspective-query — Block-Ebene (BLOCKS-Scope)', () => {
  it('LIST BLOCKS liefert aktive Block-Treffer als Datei#^anker (verwaiste nicht)', async () => {
    const res = frontmatterQueryFor(start, 'LIST BLOCKS');
    expect(res.status).toBe('ready');
    expect(res.queryType).toBe('list');
    // Betas 'weg'-Eintrag hat keinen Anker im Dokument mehr -> kein Treffer.
    expect(names(res)).toEqual(['Alpha#^a1', 'Alpha#^a2', 'Beta#^b1']);
    expect(res.files[0].anchor).toBe('a1');
    expect(res.files[0].path.toLowerCase().endsWith('alpha.md')).toBe(true);
  });

  it('WHERE: Block-Eigenschaften zuerst, Frontmatter der Traeger-Datei als Rueckfall', async () => {
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE status = "offen"'))).toEqual([
      'Alpha#^a1',
      'Beta#^b1',
    ]);
    // prio: a1=2, a2=9 (Block); b1 erbt Betas Frontmatter-prio 10.
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE prio > 5'))).toEqual([
      'Alpha#^a2',
      'Beta#^b1',
    ]);
    // due steht nur im Frontmatter von Alpha -> beide Alpha-Bloecke erben es.
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE due = "2026-07-01"'))).toEqual([
      'Alpha#^a1',
      'Alpha#^a2',
    ]);
  });

  it('FROM filtert Traeger-Dateien; file.* bleibt nutzbar', async () => {
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS FROM #projekt'))).toEqual(['Beta#^b1']);
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE file.name = "alpha"'))).toEqual([
      'Alpha#^a1',
      'Alpha#^a2',
    ]);
  });

  it('updated als Block-Meta-Feld: Vergleich, SORT und LIMIT', async () => {
    expect(
      names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE updated >= date(2026-07-03)')),
    ).toEqual(['Alpha#^a2']);
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS SORT updated DESC'))).toEqual([
      'Alpha#^a2',
      'Beta#^b1',
      'Alpha#^a1',
    ]);
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS SORT updated DESC LIMIT 1'))).toEqual([
      'Alpha#^a2',
    ]);
  });

  it('TABLE BLOCKS: Ziel-Spalte mit Anker, Zellen aus Block-Eigenschaften', async () => {
    const res = frontmatterQueryFor(
      start,
      'TABLE BLOCKS status, prio WHERE file.name = "alpha" SORT prio',
    );
    expect(res.queryType).toBe('table');
    expect(res.table.headers).toEqual(['status', 'prio']);
    expect(res.table.rows.map((r) => r.name)).toEqual(['Alpha#^a1', 'Alpha#^a2']);
    expect(res.table.rows.map((r) => r.anchor)).toEqual(['a1', 'a2']);
    expect(res.table.rows[0].cells).toEqual([[{ text: 'offen' }], [{ text: '2' }]]);
  });

  it('LIST BLOCKS mit Zusatzfeld liefert extra-Segmente je Block', async () => {
    const res = frontmatterQueryFor(start, 'LIST BLOCKS status WHERE file.name = "alpha"');
    expect(res.files.map((f) => f.extra)).toEqual([[{ text: 'offen' }], [{ text: 'erledigt' }]]);
  });

  it('defekte .mdd setzt nur die Block-Ebene der Datei aus', async () => {
    // Gamma traegt eine defekte .mdd -> keine Gamma-Bloecke, kein Fehler.
    const res = frontmatterQueryFor(start, 'LIST BLOCKS');
    expect(res.queryError).toBeUndefined();
    expect(names(res).some((n) => n.startsWith('Gamma'))).toBe(false);
    // Datei-Abfragen bleiben vollstaendig.
    expect(names(frontmatterQueryFor(start, 'LIST'))).toEqual(['Alpha', 'Beta', 'Gamma', 'Start']);
  });

  it('Invalidierung: updateBlockDataForFile wirkt beim naechsten Abfrage-Lauf (4T-0408)', async () => {
    updateBlockDataForFile(alpha, {
      a1: { values: { status: 'wartend' }, updated: '2026-07-09T08:00:00Z' },
    });
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS WHERE status = "wartend"'))).toEqual([
      'Alpha#^a1',
    ]);
    // a2 ist mit dem neuen Stand nicht mehr vorhanden.
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS'))).toEqual(['Alpha#^a1', 'Beta#^b1']);
    // Leerer Stand entfernt die Block-Ebene der Datei.
    updateBlockDataForFile(alpha, {});
    expect(names(frontmatterQueryFor(start, 'LIST BLOCKS'))).toEqual(['Beta#^b1']);
  });
});

// --- 4T-1071 (Epic 3E-0211): Referenz-Muster «Letzter Kontakt» ----------------

// Story S-0812 AK1 als Ganzes: eine Personen-Notiz gibt die jüngste auf sie
// verlinkende datierte Notiz mit Datum und Tages-Differenz aus. Der Fall baut
// seinen eigenen Suchraum, weil er eine andere Bestands-Form braucht als die
// Fixture oben (datierte Journal-Notizen plus eine undatierte).
describe('perspective-query — Referenz-Muster «Letzter Kontakt» (4T-1071)', () => {
  it('jüngste verlinkende datierte Notiz mit Tages-Differenz', async () => {
    const root = makeRoot();
    const einstieg = write(root, 'Start.md', '# Start\n');
    const person = write(root, 'Personen/Anna Muster.md', '# Anna Muster\n');
    write(root, 'Journal/2026-03-01.md', '# März\nGespräch mit [[Anna Muster]].\n');
    write(root, 'Journal/2026-04-18.md', '# April\nRückruf bei [[Anna Muster]].\n');
    write(root, 'Notizen/Ohne Datum.md', 'Notiz zu [[Anna Muster]].\n');
    await indexFor(einstieg);

    // Ziel-Formulierung aus der Konzept-Stufe; statt date(today) ein festes
    // Datum, damit die Erwartung deterministisch ist (2026-04-18 + 48 Tage).
    const res = frontmatterQueryFor(
      person,
      [
        'TABLE WITHOUT ID',
        '  file.link AS "Notiz",',
        '  file.day + " — " + days(date(2026-06-05) - file.day) + " Tage" AS "Letzter Kontakt"',
        'FROM [[]]',
        'SORT file.day DESC',
        'LIMIT 1',
      ].join('\n'),
      root,
    );

    expect(res.status).toBe('ready');
    expect(res.queryError).toBeUndefined();
    expect(res.table.withoutId).toBe(true);
    expect(res.table.headers).toEqual(['Notiz', 'Letzter Kontakt']);
    expect(res.table.rows).toHaveLength(1);
    const [zeile] = res.table.rows;
    expect(zeile.name).toBe('2026-04-18');
    expect(zeile.cells[0]).toEqual([{ link: { path: zeile.path, name: '2026-04-18' } }]);
    expect(zeile.cells[1]).toEqual([{ text: '2026-04-18 — 48 Tage' }]);
  });

  it('die undatierte Notiz sortiert ans Ende und verdrängt den Treffer nicht', async () => {
    const root = makeRoot();
    const einstieg = write(root, 'Start.md', '# Start\n');
    const person = write(root, 'Personen/Bea Beispiel.md', '# Bea Beispiel\n');
    write(root, 'Notizen/Ohne Datum.md', 'Notiz zu [[Bea Beispiel]].\n');
    write(root, 'Journal/2026-03-01.md', 'Gespräch mit [[Bea Beispiel]].\n');
    await indexFor(einstieg);

    // Ohne SORT sind alle drei Verlinker da; mit SORT DESC und LIMIT 1 bleibt
    // die datierte Notiz übrig, weil fehlende Werte unabhängig von der
    // Richtung ans Ende sortieren.
    expect(names(frontmatterQueryFor(person, 'LIST FROM [[]]', root)).sort()).toEqual([
      '2026-03-01',
      'Ohne Datum',
    ]);
    expect(
      names(frontmatterQueryFor(person, 'LIST FROM [[]] SORT file.day DESC LIMIT 1', root)),
    ).toEqual(['2026-03-01']);
  });
});

// --- 4T-1072 (Epic 3E-0211): Sprach-Bindung der Formatierer -------------------

describe('perspective-query — Sprache der Formatierer (4T-1072)', () => {
  it('die Sprache aus der Anfrage erreicht die Formatierer', async () => {
    const spalte = (lang) =>
      frontmatterQueryFor(
        start,
        'TABLE WITHOUT ID currencyformat(prio, "EUR") WHERE prio >= 1 SORT prio',
        undefined,
        null,
        lang,
      ).table.rows.map((r) => r.cells[0]);
    // Geschütztes Leerzeichen vor dem Zeichen (U+00A0), wie Intl es liefert.
    expect(spalte('de')).toEqual([[{ text: '3,00 €' }], [{ text: '10,00 €' }]]);
    expect(spalte('en')).toEqual([[{ text: '€3.00' }], [{ text: '€10.00' }]]);
  });

  it('ohne Sprach-Angabe bleibt es bei der Laufzeit-Locale statt bei null', async () => {
    const rows = frontmatterQueryFor(
      start,
      'TABLE WITHOUT ID dateformat(file.mtime, "yyyy") WHERE prio >= 6',
    ).table.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[0]).toEqual([{ text: String(new Date().getFullYear()) }]);
  });
});

// --- 4T-1073 (Epic 3E-0211): Link-Listen-Filter über Ordner --------------------

// Der Prüfgegenstand ist der Pfad-Bruch aus Entscheid E8: Die Link-Werte des
// Graphen tragen den absoluten Pfad des Temp-Verzeichnisses, die Ordner-Angabe
// der Abfrage ist wurzel-relativ. Nur gegen den echten Index ist belegbar, dass
// infolder beide Seiten zusammenbringt; im synthetischen Kontext wäre die
// Wurzel gesetzt und der Fall nicht echt.
describe('perspective-query — infolder gegen den echten Link-Graphen (4T-1073)', () => {
  const GTD = '12 Getting Things Done (GTD)';
  let einstieg;
  let wurzel;

  beforeEach(async () => {
    wurzel = makeRoot();
    einstieg = write(wurzel, 'Start.md', '# Start\n');
    // Sammeln verlinkt Umzug (innerhalb des GTD-Ordners).
    write(wurzel, `${GTD}/GTD Sammeln.md`, '# Sammeln\nWeiter zu [[GTD Umzug]].\n');
    // Umzug: Endknoten-Kandidat, hat aber zwei eingehende Links aus GTD.
    write(wurzel, `${GTD}/GTD Umzug.md`, '# Umzug\n');
    // Lesen liegt im Unterordner und verlinkt Umzug ebenfalls.
    write(wurzel, `${GTD}/Projekte/GTD Lesen.md`, '# Lesen\nSiehe [[GTD Umzug]].\n');
    // Der eine Link von außerhalb: Er macht Lesen zum Endknoten der GTD-Sicht,
    // obwohl file.inlinks nicht leer ist — der Unterschied, den die Funktion
    // überhaupt erst herstellt.
    write(wurzel, 'Notizen/Extern.md', '# Extern\nHinweis auf [[GTD Lesen]].\n');
    await indexFor(einstieg);
  });

  const trefferMit = (bedingung) =>
    names(
      frontmatterQueryFor(einstieg, `LIST FROM "${GTD}" WHERE ${bedingung} SORT file.name`, wurzel),
    );

  it('GTD-Endknoten: keine eingehenden Links aus dem Ordner', async () => {
    // Das belegte Muster des Bestands in seiner Ziel-Formulierung.
    expect(trefferMit(`length(infolder(file.inlinks, "${GTD}")) = 0`)).toEqual([
      'GTD Lesen',
      'GTD Sammeln',
    ]);
    // Gegenprobe ohne Ordner-Filter: Lesen fällt heraus, weil es den Link von
    // außerhalb trägt. Genau dieser Unterschied ist der Zweck von infolder.
    expect(trefferMit('length(file.inlinks) = 0')).toEqual(['GTD Sammeln']);
  });

  it('der Unterordner zählt mit, der Ordner selbst ist der weitere Rahmen', async () => {
    // Umzug hat zwei eingehende Links aus GTD (Sammeln oben, Lesen darunter),
    // davon einen aus dem Unterordner.
    expect(trefferMit(`length(infolder(file.inlinks, "${GTD}")) = 2`)).toEqual(['GTD Umzug']);
    expect(trefferMit(`length(infolder(file.inlinks, "${GTD}/Projekte")) = 1`)).toEqual([
      'GTD Umzug',
    ]);
    // Ein Ordner ohne Dateien liefert die leere Teilliste, keinen Fehler.
    expect(trefferMit(`length(infolder(file.inlinks, "${GTD}/Fehlt")) = 0`)).toEqual([
      'GTD Lesen',
      'GTD Sammeln',
      'GTD Umzug',
    ]);
  });

  it('infolder arbeitet auch auf file.outlinks', async () => {
    // Dieselbe Funktion, andere Richtung: der Grund für die Listen-Form statt
    // einer spezialisierten Zähl-Funktion (Entscheid E8, Option A3 verworfen).
    expect(trefferMit(`length(infolder(file.outlinks, "${GTD}")) = 1`)).toEqual([
      'GTD Lesen',
      'GTD Sammeln',
    ]);
  });
});
