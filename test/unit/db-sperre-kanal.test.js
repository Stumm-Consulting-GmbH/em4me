// 4T-001941 (Epic 3E-000257, Bauplan B1, B5; AK1 bis AK6): Der Kanal
// `database:sperre` und seine Brücke — die Datensatz-Sperre der Einzel-Maske.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion, mit der
// echten Sperr-Verwaltung am echten Dateisystem im Temp-Ordner (Muster
// `db-datensatz-kanal.test.js`). Uhr, Herkunft und Lebend-Prüfung sind Nähte
// der Verwaltung, damit Frist, Absturz-Rest und fremder Halter ohne Warten und
// ohne zweiten Rechner messbar sind.
//
// Dazu der Nachweis, auf dem die Bindung an die Bearbeitung ruht: Ein Auftrag
// der echten Schreib-Schnittstelle nach genommener Sperre läuft durch, ohne die
// Sperre ein zweites Mal zu nehmen und ohne sie freizugeben.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import {
  erzeugeSperrVerwaltung,
  LEBEN_CODES,
  SPERR_FRIST_MS,
  WEG_BRECHEN,
  WEG_LESEN,
} from '../../src/main/database/lock-lifecycle.js';
import { sperrDateiName } from '../../src/main/database/lock-store.js';
import { bediene } from '../../src/main/database/sperre-bedienung.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

// --- Aufbau ------------------------------------------------------------------------------

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);
const EIGENER_RECHNER = 'SC-026';
const EIGENE_PID = 4242;

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '    - name: ort',
  '  lastId: 2',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '|- id="r-00002"',
  '| Bert',
  '| Bern',
  '```',
  '',
].join('\n');

function neueWurzel() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sperre-kanal-'));
  tmpDirs.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'Kunden.md'), TABELLE, 'utf8');
  return wurzel;
}

// Die echte Verwaltung mit einstellbarer Uhr und Lebend-Prüfung. `versatz`
// schiebt die Uhr vor, `lebend` nennt die Prozess-Nummern, die noch laufen.
function verwaltung() {
  const lage = { versatz: 0, lebend: new Set() };
  const v = erzeugeSperrVerwaltung({
    leseKonfig: async () => undefined,
    uhr: () => Date.now() + lage.versatz,
    herkunft: () => ({ benutzer: 'anna', rechner: EIGENER_RECHNER }),
    prozess: { pid: EIGENE_PID, lebt: (pid) => lage.lebend.has(pid) },
  });
  return { v, lage };
}

function registriere({ sperrVerwaltung, datenbankAktiv = () => true, ohneTor = false } = {}) {
  const kanaele = new Map();
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () => ({ status: 'unavailable', meta: null, sicht: null }),
      bufferTextFor: () => null,
    },
    isMarkdownPath,
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
    sperrVerwaltung,
  };
  if (!ohneTor) deps.datenbankAktiv = datenbankAktiv;
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), deps);
  return kanaele;
}

function kanal(optionen) {
  return registriere(optionen).get('database:sperre');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

function sperrPfad(wurzel, kennung = 'r-00001') {
  const benannt = sperrDateiName(wurzel, { art: 'record', tabelle: 'Kunden.md', id: kennung });
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, benannt.name);
}

