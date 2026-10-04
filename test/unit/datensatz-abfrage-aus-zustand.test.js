// 4T-002039 (Epic 3E-000258, Story AK9): Der Aus-Zustand der Datenbank auf der
// Datensatz-Ebene der Abfrage. Zusage E15.4 mit der Entscheidung F4 Option A:
// Bei ausgeschalteter Erweiterung «Datenbank» liefert `LIST RECORDS` die leere
// Menge mit dem Hinweis `databaseOff`, keinen Abfrage-Fehler, und liest keine
// Tabellen-Datei; nach dem Wiedereinschalten kommt das Ergebnis zurück.
//
// Ergänzt von 4T-002041 (Pfad), 4T-002042 (descendants) und 4T-001983, dem
// Abschluss des Epics: je eine Zusage des Epics ein eigener Fall, also auch
// ancestors und die Angabe `DISPLAY tree BY` (Auflage «der Aus-Zustand wächst
// mit» des Arbeitspakets 2A-000039). 4T-002076 (Epic 3E-000259) ergänzt die
// gruppierte Datensatz-Abfrage (Zusage Z1) und die Gegenprobe über Dateien (Z3);
// 4T-002078 und 4T-002079 die Aggregate und HAVING (Z1), 4T-002081 die
// Abfrage-Datei (Z2), 4T-001984 als Abschluss jenes Epics Z3 auf allen drei
// übrigen Ebenen und den Vorlagen-Ausschluss bei ausgeschalteter Datenbank.
//
// **Warum eine eigene Datei neben `perspective-query-records.test.js`.** Jeder
// Fall legt den Schalter um und baut die Indizes neu auf; in einer Datei mit
// den übrigen Fällen hieße ein vergessenes Zurückstellen, dass deren Fälle im
// Aus-Zustand liefen. Vorbild ist `datensatz-aus-zustand.test.js`, dessen
// Setup-Muster (eigener Besitzer-Schlüssel, Neuaufbau, Aufräumen) hier gilt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  alleIndizesNeuAufbauen,
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
import { recordsQueryFor, HINT_DATABASE_OFF } from '../../src/main/index/query-records.js';

const require_ = createRequire(import.meta.url);
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { clearCaches, readCount } = require_('../../src/main/index/record-table-read.js');

// --- Fixtures ---------------------------------------------------------------

const KUNDEN = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Name',
  '    - name: Umsatz',
  '      type: number',
  '  display: Name',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| 1200',
  '|- id="r-00002"',
  '| Bert',
  '| 300',
  '```',
  '',
].join('\n');

const ABFRAGE = 'TABLE RECORDS Name, Umsatz FROM "Kunden" WHERE Umsatz > 100';

// 4T-002041: Aufträge mit einem Verweis auf die Kunden, für den Pfad im Aus-Zustand.
const AUFTRAEGE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: kunde',
  '      type: record',
  '      options:',
  '        table: Kunden',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| r-00001',
  '|- id="r-00002"',
  '| r-00002',
  '```',
  '',
].join('\n');

// Eigener Besitzer-Schlüssel, damit der Neuaufbau die Wurzel wieder aufbaut
// (Muster `datensatz-aus-zustand.test.js`).
const BESITZER = 'test-abfrage-aus-zustand:0';

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
  expect(result.status).toBe('ready');
  return result;
}

// Den Schalter umlegen und die Indizes neu aufbauen, wie die Verteilung der
// Einstellungs-Änderung (settings-verteilung.js).
async function schalte(aktiv, activeFile) {
  setzeDatensatzErfassung(aktiv);
  alleIndizesNeuAufbauen();
  return warteAufIndex(activeFile);
}

async function bereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dsabfaus-'));
  tmpDirs.push(dir);
  const kunden = write(dir, 'Kunden.md', KUNDEN);
  const auftraege = write(dir, 'Auftraege.md', AUFTRAEGE);
  const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
  openRoots.add(rootForActiveFile(abfragen));
  await warteAufIndex(abfragen);
  return { abfragen, kunden, auftraege };
}

function menge(abfragen, abfrage = ABFRAGE) {
  const { resultSet } = frontmatterQueryFor(abfragen, abfrage, undefined, undefined, 'de-DE');
  expect(validateResultSet(resultSet)).toEqual([]);
  return resultSet;
}

