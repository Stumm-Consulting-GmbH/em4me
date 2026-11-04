// 4T-002449 (Epic 3E-000378, Story 4S-001124 AK5, AK7): Der Aus-Zustand der
// Formel-Bibliothek auf der Seite des Haupt-Prozesses — der Schalter-Stand des
// Funktions-Katalogs beim Start und beim Umschalten, die Abfrage, die hier
// rechnet, und die Schreib-Schnittstelle der Datenbank nach der Entscheidung E1
// Option B des Product Owners vom 2026-10-31.
//
// **Warum eine eigene Datei.** Jeder Fall legt den Schalter des Katalogs um, der
// Modul-Zustand ist; in einer Datei mit fremden Fällen hieße ein vergessenes
// Zurückstellen, dass deren Fälle im Aus-Zustand liefen (Begründung wie
// `datensatz-aus-zustand.test.js`, dessen Aufbau mit Temp-Wurzel, Besitzer und
// Aufräumen hier gilt).
//
// **Alles über createRequire.** Gruppe und Schalter stehen im Katalog, und den
// lädt jedes Modul des Haupt-Prozesses über `require`; die Prüfdatei nimmt
// denselben Weg, damit sie dieselbe Instanz misst (Muster
// `perspective-query-eval.test.js`).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const katalog = req('../../src/shared/query/query-functions.js');
const { messageValue, coerceNumber } = req('../../src/shared/query/query-format.js');
const { validateResultSet } = req('../../src/shared/query/result-set.js');
const { createSettingsVerteilung } = req('../../src/main/ipc/settings-verteilung.js');
const { registerIndexViewsIpc } = req('../../src/main/ipc/index-views.js');
const backlinks = req('../../src/main/backlinks.js');
const { erzeugeSchreibSchnittstelle } = req('../../src/main/database/record-auftrag.js');
const { LAGEN } = req('../../src/main/database/record-auftrag-pruefung.js');
const { REGEL_LAGEN, erzeugePruefNaht } = req('../../src/main/database/record-regeln.js');
const { pruefregelnRegel } = req('../../src/main/database/record-regel-pruefregeln.js');
const { bearbeitbarRegel } = req('../../src/main/database/record-regel-bearbeitbar.js');
const { erzeugeSperrVerwaltung } = req('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = req('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = req('../../src/main/database/intent-recovery.js');

const BIBLIOTHEK = 'formula-library';
const BESITZER = 'test-formel-bibliothek:0';

function registriere() {
  katalog.registerFunctionGroup({
    namespace: 'probe',
    extension: BIBLIOTHEK,
    functions: {
      'probe.doppelt': {
        arity: [1, 1],
        fn: ([v]) => (coerceNumber(v) === null ? null : coerceNumber(v) * 2),
      },
      'probe.meldung': { arity: [0, 0], fn: () => messageValue('test.meldung') },
    },
  });
}

// Die Verteilung der Einstellungs-Änderung mit Fenster-Attrappen. Jedes Fenster
// hält fest, was es im Augenblick der Rundsendung im Katalog vorfände.
function verteilung() {
  const gesehen = [];
  const fenster = {
    isDestroyed: () => false,
    webContents: {
      send: (kanal, wert) => {
        if (kanal === 'extensions:changed')
          gesehen.push({ wert, lage: katalog.lookupFunction('probe.doppelt').lage });
      },
    },
  };
  const verteile = createSettingsVerteilung({
    BrowserWindow: { getAllWindows: () => [fenster] },
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    updateAllCaptionColors: () => {},
    timerChecker: { neuLaden: () => {} },
  });
  return { verteile, gesehen };
}

// Die Registrierung der Index-Kanäle beim Start, mit einem Speicher, der allein
// den Erweiterungs-Stand kennt (Abhängigkeiten wie `index-rundruf.test.js`).
function starte(disabled) {
  registerIndexViewsIpc(() => {}, {
    senderWindow: () => null,
    areaOfWindow: () => null,
    areaRootForEvent: () => null,
    getStore: () => ({ get: (k) => (k === 'extensions.disabled' ? disabled : undefined) }),
    backlinks,
    collectAreaStats: () => null,
    sucheImBereich: () => null,
    gibBereichsVorratFrei: () => {},
    readAreaProfilesConfig: () => null,
    resolveAreaStartPage: () => null,
    resolveHistoryFor: () => null,
    readPreviousTextFor: () => null,
    recordMddOnSave: () => {},
  });
}

// --- Temp-Wurzeln und Index -----------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function bereichsOrdner(praefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(root, rel, inhalt) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

async function indexBereit(datei) {
  let r = backlinks.backlinksFor(datei, BESITZER);
  for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    r = backlinks.backlinksFor(datei, BESITZER);
  }
  expect(r.status).toBe('ready');
}

