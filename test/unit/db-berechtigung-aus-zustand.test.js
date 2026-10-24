// 4T-002148 (Epic 3E-000263), AK5: Die neuen Zusagen der Berechtigungen im
// Aus-Zustand der Erweiterung «Datenbank», jede einzeln nachgewiesen. Benannt
// sind sie am 2026-10-17 mit der Plan-Freigabe (F5 A, S11) im Abschluss-Task:
//
//   1. Bei ausgeschalteter Datenbank gibt es keine Prüfung beim Speichern einer
//      Definition (`file:save`, `file:saveAs`, Suchen und Ersetzen im Bereich).
//   2. Es gibt keine Auflösung des Anmeldenamens zu einer Rolle.
//   3. Rollen, Zuordnung und Vorgabe-Rolle im Steckbrief bleiben bloßes
//      Frontmatter: Die Konsistenz-Prüfung meldet keine Rollen-Befunde.
//   4. Die Lese-Kanäle Datensatz, Liste und Positionsliste tragen keine
//      Rechte-Angabe (`rechte`, `rolle`, `gesperrteFelder`).
//
// **Warum eine eigene Datei.** Die Nachbarn messen die Berechtigungen im
// An-Zustand (`db-definitions-schutz.test.js`, `db-rechte.test.js`, die
// Kanal-Prüfdateien); jeder Fall hier stellt den Schalter auf «aus», und ein
// vergessenes Zurückstellen kippte dort fremde Fälle. Muster: der Haupt-Prozess-
// Nachweis `db-sperren-belege-aus-zustand.test.js` (Spione auf den Nähten UND
// das Dateisystem) und der Kopf von `datensatz-aus-zustand.test.js`.
//
// **Gemessen wird am Tor, nicht an einer Behauptung.** Keine der vier Zusagen
// trägt einen eigenen Schalter; sie gelten, weil ein Tor davor schließt, das
// die Verdrahtung (`src/main/app/wiring.js`) als EINE Funktion `datenbankAktiv`
// baut: `isExtensionEnabled('database', store.get('extensions.disabled'))`.
// Diese Datei baut das Tor auf demselben Weg aus einem Einstellungs-Speicher
// mit und ohne `database` in der Liste der ausgeschalteten Erweiterungen:
//
//   Zusage 1: das Tor im Schutz selbst (`erweiterungAktiv` in
//             `src/main/database/definitions-schutz.js`, Lage «ausgeschaltet»).
//   Zusage 2: dasselbe Tor im Schutz (die Rechte-Funktion wird nicht gefragt),
//             in der Schreib-Schnittstelle (`torZu` in `record-auftrag.js`, vor
//             der Rechte-Naht) und in den Lese-Kanälen (`torOffen` in
//             `src/main/ipc/database.js`, vor Index-Anstoß und Sicht).
//   Zusage 3: `torOffen` vor `database:konsistenz`; ohne Sicht liest
//             `rollenBefundeDerSicht` keinen Steckbrief.
//   Zusage 4: `torOffen` vor `database:datensatz`, `database:liste` und
//             `database:positionsliste`.
//   Zusagen 2 bis 4 an Übersicht und Tabellen-Definition: `torOffen` in
//             den Kanälen `database:overview` und `database:table` (Absatz unten).
//
// **Jede Zusage trägt ihre Gegenprobe:** eingeschaltet geschieht am selben
// Bestand das Gegenteil (Abweisung ohne `define`, Rolle aufgelöst, Befund
// gemeldet, Rechte-Angabe in der Antwort). Ohne sie wären die Aus-Fälle auch
// dann grün, wenn die Berechtigungen gar nichts mehr täten.
//
// **Übersicht und Tabellen-Definition** (`database:overview`, `database:table`)
// bleiben bei geschlossenem Tor offen, weil die Einstellungs-Seite die
// Bereichs-Art auch im Aus-Zustand liest (`readDatabaseFromConfig`). Seit dem
// 2026-10-18 fragen sie aber dasselbe Tor und tragen dann keine Berechtigungen:
// keine eigene Rolle, keine Erlaubnis-Menge, keine ausgelegten Rollen im
// Steckbrief und keine Rollen-Hinweise unter den Fehlerlagen; der Anmeldename
// wird gar nicht erst gelesen (Spion auf `os.userInfo`, die eine Quelle von
// `src/main/herkunft.js`). Fälle im Block «Übersicht und Tabelle».
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Alle Module über createRequire aus EINEM Modul-Graphen (Muster
// `area-replace.test.js`): Der Vorrat der Bereichs-Suche ist Modul-Zustand, und
// über zwei Instanzen fände die Ersetzen-Strecke ihren Bezugs-Stand nie.
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isExtensionEnabled } = require('../../src/shared/extensions/extensions-core.js');
const { erzeugeDefinitionsSchutz } = require('../../src/main/database/definitions-schutz.js');
const { erzeugeRechteFuer } = require('../../src/main/database/record-regel-berechtigung.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const { registerDatabaseIpc } = require('../../src/main/ipc/database.js');
const { sucheImBereich, gibBereichsVorratFrei } = require('../../src/main/area/area-search.js');
const { createAreaReplace } = require('../../src/main/area/area-replace.js');
const { createMddHistory } = require('../../src/main/documents/mdd-history.js');
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');
const { LAGEN } = require('../../src/main/database/record-auftrag-pruefung.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const DE = require('../../src/i18n/fragments/de/database.json');

const WURZEL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const VERDRAHTUNG = fs.readFileSync(
  path.join(WURZEL_REPO, 'src', 'main', 'app', 'wiring.js'),
  'utf8',
);

// --- Das Tor -----------------------------------------------------------------------------

// Der Einstellungs-Speicher mit der Liste der ausgeschalteten Erweiterungen.
function speicher(ausgeschaltet) {
  return {
    get: (schluessel) => (schluessel === 'extensions.disabled' ? ausgeschaltet : undefined),
  };
}

// Das Tor auf dem Weg der Verdrahtung (`datenbankAktiv` in wiring.js); der Fall
// «Verdrahtung» unten hält fest, dass sie es tatsächlich so baut.
function datenbankTor(store) {
  return () => isExtensionEnabled('database', store ? store.get('extensions.disabled') : []);
}

const AUS = datenbankTor(speicher(['database']));
const AN = datenbankTor(speicher([]));

// --- Bestand -----------------------------------------------------------------------------

// Eine Datenbank mit Rollen: Die Vorgabe-Rolle «leser» darf an «Kunden» ändern
// und an «Loans» anlegen, aber nirgends die Definition ändern. Eine Zuordnung
// unter `users` gibt es bewusst nicht, damit der Anmeldename des Rechners, auf
// dem die Prüfung läuft, immer auf die Vorgabe-Rolle fällt. Die Rolle «kaputt»
// nennt eine Tabelle, die es nicht gibt; daraus entsteht im An-Zustand der
// Rollen-Befund der Konsistenz-Prüfung.
const STECKBRIEF = [
  '---',
  'db-database:',
  '  name: Kunden-Datenbank',
  '  roles:',
  '    leser:',
  '      Kunden: [update]',
  '      Loans: [create]',
  '    kaputt:',
  '      Fremd: [update]',
  '  defaultRole: leser',
  '---',
  '',
  '# Kunden-Datenbank',
  '',
].join('\n');

// `name` ist am Feld fest gesperrt; daraus entsteht `gesperrteFelder`.
const KUNDEN = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '      editable: false',
  '    - name: ort',
  '      label: Wohnort',
  '  lastId: 1',
  '---',
  '',
  '# Kunden',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '```',
  '',
].join('\n');

const LOANS = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: kunde',
  '      type: record',
  '      options:',
  '        table: Kunden',
  '    - name: borrower',
  '---',
  '',
].join('\n');

