// 4T-002691 (Epic 3E-000415, Story 4S-001215, Tc Option (a)): Die
// Datei-Befehle der Workflows auf Karteikarten.
//
// Geprüft wird an den ECHTEN Schritt-Modulen (`workflow-file-steps.js` mit der
// echten Umbenenn-Strecke, `workflow-maintenance-steps.js`) mit der echten
// Weiche des Bereichs-Panels (`kartei-weichen.js`) und der echten
// Schreib-Schnittstelle samt Klammer des Absichts-Protokolls, am echten
// Dateisystem in temporären Ordnern (Aufbau nach `db-kartei-weichen.test.js`
// und `workflow-file-steps.test.js`).
//
// **Eine eigene Prüfdatei**, weil `workflow-file-steps.test.js` und
// `workflow-maintenance-steps.test.js` je nach Zeilen-Budget nicht wachsen
// sollen und der Aufbau der Schnittstelle sonst ein weiteres Mal dort stünde.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { erzeugeKarteiWeichen } from '../../src/main/database/kartei-weichen.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { schluesselRegel } from '../../src/main/database/record-regel-schluessel.js';
import { loeschschutzRegel } from '../../src/main/database/record-regel-loeschschutz.js';
import { berechtigungRegel } from '../../src/main/database/record-regel-berechtigung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegeDesDatensatzes, leseBelegDatei } from '../../src/main/database/change-log.js';
import { ART_CREATE, ART_DELETE } from '../../src/shared/database/change-record.js';
import { verschiebeInPapierkorb } from '../../src/main/documents/papierkorb.js';
import { loeseRechte } from '../../src/shared/database/rechte.js';
import { legeRollenAus } from '../../src/shared/database/rollen-angaben.js';
import { setzeUhrVersatzAus } from '../uhr-versatz.js';

const require = createRequire(import.meta.url);
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const {
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');
const { createRenameCascade } = require('../../src/main/documents/rename-cascade.js');
const { createLinkUpdate } = require('../../src/main/documents/link-update.js');
const { createFileWatching } = require('../../src/main/documents/file-watching.js');
const subpages = require('../../src/shared/subpages.js');
const selbstSchreib = require('../../src/main/documents/self-write.js');
const {
  ENTPRELL_MS,
  createWorkflowEventChecker,
} = require('../../src/main/checks/workflow-event-check.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');

setzeUhrVersatzAus('vergleicht die Uhr mit Datei-Zeiten (Alter gegen Frist)');

const IST_MARKDOWN = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);
const ZEITPUNKT = '2026-11-14T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-027' };
const KONFIG = { leseKonfig: async () => undefined };

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
  vi.useRealTimers();
  selbstSchreib._laufLeeren();
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const AUTOREN = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '    - name: ort',
  '  key: name',
  '  lastId: 2',
  '---',
  '',
  'Autoren des Verlags.',
  '',
].join('\n');

const ADA = ['---', 'db-record: r-00001', 'name: Ada', 'ort: London', '---', '', 'Text.', ''].join(
  '\n',
);

const BUECHER = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: titel',
  '    - name: autor',
  '      type: record',
  '      options:',
  '        table: Autoren',
  '  lastId: 0',
  '---',
  '',
].join('\n');

const STECKBRIEF = ['---', 'db-database:', '  name: Verlag', '---', '', 'Der Verlag.', ''].join(
  '\n',
);

// Ein Dokument mit Kennung im Dateikopf, das keine Karteikarte ist, solange
// es nicht im Ordner einer Kartei-Tabelle liegt.
const MIT_KENNUNG = ['---', 'db-record: r-00009', 'name: Neu', '---', ''].join('\n');

function kopfVon(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  return m ? m[1] : '';
}

function papierkorbIn(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  return (pfad) =>
    verschiebeInPapierkorb(pfad, {
      trashItem: async (ziel) => fs.renameSync(ziel, path.join(ordner, path.basename(ziel))),
    });
}

function inhalt(ordner) {
  return fs.existsSync(ordner) ? fs.readdirSync(ordner).sort() : [];
}

