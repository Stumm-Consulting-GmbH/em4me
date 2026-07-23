// 4T-0402 (Epic 3E-0076): Integrations-Tests der Perspective-Abfrage gegen den
// echten Backlinks-Index (Temp-Verzeichnis-Fixtures): implizite file.*-Felder
// aus dem Index (Zeiten, Größe, Pfade), FROM-Quellen (Ordner, Tags, Links über
// den Link-Graphen) und der queryError-Pfad der Funktions-Validierung.
// Eigene Datei neben backlinks.test.js (gleiches Setup-/Teardown-Muster),
// damit die Abfrage-Suite unabhängig wächst.
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
  // 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen-Lesepfad des Erinnerungs-Pruefers.
  areaTaskLines,
} from '../../src/main/backlinks.js';
// 4T-0502 (Epic 3E-0096): Status-Typ-Resolver (Task-Umgebung) und Marker-Kern
// (Beschreibungen aus dem taskText der Treffer) fuer die TASKS-Scope-Tests.
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';
import { parseTaskLine } from '../../src/shared/task-markers.js';

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

// --- 4T-0502 (Epic 3E-0096): Task-Ebene (TASKS-Scope) --------------------------
// Eigene Fixture (kein Bezug zur Block-Fixture oben): zwei Task-Dateien mit
// Checkbox-Zeilen unter Ueberschriften, eine davon mit einer Task-Zeile in
// einem Fenced-Code-Block (darf nicht zaehlen). Datums-Werte in 2099 (Stabilitaet).
describe('perspective-query — Task-Ebene (TASKS-Scope)', () => {
  const DUE = '\u{1F4C5}'; // Kalender (faellig)
  const HIGH = '\u{1F53A}'; // rotes Dreieck (Prioritaet hoechste)

  // Task-Umgebung wie der IPC-Handler: Erweiterung aktiv, Status-Typ-Resolver
  // aus dem Default-Set; globalFilter je Test.
  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: over.globalFilter || '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  // Erstes Wort der Beschreibung als stabiler Schluessel (der Marker-Kern
  // laesst nachlaufende Nicht-Marker wie Inline-Tags in der Beschreibung; die
  // Termin-/Prioritaets-Marker stehen am Zeilenende und werden abgetrennt).
  function taskKeys(res) {
    return res.files.map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
  }

  let taskStart;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    // Inline-Tag #task steht VOR den End-Markern (Termin/Prioritaet), damit die
    // Marker am Zeilenende geparst werden und der Tag Teil der Beschreibung ist.
    write(
      root,
      'Aufgaben.md',
      [
        '# Projekt',
        '',
        '## Planung',
        '',
        `- [ ] Konzept schreiben #task ${DUE} 2099-01-01 ${HIGH}`,
        `- [x] Kickoff halten #task ${DUE} 2020-06-01`,
        `- [ ] Ohne Filter ${DUE} 2099-05-01`,
        '',
        '## Umsetzung',
        '',
        `- [ ] Modul bauen #task ${DUE} 2099-03-01`,
        `- [/] Review offen #task ${DUE} 2099-02-01`,
        '',
      ].join('\n'),
    );
    write(
      root,
      'Sonstiges.md',
      [
        '# Sonstiges',
        '',
        `- [ ] Notiz erledigen #task ${DUE} 2099-04-01`,
        '',
        '```text',
        `- [ ] Codeblock-Aufgabe #task ${DUE} 2099-09-09`,
        '```',
        '',
      ].join('\n'),
    );
    await indexFor(taskStart);
  });

  it('LIST TASKS: Treffer mit line/taskText, queryScope und Default-Sortierung', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(res.status).toBe('ready');
    expect(res.queryScope).toBe('tasks');
    // 4T-0505: Default-Sortierung Status-Typ -> Dringlichkeit (absteigend) ->
    // Faelligkeit -> Prioritaet -> Pfad -> Zeile. Review (IN_PROGRESS) zuerst;
    // innerhalb TODO Konzept (highest, urgency 11.4), dann die normalen 2099er
    // nach Faelligkeit (Modul 03 < Notiz 04 < Ohne 05); Kickoff (DONE) zuletzt.
    expect(taskKeys(res)).toEqual(['Review', 'Konzept', 'Modul', 'Notiz', 'Ohne', 'Kickoff']);
    // Jeder Treffer traegt Zeilennummer und Roh-Zeile.
    expect(res.files.every((f) => typeof f.line === 'number' && f.line > 0)).toBe(true);
    expect(res.files[0].taskText).toContain('Review offen');
    expect(res.files[0].name).toBe('Aufgaben');
  });

  it('Fenced-Code-Task-Zeilen zaehlen nicht', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(res.files.some((f) => f.taskText.includes('Codeblock'))).toBe(false);
  });

  it('WHERE ueber Termin-Feld: due <= date(...)', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE due <= date(2099-02-15)',
      undefined,
      env(),
    );
    expect(taskKeys(res).sort()).toEqual(['Kickoff', 'Konzept', 'Review']);
  });

  it('WHERE ueber status.type (Resolver: TODO/DONE/IN_PROGRESS)', () => {
    const todo = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE status.type = "TODO"',
      undefined,
      env(),
    );
    expect(taskKeys(todo).sort()).toEqual(['Konzept', 'Modul', 'Notiz', 'Ohne']);
    const done = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE status.type = "DONE"',
      undefined,
      env(),
    );
    expect(taskKeys(done)).toEqual(['Kickoff']);
    const inProg = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE status.type = "IN_PROGRESS"',
      undefined,
      env(),
    );
    expect(taskKeys(inProg)).toEqual(['Review']);
  });

  it('WHERE ueber heading (Text der umgebenden Ueberschrift)', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE heading = "Umsetzung"',
      undefined,
      env(),
    );
    // 4T-0505: Default-Sortierung — Review (IN_PROGRESS) vor Modul (TODO).
    expect(taskKeys(res)).toEqual(['Review', 'Modul']);
  });

  it('WHERE ueber tags (Inline-Tags der Beschreibung)', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE contains(tags, "task")',
      undefined,
      env(),
    );
    // Alle mit #task, also alle ausser 'Ohne Filter'.
    expect(taskKeys(res).includes('Ohne')).toBe(false);
    expect(taskKeys(res)).toHaveLength(5);
  });

  it('Global Filter filtert Zeilen ohne den Filter-String aus', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS',
      undefined,
      env({ globalFilter: '#task' }),
    );
    // 'Ohne Filter' traegt kein #task -> faellt raus. 4T-0505: die Restmenge
    // folgt der Default-Sortierung (Review IP, dann TODO nach Dringlichkeit/
    // Faelligkeit, Kickoff DONE zuletzt).
    expect(taskKeys(res)).toEqual(['Review', 'Konzept', 'Modul', 'Notiz', 'Kickoff']);
  });

  it('deaktivierte Erweiterung: queryError tasksScopeDisabled, leere Liste', () => {
    const off = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env({ enabled: false }));
    expect(off.status).toBe('ready');
    expect(off.files).toEqual([]);
    expect(off.queryError).toMatchObject({ code: 'tasksScopeDisabled' });
    // Ohne taskEnv (nicht durchgereicht) verhaelt es sich wie deaktiviert.
    const none = frontmatterQueryFor(taskStart, 'LIST TASKS');
    expect(none.queryError).toMatchObject({ code: 'tasksScopeDisabled' });
  });
});