function abfrageDatei(abfrage) {
  return [
    '---',
    'db-query:',
    '  editable: true',
    '  allow: [create, update, delete]',
    '---',
    '',
    '```perspective-query',
    abfrage,
    '```',
    '',
  ].join('\n');
}

// Die geänderte Definition: «Wohnort» wird zu «Stadt», sonst nichts.
const KUNDEN_GEAENDERT = KUNDEN.replace('label: Wohnort', 'label: Stadt');

let tmpDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  gibBereichsVorratFrei();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Ein echter Bereichs-Ordner mit allen fünf Dateien und die Sicht, wie der Index
// sie führt: Die Marken bleiben auch im Aus-Zustand stehen (Entscheidung E-C aus
// 4T-001761), die Sicht ist also in beiden Zuständen bereit.
function bestand() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-berechtigung-aus-'));
  tmpDirs.push(wurzel);
  const p = {
    kunden: lege(wurzel, 'Kunden.md', KUNDEN),
    loans: lege(wurzel, 'Loans.md', LOANS),
    liste: lege(wurzel, 'Kunden Liste.md', abfrageDatei('TABLE RECORDS name FROM "Kunden"')),
    ausleihen: lege(
      wurzel,
      'Ausleihen.md',
      abfrageDatei('TABLE RECORDS borrower FROM "Loans" SORT borrower'),
    ),
    steckbrief: lege(wurzel, 'Datenbank.md', STECKBRIEF),
  };
  const sicht = {
    dbKindsPerFile: new Map([
      [p.kunden, ['table']],
      [p.loans, ['table']],
      [p.liste, ['query']],
      [p.ausleihen, ['query']],
      [p.steckbrief, ['database']],
    ]),
  };
  return { wurzel, sicht, ...p };
}

