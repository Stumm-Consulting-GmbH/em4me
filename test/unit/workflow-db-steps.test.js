// 4T-002545 (Epic 3E-000368, Stories 4S-001196 und 4S-001200): Die
// Schreib-Schritte der Datenbank im Hauptprozess (src/main/workflows/
// workflow-db-steps.js) — Auflösung von Tabelle und Datensatz (Da, AK1),
// Erwartung und Sperre (Ausführungs-Entscheidung 3, Df, AK2), die Abbildung der
// Lagen auf Fehlschläge samt fehlendem Recht (Df, De, AK3) und die neue Kennung
// im Ergebnis (AK5).
//
// **Gearbeitet wird an der ECHTEN Schreib-Schnittstelle** mit echter
// Sperr-Verwaltung, Klammer und Wiederanlauf in einem temporären Ordner, wie
// in `db-record-auftrag.test.js`; die Prüfregel und das Recht laufen über die
// echte Prüf-Naht. Gestellt sind allein die Index-Sicht (die Tabellen des
// Bereichs) und die Anzeige-Form der Verweise, weil beide einen aufgebauten
// Index verlangten; die Lagen-Abbildung prüft ein Block mit einer Attrappe der
// Schnittstelle, damit jede Lage einzeln vorkommt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowDbSteps } = require('../../src/main/workflows/workflow-db-steps.js');
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');
const { LAGEN } = require('../../src/main/database/record-auftrag-pruefung.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { legeSperreAn } = require('../../src/main/database/lock-store.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const { erzeugePruefNaht } = require('../../src/main/database/record-regeln.js');
const { pruefregelnRegel } = require('../../src/main/database/record-regel-pruefregeln.js');
const { berechtigungRegel } = require('../../src/main/database/record-regel-berechtigung.js');
const { liesDatensatz } = require('../../src/main/database/datensatz-auskunft.js');
const { runWorkflow } = require('../../src/shared/workflows/workflow-runner.js');

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
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

const ZEITPUNKT = '2026-11-10T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

// «Library» wie im Demo-Bereich, mit einer Prüfregel auf `pages` (AK7).
const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '      required: true',
  '    - name: pages',
  '      type: number',
  '      check:',
  "        rule: 'value > 0'",
  '        message: Ein Buch hat Seiten.',
  '  display: title',
  '  lastId: 2',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '|- id="r-00002"',
  '| Zauberberg',
  '| 1000',
  '```',
  '',
].join('\n');

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

function bereich(tabellen = { 'Daten/Library.md': LIBRARY }) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-db-'));
  tmpDirs.push(wurzel);
  const pfade = Object.entries(tabellen).map(([rel, text]) => lege(wurzel, rel, text));
  return { wurzel, pfade, library: pfade[0] };
}

// Die Index-Sicht: bereit, mit den genannten Kopf-Dateien als Tabellen.
function sichtMit(pfade) {
  return { dbKindsPerFile: new Map(pfade.map((p) => [p, ['table']])) };
}

// Die echte Schnittstelle des Prozesses mit der echten Prüf-Naht.
function prozess(pfade, { rechteFuer } = {}) {
  const sperrVerwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, ...KONFIG });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
  });
  const regeln = rechteFuer ? [berechtigungRegel, pruefregelnRegel] : [pruefregelnRegel];
  const tabellenSicht = () => ({ status: 'ready', sicht: sichtMit(pfade) });
  const schreibSchnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    pruefNaht: erzeugePruefNaht({
      regeln,
      tabellenSicht,
      fsp,
      ...(rechteFuer ? { rechteFuer } : {}),
    }),
    ...(rechteFuer ? { rechteFuer } : {}),
  });
  return { sperrVerwaltung, schreibSchnittstelle };
}

// Die Anzeige-Form wie im Index: «Solaris» und «Zauberberg», «Doppelt» zweimal.
const ANZEIGE = {
  Solaris: { status: 'anzeige', kennung: 'r-00001', treffers: ['r-00001'] },
  Zauberberg: { status: 'anzeige', kennung: 'r-00002', treffers: ['r-00002'] },
  Doppelt: { status: 'mehrdeutig', kennung: null, treffers: ['r-00001', 'r-00002'] },
};

