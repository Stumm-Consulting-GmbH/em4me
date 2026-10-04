// 4T-002038 (Epic 3E-000258): Der Tabellen-Bestand für die Abfrage — eine
// Tabelle mit allen Datensätzen und ihren typisierten Feld-Werten, frisch aus
// dem Dokument, der ungespeicherte Stand vor der Platte.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `datensatz-zugriff.test.js`. Geteilte Tabellen entstehen über denselben Teiler,
// über den das Speichern sie anlegt (`planeZerlegung`), mit kleiner Schwelle;
// sie tragen damit die Gestalt einer ausgelieferten geteilten Tabelle. Die
// erwarteten Zeilen und Werte werden aus dem ungeteilten Ausgangstext abgeleitet
// und nicht über das Zusammensetzen, das das Modul selbst benutzt.
//
// Der Messlauf läuft nur auf Zuruf, nach dem Muster von
// `db-datensaetze-kanal.test.js`:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/record-table-read.test.js`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
// Statisch importiert: So steht das Modul samt seinen Importen in der
// Import-Kette, über die die Auswahl des Prüf-Ausschnitts diese Datei findet.
import { readRecordTable, readCount, clearCaches } from '../../src/main/index/record-table-read.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { indexStand } = require_('../../src/main/index/store.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { planeZerlegung } = require_('../../src/shared/document-split.js');
const { assembleParts } = require_('../../src/shared/document-assembly.js');

// --- Fixtures ---------------------------------------------------------------

function table(fieldLines, tableLines, records) {
  return [
    '---',
    'db-table:',
    '  fields:',
    ...fieldLines,
    ...tableLines,
    '---',
    '',
    '```perspective-records',
    ...records,
    '```',
    '',
  ].join('\n');
}

// Ziel der Datensatz-Verweise: einteiliger Schlüssel `code`, Anzeige-Form `name`,
// ein Schlüssel-Wert doppelt.
const CATEGORIES = table(
  ['    - name: code', '    - name: name'],
  ['  key: code', '  display: name'],
  [
    '|- id="r-00001"',
    '| KR',
    '| Krimi',
    '|- id="r-00002"',
    '| SF',
    '| Science-Fiction',
    '|- id="r-00003"',
    '| DUP',
    '| Doppel A',
    '|- id="r-00004"',
    '| DUP',
    '| Doppel B',
  ],
);

// Ein Verweis-Ziel ohne fachlichen Schlüssel und ohne Anzeige-Form.
const PLAIN = table(['    - name: label'], [], ['|- id="r-00001"', '| eins']);

// Alle acht Spalten-Typen, dazu Verweis-Spalten mit jeder Lage der Ziel-Tabelle.
const ITEM_FIELDS = [
  '    - name: title',
  '      label:',
  '        de: Titel',
  '        en: Title',
  '    - name: notes',
  '      type: multiline',
  '    - name: pages',
  '      type: number',
  '    - name: active',
  '      type: boolean',
  '    - name: since',
  '      type: date',
  '    - name: at',
  '      type: time',
  '    - name: source',
  '      type: link',
  '    - name: category',
  '      type: record',
  '      options:',
  '        table: Categories',
  '    - name: plain',
  '      type: record',
  '      options:',
  '        table: Plain',
  '    - name: ghost',
  '      type: record',
  '      options:',
  '        table: Nowhere',
  '    - name: loose',
  '      type: record',
];

function row(id, cells) {
  return [id === null ? '|-' : `|- id="${id}"`, ...cells.map((c) => `| ${c}`)];
}

const ITEM_ROWS = [
  ...row('r-00001', [
    'Alpha',
    'Zeile eins',
    '120',
    'x',
    '2026-03-01',
    '08:30',
    '[[Quelle]]',
    'r-00001',
    'r-00001',
    'r-00001',
    'r-00001',
  ]),
  // Die zweite Zeile der mehrzeiligen Zelle aus der ersten Zeile oben.
  ...row('r-00002', ['Beta', '', '7.5', '', '', '', 'Nirgends', 'SF', 'abc', '', '']),
  ...row('r-00003', [
    'Gamma',
    '',
    'viele',
    'ja',
    '2026-02-31',
    '25:00',
    '',
    'DUP',
    'r-00099',
    '',
    '',
  ]),
  ...row('r-00004', ['Delta', '', '1', '', '', '', '', 'r-2', '', '', '']),
  ...row(null, ['Ohne Kennung', '', '', '', '', '', '', '', '', '', '']),
];
// Zweite Zeile der mehrzeiligen Notiz hinter ihrer ersten Zeile einfügen.
ITEM_ROWS.splice(ITEM_ROWS.indexOf('| Zeile eins') + 1, 0, 'Zeile zwei');