// --- Zusage 1: keine Prüfung beim Speichern einer Definition -------------------------------

// Der Schutz mit der Rechte-Funktion der Verdrahtung über dem echten Steckbrief.
// Gezählt wird jeder Aufruf der Rechte-Funktion: Sie ist die eine Stelle, an der
// der Schutz den Anmeldenamen zu einer Rolle auflöst (Zusage 2).
function schutzFuer(b, tor) {
  const aufrufe = [];
  const rechteFuer = erzeugeRechteFuer({
    tabellenSicht: () => ({ status: 'ready', sicht: b.sicht }),
    fsp: fs.promises,
  });
  const schutz = erzeugeDefinitionsSchutz({
    tabellenSicht: () => ({ status: 'ready', meta: { wurzel: b.wurzel } }),
    rechteFuer: async (...args) => {
      aufrufe.push(args[0]);
      return rechteFuer(...args);
    },
    erweiterungAktiv: tor,
  });
  return { schutz, aufrufe };
}

// Die beiden Schreibwege der Datei-Kanäle, registriert wie in der Nachbar-Prüfdatei.
function dateiKanaele(definitionsSchutz, ziel = null) {
  const handlers = new Map();
  registerFilesIpc((k, fn) => handlers.set(k, fn), {
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: ziel }) },
    senderWindow: () => ({ id: 1 }),
    areaOfWindow: () => null,
    tForWindow: (_win, k) => DE[k] || k,
    isMddPath: () => false,
    isMarkdownPath: (p) => /\.md$/i.test(p),
    watchFile: () => {},
    unwatchFile: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    recordMddExternalOnOpen: async () => {},
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    saveGuard: { istKonflikt: () => false },
    pushRecent: () => {},
    getStore: () => null,
    readAreaLinks: async () => [],
    definitionsSchutz,
  });
  return {
    speichere: (pfad, text) => handlers.get('file:save')({ sender: { id: 1 } }, pfad, text, {}),
    speichereUnter: (text) => handlers.get('file:saveAs')({ sender: { id: 1 } }, ziel, text),
  };
}

// Die Ersetzen-Strecke mit der echten Historie (abgeschaltet) und dem Schutz.
function ersetzenStrecke(wurzel, definitionsSchutz) {
  const store = {
    get: (schluessel, vorgabe) => (schluessel === 'historyEnabled' ? false : vorgabe),
  };
  const historie = createMddHistory({
    getStore: () => store,
    areaOfWindow: () => ({ rootPath: wurzel }),
    readAreaHistoryDefault: async () => undefined,
  });
  const { ersetzeImBereich } = createAreaReplace({
    resolveHistoryFor: historie.resolveHistoryFor,
    recordMddOnSave: historie.recordMddOnSave,
    definitionsSchutz,
  });
  return ersetzeImBereich;
}

// Ein echter Suchlauf nach «Wohnort», gebündelt nach Datei wie vom Renderer.
async function wohnortAuswahl(wurzel) {
  const ergebnis = await sucheImBereich(wurzel, { muster: 'Wohnort', flags: 'gm', generation: 1 });
  const nachPfad = new Map();
  for (const treffer of ergebnis.treffer) {
    const pfad = treffer.sprung.kennung;
    if (!nachPfad.has(pfad)) nachPfad.set(pfad, { pfad, offsets: [] });
    nachPfad.get(pfad).offsets.push(treffer.sprung.offset);
  }
  return { muster: 'Wohnort', flags: 'gm', ersetzung: 'Stadt', dateien: [...nachPfad.values()] };
}