// Die Schreib-Schnittstelle eines Prozesses, aufgebaut wie in
// `db-kartei-weichen.test.js`; die Aufträge werden samt Zahl der
// Zusatz-Argumente mitgeschrieben.
function schnittstelleFuer(root, korb, { regeln, rechteFuer }) {
  const papierkorb = papierkorbIn(korb);
  const sperrVerwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, ...KONFIG, papierkorb });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    herkunft: () => HERKUNFT,
    papierkorb,
  });
  const pruefNaht = erzeugePruefNaht({
    regeln,
    tabellenSicht: () => ({
      status: 'ready',
      sicht: {
        dbKindsPerFile: new Map([
          [path.join(root, 'Autoren', 'Autoren.md'), ['table']],
          [path.join(root, 'Buecher.md'), ['table']],
        ]),
      },
    }),
    fsp: fs.promises,
    ...(rechteFuer ? { rechteFuer } : {}),
  });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    pruefNaht,
  });
}

// Ein Bereich mit der Kartei-Tabelle «Autoren» samt Karteikarte «Ada», der
// Tabelle «Buecher» mit einem Verweis-Feld auf «Autoren» und einem Steckbrief;
// dazu die echten Datei- und Pflege-Schritte mit der echten Weiche.
function welt({
  aktiv = true,
  mitWeiche = true,
  regeln = [verweisRegel, schluesselRegel, loeschschutzRegel],
  rechteFuer,
  echteMarke = false,
  schnittstelleWirft = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-kartei-'));
  tmpDirs.push(root);
  const korb = `${root}-korb`;
  const wfKorb = `${root}-wfkorb`;
  tmpDirs.push(korb, wfKorb);
  const schreibe = (rel, text) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    return abs;
  };
  const autoren = schreibe('Autoren/Autoren.md', AUTOREN);
  const ada = schreibe('Autoren/Ada.md', ADA);
  schreibe('Buecher.md', BUECHER);
  schreibe('Verlag.md', STECKBRIEF);
  const schnittstelle = schnittstelleFuer(root, korb, { regeln, rechteFuer });
  const auftraege = [];
  const gezaehlt = {
    fuehreAuftragAus: (wurzel, auftrag, ...rest) => {
      auftraege.push({ auftrag, zusatz: rest.length });
      if (schnittstelleWirft) throw new TypeError('Schnittstelle kaputt');
      return schnittstelle.fuehreAuftragAus(wurzel, auftrag, ...rest);
    },
  };
  const karteiWeichen = mitWeiche
    ? erzeugeKarteiWeichen({
        schreibSchnittstelle: gezaehlt,
        erweiterungAktiv: () => aktiv,
        fsp: fs.promises,
      })
    : undefined;
  const gemerkt = [];
  const merkeLaufStand = (pfad, neu) => gemerkt.push({ pfad, neu });
  const broadcast = () => {};
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    areaOfWindow: () => ({ rootPath: root }),
    isMarkdownPath: IST_MARKDOWN,
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast,
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
  });
  const deps = {
    subpages,
    isMarkdownPath: IST_MARKDOWN,
    renameSingleFile: lu.renameSingleFile,
    sendBookStateForDirs: async () => {},
    renamesFromPairs: lu.renamesFromPairs,
    applyLinkUpdatesForRename: lu.applyLinkUpdatesForRename,
    broadcast,
    karteiWeichen,
    ...(echteMarke ? {} : { merkeLaufStand }),
  };
  const dateiSchritte = createWorkflowFileSteps({ ...deps, cascade: createRenameCascade(deps) });
  const wfPapierkorb = [];
  const pflegeSchritte = createWorkflowMaintenanceSteps({
    ...deps,
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    trashItem: async (p) => {
      wfPapierkorb.push(p);
      fs.mkdirSync(wfKorb, { recursive: true });
      fs.renameSync(p, path.join(wfKorb, path.basename(p)));
    },
  });
  const ctx = {
    root,
    owner: {},
    event: {},
    workflowAbs: path.join(root, 'Workflows', 'Ablauf.md'),
    backlinks: { bufferTextFor: () => null },
  };
  const lauf = (keyword, args, extra = {}) => {
    const step = { line: 5, blockLine: 1, keyword, args, source: null, position: null, ...extra };
    return keyword === 'delete'
      ? pflegeSchritte.runMaintenanceStep(ctx, step)
      : dateiSchritte.runFileStep(ctx, step);
  };
  const abs = (rel) => path.join(root, ...rel.split('/'));
  const lies = (rel) => fs.readFileSync(abs(rel), 'utf8');
  const da = (rel) => fs.existsSync(abs(rel));
  return {
    root,
    korb,
    autoren,
    ada,
    schnittstelle,
    karteiWeichen,
    auftraege,
    gemerkt,
    wfPapierkorb,
    lauf,
    abs,
    lies,
    da,
    schreibe,
  };
}

