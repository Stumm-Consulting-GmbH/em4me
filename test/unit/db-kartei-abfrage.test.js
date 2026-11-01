// 4T-002388 (Epic 3E-000265; AK1 bis AK5): Abfrage und Verweis über
// Karteikarten.
//
// **Gegen echte Temp-Verzeichnisse und den echten Index**, wie
// `db-kartei-index.test.js`: Welche Dateien Karteikarten sind, sagt erst der
// Nachlauf des Index-Aufbaus, und den gibt es nur im echten Index. Geprüft wird
// über den Erzeuger aller Ebenen (`frontmatterQueryFor`), damit Quelle,
// Tabellen-Leser, Weiche, Feld-Auflösung, Ordnung und Zeilen-Bau zusammen
// stehen; jede Ergebnismenge läuft durch den Prüfer des Format-Vertrags.
//
// **Die tragende Zusage:** Eine Kartei-Tabelle liefert über denselben Weg
// dieselbe Gestalt wie eine Tabelle der Tabellen-Form. Darum prüft die Datei
// die Kartei-Form an denselben Merkmalen (Typen, Bedingung, Sortierung,
// Gruppierung, Verweis-Auflösung, Zwischenspeicher) und hält die Datei-Ebene
// als unverändert fest (F5 A).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// Statisch importiert, damit die Module in der Import-Kette dieser Prüfdatei
// stehen (Auswahl des Prüf-Ausschnitts).
import { recordsQueryFor } from '../../src/main/index/query-records.js';
import { datensatzTreffer } from '../../src/main/area/area-search-records.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { vergissAlleKarteiTabellen } = require_('../../src/main/index/karteikarten-erfassung.js');
const { readRecordTable, clearCaches, readCount } = require_(
  '../../src/main/index/record-table-read.js',
);
const { loeseDatensatzVerweis, verweisZiel } = require_(
  '../../src/main/index/datensatz-verweis-aufloesung.js',
);
const { datensatzNachSchluessel, kennungInTabelle } = require_(
  '../../src/main/index/datensatz-zugriff.js',
);

// --- Fixtures ---------------------------------------------------------------

// Die Kartei-Tabelle «Autoren»: Text, Datum, Zahl, Wahrheitswert, ein
// Datei-Verweis und ein Datensatz-Verweis auf die eigene Tabelle.
function autorenTabelle({ key = 'Kürzel' } = {}) {
  return [
    '---',
    'db-table:',
    '  storage: cards',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Name',
    '    - name: Geboren',
    '      type: date',
    '    - name: Werke',
    '      type: number',
    '    - name: Aktiv',
    '      type: boolean',
    '    - name: Mentor',
    '      type: link',
    '    - name: Vorbild',
    '      type: record',
    '      options:',
    '        table: Autoren',
    `  key: ${key}`,
    '  display: Name',
    '---',
    '',
    'Je Autor eine Karteikarte in diesem Ordner.',
    '',
  ].join('\n');
}

function karte(angaben) {
  const zeilen = Object.entries(angaben).map(([k, v]) => `${k}: ${v}`);
  return ['---', ...zeilen, '---', '', `# ${angaben.Name || 'Karte'}`, ''].join('\n');
}

const ADA = {
  'db-record': 'r-00001',
  Kürzel: 'ADA',
  Name: 'Ada Lovelace',
  Geboren: '1815-12-10',
  Werke: 3,
  Aktiv: false,
  Mentor: '"[[Mary Somerville]]"',
  Vorbild: 'r-00003',
};
const ALAN = {
  'db-record': 'r-2',
  Kürzel: 'ALT',
  Name: 'Alan Turing',
  Geboren: '1912-06-23',
  Werke: 12,
  Aktiv: true,
  Vorbild: 'ADA',
};
const GRACE = {
  'db-record': 'r-00003',
  Kürzel: 'GH',
  Name: 'Grace Hopper',
  Geboren: '1906-12-09',
  Werke: 'viele',
  Aktiv: true,
};

// Eine Tabelle der Tabellen-Form mit einer Verweis-Spalte auf «Autoren».
const AUSLEIHE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Leser',
  '    - name: Autor',
  '      type: record',
  '      options:',
  '        table: Autoren',
  '  display: Leser',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Eva',
  '| r-00001',
  '|- id="r-00002"',
  '| Max',
  '| ALT',
  '|- id="r-00003"',
  '| Zoe',
  '| r-00099',
  '```',
  '',
].join('\n');

// --- Setup/Teardown (Muster aus db-kartei-index.test.js) --------------------

const openRoots = new Set();
let tmpDirs = [];

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, undefined, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, undefined, areaRoot);
  }
  expect(result.status).toBe('ready');
}

