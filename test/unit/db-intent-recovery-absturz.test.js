// 4T-001824 (Epic 3E-000254, Bauplan B3): Der eine echte Abbruch nach der Marke,
// als Rand-Nachweis an der realen Konstellation.
//
// Die sieben Stellen der Fehler-Einspritzung stehen in
// `db-intent-recovery.test.js` und laufen über Nähte; sie messen die eigene
// Vorstellung vom Abbruch mit. Hier endet ein **echter Kindprozess** unmittelbar
// nach dem Durchschreiben des Protokolls, ohne jedes geordnete Ende. Danach
// räumt dieser Prozess mit einer eigenen Sperr-Verwaltung auf: Die Sperren des
// Kindes sind ein Absturz-Rest desselben Rechners, sein Protokoll ist
// vollständig, und der Bestand muss danach vollständig gewirkt sein.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  erzeugeWiederanlauf,
  WIEDERANLAUF_LAGEN,
} from '../../src/main/database/intent-recovery.js';
import { ABSICHT_PRAEFIX } from '../../src/main/database/intent-log.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { leseBelegDatei } from '../../src/main/database/change-log.js';
import { istAbsichtsSchattenkopie } from '../../src/main/documents/atomic-write.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { AUFRAEUM_ZEITLIMIT, PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import { setzeUhrVersatzAus } from '../uhr-versatz.js';

// 4T-002064: Die Fälle verabreden Startzeitpunkte mit Kindprozessen und messen
// Datei-Zeiten; beide Uhren erreicht die Verschiebung des Wanduhr-Wächters nicht.
setzeUhrVersatzAus('vergleicht die Uhr mit Kindprozessen und Datei-Zeiten');

// Die Datei startet einen realen Prozess und trägt deshalb das datei-weite
// Zeitlimit für Prozess-Starts.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const HELFER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'absturz-nach-marke-helfer.js',
);
const KONFIG = { leseKonfig: async () => undefined };

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function tabelle(ort) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '    - name: Ort',
    '  lastId: 1',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna',
    `| ${ort}`,
    '```',
    '',
  ].join('\n');
}

function starte(wurzel, anweisungen) {
  const kind = fork(HELFER, [wurzel, JSON.stringify(anweisungen)], { silent: true, execArgv: [] });
  let fehlerText = '';
  kind.stderr.on('data', (d) => (fehlerText += d.toString()));
  return new Promise((fertig, scheitern) => {
    kind.once('error', scheitern);
    kind.once('exit', (code) => fertig({ code, fehlerText }));
  });
}

describe('Wiederanlauf nach einem echten Prozess-Ende hinter der Marke (4T-001824, B3, AK8)', () => {
  it('schreibt einen Auftrag über zwei Tabellen zu Ende, den ein beendeter Prozess liegen ließ', async () => {
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-absturz-'));
    tmpDirs.push(wurzel);
    const tabellen = ['Kunden.md', 'Orte.md'];
    const pfade = tabellen.map((rel) => path.join(wurzel, rel));
    for (const pfad of pfade) fs.writeFileSync(pfad, tabelle('Basel'), 'utf8');
    const anweisungen = tabellen.map((rel, i) => ({
      tabelle: rel,
      art: 'update',
      id: 'r-00001',
      erwartet: { Name: 'Anna', Ort: 'Basel' },
      werte: { Ort: ['Chur', 'Sion'][i] },
    }));
    const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);

    const kind = await starte(wurzel, anweisungen);

    // Die Lage nach dem Abbruch: ein Protokoll, die Sperren des Kindes, zwei
    // Absichts-Schattenkopien, die Tabellen unverändert und kein Beleg.
    expect(kind.code, kind.fehlerText).toBe(137);
    const protokolle = fs.readdirSync(ordner).filter((n) => n.startsWith(ABSICHT_PRAEFIX));
    expect(protokolle).toHaveLength(1);
    const protokoll = JSON.parse(fs.readFileSync(path.join(ordner, protokolle[0]), 'utf8'));
    expect(fs.readdirSync(ordner).filter((n) => n.endsWith('.lock'))).toHaveLength(4);
    expect(fs.readdirSync(wurzel).filter(istAbsichtsSchattenkopie)).toHaveLength(2);
    for (const pfad of pfade) expect(fs.readFileSync(pfad, 'utf8')).toBe(tabelle('Basel'));
    for (const pfad of pfade) expect((await leseBelegDatei(pfad)).belege).toEqual([]);

    const verwaltung = erzeugeSperrVerwaltung(KONFIG);
    const wiederanlauf = erzeugeWiederanlauf({
      sperrVerwaltung: verwaltung,
      ...KONFIG,
      erweiterungAktiv: () => true,
    });
    const ergebnis = await wiederanlauf.raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse).toEqual([
      expect.objectContaining({
        lage: WIEDERANLAUF_LAGEN.fertiggeschrieben,
        vorgang: protokoll.vorgang,
        umbenennungen: { ausgefuehrt: 2, uebersprungen: 0 },
        belege: { angefuegt: 2, uebersprungen: 0 },
      }),
    ]);
    for (const [i, pfad] of pfade.entries()) {
      expect(fs.readFileSync(pfad, 'utf8')).toBe(tabelle(['Chur', 'Sion'][i]));
      const belege = (await leseBelegDatei(pfad)).belege;
      expect(belege.map((b) => [b.beschaedigt, Number(b.vorgang)])).toEqual([
        [false, protokoll.vorgang],
      ]);
    }
    expect(fs.readdirSync(ordner)).toEqual([]);
    expect(fs.readdirSync(wurzel).filter(istAbsichtsSchattenkopie)).toEqual([]);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });
});