// Eine Sperr-Datei, wie ein anderer Rechner sie hinterlassen hätte.
function legeFremdeSperre(wurzel, inhalt) {
  const pfad = sperrPfad(wurzel);
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const text =
    typeof inhalt === 'string'
      ? inhalt
      : `${JSON.stringify({ schemaVersion: 1, art: 'record', tabelle: 'Kunden.md', id: 'r-00001', ...inhalt }, null, 2)}\n`;
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

function jetztIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function gestaltOhneZugriff() {
  const { v } = verwaltung();
  return registriere({ sperrVerwaltung: v }).get('database:changeLog')({}, undefined);
}

function echteSchnittstelle(sperrVerwaltung) {
  const leseKonfig = async () => undefined;
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-09-25T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: EIGENER_RECHNER }),
    warteAbstaende: [],
  });
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:sperre: Registrierung und Brücke (4T-001941, B1)', () => {
  it('registriert den Kanal neben den sechs bestehenden', () => {
    const { v } = verwaltung();
    expect([...registriere({ sperrVerwaltung: v }).keys()].sort()).toEqual([
      'database:auftrag',
      'database:changeLog',
      // 4T-001942 (Epic 3E-000257): die Wertehilfe der Verweis-Felder.
      'database:datensaetze',
      'database:datensatz',
      // 4T-001944 (Epic 3E-000257): die Konsistenz-Prüfung über den Bestand.
      'database:konsistenz',
      // 4T-001943 (Epic 3E-000257): die Masken-Datei herausschreiben.
      'database:maskeSchreiben',
      'database:neuanlage',
      'database:overview',
      'database:sperre',
      'database:table',
      // 4T-001945 (Epic 3E-000257): der Verwendungsnachweis.
      'database:verwendung',
    ]);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' };
    expect(await bruecke.databaseSperre(params)).toEqual({ name: 'database:sperre' });
    expect(invoke).toHaveBeenCalledWith('database:sperre', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- AK1: nehmen und freigeben -----------------------------------------------------------

describe('database:sperre: nehmen und freigeben (4T-001941, AK1)', () => {
  it('nimmt die Sperre mit Benutzer, Rechner und Zeitpunkt und gibt sie frei', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });

    // Die nicht aufgefüllte Kennung ergibt denselben Gegenstand.
    const genommen = await sperre(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: path.join(wurzel, 'Kunden.md'),
      kennung: 'r-1',
    });
    expect(genommen).toMatchObject({
      status: 'ready',
      gehalten: true,
      uebernommen: false,
      gebrochen: false,
      konflikt: null,
      fristMs: SPERR_FRIST_MS,
    });
    expect(typeof genommen.stand).toBe('string');
    // Sprachneutral und ohne Pfad: Was die Seite nicht braucht, bleibt im Haupt-Prozess.
    expect(genommen).not.toHaveProperty('pfad');
    const inhalt = JSON.parse(fs.readFileSync(sperrPfad(wurzel), 'utf8'));
    expect(inhalt).toMatchObject({ art: 'record', id: 'r-00001', benutzer: 'anna' });
    expect(inhalt.rechner).toBe(EIGENER_RECHNER);
    expect(Number.isFinite(Date.parse(inhalt.zeitpunkt))).toBe(true);

    const frei = await sperre(ereignis(wurzel), {
      aktion: 'freigeben',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(frei).toEqual({ status: 'ready', freigegeben: true, grund: null, verloren: false });
    expect(fs.existsSync(sperrPfad(wurzel))).toBe(false);

    // Ein zweites Freigeben ist folgenlos und nennt seinen Grund.
    const nochmal = await sperre(ereignis(wurzel), {
      aktion: 'freigeben',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(nochmal).toMatchObject({ freigegeben: false, grund: LEBEN_CODES.nichtGehalten });
  });

  it('meldet beim Freigeben den Verlust, wenn ein anderer die Sperre inzwischen hält', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    await sperre(ereignis(wurzel), { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' });
    const pfad = legeFremdeSperre(wurzel, {
      benutzer: 'bert',
      rechner: 'SC-099',
      zeitpunkt: jetztIso(),
    });
    const vorher = fs.readFileSync(pfad, 'utf8');

    const frei = await sperre(ereignis(wurzel), {
      aktion: 'freigeben',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });

    expect(frei).toMatchObject({ status: 'ready', freigegeben: false, verloren: true });
    // Die fremde Sperre bleibt unberührt.
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });

  it('die Auskunft nennt eine lebende Sperre, ohne selbst eine anzulegen', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    const frage = { aktion: 'auskunft', tabelle: 'Kunden.md', kennung: 'r-00001' };

    expect(await sperre(ereignis(wurzel), frage)).toEqual({
      status: 'ready',
      lebend: false,
      konflikt: null,
      fristMs: SPERR_FRIST_MS,
    });
    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);

    await sperre(ereignis(wurzel), { ...frage, aktion: 'nehmen' });
    const belegt = await sperre(ereignis(wurzel), frage);
    expect(belegt).toMatchObject({ status: 'ready', lebend: true });
    expect(belegt.konflikt).toMatchObject({ eigenerProzess: true, benutzer: 'anna' });
    // Ein anderer Datensatz derselben Tabelle ist frei.
    expect(await sperre(ereignis(wurzel), { ...frage, kennung: 'r-00002' })).toMatchObject({
      lebend: false,
    });
  });
});

// --- AK3 und AK5: Konflikt, Frist, Absturz-Rest, zweites Fenster ---------------------------

describe('database:sperre: Konflikt und Bruch (4T-001941, AK3, AK5)', () => {
  it('eine fremde Sperre vor der Frist bietet nur «lesen», der Bruch wird abgewiesen', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    const zeitpunkt = jetztIso();
    const pfad = legeFremdeSperre(wurzel, { benutzer: 'bert', rechner: 'SC-099', zeitpunkt });
    const vorher = fs.readFileSync(pfad, 'utf8');

    const versuch = await sperre(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(versuch).toMatchObject({ status: 'ready', gehalten: false });
    expect(versuch.konflikt).toMatchObject({
      benutzer: 'bert',
      rechner: 'SC-099',
      zeitpunkt,
      halterUnbekannt: false,
      eigenerProzess: false,
      abgelaufen: false,
      wege: [WEG_LESEN],
    });
    // Der Stand der Antwort ist der der vorgefundenen Sperre.
    expect(versuch.stand).toBe(versuch.konflikt.stand);

    const bruch = await sperre(ereignis(wurzel), {
      aktion: 'brechen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      stand: versuch.stand,
    });
    expect(bruch).toMatchObject({ gehalten: false, grund: LEBEN_CODES.vorFrist });
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });

  it('nach der Frist bietet sie «brechen», und der Bruch hält die Sperre', async () => {
    const wurzel = neueWurzel();
    const { v, lage } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    legeFremdeSperre(wurzel, { benutzer: 'bert', rechner: 'SC-099', zeitpunkt: jetztIso() });
    lage.versatz = SPERR_FRIST_MS + 60 * 1000;

    const versuch = await sperre(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(versuch.konflikt).toMatchObject({ abgelaufen: true, wege: [WEG_LESEN, WEG_BRECHEN] });

    // Ein Stand, über den nicht geurteilt wurde, wird abgewiesen.
    const falsch = await sperre(ereignis(wurzel), {
      aktion: 'brechen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      stand: 'f'.repeat(64),
    });
    expect(falsch).toMatchObject({ gehalten: false, grund: LEBEN_CODES.standAbweichend });

    const bruch = await sperre(ereignis(wurzel), {
      aktion: 'brechen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      stand: versuch.stand,
    });
    expect(bruch).toMatchObject({
      status: 'ready',
      gehalten: true,
      gebrochen: true,
      konflikt: null,
    });
    const inhalt = JSON.parse(fs.readFileSync(sperrPfad(wurzel), 'utf8'));
    expect(inhalt).toMatchObject({ benutzer: 'anna', rechner: EIGENER_RECHNER, pid: EIGENE_PID });
  });

  it('ein Bruch ohne Stand wird mit seinem Code abgewiesen', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const antwort = await kanal({ sperrVerwaltung: v })(ereignis(wurzel), {
      aktion: 'brechen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(antwort).toEqual({ status: 'error', code: LEBEN_CODES.ohneStand });
  });

  it('übernimmt den Absturz-Rest desselben Rechners ohne Konflikt', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    legeFremdeSperre(wurzel, {
      benutzer: 'anna',
      rechner: EIGENER_RECHNER,
      zeitpunkt: jetztIso(),
      pid: 999,
    });

    const antwort = await kanal({ sperrVerwaltung: v })(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });

    expect(antwort).toMatchObject({
      status: 'ready',
      gehalten: true,
      uebernommen: true,
      konflikt: null,
    });
    expect(JSON.parse(fs.readFileSync(sperrPfad(wurzel), 'utf8')).pid).toBe(EIGENE_PID);
  });

  it('ein zweites Fenster desselben Prozesses sieht den Konflikt mit dem einen Weg «lesen»', async () => {
    const wurzel = neueWurzel();
    const { v, lage } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    const frage = { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' };
    const erstes = await sperre(ereignis(wurzel), frage);
    const vorher = fs.readFileSync(sperrPfad(wurzel), 'utf8');

    // Auch nach der Frist: Die eigene Sperre wird nie zum Bruch angeboten.
    lage.versatz = SPERR_FRIST_MS + 60 * 1000;
    const zweites = await sperre(ereignis(wurzel), frage);

    expect(erstes.gehalten).toBe(true);
    expect(zweites).toMatchObject({ status: 'ready', gehalten: false });
    expect(zweites.konflikt).toMatchObject({ eigenerProzess: true, wege: [WEG_LESEN] });
    const bruch = await sperre(ereignis(wurzel), {
      ...frage,
      aktion: 'brechen',
      stand: zweites.stand,
    });
    expect(bruch).toMatchObject({ gehalten: false, grund: LEBEN_CODES.eigenerProzess });
    expect(fs.readFileSync(sperrPfad(wurzel), 'utf8')).toBe(vorher);
  });
});

// --- AK4: Halter unbekannt ----------------------------------------------------------------

describe('database:sperre: Halter unbekannt (4T-001941, AK4)', () => {
  it('eine leere Sperr-Datei ist belegt, nennt keinen Halter und wird nach der Frist brechbar', async () => {
    const wurzel = neueWurzel();
    const { v, lage } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    legeFremdeSperre(wurzel, '');
    const frage = { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' };

    const frisch = await sperre(ereignis(wurzel), frage);
    expect(frisch).toMatchObject({ status: 'ready', gehalten: false, fristMs: SPERR_FRIST_MS });
    expect(frisch.konflikt).toMatchObject({
      halterUnbekannt: true,
      benutzer: null,
      rechner: null,
      zeitpunkt: null,
      eigenerProzess: false,
      wege: [WEG_LESEN],
    });

    // Das Alter misst die Änderungszeit der Datei.
    lage.versatz = SPERR_FRIST_MS + 60 * 1000;
    const alt = await sperre(ereignis(wurzel), frage);
    expect(alt.konflikt).toMatchObject({ halterUnbekannt: true, wege: [WEG_LESEN, WEG_BRECHEN] });
    const bruch = await sperre(ereignis(wurzel), { ...frage, aktion: 'brechen', stand: alt.stand });
    expect(bruch).toMatchObject({ gehalten: true, gebrochen: true });
  });
});

// --- AK6: der Auftrag nach genommener Sperre ---------------------------------------------

describe('database:sperre: Auftrag aus einer Bearbeitung mit gehaltener Sperre (4T-001941, AK6)', () => {
  it('läuft ohne zweites Nehmen und gibt die Sperre der Bearbeitung nicht frei', async () => {
    const wurzel = neueWurzel();
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v });
    const schnittstelle = echteSchnittstelle(v);
    // Die Maske nennt die Tabelle mit ihrem vollen Pfad, der Auftrag hier relativ:
    // Beide ergeben denselben Gegenstand.
    const genommen = await sperre(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: path.join(wurzel, 'Kunden.md'),
      kennung: 'r-00001',
    });
    const vorher = fs.readFileSync(sperrPfad(wurzel), 'utf8');

    const ergebnis = await schnittstelle.fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: { name: 'Anna', ort: 'Basel' },
          werte: { ort: 'Thun' },
        },
      ],
    });

    // Ein zweites Nehmen wäre am eigenen Prozess gescheitert (Konflikt), und
    // der Auftrag wäre mit «Sperre nicht erlangt» abgewiesen worden.
    expect(ergebnis.ok, JSON.stringify(ergebnis)).toBe(true);
    expect(fs.readFileSync(path.join(wurzel, 'Kunden.md'), 'utf8')).toContain('| Thun');
    // Die Sperre der Bearbeitung steht unverändert, und der Prozess hält sie noch.
    expect(fs.readFileSync(sperrPfad(wurzel), 'utf8')).toBe(vorher);
    expect(v.gehalteneSperren().map((s) => s.stand)).toContain(genommen.stand);

    // Erst das Freigeben der Maske beendet sie.
    const frei = await sperre(ereignis(wurzel), {
      aktion: 'freigeben',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(frei).toMatchObject({ freigegeben: true, verloren: false });
    expect(fs.existsSync(sperrPfad(wurzel))).toBe(false);
  });
});