// Ein Bereich mit der Kartei-Tabelle «Autoren», drei Karteikarten, einer
// Tabelle der Tabellen-Form mit Verweis-Spalte und einer Abfrage-Datei.
async function bereich({ tabelle = autorenTabelle(), mitKarten = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-karteiabfr-'));
  tmpDirs.push(root);
  const b = { root };
  b.tabelle = write(root, 'Autoren/Autoren.md', tabelle);
  if (mitKarten) {
    b.ada = write(root, 'Autoren/Ada Lovelace.md', karte(ADA));
    b.alan = write(root, 'Autoren/Alan Turing.md', karte(ALAN));
    b.grace = write(root, 'Autoren/Grace Hopper.md', karte(GRACE));
  }
  b.mary = write(root, 'Mary Somerville.md', '# Mary Somerville\n');
  b.ausleihe = write(root, 'Ausleihe/Ausleihe.md', AUSLEIHE);
  b.abfragen = write(root, 'Abfragen.md', '# Abfragen\n');
  await indexFor(b.abfragen, root);
  return b;
}

afterEach(() => {
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  vergissAlleKarteiTabellen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
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

// Die Ergebnismenge des Erzeugers, ohne Befund des Prüfers.
function menge(b, abfrage, templatesFolder = null) {
  const payload = frontmatterQueryFor(
    b.abfragen,
    abfrage,
    b.root,
    undefined,
    'de-DE',
    templatesFolder,
  );
  expect(Object.keys(payload)).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  return payload.resultSet;
}

const ids = (rs) => rs.rows.map((r) => r.origin.id);
const fehler = (rs) => rs.state.queryError && rs.state.queryError.code;
const ms = (iso) => {
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(j, m - 1, t).getTime();
};

// --- AK1: Kartei-Tabelle als Quelle -----------------------------------------

describe('Kartei-Tabelle als Quelle der Datensatz-Ebene (AK1)', () => {
  it('liefert je Karteikarte eine Zeile mit Werten nach dem Typ der Spalte', async () => {
    const b = await bereich();
    expect(typeof recordsQueryFor).toBe('function');
    const rs = menge(b, 'TABLE RECORDS Kürzel, Geboren, Werke, Aktiv FROM "Autoren"');
    expect(rs.scope).toBe('records');
    expect(fehler(rs)).toBeNull();
    // Ohne SORT nach Anzeige-Form; die Kurzform r-2 steht aufgefüllt da.
    expect(rs.rows.map((r) => [r.origin.table, r.origin.id, r.origin.display])).toEqual([
      ['Autoren', 'r-00001', 'Ada Lovelace'],
      ['Autoren', 'r-00002', 'Alan Turing'],
      ['Autoren', 'r-00003', 'Grace Hopper'],
    ]);
    expect(rs.rows.every((r) => r.origin.path === b.tabelle)).toBe(true);
    expect(rs.rows.map((r) => r.values)).toEqual([
      ['ADA', { kind: 'date', ms: ms('1815-12-10') }, 3, false],
      ['ALT', { kind: 'date', ms: ms('1912-06-23') }, 12, true],
      // Ein Wert, der nicht zu seinem Typ passt, ist «fehlend» wie eine Zelle.
      ['GH', { kind: 'date', ms: ms('1906-12-09') }, null, true],
    ]);
  });

  it('Bedingung und Sortierung wirken wie in der Tabellen-Form', async () => {
    const b = await bereich();
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren" WHERE Aktiv = "true"'))).toEqual([
      'r-00002',
      'r-00003',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren" WHERE Werke > 5'))).toEqual(['r-00002']);
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren" SORT Geboren DESC'))).toEqual([
      'r-00002',
      'r-00003',
      'r-00001',
    ]);
    // Beim Pfad genannt wie beim Namen.
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren/Autoren.md" SORT Name DESC'))).toEqual([
      'r-00003',
      'r-00002',
      'r-00001',
    ]);
  });

  it('Gruppierung mit Aggregation', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS count() FROM "Autoren" GROUP BY Aktiv');
    expect(fehler(rs)).toBeNull();
    expect(rs.groups.map((g) => [g.value, g.rows.length])).toEqual([
      [false, 1],
      [true, 2],
    ]);
  });

  it('Verweis-Felder einer Karteikarte lösen auf, auch auf eine Karteikarte', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS Mentor, Vorbild, Vorbild.Name FROM "Autoren"');
    const [ada, alan, grace] = rs.rows.map((r) => r.values);
    expect(ada[0]).toMatchObject({ kind: 'link', path: b.mary });
    // Kennung und einteiliger Schlüssel treffen die Karteikarte.
    expect(ada[1]).toEqual({
      kind: 'record',
      table: 'Autoren',
      id: 'r-00003',
      display: 'Grace Hopper',
      path: b.tabelle,
    });
    expect(ada[2]).toBe('Grace Hopper');
    expect(alan[1]).toMatchObject({ kind: 'record', id: 'r-00001', display: 'Ada Lovelace' });
    expect(grace).toEqual([null, null, null]);
  });
});