async function belegeVon(bezugsPfad) {
  return (await leseBelegDatei(bezugsPfad)).belege.filter((b) => !b.beschaedigt);
}

// Ein Buch, das auf Ada verweist: Der Lösch-Schutz weist dann ab.
async function adaVerwiesen(w) {
  const buch = await w.schnittstelle.fuehreAuftragAus(w.root, {
    anweisungen: [
      { tabelle: 'Buecher.md', art: 'create', werte: { titel: 'Notes', autor: 'Ada' } },
    ],
  });
  expect(buch.ok).toBe(true);
}

// --- Punkt 1: die drei abgeleiteten Aussagen ------------------------------------------------

// Am Stand vor dem Bau gefahren (Ergebnis im Kapitel «Lösung» des Tasks); ohne
// Weiche zeigen dieselben Fälle weiter das Verhalten vor dem Bau.
describe('Belege der abgeleiteten Aussagen ohne Weiche (4T-002691, Punkt 1)', () => {
  it('copy einer Karteikarte in denselben Ordner erzeugt eine zweite Datei mit derselben Kennung', async () => {
    const w = welt({ mitWeiche: false });
    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);
    expect(res.ok).toBe(true);
    expect(kopfVon(w.lies('Autoren/Ada 2.md'))).toContain('db-record: r-00001');
  });

  it('move einer Karteikarte in einen anderen Ordner nimmt sie aus der Tabelle', async () => {
    const w = welt({ mitWeiche: false });
    const weichen = erzeugeKarteiWeichen({
      schreibSchnittstelle: w.schnittstelle,
      erweiterungAktiv: () => true,
      fsp: fs.promises,
    });
    expect(await weichen.karteikarteVon(w.ada)).not.toBeNull();
    const res = await w.lauf('move', ['Autoren/Ada.md', 'Archiv']);
    expect(res.ok).toBe(true);
    expect(await weichen.karteikarteVon(w.abs('Archiv/Ada.md'))).toBeNull();
  });

  it('create mit einer Vorlage mit db-record legt im Ordner der Kartei-Tabelle eine Karteikarte an', async () => {
    const w = welt({ mitWeiche: false });
    const weichen = erzeugeKarteiWeichen({
      schreibSchnittstelle: w.schnittstelle,
      erweiterungAktiv: () => true,
      fsp: fs.promises,
    });
    const res = await w.lauf('create', ['Autoren/Neu.md'], {
      source: { kind: 'template', path: 'Vorlage.md', text: MIT_KENNUNG },
    });
    expect(res.ok).toBe(true);
    expect(await weichen.karteikarteVon(w.abs('Autoren/Neu.md'))).toMatchObject({
      kennung: 'r-00009',
      tabelle: w.autoren,
    });
  });
});

// --- Hineinlegen ------------------------------------------------------------------------------