afterEach(() => {
  // Der Schalter ist Modul-Zustand und überlebt den Fall.
  setzeDatensatzErfassung(true);
  vi.restoreAllMocks();
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
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

describe('Datensatz-Ebene im Aus-Zustand der Datenbank (4T-002039, Story AK9)', () => {
  it('leere Menge mit Hinweis, kein Abfrage-Fehler, kein Zugriff auf die Tabelle', async () => {
    const { abfragen, kunden } = await bereich();
    // Nicht-Vakuitäts-Probe: eingeschaltet liefert dieselbe Abfrage Zeilen.
    const an = menge(abfragen);
    expect(an.rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['statSync', 'readFileSync', 'readdirSync', 'openSync', 'existsSync'].map(
      (name) => vi.spyOn(fs, name),
    );
    const aus = menge(abfragen);
    expect(aus.state.status).toBe('ready');
    expect(aus.state.queryError).toBeNull();
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.scope).toBe('records');
    expect(aus.type).toBe('table');
    expect(aus.rows).toEqual([]);
    // Die Spalten der Abfrage stehen da, ohne Beschriftung aus der Tabelle,
    // weil keine Tabelle gelesen wurde.
    expect(aus.columns.map((c) => c.label)).toEqual(['Name', 'Umsatz']);
    // Kein Lese-Vorgang des Tabellen-Bestands und kein Datei-Zugriff auf die
    // Tabelle oder ihr Verzeichnis.
    expect(readCount()).toBe(gelesen);
    const tabelle = path.resolve(kunden).toLowerCase();
    const verzeichnis = path.dirname(tabelle);
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) => {
        const ziel = path.resolve(String(p)).toLowerCase();
        return ziel === tabelle || ziel === verzeichnis;
      });
      expect(betroffen, spy.getMockName()).toEqual([]);
    }
    vi.restoreAllMocks();

    await schalte(true, abfragen);
    expect(menge(abfragen).rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);
  });

  it('ein Pfad über ein Verweis-Feld liest im Aus-Zustand keine Ziel-Tabelle (4T-002041, Story AK8 von 4S-001031)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const abfrage = 'TABLE RECORDS kunde.Name FROM "Auftraege" WHERE kunde.Umsatz > 500';
    // Nicht-Vakuitäts-Probe: eingeschaltet folgt der Pfad dem Verweis.
    expect(menge(abfragen, abfrage).rows.map((r) => r.values)).toEqual([['Anna']]);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const lesen = vi.spyOn(fs, 'readFileSync');
    const aus = menge(abfragen, abfrage);
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.state.queryError).toBeNull();
    expect(aus.rows).toEqual([]);
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    const betroffen = lesen.mock.calls.filter(([p]) =>
      tabellen.includes(path.resolve(String(p)).toLowerCase()),
    );
    expect(betroffen).toEqual([]);
  });

  it('eine Hülle liest im Aus-Zustand keine Tabelle, auch nicht ihren Kopf (4T-002042, Story AK10 von 4S-001032)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const abfrage = 'LIST RECORDS FROM descendants([[Kunden#^r-00001]], kunde)';
    // Nicht-Vakuitäts-Probe: eingeschaltet findet die Hülle den Auftrag der Kundin.
    expect(menge(abfragen, abfrage).rows.map((r) => r.origin.id)).toEqual(['r-00001']);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
    const aus = menge(abfragen, abfrage);
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.state.queryError).toBeNull();
    expect(aus.rows).toEqual([]);
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) =>
        tabellen.includes(path.resolve(String(p)).toLowerCase()),
      );
      expect(betroffen).toEqual([]);
    }
  });

  it('ancestors liest im Aus-Zustand keine Tabelle (4T-001983, Einzel-Nachweis der Gegenrichtung der Hülle)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const abfrage = 'LIST RECORDS FROM ancestors([[Auftraege#^r-00002]], kunde)';
    // Nicht-Vakuitäts-Probe: eingeschaltet führt die Hülle vom Auftrag zur Kundin.
    const an = menge(abfragen, abfrage);
    expect(an.rows.map((r) => [r.origin.table, r.origin.id])).toEqual([['Kunden', 'r-00002']]);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
    const aus = menge(abfragen, abfrage);
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.state.queryError).toBeNull();
    expect(aus.rows).toEqual([]);
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) =>
        tabellen.includes(path.resolve(String(p)).toLowerCase()),
      );
      expect(betroffen).toEqual([]);
    }
  });

  it('DISPLAY tree BY: im Aus-Zustand leere Menge mit Hinweis, der Wunsch reist mit, kein Eltern-Verweis (4T-001983)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const abfrage = 'LIST RECORDS FROM "Auftraege" DISPLAY tree BY kunde';
    // Nicht-Vakuitäts-Probe: eingeschaltet trägt jede Zeile den Eltern-Verweis
    // des Feldes nach BY, den der Baum braucht.
    const an = menge(abfragen, abfrage);
    expect(an.rows.map((r) => r.parent && r.parent.id)).toEqual(['r-00001', 'r-00002']);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const lesen = vi.spyOn(fs, 'readFileSync');
    const aus = menge(abfragen, abfrage);
    // Genau die Form, aus der `renderer/display-tree.test.js` (Fall «im
    // Aus-Zustand der Datenbank die leere Liste mit dem Hinweis der Ebene, kein
    // Baum») die Anzeige prüft: keine Zeile, Hinweis `databaseOff`, Wunsch da.
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.state.queryError).toBeNull();
    expect(aus.rows).toEqual([]);
    expect(aus.wishes.display).toEqual({ form: 'tree', by: 'kunde' });
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    const betroffen = lesen.mock.calls.filter(([p]) =>
      tabellen.includes(path.resolve(String(p)).toLowerCase()),
    );
    expect(betroffen).toEqual([]);
  });

  // 4T-002076 (Epic 3E-000259, Zusage Z1): Eine gruppierte Datensatz-Abfrage
  // liefert im Aus-Zustand die leere Menge mit Hinweis, ohne Fehler und ohne
  // eine Tabellen-Datei zu lesen, in Liste und Tabelle.
  it('GROUP BY: im Aus-Zustand leere Menge mit Hinweis, keine Tabelle gelesen (4T-002076, Z1)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const faelle = [
      'LIST RECORDS FROM "Kunden" GROUP BY Name',
      // 4T-002078: Seit der gruppierten Tabelle steht dort nur Gruppiertes oder
      // Aggregiertes; die Abfrage ist entsprechend umgestellt.
      'TABLE RECORDS kunde, count() FROM "Auftraege" GROUP BY kunde',
    ];
    // Nicht-Vakuitäts-Probe: eingeschaltet bilden beide Abfragen Gruppen.
    for (const abfrage of faelle) {
      expect(menge(abfragen, abfrage).groups, abfrage).toHaveLength(2);
    }

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
    for (const abfrage of faelle) {
      const aus = menge(abfragen, abfrage);
      expect(aus.state.hint, abfrage).toBe(HINT_DATABASE_OFF);
      expect(aus.state.queryError, abfrage).toBeNull();
      expect(aus.rows, abfrage).toEqual([]);
      expect(aus.groups, abfrage).toEqual([]);
    }
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) =>
        tabellen.includes(path.resolve(String(p)).toLowerCase()),
      );
      expect(betroffen).toEqual([]);
    }
  });

  // 4T-002078 (Epic 3E-000259, Zusage Z1): Eine gruppierte Tabelle mit
  // Aggregaten, auch über einen Pfad in die Ziel-Tabelle, liefert im Aus-Zustand
  // die leere Menge mit Hinweis und liest keine Tabelle; eine Spalte ohne
  // Gruppen-Bezug bleibt dort ein Abfrage-Fehler.
  it('gruppierte Tabelle mit Aggregaten: im Aus-Zustand leere Menge mit Hinweis (4T-002078, Z1)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const faelle = [
      'TABLE RECORDS count() AS "Anzahl", sum(Umsatz) FROM "Kunden" GROUP BY Name SORT count() DESC LIMIT 1',
      'TABLE RECORDS kunde, count(), sum(kunde.Umsatz) FROM "Auftraege" GROUP BY kunde',
    ];
    // Nicht-Vakuitäts-Probe: eingeschaltet trägt jede Gruppe ihre Werte.
    expect(menge(abfragen, faelle[0]).groups.map((g) => g.values)).toEqual([[1, 1200]]);
    const pfad = menge(abfragen, faelle[1]).groups.map((g) => g.values.slice(1));
    expect(pfad).toEqual([
      [1, 1200],
      [1, 300],
    ]);

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
    for (const abfrage of faelle) {
      const aus = menge(abfragen, abfrage);
      expect(aus.state.hint, abfrage).toBe(HINT_DATABASE_OFF);
      expect(aus.state.queryError, abfrage).toBeNull();
      expect([aus.rows, aus.groups], abfrage).toEqual([[], []]);
    }
    const falsch = 'TABLE RECORDS Umsatz, count() FROM "Kunden" GROUP BY Name';
    expect(menge(abfragen, falsch).state.queryError.code).toBe('groupedColumn');
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) =>
        tabellen.includes(path.resolve(String(p)).toLowerCase()),
      );
      expect(betroffen).toEqual([]);
    }
  });

  // 4T-002079 (Epic 3E-000259, Zusage Z1): Eine gruppierte Datensatz-Abfrage mit
  // HAVING, in Tabelle und Liste und über einen Pfad in die Ziel-Tabelle, liefert
  // im Aus-Zustand die leere Menge mit Hinweis und liest keine Tabelle; HAVING
  // ohne GROUP BY bleibt dort ein Abfrage-Fehler.
  it('HAVING: im Aus-Zustand leere Menge mit Hinweis, keine Tabelle gelesen (4T-002079, Z1)', async () => {
    const { abfragen, kunden, auftraege } = await bereich();
    const faelle = [
      'TABLE RECORDS kunde, count() FROM "Auftraege" GROUP BY kunde HAVING sum(kunde.Umsatz) > 500',
      'LIST RECORDS FROM "Kunden" GROUP BY Name HAVING sum(Umsatz) < 500',
    ];
    // Nicht-Vakuitäts-Probe: eingeschaltet bleibt je Abfrage genau eine von zwei Gruppen.
    for (const abfrage of faelle) {
      expect(menge(abfragen, abfrage).groups, abfrage).toHaveLength(1);
    }

    await schalte(false, abfragen);
    const gelesen = readCount();
    const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
    for (const abfrage of faelle) {
      const aus = menge(abfragen, abfrage);
      expect(aus.state.hint, abfrage).toBe(HINT_DATABASE_OFF);
      expect(aus.state.queryError, abfrage).toBeNull();
      expect([aus.rows, aus.groups], abfrage).toEqual([[], []]);
    }
    const ohneGruppe = 'TABLE RECORDS Name FROM "Kunden" HAVING count() > 1';
    expect(menge(abfragen, ohneGruppe).state.queryError.code).toBe('havingWithoutGroupBy');
    expect(readCount()).toBe(gelesen);
    const tabellen = [kunden, auftraege].map((p) => path.resolve(p).toLowerCase());
    for (const spy of zugriffe) {
      const betroffen = spy.mock.calls.filter(([p]) =>
        tabellen.includes(path.resolve(String(p)).toLowerCase()),
      );
      expect(betroffen).toEqual([]);
    }
  });

  // 4T-002076 (Zusage Z3, Gegenprobe): Die Gruppierung über Dateien hängt nicht
  // an der Datenbank und liefert im Aus-Zustand dieselben Gruppen.
  it('GROUP BY über Dateien wirkt im Aus-Zustand unverändert (4T-002076, Z3)', async () => {
    const { abfragen } = await bereich();
    const abfrage = 'LIST GROUP BY file.name = "Kunden"';
    const an = menge(abfragen, abfrage);
    // Nicht-Vakuitäts-Probe: zwei Gruppen, die Tabellen-Datei in ihrer eigenen.
    expect(an.groups.map((g) => g.value)).toEqual([false, true]);
    await schalte(false, abfragen);
    const aus = menge(abfragen, abfrage);
    expect(aus.state.hint).toBeNull();
    expect(aus.rows).toEqual(an.rows);
    expect(aus.groups).toEqual(an.groups);
  });

  it('der Hinweis steht bei LIST und TABLE, auch für eine unbekannte Tabelle', async () => {
    const { abfragen } = await bereich();
    await schalte(false, abfragen);
    for (const abfrage of ['LIST RECORDS FROM "Kunden"', 'LIST RECORDS FROM "Gibtsnicht"']) {
      const rs = menge(abfragen, abfrage);
      expect(rs.state.hint, abfrage).toBe(HINT_DATABASE_OFF);
      expect(rs.rows, abfrage).toEqual([]);
    }
  });

  it('eine fehlerhafte Abfrage bleibt auch im Aus-Zustand ein Abfrage-Fehler', async () => {
    const { abfragen } = await bereich();
    await schalte(false, abfragen);
    expect(menge(abfragen, 'LIST RECORDS FROM #kunden').state.queryError.code).toBe(
      'recordsSourceInvalid',
    );
    expect(menge(abfragen, 'LIST RECORDS').state.queryError.code).toBe('recordsSourceMissing');
  });

  it('die drei bestehenden Ebenen tragen im Aus-Zustand keinen Hinweis', async () => {
    const { abfragen } = await bereich();
    await schalte(false, abfragen);
    const dateien = menge(abfragen, 'LIST');
    expect(dateien.state.hint).toBeNull();
    expect(dateien.rows.map((r) => r.origin.name).sort()).toEqual([
      'Abfragen',
      'Auftraege',
      'Kunden',
    ]);
  });

  it('der Einstieg der Ebene fragt den Schalter vor jedem Lesen', () => {
    // Ohne bereiten Index und ohne Datei: Der Aus-Zustand antwortet allein aus
    // dem Schalter und der Abfrage.
    setzeDatensatzErfassung(false);
    const antwort = recordsQueryFor({
      filePath: path.join(os.tmpdir(), 'gibt-es-nicht', 'Abfragen.md'),
      ast: {
        type: 'list',
        scope: 'records',
        fields: [],
        withoutId: false,
        source: { type: 'srcFolder', value: 'Kunden' },
        where: null,
        sort: [],
        limit: null,
        layoutColumns: null,
        groupBy: [],
        hide: [],
        show: [],
        short: false,
      },
      root: path.join(os.tmpdir(), 'gibt-es-nicht'),
      entry: { fileCount: 0 },
      locale: 'de-DE',
    });
    expect(antwort.resultSet.state.hint).toBe(HINT_DATABASE_OFF);
    expect(validateResultSet(antwort.resultSet)).toEqual([]);
  });
});