// --- 4T-0503 (Epic 3E-0096): GROUP BY und Task-Layout (LIST TASKS) -------------
// Eigene Fixture mit voller Kontrolle ueber Ueberschriften, Prioritaet und eine
// Task-Zeile OHNE Ueberschrift (vor jeder Heading -> heading null), damit die
// Wert-lose Gruppe (label null) am Ende deterministisch pruefbar ist. Datums-
// Werte in 2099 (Stabilitaet).
describe('perspective-query — Gruppierung und Task-Layout (TASKS-Scope, 4T-0503)', () => {
  const DUE = '\u{1F4C5}'; // Kalender (faellig)
  const HIGH = '\u{1F53A}'; // rotes Dreieck (Prioritaet hoechste)

  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: over.globalFilter || '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  // Erstes Wort der Beschreibung eines Treffers als stabiler Schluessel.
  function itemKeys(items) {
    return items.map((h) => parseTaskLine(h.taskText).description.trim().split(/\s+/)[0]);
  }

  let taskStart;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    // 'Wurzel' steht vor jeder Ueberschrift (heading null); die A-Aufgaben unter
    // '## Alpha' (zwei mit hoechster Prioritaet), 'B-eins' unter '## Beta'.
    write(
      root,
      'Aufgaben.md',
      [
        `- [ ] Wurzel ${DUE} 2099-06-01`,
        '',
        '# Projekt',
        '',
        '## Alpha',
        '',
        `- [ ] A-spaet ${DUE} 2099-02-01 ${HIGH}`,
        `- [ ] A-frueh ${DUE} 2099-01-01 ${HIGH}`,
        `- [ ] A-normal ${DUE} 2099-03-01`,
        '',
        '## Beta',
        '',
        `- [ ] B-eins ${DUE} 2099-05-01`,
        '',
      ].join('\n'),
    );
    await indexFor(taskStart);
  });

  it('GROUP BY bzw. HIDE/SHOW/SHORT ausserhalb LIST TASKS: eigene queryError-Codes, leere Liste', () => {
    // GROUP BY nur bei LIST TASKS -> groupByTasksOnly (Datei- und Tabellen-Scope).
    const grpFiles = frontmatterQueryFor(taskStart, 'LIST GROUP BY heading', undefined, env());
    expect(grpFiles.status).toBe('ready');
    expect(grpFiles.files).toEqual([]);
    expect(grpFiles.queryError).toMatchObject({ code: 'groupByTasksOnly' });
    const grpTable = frontmatterQueryFor(
      taskStart,
      'TABLE TASKS GROUP BY heading',
      undefined,
      env(),
    );
    expect(grpTable.queryError).toMatchObject({ code: 'groupByTasksOnly' });
    // HIDE/SHOW/SHORT nur bei LIST TASKS -> layoutTasksOnly.
    const hideFiles = frontmatterQueryFor(taskStart, 'LIST HIDE due', undefined, env());
    expect(hideFiles.queryError).toMatchObject({ code: 'layoutTasksOnly' });
    const shortTable = frontmatterQueryFor(taskStart, 'TABLE TASKS SHORT', undefined, env());
    expect(shortTable.queryError).toMatchObject({ code: 'layoutTasksOnly' });
  });

  it('LIST TASKS ohne Gruppierung: totalCount und taskLayout im Payload', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(res.status).toBe('ready');
    // Fuenf Task-Zeilen der Fixture (Wurzel + drei Alpha + eine Beta).
    expect(res.totalCount).toBe(5);
    expect(res.files).toHaveLength(5);
    expect(res.groups).toBeUndefined();
    expect(res.taskLayout).toEqual({ hide: [], show: [], short: false });
    // HIDE/SHORT reichen die geparsten Layout-Optionen durch.
    const lay = frontmatterQueryFor(taskStart, 'LIST TASKS HIDE due SHORT', undefined, env());
    expect(lay.taskLayout).toEqual({ hide: ['due'], show: [], short: true });
  });

  it('einstufige Gruppierung nach heading: Gruppen-Reihenfolge, items, null-Gruppe zuletzt', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS GROUP BY heading', undefined, env());
    expect(res.status).toBe('ready');
    // Bei Gruppierung liegen die Treffer in groups, files bleibt leer.
    expect(res.files).toEqual([]);
    // Werte-Ordnung locale-bewusst (Alpha < Beta), Wert-lose Gruppe (label null)
    // als letzte.
    expect(res.groups.map((g) => g.label)).toEqual(['Alpha', 'Beta', null]);
    // 4T-0505: items-Reihenfolge folgt der Default-Sortierung der Pipeline —
    // A-frueh und A-spaet (beide highest) vor A-normal, bei gleicher
    // Dringlichkeit die fruehere Faelligkeit zuerst (A-frueh 01 < A-spaet 02).
    expect(itemKeys(res.groups[0].items)).toEqual(['A-frueh', 'A-spaet', 'A-normal']);
    expect(itemKeys(res.groups[1].items)).toEqual(['B-eins']);
    expect(itemKeys(res.groups[2].items)).toEqual(['Wurzel']);
    // Treffer tragen die Task-Trefferform (name/path/line/taskText).
    const hit = res.groups[0].items[0];
    expect(hit.name).toBe('Aufgaben');
    expect(typeof hit.line).toBe('number');
    expect(hit.taskText).toContain('A-frueh');
  });

  it('SORT wirkt innerhalb der Gruppen', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS GROUP BY heading SORT due',
      undefined,
      env(),
    );
    // Alpha nach Termin aufsteigend: frueh (01) < spaet (02) < normal (03).
    expect(itemKeys(res.groups[0].items)).toEqual(['A-frueh', 'A-spaet', 'A-normal']);
  });

  it('zweistufige Gruppierung nach heading, priority', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS GROUP BY heading, priority',
      undefined,
      env(),
    );
    // Aeussere Ebene wie einstufig: Alpha, Beta, null.
    expect(res.groups.map((g) => g.label)).toEqual(['Alpha', 'Beta', null]);
    // Alpha traegt Untergruppen (keine direkten items).
    const alpha = res.groups[0];
    expect(alpha.items).toBeUndefined();
    expect(Array.isArray(alpha.groups)).toBe(true);
    const subLabels = alpha.groups.map((g) => g.label);
    // Zwei Prioritaets-Untergruppen: hoechste (zwei A-Aufgaben) und normal (eine).
    expect(subLabels).toContain('highest');
    expect(subLabels).toContain('normal');
    const highest = alpha.groups.find((g) => g.label === 'highest');
    expect(itemKeys(highest.items).sort()).toEqual(['A-frueh', 'A-spaet']);
    const normal = alpha.groups.find((g) => g.label === 'normal');
    expect(itemKeys(normal.items)).toEqual(['A-normal']);
  });
});