function welt({ tabellen, rechteFuer, datenbankAn = true, sichtBereit = true, mehr = {} } = {}) {
  const b = bereich(tabellen);
  const { sperrVerwaltung, schreibSchnittstelle } = prozess(b.pfade, { rechteFuer });
  const ensureIndexForDemand = vi.fn();
  // 4T-002545 (Nachtrag E3): das Nachtragen eigener Schreibvorgänge in den Index.
  const trageDateienNach = vi.fn(() => true);
  const loeseVerweis = vi.fn(
    (_sicht, _abs, anker) => ANZEIGE[anker] || { status: 'keiner', kennung: null, treffers: [] },
  );
  const merkeLaufStand = vi.fn();
  const modul = createWorkflowDbSteps({
    schreibSchnittstelle,
    sperrVerwaltung,
    datenbankAktiv: () => datenbankAn,
    backlinks: {
      ensureIndexForDemand,
      trageDateienNach,
      datenbankSicht: () =>
        sichtBereit
          ? { status: 'ready', sicht: sichtMit(b.pfade) }
          : { status: 'indexing', sicht: null },
    },
    fsp,
    loeseVerweis,
    merkeLaufStand,
    ...mehr,
  });
  const ctx = { root: b.wurzel, event: { sender: { id: 7 } } };
  const lauf = (step) => modul.runDbStep(ctx, step);
  return {
    ...b,
    ctx,
    lauf,
    sperrVerwaltung,
    ensureIndexForDemand,
    trageDateienNach,
    loeseVerweis,
    merkeLaufStand,
  };
}

const paare = (werte) => Object.entries(werte).map(([key, value]) => ({ key, value }));
const anlegen = (tabelle, werte, result) => ({
  line: 3,
  blockLine: 1,
  keyword: 'db-create',
  args: [tabelle],
  source: null,
  position: null,
  pairs: paare(werte),
  ...(result ? { result } : {}),
});
const aendern = (tabelle, datensatz, werte) => ({
  line: 4,
  blockLine: 2,
  keyword: 'db-update',
  args: [tabelle, datensatz],
  source: null,
  position: null,
  pairs: paare(werte),
});
const loeschen = (tabelle, datensatz) => ({
  line: 5,
  blockLine: 3,
  keyword: 'db-delete',
  args: [tabelle, datensatz],
  source: null,
  position: null,
});

const codes = (ergebnis) => ergebnis.detail.lagen.map((l) => (l.naht ? l.naht.code : l.code));

// --- AK1: anlegen, ändern, löschen über die Schnittstelle --------------------------------

