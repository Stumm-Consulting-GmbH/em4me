// 4T-001924 (Epic 3E-000254, Story 4S-000997): Die Schreib-Schnittstelle teilt
// eine Tabelle, die durch einen Auftrag über die Byte-Schwelle wächst, im selben
// Auftrag und unter der Klammer des Absichts-Protokolls.
//
// **Gearbeitet wird an der echten Schwelle** aus `teilungsOptionen` (0,7 MB je
// Segment). Eine Übersteuerung je Tabelle gibt es im Bestand nicht, und eine
// Naht nur für den Prüffall wäre genau der zweite Wert, den AK4 ausschließt.
// Die Tabellen entstehen deshalb mit rund 800 Datensätzen zu 900 Byte; der
// Teiler braucht dafür Millisekunden.
//
// **Echte Schnittstelle, echte Sperr-Verwaltung, echte Klammer, echter
// Wiederanlauf, echtes Dateisystem** in temporären Ordnern (Muster
// `db-record-auftrag.test.js` und `db-intent-recovery.test.js`). Geteilte
// Ausgangs-Tabellen entstehen über denselben Teiler, über den der
// Speichern-Kanal sie anlegt; so tragen sie genau die Gestalt, die eine
// ausgelieferte geteilte Tabelle hat.
//
// **Der eine echte Abbruch** läuft in einem Kindprozess, der sich unmittelbar
// nach der Marke beendet (Muster `db-intent-recovery-absturz.test.js`, eigener
// Helfer als Skript-Text, damit keine zweite Helfer-Datei entsteht).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import {
  dateiFuerKennung,
  leseTabellenBestand,
} from '../../src/main/database/record-auftrag-bestand.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ABSICHT_PRAEFIX, erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import {
  WIEDERANLAUF_LAGEN,
  erzeugeWiederanlauf,
} from '../../src/main/database/intent-recovery.js';
import {
  belegPfadFuer,
  belegeDesDatensatzes,
  leseBelegDatei,
} from '../../src/main/database/change-log.js';
import {
  benenneUmMitWiederholung,
  durchschreibeDatei,
  istAbsichtsSchattenkopie,
} from '../../src/main/documents/atomic-write.js';
import { teilungsOptionen } from '../../src/main/documents/teilungs-optionen.js';
import { planeZerlegung } from '../../src/shared/document-split.js';
import { readPartLine } from '../../src/shared/document-parts.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import {
  backlinksFor,
  datensatzNachKennung,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { AUFRAEUM_ZEITLIMIT, PROZESS_ZEITLIMIT } from '../zeitlimits.js';

// Die Datei startet einen realen Prozess und trägt deshalb das datei-weite
// Zeitlimit für Prozess-Starts.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const require_ = createRequire(import.meta.url);
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require_('../../src/main/index/datensatz-zugriff.js');

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_ORDNER = path.join(ROOT, 'src', 'main', 'database');
const SCHNITTSTELLEN_QUELLEN = fs
  .readdirSync(DB_ORDNER)
  .filter((name) => /^record-auftrag.*\.js$/.test(name))
  .map((name) => ({ name, text: fs.readFileSync(path.join(DB_ORDNER, name), 'utf8') }));

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];
let verwaltungen = [];
const offeneWurzeln = new Set();

afterEach(async () => {
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  if (offeneWurzeln.size > 0) {
    vergissAlleDefinitionen();
    zwischenspeicherLeeren();
    vi.useFakeTimers();
    for (const wurzel of offeneWurzeln) releaseRoot(wurzel);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    offeneWurzeln.clear();
  }
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-teilung-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

const ZEITPUNKT = '2026-09-23T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };
const LF = '\n';
const LAENGE = 900;

const kennung = (nr) => `r-${String(nr).padStart(5, '0')}`;
const bytes = (text) => Buffer.byteLength(text, 'utf8');
const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

function kopfZeilen(lastId) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '    - name: Text',
    `  lastId: ${lastId}`,
    '---',
    '',
    '```perspective-records',
  ];
}

function datensatzZeilen(nr, laenge = LAENGE) {
  return [`|- id="${kennung(nr)}"`, `| N${nr}`, `| ${'x'.repeat(laenge)}`];
}

function tabellenText(nummern, { lastId = Math.max(0, ...nummern), eol = LF } = {}) {
  const zeilen = [...kopfZeilen(lastId)];
  for (const nr of nummern) zeilen.push(...datensatzZeilen(nr));
  zeilen.push('```', '');
  return zeilen.join(eol);
}

// Die Schwelle, an der die Anwendung eine Tabellen-Datei misst — aus derselben
// Quelle, die Speichern-Kanal und Schnittstelle fragen.
const SCHWELLE = teilungsOptionen(tabellenText([])).schwelle;
const JE_DATENSATZ = bytes(datensatzZeilen(1).join(LF) + LF);

// Wie viele Datensätze eine ungeteilte Tabelle trägt, so dass sie knapp unter
// der Schwelle bleibt und ein weiterer sie reißt.
function knappUnter(eol = LF) {
  let n = Math.floor((SCHWELLE - bytes(tabellenText([], { eol }))) / JE_DATENSATZ);
  while (bytes(tabellenText(nummernBis(n + 1), { eol })) <= SCHWELLE) n += 1;
  while (bytes(tabellenText(nummernBis(n), { eol })) > SCHWELLE) n -= 1;
  return n;
}