// 4T-002081 (Epic 3E-000259, Zusage Z2; Story 4S-001040 AK6): Eine Abfrage-Datei
// bleibt im Aus-Zustand ein gewöhnliches Dokument. Ihr Block wird weiter
// ausgewertet, über Datensätze als leere Menge mit Hinweis und über Dateien wie
// bisher; die Datei bleibt byte-gleich. Die Marke erfasst der Index weiter wie
// die übrigen Marken der Datenbank, und der Katalog kennt die Datei; was im
// Aus-Zustand entfällt, ist die Übersicht und mit ihr der Abschnitt «Abfragen»
// (Wurzel-Tor der Seite, geprüft in `renderer/datenbank-uebersicht-seite.test.js`).
// Gegenprobe nach dem Wiedereinschalten.
describe('Abfrage-Datei im Aus-Zustand der Datenbank (4T-002081, Z2)', () => {
  const ABFRAGE_DATEI = [
    '---',
    'db-query:',
    '---',
    '',
    '# Umsatz über 100',
    '',
    'Kunden mit nennenswertem Umsatz.',
    '',
    '```perspective-query',
    ABFRAGE,
    '```',
    '',
  ].join('\n');

  async function bereichMitAbfrageDatei() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-abfdatei-aus-'));
    tmpDirs.push(dir);
    write(dir, 'Kunden.md', KUNDEN);
    const datei = write(dir, 'Umsatz.md', ABFRAGE_DATEI);
    openRoots.add(rootForActiveFile(datei));
    await warteAufIndex(datei);
    return datei;
  }

  async function katalog(datei) {
    const backlinks = await import('../../src/main/backlinks.js');
    const { katalogUeberblick, createDatabaseCatalogCache } = require_(
      '../../src/main/database/table-catalog.js',
    );
    const { status, sicht } = backlinks.datenbankSicht(datei, null);
    expect(status).toBe('ready');
    const marken = sicht.dbKindsPerFile.get(datei) || [];
    const u = await katalogUeberblick({
      sicht,
      status,
      fsp: fs.promises,
      cache: createDatabaseCatalogCache(),
    });
    return { marken, abfragen: u.abfragen.map((a) => [a.name, a.hints.length]) };
  }

  it('bleibt ein gewöhnliches Dokument mit ausgewertetem Block, unverändert; Gegenprobe', async () => {
    const datei = await bereichMitAbfrageDatei();
    // Nicht-Vakuitäts-Probe: eingeschaltet liefert der Block der Abfrage-Datei,
    // mit ihr als Bezug ausgewertet, die Datensätze, und der Katalog führt sie.
    expect(menge(datei).rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);
    expect(await katalog(datei)).toEqual({ marken: ['query'], abfragen: [['Umsatz', 0]] });

    await schalte(false, datei);
    const aus = menge(datei);
    expect(aus.state.hint).toBe(HINT_DATABASE_OFF);
    expect(aus.state.queryError).toBeNull();
    expect(aus.rows).toEqual([]);
    // Über Dateien wertet derselbe Ort unverändert aus.
    const dateien = menge(datei, 'LIST');
    expect(dateien.state.hint).toBeNull();
    expect(dateien.rows.map((r) => r.origin.name).sort()).toEqual(['Kunden', 'Umsatz']);
    // Die Marke bleibt erfasst, die Datei unangetastet.
    expect((await katalog(datei)).marken).toEqual(['query']);
    expect(fs.readFileSync(datei, 'utf8')).toBe(ABFRAGE_DATEI);

    await schalte(true, datei);
    expect(menge(datei).rows.map((r) => r.origin.id)).toEqual(['r-00001', 'r-00002']);
    expect(await katalog(datei)).toEqual({ marken: ['query'], abfragen: [['Umsatz', 0]] });
    expect(fs.readFileSync(datei, 'utf8')).toBe(ABFRAGE_DATEI);
  });
});