describe('Schreib-Schritte: anlegen, ändern und löschen (4T-002545, AK1, AK5)', () => {
  it('legt einen Datensatz an und liefert die neue Kennung, Tabelle und Vorgangs-Kennung', async () => {
    const w = welt();
    const ergebnis = await w.lauf(anlegen('Library', { title: 'Probe-Buch', pages: '120' }));
    expect(ergebnis).toMatchObject({
      ok: true,
      record: 'r-00003',
      effect: { kind: 'db', paths: [w.library], table: 'Library', record: 'r-00003' },
    });
    expect(Number.isSafeInteger(ergebnis.effect.transaction)).toBe(true);
    expect(ergebnis.effect.transaction).toBeGreaterThan(0);
    const text = lies(w.library);
    expect(text).toContain('|- id="r-00003"');
    expect(text).toContain('| Probe-Buch');
    // Der Index wird wie beim Schreibweg der Maske angestoßen.
    expect(w.ensureIndexForDemand).toHaveBeenCalledWith(null, '7:database', w.wurzel);
  });

  it('findet eine eben angelegte Kennung frisch von der Platte, ohne den Index zu fragen (E3)', async () => {
    const w = welt();
    const neu = await w.lauf(anlegen('Library', { title: 'Probe-Buch', pages: '120' }));
    const geaendert = await w.lauf(aendern('Library', neu.record, { pages: '130' }));
    expect(geaendert).toMatchObject({ ok: true, record: 'r-00003', effect: { record: 'r-00003' } });
    expect(geaendert.effect.transaction).toBeGreaterThan(neu.effect.transaction);
    expect(lies(w.library)).toMatch(/\| Probe-Buch\n\| 130/);
    expect(w.loeseVerweis).not.toHaveBeenCalled();
    const geloescht = await w.lauf(loeschen('Library', 'r-3'));
    expect(geloescht).toMatchObject({ ok: true, record: 'r-00003' });
    expect(lies(w.library)).not.toContain('Probe-Buch');
  });

  it('findet einen Datensatz über seine Anzeige-Form, wenn die Angabe keine Kennung ist (Da)', async () => {
    const w = welt();
    const ergebnis = await w.lauf(aendern('Library', 'Solaris', { pages: '225' }));
    expect(ergebnis).toMatchObject({ ok: true, record: 'r-00001' });
    expect(w.loeseVerweis).toHaveBeenCalledWith(expect.anything(), w.library, 'Solaris');
    expect(lies(w.library)).toMatch(/\| Solaris\n\| 225/);
  });

  it('meldet «uneindeutig» und «nicht gefunden» als Fehlschlag mit Grund und schreibt nichts', async () => {
    const w = welt();
    const vorher = lies(w.library);
    expect(await w.lauf(aendern('Library', 'Doppelt', { pages: '1' }))).toEqual({
      ok: false,
      code: 'dbRecordAmbiguous',
      detail: { table: 'Library', record: 'Doppelt' },
    });
    expect(await w.lauf(loeschen('Library', 'Gibt es nicht'))).toEqual({
      ok: false,
      code: 'dbRecordUnknown',
      detail: { table: 'Library', record: 'Gibt es nicht' },
    });
    // Eine Kennung, die die Tabelle nicht trägt, und die auch keine Anzeige-Form ist.
    expect((await w.lauf(loeschen('Library', 'r-00099'))).code).toBe('dbRecordUnknown');
    expect(lies(w.library)).toBe(vorher);
  });

  it('löst die Tabelle über Namen oder Pfad auf; zwei gleichnamige sind «Tabelle uneindeutig»', async () => {
    const w = welt({
      tabellen: { 'A/Kontakte.md': LIBRARY, 'B/Kontakte.md': LIBRARY },
    });
    expect(await w.lauf(anlegen('Kontakte', { title: 'X', pages: '1' }))).toEqual({
      ok: false,
      code: 'dbTableAmbiguous',
      detail: { table: 'Kontakte' },
    });
    expect((await w.lauf(anlegen('Gibt es nicht', { title: 'X' }))).code).toBe('dbTableUnknown');
    const perPfad = await w.lauf(anlegen('B/Kontakte.md', { title: 'X', pages: '1' }));
    expect(perPfad).toMatchObject({ ok: true, effect: { table: 'Kontakte', paths: [w.pfade[1]] } });
    expect(lies(w.pfade[0])).not.toContain('| X');
    expect(lies(w.pfade[1])).toContain('| X');
  });

  it('merkt jede geschriebene Datei mit ihrem neuen Inhalt vor dem Schreiben (Lauf-Marke)', async () => {
    const w = welt();
    await w.lauf(aendern('Library', 'r-00001', { pages: '300' }));
    expect(w.merkeLaufStand).toHaveBeenCalledTimes(1);
    const [pfad, inhalt] = w.merkeLaufStand.mock.calls[0];
    expect(path.resolve(pfad)).toBe(path.resolve(w.library));
    expect(inhalt).toBe(lies(w.library));
  });

  it('schreibt bei ausgeschalteter Datenbank nichts und nennt den Satz der Maske', async () => {
    const w = welt({ datenbankAn: false });
    const vorher = lies(w.library);
    const ergebnis = await w.lauf(anlegen('Library', { title: 'X', pages: '1' }));
    expect(ergebnis).toMatchObject({ ok: false, code: 'dbRejected' });
    expect(codes(ergebnis)).toEqual([LAGEN.erweiterungAus]);
    expect(lies(w.library)).toBe(vorher);
  });

  it('wartet nicht auf einen Index im Aufbau, sondern meldet ihn', async () => {
    const w = welt({ sichtBereit: false });
    expect((await w.lauf(anlegen('Library', { title: 'X' }))).code).toBe('notReady');
  });
});

// --- AK2: Erwartung und Sperre ------------------------------------------------------------