describe('Hineinlegen einer Datei mit Kennung in den Ordner einer Kartei-Tabelle (AK5)', () => {
  const HALT = (pfad, table = 'Autoren') => ({
    ok: false,
    code: 'dbRecordIntoTable',
    detail: { path: pfad, table },
  });

  it('create mit Kennung hält an, und nichts entsteht; ohne Kennung läuft es', async () => {
    const w = welt();
    const mit = await w.lauf('create', ['Autoren/Neu.md'], {
      source: { kind: 'template', path: 'Vorlage.md', text: MIT_KENNUNG },
    });
    expect(mit).toEqual(HALT('Autoren/Neu.md'));
    expect(w.da('Autoren/Neu.md')).toBe(false);
    const ohne = await w.lauf('create', ['Autoren/Notiz.md'], {
      source: { kind: 'template', path: 'Vorlage.md', text: '# Notiz\n' },
    });
    expect(ohne.ok).toBe(true);
    expect(w.auftraege).toEqual([]);
  });

  it('create mit Kennung außerhalb eines Kartei-Ordners läuft wie bisher', async () => {
    const w = welt();
    const res = await w.lauf('create', ['Fremd/Neu.md'], {
      source: { kind: 'template', path: 'Vorlage.md', text: MIT_KENNUNG },
    });
    expect(res.ok).toBe(true);
  });

  it('der Schritt von db-query … into ohne under (create aus fertigem Text) hält ebenso an', async () => {
    const w = welt();
    // Dieselbe Schritt-Form wie in `workflow-db-query.js` (runDbQueryStep).
    const schritt = { blockLine: 1, position: null };
    const mit = await w.lauf('create', ['Autoren/Ergebnis.md'], {
      ...schritt,
      source: { kind: 'template', text: MIT_KENNUNG },
    });
    expect(mit).toEqual(HALT('Autoren/Ergebnis.md'));
    const tabelle = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    const ohne = await w.lauf('create', ['Autoren/Ergebnis.md'], {
      ...schritt,
      source: { kind: 'template', text: tabelle },
    });
    expect(ohne.ok).toBe(true);
  });

  it('copy einer Datei mit Kennung, die keine Karteikarte ist, hält an; ohne Kennung läuft sie', async () => {
    const w = welt();
    w.schreibe('Fremd/Bert.md', MIT_KENNUNG);
    w.schreibe('Fremd/Notiz.md', '# Notiz\n');
    expect(await w.lauf('copy', ['Fremd/Bert.md', 'Autoren/Bert.md'])).toEqual(
      HALT('Fremd/Bert.md'),
    );
    expect(w.da('Autoren/Bert.md')).toBe(false);
    expect((await w.lauf('copy', ['Fremd/Notiz.md', 'Autoren/Notiz.md'])).ok).toBe(true);
    expect(w.auftraege).toEqual([]);
  });

  it('copy einer Karteikarte in den Ordner einer anderen Kartei-Tabelle hält an', async () => {
    const w = welt();
    w.schreibe('Verlage/Verlage.md', AUTOREN.replace('Autoren des Verlags.', 'Verlage.'));
    expect(await w.lauf('copy', ['Autoren/Ada.md', 'Verlage/Ada.md'])).toEqual(
      HALT('Autoren/Ada.md', 'Verlage'),
    );
    expect(w.da('Verlage/Ada.md')).toBe(false);
    expect(w.auftraege).toEqual([]);
  });

  it('move einer Datei mit Kennung in den Kartei-Ordner hält an, und sie bleibt; ohne Kennung läuft es', async () => {
    const w = welt();
    w.schreibe('Fremd/Bert.md', MIT_KENNUNG);
    w.schreibe('Fremd/Notiz.md', '# Notiz\n');
    expect(await w.lauf('move', ['Fremd/Bert.md', 'Autoren'])).toEqual(HALT('Fremd/Bert.md'));
    expect(w.lies('Fremd/Bert.md')).toBe(MIT_KENNUNG);
    expect((await w.lauf('move', ['Fremd/Notiz.md', 'Autoren'])).ok).toBe(true);
  });

  it('im Aus-Zustand der Erweiterung «Datenbank» laufen create, copy und move wie bisher (AK6)', async () => {
    const w = welt({ aktiv: false });
    w.schreibe('Fremd/Bert.md', MIT_KENNUNG);
    w.schreibe('Fremd/Carl.md', MIT_KENNUNG);
    const neu = await w.lauf('create', ['Autoren/Neu.md'], {
      source: { kind: 'template', path: 'Vorlage.md', text: MIT_KENNUNG },
    });
    expect(neu.ok).toBe(true);
    expect((await w.lauf('copy', ['Fremd/Bert.md', 'Autoren/Bert.md'])).ok).toBe(true);
    expect((await w.lauf('move', ['Fremd/Carl.md', 'Autoren'])).ok).toBe(true);
  });
});

// --- Review Runde 1: Endungen -------------------------------------------------------------------