const ITEMS = table(ITEM_FIELDS, ['  key: title', '  display: title'], ITEM_ROWS);

// Eine Tabelle, die über die Schwelle des Teilers wächst.
const BOOK_FIELDS = ['    - name: code', '    - name: title', '      type: string'];
function bookRows(count, titleOf = (i) => `Titel ${i} ${'x'.repeat(60)}`) {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(`|- id="r-${String(i).padStart(5, '0')}"`, `| K-${i}`, `| ${titleOf(i)}`);
  }
  return lines;
}
const BOOKS = table(BOOK_FIELDS, ['  key: code', '  display: title'], bookRows(40));

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-rtr-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  expect(result.status).toBe('ready');
  return rootForActiveFile(activeFile);
}

// Die Tabellen des Grundfalls in einer Wurzel.
async function itemsRoot() {
  const root = makeRoot();
  write(root, 'Categories.md', CATEGORIES);
  write(root, 'Plain.md', PLAIN);
  write(root, 'Quelle.md', '# Quelle\n');
  const items = write(root, 'Items.md', ITEMS);
  return { root: await indexFor(items), items };
}

// Eine geteilte Tabelle über den Teiler des Speicherns. Zusicherung im Aufbau:
// Sie liegt wirklich in mehreren Dateien, und die Kopf-Datei trägt die
// Zuordnungs-Zeile als eine zusätzliche Zeile im Frontmatter.
function writeSplit(root, text, name = 'Books') {
  const plan = planeZerlegung({
    text,
    base: name,
    schwelle: 1500,
    segmentFelder: ['code', 'title'],
  });
  expect(plan.geteilt).toBe(true);
  expect(plan.teile.length).toBeGreaterThanOrEqual(3);
  for (const part of plan.teile) write(root, `${part.basename}.md`, part.text);
  const frontmatterLines = (t) => t.split('\n').indexOf('---', 1) + 1;
  expect(plan.teile[0].text).toMatch(/^doc-part: /m);
  expect(frontmatterLines(plan.teile[0].text)).toBe(frontmatterLines(text) + 1);
  return plan.teile;
}

// Zeile (ab 1) eines Datensatz-Markers im ungeteilten Ausgangstext; im
// Dokument einer geteilten Tabelle steht davor die Zuordnungs-Zeile.
function markerLine(text, id, extra = 0) {
  return text.split('\n').indexOf(`|- id="${id}"`) + 1 + extra;
}