describe('Schreib-Schritte: Erwartung und Sperre (4T-002545, AK2, E2)', () => {
  it('gibt den frisch gelesenen Stand mit; eine Änderung dazwischen ist ein Fehlschlag', async () => {
    let w = null;
    // Zwischen dem Lesen des Schritts und dem Auftrag ändert jemand die Datei.
    const zwischendurch = async (p) => {
      const gelesen = await liesDatensatz(p);
      if (gelesen.status === 'ready') {
        fs.writeFileSync(w.library, lies(w.library).replace('| 224', '| 999'), 'utf8');
      }
      return gelesen;
    };
    w = welt({ mehr: { liesDatensatz: zwischendurch } });
    const ergebnis = await w.lauf(aendern('Library', 'r-00001', { pages: '300' }));
    expect(ergebnis).toMatchObject({ ok: false, code: 'dbRejected' });
    expect(codes(ergebnis)).toEqual(['auftragStandWeichtAb']);
    expect(lies(w.library)).toContain('| 999');
    expect(lies(w.library)).not.toContain('| 300');
  });

  it('die Schnittstelle allein schriebe an einer offenen Maske desselben Prozesses vorbei (Grund für E2)', async () => {
    const w = welt();
    const sperre = { art: 'record', tabelle: 'Daten/Library.md', id: 'r-00001' };
    expect((await w.sperrVerwaltung.nimm(w.wurzel, sperre)).gehalten).toBe(true);
    const roh = await prozessSchnittstelle(w).fuehreAuftragAus(w.wurzel, {
      anweisungen: [
        {
          tabelle: 'Daten/Library.md',
          art: 'update',
          id: 'r-00001',
          erwartet: { title: 'Solaris', pages: '224' },
          werte: { pages: '225' },
        },
      ],
    });
    expect(roh.ok).toBe(true);
  });

  it('endet an einer Sperre, die eine offene Maske derselben Anwendung hält, ohne Warten', async () => {
    const w = welt();
    const vorher = lies(w.library);
    const sperre = { art: 'record', tabelle: 'Daten/Library.md', id: 'r-00001' };
    expect((await w.sperrVerwaltung.nimm(w.wurzel, sperre)).gehalten).toBe(true);
    const erwartet = {
      ok: false,
      code: 'dbRecordLocked',
      detail: { table: 'Library', record: 'Solaris' },
    };
    expect(await w.lauf(aendern('Library', 'Solaris', { pages: '1' }))).toEqual(erwartet);
    expect(await w.lauf(loeschen('Library', 'Solaris'))).toEqual(erwartet);
    expect(lies(w.library)).toBe(vorher);
    // Die Sperre der Maske bleibt stehen.
    expect(w.sperrVerwaltung.gehalteneSperren()).toHaveLength(1);
    // Ein anderer Datensatz derselben Tabelle ist frei.
    expect((await w.lauf(aendern('Library', 'r-00002', { pages: '1001' }))).ok).toBe(true);
  });

  it('endet an einer fremden Sperre desselben Datensatzes mit demselben Fehlschlag', async () => {
    const w = welt();
    // Eine fremde, lebende Sperre über den echten Sperr-Speicher: anderer
    // Rechner, frischer Zeitpunkt (Muster `db-record-auftrag-sperren.test.js`).
    // Eine zweite Sperr-Verwaltung im selben Prozess taugt dafür nicht: Ihre
    // Sperre trüge Rechner und Prozess dieses Laufs und gälte als Absturz-Rest.
    const sperre = { art: 'record', tabelle: 'Daten/Library.md', id: 'r-00002' };
    const angelegt = await legeSperreAn(
      w.wurzel,
      sperre,
      { marke: 'fremd', pid: 999999 },
      {
        ...KONFIG,
        herkunft: () => ({ benutzer: 'bert', rechner: 'FREMD-PC' }),
        jetzt: () => new Date().toISOString().slice(0, 19) + 'Z',
      },
    );
    expect(angelegt.gehalten).toBe(true);
    const vorher = lies(w.library);
    expect(await w.lauf(aendern('Library', 'r-00002', { pages: '1' }))).toEqual({
      ok: false,
      code: 'dbRecordLocked',
      detail: { table: 'Library', record: 'r-00002' },
    });
    expect(lies(w.library)).toBe(vorher);
  });
});

// Eine zweite Schnittstelle über derselben Sperr-Verwaltung, ohne Schritt-Modul.
function prozessSchnittstelle(w) {
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({
    sperrVerwaltung: w.sperrVerwaltung,
    ...KONFIG,
  });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung: w.sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung: w.sperrVerwaltung,
      ...KONFIG,
      erweiterungAktiv: () => true,
      laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    }),
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
}