// --- 4T-0505 (Epic 3E-0096): Default-Sortierung, urgency-Feld, globale Abfrage --
// Eigene Fixture mit gemischten Status-Typen (IN_PROGRESS/TODO/DONE), Prioritaeten
// und Faelligkeiten. Termine bewusst in 2099 (Zukunft, Faelligkeits-Komponente
// stabil +2.4) bzw. 2020 (Vergangenheit, +12.0), damit der reale Bezugstag des
// Index-Laufs (Date.now) die erwartete Ordnung nicht verschiebt. Aufgaben.md
// traegt das Frontmatter-Tag 'arbeit' (FROM-Quelle der globalen Abfrage),
// Sonstiges.md nicht.
describe('perspective-query — Default-Sortierung, urgency, globale Abfrage (4T-0505)', () => {
  const DUE = '\u{1F4C5}'; // Kalender (faellig)
  const HIGHEST = '\u{1F53A}'; // rotes Dreieck (Prioritaet hoechste)
  const LOWEST = '\u{23EC}'; // Doppelpfeil nach unten (Prioritaet niedrigste)

  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: over.globalFilter || '',
      globalQuery: over.globalQuery || '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  function taskKeys(res) {
    return res.files.map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
  }

  let taskStart;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    // urgency (bei realem Bezugstag): Laufend/Frueh/Spaet/Extern 1.95+2.4=4.35;
    // Wichtig 9.0+2.4=11.4; Unwichtig -1.8+2.4=0.6; Fertig 1.95+12.0=13.95.
    write(
      root,
      'Aufgaben.md',
      [
        '---',
        'tags: [arbeit]',
        '---',
        '# Aufgaben',
        '',
        `- [/] Laufend ${DUE} 2099-06-01`,
        `- [ ] Wichtig ${DUE} 2099-01-01 ${HIGHEST}`,
        `- [ ] Frueh ${DUE} 2099-02-01`,
        `- [ ] Spaet ${DUE} 2099-03-01`,
        `- [ ] Unwichtig ${DUE} 2099-04-01 ${LOWEST}`,
        `- [x] Fertig ${DUE} 2020-01-01`,
        '',
      ].join('\n'),
    );
    write(
      root,
      'Sonstiges.md',
      ['# Sonstiges', '', `- [ ] Extern ${DUE} 2099-07-01`, ''].join('\n'),
    );
    await indexFor(taskStart);
  });

  it('Default-Sortierung: Status-Typ (IN_PROGRESS<TODO<DONE), dann Dringlichkeit, dann Faelligkeit', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(res.status).toBe('ready');
    // Laufend (IP) zuerst; TODO nach Dringlichkeit absteigend (Wichtig 11.4),
    // dann die gleich-dringlichen 4.35er nach Faelligkeit (Frueh 02 < Spaet 03 <
    // Extern 07), Unwichtig (0.6) am TODO-Ende; Fertig (DONE) ganz zuletzt.
    expect(taskKeys(res)).toEqual([
      'Laufend',
      'Wichtig',
      'Frueh',
      'Spaet',
      'Extern',
      'Unwichtig',
      'Fertig',
    ]);
  });

  it('WHERE urgency > X filtert ueber den vorberechneten Score', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS WHERE urgency > 5', undefined, env());
    // Nur Wichtig (11.4) und Fertig (13.95); Default-Ordnung TODO vor DONE.
    expect(taskKeys(res)).toEqual(['Wichtig', 'Fertig']);
  });

  it('SORT urgency ASC ueberschreibt die Default-Sortierung', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS SORT urgency ASC', undefined, env());
    const keys = taskKeys(res);
    // Aufsteigend: geringste Dringlichkeit (Unwichtig 0.6) zuerst, hoechste
    // (Fertig 13.95) zuletzt — anders als der Default (Laufend zuerst).
    expect(keys[0]).toBe('Unwichtig');
    expect(keys.at(-1)).toBe('Fertig');
    expect(keys[0]).not.toBe('Laufend');
    // urgency ist ueber die Treffer nicht fallend.
    const scores = res.files.map((f) => f.urgency);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });

  it('Treffer tragen urgency als gerundete Zahl', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(res.files.every((f) => typeof f.urgency === 'number')).toBe(true);
    const byKey = Object.fromEntries(
      res.files.map((f) => [parseTaskLine(f.taskText).description.trim(), f.urgency]),
    );
    expect(byKey.Wichtig).toBeCloseTo(11.4, 2);
    expect(byKey.Unwichtig).toBeCloseTo(0.6, 2);
    expect(byKey.Fertig).toBeCloseTo(13.95, 2);
  });

  it('globale Abfrage (WHERE status.type) wird als zusaetzliches WHERE vorgeschaltet', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS',
      undefined,
      env({
        globalQuery: 'WHERE status.type = "TODO"',
      }),
    );
    // Nur TODO-Zeilen bleiben (Laufend IP und Fertig DONE fallen raus).
    expect(taskKeys(res)).toEqual(['Wichtig', 'Frueh', 'Spaet', 'Extern', 'Unwichtig']);
  });

  it('globale Abfrage mit FROM #tag beschraenkt die Traeger-Dateien', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS',
      undefined,
      env({
        globalQuery: 'FROM #arbeit',
      }),
    );
    // Nur Aufgaben.md traegt das Tag 'arbeit' -> Extern (Sonstiges.md) faellt raus.
    expect(taskKeys(res).includes('Extern')).toBe(false);
    expect(taskKeys(res)).toEqual(['Laufend', 'Wichtig', 'Frueh', 'Spaet', 'Unwichtig', 'Fertig']);
  });

  it('globale Abfrage mit unzulaessiger Klausel (SORT) -> queryError globalQueryInvalid', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS',
      undefined,
      env({
        globalQuery: 'LIST TASKS SORT due',
      }),
    );
    expect(res.status).toBe('ready');
    expect(res.files).toEqual([]);
    expect(res.queryError).toMatchObject({ code: 'globalQueryInvalid' });
  });

  it('globale Abfrage mit Syntaxfehler -> ebenfalls globalQueryInvalid', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS',
      undefined,
      env({
        globalQuery: 'WHERE (',
      }),
    );
    expect(res.queryError).toMatchObject({ code: 'globalQueryInvalid' });
    expect(res.files).toEqual([]);
  });

  it('globale Abfrage wirkt NICHT auf den Datei-Scope (LIST): keine Filterung, kein Fehler', () => {
    // Selbst eine ungueltige globale Abfrage bleibt fuer LIST (files) folgenlos.
    const res = frontmatterQueryFor(
      taskStart,
      'LIST',
      undefined,
      env({
        globalQuery: 'LIST TASKS SORT due',
      }),
    );
    expect(res.status).toBe('ready');
    expect(res.queryError).toBeUndefined();
    expect(names(res)).toEqual(['Aufgaben', 'Sonstiges', 'Start']);
  });
});

