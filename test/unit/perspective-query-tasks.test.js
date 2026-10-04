// 4T-000972 (Datei-Größen-Budget): Schnitt aus perspective-query-index.test.js —
// die Task-Blöcke der Perspective-Abfrage gegen den echten Backlinks-Index:
// TASKS-Scope (4T-000502), Gruppierung und Task-Layout (4T-000503), Default-
// Sortierung/urgency/globale Abfrage (4T-000505), Abhängigkeiten (4T-000508) und
// areaTaskLines (4T-000525). Jeder Block baut seine eigene Root-Fixture; der
// Infrastruktur-Kopf (makeRoot, write, indexFor, afterEach) ist nach
// etablierter Konvention je Datei dupliziert.
//
// 4T-002035 (Epic 3E-000260): Die Antwort des Erzeugers ist seit dem Ende des
// Übergangs allein die Ergebnismenge (`{ resultSet }`). Die Fälle lesen Zustand,
// Treffer, Gruppen und Layout-Wünsche deshalb aus der Menge; Treffer-Form,
// Anzeige-Name, gerundete Dringlichkeit und Gruppen-Beschriftung kommen aus dem
// Darstellungs-Kern, der sie auch für Anzeige, Kennungs-Vorschlag und
// Vorgänger-Suche bildet. Die Prüfaussagen sind unverändert.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
  // 4T-000525 (Epic 3E-000095): Roh-Task-Zeilen-Lesepfad des Erinnerungs-Pruefers.
  areaTaskLines,
} from '../../src/main/backlinks.js';
// 4T-000502 (Epic 3E-000096): Status-Typ-Resolver (Task-Umgebung) und Marker-Kern
// (Beschreibungen aus dem taskText der Treffer) fuer die TASKS-Scope-Tests.
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';
import { parseTaskLine } from '../../src/shared/tasks/task-markers.js';
// 4T-002033 (Epic 3E-000260): Prüfer des Format-Vertrags und die Referenz der
// ungerundeten Dringlichkeit; seit 4T-002035 der Darstellungs-Kern als Leser.
import { validateResultSet } from '../../src/shared/query/result-set.js';
import {
  cellSegments,
  displayName,
  groupTitle,
  roundUrgency,
  taskHits,
} from '../../src/shared/query/result-display.js';
import { localIsoDateOf } from '../../src/main/index/query-task-helfer.js';
import { computeUrgency } from '../../src/shared/tasks/task-recurrence.js';

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

// Datei-Namen der Treffer (Datei-Scope-Gegentest der globalen Abfrage).
function names(res) {
  return res.resultSet.rows.map((r) => displayName(r.origin));
}

// Zustand, Zeilen und Aufgaben-Treffer einer Antwort aus der Menge (4T-002035).
const zustand = (res) => res.resultSet.state;
const zeilen = (res) => res.resultSet.rows;
const treffer = (res) => taskHits(res.resultSet);
// Titel der Gruppen einer Ebene (null für die Gruppe ohne Wert).
const titel = (gruppen) => gruppen.map((g) => groupTitle(g.value).label);

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