// --- Aus-Zustand und fail-closed ----------------------------------------------------------

function spionVerwaltung() {
  return {
    nimm: vi.fn(),
    gibFrei: vi.fn(),
    brich: vi.fn(),
    lebendeSperren: vi.fn(),
    gehalteneSperren: vi.fn(() => []),
  };
}

function erwarteKeinenZugriff(wurzel, spion) {
  for (const f of Object.values(spion)) expect(f).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
}

describe('database:sperre: Aus-Zustand der Erweiterung (4T-001941)', () => {
  it('verweigert bei ausgeschalteter Erweiterung und ohne Tor, ohne die Verwaltung zu rufen', async () => {
    const wurzel = neueWurzel();
    const ohne = await gestaltOhneZugriff();
    for (const optionen of [{ datenbankAktiv: () => false }, { ohneTor: true }]) {
      const spion = spionVerwaltung();
      for (const aktion of ['nehmen', 'freigeben', 'brechen', 'auskunft']) {
        const antwort = await kanal({ sperrVerwaltung: spion, ...optionen })(ereignis(wurzel), {
          aktion,
          tabelle: 'Kunden.md',
          kennung: 'r-00001',
          stand: 'a'.repeat(64),
        });
        expect(antwort).toEqual(ohne);
      }
      erwarteKeinenZugriff(wurzel, spion);
    }
  });

  it('fragt das Tor bei jedem Aufruf neu (Gegenprobe mit eingeschalteter Erweiterung)', async () => {
    const wurzel = neueWurzel();
    let an = true;
    const { v } = verwaltung();
    const sperre = kanal({ sperrVerwaltung: v, datenbankAktiv: () => an });
    const frage = { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' };
    expect(await sperre(ereignis(wurzel), frage)).toMatchObject({ gehalten: true });
    an = false;
    expect(await sperre(ereignis(wurzel), { ...frage, aktion: 'freigeben' })).toEqual(
      await gestaltOhneZugriff(),
    );
    // Die Sperre steht noch: Im Aus-Zustand wird auch nichts freigegeben.
    expect(fs.existsSync(sperrPfad(wurzel))).toBe(true);
  });

  it('das Modul selbst verweigert ohne Tor und bei ausgeschaltetem Tor', async () => {
    const spion = spionVerwaltung();
    const grund = {
      sperrVerwaltung: spion,
      wurzel: 'C:/Bereich',
      tabelle: 'Kunden.md',
      kennung: 'r-1',
    };
    expect(await bediene({ ...grund, aktion: 'nehmen' })).toEqual({ status: 'unavailable' });
    expect(await bediene({ ...grund, aktion: 'nehmen', erweiterungAktiv: () => false })).toEqual({
      status: 'unavailable',
    });
    for (const f of Object.values(spion)) expect(f).not.toHaveBeenCalled();
    // Eine unbrauchbare Kennung erreicht die Verwaltung ebenfalls nicht.
    expect(
      await bediene({ ...grund, kennung: 'x-1', aktion: 'nehmen', erweiterungAktiv: () => true }),
    ).toEqual({ status: 'error', code: 'sperrGegenstandUngueltig' });
    expect(spion.nimm).not.toHaveBeenCalled();
  });
});

describe('database:sperre: fail-closed vor jedem Zugriff (4T-001941, B1)', () => {
  it('Stufe Form: fehlende oder unbrauchbare Parameter', async () => {
    const wurzel = neueWurzel();
    const ohne = await gestaltOhneZugriff();
    const spion = spionVerwaltung();
    const sperre = kanal({ sperrVerwaltung: spion });
    const gut = { aktion: 'nehmen', tabelle: 'Kunden.md', kennung: 'r-00001' };
    for (const params of [
      undefined,
      null,
      [],
      { ...gut, aktion: 'loeschen' },
      { ...gut, aktion: undefined },
      { ...gut, tabelle: '' },
      { ...gut, tabelle: 7 },
      { ...gut, kennung: '' },
      { ...gut, kennung: null },
      { ...gut, stand: 42 },
    ]) {
      expect(await sperre(ereignis(wurzel), params)).toEqual(ohne);
    }
    erwarteKeinenZugriff(wurzel, spion);
  });

  it('Stufe Bereich: ein Fenster ohne gebundenen Bereich', async () => {
    const wurzel = neueWurzel();
    const spion = spionVerwaltung();
    const antwort = await kanal({ sperrVerwaltung: spion })(
      { wurzel: null, sender: { id: 1 } },
      { aktion: 'nehmen', tabelle: path.join(wurzel, 'Kunden.md'), kennung: 'r-00001' },
    );
    expect(antwort).toEqual(await gestaltOhneZugriff());
    erwarteKeinenZugriff(wurzel, spion);
  });

  it('Stufe Lage: eine Tabelle außerhalb des Bereichs', async () => {
    const wurzel = neueWurzel();
    const fremd = neueWurzel();
    const spion = spionVerwaltung();
    const sperre = kanal({ sperrVerwaltung: spion });
    for (const tabelle of ['../Kunden.md', path.join(fremd, 'Kunden.md')]) {
      const antwort = await sperre(ereignis(wurzel), {
        aktion: 'nehmen',
        tabelle,
        kennung: 'r-00001',
      });
      expect(antwort).toEqual(await gestaltOhneZugriff());
    }
    erwarteKeinenZugriff(wurzel, spion);
    erwarteKeinenZugriff(fremd, spion);
  });

  it('Stufe Endung: keine Markdown-Datei', async () => {
    const wurzel = neueWurzel();
    const spion = spionVerwaltung();
    const antwort = await kanal({ sperrVerwaltung: spion })(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: 'Kunden.txt',
      kennung: 'r-00001',
    });
    expect(antwort).toEqual(await gestaltOhneZugriff());
    erwarteKeinenZugriff(wurzel, spion);
  });

  it('ohne Sperr-Verwaltung in den Abhängigkeiten verweigert der Kanal', async () => {
    const wurzel = neueWurzel();
    const antwort = await kanal({ sperrVerwaltung: undefined })(ereignis(wurzel), {
      aktion: 'nehmen',
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(antwort).toEqual(await gestaltOhneZugriff());
    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
  });
});
