// 4T-002376 (Epic 3E-000265, AK5): Der Aus-Zustand der Erweiterung «Datenbank»
// für die Kartei-Form, je neuer Zusage des Epics ein Einzel-Nachweis.
//
// **Die Zusagen.** Bei ausgeschalteter Datenbank erfasst der Index keine
// Karteikarten (die Übersicht hätte nichts zu zählen), eine Abfrage über die
// Kartei-Tabelle liefert keine Zeile, Karteikarte und Tabellen-Datei bleiben
// byte-gleich, das Wiedereinschalten stellt den Bestand vollständig her, und
// die beiden Kommandos der Kartei-Form («Neue Karteikarte», «Als Karteikarte
// aufnehmen») sind nicht verfügbar. `storage` und `db-record` bleiben damit
// bloßes Frontmatter.
//
// **Warum eine eigene Datei.** Jeder Fall legt den Schalter des Index-Bestands
// um und baut die Indizes neu auf; Vorbild ist `datensatz-aus-zustand.test.js`
// (Temp-Wurzel, eigener Besitzer-Schlüssel, Zurückstellen im Aufräumen), die
// Messung der Kommandos folgt `render/extensions-aus.test.js`.
//
// **Die Zusagen des Epics 3E-000266 (4T-002377).** Die Prüfung beim Speichern
// liefert abgeschaltet keine Befunde, ohne die Sicht des Index zu fragen oder
// eine Datei zu lesen. Die Weichen des Bereichs-Panels erkennen abgeschaltet
// keine Karteikarte, sodass Löschen und Kopieren sie wie jede Datei behandeln
// und kein Auftrag an die Schreib-Schnittstelle geht. Nach dem Wiedereinschalten
// prüft die Prüfung und erkennt die Weiche wie zuvor, und alle Dateien bleiben
// byte-gleich. Beide Fabriken bekommen den Schalter der Erweiterung so
// hereingereicht wie in der Verdrahtung (`datenbankAktiv` in
// `src/main/app/wiring.js`).
import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  alleIndizesNeuAufbauen,
  backlinksFor,
  datenbankSicht,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// Statisch importiert, damit das Modul in der Import-Kette dieser Prüfdatei
// steht (Auswahl des Prüf-Ausschnitts).
import { HINT_DATABASE_OFF } from '../../src/main/index/query-records.js';
import {
  disabledCommandIdSet,
  isExtensionEnabled,
} from '../../src/shared/extensions/extensions-core.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { vergissAlleKarteiTabellen, zahlDerKarteikarten } = require_(
  '../../src/main/index/karteikarten-erfassung.js',
);
const { clearCaches } = require_('../../src/main/index/record-table-read.js');
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { KONSISTENZ_BEFUNDE } = require_('../../src/main/database/konsistenz-pruefung.js');
const { erzeugeSpeicherPruefung } = require_('../../src/main/database/speicher-pruefung.js');
const { erzeugeKarteiWeichen } = require_('../../src/main/database/kartei-weichen.js');

// --- Fixtures ---------------------------------------------------------------

const TABELLE = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: Kürzel',
  '    - name: Name',
  '    - name: Ort',
  '  key: Kürzel',
  '  display: Name',
  '  lastId: 2',
  '---',
  '',
  'Je Autor eine Karteikarte in diesem Ordner.',
  '',
].join('\n');

function karte(kennung, kuerzel, name, ort) {
  return [
    '---',
    `db-record: ${kennung}`,
    `Kürzel: ${kuerzel}`,
    `Name: ${name}`,
    `Ort: ${ort}`,
    '---',
    '',
    `# ${name}`,
    '',
    'Freitext der Karteikarte.',
    '',
  ].join('\n');
}

const ABFRAGE = 'TABLE RECORDS Name, Ort FROM "Autoren"';

// --- Setup/Teardown ---------------------------------------------------------

// Eigener Besitzer-Schlüssel: Der Neuaufbau baut nur Wurzeln mit Besitzer
// wieder auf (Begründung in datensatz-aus-zustand.test.js).
const BESITZER = 'test-kartei-aus-zustand:0';

const openRoots = new Set();
let tmpDirs = [];

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function warteAufIndex(activeFile) {
  let result = backlinksFor(activeFile, BESITZER);
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    result = backlinksFor(activeFile, BESITZER);
  }
  return result;
}