async function abfrageBereich() {
  const root = bereichsOrdner('em4me-formelbib-');
  schreibe(root, 'Buch.md', '---\nseiten: 21\n---\n# Buch\n');
  const abfragen = schreibe(root, 'Abfragen.md', '# Abfragen\n');
  openRoots.add(backlinks.rootForActiveFile(abfragen));
  await indexBereit(abfragen);
  return abfragen;
}

function menge(datei, abfrage) {
  const { resultSet } = backlinks.frontmatterQueryFor(
    datei,
    abfrage,
    undefined,
    undefined,
    'de-DE',
  );
  expect(validateResultSet(resultSet)).toEqual([]);
  return resultSet;
}

afterEach(() => {
  katalog.resetFunctionGroupsForTests();
  vi.useFakeTimers();
  for (const root of openRoots) backlinks.releaseRoot(root, BESITZER);
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

describe('Formel-Bibliothek im Haupt-Prozess: Schalter-Stand (4T-002449, AK7)', () => {
  it('Umschalten: der Katalog steht vor der Rundsendung an die Fenster auf dem neuen Stand', () => {
    registriere();
    // 4T-002456, Zweitblick-Befund 4 des Epic-Abschlusses: Jedes Umschalten
    // leert den Zwischenspeicher der gelesenen Tabellen-Definitionen, damit
    // deren Hinweise der ausgeschalteten Bibliothek nicht veralten.
    const tabellenLeser = req('../../src/main/index/record-table-read.js');
    const geleert = vi.spyOn(tabellenLeser, 'clearCaches');
    const { verteile, gesehen } = verteilung();
    verteile('extensions.disabled', [BIBLIOTHEK], null);
    verteile('extensions.disabled', [], null);
    expect(gesehen).toEqual([
      { wert: [BIBLIOTHEK], lage: 'aus' },
      { wert: [], lage: 'an' },
    ]);
    expect(geleert).toHaveBeenCalledTimes(2);
    // Eine andere Einstellung lässt den Stand unberührt.
    verteile('extensions.disabled', [BIBLIOTHEK], null);
    verteile('autoSave', true, null);
    expect(geleert).toHaveBeenCalledTimes(3);
    geleert.mockRestore();
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('aus');
  });

  it('Start: der gespeicherte Stand gilt, bevor ein Fenster offen ist (Neustart)', () => {
    registriere();
    starte([BIBLIOTHEK]);
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('aus');
    starte([]);
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('an');
    starte(undefined);
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('an');
  });
});

describe('Formel-Bibliothek im Haupt-Prozess: die Abfrage (4T-002449, AK3, AK4)', () => {
  const ABFRAGE =
    'TABLE probe.doppelt(seiten) AS "Doppelt", round(pi() * seiten, 2) AS "Umfang" WHERE seiten > 0';

  it('an das Ergebnis, aus der eigene Code statt «unbekannte Funktion», wieder an das Ergebnis', async () => {
    registriere();
    const abfragen = await abfrageBereich();
    const an = menge(abfragen, ABFRAGE);
    expect(an.state.queryError).toBeNull();
    expect(an.rows.map((r) => r.values)).toEqual([[42, 65.97]]);

    const { verteile } = verteilung();
    verteile('extensions.disabled', [BIBLIOTHEK], null);
    const aus = menge(abfragen, ABFRAGE);
    expect(aus.state.queryError).toMatchObject({ code: 'functionOff', name: 'probe.doppelt' });
    expect(aus.rows).toEqual([]);
    // Grundfunktionen rechnen im Aus-Zustand weiter (AK6 der Story).
    const kern = menge(abfragen, 'TABLE round(pi() * seiten, 2) AS "Umfang" WHERE seiten > 0');
    expect(kern.state.queryError).toBeNull();
    expect(kern.rows.map((r) => r.values)).toEqual([[65.97]]);

    verteile('extensions.disabled', [], null);
    expect(menge(abfragen, ABFRAGE).rows.map((r) => r.values)).toEqual([[42, 65.97]]);
  });

  // 4T-002451: Die Zelle trägt die Meldung selbst (Entscheidung der steuernden
  // Sitzung vom 2026-10-31, löst «wie ein fehlender Wert» ab); die Anzeige zeigt
  // daraus das Warnzeichen. In WHERE gilt die Meldung als nicht erfüllt.
  it('ein Meldungs-Wert steht in der Zelle, die Menge bleibt gültig; in WHERE fällt die Zeile heraus', async () => {
    registriere();
    const abfragen = await abfrageBereich();
    const rs = menge(
      abfragen,
      'TABLE humidity.dewpoint(20, seiten * 6) AS "T", round(humidity.dewpoint(20, 50), 1) AS "W", seiten WHERE seiten > 0',
    );
    const meldung = messageValue('query.formula.humidity.relativeRangeDewpoint');
    expect(rs.rows.map((r) => r.values)).toEqual([[meldung, 9.3, '21']]);
    // Für die Werte-Art der Spalte zählt die Meldung wie ein fehlender Wert.
    expect(rs.columns[0].valueType).toBeNull();
    expect(rs.columns[1].valueType).toBe('number');
    expect(menge(abfragen, 'LIST WHERE NOT humidity.dewpoint(20, seiten * 6) = 1').rows).toEqual(
      [],
    );
    expect(menge(abfragen, 'LIST WHERE humidity.dewpoint(20, seiten) < 0').rows).toHaveLength(1);
    // Gruppiert nach einer Meldung steht die Zeile in der Gruppe ohne Wert.
    const gruppiert = menge(abfragen, 'LIST GROUP BY humidity.dewpoint(20, seiten * 6)');
    expect(gruppiert.groups.map((g) => g.value)).toEqual([null]);
  });

  // 4T-002452: Finanzmathematik in der Abfrage. Die Zahlungen des internen
  // Zinsfußes kommen als Listen-Feld aus dem Frontmatter, weil die Sprache kein
  // Listen-Literal kennt; die Bereichs-Meldung steht wie bei der Feuchte in der Zelle.
  it('Finanzmathematik: Rate, Zinsfuß aus einem Listen-Feld und Bereichs-Meldung in der Zelle', async () => {
    const root = bereichsOrdner('em4me-formelbib-finanz-');
    schreibe(root, 'Kredit.md', '---\nzahlungen: [-10000, 3500, 7600, 1000]\nmonate: 10\n---\n');
    const abfragen = schreibe(root, 'Abfragen.md', '# Abfragen\n');
    openRoots.add(backlinks.rootForActiveFile(abfragen));
    await indexBereit(abfragen);
    const rs = menge(
      abfragen,
      'TABLE round(finance.pmt(0.08/12, monate, 10000), 2) AS "Rate", ' +
        'round(finance.irr(zahlungen), 4) AS "Zinsfuß", ' +
        'finance.pmt(0.08/12, monate - 10, 10000) AS "M" WHERE monate > 0',
    );
    expect(rs.rows.map((r) => r.values)).toEqual([
      [-1037.03, 0.1133, messageValue('query.formula.finance.periodsRange')],
    ]);
  });

  // 4T-002453: Prozent, Einheiten und Body-Mass-Index in der Abfrage, mit den
  // Werten des Abnahme-Handgriffs der Story 4S-001140 und der Bereichs-Meldung
  // zum Ganzen in der Zelle.
  it('Prozent, Einheiten, Body-Mass-Index: 300, 98.6, 22.9 und Bereichs-Meldung in der Zelle', async () => {
    const root = bereichsOrdner('em4me-formelbib-alltag-');
    schreibe(root, 'Person.md', '---\nmasse: 70\ngröße: 1.75\nfieber: 37\n---\n');
    const abfragen = schreibe(root, 'Abfragen.md', '# Abfragen\n');
    openRoots.add(backlinks.rootForActiveFile(abfragen));
    await indexBereit(abfragen);
    const rs = menge(
      abfragen,
      'TABLE percent.increase(200, 50) AS "P", ' +
        'round(unit.celsiustofahrenheit(fieber), 1) AS "F", ' +
        'round(health.bmi(masse, größe), 1) AS "B", ' +
        'percent.share(5, 0) AS "M" WHERE masse > 0',
    );
    expect(rs.rows.map((r) => r.values)).toEqual([
      [300, 98.6, 22.9, messageValue('query.formula.percent.wholeRange')],
    ]);
  });
});

// --- Schreib-Schnittstelle der Datenbank (Entscheidung E1 Option B) ---------------

const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Menge',
  '      type: number',
  "      check: 'probe.doppelt(value) < 100'",
  "  editable: 'probe.doppelt(Menge) < 10'",
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| 3',
  '```',
  '',
].join('\n');

function datenbank(tabelle = TABELLE) {
  const wurzel = bereichsOrdner('em4me-formelbib-db-');
  const pfad = schreibe(wurzel, 'Lager.md', tabelle);
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  const tabellenSicht = () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map([[pfad, ['table']]]) },
  });
  const s = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-10-31T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-027' }),
    warteAbstaende: [],
    pruefNaht: erzeugePruefNaht({
      regeln: [pruefregelnRegel, bearbeitbarRegel],
      tabellenSicht,
      fsp,
    }),
  });
  return { wurzel, pfad, s };
}