// --- 4T-0508 (Epic 3E-0096): Abhaengigkeiten (blocked/blocking/id.*) ------------
// Fixture ueber ZWEI Dateien, damit die datei-uebergreifende Sicht von
// computeDependencyFlags mitgeprueft wird: A (🆔 a1, offen), B (⛔ a1, offen),
// C (🆔 a1, offen — Duplikat von A), D (erledigt, 🆔 d1), E (⛔ d1, offen).
// Erwartung: B blockiert (offener Vorgaenger a1), A und C blockierend und
// Duplikat, E NICHT blockiert (Vorgaenger d1 erledigt).
describe('perspective-query — Abhaengigkeiten (TASKS-Scope, 4T-0508)', () => {
  const ID = '\u{1F194}'; // ID-Zeichen (🆔)
  const DEP = '⛔'; // Zufahrt-verboten (⛔, Vorgaenger-Bezug)

  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: over.globalFilter || '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  function taskKeys(res) {
    return res.files.map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
  }

  let taskStart;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    write(
      root,
      'Alpha.md',
      ['# Alpha', '', `- [ ] A ${ID} a1`, `- [ ] B ${DEP} a1`, ''].join('\n'),
    );
    write(
      root,
      'Beta.md',
      ['# Beta', '', `- [ ] C ${ID} a1`, `- [x] D ${ID} d1`, `- [ ] E ${DEP} d1`, ''].join('\n'),
    );
    await indexFor(taskStart);
  });

  // Boolesche Task-Felder werden gegen den String "true" verglichen (die
  // Query-Sprache kennt keine nackten Bool-Literale; coerceBool koerziert
  // 'true'/'false'). Ein nacktes `= true` wuerde 'true' als Feldnamen lesen.
  it('WHERE blocked = "true" trifft nur die Task mit offenem Vorgaenger (B); Treffer traegt blocked', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE blocked = "true"',
      undefined,
      env(),
    );
    expect(res.status).toBe('ready');
    expect(taskKeys(res)).toEqual(['B']);
    expect(res.files[0].blocked).toBe(true);
  });

  it('WHERE blocking = "true" trifft die offenen a1-Traeger (A, C)', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE blocking = "true"',
      undefined,
      env(),
    );
    expect(taskKeys(res).sort()).toEqual(['A', 'C']);
  });

  it('WHERE id.set = "true" trifft alle Tasks mit ID-Marker (A, C, D)', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE id.set = "true"',
      undefined,
      env(),
    );
    expect(taskKeys(res).sort()).toEqual(['A', 'C', 'D']);
  });

  it('WHERE id.duplicate = "true" trifft beide a1-Traeger; Treffer tragen duplicateId', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE id.duplicate = "true"',
      undefined,
      env(),
    );
    expect(taskKeys(res).sort()).toEqual(['A', 'C']);
    expect(res.files.every((f) => f.duplicateId === true)).toBe(true);
  });

  it('E ist NICHT blockiert, weil sein Vorgaenger d1 erledigt ist', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS WHERE blocked = "true"',
      undefined,
      env(),
    );
    expect(taskKeys(res).includes('E')).toBe(false);
  });
});