describe('Aus-Zustand Zusage 1: keine Prüfung beim Speichern einer Definition (4T-002148)', () => {
  it('baut das Tor so, dass «database» in der Liste der ausgeschalteten es schließt', () => {
    // Nicht-Vakuitäts-Probe für alle folgenden Fälle: Hielte das Tor auch mit
    // ausgeschalteter Erweiterung offen, prüften die Aus-Fälle den An-Zustand.
    expect(AUS()).toBe(false);
    expect(AN()).toBe(true);
    expect(datenbankTor(null)()).toBe(true);
  });

  it('Verdrahtung: der Schutz bekommt das Tor aus dem Einstellungs-Speicher', () => {
    // Die Zusage hängt an dieser Verdrahtung: Ein Schutz, dem das Tor fehlte,
    // prüfte auch im Aus-Zustand (`typeof erweiterungAktiv === 'function'`).
    expect(VERDRAHTUNG).toMatch(
      /const datenbankAktiv = \(\) => \{\s*const store = getStore\(\);\s*return isExtensionEnabled\('database', store \? store\.get\('extensions\.disabled'\) : \[\]\);/,
    );
    expect(VERDRAHTUNG).toMatch(
      /erzeugeDefinitionsSchutz\(\{[^}]*erweiterungAktiv: datenbankAktiv,?\s*\}\)/,
    );
  });

  it('file:save schreibt eine geänderte Definition ohne define, ohne die Rechte zu fragen', async () => {
    const b = bestand();
    const { schutz, aufrufe } = schutzFuer(b, AUS);
    const antwort = await dateiKanaele(schutz).speichere(b.kunden, KUNDEN_GEAENDERT);
    expect(antwort.ok).toBe(true);
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN_GEAENDERT);
    expect(aufrufe).toEqual([]);
  });

  it('file:saveAs schreibt über eine bestehende Definition und legt eine neue an', async () => {
    const b = bestand();
    const { schutz, aufrufe } = schutzFuer(b, AUS);
    expect(await dateiKanaele(schutz, b.kunden).speichereUnter(KUNDEN_GEAENDERT)).toEqual({
      ok: true,
      path: b.kunden,
    });
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN_GEAENDERT);
    // Eine neue Tabellen-Datei verlangt im An-Zustand `define`; hier nicht.
    const neu = path.join(b.wurzel, 'Autoren.md');
    const text = '---\ndb-table:\n  fields:\n    - name: name\n---\n';
    expect(await dateiKanaele(schutz, neu).speichereUnter(text)).toMatchObject({ ok: true });
    expect(fs.readFileSync(neu, 'utf8')).toBe(text);
    expect(aufrufe).toEqual([]);
  });

  it('Suchen und Ersetzen schreibt die Definition, ohne die Datei zu überspringen', async () => {
    const b = bestand();
    const { schutz, aufrufe } = schutzFuer(b, AUS);
    const auftrag = await wohnortAuswahl(b.wurzel);
    const ergebnis = await ersetzenStrecke(b.wurzel, schutz)(b.wurzel, auftrag);
    expect(ergebnis.fehlgeschlagen).toEqual([]);
    expect(ergebnis.geaendert).toEqual([{ pfad: b.kunden, anzahl: 1 }]);
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN_GEAENDERT);
    expect(aufrufe).toEqual([]);
  });

  it('Gegenprobe: eingeschaltet weisen alle drei Wege dieselbe Änderung ab', async () => {
    const b = bestand();
    const { schutz, aufrufe } = schutzFuer(b, AN);
    const gespeichert = await dateiKanaele(schutz).speichere(b.kunden, KUNDEN_GEAENDERT);
    expect(gespeichert).toMatchObject({ ok: false, code: 'defineNichtErlaubt' });
    expect(gespeichert.error).toContain('«leser»');
    const unter = await dateiKanaele(schutz, b.kunden).speichereUnter(KUNDEN_GEAENDERT);
    expect(unter).toMatchObject({ ok: false, code: 'defineNichtErlaubt' });
    const auftrag = await wohnortAuswahl(b.wurzel);
    const ergebnis = await ersetzenStrecke(b.wurzel, schutz)(b.wurzel, auftrag);
    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: b.kunden, grund: 'defineNichtErlaubt' }]);
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN);
    expect(aufrufe).toEqual([b.wurzel, b.wurzel, b.wurzel]);
  });
});

