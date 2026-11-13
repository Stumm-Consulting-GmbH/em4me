// 4T-002547 (Epic 3E-000368, Stories 4S-001198 und 4S-001199, AK1 bis AK5): Die
// Schleife `db-for-each` und die Datenbank-Platzhalter `{{record:…}}`,
// `{{db:…}}` und `{{created:…}}` an der realen Konstellation.
//
// **Echt sind:** der Bereichs-Index (über den Bedarfs-Weg aufgebaut, Beobachter
// danach geschlossen, Muster `workflow-db-query.test.js`), die Schreib-
// Schnittstelle der Datenbank mit Sperr-Verwaltung, Klammer und Wiederanlauf,
// die Schritt-Module des Hauptprozesses (`workflow-db-steps.js`,
// `workflow-db-query.js`) mit dem einen Schreib-Stand, das Prüfen und Füllen
// (`checkWorkflow`, `prepareRun`) und der Ablauf-Kern (`runWorkflow`). Gestellt
// ist allein der Kanal dazwischen: `deps.step` und `deps.dbRead` rufen die
// Module unmittelbar, wie es `workflow:step` und `workflow:dbRead` tun.
// Weil der Beobachter geschlossen ist, sieht der Index einen im Lauf
// geschriebenen Datensatz nur über den Schreib-Stand.
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
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const {
  DB_WRITE_KEYWORDS,
  createWorkflowDbSteps,
} = require('../../src/main/workflows/workflow-db-steps.js');
const { createWorkflowDbQuery } = require('../../src/main/workflows/workflow-db-query.js');
const { createDbSchreibStand } = require('../../src/main/workflows/workflow-db-schreibstand.js');
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const { _laufLeeren } = require('../../src/main/documents/self-write.js');
const { checkWorkflow } = require('../../src/shared/workflows/workflow-check.js');
const { readWorkflowDocument } = require('../../src/shared/workflows/workflow-document.js');
const { prepareRun } = require('../../src/shared/workflows/workflow-placeholders.js');
const { runWorkflow } = require('../../src/shared/workflows/workflow-runner.js');

const BESITZER = 'db-schleife-test';
let wurzeln = [];
let verwaltungen = [];

afterEach(async () => {
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
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
const datensatz = (id, title, pages) => [`|- id="${id}"`, `| ${title}`, `| ${pages}`, '| '];
function library(saetze) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: title',
    '    - name: pages',
    '      type: number',
    '    - name: loanNote',
    '  display: title',
    `  lastId: ${saetze.length}`,
    '---',
    '',
    `${FENCE}perspective-records`,
    ...saetze.flatMap((s) => datensatz(...s)),
    FENCE,
    '',
  ].join('\n');
}
const BUECHER = [
  ['r-00001', 'Solaris', 224],
  ['r-00002', 'Zauberberg', 1000],
  ['r-00003', 'Anna Karenina', 864],
];
const abfrage = (block) =>
  [
    '---',
    'db-query:',
    'minpages: 500',
    '---',
    '',
    `${FENCE}perspective-query`,
    block,
    FENCE,
    '',
  ].join('\n');
const LANG = abfrage(
  'TABLE RECORDS title, pages\nFROM "Library"\nWHERE pages > this.minpages\nSORT pages DESC',
);

const AUTOREN = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '  key: name',
  '  lastId: 1',
  '---',
  '',
].join('\n');

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