// --- 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen des Erinnerungs-Pruefers -----------
// areaTaskLines liest tasksPerFile des Index (schlanker Lesepfad ohne Query-
// Auswertung) und liefert pro Task-Zeile { path, zeile, text }. Fixture: eine
// Datei mit zwei Checkbox-Zeilen (eine mit ⏰-Anker), eine Datei ohne Tasks.
// Datumswerte in 2099 (Stabilitaet).
describe('areaTaskLines — Roh-Task-Zeilen des Bereichs (4T-0525)', () => {
  const REM = '\u{23F0}'; // Wecker (Erinnerung)
  const DUE = '\u{1F4C5}'; // Kalender (faellig)

  let taskStart;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    write(
      root,
      'Aufgaben.md',
      [
        '# Aufgaben',
        '',
        `- [ ] Zahlung ${REM} 2099-01-01 09:00 ${DUE} 2099-01-02`,
        '- [x] Kickoff erledigt',
        '',
      ].join('\n'),
    );
    // Datei ganz ohne Checkbox-Zeilen.
    write(root, 'Notiz.md', '# Notiz\n\nNur Text, keine Aufgaben.\n');
    await indexFor(taskStart);
  });

  it('liefert genau die Task-Zeilen des Bereichs mit path, zeile und text', () => {
    const root = rootForActiveFile(taskStart);
    const lines = areaTaskLines(root);
    expect(Array.isArray(lines)).toBe(true);
    // Zwei Checkbox-Zeilen aus Aufgaben.md, keine aus Start.md/Notiz.md.
    expect(lines).toHaveLength(2);
    const zahlung = lines.find((l) => l.text.includes('Zahlung'));
    expect(zahlung.text).toContain(REM);
    expect(zahlung.path.toLowerCase().endsWith('aufgaben.md')).toBe(true);
    expect(zahlung.zeile).toBe(3); // dritte Zeile der Datei
    expect(lines.some((l) => l.text.includes('Kickoff'))).toBe(true);
    // Genau die Felder path/zeile/text pro Eintrag.
    expect(Object.keys(zahlung).sort()).toEqual(['path', 'text', 'zeile']);
  });

  it('liefert null fuer eine unbekannte oder nicht bereite Wurzel', () => {
    expect(areaTaskLines(path.join(os.tmpdir(), 'gibt-es-nicht-4t0525-xyz'))).toBeNull();
    expect(areaTaskLines(null)).toBeNull();
  });
});