function nummernBis(n, ab = 1) {
  return Array.from({ length: n }, (_, i) => ab + i);
}

function lege(wurzel, name, inhalt) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, inhalt, 'utf8');
  return pfad;
}

// Alle Dateien einer Tabelle, Kopf-Datei zuerst, mit ihrem Inhalt.
function tabellenDateien(wurzel, name) {
  return fs
    .readdirSync(wurzel)
    .filter((n) => n === `${name}.md` || n.startsWith(`${name}•part-`))
    .sort()
    .map((n) => ({ name: n, pfad: path.join(wurzel, n), text: lies(path.join(wurzel, n)) }));
}

function stand(wurzel, name) {
  return Object.fromEntries(tabellenDateien(wurzel, name).map((d) => [d.name, d.text]));
}

// Kennung -> Dateiname, über alle Dateien einer Tabelle.
function fundorte(wurzel, name) {
  const orte = new Map();
  for (const datei of tabellenDateien(wurzel, name))
    for (const m of datei.text.matchAll(/\|- id="(r-\d{5})"/g)) orte.set(m[1], datei.name);
  return orte;
}

// Der Rumpf einer Datei ohne Frontmatter, wie der Teiler ihn misst.
const rumpfBytes = (text) => bytes(extractFrontmatter(text).body);

/**
 * Eine geteilte Tabelle, angelegt über den Teiler selbst.
 *
 * @param {object} [o]
 * @param {number} [o.kopfLoeschen] So viele Datensätze aus der Kopf-Datei
 *   entfernen: Die Grenze liegt danach nicht mehr dort, wo Greedy sie setzte.
 * @param {number} [o.mitte] So viele Datensätze zusätzlich in das mittlere
 *   Segment, das damit über der Schwelle liegt.
 */
function geteilteTabelle(wurzel, name = 'Gross', { kopfLoeschen = 0, mitte = 0 } = {}) {
  const je = Math.floor(SCHWELLE / JE_DATENSATZ);
  const optionen = teilungsOptionen(tabellenText([]));
  const geplant = planeZerlegung({
    text: tabellenText(nummernBis(2 * je + 20)),
    base: name,
    schwelle: optionen.schwelle,
    bestand: [],
    segmentFelder: optionen.segmentFelder,
  });
  const texte = geplant.teile.map((t) => t.text);
  expect(texte).toHaveLength(3);
  let naechste = 2 * je + 21;
  const zusatz = (anzahl) => {
    const zeilen = [];
    for (let i = 0; i < anzahl; i += 1) zeilen.push(...datensatzZeilen(naechste++));
    return zeilen.join(LF) + LF;
  };
  if (mitte > 0) texte[1] += zusatz(mitte);
  // Das letzte Segment bis knapp unter die Schwelle auffüllen.
  while (bytes(texte[2]) + JE_DATENSATZ <= SCHWELLE)
    texte[2] = texte[2].replace(/```\n$/, `${zusatz(1)}\`\`\`\n`);
  for (let nr = 1; nr <= kopfLoeschen; nr += 1)
    texte[0] = texte[0].replace(datensatzZeilen(nr + 10).join(LF) + LF, '');
  texte[0] = texte[0].replace(/lastId: \d+/, `lastId: ${naechste - 1}`);
  const pfade = geplant.teile.map((t, i) => lege(wurzel, `${t.basename}.md`, texte[i]));
  return { pfade, lastId: naechste - 1 };
}

/**
 * Ein «Prozess» wie in `wiring.js`: Sperr-Verwaltung, Klammer, Wiederanlauf und
 * Schnittstelle; die Nähte der Klammer sind einzeln übersteuerbar.
 */
function prozess(o = {}) {
  const verwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(verwaltung);
  const klammer = erzeugeAbsichtsProtokoll({
    sperrVerwaltung: o.klammerVerwaltung ? o.klammerVerwaltung(verwaltung) : verwaltung,
    ...KONFIG,
    ...o.klammer,
  });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung: verwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    laeuft: (vorgang) => klammer.laeuft(vorgang),
    herkunft: () => HERKUNFT,
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung: verwaltung,
    absichtsProtokoll: klammer,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
  return {
    verwaltung,
    raeumeAuf: (wurzel) => wiederanlauf.raeumeAuf(wurzel),
    auftrag: (wurzel, anweisungen) => schnittstelle.fuehreAuftragAus(wurzel, { anweisungen }),
  };
}

const neuanlage = (tabelle, nr, laenge = 2000) => ({
  tabelle,
  art: 'create',
  werte: { Name: `N${nr}`, Text: 'y'.repeat(laenge) },
});

// --- AK1, AK2: die Teilung durch eine Neuanlage -----------------------------------------