// --- AK3, AK4: Vorlage und leere Kartei-Tabelle -----------------------------

describe('Vorlagen und leere Kartei-Tabelle (AK3, AK4)', () => {
  it('eine Karteikarte im Vorlagen-Ordner ist nie eine Zeile', async () => {
    const b = await bereich();
    const vorlagen = path.join(b.root, 'Autoren');
    // Die Tabelle ausdrücklich beim Pfad genannt: Sie ist frei, ihre
    // Karteikarten im Vorlagen-Ordner bleiben es nicht.
    const rs = menge(b, 'LIST RECORDS FROM "Autoren/Autoren.md"', vorlagen);
    expect(fehler(rs)).toBeNull();
    expect(rs.rows).toEqual([]);
    // Beim Namen genannt ist der Ordner selbst genannt und gibt alles in ihm
    // frei, wie auf allen Ebenen (`createTemplateExclusion`).
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren"', vorlagen))).toHaveLength(3);
    // Ein anderer Vorlagen-Ordner berührt die Karteikarten nicht.
    const anderer = path.join(b.root, 'Vorlagen');
    expect(ids(menge(b, 'LIST RECORDS FROM "Autoren/Autoren.md"', anderer))).toHaveLength(3);
  });

  it('eine Kartei-Tabelle ohne Karteikarte liefert die leere Menge ohne Fehler', async () => {
    const b = await bereich({ mitKarten: false });
    const rs = menge(b, 'TABLE RECORDS Name FROM "Autoren"');
    expect(fehler(rs)).toBeNull();
    expect(rs.rows).toEqual([]);
    expect(readRecordTable(b.root, 'Autoren').records).toEqual([]);
  });
});

// --- AK2, AK3: Verweis auf eine Karteikarte ---------------------------------

describe('Verweis auf eine Karteikarte (AK2, AK3)', () => {
  it('eine Verweis-Spalte der Tabellen-Form löst auf; ein fehlendes Ziel wird gemeldet', async () => {
    const b = await bereich();
    const tabelle = readRecordTable(b.root, 'Ausleihe');
    const [eva, max, zoe] = tabelle.records;
    expect(eva.values.get('autor')).toEqual({
      kind: 'record',
      table: 'Autoren',
      id: 'r-00001',
      display: 'Ada Lovelace',
      path: b.tabelle,
    });
    expect(eva.refs.get('autor').status).toBe('ok');
    // Der einteilige Schlüssel trifft wie in der Tabellen-Form.
    expect(max.values.get('autor')).toMatchObject({ id: 'r-00002', display: 'Alan Turing' });
    expect(zoe.values.get('autor')).toBeNull();
    expect(zoe.refs.get('autor')).toMatchObject({ status: 'notFound', table: 'Autoren' });
    // In der Abfrage dieselbe Auflösung samt Pfad über den Verweis.
    const rs = menge(b, 'TABLE RECORDS Autor.Name FROM "Ausleihe"');
    expect(rs.rows.map((r) => r.values[0])).toEqual(['Ada Lovelace', 'Alan Turing', null]);
  });

  it('Kennung, Kurzform und Anzeige-Form treffen die Karteikarte im Index', async () => {
    const b = await bereich();
    const entry = indexes.get(b.root);
    expect(loeseDatensatzVerweis(entry, b.tabelle, 'r-00001')).toEqual({
      status: 'kennung',
      kennung: 'r-00001',
      treffers: ['r-00001'],
    });
    expect(loeseDatensatzVerweis(entry, b.tabelle, 'r-2')).toMatchObject({ kennung: 'r-00002' });
    expect(loeseDatensatzVerweis(entry, b.tabelle, 'Grace Hopper')).toMatchObject({
      status: 'anzeige',
      kennung: 'r-00003',
    });
    expect(loeseDatensatzVerweis(entry, b.tabelle, 'r-00099').status).toBe('keiner');
    expect(kennungInTabelle(entry, b.tabelle, 'r-3')).toBe(true);
    expect(kennungInTabelle(entry, b.tabelle, 'r-00099')).toBe(false);
    // Das Klick-Ziel eines Verweises auf die Tabellen-Datei mit Anker nennt
    // Tabelle und Kennung; wohin der Klick führt, bleibt Mitglied 2.
    expect(verweisZiel(entry, b.tabelle, 'Ada Lovelace')).toEqual({
      tabelle: b.tabelle,
      kennung: 'r-00001',
    });
    // Eine Karteikarte ist keine Tabellen-Datei.
    expect(verweisZiel(entry, b.ada, 'r-00001')).toBeNull();
  });

  it('der Schlüssel im Index steht in der Schreibweise der Zelle, auch beim Wahrheitswert', async () => {
    const b = await bereich({ tabelle: autorenTabelle({ key: 'Aktiv' }) });
    const entry = indexes.get(b.root);
    expect(entry.recordsPerFile.get(b.ada)[0].key).toEqual(['']);
    expect(entry.recordsPerFile.get(b.alan)[0].key).toEqual(['x']);
    // Derselbe Text wie im Lese-Weg der Abfrage aus dem Dateikopf.
    const gelesen = readRecordTable(b.root, 'Autoren');
    expect(gelesen.byId.get('r-00002').key).toEqual(['x']);
    const treffer = datensatzNachSchluessel(b.ada, b.root, 'Autoren', 'x');
    expect(treffer.uneindeutig).toBe(true);
    expect(treffer.treffers.map((t) => t.id).sort()).toEqual(['r-00002', 'r-00003']);
  });
});