// Den Schalter umlegen und die Indizes neu aufbauen, wie die Verteilung der
// Einstellungs-Änderung (settings-verteilung.js).
async function schalte(aktiv, activeFile) {
  setzeDatensatzErfassung(aktiv);
  clearCaches();
  alleIndizesNeuAufbauen();
  return warteAufIndex(activeFile);
}

async function bereich() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-karteiaus-'));
  tmpDirs.push(root);
  const b = { root };
  b.tabelle = write(root, 'Autoren/Autoren.md', TABELLE);
  b.ada = write(root, 'Autoren/Ada Lovelace.md', karte('r-00001', 'ADA', 'Ada Lovelace', 'London'));
  b.alan = write(
    root,
    'Autoren/Alan Turing.md',
    karte('r-00002', 'ALT', 'Alan Turing', 'Wilmslow'),
  );
  b.abfragen = write(root, 'Abfragen.md', '# Abfragen\n');
  openRoots.add(rootForActiveFile(b.abfragen));
  const result = await warteAufIndex(b.abfragen);
  expect(result.status).toBe('ready');
  b.wurzel = rootForActiveFile(b.abfragen);
  return b;
}

function bestandVon(root, absPath) {
  const eintrag = indexes.get(root);
  return eintrag && eintrag.recordsPerFile.get(absPath);
}

function menge(b) {
  const { resultSet } = frontmatterQueryFor(b.abfragen, ABFRAGE, undefined, undefined, 'de-DE');
  expect(validateResultSet(resultSet)).toEqual([]);
  return resultSet;
}

const abdruck = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