// --- Kanäle des Datenbank-Moduls -----------------------------------------------------------

// Der echte Handler über die echte Registrier-Funktion. Index-Anstoß und Sicht
// sind Spione: Bleiben beide ungerufen, hat der Kanal keinen Steckbrief gesehen
// und damit weder eine Rolle aufgelöst noch Rollen ausgelegt.
function registriere(b, tor) {
  const kanaele = new Map();
  const backlinks = {
    ensureIndexForDemand: vi.fn(),
    datenbankSicht: vi.fn(() => ({ status: 'ready', meta: { wurzel: b.wurzel }, sicht: b.sicht })),
    bufferTextFor: () => null,
  };
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
    areaRootForEvent: () => b.wurzel,
    backlinks,
    isMarkdownPath: (p) => /\.md$/i.test(p),
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
    datenbankAktiv: tor,
  });
  const ereignis = { sender: { id: 1 } };
  return {
    rufe: (kanal, params) => kanaele.get(kanal)(ereignis, params),
    sichtGefragt: () =>
      backlinks.ensureIndexForDemand.mock.calls.length + backlinks.datenbankSicht.mock.calls.length,
  };
}

// Die Parameter der drei Lese-Kanäle am Bestand.
function leseParameter(b) {
  return {
    'database:datensatz': { tabelle: 'Kunden.md', kennung: 'r-00001', sprache: 'de' },
    'database:liste': {
      pfad: b.liste,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: null,
      kennungen: ['r-00001'],
    },
    'database:positionsliste': {
      datei: 'Ausleihen',
      by: null,
      kopf: { tabelle: b.kunden, kennung: 'r-00001' },
    },
  };
}

const RECHTE_ANGABEN = ['rechte', 'rolle', 'gesperrteFelder'];
const OHNE_ZUGRIFF = { status: 'unavailable', belege: [], befunde: [], verkettung: null };
const KEINE_LISTE = { istListe: false };

// --- Zusage 2: keine Auflösung des Anmeldenamens zu einer Rolle ----------------------------

describe('Aus-Zustand Zusage 2: keine Auflösung des Anmeldenamens zu einer Rolle (4T-002148)', () => {
  it('die Lese-Kanäle fragen weder Index noch Sicht und lösen damit keine Rolle auf', async () => {
    const b = bestand();
    const anmeldename = vi.spyOn(os, 'userInfo');
    const k = registriere(b, AUS);
    for (const [kanal, params] of Object.entries(leseParameter(b))) {
      const antwort = await k.rufe(kanal, params);
      for (const angabe of RECHTE_ANGABEN) expect(antwort, kanal).not.toHaveProperty(angabe);
    }
    expect(k.sichtGefragt()).toBe(0);
    expect(anmeldename).not.toHaveBeenCalled();
  });

  it('die Schreib-Schnittstelle fragt die Rechte-Naht nicht', async () => {
    // Das Tor steht in `fuehreAuftragAus` und `eroeffneNeuanlage` als erste
    // Prüfung, vor der Rechte-Naht (`pruefeAnlegen`) und der Prüf-Naht der Regeln.
    const b = bestand();
    const rechteFuer = vi.fn(async () => ({
      status: 'ready',
      rolle: 'leser',
      rechte: { Kunden: { create: false, update: true, delete: false, define: false } },
    }));
    const schnittstelle = schnittstelleMit(AUS, rechteFuer);
    expect(await schnittstelle.eroeffneNeuanlage(b.wurzel, 'Kunden.md')).toMatchObject({
      ok: false,
      code: LAGEN.erweiterungAus,
    });
    const auftrag = {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: {},
          werte: { ort: 'Bern' },
        },
      ],
    };
    expect(await schnittstelle.fuehreAuftragAus(b.wurzel, auftrag)).toMatchObject({
      ok: false,
      code: LAGEN.erweiterungAus,
    });
    expect(rechteFuer).not.toHaveBeenCalled();
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN);

    // Gegenprobe: eingeschaltet fragt die Neuanlage die Rechte-Naht und weist
    // die Rolle ohne `create` ab, bevor eine Kennung gezogen wird.
    const an = schnittstelleMit(AN, rechteFuer);
    expect(await an.eroeffneNeuanlage(b.wurzel, 'Kunden.md')).toMatchObject({
      ok: false,
      code: LAGEN.nichtErlaubt,
    });
    expect(rechteFuer).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(b.kunden, 'utf8')).toBe(KUNDEN);
  });

  it('Gegenprobe: eingeschaltet lösen die Lese-Kanäle die Vorgabe-Rolle auf', async () => {
    const b = bestand();
    const k = registriere(b, AN);
    for (const [kanal, params] of Object.entries(leseParameter(b))) {
      expect((await k.rufe(kanal, params)).rolle, kanal).toBe('leser');
    }
    expect(k.sichtGefragt()).toBeGreaterThan(0);
  });
});