// Ein Bereich mit echtem Index, echter Schreib-Schnittstelle und den Modulen.
async function welt({ buecher = BUECHER } = {}) {
  const wurzel = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbschleife-')));
  wurzeln.push(wurzel);
  const lib = lege(wurzel, 'Daten/Library.md', library(buecher));
  lege(wurzel, 'Long Books.md', LANG);
  lege(wurzel, 'Leer.md', abfrage('TABLE RECORDS title\nFROM "Library"\nWHERE pages > 99999'));
  lege(wurzel, 'Gruppiert.md', abfrage('TABLE RECORDS count()\nFROM "Library"\nGROUP BY pages'));
  lege(wurzel, 'Autoren/Autoren.md', AUTOREN);
  lege(wurzel, 'Autoren/Ada.md', '---\ndb-record: r-00001\nname: Ada\n---\n');
  lege(wurzel, 'Kartei.md', abfrage('TABLE RECORDS name\nFROM "Autoren"'));
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

  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig });
  const schreibSchnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
      laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-11-10T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
  const schreibStand = createDbSchreibStand({ backlinks });
  const inhalt = {
    backlinks,
    windows: new Map(),
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    bufferRequests: { request: async () => ({ ok: false }) },
  };
  const dbSteps = createWorkflowDbSteps({
    schreibSchnittstelle,
    sperrVerwaltung,
    datenbankAktiv: () => true,
    backlinks,
    schreibStand,
  });
  const dbQuery = createWorkflowDbQuery({
    backlinks,
    datenbankAktiv: () => true,
    schreibStand,
    inhaltsSchritte: createWorkflowContentSteps(inhalt),
    dateiSchritte: createWorkflowFileSteps({ ...inhalt, isMarkdownPath: (p) => /\.md$/i.test(p) }),
    tForWindow: (_w, key) => key,
    resolveQueryTemplatesFolder: async () => null,
  });
  const ctx = {
    root: wurzel,
    owner: { id: 'Fenster' },
    event: { sender: { id: 7 } },
    workflowAbs: path.join(wurzel, 'Workflows', 'Probe.md'),
    backlinks,
  };
  const schritte = [];
  const meldungen = [];
  const deps = {
    flushBuffers: async () => {},
    step: async (_pfad, step) => {
      schritte.push(step);
      return DB_WRITE_KEYWORDS.includes(step.keyword)
        ? dbSteps.runDbStep(ctx, step)
        : dbQuery.runDbQueryStep(ctx, step);
    },
    dbRead: async (_pfad, a) =>
      a.art === 'record'
        ? dbSteps.readRecord(ctx, { tabelle: a.tabelle, kennung: a.kennung })
        : dbSteps.readValue(ctx, { table: a.table, record: a.record, field: a.field }),
    notify: (text) => meldungen.push(text),
    sleep: async () => {},
  };
  async function lauf(...zeilen) {
    const doc = readWorkflowDocument(
      `---\nworkflow: true\nname: Probe\n---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n`,
    );
    const geprueft = checkWorkflow(doc);
    expect(geprueft.findings).toEqual([]);
    const gefuellt = prepareRun(geprueft.steps, { file: 'Notiz.md', area: 'B', nowMs: 0 }, {}, {});
    expect(gefuellt.findings).toEqual([]);
    return runWorkflow({ path: ctx.workflowAbs, name: 'Probe', steps: gefuellt.steps }, deps);
  }
  return { wurzel, lib, lauf, schritte, meldungen };
}

// Die Datensätze der Tabelle als { Kennung: [Titel, Seiten, Notiz] }.
function bestand(text) {
  const zeilen = text.split('\n');
  const ergebnis = {};
  zeilen.forEach((z, i) => {
    const m = /^\|- id="(r-\d+)"/.exec(z);
    if (m) ergebnis[m[1]] = zeilen.slice(i + 1, i + 4).map((x) => x.replace(/^\| ?/, ''));
  });
  return ergebnis;
}

describe('db-for-each an der realen Konstellation (4T-002547, AK1, AK2, AK3)', () => {
  it('bearbeitet jeden Datensatz der Abfrage genau einmal, in der Reihenfolge der Abfrage', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-update "Library" "{{record:id}}" loanNote="lang: {{record:pages}} Seiten"',
      'end',
    );
    expect(ergebnis).toEqual({ status: 'ok' });
    const aenderungen = w.schritte.filter((s) => s.keyword === 'db-update');
    expect(aenderungen.map((s) => s.args[1])).toEqual(['r-00002', 'r-00003']);
    expect(bestand(lies(w.lib))).toEqual({
      'r-00001': ['Solaris', '224', ''],
      'r-00002': ['Zauberberg', '1000', 'lang: 1000 Seiten'],
      'r-00003': ['Anna Karenina', '864', 'lang: 864 Seiten'],
    });
  });

  it('die Liste steht beim Eintritt fest: ein im Lauf angelegter passender Datensatz wird nicht bearbeitet', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-create "Library" title="Kopie {{record:title}}" pages="999"',
      'end',
    );
    expect(ergebnis).toEqual({ status: 'ok' });
    expect(w.schritte.filter((s) => s.keyword === 'db-create')).toHaveLength(2);
    expect(Object.keys(bestand(lies(w.lib)))).toHaveLength(5);
  });

  it('liest jeden Datensatz zu Beginn seiner Wiederholung frisch', async () => {
    const w = await welt();
    await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-update "Library" "Anna Karenina" loanNote="gesehen"',
      '  db-update "Library" "{{record:id}}" title="{{record:title}} / {{record:loanNote}}"',
      'end',
    );
    const b = bestand(lies(w.lib));
    // Zauberberg kam vor Anna: ihre Notiz stand zu Beginn seiner Wiederholung noch leer.
    expect(b['r-00002'][0]).toBe('Zauberberg / ');
    // Annas Wiederholung las den Stand, den die Wiederholung davor geschrieben hat.
    expect(b['r-00003'][0]).toBe('Anna Karenina / gesehen');
  });

  it('ein späterer Schritt derselben Wiederholung sieht, was ein früherer in den Datensatz geschrieben hat (Story 4S-001198, AK2)', async () => {
    const w = await welt();
    await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-update "Library" "{{record:id}}" loanNote="neu {{record:pages}}"',
      '  db-update "Library" "{{record:id}}" title="{{record:title}} / {{record:loanNote}}"',
      'end',
    );
    const b = bestand(lies(w.lib));
    expect(b['r-00002'][0]).toBe('Zauberberg / neu 1000');
    expect(b['r-00003'][0]).toBe('Anna Karenina / neu 864');
  });

  it('löscht ein Schritt den Datensatz der Wiederholung, schlägt ein späterer mit einem Feld fehl', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-delete "Library" "{{record:id}}"',
      '  db-update "Library" "Solaris" loanNote="{{record:title}}"',
      'end',
    );
    expect(ergebnis).toMatchObject({
      status: 'failed',
      line: 8,
      code: 'dbRecordUnknown',
      detail: { table: 'Library', record: 'r-00002' },
    });
    expect(bestand(lies(w.lib))['r-00001'][2]).toBe('');
  });

  it('ein in der Schleife verschwundener Datensatz beendet den Lauf mit Grund, statt still übersprungen zu werden', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-update "Library" "{{record:id}}" loanNote="vorher"',
      '  db-delete "Library" "Anna Karenina"',
      'end',
    );
    expect(ergebnis).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'dbRecordUnknown',
      detail: { table: 'Library', record: 'r-00003' },
    });
  });

  it('eine leere Menge ist kein Fehlschlag; eine gruppierte Abfrage liefert keine Datensätze', async () => {
    const w = await welt();
    expect(await w.lauf('db-for-each "Leer.md"', '  notify "x"', 'end')).toEqual({ status: 'ok' });
    expect(w.meldungen).toEqual([]);
    expect(await w.lauf('db-for-each "Gruppiert.md"', '  notify "x"', 'end')).toMatchObject({
      status: 'failed',
      code: 'dbQueryNoRecords',
    });
  });

  it('bei 501 Datensätzen schlägt die Schleife vor der ersten Wiederholung fehl', async () => {
    const viele = Array.from({ length: 501 }, (_, i) => [
      `r-${String(i + 1).padStart(5, '0')}`,
      `Buch ${i + 1}`,
      600,
    ]);
    const w = await welt({ buecher: viele });
    const vorher = lies(w.lib);
    const ergebnis = await w.lauf(
      'db-for-each "Long Books.md"',
      '  db-update "Library" "{{record:id}}" loanNote="x"',
      'end',
    );
    expect(ergebnis).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'tooManyRecords',
      detail: { max: 500, count: 501 },
    });
    expect(lies(w.lib)).toBe(vorher);
  });

  it('Kartei-Form: {{record:file}} ist die Karteikarte, {{record:table}} die Tabelle', async () => {
    const w = await welt();
    await w.lauf(
      'db-for-each "Kartei.md"',
      '  notify "{{record:file}} | {{record:table}} | {{record:name}}"',
      'end',
    );
    expect(w.meldungen).toEqual(['Autoren/Ada.md | Autoren | Ada']);
  });
});

