// 4T-002548 (Epic 3E-000368, Stories 4S-001201 und 4S-001202, AK1 bis AK3): Die
// Masken- und Konsistenz-Befehle `db-open`, `db-open-list` und `db-check` im
// Hauptprozess, an der realen Konstellation.
//
// **Echt sind:** der Bereichs-Index (über den Bedarfs-Weg aufgebaut, Beobachter
// danach geschlossen, Muster `workflow-db-schleife.test.js`), die Schreib-
// Schnittstelle mit Sperr-Verwaltung und der Rechte-Funktion der Verdrahtung
// über einem echten Steckbrief (`erzeugeRechteFuer`), die Konsistenz-Prüfung
// der Übersicht (`pruefeKonsistenz`), die Schritt-Module und der Ablauf-Kern.
// Gestellt ist allein der Kanal zum Fenster: `deps.step` ruft die Module
// unmittelbar, `runWindowAction` schreibt den Fenster-Handgriff mit.
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
const { erzeugeRechteFuer } = require('../../src/main/database/record-regel-berechtigung.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const { createWorkflowDbSteps } = require('../../src/main/workflows/workflow-db-steps.js');
const {
  DB_FORM_KEYWORDS,
  createWorkflowDbMasken,
} = require('../../src/main/workflows/workflow-db-masken.js');
const { createDbSchreibStand } = require('../../src/main/workflows/workflow-db-schreibstand.js');
const { _laufLeeren, istLaufSchreibvorgang } = require('../../src/main/documents/self-write.js');
const { checkWorkflow } = require('../../src/shared/workflows/workflow-check.js');
const { readWorkflowDocument } = require('../../src/shared/workflows/workflow-document.js');
const { prepareRun } = require('../../src/shared/workflows/workflow-placeholders.js');
const { runWorkflow } = require('../../src/shared/workflows/workflow-runner.js');
const DE = require('../../src/i18n/fragments/de/workflows.json');

const BESITZER = 'db-masken-test';
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
function tabelle(lastId, saetze) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: title',
    '    - name: pages',
    '      type: number',
    '  display: title',
    `  lastId: ${lastId}`,
    '---',
    '',
    `${FENCE}perspective-records`,
    ...saetze.flatMap(([id, title, pages]) => [`|- id="${id}"`, `| ${title}`, `| ${pages}`]),
    FENCE,
    '',
  ].join('\n');
}
const BUECHER = [
  ['r-00001', 'Solaris', 224],
  ['r-00002', 'Zauberberg', 1000],
  ['r-00003', 'Anna Karenina', 864],
];
const ABFRAGE = [
  '---',
  'db-query:',
  '---',
  '',
  `${FENCE}perspective-query`,
  'TABLE RECORDS title',
  'FROM "Library"',
  FENCE,
  '',
].join('\n');
// Die Vorgabe-Rolle darf an «Library» nur ändern, an «Kaputt» auch anlegen.
const STECKBRIEF = [
  '---',
  'db-database:',
  '  name: Probe',
  '  roles:',
  '    leser:',
  '      Library: [update]',
  '      Kaputt: [create, update]',
  '  defaultRole: leser',
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

// Ein Bereich mit echtem Index und echter Schreib-Schnittstelle. `kaputt` legt
// eine zweite Tabelle mit zu niedrigem Hochwasserstand an (ein Befund der
// Konsistenz-Prüfung), `rollen` einen Steckbrief mit Rollen.
async function welt({ kaputt = false, rollen = false, an = true, pruefe = null } = {}) {
  const wurzel = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbmasken-')));
  wurzeln.push(wurzel);
  const lib = lege(wurzel, 'Daten/Library.md', tabelle(3, BUECHER));
  const kaputtPfad = kaputt
    ? lege(
        wurzel,
        'Daten/Kaputt.md',
        tabelle(1, [
          ['r-00001', 'A', 1],
          ['r-00002', 'B', 2],
        ]),
      )
    : null;
  if (rollen) lege(wurzel, 'Datenbank.md', STECKBRIEF);
  lege(wurzel, 'Listen/Alle Bücher.md', ABFRAGE);
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
  const rechteFuer = erzeugeRechteFuer({
    tabellenSicht: (w) => backlinks.datenbankSicht(null, w, { ohnePuffer: true }),
    fsp: fs.promises,
  });
  const schreibSchnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
      laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    }),
    erweiterungAktiv: () => an,
    rechteFuer,
    jetzt: () => '2026-11-10T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
  const schreibStand = createDbSchreibStand({ backlinks });
  const datenbankSchritte = createWorkflowDbSteps({
    schreibSchnittstelle,
    sperrVerwaltung,
    datenbankAktiv: () => an,
    backlinks,
    schreibStand,
  });
  const masken = createWorkflowDbMasken({
    datenbankSchritte,
    schreibSchnittstelle,
    schreibStand,
    tForWindow: (_w, key) => (key in DE ? DE[key] : key),
    resolveQueryTemplatesFolder: async () => null,
    ...(pruefe ? { pruefeKonsistenz: pruefe } : {}),
  });
  const ctx = {
    root: wurzel,
    owner: { id: 'Fenster' },
    event: { sender: { id: 7 } },
    workflowAbs: path.join(wurzel, 'Workflows', 'Probe.md'),
    backlinks,
  };
  const schritt = (keyword, args) => masken.runDbFormStep(ctx, { line: 3, keyword, args });
  const handgriffe = [];
  const meldungen = [];
  const deps = {
    flushBuffers: async () => {},
    // Die Schreib-Schritte für Läufe, die anlegen und danach öffnen oder prüfen.
    step: async (_pfad, step) =>
      DB_FORM_KEYWORDS.includes(step.keyword)
        ? masken.runDbFormStep(ctx, step)
        : datenbankSchritte.runDbStep(ctx, step),
    runWindowAction: async (antwort) => {
      handgriffe.push(antwort.window);
      return { ok: true, line: antwort.line, keyword: antwort.keyword };
    },
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
  return { wurzel, lib, kaputtPfad, schritt, lauf, handgriffe, meldungen };
}