// Die echte Schnittstelle wie in der Verdrahtung, mit Tor und Rechte-Naht als Parametern.
function schnittstelleMit(tor, rechteFuer) {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({ sperrVerwaltung, leseKonfig, erweiterungAktiv: tor }),
    erweiterungAktiv: tor,
    rechteFuer,
    herkunft: () => ({ benutzer: 'gast', rechner: 'pc' }),
    warteAbstaende: [],
  });
}

// --- Zusage 3: Rollen im Steckbrief bleiben bloßes Frontmatter -----------------------------

describe('Aus-Zustand Zusage 3: Rollen im Steckbrief bleiben bloßes Frontmatter (4T-002148)', () => {
  it('die Konsistenz-Prüfung meldet keinen Rollen-Befund und liest den Steckbrief nicht', async () => {
    const b = bestand();
    const k = registriere(b, AUS);
    expect(await k.rufe('database:konsistenz', { tabelle: null })).toEqual(OHNE_ZUGRIFF);
    expect(k.sichtGefragt()).toBe(0);
    // Die Datei bleibt, wie sie ist: Die Prüfung schreibt nie, und im
    // Aus-Zustand liest sie nicht einmal.
    expect(fs.readFileSync(b.steckbrief, 'utf8')).toBe(STECKBRIEF);
  });

  it('Gegenprobe: eingeschaltet meldet sie die Rolle mit der unbekannten Tabelle', async () => {
    const b = bestand();
    const ergebnis = await registriere(b, AN).rufe('database:konsistenz', { tabelle: null });
    const rollen = ergebnis.befunde.filter((x) => x.code === 'konsistenzSteckbriefRollen');
    expect(rollen.map((x) => [x.datei, x.wert, x.zieltabelle])).toEqual([
      [b.steckbrief, 'kaputt', 'Fremd'],
    ]);
  });
});

// --- Zusage 4: die Lese-Kanäle tragen keine Rechte-Angabe ----------------------------------

describe('Aus-Zustand Zusage 4: die Lese-Kanäle tragen keine Rechte-Angabe (4T-002148)', () => {
  it('Datensatz, Liste und Positionsliste antworten mit der Abweisung ohne Zugriff', async () => {
    const b = bestand();
    const k = registriere(b, AUS);
    const p = leseParameter(b);
    expect(await k.rufe('database:datensatz', p['database:datensatz'])).toEqual(OHNE_ZUGRIFF);
    expect(await k.rufe('database:liste', p['database:liste'])).toEqual(KEINE_LISTE);
    expect(await k.rufe('database:positionsliste', p['database:positionsliste'])).toEqual(
      KEINE_LISTE,
    );
  });

  it('fragt das Tor bei jeder Anfrage neu: Umschalten wirkt ohne Neu-Registrierung', async () => {
    let an = false;
    const b = bestand();
    const k = registriere(b, () => (an ? AN() : AUS()));
    const p = leseParameter(b)['database:datensatz'];
    expect(await k.rufe('database:datensatz', p)).not.toHaveProperty('rechte');
    an = true;
    expect(await k.rufe('database:datensatz', p)).toHaveProperty('rechte');
    an = false;
    expect(await k.rufe('database:datensatz', p)).not.toHaveProperty('rechte');
  });

  it('Gegenprobe: eingeschaltet tragen alle drei Antworten Rechte, Rolle und Sperren', async () => {
    const b = bestand();
    const k = registriere(b, AN);
    const p = leseParameter(b);
    const datensatz = await k.rufe('database:datensatz', p['database:datensatz']);
    expect(datensatz).toMatchObject({
      status: 'ready',
      rolle: 'leser',
      rechte: { create: false, update: true, delete: false, define: false },
      gesperrteFelder: ['name'],
    });
    const liste = await k.rufe('database:liste', p['database:liste']);
    expect(liste).toMatchObject({
      istListe: true,
      rolle: 'leser',
      rechte: { create: false, update: true, delete: false, define: false },
      gesperrteFelder: { 'r-00001': ['name'] },
    });
    const positionen = await k.rufe('database:positionsliste', p['database:positionsliste']);
    expect(positionen).toMatchObject({
      istListe: true,
      rolle: 'leser',
      rechte: { create: true, update: false, delete: false, define: false },
    });
  });
});