describe('{{created:…}} und {{db:…}} an der realen Konstellation (4T-002547, AK4, AK5)', () => {
  it('db-create … as "neu", danach db-update und db-delete über {{created:neu}}', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-create "Library" title="Probe-Buch" pages="120" as "neu"',
      'db-update "Library" "{{created:neu}}" pages="130"',
      'notify "{{created:neu}}: {{db:Library:Probe-Buch:pages}}"',
      'db-delete "Library" "{{created:neu}}"',
    );
    expect(ergebnis).toEqual({ status: 'ok' });
    expect(w.meldungen).toEqual(['r-00004: 130']);
    expect(lies(w.lib)).not.toContain('Probe-Buch');
  });

  it('{{db:…}} liest den Wert zum Zeitpunkt des Schritts', async () => {
    const w = await welt();
    await w.lauf(
      'notify "vorher {{db:Library:Solaris:pages}}"',
      'db-update "Library" "Solaris" pages="300"',
      'notify "nachher {{db:Library:Solaris:pages}}"',
    );
    expect(w.meldungen).toEqual(['vorher 224', 'nachher 300']);
  });

  it.each([
    ['Datensatz nicht gefunden', 'notify "{{db:Library:Gibt es nicht:pages}}"', 'dbRecordUnknown'],
    ['Feld unbekannt', 'notify "{{db:Library:Solaris:seiten}}"', 'dbFieldUnknown'],
    ['Tabelle unbekannt', 'notify "{{db:Bibliothek:Solaris:pages}}"', 'dbTableUnknown'],
  ])('%s ist ein Fehlschlag mit Grund, nie ein leerer Text', async (_name, zeile, code) => {
    const w = await welt();
    const ergebnis = await w.lauf(zeile);
    expect(ergebnis).toMatchObject({ status: 'failed', line: 6, code });
    expect(w.meldungen).toEqual([]);
  });

  it('uneindeutig: zwei Datensätze mit derselben Anzeige-Form', async () => {
    const w = await welt({ buecher: [...BUECHER, ['r-00004', 'Solaris', 300]] });
    const ergebnis = await w.lauf('notify "{{db:Library:Solaris:pages}}"');
    expect(ergebnis).toMatchObject({ status: 'failed', code: 'dbRecordAmbiguous' });
    expect(w.meldungen).toEqual([]);
  });
});