describe('Endungen bei copy, move, create und rename (Review Runde 1, Nr. 1 und Nr. 2)', () => {
  const HALT = (pfad, code = 'dbRecordIntoTable') => ({
    ok: false,
    code,
    detail: { path: pfad, table: 'Autoren' },
  });

  it('copy einer .txt mit Kennung auf ein .md-Ziel im Kartei-Ordner hält an', async () => {
    const w = welt();
    w.schreibe('Fremd/Bert.txt', MIT_KENNUNG);
    expect(await w.lauf('copy', ['Fremd/Bert.txt', 'Autoren/Bert.md'])).toEqual(
      HALT('Fremd/Bert.txt'),
    );
    expect(w.da('Autoren/Bert.md')).toBe(false);
    // Als .txt bleibt sie keine Karteikarte und läuft.
    expect((await w.lauf('copy', ['Fremd/Bert.txt', 'Autoren/Bert.txt'])).ok).toBe(true);
  });

  // Absicherungsfall, keine Behebung (Review Runde 2, Nr. 2): Bei move haben
  // Quelle und Ziel immer dieselbe Endung; der Fall hält das fest.
  it('Absicherung: move einer .txt mit Kennung in den Kartei-Ordner behält die Endung und läuft; sie wird keine Karteikarte', async () => {
    const w = welt();
    w.schreibe('Fremd/Bert.txt', MIT_KENNUNG);
    expect((await w.lauf('move', ['Fremd/Bert.txt', 'Autoren'])).ok).toBe(true);
    expect(await w.karteiWeichen.karteikarteVon(w.abs('Autoren/Bert.txt'))).toBeNull();
  });

  it('create aus einer .txt mit Kennung auf ein .md-Ziel im Kartei-Ordner hält an', async () => {
    const w = welt();
    w.schreibe('Fremd/Bert.txt', MIT_KENNUNG);
    const res = await w.lauf('create', ['Autoren/Bert.md'], {
      source: { kind: 'file', path: 'Fremd/Bert.txt' },
    });
    expect(res).toEqual(HALT('Autoren/Bert.md'));
    expect(w.da('Autoren/Bert.md')).toBe(false);
  });

  it('rename einer Karteikarte auf .txt hält mit eigenem Code an (Review Runde 2, Nr. 1)', async () => {
    const w = welt();
    expect(await w.lauf('rename', ['Autoren/Ada.md', 'Ada.txt'])).toEqual({
      ok: false,
      code: 'dbCardRenamedAway',
      detail: { path: 'Autoren/Ada.md', table: 'Autoren', name: 'Ada.txt' },
    });
    expect(w.lies('Autoren/Ada.md')).toBe(ADA);
    expect(w.da('Autoren/Ada.txt')).toBe(false);
  });

  it('rename einer .txt mit Kennung auf .md im Kartei-Ordner hält mit eigenem Code an (Review Runde 2, Nr. 1)', async () => {
    const w = welt();
    w.schreibe('Autoren/Bert.txt', MIT_KENNUNG);
    expect(await w.lauf('rename', ['Autoren/Bert.txt', 'Bert.md'])).toEqual({
      ok: false,
      code: 'dbRecordRenamedIn',
      detail: { path: 'Autoren/Bert.txt', table: 'Autoren', name: 'Bert.md' },
    });
    expect(w.da('Autoren/Bert.md')).toBe(false);
  });

  it('rename einer Karteikarte im selben Ordner ohne Endungswechsel läuft wie von Hand', async () => {
    const w = welt();
    expect((await w.lauf('rename', ['Autoren/Ada.md', 'Ada Byron.md'])).ok).toBe(true);
    expect(w.lies('Autoren/Ada Byron.md')).toBe(ADA);
    expect(w.auftraege).toEqual([]);
  });
});

// --- delete ---------------------------------------------------------------------------------