// --- AK3: Lagen, Prüfregel und Recht -------------------------------------------------------

describe('Schreib-Schritte: Prüfregel und fehlendes Recht (4T-002545, AK3, De)', () => {
  it('eine Prüfregel weist ab; der Fehlschlag trägt die Lage der Maske', async () => {
    const w = welt();
    const vorher = lies(w.library);
    const ergebnis = await w.lauf(aendern('Library', 'Solaris', { pages: '0' }));
    expect(ergebnis).toMatchObject({
      ok: false,
      code: 'dbRejected',
      detail: { table: 'Library', record: 'Solaris' },
    });
    expect(codes(ergebnis)).toEqual(['regelPruefregelVerletzt']);
    expect(ergebnis.detail.lagen[0].naht).toMatchObject({ feld: 'pages', wert: '0' });
    expect(lies(w.library)).toBe(vorher);
  });

  it('ein fehlendes Recht nennt Rolle, Tabelle und Handgriff', async () => {
    const rechteFuer = async () => ({
      status: 'ready',
      rolle: 'assistant',
      rechte: { Library: { create: false, update: true, delete: false, define: false } },
    });
    const w = welt({ rechteFuer });
    const vorher = lies(w.library);
    const ergebnis = await w.lauf(loeschen('Library', 'r-00001'));
    expect(codes(ergebnis)).toEqual(['regelNichtErlaubt']);
    expect(ergebnis.detail.lagen[0].naht).toMatchObject({
      rolle: 'assistant',
      operation: 'delete',
      tabelle: 'Daten/Library.md',
    });
    expect(lies(w.library)).toBe(vorher);
    // Ändern darf die Rolle.
    expect((await w.lauf(aendern('Library', 'r-00001', { pages: '300' }))).ok).toBe(true);
  });

  it('bricht ein Lauf ab, bleiben die schon geschriebenen Datensätze (A1)', async () => {
    const w = welt();
    const deps = { step: (_pfad, step) => w.lauf(step), flushBuffers: async () => {} };
    const plan = {
      path: path.join(w.wurzel, 'Workflows', 'Probe.md'),
      name: 'Probe',
      steps: [
        anlegen('Library', { title: 'Probe-Buch', pages: '120' }, 'neu'),
        aendern('Library', 'Solaris', { pages: '0' }),
      ],
    };
    const ergebnis = await runWorkflow(plan, deps);
    expect(ergebnis).toMatchObject({ status: 'failed', line: 4, code: 'dbRejected' });
    expect(lies(w.library)).toContain('| Probe-Buch');
  });
});

// --- Pflicht-Angabe in Kartei-Form (Entscheidung des Product Owners vom 2026-11-12) -------

// Die Kartei-Tabelle «Autoren» mit zwei Pflicht-Feldern; `name` ist der Schlüssel.
const AUTOREN = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '      required: true',
  '    - name: ort',
  '      required: true',
  '  key: name',
  '  lastId: 0',
  '---',
  '',
  'Autoren, je Autor eine Karteikarte.',
  '',
].join('\n');

// Alle Dateien unter der Wurzel samt Inhalt: Karteikarte, Begleitdatei und
// Journal (Beleg-Datei) fielen hier als neue oder geänderte Datei auf.
function dateienUnter(wurzel) {
  const stand = {};
  for (const eintrag of fs.readdirSync(wurzel, { recursive: true, withFileTypes: true })) {
    if (!eintrag.isFile()) continue;
    const pfad = path.join(eintrag.parentPath || eintrag.path, eintrag.name);
    stand[path.relative(wurzel, pfad)] = lies(pfad);
  }
  return stand;
}