describe('db-open (4T-002548, AK1)', () => {
  it('öffnet einen Datensatz über Anzeige-Form oder Kennung in der Standard-Maske', async () => {
    const w = await welt();
    expect(await w.schritt('db-open', ['Library', 'Solaris'])).toEqual({
      ok: true,
      window: { action: 'dbOpen', path: w.lib, record: 'r-00001', neu: false },
    });
    expect(await w.schritt('db-open', ['Daten/Library.md', 'r-00002'])).toMatchObject({
      ok: true,
      window: { record: 'r-00002', neu: false },
    });
  });

  it('ein unbekannter Datensatz und eine unbekannte Tabelle sind ein Fehlschlag mit Grund', async () => {
    const w = await welt();
    expect(await w.schritt('db-open', ['Library', 'Gibtsnicht'])).toEqual({
      ok: false,
      code: 'dbRecordUnknown',
      detail: { table: 'Library', record: 'Gibtsnicht' },
    });
    expect(await w.schritt('db-open', ['Bibliothek'])).toMatchObject({
      ok: false,
      code: 'dbTableUnknown',
    });
  });

  it('ohne Datensatz eröffnet die Schnittstelle die Neuanlage; der neue Kopf trägt die Lauf-Marke', async () => {
    const w = await welt();
    const vorher = lies(w.lib);
    expect(await w.schritt('db-open', ['Library'])).toEqual({
      ok: true,
      window: { action: 'dbOpen', path: w.lib, record: 'r-00004', neu: true },
    });
    const nachher = lies(w.lib);
    expect(nachher).not.toBe(vorher);
    expect(nachher).toContain('lastId: 4');
    // Die Änderung am Kopf löst kein Ereignis aus.
    expect(await istLaufSchreibvorgang({ type: 'file-changed', path: w.lib })).toBe(true);
  });

  it('ohne das Recht create ist die Neuanlage ein Fehlschlag mit Rolle, und keine Kennung wird gezogen', async () => {
    const w = await welt({ rollen: true, kaputt: true });
    const vorher = lies(w.lib);
    const ergebnis = await w.schritt('db-open', ['Library']);
    expect(ergebnis).toMatchObject({
      ok: false,
      code: 'dbRejected',
      detail: {
        table: 'Library',
        lagen: [{ code: 'auftragNichtErlaubt', operation: 'create', rolle: 'leser' }],
      },
    });
    expect(lies(w.lib)).toBe(vorher);
    // Wo die Rolle anlegen darf, gelingt es.
    expect(await w.schritt('db-open', ['Kaputt'])).toMatchObject({
      ok: true,
      window: { record: 'r-00003', neu: true },
    });
  });

  it('öffnet einen eben angelegten Datensatz über {{created:…}} (Story 4S-001201, AK6)', async () => {
    const w = await welt();
    const ergebnis = await w.lauf(
      'db-create "Library" title="Neu" pages="5" as "neu"',
      'db-open "Library" "{{created:neu}}"',
    );
    expect(ergebnis).toEqual({ status: 'ok' });
    expect(w.handgriffe).toEqual([
      { action: 'dbOpen', path: w.lib, record: 'r-00004', neu: false },
    ]);
  });

  it('läuft im Ablauf-Kern als Fenster-Handgriff', async () => {
    const w = await welt();
    expect(await w.lauf('db-open "Library" "Zauberberg"')).toEqual({ status: 'ok' });
    expect(w.handgriffe).toEqual([
      { action: 'dbOpen', path: w.lib, record: 'r-00002', neu: false },
    ]);
  });
});