afterEach(() => {
  vi.restoreAllMocks();
  setzeDatensatzErfassung(true);
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
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

// --- AK2: Werte nach dem Typ ihrer Spalte -------------------------------------

describe('Eine Tabelle in einer Datei (4T-002038, AK2)', () => {
  it('liefert jeden Datensatz mit Kennung, Anzeige-Form, Datei, Zeile und typisierten Werten', async () => {
    const { root, items } = await itemsRoot();
    const result = readRecordTable(root, 'Items');
    expect(result.table).toBe('Items');
    expect(result.path).toBe(items);
    expect(result.source).toBe('disk');
    expect(result.records.map((r) => r.id)).toEqual(['r-00001', 'r-00002', 'r-00003', 'r-00004']);

    const alpha = result.byId.get('r-00001');
    expect(alpha.display).toBe('Alpha');
    expect(alpha.key).toEqual(['Alpha']);
    expect(alpha.file).toBe(items);
    expect(alpha.line).toBe(markerLine(ITEMS, 'r-00001'));
    const v = alpha.values;
    expect(v.get('title')).toBe('Alpha');
    expect(v.get('notes')).toBe('Zeile eins\nZeile zwei');
    expect(v.get('pages')).toBe(120);
    expect(v.get('active')).toBe(true);
    expect(v.get('since')).toEqual({ kind: 'date', ms: new Date(2026, 2, 1).getTime() });
    expect(v.get('at')).toBe('08:30');
    // Die Zuordnung folgt der Reihenfolge der Definition, klein geschrieben.
    expect([...v.keys()]).toEqual([
      'title',
      'notes',
      'pages',
      'active',
      'since',
      'at',
      'source',
      'category',
      'plain',
      'ghost',
      'loose',
    ]);

    const beta = result.byId.get('r-00002').values;
    expect(beta.get('pages')).toBe(7.5);
    // Leer ist beim Wahrheitswert «nein», bei Datum und Uhrzeit «nicht gesetzt».
    expect(beta.get('active')).toBe(false);
    expect(beta.get('since')).toBeNull();
    expect(beta.get('at')).toBeNull();
    expect(beta.get('notes')).toBe('');
  });

  it('ein Wert, der nicht zu seinem Typ passt, ist «fehlend» und bricht nichts ab', async () => {
    const { root } = await itemsRoot();
    const gamma = readRecordTable(root, 'Items').byId.get('r-00003');
    expect(gamma.values.get('pages')).toBeNull();
    expect(gamma.values.get('active')).toBeNull();
    expect(gamma.values.get('since')).toBeNull(); // der 31. Februar ist kein Tag
    expect(gamma.values.get('at')).toBeNull();
    // Der Text bleibt, und die übrigen Werte desselben Datensatzes stehen.
    expect(gamma.texts[2]).toBe('viele');
    expect(gamma.values.get('title')).toBe('Gamma');
  });

  it('liest eine Datei mit Byte-Order-Mark und CRLF wie der Lese-Weg beim Öffnen', async () => {
    const root = makeRoot();
    write(root, 'Categories.md', CATEGORIES);
    const bom = String.fromCharCode(0xfeff);
    const items = write(root, 'Items.md', bom + ITEMS.replace(/\n/g, '\r\n'));
    const result = readRecordTable(await indexFor(items), 'Items');
    const alpha = result.byId.get('r-00001');
    expect(alpha.values.get('title')).toBe('Alpha');
    expect(alpha.values.get('notes')).toBe('Zeile eins\nZeile zwei');
    expect(alpha.line).toBe(markerLine(ITEMS, 'r-00001'));
  });

  it('übergeht einen Datensatz ohne Kennung und zählt ihn', async () => {
    const { root } = await itemsRoot();
    const result = readRecordTable(root, 'Items');
    expect(result.withoutId).toBe(1);
    expect(result.records.some((r) => r.values.get('title') === 'Ohne Kennung')).toBe(false);
  });

  it('führt die Beschriftung als Angabe der Datei, nicht aufgelöst', async () => {
    const { root } = await itemsRoot();
    const title = readRecordTable(root, 'Items').definition.fields[0];
    // Beide Sprachen stehen da: Aufgelöst wird je Lauf beim Aufrufer (E21.6).
    expect(title.label).toEqual({ de: 'Titel', en: 'Title' });
  });
});

// --- AK2: Verweise ------------------------------------------------------------

describe('Verweise in den Werten (4T-002038, AK2; E5.4)', () => {
  it('ein Datensatz-Verweis trägt Tabelle, Kennung, Anzeige-Form und Pfad des Ziels', async () => {
    const { root } = await itemsRoot();
    const result = readRecordTable(root, 'Items');
    const categories = path.join(root, 'Categories.md');
    const alpha = result.byId.get('r-00001');
    expect(alpha.values.get('category')).toEqual({
      kind: 'record',
      table: 'Categories',
      id: 'r-00001',
      display: 'Krimi',
      path: categories,
    });
    expect(alpha.refs.get('category')).toEqual({
      text: 'r-00001',
      art: 'kennung',
      wert: 'r-00001',
      table: 'Categories',
      status: 'ok',
    });
    // Über den Schlüssel-Wert und über die Kurzform der Kennung.
    expect(result.byId.get('r-00002').values.get('category').id).toBe('r-00002');
    expect(result.byId.get('r-00004').values.get('category').id).toBe('r-00002');
    // Ein Ziel ohne Anzeige-Form trägt die leere Anzeige.
    expect(alpha.values.get('plain')).toMatchObject({ table: 'Plain', id: 'r-00001', display: '' });
  });

  it('leer, ins Leere, mehrdeutig und ohne Ziel-Tabelle ergibt «fehlend» mit Befund', async () => {
    const { root } = await itemsRoot();
    const result = readRecordTable(root, 'Items');
    const status = (id, field) => result.byId.get(id).refs.get(field).status;
    const value = (id, field) => result.byId.get(id).values.get(field);
    expect([status('r-00003', 'category'), value('r-00003', 'category')]).toEqual([
      'ambiguous',
      null,
    ]);
    expect([status('r-00003', 'plain'), value('r-00003', 'plain')]).toEqual(['notFound', null]);
    expect([status('r-00002', 'plain'), value('r-00002', 'plain')]).toEqual(['noSingleKey', null]);
    expect([status('r-00001', 'ghost'), value('r-00001', 'ghost')]).toEqual(['unknownTable', null]);
    expect([status('r-00001', 'loose'), value('r-00001', 'loose')]).toEqual(['noTarget', null]);
    expect([status('r-00002', 'ghost'), value('r-00002', 'ghost')]).toEqual(['empty', null]);
  });

  it('ein Datei-Verweis wird zum Datei-Verweis-Wert, ein Ziel ohne Datei bleibt Text', async () => {
    const { root } = await itemsRoot();
    const result = readRecordTable(root, 'Items');
    expect(result.byId.get('r-00001').values.get('source')).toEqual({
      kind: 'link',
      path: path.join(root, 'Quelle.md'),
      name: 'Quelle',
    });
    expect(result.byId.get('r-00002').values.get('source')).toBe('Nirgends');
    expect(result.byId.get('r-00003').values.get('source')).toBeNull();
  });
});

// --- Auffinden der Tabelle ----------------------------------------------------

describe('Auffinden der Tabelle (4T-002038; E26.4)', () => {
  it('findet sie beim Namen ohne Rücksicht auf die Schreibung und als Pfad', async () => {
    const { root, items } = await itemsRoot();
    const byName = readRecordTable(root, 'items');
    expect(byName.path).toBe(items);
    expect(readRecordTable(root, 'Items.md').path).toBe(items);
    expect(readRecordTable(root, items).path).toBe(items);
  });

  it('eine unbekannte Tabelle und ein nicht bereiter Index ergeben null, keinen Fehler', async () => {
    const { root } = await itemsRoot();
    expect(readRecordTable(root, 'Gibtsnicht')).toBeNull();
    expect(readRecordTable(root, 'Quelle')).toBeNull(); // ein Dokument, keine Tabelle
    expect(readRecordTable(root, '')).toBeNull();
    expect(readRecordTable(path.join(root, 'ohne-index'), 'Items')).toBeNull();
  });
});

// --- AK2: geteilte Tabelle ----------------------------------------------------

describe('Eine auf Folge-Dateien verteilte Tabelle (4T-002038, AK2)', () => {
  it('liefert die Datensätze aller Dateien mit der Zeile im Dokument des Editors', async () => {
    const root = makeRoot();
    writeSplit(root, BOOKS);
    const head = path.join(root, 'Books.md');
    const result = readRecordTable(await indexFor(head), 'Books');
    expect(result.records).toHaveLength(40);
    expect(result.missingParts).toEqual([]);
    const late = result.byId.get('r-00035');
    expect(late.values.get('code')).toBe('K-35');
    expect(late.file).toBe(head);
    expect(late.line).toBe(markerLine(BOOKS, 'r-00035', 1));
  });

  it('ein fehlender Teil fehlt und wird genannt, die übrigen bleiben lesbar', async () => {
    const root = makeRoot();
    const parts = writeSplit(root, BOOKS);
    const head = path.join(root, 'Books.md');
    const wurzel = await indexFor(head);
    fs.rmSync(path.join(root, `${parts[1].basename}.md`));
    const result = readRecordTable(wurzel, 'Books');
    expect(result.missingParts).toEqual([parts[1].index]);
    expect(result.byId.get('r-00001').values.get('code')).toBe('K-1');
    expect(result.byId.get('r-00040').values.get('code')).toBe('K-40');
  });
});

// --- AK3: Puffer vor Platte ---------------------------------------------------

describe('Der ungespeicherte Stand geht vor die Platte (4T-002038, AK3; E25)', () => {
  it('geänderte, neue und gelöschte Datensätze erscheinen ohne Speichern', async () => {
    const { root, items } = await itemsRoot();
    expect(readRecordTable(root, 'Items').records).toHaveLength(4);
    const buffer = ITEMS.replace('| 120', '| 999').replace('|- id="r-00004"', '|- id="r-00009"');
    setBufferOverlay(items, buffer);
    const result = readRecordTable(root, 'Items');
    expect(result.source).toBe('buffer');
    expect(result.byId.get('r-00001').values.get('pages')).toBe(999);
    expect(result.byId.has('r-00009')).toBe(true);
    expect(result.byId.has('r-00004')).toBe(false);
    // Die Platte ist davon unberührt.
    expect(fs.readFileSync(items, 'utf8')).toBe(ITEMS);
  });

  it('bei einer geteilten Tabelle auch für einen Datensatz aus einer Folge-Datei, ohne Doppel', async () => {
    const root = makeRoot();
    const parts = writeSplit(root, BOOKS);
    const head = path.join(root, 'Books.md');
    const wurzel = await indexFor(head);
    // Der Editor hält das zusammengesetzte Dokument unter dem Pfad der Kopf-Datei.
    const assembled = assembleParts(parts.map((p) => ({ index: p.index, content: p.text }))).text;
    const lastPart = parts[parts.length - 1].text;
    expect(lastPart).toContain('| K-38');
    setBufferOverlay(head, assembled.replace('| K-38', '| K-38-neu'));
    const result = readRecordTable(wurzel, 'Books');
    expect(result.source).toBe('buffer');
    expect(result.byId.get('r-00038').values.get('code')).toBe('K-38-neu');
    expect(result.records).toHaveLength(40);
    expect(new Set(result.records.map((r) => r.id)).size).toBe(40);
  });
});

// --- AK4: Zwischenspeicher ----------------------------------------------------

describe('Zwischenspeicher je Tabelle (4T-002038, AK4)', () => {
  it('liefert bei unverändertem Stand ohne erneutes Lesen', async () => {
    const { root } = await itemsRoot();
    const first = readRecordTable(root, 'Items');
    const reads = readCount();
    const readFile = vi.spyOn(fs, 'readFileSync');
    const readDir = vi.spyOn(fs, 'readdirSync');
    for (let i = 0; i < 10; i++) expect(readRecordTable(root, 'Items')).toBe(first);
    expect(readCount()).toBe(reads);
    expect(readFile).not.toHaveBeenCalled();
    expect(readDir).not.toHaveBeenCalled();
  });

  it('liest nach einer Änderung auf der Platte neu, ohne auf den Datei-Beobachter zu warten', async () => {
    const { root, items } = await itemsRoot();
    readRecordTable(root, 'Items');
    const stand = indexStand(root);
    fs.writeFileSync(items, ITEMS.replace('| 120', '| 121000'), 'utf8');
    // Der Beobachter meldet sich asynchron; bis hierher hat er nichts gezählt.
    expect(indexStand(root)).toBe(stand);
    expect(readRecordTable(root, 'Items').byId.get('r-00001').values.get('pages')).toBe(121000);
  });

  it('liest nach einer Puffer-Änderung der Tabelle neu, nach der eines anderen Dokuments nicht', async () => {
    const { root, items } = await itemsRoot();
    readRecordTable(root, 'Items');
    const reads = readCount();
    setBufferOverlay(path.join(root, 'Quelle.md'), '# Quelle, geändert\n');
    readRecordTable(root, 'Items');
    expect(readCount()).toBe(reads);
    setBufferOverlay(items, ITEMS.replace('| Alpha', '| Alpha zwei'));
    expect(readRecordTable(root, 'Items').byId.get('r-00001').display).toBe('Alpha zwei');
    expect(readCount()).toBe(reads + 1);
  });

  it('zieht einen Datensatz-Verweis nach, wenn sich die Ziel-Tabelle ändert', async () => {
    const { root } = await itemsRoot();
    const categories = path.join(root, 'Categories.md');
    expect(readRecordTable(root, 'Items').byId.get('r-00001').values.get('category').display).toBe(
      'Krimi',
    );
    fs.writeFileSync(categories, CATEGORIES.replace('| Krimi', '| Kriminalroman'), 'utf8');
    expect(readRecordTable(root, 'Items').byId.get('r-00001').values.get('category').display).toBe(
      'Kriminalroman',
    );
  });
});

// --- AK5: Aus-Zustand ---------------------------------------------------------

describe('Aus-Zustand der Datenbank (4T-002038, AK5; E15.4)', () => {
  it('liest keine Datei und liefert null; nach dem Wiedereinschalten wieder den Bestand', async () => {
    const { root } = await itemsRoot();
    readRecordTable(root, 'Items');
    setzeDatensatzErfassung(false);
    const spies = ['statSync', 'readFileSync', 'readdirSync', 'openSync'].map((name) =>
      vi.spyOn(fs, name),
    );
    expect(readRecordTable(root, 'Items')).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    setzeDatensatzErfassung(true);
    expect(readRecordTable(root, 'Items').records).toHaveLength(4);
  });
});

// --- AK6: Messlauf auf Zuruf --------------------------------------------------

// Eine große Tabelle mit den Spalten-Arten eines gewöhnlichen Bestands und einem
// Datensatz-Verweis, damit auch die Ergebnis-Stufe mitgemessen wird.
function largeTable(count) {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(
      `|- id="r-${String(i).padStart(5, '0')}"`,
      `| Titel ${i}`,
      `| Autor ${i % 97}`,
      `| ${100 + (i % 900)}`,
      `| 20${String(10 + (i % 15)).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 9}`,
      i % 3 === 0 ? '| x' : '|',
      `| ${i % 2 === 0 ? 'KR' : 'r-00002'}`,
    );
  }
  return table(
    [
      '    - name: title',
      '    - name: author',
      '    - name: pages',
      '      type: number',
      '    - name: acquired',
      '      type: date',
      '    - name: onLoan',
      '      type: boolean',
      '    - name: category',
      '      type: record',
      '      options:',
      '        table: Categories',
    ],
    ['  key: title', '  display: title'],
    lines,
  );
}

function median(root, name, count) {
  const times = [];
  for (let run = 0; run < 5; run++) {
    clearCaches();
    const start = performance.now();
    const result = readRecordTable(root, name);
    times.push(performance.now() - start);
    expect(result.records).toHaveLength(count);
  }
  times.sort((a, b) => a - b);
  return times;
}

describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Tabellen-Bestand (4T-002038, AK6)', () => {
  it(
    'misst das Lesen bei 2000 und 10 000 Datensätzen, ungeteilt und geteilt',
    async () => {
      const lines = [];
      for (const count of [2000, 10000]) {
        for (const split of [false, true]) {
          const root = makeRoot();
          write(root, 'Categories.md', CATEGORIES);
          const text = largeTable(count);
          let parts = 1;
          if (split) {
            const plan = planeZerlegung({
              text,
              base: 'Big',
              schwelle: Math.ceil(Buffer.byteLength(text) / 4),
              segmentFelder: ['title', 'author', 'pages', 'acquired', 'onLoan', 'category'],
            });
            expect(plan.geteilt).toBe(true);
            for (const part of plan.teile) write(root, `${part.basename}.md`, part.text);
            parts = plan.teile.length;
          } else {
            write(root, 'Big.md', text);
          }
          const wurzel = await indexFor(path.join(root, 'Big.md'));
          median(wurzel, 'Big', count); // Aufwärm-Lauf
          const times = median(wurzel, 'Big', count);
          lines.push(
            `${count} Datensätze in ${parts} Datei(en): Median ${times[2].toFixed(1)} ms ` +
              `(Läufe ${times.map((t) => t.toFixed(1)).join(', ')} ms)`,
          );
        }
      }
      // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
      // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
      // eslint-disable-next-line no-console
      console.log(`Messlauf Tabellen-Bestand:\n${lines.join('\n')}`);
    },
    PROZESS_ZEITLIMIT,
  );
});