// 4T-001984 (Abschluss des Epics 3E-000259): Einzel-Nachweis der übrigen
// Zusagen. Z3 verlangt Gruppierung, Aggregate und HAVING auf Datei-, Block- und
// Aufgaben-Ebene unverändert im Aus-Zustand; der Fall oben (4T-002076) prüft
// allein die gruppierte Liste über Dateien. Dazu der Vorlagen-Ausschluss, der an
// der Erweiterung «Vorlagen» hängt und nicht an der Datenbank: Er wirkt bei
// ausgeschalteter Datenbank genauso, samt Ausnahme über `FROM`.
describe('Übrige Ebenen und Vorlagen-Ausschluss im Aus-Zustand der Datenbank (4T-001984, Z3)', () => {
  const TASK_ENV = { enabled: true, globalFilter: '', globalQuery: '', statusTypeOf: () => 'TODO' };
  const mdd = (blockData) =>
    JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
  const block = (status) => ({ values: { status }, updated: '2026-10-03T10:00:00Z' });
  const notiz = (art, punkte, aufgaben, anker) =>
    [
      '---',
      `art: ${art}`,
      `punkte: ${punkte}`,
      '---',
      '# Notiz',
      '',
      ...aufgaben.map((a) => `- [ ] ${a}`),
      '',
      ...anker.flatMap((a) => [`Absatz. ^${a}`, '']),
    ].join('\n');

  // Drei Notizen im Ordner «Projekte», eine Vorlage im Ordner «Vorlagen».
  async function bereichMitEbenen() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ebenen-aus-'));
    tmpDirs.push(dir);
    write(dir, 'Kunden.md', KUNDEN);
    write(dir, 'Projekte/A.md', notiz('notiz', 3, ['A-eins', 'A-zwei'], ['a1']));
    write(dir, 'Projekte/A.mdd', mdd({ a1: block('offen') }));
    write(dir, 'Projekte/B.md', notiz('notiz', 4, ['B-eins'], ['b1', 'b2']));
    write(dir, 'Projekte/B.mdd', mdd({ b1: block('offen'), b2: block('zu') }));
    write(dir, 'Projekte/C.md', notiz('bericht', 5, ['C-eins'], []));
    write(dir, 'Vorlagen/V.md', notiz('notiz', 9, ['V-eins'], ['v1']));
    write(dir, 'Vorlagen/V.mdd', mdd({ v1: block('offen') }));
    const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
    const wurzel = rootForActiveFile(abfragen);
    openRoots.add(wurzel);
    await warteAufIndex(abfragen);
    return { abfragen, vorlagen: path.join(wurzel, 'Vorlagen') };
  }

  function lauf(abfragen, abfrage, templatesFolder = null) {
    const { resultSet } = frontmatterQueryFor(
      abfragen,
      abfrage,
      undefined,
      TASK_ENV,
      'de-DE',
      templatesFolder,
    );
    expect(validateResultSet(resultSet), abfrage).toEqual([]);
    expect(resultSet.state.queryError, abfrage).toBeNull();
    return resultSet;
  }
  const namen = (rs) => [...new Set(rs.rows.map((r) => r.origin.name))].sort();

  it('Gruppierung, Aggregate und HAVING auf Datei-, Block- und Aufgaben-Ebene liefern unverändert', async () => {
    const { abfragen } = await bereichMitEbenen();
    // Je Abfrage die erwarteten Gruppen-Werte im eingeschalteten Zustand; HAVING
    // verwirft in jeder genau eine Gruppe, wirkt also.
    const faelle = [
      [
        'TABLE count() AS "Anzahl", sum(punkte) FROM "Projekte" GROUP BY art HAVING count() > 1',
        ['notiz'],
      ],
      ['LIST FROM "Projekte" GROUP BY art HAVING count() > 1', ['notiz']],
      ['TABLE BLOCKS count() FROM "Projekte" GROUP BY status HAVING count() > 1', ['offen']],
      ['TABLE TASKS count() FROM "Projekte" GROUP BY file.name HAVING count() > 1', ['A']],
      ['LIST TASKS FROM "Projekte" GROUP BY file.name HAVING count() > 1', ['A']],
    ];
    const an = new Map();
    for (const [abfrage, gruppen] of faelle) {
      const rs = lauf(abfragen, abfrage);
      expect(
        rs.groups.map((g) => g.value),
        abfrage,
      ).toEqual(gruppen);
      an.set(abfrage, rs);
    }
    // Nicht-Vakuitäts-Probe der Werte über der Gruppe: zwei Notizen, 3 + 4 Punkte.
    expect(an.get(faelle[0][0]).groups[0].values).toEqual([2, 7]);
    expect(an.get(faelle[2][0]).groups[0].values).toEqual([2]);

    await schalte(false, abfragen);
    for (const [abfrage] of faelle) {
      const aus = lauf(abfragen, abfrage);
      const vorher = an.get(abfrage);
      expect(aus.state.hint, abfrage).toBeNull();
      expect(aus.rows, abfrage).toEqual(vorher.rows);
      expect(aus.groups, abfrage).toEqual(vorher.groups);
      expect(aus.groupColumns, abfrage).toEqual(vorher.groupColumns);
    }
  });

  it('der Vorlagen-Ausschluss wirkt bei ausgeschalteter Datenbank wie eingeschaltet, samt Ausnahme über FROM', async () => {
    const { abfragen, vorlagen } = await bereichMitEbenen();
    const faelle = ['LIST WHERE art = "notiz"', 'LIST BLOCKS', 'LIST TASKS'];
    // Nicht-Vakuitäts-Probe: ohne Vorlagen-Ordner (Erweiterung «Vorlagen» aus)
    // liefert jede Abfrage auch die Vorlage.
    for (const abfrage of faelle) {
      expect(namen(lauf(abfragen, abfrage, null)), abfrage).toContain('V');
    }
    const bild = () =>
      faelle
        .map((abfrage) => namen(lauf(abfragen, abfrage, vorlagen)))
        .concat([namen(lauf(abfragen, 'LIST TASKS FROM "Vorlagen"', vorlagen))]);
    const an = bild();
    expect(an).toEqual([['A', 'B'], ['A', 'B'], ['A', 'B', 'C'], ['V']]);

    await schalte(false, abfragen);
    expect(bild()).toEqual(an);
    // Die Datensatz-Ebene bleibt daneben leer mit Hinweis.
    expect(lauf(abfragen, 'LIST RECORDS FROM "Kunden"', vorlagen).state.hint).toBe(
      HINT_DATABASE_OFF,
    );
  });
});