const anlegen = { tabelle: 'Lager.md', art: 'create', werte: { Menge: '4' } };
const aendern = {
  tabelle: 'Lager.md',
  art: 'update',
  id: 'r-00001',
  erwartet: { Menge: '3' },
  werte: { Menge: '4' },
};

describe('Formel-Bibliothek ausgeschaltet: Schreib-Schnittstelle der Datenbank (Option B)', () => {
  it('an: Anlegen und Ändern gehen durch, beide Regeln rechnen', async () => {
    registriere();
    const { wurzel, s } = datenbank();
    expect((await s.fuehreAuftragAus(wurzel, { anweisungen: [anlegen] })).ok).toBe(true);
    expect((await s.fuehreAuftragAus(wurzel, { anweisungen: [aendern] })).ok).toBe(true);
  });

  it('aus: die Prüfregel weist das Anlegen ab, der gesperrte Datensatz bleibt gesperrt; Datei unberührt', async () => {
    registriere();
    katalog.setDisabledFunctionExtensions([BIBLIOTHEK]);
    const { wurzel, pfad, s } = datenbank();
    const vorher = fs.readFileSync(pfad, 'utf8');

    const neu = await s.fuehreAuftragAus(wurzel, { anweisungen: [anlegen] });
    expect(neu.ok).toBe(false);
    expect(neu.lagen.map((lage) => lage.code)).toEqual([LAGEN.pruefBefund]);
    expect(neu.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.pruefregelVerletzt,
      feld: 'Menge',
      grund: 'nichtAuswertbar',
    });

    const geaendert = await s.fuehreAuftragAus(wurzel, { anweisungen: [aendern] });
    expect(geaendert.ok).toBe(false);
    // Die Sperre hält, und die Prüfregel am Feld meldet sich zusätzlich.
    const befunde = geaendert.lagen.map((lage) => lage.naht);
    expect(befunde).toContainEqual(
      expect.objectContaining({
        code: REGEL_LAGEN.nichtBearbeitbar,
        id: 'r-00001',
        grund: 'nichtAuswertbar',
      }),
    );
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });
});