// --- 4T-000502 (Epic 3E-000096): Task-Ebene (TASKS-Scope) --------------------------
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
    return treffer(res).map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
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

  it('LIST TASKS: Treffer mit line/taskText, Ebene tasks und Default-Sortierung', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(zustand(res).status).toBe('ready');
    expect(res.resultSet.scope).toBe('tasks');
    // 4T-000505: Default-Sortierung Status-Typ -> Dringlichkeit (absteigend) ->
    // Faelligkeit -> Prioritaet -> Pfad -> Zeile. Review (IN_PROGRESS) zuerst;
    // innerhalb TODO Konzept (highest, urgency 11.4), dann die normalen 2099er
    // nach Faelligkeit (Modul 03 < Notiz 04 < Ohne 05); Kickoff (DONE) zuletzt.
    expect(taskKeys(res)).toEqual(['Review', 'Konzept', 'Modul', 'Notiz', 'Ohne', 'Kickoff']);
    // Jeder Treffer traegt Zeilennummer und Roh-Zeile.
    expect(treffer(res).every((f) => typeof f.line === 'number' && f.line > 0)).toBe(true);
    expect(treffer(res)[0].taskText).toContain('Review offen');
    expect(displayName(zeilen(res)[0].origin)).toBe('Aufgaben');
  });

  it('Fenced-Code-Task-Zeilen zaehlen nicht', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(treffer(res).some((f) => f.taskText.includes('Codeblock'))).toBe(false);
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
    // 4T-000505: Default-Sortierung — Review (IN_PROGRESS) vor Modul (TODO).
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
    // 'Ohne Filter' traegt kein #task -> faellt raus. 4T-000505: die Restmenge
    // folgt der Default-Sortierung (Review IP, dann TODO nach Dringlichkeit/
    // Faelligkeit, Kickoff DONE zuletzt).
    expect(taskKeys(res)).toEqual(['Review', 'Konzept', 'Modul', 'Notiz', 'Kickoff']);
  });

  it('deaktivierte Erweiterung: queryError tasksScopeDisabled, leere Liste', () => {
    const off = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env({ enabled: false }));
    expect(zustand(off).status).toBe('ready');
    expect(zeilen(off)).toEqual([]);
    expect(zustand(off).queryError).toMatchObject({ code: 'tasksScopeDisabled' });
    // Ohne taskEnv (nicht durchgereicht) verhaelt es sich wie deaktiviert.
    const none = frontmatterQueryFor(taskStart, 'LIST TASKS');
    expect(zustand(none).queryError).toMatchObject({ code: 'tasksScopeDisabled' });
  });
});