// --- Zusagen 2 bis 4 an Übersicht und Tabellen-Definition ---------------------------------

// Die beiden Kanäle antworten auch bei geschlossenem Tor, weil die
// Einstellungs-Seite nach der Bereichs-Art fragt. Gemessen wird deshalb nicht
// die Abweisung, sondern dass die Antwort ohne Berechtigungen kommt und das
// Übrige unverändert trägt.
describe('Aus-Zustand: Übersicht und Tabellen-Definition ohne Berechtigungen (4T-002148)', () => {
  const rollenHinweise = (hinweise) =>
    (hinweise || []).map((h) => h.code).filter((code) => /^(role|user|defaultRole)/.test(code));

  it('database:overview trägt keine Rolle, keine Rechte und keine Rollen-Hinweise', async () => {
    const b = bestand();
    const anmeldename = vi.spyOn(os, 'userInfo');
    const antwort = await registriere(b, AUS).rufe('database:overview', {});
    // Die Übersicht selbst bleibt: Bereichs-Art, Steckbrief, Tabellen, Listen.
    expect(antwort).toMatchObject({ status: 'ready', istDatenbankBereich: true });
    expect(antwort.steckbrief).toMatchObject({ path: b.steckbrief, name: 'Kunden-Datenbank' });
    expect(antwort.tabellen.map((t) => t.name)).toEqual(['Kunden', 'Loans']);
    expect(antwort.abfragen).toHaveLength(2);
    // Ohne Berechtigungen.
    expect(antwort).not.toHaveProperty('eigeneRolle');
    for (const t of antwort.tabellen) expect(t, t.name).not.toHaveProperty('rechte');
    for (const angabe of ['rollen', 'defaultRole', 'users'])
      expect(antwort.steckbrief).not.toHaveProperty(angabe);
    expect(rollenHinweise(antwort.hints)).toEqual([]);
    expect(rollenHinweise(antwort.steckbrief.hints)).toEqual([]);
    expect(anmeldename).not.toHaveBeenCalled();
  });

  it('Gegenprobe: eingeschaltet löst database:overview die Vorgabe-Rolle auf', async () => {
    const b = bestand();
    const anmeldename = vi.spyOn(os, 'userInfo');
    const antwort = await registriere(b, AN).rufe('database:overview', {});
    expect(antwort.eigeneRolle).toMatchObject({ rolle: 'leser', quelle: 'vorgabe' });
    expect(antwort.tabellen.find((t) => t.name === 'Kunden').rechte).toEqual({
      create: false,
      update: true,
      delete: false,
      define: false,
    });
    expect(Object.keys(antwort.steckbrief.rollen)).toEqual(['leser']);
    expect(antwort.steckbrief.defaultRole).toBe('leser');
    expect(rollenHinweise(antwort.hints)).toEqual(['roleTable']);
    expect(anmeldename).toHaveBeenCalled();
  });

  it('database:table trägt die Definition, aber weder Rolle noch Rechte', async () => {
    const b = bestand();
    const anmeldename = vi.spyOn(os, 'userInfo');
    const params = { filePath: b.kunden, tabelle: 'Kunden' };
    const antwort = await registriere(b, AUS).rufe('database:table', params);
    expect(antwort).toMatchObject({ gefunden: true, name: 'Kunden', path: b.kunden });
    expect(antwort.fields.map((f) => f.name)).toEqual(['name', 'ort']);
    expect(antwort).not.toHaveProperty('rolle');
    expect(antwort).not.toHaveProperty('rechte');
    expect(anmeldename).not.toHaveBeenCalled();

    // Gegenprobe: eingeschaltet trägt dieselbe Antwort Rolle und Rechte.
    const an = await registriere(b, AN).rufe('database:table', params);
    expect(an).toMatchObject({
      gefunden: true,
      rolle: 'leser',
      rechte: { create: false, update: true, delete: false, define: false },
    });
  });
});