// --- 4T-001824 (Nachschärfung, Befund 1): kein «Auftrag hängt» bei lebendem Schreiber ----

// Ein Schreiber in einem eigenen Prozess, in der produktiven Zusammensetzung:
// N Aufträge in dichter Folge, je ein neuer Datensatz in beiden Tabellen. Er
// gibt die Codes seiner Ergebnisse gezählt aus.
const DAUERLAUF = `
const [wurzel, n, start] = process.argv.slice(1);
const r = (m) => require(require('node:path').join(process.env.EM4ME_WURZEL, m));
const { erzeugeSperrVerwaltung } = r('src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = r('src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = r('src/main/database/intent-recovery.js');
const { erzeugeSchreibSchnittstelle } = r('src/main/database/record-auftrag.js');
const leseKonfig = async () => undefined;
const v = erzeugeSperrVerwaltung({ leseKonfig });
const k = erzeugeAbsichtsProtokoll({ sperrVerwaltung: v, leseKonfig });
const s = erzeugeSchreibSchnittstelle({
  sperrVerwaltung: v,
  absichtsProtokoll: k,
  wiederanlauf: erzeugeWiederanlauf({ sperrVerwaltung: v, leseKonfig, erweiterungAktiv: () => true, laeuft: k.laeuft }),
  erweiterungAktiv: () => true,
});
(async () => {
  while (Date.now() < Number(start)) {}
  const codes = {};
  for (let i = 0; i < Number(n); i += 1) {
    const werte = { Name: String(process.pid), Ort: String(i) };
    const e = await s.fuehreAuftragAus(wurzel, { anweisungen: [
      { tabelle: 'Kunden.md', art: 'create', werte },
      { tabelle: 'Positionen.md', art: 'create', werte },
    ] });
    const code = e.ok ? 'ok' : e.code;
    codes[code] = (codes[code] || 0) + 1;
  }
  process.stdout.write(JSON.stringify(codes));
})();
`;

const LEERE_TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Name',
  '    - name: Ort',
  '  lastId: 0',
  '---',
  '',
  '```perspective-records',
  '```',
  '',
].join('\n');

function dauerlauf(wurzel, n, start) {
  const kind = spawn(process.execPath, ['-e', DAUERLAUF, wurzel, String(n), String(start)], {
    env: { ...process.env, EM4ME_WURZEL: path.resolve(path.dirname(HELFER), '..', '..') },
  });
  let aus = '';
  let fehlerText = '';
  kind.stdout.on('data', (d) => (aus += d.toString()));
  kind.stderr.on('data', (d) => (fehlerText += d.toString()));
  return new Promise((fertig, scheitern) => {
    kind.once('error', scheitern);
    kind.once('close', (code) =>
      code === 0 ? fertig(JSON.parse(aus)) : scheitern(new Error(`Code ${code}: ${fehlerText}`)),
    );
  });
}

describe('Kein «Auftrag hängt» bei lebendem Schreiber (4T-001824, Nachschärfung, Befund 1)', () => {
  it('lässt zwei Prozesse mit je 300 Aufträgen auf denselben Tabellen ohne Abweisung wegen eines hängenden Auftrags schreiben', async () => {
    // Vor der Nachschärfung wies hier ein Auftrag ab, der genau in das Fenster
    // zwischen Marke und Löschen des Protokolls des anderen fiel (gemessen:
    // 1 von 600). Seither entscheiden in diesem Fall die Sperren.
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dauerlauf-'));
    tmpDirs.push(wurzel);
    for (const rel of ['Kunden.md', 'Positionen.md'])
      fs.writeFileSync(path.join(wurzel, rel), LEERE_TABELLE, 'utf8');
    const start = Date.now() + 1500;

    const codes = await Promise.all([dauerlauf(wurzel, 300, start), dauerlauf(wurzel, 300, start)]);

    for (const je of codes) {
      expect(je.auftragHaengt, JSON.stringify(codes)).toBeUndefined();
      expect(
        Object.keys(je).filter((c) => c !== 'ok' && c !== 'auftragSperreNichtErlangt'),
      ).toEqual([]);
      expect(je.ok).toBeGreaterThan(250);
    }
    const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
    expect(fs.readdirSync(ordner).filter((n) => n.startsWith(ABSICHT_PRAEFIX))).toEqual([]);
  });
});