describe('db-open-list (4T-002548, AK2)', () => {
  it('öffnet eine Abfrage-Datei wie open', async () => {
    const w = await welt();
    expect(await w.schritt('db-open-list', ['Listen/Alle Bücher.md'])).toEqual({
      ok: true,
      window: { action: 'open', path: path.join(w.wurzel, 'Listen', 'Alle Bücher.md') },
    });
  });

  it('eine Datei ohne Abfrage ist «keine Abfrage-Datei», eine fehlende ebenso', async () => {
    const w = await welt();
    for (const quelle of ['Notiz.md', 'Fehlt.md']) {
      expect(await w.schritt('db-open-list', [quelle])).toEqual({
        ok: false,
        code: 'dbQueryFileMissing',
        detail: { path: quelle },
      });
    }
  });
});

describe('db-check (4T-002548, AK3)', () => {
  it('ohne Befund: «Konsistenz: keine Befunde», für eine und für alle Tabellen', async () => {
    const w = await welt();
    for (const args of [['Library'], []]) {
      expect(await w.schritt('db-check', args)).toEqual({
        ok: true,
        notify: 'Konsistenz: keine Befunde',
        effect: { kind: 'unchanged', paths: [] },
      });
    }
  });

  it('mit Befund nennt die Meldung die Zahl und die Tabellen; die Datei bleibt unverändert', async () => {
    const w = await welt({ kaputt: true });
    const vorher = lies(w.kaputtPfad);
    expect((await w.schritt('db-check', [])).notify).toBe('Konsistenz: 1 Befund in ‹Kaputt›');
    expect((await w.schritt('db-check', ['Kaputt'])).notify).toBe(
      'Konsistenz: 1 Befund in ‹Kaputt›',
    );
    expect((await w.schritt('db-check', ['Library'])).notify).toBe('Konsistenz: keine Befunde');
    expect(lies(w.kaputtPfad)).toBe(vorher);
  });

  it('Mehrzahl, mehrere Tabellen und Befunde ohne Tabelle', async () => {
    const zeile = (name, befunde) => ({ name, befunde });
    const pruefe = async () => ({
      status: 'ready',
      befunde: [{}, {}, {}],
      tabellen: [zeile('Library', 2), zeile('Kaputt', 1), zeile('Leer', 0)],
    });
    const w = await welt({ pruefe });
    expect((await w.schritt('db-check', [])).notify).toBe(
      'Konsistenz: 3 Befunde in ‹Library›, ‹Kaputt›',
    );
    const ohne = await welt({
      pruefe: async () => ({ status: 'ready', befunde: [{}, {}], tabellen: [] }),
    });
    expect((await ohne.schritt('db-check', [])).notify).toBe('Konsistenz: 2 Befunde');
  });

  // Review-Runde 1 zu 3E-000368: Ein Tabellenname mit `$` wird wörtlich
  // eingesetzt; eine Ersetzung mit Text-Argument machte aus `$$` ein `$`.
  it('setzt einen Tabellennamen mit $ wörtlich ein', async () => {
    const pruefe = async () => ({
      status: 'ready',
      befunde: [{}, {}],
      tabellen: [
        { name: 'Kosten $$', befunde: 1 },
        { name: "A $& B $' C", befunde: 1 },
      ],
    });
    const w = await welt({ pruefe });
    expect((await w.schritt('db-check', [])).notify).toBe(
      "Konsistenz: 2 Befunde in ‹Kosten $$›, ‹A $& B $' C›",
    );
  });

  it('ein Befund hält den Lauf nicht an: die Meldung geht wie notify, der nächste Schritt läuft', async () => {
    const w = await welt({ kaputt: true });
    expect(await w.lauf('db-check', 'db-open "Library" "Solaris"')).toEqual({ status: 'ok' });
    expect(w.meldungen).toEqual(['Konsistenz: 1 Befund in ‹Kaputt›']);
    expect(w.handgriffe).toHaveLength(1);
  });

  it('ein im selben Lauf behobener Befund zählt nicht mehr (Story 4S-001202, AK6)', async () => {
    const w = await welt({ kaputt: true });
    expect(
      await w.lauf('db-check "Kaputt"', 'db-create "Kaputt" title="C"', 'db-check "Kaputt"'),
    ).toEqual({
      status: 'ok',
    });
    expect(w.meldungen).toEqual(['Konsistenz: 1 Befund in ‹Kaputt›', 'Konsistenz: keine Befunde']);
  });

  it('ein Fehler der Prüfung selbst ist ein Fehlschlag mit Grund und beendet den Lauf', async () => {
    const w = await welt({
      pruefe: async () => {
        throw new Error('kaputt');
      },
    });
    expect(await w.schritt('db-check', ['Library'])).toEqual({
      ok: false,
      code: 'dbCheckFailed',
      detail: { table: 'Library' },
    });
    expect(await w.lauf('db-check', 'notify "danach"')).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'dbCheckFailed',
    });
    expect(w.meldungen).toEqual([]);
    const fehler = await welt({ pruefe: async () => ({ status: 'error', code: 'x' }) });
    expect((await fehler.schritt('db-check', [])).code).toBe('dbCheckFailed');
    const ohneSicht = await welt({ pruefe: async () => ({ status: 'unavailable' }) });
    expect((await ohneSicht.schritt('db-check', [])).code).toBe('notReady');
  });
});