describe('delete einer Karteikarte über die Weiche (AK2)', () => {
  it('erlaubt die Schnittstelle das Löschen: Lösch-Beleg an der Tabelle, Karte und Beleg-Datei im Papierkorb, .mdd geht mit', async () => {
    const w = welt();
    w.schreibe('Autoren/Ada.mdd', '{}\n');

    const res = await w.lauf('delete', ['Autoren/Ada.md']);

    expect(res).toEqual({
      ok: true,
      effect: { kind: 'trashed', paths: [w.ada], via: 'disk' },
    });
    expect(w.auftraege.map((a) => a.auftrag.anweisungen[0].art)).toEqual(['delete']);
    expect(w.auftraege[0].zusatz).toBe(1);
    const kette = await belegeDesDatensatzes(w.autoren, 'r-00001');
    expect(kette.belege.map((b) => b.art)).toEqual([ART_DELETE]);
    expect(w.da('Autoren/Ada.md')).toBe(false);
    expect(inhalt(w.korb)).toContain('Ada.md');
    // Der Papierkorb des Schritts nimmt allein die Begleitdatei .mdd.
    expect(w.wfPapierkorb).toEqual([w.abs('Autoren/Ada.mdd')]);
  });

  it('weist die Schnittstelle ab, bleibt die Karte, und der Schritt scheitert mit dem Satz der Datenbank', async () => {
    const w = welt();
    await adaVerwiesen(w);

    const res = await w.lauf('delete', ['Autoren/Ada.md']);

    expect(res.ok).toBe(false);
    expect(res.code).toBe('dbRejected');
    expect(res.detail.table).toBe('Autoren');
    expect(res.detail.record).toBe('r-00001');
    expect(res.detail.lagen[0].naht.code).toBe(REGEL_LAGEN.loeschenAbhaengige);
    expect(w.lies('Autoren/Ada.md')).toBe(ADA);
    expect(w.wfPapierkorb).toEqual([]);
  });

  it('löscht ein Dokument ohne Kennung, die Tabellen-Datei und den Steckbrief wie bisher (AK6)', async () => {
    const w = welt();
    w.schreibe('Autoren/Notiz.md', '# Notiz\n');
    for (const rel of ['Autoren/Notiz.md', 'Verlag.md', 'Autoren/Autoren.md']) {
      expect((await w.lauf('delete', [rel])).ok, rel).toBe(true);
    }
    expect(w.auftraege).toEqual([]);
    expect(w.wfPapierkorb).toEqual(
      ['Autoren/Notiz.md', 'Verlag.md', 'Autoren/Autoren.md'].map(w.abs),
    );
  });

  it('löscht einen Ordner mit einer ganzen Kartei-Tabelle wie von Hand (AK10)', async () => {
    const w = welt();
    const res = await w.lauf('delete', ['Autoren']);
    expect(res.ok).toBe(true);
    expect(w.auftraege).toEqual([]);
    expect(w.wfPapierkorb).toEqual([w.abs('Autoren')]);
  });

  it('löscht im Aus-Zustand der Erweiterung «Datenbank» eine Karteikarte wie jede Datei (AK6)', async () => {
    const w = welt({ aktiv: false });
    expect((await w.lauf('delete', ['Autoren/Ada.md'])).ok).toBe(true);
    expect(w.auftraege).toEqual([]);
    expect(w.wfPapierkorb).toEqual([w.ada]);
  });
});

// --- copy -----------------------------------------------------------------------------------