describe('Schreib-Schritte: Pflicht-Angabe beim Anlegen einer Karteikarte (4T-002545)', () => {
  it('db-create ohne Pflicht-Feld endet als Fehlschlag mit Grund, und es entsteht nichts', async () => {
    const w = welt({ tabellen: { 'Autoren/Autoren.md': AUTOREN } });
    const vorher = dateienUnter(w.wurzel);
    const ergebnis = await w.lauf(anlegen('Autoren', { name: 'Alan' }));
    expect(ergebnis).toMatchObject({ ok: false, code: 'dbRejected', detail: { table: 'Autoren' } });
    expect(codes(ergebnis)).toEqual([LAGEN.pflichtFehlt]);
    expect(ergebnis.detail.lagen[0]).toMatchObject({ feld: 'ort' });
    expect(dateienUnter(w.wurzel)).toEqual(vorher);
    expect(w.merkeLaufStand).not.toHaveBeenCalled();
  });

  it('db-create mit allen Pflicht-Feldern legt die Karteikarte an wie bisher', async () => {
    const w = welt({ tabellen: { 'Autoren/Autoren.md': AUTOREN } });
    const ergebnis = await w.lauf(anlegen('Autoren', { name: 'Alan', ort: 'Wilmslow' }));
    expect(ergebnis).toMatchObject({ ok: true, record: 'r-00001', effect: { table: 'Autoren' } });
    const karte = lies(path.join(w.wurzel, 'Autoren', 'Alan.md'));
    expect(karte).toContain('db-record: r-00001');
    expect(karte).toContain('ort: Wilmslow');
  });
});

describe('Schreib-Schritte: jede Lage der Schnittstelle wird ein Fehlschlag (4T-002545, AK3)', () => {
  // Die Schnittstelle als Attrappe: Sie antwortet mit genau der gegebenen Lage.
  function mitAntwort(antwort) {
    const b = bereich();
    const modul = createWorkflowDbSteps({
      schreibSchnittstelle: { fuehreAuftragAus: async () => antwort },
      sperrVerwaltung: { gehalteneSperren: () => [] },
      datenbankAktiv: () => true,
      backlinks: { datenbankSicht: () => ({ status: 'ready', sicht: sichtMit(b.pfade) }) },
      fsp,
    });
    return modul.runDbStep({ root: b.wurzel }, anlegen('Library', { title: 'X' }));
  }

  it.each([
    [LAGEN.erweiterungAus],
    [LAGEN.tabelleUnbekannt],
    [LAGEN.datensatzMehrdeutig],
    ['auftragStandWeichtAb'],
    ['auftragHaengt'],
    ['auftragTeilweiseGeschrieben'],
  ])('%s geht mit seinen Angaben als dbRejected zurück', async (code) => {
    const lage = { code, tabelle: 'Daten/Library.md', id: 'r-00001' };
    const ergebnis = await mitAntwort({ ok: false, code, lagen: [lage] });
    expect(ergebnis).toEqual({
      ok: false,
      code: 'dbRejected',
      detail: { table: 'Library', record: '', lagen: [lage] },
    });
  });

  it('ein Befund der Prüf-Naht reist mit seiner Naht', async () => {
    const lage = { code: LAGEN.pruefBefund, naht: { code: 'regelNichtErlaubt', rolle: 'gast' } };
    const ergebnis = await mitAntwort({ ok: false, code: LAGEN.pruefBefund, lagen: [lage] });
    expect(ergebnis.detail.lagen).toEqual([lage]);
  });

  it('eine belegte Datensatz-Sperre wird dbRecordLocked, eine belegte Beleg-Datei nicht', async () => {
    const datensatz = { code: LAGEN.gesperrt, gegenstand: { art: 'record', id: 'r-00001' } };
    expect((await mitAntwort({ ok: false, lagen: [datensatz] })).code).toBe('dbRecordLocked');
    const beleg = { code: LAGEN.gesperrt, gegenstand: { art: 'changeLog' } };
    expect((await mitAntwort({ ok: false, lagen: [beleg] })).code).toBe('dbRejected');
  });

  it('ohne Schnittstelle oder Sperr-Verwaltung schreibt nichts (fail-closed)', async () => {
    const modul = createWorkflowDbSteps({ datenbankAktiv: () => true });
    expect((await modul.runDbStep({ root: os.tmpdir() }, anlegen('Library', {}))).code).toBe(
      'unexpected',
    );
  });
});