// --- Zwischenspeicher -------------------------------------------------------

describe('Zwischenspeicher der Kartei-Form', () => {
  it('bleibt ohne Änderung und verfällt nach Änderung einer Karteikarte', async () => {
    const b = await bereich();
    const erst = readRecordTable(b.root, 'Autoren');
    const lesungen = readCount();
    expect(readRecordTable(b.root, 'Autoren')).toBe(erst);
    expect(readCount()).toBe(lesungen);

    // Ungespeichert: der Puffer der Karteikarte vor der Platte.
    setBufferOverlay(b.ada, karte({ ...ADA, Werke: 30 }));
    expect(readRecordTable(b.root, 'Autoren').byId.get('r-00001').values.get('werke')).toBe(30);
    clearAllBufferOverlays();
    expect(readRecordTable(b.root, 'Autoren').byId.get('r-00001').values.get('werke')).toBe(3);

    // Auf der Platte, bevor der Beobachter nachzieht: Größe und Zeit ändern sich.
    fs.writeFileSync(b.ada, karte({ ...ADA, Werke: 300, Name: 'Ada King' }), 'utf8');
    const neu = readRecordTable(b.root, 'Autoren');
    expect(neu).not.toBe(erst);
    expect(neu.byId.get('r-00001').values.get('werke')).toBe(300);
    expect(neu.byId.get('r-00001').display).toBe('Ada King');
  });

  it('ein Verweis aus der Tabellen-Form sieht die geänderte Karteikarte', async () => {
    const b = await bereich();
    expect(readRecordTable(b.root, 'Ausleihe').records[0].values.get('autor').display).toBe(
      'Ada Lovelace',
    );
    setBufferOverlay(b.ada, karte({ ...ADA, Name: 'Augusta Ada King' }));
    expect(readRecordTable(b.root, 'Ausleihe').records[0].values.get('autor').display).toBe(
      'Augusta Ada King',
    );
  });
});

// --- AK4: Datei-Ebene unverändert (F5 A) ------------------------------------

describe('Datei-Ebene unverändert (AK4, F5 A)', () => {
  it('eine Karteikarte erscheint als Dokument und liest ihren Dateikopf roh', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE Werke, Aktiv, db-record FROM "Autoren" SORT file.name');
    expect(rs.scope).not.toBe('records');
    const zeilen = rs.rows.map((r) => [path.basename(r.origin.path), ...r.values]);
    // Die Tabellen-Datei selbst ist ebenso ein Dokument; die Werte stehen,
    // wie der Dateikopf sie führt, nicht nach dem Typ der Spalte.
    expect(zeilen.map((z) => z[0])).toEqual([
      'Ada Lovelace.md',
      'Alan Turing.md',
      'Autoren.md',
      'Grace Hopper.md',
    ]);
    const grace = zeilen.find((z) => z[0] === 'Grace Hopper.md');
    expect(grace[1]).toBe('viele');
    expect(grace[3]).toBe('r-00003');
    const alan = zeilen.find((z) => z[0] === 'Alan Turing.md');
    expect(alan[3]).toBe('r-2');
  });
});

// --- AK5: Datensatz-Suche ---------------------------------------------------

describe('Datensatz-Suche erreicht Karteikarten (AK5)', () => {
  it('findet einen Feld-Wert einer Karteikarte als Datensatz-Treffer', async () => {
    const b = await bereich();
    const ergebnis = datensatzTreffer(b.root, 'Lovelace', 'gm');
    const eigene = ergebnis.treffer.filter((t) => t.sprung.tabelle === b.tabelle);
    expect(eigene).toHaveLength(1);
    expect(eigene[0]).toMatchObject({ anzeige: 'Ada Lovelace', feld: 'Name' });
    expect(eigene[0].sprung.kennung).toBe('r-00001');
  });
});