describe('copy einer Karteikarte über die Weiche (AK3)', () => {
  it('die Kopie im Ordner der Tabelle trägt eine neue Kennung und einen Anlege-Beleg; die Lauf-Marke ist gesetzt', async () => {
    const w = welt();

    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);

    expect(res).toEqual({
      ok: true,
      effect: { kind: 'copied', paths: [w.abs('Autoren/Ada 2.md')], via: 'disk' },
    });
    const kopf = kopfVon(w.lies('Autoren/Ada 2.md'));
    expect(kopf).toContain('db-record: r-00003');
    expect(kopf).toContain('name: Ada 2');
    expect(kopfVon(w.lies('Autoren/Ada.md'))).toContain('db-record: r-00001');
    const belege = await belegeVon(w.abs('Autoren/Ada 2.md'));
    expect(belege.map((b) => [b.art, b.id])).toEqual([[ART_CREATE, 'r-00003']]);
    expect(w.auftraege[0].zusatz).toBe(1);
    // Die Lauf-Marke trägt die neue Karte mit ihrem Inhalt: Kein Ereignis-Workflow.
    const marke = w.gemerkt.find((m) => m.pfad === w.abs('Autoren/Ada 2.md'));
    expect(marke).toBeDefined();
    expect(String(marke.neu)).toContain('db-record: r-00003');
  });

  it('die Kopie meldet sich beim Ereignis-Prüfer als Schreibvorgang des Laufs (keine Fälligkeit)', async () => {
    const w = welt({ echteMarke: true });
    expect((await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md'])).ok).toBe(true);
    const neu = w.abs('Autoren/Ada 2.md');
    for (const type of ['file-created', 'file-changed']) {
      expect(await selbstSchreib.istLaufSchreibvorgang({ type, path: neu }), type).toBe(true);
    }
  });

  // Review Runde 1, Nr. 4: allein der Schlüssel vergeben, keine Datei dieses Namens.
  // 4T-002821 (Epic 3E-000445): Der Fehlschlag trägt die Lage der Datenbank,
  // damit das Fenster den Grund nennt statt des allgemeinen Satzes.
  it('ist allein der Schlüssel vergeben, ist es eine Abweisung der Datenbank mit dem Grund, nicht targetExists', async () => {
    const w = welt();
    w.schreibe(
      'Autoren/Zweit.md',
      ['---', 'db-record: r-00002', 'name: Ada 2', '---', ''].join('\n'),
    );
    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('dbRejected');
    expect(res.detail).toMatchObject({ table: 'Autoren', record: 'r-00001' });
    expect(res.detail.lagen).toHaveLength(1);
    expect(res.detail.lagen[0].naht.code).toBe(REGEL_LAGEN.schluesselDoppeltImBestand);
    expect(w.da('Autoren/Ada 2.md')).toBe(false);
    expect(w.lies('Autoren/Autoren.md')).toBe(AUTOREN);
  });

  // Review Runde 1, Nr. 3: Eine Ausnahme, die keine Abweisung ist.
  it('wirft die Schnittstelle, wird das protokolliert und als writeFailed gemeldet', async () => {
    const w = welt({ schnittstelleWirft: true });
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);
      expect(res).toEqual({
        ok: false,
        code: 'writeFailed',
        detail: { path: 'Autoren/Ada 2.md', fsCode: null },
      });
      expect(fehler).toHaveBeenCalledWith(
        '[workflow] Kopie der Karteikarte fehlgeschlagen:',
        'Schnittstelle kaputt',
      );
      expect(w.da('Autoren/Ada 2.md')).toBe(false);
    } finally {
      fehler.mockRestore();
    }
  });

  it('ein belegter Name ist targetExists, ohne freie Nummer', async () => {
    const w = welt();
    w.schreibe('Autoren/Ada 2.md', '# belegt\n');
    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);
    expect(res).toEqual({ ok: false, code: 'targetExists', detail: { path: 'Autoren/Ada 2.md' } });
    expect(w.da('Autoren/Ada 3.md')).toBe(false);
    expect(w.lies('Autoren/Autoren.md')).toBe(AUTOREN);
  });

  it('jede andere Abweisung ist ein Fehlschlag mit dem Satz der Datenbank, und nichts entsteht', async () => {
    const { rollen } = legeRollenAus({ roles: { gast: { Autoren: ['update'] } } });
    const w = welt({
      regeln: [berechtigungRegel],
      rechteFuer: async () => ({
        status: 'ready',
        ...loeseRechte({ rollen, tabellenNamen: ['Autoren'], defaultRole: 'gast' }),
      }),
    });
    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md']);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('dbRejected');
    expect(res.detail.lagen[0].naht.code).toBe(REGEL_LAGEN.nichtErlaubt);
    expect(w.da('Autoren/Ada 2.md')).toBe(false);
    expect(w.lies('Autoren/Autoren.md')).toBe(AUTOREN);
  });

  it('mit Ziel außerhalb des Ordners ihrer Tabelle eine gewöhnliche Datei-Kopie ohne Auftrag (AK10)', async () => {
    const w = welt();
    const res = await w.lauf('copy', ['Autoren/Ada.md', 'Archiv/Ada.md']);
    expect(res.ok).toBe(true);
    expect(w.lies('Archiv/Ada.md')).toBe(ADA);
    expect(w.auftraege).toEqual([]);
  });

  it('Tabellen-Datei und Steckbrief werden wie bisher kopiert (AK6)', async () => {
    const w = welt();
    expect((await w.lauf('copy', ['Verlag.md', 'Verlag 2.md'])).ok).toBe(true);
    expect((await w.lauf('copy', ['Autoren/Autoren.md', 'Kopie/Autoren.md'])).ok).toBe(true);
    expect(w.lies('Verlag 2.md')).toBe(STECKBRIEF);
    expect(w.lies('Kopie/Autoren.md')).toBe(AUTOREN);
    expect(w.auftraege).toEqual([]);
  });

  it('im Aus-Zustand der Erweiterung «Datenbank» wie bisher (AK6)', async () => {
    const w = welt({ aktiv: false });
    expect((await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md'])).ok).toBe(true);
    expect(w.lies('Autoren/Ada 2.md')).toBe(ADA);
    expect(w.auftraege).toEqual([]);
  });
});

// --- move und rename --------------------------------------------------------------------------