// 4T-002545 (Nachtrag zu E3): Vor jeder Index-Frage stehen die eigenen
// Schreibvorgänge im Index; den echten Index prüft
// `db-index-eigene-schreibvorgaenge.test.js`.
describe('Index auf dem Stand der eigenen Schreibvorgänge (4T-002545, Nachtrag E3)', () => {
  it('trägt die geschriebene Tabellen-Datei vor der nächsten Index-Frage nach, genau einmal', async () => {
    const w = welt();
    await w.lauf(anlegen('Library', { title: 'Probe-Buch', pages: '120' }));
    expect(w.trageDateienNach).not.toHaveBeenCalled();
    await w.lauf(aendern('Library', 'Solaris', { pages: '225' }));
    expect(w.trageDateienNach).toHaveBeenCalledTimes(1);
    const [wurzel, pfade] = w.trageDateienNach.mock.calls[0];
    expect(wurzel).toBe(w.wurzel);
    expect(pfade.map((p) => path.resolve(p))).toEqual([path.resolve(w.library)]);
    // Das Nachtragen geschah vor der Auflösung über die Anzeige-Form.
    expect(w.trageDateienNach.mock.invocationCallOrder[0]).toBeLessThan(
      w.loeseVerweis.mock.invocationCallOrder[0],
    );
    // Nachgetragen ist nachgetragen: Der nächste Schritt hat nur seine eigene Datei.
    await w.lauf(aendern('Library', 'r-00002', { pages: '999' }));
    expect(w.trageDateienNach).toHaveBeenCalledTimes(2);
  });

  it('eine Abweisung vor dem Schreib-Plan merkt nichts, der nächste Schritt trägt nichts nach', async () => {
    const w = welt();
    expect((await w.lauf(aendern('Library', 'Solaris', { pages: '0' }))).code).toBe('dbRejected');
    await w.lauf(aendern('Library', 'r-00002', { pages: '999' }));
    expect(w.trageDateienNach).not.toHaveBeenCalled();
  });

  // Review-Runde 1 zu 3E-000368: Die Schnittstelle meldet die Dateien ihres
  // Plans über `vorSchreiben`, und erst danach scheitert der Auftrag (etwa
  // teilweise geschrieben). Die Dateien sind dann berührt; der Schreib-Stand
  // merkt sie, und der nächste Schritt trägt sie vor seiner Index-Frage nach.
  it.each([
    [
      'abgewiesen nach vorSchreiben',
      { ok: false, lagen: [{ code: LAGEN.schreibenFehlgeschlagen }] },
    ],
    ['teilweise geschrieben', { ok: false, lagen: [{ code: LAGEN.teilweiseGeschrieben }] }],
  ])(
    'merkt die Dateien des Plans auch, wenn der Auftrag danach scheitert: %s',
    async (_name, abweisung) => {
      const ersterPfad = { aufruf: 0 };
      const attrappe = {
        fuehreAuftragAus: vi.fn(async (_wurzel, _auftrag, optionen) => {
          ersterPfad.aufruf += 1;
          if (ersterPfad.aufruf > 1)
            return { ok: true, vorgang: 9, ergebnisse: [{ id: 'r-00002' }] };
          optionen.vorSchreiben([{ pfad: w.library, neu: 'neuer Stand' }]);
          return abweisung;
        }),
      };
      const w = welt({ mehr: { schreibSchnittstelle: attrappe } });
      expect((await w.lauf(aendern('Library', 'r-00001', { pages: '225' }))).ok).toBe(false);
      expect(w.merkeLaufStand).toHaveBeenCalledWith(w.library, 'neuer Stand');
      expect(w.trageDateienNach).not.toHaveBeenCalled();
      await w.lauf(aendern('Library', 'r-00002', { pages: '999' }));
      expect(w.trageDateienNach).toHaveBeenCalledTimes(1);
      expect(w.trageDateienNach.mock.calls[0][1].map((p) => path.resolve(p))).toEqual([
        path.resolve(w.library),
      ]);
    },
  );

  it('ist der Index nicht bereit, bleibt der Schritt «notReady» und die Datei gemerkt', async () => {
    const w = welt();
    await w.lauf(anlegen('Library', { title: 'Probe-Buch', pages: '120' }));
    w.trageDateienNach.mockReturnValueOnce(false);
    const vorher = lies(w.library);
    expect((await w.lauf(aendern('Library', 'Solaris', { pages: '1' }))).code).toBe('notReady');
    expect(lies(w.library)).toBe(vorher);
    expect((await w.lauf(aendern('Library', 'Solaris', { pages: '1' }))).ok).toBe(true);
    expect(w.trageDateienNach).toHaveBeenCalledTimes(2);
    expect(w.trageDateienNach.mock.calls[1][1].map((p) => path.resolve(p))).toEqual([
      path.resolve(w.library),
    ]);
  });
});
