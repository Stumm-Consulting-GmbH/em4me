// 4T-002546 (Epic 3E-000368, Story 4S-001197, AK1, AK3, AK4, AK5): Der
// Workflow-Befehl `db-query` im Hauptprozess (src/main/workflows/
// workflow-db-query.js) gegen ein Bereichs-Verzeichnis.
//
// **Am echten Index und mit den echten Schreibwegen:** Der Bereich wird über
// den Bedarfs-Weg aufgebaut, danach wird sein Datei-Beobachter geschlossen
// (Muster `db-index-eigene-schreibvorgaenge.test.js`); die Abfrage läuft über
// `frontmatterQueryFor` wie in der Lese-Ansicht, geschrieben wird über die
// echten Inhalts- und Datei-Befehle (`runContentEdit`, `create`). Die
// Abfrage-Datei ist nach dem Vorbild «Long Books» des Demo-Bereichs gebaut,
// mit `this.minpages` aus ihrem Dateikopf.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backlinks = require('../../src/main/backlinks.js');
const store = require('../../src/main/index/store.js');
const { vergissAlleDefinitionen } = require('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require('../../src/main/index/datensatz-zugriff.js');
const { createWorkflowDbQuery } = require('../../src/main/workflows/workflow-db-query.js');
const { createDbSchreibStand } = require('../../src/main/workflows/workflow-db-schreibstand.js');
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const { hatLaufMarke, _laufLeeren } = require('../../src/main/documents/self-write.js');
// Die Texte des Fensters, gestellt: Der Baustein setzt allein ein, was die
// Übersetzung liefert; die fünf Sprachfassungen prüft der i18n-Wächter.
const de = {
  'query.table.fileColumn': 'Datei',
  'query.table.recordColumn': 'Datensatz',
  'query.group.none': '(ohne Wert)',
  'query.empty': 'Keine Datei entspricht dieser Abfrage',
  'query.emptyRecords': 'Kein Datensatz entspricht dieser Abfrage',
  'workflow.dbQuery.taskColumn': 'Aufgabe',
};

const BESITZER = 'db-query-test';
let wurzeln = [];

afterEach(() => {
  _laufLeeren();
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
  vi.useFakeTimers();
  for (const w of wurzeln) {
    backlinks.releaseRoot(w, BESITZER);
    backlinks.releaseRoot(w, '7:database');
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  for (const w of wurzeln) {
    try {
      fs.rmSync(w, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  wurzeln = [];
});

const FENCE = '```';
const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '      label: Title',
  '    - name: author',
  '      label: Author',
  '    - name: pages',
  '      type: number',
  '      label: Pages',
  '  display: title',
  '  lastId: 3',
  '---',
  '',
  `${FENCE}perspective-records`,
  '|- id="r-00001"',
  '| Solaris',
  '| Lem',
  '| 224',
  '|- id="r-00002"',
  '| Zauberberg',
  '| Mann',
  '| 1000',
  '|- id="r-00003"',
  '| Anna Karenina',
  '| Tolstoi',
  '| 864',
  FENCE,
  '',
].join('\n');

const abfrage = (
  minpages,
  block = 'TABLE RECORDS author, pages\nFROM "Library"\nWHERE pages > this.minpages\nSORT pages DESC',
) =>
  [
    '---',
    'db-query:',
    `minpages: ${minpages}`,
    '---',
    '',
    '# Long Books',
    '',
    `${FENCE}perspective-query`,
    block,
    FENCE,
    '',
  ].join('\n');

const UEBERSICHT =
  '# Übersicht\n\nVorwort bleibt.\n\n## Lange Bücher\nalter Inhalt\n\n## Danach\nbleibt auch.\n';

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

async function welt({ datenbankAn = true } = {}) {
  const wurzel = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbquery-')));
  wurzeln.push(wurzel);
  const library = lege(wurzel, 'Daten/Library.md', LIBRARY);
  const longBooks = lege(wurzel, 'Long Books.md', abfrage(500));
  lege(wurzel, 'Kaputt.md', abfrage(500, 'TABLE RECORDS (\nFROM "Library"'));
  const uebersicht = lege(wurzel, 'Übersicht.md', UEBERSICHT);
  const notiz = lege(wurzel, 'Notiz.md', '# Notiz\n');
  let stand = backlinks.backlinksFor(notiz, BESITZER, wurzel);
  for (let i = 0; i < 500 && stand.status === 'indexing'; i++) {
    await new Promise((r) => setTimeout(r, 10));
    stand = backlinks.backlinksFor(notiz, BESITZER, wurzel);
  }
  expect(stand.status).toBe('ready');
  const entry = store.indexes.get(wurzel);
  if (entry.watcher) await entry.watcher.close();
  entry.watcher = null;
  const deps = {
    backlinks,
    windows: new Map(),
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    bufferRequests: { request: async () => ({ ok: false, code: 'bufferUnavailable' }) },
  };
  const schreibStand = createDbSchreibStand({ backlinks });
  const modul = createWorkflowDbQuery({
    backlinks,
    datenbankAktiv: () => datenbankAn,
    schreibStand,
    inhaltsSchritte: createWorkflowContentSteps(deps),
    dateiSchritte: createWorkflowFileSteps({ ...deps, isMarkdownPath: (p) => /\.md$/i.test(p) }),
    tForWindow: (_win, key) => (key in de ? de[key] : key),
    resolveQueryTemplatesFolder: async () => null,
  });
  const ctx = {
    root: wurzel,
    owner: { id: 'Fenster' },
    event: { sender: { id: 7 } },
    workflowAbs: path.join(wurzel, 'Workflows', 'Probe.md'),
    backlinks,
  };
  const lauf = (quelle, target, heading) =>
    modul.runDbQueryStep(ctx, {
      line: 7,
      blockLine: 1,
      keyword: 'db-query',
      args: [quelle],
      source: null,
      position: heading === undefined ? null : { kind: 'under', heading },
      target,
    });
  // 4T-002550: die Liste einer Schleife db-for-each über dasselbe Modul.
  const liste = (quelle) =>
    modul.runDbQueryStep(ctx, { line: 7, blockLine: 1, keyword: 'db-for-each', args: [quelle] });
  return { wurzel, library, longBooks, uebersicht, schreibStand, lauf, liste };
}

const TABELLE_500 = [
  '| Datensatz | Author | Pages |',
  '| --- | --- | --- |',
  '| [[Library#^r-00002\\|Zauberberg]] | Mann | 1000 |',
  '| [[Library#^r-00003\\|Anna Karenina]] | Tolstoi | 864 |',
  '',
].join('\n');

describe('db-query: Abschnitt ersetzen und Datei anlegen (4T-002546, AK1)', () => {
  it('ersetzt den Inhalt des Abschnitts; Überschrift und übriger Text bleiben zeichengleich', async () => {
    const w = await welt();
    const ergebnis = await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    expect(ergebnis).toEqual({
      ok: true,
      effect: { kind: 'edited', paths: [w.uebersicht], via: 'disk' },
    });
    expect(lies(w.uebersicht)).toBe(UEBERSICHT.replace('alter Inhalt\n', `\n${TABELLE_500}`));
    // Die Lauf-Marke steht wie bei jedem Datei-Schritt.
    expect(hatLaufMarke(w.uebersicht)).toBe(true);
  });

  it('ein zweiter Lauf ersetzt statt anzuhängen: genau eine Tabelle', async () => {
    const w = await welt();
    await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    const einmal = lies(w.uebersicht);
    const zweit = await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    expect(zweit).toMatchObject({ ok: true, effect: { kind: 'unchanged' } });
    expect(lies(w.uebersicht)).toBe(einmal);
    expect(
      lies(w.uebersicht)
        .split('\n')
        .filter((z) => z.startsWith('| Datensatz |')),
    ).toHaveLength(1);
  });

  it('ohne under legt der Befehl die Datei mit der Tabelle an, wie create', async () => {
    const w = await welt();
    const ergebnis = await w.lauf('Long Books.md', 'Berichte/Neu.md');
    const neu = path.join(w.wurzel, 'Berichte', 'Neu.md');
    expect(ergebnis).toMatchObject({ ok: true, effect: { kind: 'created', paths: [neu] } });
    expect(lies(neu)).toBe(TABELLE_500);
  });
});

describe('db-query: Fehlschläge lassen die Datei unverändert (4T-002546, AK4)', () => {
  it.each([
    ['vorhandene Ziel-Datei ohne under', ['Long Books.md', 'Übersicht.md'], 'targetExists'],
    ['fehlende Überschrift', ['Long Books.md', 'Übersicht.md', 'Gibt es nicht'], 'headingUnknown'],
    [
      'fehlende Ziel-Datei mit under',
      ['Long Books.md', 'Fehlt.md', 'Lange Bücher'],
      'targetMissing',
    ],
    ['keine Abfrage-Datei', ['Übersicht.md', 'Übersicht.md', 'Lange Bücher'], 'dbQueryFileMissing'],
    ['Abfrage fehlerhaft', ['Kaputt.md', 'Übersicht.md', 'Lange Bücher'], 'dbQueryInvalid'],
    [
      'Ziel außerhalb des Bereichs',
      ['Long Books.md', '../Fremd.md', 'Lange Bücher'],
      'outsideArea',
    ],
  ])('%s', async (_name, [quelle, ziel, heading], code) => {
    const w = await welt();
    const ergebnis = await w.lauf(quelle, ziel, heading);
    expect(ergebnis).toMatchObject({ ok: false, code });
    expect(lies(w.uebersicht)).toBe(UEBERSICHT);
  });

  it('mehrfache Überschrift', async () => {
    const w = await welt();
    const doppelt = UEBERSICHT + '\n## Lange Bücher\nnoch einmal\n';
    fs.writeFileSync(w.uebersicht, doppelt, 'utf8');
    expect(await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher')).toMatchObject({
      ok: false,
      code: 'headingAmbiguous',
    });
    expect(lies(w.uebersicht)).toBe(doppelt);
  });

  it('bei ausgeschalteter Datenbank die Abweisung der Maske, nichts geschrieben', async () => {
    const w = await welt({ datenbankAn: false });
    const ergebnis = await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    expect(ergebnis).toEqual({
      ok: false,
      code: 'dbRejected',
      detail: { lagen: [{ code: 'auftragErweiterungAus' }] },
    });
    expect(lies(w.uebersicht)).toBe(UEBERSICHT);
  });

  // 4T-002550 (Erweiterungs-Prüfschritt): auch die Liste einer Schleife über
  // Datensätze entsteht nur bei eingeschalteter Datenbank.
  it('bei ausgeschalteter Datenbank liefert db-for-each keine Liste, sondern die Abweisung', async () => {
    const aus = await welt({ datenbankAn: false });
    expect(await aus.liste('Long Books.md')).toEqual({
      ok: false,
      code: 'dbRejected',
      detail: { lagen: [{ code: 'auftragErweiterungAus' }] },
    });
    const an = await welt();
    expect(await an.liste('Long Books.md')).toMatchObject({ ok: true });
  });
});

describe('db-query: this.<Angabe>, leere Menge und eigene Schreibvorgänge (4T-002546)', () => {
  it('this.minpages gilt wie in der Lese-Ansicht der Abfrage-Datei (AK5)', async () => {
    const w = await welt();
    fs.writeFileSync(w.longBooks, abfrage(900), 'utf8');
    // Ohne Beobachter trägt der Nachtrag die geänderte Abfrage-Datei in den Index.
    w.schreibStand.merkeGeschrieben(w.wurzel, [w.longBooks]);
    await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    const text = lies(w.uebersicht);
    expect(text).toContain('| [[Library#^r-00002\\|Zauberberg]] | Mann | 1000 |');
    expect(text).not.toContain('Tolstoi');
  });

  it('ohne Treffer eine Tabelle ohne Zeilen mit dem Satz der Ansicht, kein Fehlschlag (AK3)', async () => {
    const w = await welt();
    fs.writeFileSync(w.longBooks, abfrage(5000), 'utf8');
    w.schreibStand.merkeGeschrieben(w.wurzel, [w.longBooks]);
    const ergebnis = await w.lauf('Long Books.md', 'Übersicht.md', 'Lange Bücher');
    expect(ergebnis.ok).toBe(true);
    expect(lies(w.uebersicht)).toContain(
      `## Lange Bücher\n\n| Datensatz | Author | Pages |\n| --- | --- | --- |\n\n${de['query.emptyRecords']}\n\n## Danach`,
    );
  });

  // Die Datensatz-Ebene liest die Tabelle ohnehin frisch von der Platte; auf
  // den Index angewiesen ist eine Abfrage über die Dateien. Dort zeigt der Fall,
  // dass der Schreib-Stand vor der Abfrage nachträgt.
  it('eine im selben Lauf geschriebene Datei steht im Ergebnis (V1); ohne Merkung nicht', async () => {
    const w = await welt();
    lege(w.wurzel, 'Notizen.md', abfrage(0, 'TABLE status\nFROM "Notizen"\nSORT file.name'));
    lege(w.wurzel, 'Notizen/Alt.md', '---\nstatus: alt\n---\n');
    w.schreibStand.merkeGeschrieben(w.wurzel, [
      path.join(w.wurzel, 'Notizen.md'),
      path.join(w.wurzel, 'Notizen', 'Alt.md'),
    ]);
    await w.lauf('Notizen.md', 'Berichte/Vorher.md');
    const neu = lege(w.wurzel, 'Notizen/Neu.md', '---\nstatus: neu\n---\n');
    await w.lauf('Notizen.md', 'Berichte/Ohne.md');
    expect(lies(path.join(w.wurzel, 'Berichte', 'Ohne.md'))).not.toContain('[[Neu]]');
    w.schreibStand.merkeGeschrieben(w.wurzel, [neu]);
    await w.lauf('Notizen.md', 'Berichte/Mit.md');
    expect(
      lies(path.join(w.wurzel, 'Berichte', 'Mit.md'))
        .split('\n')
        .slice(2, 4),
    ).toEqual(['| [[Alt]] | alt |', '| [[Neu]] | neu |']);
  });
});