describe('Teilung durch einen Auftrag (4T-001924, Story AK1, AK2)', () => {
  it('AK1 legt beim ersten Überschreiten ein Folge-Segment hinten an, mit Lese-Hilfe und ohne Definition', async () => {
    const wurzel = bereich();
    const n = knappUnter();
    const kopf = lege(wurzel, 'Kunden.md', tabellenText(nummernBis(n)));
    const vorher = fundorte(wurzel, 'Kunden');

    const ergebnis = await prozess().auftrag(wurzel, [neuanlage('Kunden.md', n + 1)]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const segment = path.join(wurzel, 'Kunden•part-00002.md');
    expect(ergebnis.dateien).toEqual([segment, kopf]);
    const kopfNeu = lies(kopf);
    const segmentNeu = lies(segment);
    // Die Kopf-Datei trägt Zuordnung, Definition und Hochwasserstand.
    expect(readPartLine(kopfNeu)).toMatchObject({ index: 1, base: 'Kunden' });
    expect(kopfNeu).toContain('db-table:');
    expect(kopfNeu).toContain(`lastId: ${n + 1}`);
    // Das Folge-Segment trägt die Lese-Hilfe, keine Definition, den neuen Datensatz.
    expect(readPartLine(segmentNeu)).toMatchObject({ index: 2, base: 'Kunden' });
    expect(extractFrontmatter(segmentNeu).data).toEqual({
      'doc-part': 'v1|2|Kunden',
      'db-fields': 'Name | Text',
    });
    expect(segmentNeu).toContain(`|- id="${kennung(n + 1)}"`);
    // AK2: Geschnitten an einer Datensatz-Grenze; kein vorhandener Datensatz
    // wechselt die Datei.
    expect(extractFrontmatter(segmentNeu).body.startsWith('|- id=')).toBe(true);
    const nachher = fundorte(wurzel, 'Kunden');
    for (const [id, datei] of vorher) expect(nachher.get(id), id).toBe(datei);
    expect(nachher.get(kennung(n + 1))).toBe('Kunden•part-00002.md');
  });

  it('AK1 teilt auch, wenn eine Änderung im letzten Segment es über die Schwelle hebt', async () => {
    const wurzel = bereich();
    const { pfade } = geteilteTabelle(wurzel);
    const vorher = stand(wurzel, 'Gross');
    const orte = fundorte(wurzel, 'Gross');
    const letzte = [...orte].filter(([, d]) => d === 'Gross•part-00003.md');
    const [id] = letzte[letzte.length - 1];

    const ergebnis = await prozess().auftrag(wurzel, [
      {
        tabelle: 'Gross.md',
        art: 'update',
        id,
        erwartet: { Name: `N${Number(id.slice(2))}`, Text: 'x'.repeat(LAENGE) },
        werte: { Text: 'z'.repeat(3000) },
      },
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    // Kopf-Datei und mittleres Segment bleiben Byte für Byte, wie sie waren.
    expect(lies(pfade[0])).toBe(vorher['Gross.md']);
    expect(lies(pfade[1])).toBe(vorher['Gross•part-00002.md']);
    // Der Teiler schneidet am letzten Schnittpunkt unter der Schwelle, und das
    // ist der Anfang des gewachsenen Datensatzes: Er allein wandert in das neue
    // Segment. So verhält sich derselbe Teiler auch im Speichern-Kanal.
    orte.set(id, 'Gross•part-00004.md');
    expect(fundorte(wurzel, 'Gross')).toEqual(orte);
    expect(rumpfBytes(lies(pfade[2]))).toBeLessThanOrEqual(SCHWELLE);
  });
});

// --- AK5: Rotation, mittleres Segment, Ränder ---------------------------------------------

describe('Rotation und Ränder (4T-001924, Story AK5, AK8, AK9)', () => {
  it.each([
    ['greedy-gleichen Grenzen', {}],
    ['einer nach Löschungen verschobenen Grenze', { kopfLoeschen: 50 }],
    ['einem großen mittleren Segment', { mitte: 300 }],
  ])('AK5 teilt beim Anlegen allein das letzte Segment, bei %s', async (_fall, gestalt) => {
    const wurzel = bereich();
    const { pfade, lastId } = geteilteTabelle(wurzel, 'Gross', gestalt);
    const vorher = stand(wurzel, 'Gross');
    const orte = fundorte(wurzel, 'Gross');

    const ergebnis = await prozess().auftrag(wurzel, [neuanlage('Gross.md', lastId + 1)]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const neu = path.join(wurzel, 'Gross•part-00004.md');
    // Geschrieben werden die Kopf-Datei (Hochwasserstand), das bisher letzte
    // Segment, das seinen schließenden Zaun an das neue abgibt, und das neue;
    // in der Ordnung von schreibReihenfolge: neu, wachsend, schrumpfend.
    expect(ergebnis.dateien).toEqual([neu, pfade[0], pfade[2]]);
    // Das mittlere Segment bleibt unberührt, auch wenn es über der Schwelle
    // liegt; die Kopf-Datei ändert allein ihren Hochwasserstand.
    expect(lies(pfade[1])).toBe(vorher['Gross•part-00002.md']);
    expect(lies(pfade[2])).toBe(vorher['Gross•part-00003.md'].replace(/```\n$/, ''));
    expect(lies(pfade[0])).toBe(
      vorher['Gross.md'].replace(`lastId: ${lastId}`, `lastId: ${lastId + 1}`),
    );
    const nachher = fundorte(wurzel, 'Gross');
    for (const [id, datei] of orte) expect(nachher.get(id), id).toBe(datei);
    expect(nachher.get(kennung(lastId + 1))).toBe('Gross•part-00004.md');
  });

  it('AK8 lässt einen einzelnen Datensatz über der Schwelle in seinem Segment', async () => {
    const wurzel = bereich();
    const kopf = lege(wurzel, 'Einzel.md', tabellenText([]));

    const ergebnis = await prozess().auftrag(wurzel, [neuanlage('Einzel.md', 1, SCHWELLE + 1000)]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.dateien).toEqual([kopf]);
    expect(tabellenDateien(wurzel, 'Einzel').map((d) => d.name)).toEqual(['Einzel.md']);
    expect(readPartLine(lies(kopf))).toBeNull();
  });

  it('AK8 legt kein leeres Segment an, wenn der einzige Datensatz des letzten Segments wächst', async () => {
    const wurzel = bereich();
    const { pfade, lastId } = geteilteTabelle(wurzel);
    await prozess().auftrag(wurzel, [neuanlage('Gross.md', lastId + 1)]);
    const vierte = path.join(wurzel, 'Gross•part-00004.md');
    const vorher = stand(wurzel, 'Gross');

    const ergebnis = await prozess().auftrag(wurzel, [
      {
        tabelle: 'Gross.md',
        art: 'update',
        id: kennung(lastId + 1),
        erwartet: { Name: `N${lastId + 1}`, Text: 'y'.repeat(2000) },
        werte: { Text: 'w'.repeat(SCHWELLE + 1000) },
      },
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.dateien).toEqual([vierte]);
    expect(Object.keys(stand(wurzel, 'Gross'))).toEqual(Object.keys(vorher));
    expect(lies(pfade[2])).toBe(vorher['Gross•part-00003.md']);
  });

  it('Rand: ein Segment, das allein durch seinen Frontmatter über der Schwelle liegt, bekommt nichts Zusätzliches', async () => {
    const wurzel = bereich();
    const { pfade } = geteilteTabelle(wurzel);
    const letzter = lies(pfade[2]);
    const [id] = [...fundorte(wurzel, 'Gross')].filter(([, d]) => d === 'Gross•part-00003.md')[0];
    // Den Rumpf genau unter die Schwelle bringen, die ganze Datei darüber.
    const zuwachs = SCHWELLE - rumpfBytes(letzter) - 5;
    expect(zuwachs).toBeGreaterThan(0);

    const ergebnis = await prozess().auftrag(wurzel, [
      {
        tabelle: 'Gross.md',
        art: 'update',
        id,
        erwartet: { Name: `N${Number(id.slice(2))}`, Text: 'x'.repeat(LAENGE) },
        werte: { Text: 'x'.repeat(LAENGE + zuwachs) },
      },
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(bytes(lies(pfade[2]))).toBeGreaterThan(SCHWELLE);
    expect(rumpfBytes(lies(pfade[2]))).toBeLessThanOrEqual(SCHWELLE);
    expect(ergebnis.dateien).toEqual([pfade[2]]);
    expect(tabellenDateien(wurzel, 'Gross')).toHaveLength(3);
  });

  it('AK9 legt über mehrere Schwellen so viele Segmente an wie nötig, in richtiger Folge', async () => {
    const wurzel = bereich();
    const kopf = lege(wurzel, 'Viele.md', tabellenText([]));
    const je = Math.floor(SCHWELLE / 5000);
    const anweisungen = nummernBis(2 * je + 10).map((nr) => neuanlage('Viele.md', nr, 5000));

    const ergebnis = await prozess().auftrag(wurzel, anweisungen);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const dateien = tabellenDateien(wurzel, 'Viele');
    expect(dateien.map((d) => d.name)).toEqual([
      'Viele.md',
      'Viele•part-00002.md',
      'Viele•part-00003.md',
    ]);
    expect(ergebnis.dateien).toEqual([dateien[1].pfad, dateien[2].pfad, kopf]);
    // Die Kennungen steigen über die Dateien hinweg lückenlos an.
    const folge = dateien.flatMap((d) =>
      [...d.text.matchAll(/\|- id="(r-\d{5})"/g)].map((m) => m[1]),
    );
    expect(folge).toEqual(nummernBis(2 * je + 10).map(kennung));
    for (const d of dateien.slice(0, 2)) expect(rumpfBytes(d.text)).toBeLessThanOrEqual(SCHWELLE);
  });

  it('teilt eine Tabelle und schreibt eine zweite im selben Auftrag unverändert mit', async () => {
    const wurzel = bereich();
    const n = knappUnter();
    lege(wurzel, 'Kunden.md', tabellenText(nummernBis(n)));
    const orte = lege(wurzel, 'Orte.md', tabellenText([1]));

    const ergebnis = await prozess().auftrag(wurzel, [
      neuanlage('Orte.md', 2, 10),
      neuanlage('Kunden.md', n + 1),
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.dateien[0]).toBe(orte);
    expect(ergebnis.dateien).toHaveLength(3);
    expect(lies(orte)).toContain(`|- id="${kennung(2)}"`);
  });
});

// --- Zeilenenden -----------------------------------------------------------------------------

describe('Zeilenenden (4T-001924, Befund 4)', () => {
  // Geteilt wird über eine Änderung: Ein Anlegen in einer CRLF-Tabelle scheitert
  // heute schon vor der Teilung beim Fortschreiben des Hochwasserstands
  // (`schreibeHochwasserstand` in `record-write.js`), ein eigener Befund.
  it('teilt eine CRLF-Tabelle an einer Datensatz-Grenze und lässt ihre Zeilenenden stehen', async () => {
    const wurzel = bereich();
    const n = knappUnter('\r\n');
    lege(wurzel, 'Crlf.md', tabellenText(nummernBis(n), { eol: '\r\n' }));
    const vorher = fundorte(wurzel, 'Crlf');

    const ergebnis = await prozess().auftrag(wurzel, [
      {
        tabelle: 'Crlf.md',
        art: 'update',
        id: kennung(n),
        erwartet: { Name: `N${n}`, Text: 'x'.repeat(LAENGE) },
        werte: { Text: 'z'.repeat(3000) },
      },
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const dateien = tabellenDateien(wurzel, 'Crlf');
    expect(dateien.map((d) => d.name)).toEqual(['Crlf.md', 'Crlf•part-00002.md']);
    // Geschnitten vor dem gewachsenen Datensatz; alle übrigen bleiben, wo sie waren.
    const nachher = fundorte(wurzel, 'Crlf');
    vorher.set(kennung(n), 'Crlf•part-00002.md');
    expect(nachher).toEqual(vorher);
    expect(readPartLine(dateien[1].text)).toMatchObject({ index: 2, base: 'Crlf' });
    // Jede Zeile beider Dateien endet mit CRLF.
    for (const d of dateien) expect(d.text.split('\r\n').join('')).not.toContain('\n');
  });
});

// --- AK3, AK8: Fehler-Einspritzung und Wiederanlauf --------------------------------------

// Die sieben Stellen der Klammer und was danach vom Bestand erwartet wird: vor
// der Marke «unberührt», danach «gewirkt» (Muster `db-intent-recovery.test.js`).
const STELLEN = {
  sperren: 'unberuehrt',
  schattenkopien: 'unberuehrt',
  protokoll: 'unberuehrt',
  umbenennen: 'gewirkt',
  mittenUmbenennen: 'gewirkt',
  mittenBelege: 'gewirkt',
  protokollLoeschen: 'gewirkt',
};

const istProtokoll = (pfad) => path.basename(String(pfad)).startsWith(ABSICHT_PRAEFIX);
const sperrOrdner = (wurzel) => path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
const imSperrOrdner = (wurzel) =>
  fs.existsSync(sperrOrdner(wurzel)) ? fs.readdirSync(sperrOrdner(wurzel)).sort() : [];

/**
 * Die Nähte der Klammer mit einem Abbruch an einer Stelle. «haengen» löst
 * `erreicht` aus und kehrt nie zurück, wie ein Absturz an der Stelle.
 */
function eingespritzt(stelle, art, beimDurchschreiben = null) {
  let melde;
  const erreicht = new Promise((r) => (melde = r));
  const abbruch = () => {
    melde();
    if (art === 'werfen') throw Object.assign(new Error('gestellter Abbruch'), { code: 'EIO' });
    return new Promise(() => {});
  };
  const zahl = {};
  const zaehle = (k) => (zahl[k] = (zahl[k] || 0) + 1);
  const klammer = {
    fsp: {
      ...fs.promises,
      writeFile: async (pfad, text, ...rest) => {
        if (stelle !== 'protokoll' || !istProtokoll(pfad))
          return fs.promises.writeFile(pfad, text, ...rest);
        if (art === 'haengen')
          await fs.promises.writeFile(pfad, text.slice(0, text.length >> 1), 'utf8');
        return abbruch();
      },
      appendFile: async (...a) =>
        stelle === 'mittenBelege' && zaehle('beleg') === 2
          ? abbruch()
          : fs.promises.appendFile(...a),
      unlink: async (pfad) =>
        stelle === 'protokollLoeschen' && istProtokoll(pfad) ? abbruch() : fs.promises.unlink(pfad),
    },
    durchschreiben: async (pfad) => {
      if (!istProtokoll(pfad) && zaehle('schatten') === 1 && beimDurchschreiben)
        beimDurchschreiben(pfad);
      if (stelle === 'schattenkopien' && !istProtokoll(pfad) && zahl.schatten === 2)
        return abbruch();
      return durchschreibeDatei(pfad);
    },
    benenneUm: async (von, nach, opts) => {
      const n = zaehle('umbenennen');
      if ((stelle === 'umbenennen' && n === 1) || (stelle === 'mittenUmbenennen' && n === 2))
        return abbruch();
      return benenneUmMitWiederholung(von, nach, opts);
    },
  };
  const klammerVerwaltung = (v) => ({
    nimmGeordnet: async (wurzel, gegenstaende) => {
      if (stelle !== 'sperren') return v.nimmGeordnet(wurzel, gegenstaende);
      if (art === 'werfen') return abbruch();
      await v.nimmGeordnet(wurzel, gegenstaende);
      return abbruch();
    },
    gibZurueck: (wurzel, genommen) => v.gibZurueck(wurzel, genommen),
  });
  return { erreicht, optionen: { klammer, klammerVerwaltung } };
}

// Die Ausgangslage aller Abbruch-Fälle: eine ungeteilte Tabelle knapp unter der
// Schwelle und ein Auftrag mit zwei Neuanlagen, der sie teilt. Zwei Neuanlagen,
// damit zwei Belege entstehen und der Abbruch zwischen ihnen einen Ort hat.
function abbruchLage() {
  const wurzel = bereich();
  const n = knappUnter();
  const kopf = lege(wurzel, 'Kunden.md', tabellenText(nummernBis(n)));
  return {
    wurzel,
    kopf,
    anweisungen: [neuanlage('Kunden.md', n + 1), neuanlage('Kunden.md', n + 2)],
    vorher: stand(wurzel, 'Kunden'),
    n,
  };
}

// Der vollständig gewirkte Stand derselben Lage, einmal ohne Störung gefahren.
async function gewirkterStand() {
  const lage = abbruchLage();
  const ergebnis = await prozess().auftrag(lage.wurzel, lage.anweisungen);
  expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
  return stand(lage.wurzel, 'Kunden');
}

describe('Teilung unter der Klammer: Abbruch an jedem Schritt (4T-001924, Story AK3, Vorgang AK3, AK8)', () => {
  const FAELLE = Object.keys(STELLEN).flatMap((s) => [
    [s, 'werfen'],
    [s, 'haengen'],
  ]);

  it.each(FAELLE)(
    'AK3 %s (%s): danach vollständig geteilt oder vollständig unberührt',
    async (stelle, art) => {
      const erwartet = await gewirkterStand();
      const { wurzel, kopf, anweisungen, vorher } = abbruchLage();
      const e = eingespritzt(stelle, art);

      const lauf = prozess(e.optionen).auftrag(wurzel, anweisungen);
      if (art === 'werfen') await lauf;
      await e.erreicht;
      const neu = prozess();
      expect((await neu.raeumeAuf(wurzel)).ok).toBe(true);

      if (STELLEN[stelle] === 'gewirkt') {
        expect(stand(wurzel, 'Kunden')).toEqual(erwartet);
        const belege = (await leseBelegDatei(kopf)).belege.filter((b) => !b.beschaedigt);
        expect(belege).toHaveLength(2);
        expect(new Set(belege.map((b) => b.vorgang)).size).toBe(1);
      } else {
        expect(stand(wurzel, 'Kunden')).toEqual(vorher);
        expect(fs.existsSync(belegPfadFuer(kopf))).toBe(false);
        // Der Bestand nimmt danach ohne Zutun wieder Aufträge an und teilt dann.
        const folge = await neu.auftrag(wurzel, anweisungen);
        expect(folge.ok, JSON.stringify(folge.lagen)).toBe(true);
        expect(Object.keys(stand(wurzel, 'Kunden'))).toEqual(Object.keys(erwartet));
      }
      // Ein halb geschriebenes Protokoll mit lebender Sperre bleibt nach der
      // Regel des Wiederanlaufs liegen (B6 aus 4T-001824); ein vollständiges nie.
      if (STELLEN[stelle] === 'gewirkt')
        expect(imSperrOrdner(wurzel).filter((n) => n.startsWith(ABSICHT_PRAEFIX))).toEqual([]);
    },
  );

  it('B3 weist ab, wenn das neue Segment zwischen Lesen und Marke von anderer Seite entstanden ist', async () => {
    const { wurzel, kopf, anweisungen, vorher } = abbruchLage();
    const segment = path.join(wurzel, 'Kunden•part-00002.md');
    const e = eingespritzt('keine', 'werfen', () => fs.writeFileSync(segment, 'fremd\n', 'utf8'));

    const ergebnis = await prozess(e.optionen).auftrag(wurzel, anweisungen);

    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0]).toMatchObject({ datei: segment, grund: 'exists' });
    expect(lies(segment)).toBe('fremd\n');
    expect(lies(kopf)).toBe(vorher['Kunden.md']);
    expect(fs.existsSync(belegPfadFuer(kopf))).toBe(false);
    expect(fs.readdirSync(wurzel).filter(istAbsichtsSchattenkopie)).toEqual([]);
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });
});

// Der Kindprozess: produktive Zusammensetzung, Ende mit Code 137 beim ersten
// Umbenennen, also unmittelbar nach der Marke.
const ABSTURZ = `
const [wurzel, anweisungen] = process.argv.slice(1);
const r = (m) => require(require('node:path').join(process.env.EM4ME_WURZEL, m));
const { erzeugeSperrVerwaltung } = r('src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = r('src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = r('src/main/database/intent-recovery.js');
const { erzeugeSchreibSchnittstelle } = r('src/main/database/record-auftrag.js');
const leseKonfig = async () => undefined;
const v = erzeugeSperrVerwaltung({ leseKonfig });
const k = erzeugeAbsichtsProtokoll({ sperrVerwaltung: v, leseKonfig, benenneUm: () => process.exit(137) });
const s = erzeugeSchreibSchnittstelle({
  sperrVerwaltung: v,
  absichtsProtokoll: k,
  wiederanlauf: erzeugeWiederanlauf({ sperrVerwaltung: v, leseKonfig, erweiterungAktiv: () => true }),
  erweiterungAktiv: () => true,
  jetzt: () => '${ZEITPUNKT}',
  herkunft: () => (${JSON.stringify(HERKUNFT)}),
  warteAbstaende: [],
});
s.fuehreAuftragAus(wurzel, { anweisungen: JSON.parse(anweisungen) }).then(
  (e) => { process.stderr.write('Kein Abbruch: ' + JSON.stringify(e)); process.exit(2); },
  (err) => { process.stderr.write('Geworfen: ' + String(err && err.stack)); process.exit(3); },
);
`;

function absturz(wurzel, anweisungen) {
  const kind = spawn(process.execPath, ['-e', ABSTURZ, wurzel, JSON.stringify(anweisungen)], {
    env: { ...process.env, EM4ME_WURZEL: ROOT },
  });
  let fehlerText = '';
  kind.stderr.on('data', (d) => (fehlerText += d.toString()));
  return new Promise((fertig, scheitern) => {
    kind.once('error', scheitern);
    kind.once('close', (code) => fertig({ code, fehlerText }));
  });
}

describe('Teilung nach einem echten Prozess-Ende hinter der Marke (4T-001924, Vorgang AK8)', () => {
  it('AK8 schreibt eine liegengebliebene Teilung zu Ende, einschließlich der neu anzulegenden Datei', async () => {
    const erwartet = await gewirkterStand();
    const { wurzel, kopf, anweisungen, vorher } = abbruchLage();
    const segment = path.join(wurzel, 'Kunden•part-00002.md');

    const kind = await absturz(wurzel, anweisungen);

    expect(kind.code, kind.fehlerText).toBe(137);
    const protokolle = imSperrOrdner(wurzel).filter((n) => n.startsWith(ABSICHT_PRAEFIX));
    expect(protokolle).toHaveLength(1);
    const protokoll = JSON.parse(lies(path.join(sperrOrdner(wurzel), protokolle[0])));
    expect(protokoll.umbenennungen.map((u) => u.nach)).toEqual([segment, kopf]);
    expect(fs.existsSync(segment)).toBe(false);
    expect(stand(wurzel, 'Kunden')).toEqual(vorher);

    const verwaltung = erzeugeSperrVerwaltung(KONFIG);
    verwaltungen.push(verwaltung);
    const ergebnis = await erzeugeWiederanlauf({
      sperrVerwaltung: verwaltung,
      ...KONFIG,
      erweiterungAktiv: () => true,
    }).raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse).toEqual([
      expect.objectContaining({
        lage: WIEDERANLAUF_LAGEN.fertiggeschrieben,
        vorgang: protokoll.vorgang,
        umbenennungen: { ausgefuehrt: 2, uebersprungen: 0 },
        belege: { angefuegt: 2, uebersprungen: 0 },
      }),
    ]);
    expect(stand(wurzel, 'Kunden')).toEqual(erwartet);
    expect(imSperrOrdner(wurzel)).toEqual([]);
    expect(fs.readdirSync(wurzel).filter(istAbsichtsSchattenkopie)).toEqual([]);
  });
});

// --- AK7, AK9: Belege, Bestands-Leser und Index nach der Teilung --------------------------

describe('Nach der Teilung (4T-001924, Story AK7, Vorgang AK7, AK9)', () => {
  it('AK7 hält Belege, Beleg-Datei und Vorgangs-Kennung unberührt, und die Kette bleibt lückenlos', async () => {
    const wurzel = bereich();
    const n = knappUnter();
    const kopf = lege(wurzel, 'Kunden.md', tabellenText(nummernBis(n)));
    const p = prozess();
    const erster = await p.auftrag(wurzel, [neuanlage('Kunden.md', n + 1)]);
    const id = kennung(n + 1);

    const zweiter = await p.auftrag(wurzel, [
      {
        tabelle: 'Kunden.md',
        art: 'update',
        id,
        erwartet: { Name: `N${n + 1}`, Text: 'y'.repeat(2000) },
        werte: { Name: 'Neu' },
      },
    ]);

    expect(zweiter.ok, JSON.stringify(zweiter.lagen)).toBe(true);
    expect(zweiter.dateien).toEqual([path.join(wurzel, 'Kunden•part-00002.md')]);
    // Eine Beleg-Datei je Tabelle, neben der Kopf-Datei; keine neben dem Segment.
    expect(erster.belege).toEqual([belegPfadFuer(kopf)]);
    expect(zweiter.belege).toEqual([belegPfadFuer(kopf)]);
    expect(
      fs.readdirSync(wurzel).filter((n2) => n2.includes('part') && !n2.endsWith('.md')),
    ).toEqual([]);
    const gelesen = await belegeDesDatensatzes(kopf, id);
    expect(gelesen.belege.map((b) => Number(b.vorgang))).toEqual([erster.vorgang, zweiter.vorgang]);
    expect(gelesen.verkettung).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('AK9 lesen Bestands-Leser und Index die entstandene Segmentierung', async () => {
    const wurzel = bereich();
    const n = knappUnter();
    const kopf = lege(wurzel, 'Kunden.md', tabellenText(nummernBis(n)));
    await prozess().auftrag(wurzel, [neuanlage('Kunden.md', n + 1)]);
    const segment = path.join(wurzel, 'Kunden•part-00002.md');

    const bestand = await leseTabellenBestand(fs.promises, kopf, 'Kunden.md');
    expect(bestand.ok).toBe(true);
    expect(bestand.dateien.map((d) => d.pfad)).toEqual([kopf, segment]);
    expect(bestand.ziel).toBe(segment);
    expect(dateiFuerKennung(bestand, kennung(n + 1))).toEqual({ ok: true, pfad: segment });
    expect(dateiFuerKennung(bestand, kennung(1))).toEqual({ ok: true, pfad: kopf });

    let index = backlinksFor(kopf);
    offeneWurzeln.add(rootForActiveFile(kopf));
    for (let i = 0; i < 500 && index.status === 'indexing'; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
      index = backlinksFor(kopf);
    }
    const { status, treffer } = datensatzNachKennung(kopf, null, 'Kunden', kennung(n + 1));
    expect(status).toBe('ready');
    expect(treffer).toMatchObject({ datei: segment, id: kennung(n + 1) });
  });
});

// --- AK4: kein zweiter Wert, kein zweiter Schnitt ------------------------------------------

// Zeilen-Nummern der Treffer eines Musters, ohne die Vorkommen in Kommentaren
// (übernommen aus db-intent-log.test.js).
function trefferAusserhalbKommentaren(text, muster) {
  const zeilen = [];
  for (const m of text.matchAll(muster)) {
    const zeilenAnfang = text.lastIndexOf('\n', m.index) + 1;
    if (/(^|\s)(\/\/|\*)/.test(text.slice(zeilenAnfang, m.index))) continue;
    zeilen.push(text.slice(0, m.index).split('\n').length);
  }
  return zeilen;
}

describe('Quelltext-Wächter (4T-001924, Story AK4, Vorgang AK4)', () => {
  const VERBOTEN = [
    /\b(ABLAGE_SCHWELLE|DOKUMENT_SCHWELLE|schwelleFuer)\b/g,
    /\b(findSplitPoints|greedyGrenzen|fuehreGrenzenNach|byteLength|SCHNITT_RE)\b/g,
    /\b(RECORD_MARKER|datensatzPunkte|ueberschriftsPunkte)\b/g,
    /\b0?[.,]7\s*\*|\*\s*0?[.,]7\b|\b1024\s*\*|\b734003\b|\b1048576\b/g,
  ];

  it('AK4 führt in den Modulen der Schnittstelle keinen eigenen Schwellen-Wert und keinen eigenen Schnitt', () => {
    expect(SCHNITTSTELLEN_QUELLEN.map((q) => q.name)).toContain('record-auftrag-teilung.js');
    for (const { name, text } of SCHNITTSTELLEN_QUELLEN)
      for (const muster of VERBOTEN)
        expect(trefferAusserhalbKommentaren(text, muster), `${name} ${muster}`).toEqual([]);
    // Gegenprobe an einem erfundenen eigenen Wert.
    expect(trefferAusserhalbKommentaren('const s = 0.7 * 1024 * 1024;', VERBOTEN[3])).not.toEqual(
      [],
    );
  });

  it('AK4 ruft den einen Teiler an genau einer Stelle, mit der Schwelle aus teilungsOptionen', () => {
    const aufrufe = SCHNITTSTELLEN_QUELLEN.map(({ name, text }) => [
      name,
      trefferAusserhalbKommentaren(text, /\bplaneZerlegung\s*\(/g).length,
    ]).filter(([, zahl]) => zahl > 0);
    expect(aufrufe).toEqual([['record-auftrag-teilung.js', 1]]);
    const teilung = SCHNITTSTELLEN_QUELLEN.find((q) => q.name === 'record-auftrag-teilung.js').text;
    expect(teilung).toMatch(/require\('\.\.\/\.\.\/shared\/document-split\.js'\)/);
    expect(teilung).toMatch(/require\('\.\.\/documents\/teilungs-optionen\.js'\)/);
    expect(trefferAusserhalbKommentaren(teilung, /schwelle: optionen\.schwelle/g)).toHaveLength(1);
    expect(trefferAusserhalbKommentaren(teilung, /\bschwelle:/g)).toHaveLength(1);
    // Story AK6: kein Dialog, keine Ankündigung, kein Sprach-Schlüssel.
    expect(teilung).not.toMatch(/electron|dialog|frageTeilung|\bt\(|tForWindow/);
  });
});