// --- 4T-000503 (Epic 3E-000096): GROUP BY und Task-Layout (LIST TASKS) -------------
// Eigene Fixture mit voller Kontrolle ueber Ueberschriften, Prioritaet und eine
// Task-Zeile OHNE Ueberschrift (vor jeder Heading -> heading null), damit die
// Wert-lose Gruppe (label null) am Ende deterministisch pruefbar ist. Datums-
// Werte in 2099 (Stabilitaet).
describe('perspective-query — Gruppierung und Task-Layout (TASKS-Scope, 4T-000503)', () => {
  const DUE = '\u{1F4C5}'; // Kalender (faellig)
  const HIGH = '\u{1F53A}'; // rotes Dreieck (Prioritaet hoechste)

  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: over.globalFilter || '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  // Erstes Wort der Beschreibung der Zeilen einer Gruppe als stabiler Schluessel.
  function itemKeys(res, gruppe) {
    return gruppe.rows.map(
      (i) => parseTaskLine(zeilen(res)[i].origin.raw).description.trim().split(/\s+/)[0],
    );
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

  // 4T-002076 (Epic 3E-000259): Die Grenze der Gruppierung ist entfallen. GROUP BY
  // über Dateien und in einer Aufgaben-Tabelle liefert Gruppen statt des
  // Abfrage-Fehlers; HIDE/SHOW/SHORT bleiben der Aufgaben-Liste vorbehalten.
  it('GROUP BY ausserhalb LIST TASKS bildet Gruppen; HIDE/SHOW/SHORT bleiben layoutTasksOnly', () => {
    // Jede erzeugte gruppierte Menge besteht den Prüfer des Format-Vertrags.
    const gueltig = (res) => {
      expect(validateResultSet(res.resultSet)).toEqual([]);
      return res.resultSet;
    };
    // Datei-Liste: `heading` ist kein Datei-Feld, beide Dateien landen in der
    // Gruppe ohne Wert; die Zeilen-Liste bleibt vollständig.
    const grpFiles = frontmatterQueryFor(taskStart, 'LIST GROUP BY heading', undefined, env());
    const rsFiles = gueltig(grpFiles);
    expect(rsFiles.state.queryError).toBeNull();
    expect(rsFiles.scope).toBe('files');
    expect(rsFiles.rows).toHaveLength(2);
    expect(rsFiles.groups).toEqual([{ value: null, rows: [0, 1], groups: null }]);
    // Aufgaben-Tabelle: dieselben Gruppen wie die Aufgaben-Liste, über denselben
    // Zeilen in derselben Reihenfolge.
    const grpTable = frontmatterQueryFor(
      taskStart,
      'TABLE TASKS GROUP BY heading',
      undefined,
      env(),
    );
    const rsTable = gueltig(grpTable);
    expect(rsTable.type).toBe('table');
    expect(rsTable.state.queryError).toBeNull();
    const grpList = gueltig(
      frontmatterQueryFor(taskStart, 'LIST TASKS GROUP BY heading', undefined, env()),
    );
    // 4T-002078: Die Tabelle trägt dazu je Gruppe die Werte über der Gruppe.
    const ohneWerte = (gs) => gs.map(({ value, rows, groups }) => ({ value, rows, groups }));
    expect(ohneWerte(rsTable.groups)).toEqual(grpList.groups);
    expect(rsTable.groups.map((g) => g.values)).toEqual([[], [], []]);
    expect(rsTable.rows.map((r) => r.origin)).toEqual(grpList.rows.map((r) => r.origin));
    expect(rsTable.groups.map((g) => g.value)).toEqual(['Alpha', 'Beta', null]);
    // HIDE/SHOW/SHORT nur bei LIST TASKS -> layoutTasksOnly.
    const hideFiles = frontmatterQueryFor(taskStart, 'LIST HIDE due', undefined, env());
    expect(zustand(hideFiles).queryError).toMatchObject({ code: 'layoutTasksOnly' });
    const shortTable = frontmatterQueryFor(taskStart, 'TABLE TASKS SHORT', undefined, env());
    expect(zustand(shortTable).queryError).toMatchObject({ code: 'layoutTasksOnly' });
  });

  it('LIST TASKS ohne Gruppierung: Treffer-Zahl und Layout-Wünsche in der Menge', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    expect(zustand(res).status).toBe('ready');
    // Fuenf Task-Zeilen der Fixture (Wurzel + drei Alpha + eine Beta); die
    // Treffer-Zahl der Anzeige ist die Zahl der Zeilen.
    expect(zeilen(res)).toHaveLength(5);
    expect(treffer(res)).toHaveLength(5);
    expect(res.resultSet.groups).toBeNull();
    const layout = ({ hide, show, short }) => ({ hide, show, short });
    expect(layout(res.resultSet.wishes)).toEqual({ hide: [], show: [], short: false });
    // HIDE/SHORT reichen die geparsten Layout-Optionen durch.
    const lay = frontmatterQueryFor(taskStart, 'LIST TASKS HIDE due SHORT', undefined, env());
    expect(layout(lay.resultSet.wishes)).toEqual({ hide: ['due'], show: [], short: true });
  });

  it('einstufige Gruppierung nach heading: Gruppen-Reihenfolge, items, null-Gruppe zuletzt', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS GROUP BY heading', undefined, env());
    expect(zustand(res).status).toBe('ready');
    // Bei Gruppierung liegen die Treffer in den Gruppen: Jede Zeile gehört genau
    // einer Gruppe an (die Anzeige zeichnet dann keine flache Liste).
    const gruppen = res.resultSet.groups;
    expect(gruppen.flatMap((g) => g.rows).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    // Werte-Ordnung locale-bewusst (Alpha < Beta), Wert-lose Gruppe (label null)
    // als letzte.
    expect(titel(gruppen)).toEqual(['Alpha', 'Beta', null]);
    // 4T-000505: items-Reihenfolge folgt der Default-Sortierung der Pipeline —
    // A-frueh und A-spaet (beide highest) vor A-normal, bei gleicher
    // Dringlichkeit die fruehere Faelligkeit zuerst (A-frueh 01 < A-spaet 02).
    expect(itemKeys(res, gruppen[0])).toEqual(['A-frueh', 'A-spaet', 'A-normal']);
    expect(itemKeys(res, gruppen[1])).toEqual(['B-eins']);
    expect(itemKeys(res, gruppen[2])).toEqual(['Wurzel']);
    // Treffer tragen die Task-Trefferform (name/path/line/taskText).
    const zeile = zeilen(res)[gruppen[0].rows[0]];
    const hit = treffer(res)[gruppen[0].rows[0]];
    expect(displayName(zeile.origin)).toBe('Aufgaben');
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
    expect(itemKeys(res, res.resultSet.groups[0])).toEqual(['A-frueh', 'A-spaet', 'A-normal']);
  });

  it('zweistufige Gruppierung nach heading, priority', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS GROUP BY heading, priority',
      undefined,
      env(),
    );
    // Aeussere Ebene wie einstufig: Alpha, Beta, null.
    expect(titel(res.resultSet.groups)).toEqual(['Alpha', 'Beta', null]);
    // Alpha traegt Untergruppen (die Anzeige zeichnet dort keine direkten Einträge).
    const alpha = res.resultSet.groups[0];
    expect(Array.isArray(alpha.groups)).toBe(true);
    const subLabels = titel(alpha.groups);
    // Zwei Prioritaets-Untergruppen: hoechste (zwei A-Aufgaben) und normal (eine).
    expect(subLabels).toContain('highest');
    expect(subLabels).toContain('normal');
    const highest = alpha.groups.find((g) => groupTitle(g.value).label === 'highest');
    expect(itemKeys(res, highest).sort()).toEqual(['A-frueh', 'A-spaet']);
    const normal = alpha.groups.find((g) => groupTitle(g.value).label === 'normal');
    expect(itemKeys(res, normal)).toEqual(['A-normal']);
  });
});