afterEach(() => {
  // Der Schalter ist Modul-Zustand und überlebt den Fall.
  setzeDatensatzErfassung(true);
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  vergissAlleKarteiTabellen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root, BESITZER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- Index und Übersicht ----------------------------------------------------

describe('Kartei-Form im Aus-Zustand: der Index ruht (4T-002376, AK5)', () => {
  it('erfasst keine Karteikarte, und die Übersicht hat nichts zu zählen', async () => {
    const b = await bereich();
    // Nicht-Vakuitäts-Probe: eingeschaltet stehen beide Karteikarten da.
    expect(bestandVon(b.wurzel, b.ada).map((r) => r.id)).toEqual(['r-00001']);
    expect([...zahlDerKarteikarten(indexes.get(b.wurzel)).values()]).toEqual([2]);

    await schalte(false, b.abfragen);
    expect(bestandVon(b.wurzel, b.ada)).toBeUndefined();
    expect(bestandVon(b.wurzel, b.alan)).toBeUndefined();
    expect(zahlDerKarteikarten(indexes.get(b.wurzel)).size).toBe(0);
    // Die Marke der Tabellen-Datei bleibt wie in der Tabellen-Form.
    expect(indexes.get(b.wurzel).dbKindsPerFile.get(b.tabelle)).toContain('table');
  });
});

// --- Abfrage ----------------------------------------------------------------

describe('Kartei-Form im Aus-Zustand: die Abfrage liefert nichts (4T-002376, AK5)', () => {
  it('leere Menge mit dem Hinweis des Aus-Zustands statt der Karteikarten', async () => {
    const b = await bereich();
    // Nicht-Vakuitäts-Probe: eingeschaltet liefert die Kartei-Tabelle Zeilen.
    expect(menge(b).rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);

    await schalte(false, b.abfragen);
    const aus = menge(b);
    expect(aus.rows).toEqual([]);
    expect(aus.state.queryError).toBeNull();
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
  });
});

// --- Dateien und Rückkehr ---------------------------------------------------

describe('Kartei-Form im Aus-Zustand: Dateien und Wiedereinschalten (4T-002376, AK5)', () => {
  it('lässt Karteikarten und Tabellen-Datei byte-gleich und stellt alles wieder her', async () => {
    const b = await bereich();
    const vorher = [b.tabelle, b.ada, b.alan].map(abdruck);

    await schalte(false, b.abfragen);
    menge(b);
    expect([b.tabelle, b.ada, b.alan].map(abdruck)).toEqual(vorher);
    // Keine Beleg-Datei und keine weitere Datei im Ordner der Kartei.
    expect(fs.readdirSync(path.dirname(b.tabelle)).sort()).toEqual([
      'Ada Lovelace.md',
      'Alan Turing.md',
      'Autoren.md',
    ]);

    await schalte(true, b.abfragen);
    expect(bestandVon(b.wurzel, b.ada).map((r) => r.id)).toEqual(['r-00001']);
    expect(bestandVon(b.wurzel, b.alan).map((r) => r.id)).toEqual(['r-00002']);
    expect([...zahlDerKarteikarten(indexes.get(b.wurzel)).values()]).toEqual([2]);
    expect(menge(b).rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);
    expect([b.tabelle, b.ada, b.alan].map(abdruck)).toEqual(vorher);
  });
});

// --- Kommandos --------------------------------------------------------------

describe('Kartei-Form im Aus-Zustand: die Kommandos entfallen (4T-002376, AK5)', () => {
  it('«Neue Karteikarte» und «Als Karteikarte aufnehmen» sind abgeschaltet nicht verfügbar', () => {
    const manifest = extensionById('database');
    expect(manifest.commands).toContain('database.newCard');
    expect(manifest.commands).toContain('database.adoptCard');
    // 4T-002406 (Epic 3E-000266): dazu «In der Maske öffnen».
    expect(manifest.commands).toContain('database.openInForm');
    const aus = disabledCommandIdSet(['database']);
    const an = disabledCommandIdSet([]);
    for (const id of ['database.newCard', 'database.adoptCard', 'database.openInForm']) {
      expect(aus.has(id), id).toBe(true);
      expect(an.has(id), id).toBe(false);
    }
  });
});

// --- Die Zusagen des Epics 3E-000266 ----------------------------------------

// Der Schalter der Erweiterung wie `datenbankAktiv` in der Verdrahtung:
// `disabled` steht für die Einstellung `extensions.disabled`.
let disabled = [];
const erweiterungAktiv = () => isExtensionEnabled('database', disabled);

afterEach(() => {
  disabled = [];
});

// Beide Schalter auf «aus»: den Index-Schalter samt Neuaufbau und die Liste der
// abgeschalteten Erweiterungen, wie die Verteilung einer Einstellungs-Änderung.
async function ausschalten(b) {
  await schalte(false, b.abfragen);
  disabled = ['database'];
  expect(erweiterungAktiv()).toBe(false);
}

async function einschalten(b) {
  await schalte(true, b.abfragen);
  disabled = [];
  expect(erweiterungAktiv()).toBe(true);
}

// Dateizugriff, der seine Lese-Aufrufe zählt.
function zaehlenderZugriff() {
  const zugriff = { lesungen: 0 };
  zugriff.fsp = {
    readFile: (...args) => {
      zugriff.lesungen += 1;
      return fs.promises.readFile(...args);
    },
  };
  return zugriff;
}

// Eine dritte Karteikarte mit dem Kürzel von Ada: ein regel-verletzter Wert
// (Schlüssel-Dublette), den die Prüfung beim Speichern meldet.
function mitDublette(b) {
  b.byron = write(b.root, 'Autoren/Ada Byron.md', karte('r-00003', 'ADA', 'Ada Byron', 'London'));
  b.dateien = [b.tabelle, b.ada, b.alan, b.byron, b.abfragen];
  return b;
}

// Die Prüfung beim Speichern mit der Sicht der Verdrahtung (gespeicherter
// Stand, ohne Puffer) als Zähl-Attrappe.
function speicherPruefung() {
  const zugriff = zaehlenderZugriff();
  const tabellenSicht = vi.fn((pfad, bereichsWurzel) =>
    datenbankSicht(pfad, bereichsWurzel, { ohnePuffer: true }),
  );
  const pruefe = erzeugeSpeicherPruefung({
    tabellenSicht,
    erweiterungAktiv,
    vorlagenOrdner: async () => null,
    fsp: zugriff.fsp,
  });
  return { pruefe, tabellenSicht, zugriff };
}

// Das Speichern der Karteikarte «Ada Byron», wie es der Speicher-Kanal nach dem
// Schreiben meldet.
function gespeichert(b) {
  return { pfad: b.byron, text: fs.readFileSync(b.byron, 'utf8'), bereichsWurzel: b.wurzel };
}

const CODES = (befunde) => befunde.map((befund) => befund.code);

// Die Weichen des Bereichs-Panels; die Schreib-Schnittstelle ist eine Attrappe,
// die jeden Aufruf aufzeichnet und wirft.
function karteiWeichen() {
  const zugriff = zaehlenderZugriff();
  const auftraege = [];
  const schreibSchnittstelle = {
    fuehreAuftragAus: (...args) => {
      auftraege.push(args);
      throw new Error('Kein Auftrag an die Schreib-Schnittstelle erwartet');
    },
  };
  const weichen = erzeugeKarteiWeichen({
    schreibSchnittstelle,
    erweiterungAktiv,
    fsp: zugriff.fsp,
  });
  return { weichen, zugriff, auftraege };
}

const ADA_ALS_KARTE = (b) => ({
  pfad: path.resolve(b.ada),
  tabelle: b.tabelle,
  kennung: 'r-00001',
});

describe('Kartei-Form im Aus-Zustand: Speichern prüft nichts (4T-002377, AK5)', () => {
  it('liefert keine Befunde, ohne Index-Sicht und Dateien zu befragen, und lässt alle Dateien byte-gleich', async () => {
    const b = mitDublette(await bereich());
    const { pruefe, tabellenSicht, zugriff } = speicherPruefung();
    // Nicht-Vakuitäts-Probe: eingeschaltet meldet die Prüfung die Dublette.
    expect(CODES(await pruefe(gespeichert(b)))).toContain(KONSISTENZ_BEFUNDE.schluesselDoppelt);
    expect(tabellenSicht).toHaveBeenCalled();
    expect(zugriff.lesungen).toBeGreaterThan(0);
    const vorher = b.dateien.map(abdruck);

    await ausschalten(b);
    tabellenSicht.mockClear();
    zugriff.lesungen = 0;
    expect(await pruefe(gespeichert(b))).toBeNull();
    expect(tabellenSicht).not.toHaveBeenCalled();
    expect(zugriff.lesungen).toBe(0);
    expect(b.dateien.map(abdruck)).toEqual(vorher);
  });
});

describe('Kartei-Form im Aus-Zustand: Löschen und Kopieren wie jede Datei (4T-002377, AK5)', () => {
  it('erkennt keine Karteikarte, liest keine Datei und gibt keinen Auftrag an die Schreib-Schnittstelle', async () => {
    const b = await bereich();
    const { weichen, zugriff, auftraege } = karteiWeichen();
    // Nicht-Vakuitäts-Probe: eingeschaltet erkennen beide Weichen Ada als Karteikarte.
    expect(await weichen.karteikarteVon(b.ada)).toEqual(ADA_ALS_KARTE(b));
    expect(await weichen.kopierHandlung(b.ada, b.wurzel)).not.toBeNull();
    expect(zugriff.lesungen).toBeGreaterThan(0);
    const dateien = [b.tabelle, b.ada, b.alan, b.abfragen];
    const vorher = dateien.map(abdruck);

    await ausschalten(b);
    zugriff.lesungen = 0;
    // Lösch-Weiche und Kopier-Weiche: beide Kanäle gehen damit den Weg jeder Datei.
    expect(await weichen.karteikarteVon(b.ada)).toBeNull();
    expect(await weichen.kopierHandlung(b.ada, b.wurzel)).toBeNull();
    expect(zugriff.lesungen).toBe(0);
    expect(auftraege).toEqual([]);
    expect(dateien.map(abdruck)).toEqual(vorher);
  });
});

describe('Kartei-Form im Aus-Zustand: Wiedereinschalten der Prüfung und der Weichen (4T-002377, AK5)', () => {
  it('prüft und erkennt nach dem Wiedereinschalten wie zuvor, Dateien byte-gleich', async () => {
    const b = mitDublette(await bereich());
    const pruefung = speicherPruefung();
    const weiche = karteiWeichen();
    // Nicht-Vakuitäts-Probe: eingeschaltet melden und erkennen beide.
    expect(CODES(await pruefung.pruefe(gespeichert(b)))).toContain(
      KONSISTENZ_BEFUNDE.schluesselDoppelt,
    );
    expect(await weiche.weichen.karteikarteVon(b.ada)).toEqual(ADA_ALS_KARTE(b));
    const vorher = b.dateien.map(abdruck);

    await ausschalten(b);
    expect(await pruefung.pruefe(gespeichert(b))).toBeNull();
    expect(await weiche.weichen.karteikarteVon(b.ada)).toBeNull();

    await einschalten(b);
    expect(CODES(await pruefung.pruefe(gespeichert(b)))).toContain(
      KONSISTENZ_BEFUNDE.schluesselDoppelt,
    );
    expect(await weiche.weichen.karteikarteVon(b.ada)).toEqual(ADA_ALS_KARTE(b));
    expect(weiche.auftraege).toEqual([]);
    expect(b.dateien.map(abdruck)).toEqual(vorher);
  });
});