describe('move und rename einer Karteikarte (AK4, AK10)', () => {
  it('move aus dem Ordner ihrer Tabelle hält an, und die Karte bleibt', async () => {
    const w = welt();
    const res = await w.lauf('move', ['Autoren/Ada.md', 'Archiv']);
    expect(res).toEqual({
      ok: false,
      code: 'dbCardLeavesTable',
      detail: { path: 'Autoren/Ada.md', table: 'Autoren' },
    });
    expect(w.lies('Autoren/Ada.md')).toBe(ADA);
    expect(w.da('Archiv/Ada.md')).toBe(false);
  });

  it('rename im selben Ordner läuft wie bisher', async () => {
    const w = welt();
    const res = await w.lauf('rename', ['Autoren/Ada.md', 'Ada Lovelace.md']);
    expect(res.ok).toBe(true);
    expect(w.lies('Autoren/Ada Lovelace.md')).toBe(ADA);
    expect(w.auftraege).toEqual([]);
  });

  it('move und rename eines Ordners mit einer ganzen Kartei-Tabelle laufen ohne Halt', async () => {
    const w = welt();
    expect((await w.lauf('move', ['Autoren', 'Archiv'])).ok).toBe(true);
    expect(w.lies('Archiv/Autoren/Ada.md')).toBe(ADA);
    expect((await w.lauf('rename', ['Archiv/Autoren', 'Schreibende'])).ok).toBe(true);
    expect(w.lies('Archiv/Schreibende/Ada.md')).toBe(ADA);
    expect(w.auftraege).toEqual([]);
  });

  it('Tabellen-Datei und Steckbrief werden wie bisher verschoben (AK6)', async () => {
    const w = welt();
    expect((await w.lauf('move', ['Verlag.md', 'Archiv'])).ok).toBe(true);
    expect((await w.lauf('move', ['Autoren/Autoren.md', 'Archiv'])).ok).toBe(true);
    expect(w.lies('Archiv/Autoren.md')).toBe(AUTOREN);
  });

  it('im Aus-Zustand der Erweiterung «Datenbank» verschiebt move eine Karteikarte wie bisher (AK6)', async () => {
    const w = welt({ aktiv: false });
    expect((await w.lauf('move', ['Autoren/Ada.md', 'Archiv'])).ok).toBe(true);
    expect(w.lies('Archiv/Ada.md')).toBe(ADA);
  });
});

// --- Ereignis-Prüfer ----------------------------------------------------------------------------

// AK3: Eine Karteikarte, die ein Workflow über die Weiche kopiert, ergibt im
// echten Ereignis-Prüfer keine Fälligkeit (Muster «Erkennung im echten
// Ereignis-Prüfer» in `workflow-lauf-marke.test.js`); eine Datei des Anwenders
// im selben Ordner schon.
describe('keine Fälligkeit aus einer kopierten Karteikarte (AK3)', () => {
  const WF_TEXT = [
    '---',
    'workflow: true',
    'name: Karten-Wächter',
    'trigger: event',
    'event: file-created in "Autoren"',
    '---',
    '',
    '```workflow',
    'notify "neu"',
    '```',
    '',
  ].join('\n');

  it('die Kopie löst nichts aus, eine Datei des Anwenders schon', async () => {
    const w = welt({ echteMarke: true });
    expect((await w.lauf('copy', ['Autoren/Ada.md', 'Autoren/Ada 2.md'])).ok).toBe(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const zugestellt = [];
    const wf = w.abs('Workflows/Wächter.md');
    const c = createWorkflowEventChecker({
      areas: () => [{ root: w.root }],
      workflowFiles: () => ({
        status: 'ready',
        dateien: [{ absPath: wf, relPath: 'Workflows/Wächter.md' }],
      }),
      readText: async () => WF_TEXT,
      readRunState: async () => ({
        stand: { runs: 0, armed: { at: 'x', hash: definitionsPruefsumme(WF_TEXT) } },
        defekt: false,
      }),
      enabled: () => true,
      deliver: (nutzlast) => zugestellt.push(...nutzlast.items),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      istLaufSchreibvorgang: selbstSchreib.istLaufSchreibvorgang,
    });
    const ablauf = async () => {
      await c.idle();
      await vi.advanceTimersByTimeAsync(ENTPRELL_MS);
      await c.idle();
    };
    try {
      c.report({ type: 'file-created', path: w.abs('Autoren/Ada 2.md'), root: w.root });
      await ablauf();
      expect(zugestellt).toEqual([]);
      w.schreibe('Autoren/Von Hand.md', '# Von Hand\n');
      c.report({ type: 'file-created', path: w.abs('Autoren/Von Hand.md'), root: w.root });
      await ablauf();
      expect(zugestellt).toHaveLength(1);
      expect(zugestellt[0].event.file).toBe(w.abs('Autoren/Von Hand.md'));
    } finally {
      c.stop();
    }
  });
});