// --- 4T-000505 (Epic 3E-000096): Default-Sortierung, urgency-Feld, globale Abfrage --
// Eigene Fixture mit gemischten Status-Typen (IN_PROGRESS/TODO/DONE), Prioritaeten
// und Faelligkeiten. Termine bewusst in 2099 (Zukunft, Faelligkeits-Komponente
// stabil +2.4) bzw. 2020 (Vergangenheit, +12.0), damit der reale Bezugstag des
// Index-Laufs (Date.now) die erwartete Ordnung nicht verschiebt. Aufgaben.md
// traegt das Frontmatter-Tag 'arbeit' (FROM-Quelle der globalen Abfrage),
// Sonstiges.md nicht.
describe('perspective-query — Default-Sortierung, urgency, globale Abfrage (4T-000505)', () => {
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
    return treffer(res).map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
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
    expect(zustand(res).status).toBe('ready');
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
    const scores = zeilen(res).map((r) => roundUrgency(r.taskInfo.urgency));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });

  it('Treffer tragen urgency als gerundete Zahl', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    const gerundet = zeilen(res).map((r) => roundUrgency(r.taskInfo.urgency));
    expect(gerundet.every((u) => typeof u === 'number')).toBe(true);
    const byKey = Object.fromEntries(
      zeilen(res).map((r, i) => [parseTaskLine(r.origin.raw).description.trim(), gerundet[i]]),
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
    expect(zustand(res).status).toBe('ready');
    expect(zeilen(res)).toEqual([]);
    expect(zustand(res).queryError).toMatchObject({ code: 'globalQueryInvalid' });
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
    expect(zustand(res).queryError).toMatchObject({ code: 'globalQueryInvalid' });
    expect(zeilen(res)).toEqual([]);
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
    expect(zustand(res).status).toBe('ready');
    expect(zustand(res).queryError).toBeNull();
    expect(names(res)).toEqual(['Aufgaben', 'Sonstiges', 'Start']);
  });
});