describe('Datenbank ausgeschaltet (4T-002548)', () => {
  it('jeder der drei Befehle weist mit der Lage «ausgeschaltet» ab', async () => {
    const w = await welt({ an: false });
    for (const [keyword, args] of [
      ['db-open', ['Library', 'Solaris']],
      ['db-open-list', ['Listen/Alle Bücher.md']],
      ['db-check', []],
    ]) {
      expect(DB_FORM_KEYWORDS).toContain(keyword);
      expect(await w.schritt(keyword, args)).toMatchObject({
        ok: false,
        code: 'dbRejected',
        detail: { lagen: [{ code: 'auftragErweiterungAus' }] },
      });
    }
  });
});

// Der Ablauf-Kern mit Attrappe des Hauptprozesses: `db-check` meldet sein
// Ergebnis wie `notify`, `db-open` und `db-open-list` kommen als
// Fenster-Handgriff zurück.
describe('Masken und Konsistenz im Ablauf-Kern (4T-002548)', () => {
  const s = (line, keyword, ...args) => ({
    line,
    blockLine: line,
    keyword,
    args,
    source: null,
    position: null,
  });
  const plan = (steps) => ({ path: 'C:/b/A.md', name: 'A', steps, children: {} });
  const antwort = (step, extra) => ({ ok: true, line: step.line, keyword: step.keyword, ...extra });
  function attrappe(step) {
    const calls = [];
    const deps = {
      flushBuffers: async () => {},
      step: async (_p, schritt) => {
        calls.push(`step:${schritt.keyword}`);
        return step(schritt);
      },
      runWindowAction: async (a) => {
        calls.push(`window:${a.window.action}`);
        return { ok: true, line: a.line, keyword: a.keyword, effect: { kind: 'opened' } };
      },
      notify: (text) => calls.push(`notify:${text}`),
    };
    return { deps, calls };
  }

  it('db-check: die Meldung des Hauptprozesses geht an notify, der Lauf geht weiter', async () => {
    // Die Attrappe antwortet je Befehl mit der Handlung, die das Modul liefert:
    // `db-open` mit `dbOpen`, `db-open-list` mit `open` (Fall «öffnet eine
    // Abfrage-Datei wie open» oben).
    const { deps, calls } = attrappe((step) => {
      if (step.keyword === 'db-check')
        return antwort(step, { notify: 'Konsistenz: keine Befunde' });
      if (step.keyword === 'db-open-list')
        return antwort(step, { window: { action: 'open', path: 'L.md' } });
      return antwort(step, { window: { action: 'dbOpen', path: 'T.md', record: 'r-1' } });
    });
    const p = plan([s(5, 'db-check'), s(6, 'db-open', 'T', 'r-1'), s(7, 'db-open-list', 'L.md')]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(calls).toEqual([
      'step:db-check',
      'notify:Konsistenz: keine Befunde',
      'step:db-open',
      'window:dbOpen',
      'step:db-open-list',
      'window:open',
    ]);
  });

  it('db-check ohne Text der Meldung ist ein Fehlschlag, nie eine leere Meldung', async () => {
    const { deps, calls } = attrappe((step) => antwort(step, {}));
    expect(await runWorkflow(plan([s(5, 'db-check')]), deps)).toMatchObject({
      status: 'failed',
      line: 5,
      code: 'unexpected',
    });
    expect(calls.filter((c) => c.startsWith('notify:'))).toEqual([]);
  });
});