// 4T-002451: Eine Regel, deren Formel eine Bereichs-Meldung liefert, ist nicht
// auswertbar, auch verneint und im Vergleich (Entscheidung der steuernden
// Sitzung vom 2026-10-31 nach Option B des Product Owners): Die Prüfregel weist
// ab, die Sperr-Bedingung hält den Datensatz gesperrt. Mit Menge 3 ist die
// relative Feuchte der Sperr-Bedingung 120 Prozent, also außerhalb des Bereichs.
const TABELLE_FEUCHTE = TABELLE.replace(
  "check: 'probe.doppelt(value) < 100'",
  "check: 'NOT humidity.dewpoint(20, value) = 1'",
).replace(
  "editable: 'probe.doppelt(Menge) < 10'",
  "editable: 'humidity.dewpoint(20, Menge * 40) > -40'",
);

describe('Bereichs-Meldung einer Formel in Regeln der Datenbank (4T-002451)', () => {
  it('Meldung: Anlegen abgewiesen, gesperrter Datensatz bleibt gesperrt; im Bereich geht es durch', async () => {
    expect(TABELLE_FEUCHTE).toContain('humidity.dewpoint(20, Menge * 40)');
    const { wurzel, pfad, s } = datenbank(TABELLE_FEUCHTE);
    const vorher = fs.readFileSync(pfad, 'utf8');
    const zuFeucht = { ...anlegen, werte: { Menge: '120' } };
    const neu = await s.fuehreAuftragAus(wurzel, { anweisungen: [zuFeucht] });
    expect(neu.ok).toBe(false);
    expect(neu.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.pruefregelVerletzt,
      feld: 'Menge',
      grund: 'nichtAuswertbar',
    });
    const geaendert = await s.fuehreAuftragAus(wurzel, { anweisungen: [aendern] });
    expect(geaendert.ok).toBe(false);
    expect(geaendert.lagen.map((lage) => lage.naht)).toContainEqual(
      expect.objectContaining({ code: REGEL_LAGEN.nichtBearbeitbar, grund: 'nichtAuswertbar' }),
    );
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
    // Eine Feuchte im Bereich: die Prüfregel rechnet und lässt durch.
    const imBereich = { ...anlegen, werte: { Menge: '2' } };
    expect((await s.fuehreAuftragAus(wurzel, { anweisungen: [imBereich] })).ok).toBe(true);
  });
});