// --- 4T-000508 (Epic 3E-000096): Abhaengigkeiten (blocked/blocking/id.*) ------------
// Fixture ueber ZWEI Dateien, damit die datei-uebergreifende Sicht von
// computeDependencyFlags mitgeprueft wird: A (🆔 a1, offen), B (⛔ a1, offen),
// C (🆔 a1, offen — Duplikat von A), D (erledigt, 🆔 d1), E (⛔ d1, offen).
// Erwartung: B blockiert (offener Vorgaenger a1), A und C blockierend und
// Duplikat, E NICHT blockiert (Vorgaenger d1 erledigt).
describe('perspective-query — Abhaengigkeiten (TASKS-Scope, 4T-000508)', () => {
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
    return treffer(res).map((f) => parseTaskLine(f.taskText).description.trim().split(/\s+/)[0]);
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
    expect(zustand(res).status).toBe('ready');
    expect(taskKeys(res)).toEqual(['B']);
    expect(zeilen(res)[0].taskInfo.blocked).toBe(true);
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
    expect(zeilen(res).every((r) => r.taskInfo.duplicateId === true)).toBe(true);
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

// --- 4T-000525 (Epic 3E-000095): Roh-Task-Zeilen des Erinnerungs-Pruefers -----------
// areaTaskLines liest tasksPerFile des Index (schlanker Lesepfad ohne Query-
// Auswertung) und liefert pro Task-Zeile { path, zeile, text }. Fixture: eine
// Datei mit zwei Checkbox-Zeilen (eine mit ⏰-Anker), eine Datei ohne Tasks.
// Datumswerte in 2099 (Stabilitaet).
describe('areaTaskLines — Roh-Task-Zeilen des Bereichs (4T-000525)', () => {
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

// --- 4T-002033 (Epic 3E-000260): Ergebnismenge der Aufgaben-Ebene -------------------
// Eigene Fixture: eine Aufgabe vor jeder Überschrift (Gruppe ohne Wert), zwei
// unter '## Alpha' (eine mit höchster Priorität), zwei unter '## Beta' mit einer
// Abhängigkeit (B-wartet hängt am offenen B-traeger). Termine in 2099.
describe('perspective-query — Ergebnismenge der Aufgaben-Ebene (4T-002033)', () => {
  const DUE = '\u{1F4C5}'; // Kalender (faellig)
  const HIGH = '\u{1F53A}'; // rotes Dreieck (Prioritaet hoechste)
  const ID = '\u{1F194}'; // ID-Zeichen
  const DEP = '⛔'; // Vorgaenger-Bezug

  function env(over = {}) {
    return {
      enabled: over.enabled !== undefined ? over.enabled : true,
      globalFilter: '',
      statusTypeOf: createTaskStatusTypeResolver(null),
    };
  }

  // Prüfer ohne Abweichung und Übertragbarkeit (strukturierter Klon); seit
  // 4T-002035 trägt die Antwort NUR die Menge, die bisher hier geprüfte
  // Ableitung der alten Felder ist mit der alten Form entfallen.
  function pruefeMenge(res) {
    expect(Object.keys(res)).toEqual(['resultSet']);
    const { resultSet } = res;
    expect(validateResultSet(resultSet)).toEqual([]);
    expect(resultSet.formatVersion).toBe(1);
    expect(structuredClone(resultSet)).toEqual(resultSet);
    return resultSet;
  }

  const schluessel = (row) => parseTaskLine(row.origin.raw).description.trim().split(/\s+/)[0];

  let taskStart;
  let aufgaben;
  beforeEach(async () => {
    const root = makeRoot();
    taskStart = write(root, 'Start.md', '# Start\n');
    aufgaben = write(
      root,
      'Aufgaben.md',
      [
        `- [ ] Wurzel ${DUE} 2099-06-01`,
        '',
        '## Alpha',
        '',
        `- [ ] A-frueh ${DUE} 2099-01-01 ${HIGH}`,
        // Fällig morgen: Die Dringlichkeit hat dann mehr als zwei
        // Nachkommastellen (1,95 + 12 − 8 · 9,6 / 21), gerundet und ungerundet
        // unterscheiden sich also sichtbar.
        `- [ ] A-normal ${DUE} ${localIsoDateOf(Date.now() + 86400000)}`,
        '',
        '## Beta',
        '',
        `- [ ] B-traeger ${ID} b1`,
        `- [ ] B-wartet ${DEP} b1`,
        '',
      ].join('\n'),
    );
    await indexFor(taskStart);
  });

  it('LIST TASKS: Herkunft mit Zeile und Roh-Zeile, Zusatzangaben ungerundet', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env());
    const rs = pruefeMenge(res);
    expect(rs.scope).toBe('tasks');
    expect(rs.type).toBe('list');
    expect(rs.rows).toHaveLength(5);
    const wurzel = rs.rows.find((r) => schluessel(r) === 'Wurzel');
    expect(wurzel.origin).toEqual({
      kind: 'task',
      path: aufgaben,
      name: 'Aufgaben',
      line: 1,
      raw: `- [ ] Wurzel ${DUE} 2099-06-01`,
    });
    // Die Dringlichkeit ist der ungerundete Wert der Auswertung; gerundet wird
    // allein in der Darstellung. Die Aufgaben-Treffer der Hintergrund-Nutzer
    // tragen Pfad, Zeile und Roh-Zeile der Herkunft (4T-002035).
    const todayIso = localIsoDateOf(Date.now());
    const hits = taskHits(rs);
    rs.rows.forEach((r, i) => {
      const roh = computeUrgency(parseTaskLine(r.origin.raw), { todayIso });
      expect(r.taskInfo.urgency).toBe(roh);
      expect(roundUrgency(r.taskInfo.urgency)).toBe(Math.round(roh * 100) / 100);
      expect(hits[i]).toEqual({ path: r.origin.path, line: r.origin.line, taskText: r.origin.raw });
    });
    const normal = rs.rows.find((r) => schluessel(r) === 'A-normal').taskInfo.urgency;
    expect(normal).not.toBe(Math.round(normal * 100) / 100);
    const wartet = rs.rows.find((r) => schluessel(r) === 'B-wartet');
    expect(wartet.taskInfo).toEqual(expect.objectContaining({ blocked: true, duplicateId: false }));
    expect(rs.wishes).toEqual({
      layoutColumns: null,
      withoutId: false,
      hide: [],
      show: [],
      short: false,
    });
    // Die Treffer-Zahl der Anzeige ist die Zahl der Zeilen.
    expect(rs.rows.length).toBe(5);
  });

  it('GROUP BY: Gruppen tragen Wert und Zeilen-Indizes, die Zeilen bleiben vollständig', () => {
    const res = frontmatterQueryFor(taskStart, 'LIST TASKS GROUP BY heading', undefined, env());
    const rs = pruefeMenge(res);
    // Die Menge behält bei Gruppierung alle Zeilen.
    expect(rs.rows).toHaveLength(5);
    expect(rs.groups.map((g) => g.value)).toEqual(['Alpha', 'Beta', null]);
    expect(rs.groups.every((g) => g.groups === null)).toBe(true);
    expect(rs.groups.map((g) => g.rows.map((i) => schluessel(rs.rows[i])))).toEqual([
      ['A-frueh', 'A-normal'],
      ['B-traeger', 'B-wartet'],
      ['Wurzel'],
    ]);
    // Jede Zeile gehört genau einer Gruppe an.
    const alle = rs.groups.flatMap((g) => g.rows).sort((a, b) => a - b);
    expect(alle).toEqual([0, 1, 2, 3, 4]);
    // Beschriftung und Einträge der Gruppen entstehen in der Darstellung aus
    // Wert und Zeilen.
    expect(titel(rs.groups)).toEqual(['Alpha', 'Beta', null]);
    expect(rs.groups[0].rows.map((i) => taskHits(rs)[i].taskText)).toEqual(
      rs.groups[0].rows.map((i) => rs.rows[i].origin.raw),
    );
  });

  it('zweistufige Gruppierung: Untergruppen teilen die Zeilen ihrer Gruppe', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS GROUP BY heading, priority',
      undefined,
      env(),
    );
    const rs = pruefeMenge(res);
    const alpha = rs.groups[0];
    expect(alpha.value).toBe('Alpha');
    expect(alpha.groups.map((g) => g.value).sort()).toEqual(['highest', 'normal']);
    const unter = alpha.groups.flatMap((g) => g.rows).sort((a, b) => a - b);
    expect(unter).toEqual([...alpha.rows].sort((a, b) => a - b));
    expect(Array.isArray(alpha.groups)).toBe(true);
    expect(titel(alpha.groups).sort()).toEqual(['highest', 'normal']);
  });

  it('Zusatzfeld und Layout-Wünsche: Datums-Spalte, Wünsche getrennt von den Daten', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'LIST TASKS due GROUP BY heading SHOW urgency HIDE due SHORT',
      undefined,
      env(),
    );
    const rs = pruefeMenge(res);
    expect(rs.columns).toEqual([
      { name: 'due', label: 'due', alias: null, source: 'due', valueType: 'date' },
    ]);
    const frueh = rs.rows.find((r) => schluessel(r) === 'A-frueh');
    expect(frueh.values).toEqual([{ kind: 'date', ms: new Date(2099, 0, 1).getTime() }]);
    // B-traeger hat keinen Termin: fehlender Wert statt leerer Zeichenkette.
    expect(rs.rows.find((r) => schluessel(r) === 'B-traeger').values).toEqual([null]);
    expect(rs.wishes).toEqual({
      layoutColumns: null,
      withoutId: false,
      hide: ['due'],
      show: ['urgency'],
      short: true,
    });
    // Die Darstellung zeigt den Termin der ersten Zeile der ersten Gruppe.
    expect(cellSegments(rs.rows[rs.groups[0].rows[0]].values[0])).toEqual([{ text: '2099-01-01' }]);
  });

  it('TABLE TASKS: Tabellen-Typ mit Aufgaben-Herkunft und Zusatzangaben', () => {
    const res = frontmatterQueryFor(
      taskStart,
      'TABLE TASKS description, urgency',
      undefined,
      env(),
    );
    const rs = pruefeMenge(res);
    expect(rs.type).toBe('table');
    expect(rs.scope).toBe('tasks');
    expect(rs.columns.map((c) => c.valueType)).toEqual(['string', 'number']);
    expect(rs.rows.every((r) => r.origin.kind === 'task' && r.taskInfo !== null)).toBe(true);
    // Die Dringlichkeits-Spalte ist derselbe ungerundete Wert wie die Zusatzangabe.
    expect(rs.rows.every((r) => r.values[1] === r.taskInfo.urgency)).toBe(true);
    // Einen Treffer-Zähler zeichnet die Anzeige allein zur Aufgaben-Liste
    // (LIST TASKS); die Tabelle trägt Typ «table» und keine Gruppen, und die
    // Momentaufnahme «Aufgaben: Tabelle» des Vergleichs-Prüffalls zeigt keinen.
    expect(rs.groups).toBeNull();
  });

  it('Abfrage-Fehler der Aufgaben-Ebene: Zustand mit Fehler, keine Zeilen', () => {
    const aus = frontmatterQueryFor(taskStart, 'LIST TASKS', undefined, env({ enabled: false }));
    const rsAus = pruefeMenge(aus);
    expect(rsAus.state.queryError).toMatchObject({ code: 'tasksScopeDisabled', pos: -1 });
    expect(rsAus.scope).toBeNull();
    expect(rsAus.rows).toEqual([]);
    // 4T-002076: GROUP BY außerhalb der Aufgaben-Liste ist kein Abfrage-Fehler
    // mehr; die Grenze der Layout-Klauseln bleibt einer.
    const layout = frontmatterQueryFor(taskStart, 'TABLE TASKS SHORT', undefined, env());
    expect(pruefeMenge(layout).state.queryError.code).toBe('layoutTasksOnly');
    const gruppe = frontmatterQueryFor(taskStart, 'LIST GROUP BY heading', undefined, env());
    expect(pruefeMenge(gruppe).state.queryError).toBeNull();
  });
});
