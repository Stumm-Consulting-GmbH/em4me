// 4T-002407 (Epic 3E-000266, F6 A; Story 4S-001128, AK5): Die Sichten an der
// Tabellen-Definition — die Angabe `views` beim Lesen der Definition und ihre
// Zuordnung zu den Abfrage-Dateien im Katalog.
//
// Gemessen wird am Verhalten: das Ergebnis von `parseTableDefinition`, der
// Überblick und die Definition des Katalogs über einen nachgestellten
// Dateizugriff und eine nachgestellte Index-Sicht (Muster `db-katalog.test.js`).
// Die Einblendung unter einer Karteikarte prüft
// `renderer/karteikarte-sichten.test.js`, den Weg durch die laufende Anwendung
// der Ablauf-Fall `DB-KAS-06`.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabaseCatalogCache,
  katalogUeberblick,
  tabellenDefinition,
} from '../../src/main/database/table-catalog.js';
import { parseTableDefinition, DB_TABLE_KEY } from '../../src/shared/database/table-definition.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';
import { DB_QUERY_KEY } from '../../src/shared/database/behaelter.js';

// Ein Dateisystem aus einer Map Pfad -> Text (Muster `db-katalog.test.js`).
function fakeFs(dateien) {
  const stand = new Map(Object.entries(dateien));
  const lies = (p) => {
    if (!stand.has(p)) throw new Error('ENOENT');
    return stand.get(p);
  };
  return {
    async stat(p) {
      return { mtimeMs: 1, size: Buffer.byteLength(lies(p), 'utf8') };
    },
    async readFile(p) {
      return lies(p);
    },
    async open(p) {
      const puffer = Buffer.from(lies(p), 'utf8');
      return {
        async read(ziel, offset, laenge, position) {
          const teil = puffer.subarray(position, position + laenge);
          teil.copy(ziel, offset);
          return { bytesRead: teil.length };
        },
        async close() {},
      };
    },
  };
}

const AUTHORS = '/raum/Authors/Authors.md';
const LIBRARY = '/raum/Library.md';
const SICHT_BUECHER = '/raum/Sichten/Books by this author.md';
const NOTIZ = '/raum/Notiz.md';

function kartei(weiteres = '') {
  return [
    '---',
    `${DB_TABLE_KEY}:`,
    '  storage: cards',
    '  fields:',
    '    - name: name',
    '      type: string',
    weiteres,
    '---',
    '',
    '# Authors',
    '',
  ].join('\n');
}

const ABFRAGE = [
  '---',
  `${DB_QUERY_KEY}:`,
  '---',
  '',
  '```perspective-query',
  'TABLE RECORDS title FROM "Library" WHERE author = this.name',
  '```',
  '',
].join('\n');

const BIBLIOTHEK = `---\n${DB_TABLE_KEY}:\n  fields:\n    - name: title\n      type: string\n---\n`;

// Die Index-Sicht: Marken je Datei und, wie im Index, alle Dateien.
function sichtMit(marken, weitere = []) {
  const dbKindsPerFile = new Map(Object.entries(marken));
  const files = new Map([...dbKindsPerFile.keys(), ...weitere].map((p) => [p, {}]));
  return { dbKindsPerFile, files };
}

let cache;
beforeEach(() => {
  cache = createDatabaseCatalogCache();
});

function tabelle(behaelter) {
  return { [DB_TABLE_KEY]: { fields: [{ name: 'name', type: 'string' }], ...behaelter } };
}

describe('Tabellen-Definition: Angabe views (AK1)', () => {
  it('liest views als Liste von Namen oder Pfaden ohne Endung', () => {
    const d = parseTableDefinition(
      tabelle({ views: ['Books by this author', 'Sichten\\Long Books.md', ' Weitere '] }),
    );
    expect(d.views).toEqual(['Books by this author', 'Sichten/Long Books', 'Weitere']);
    expect(d.hints).toEqual([]);
  });

  it('ohne Angabe ändert sich nichts', () => {
    const ohne = parseTableDefinition(tabelle({}));
    expect(ohne).not.toHaveProperty('views');
    expect(parseTableDefinition(tabelle({ views: null }))).toEqual(ohne);
    expect(ohne.hints).toEqual([]);
  });

  it('meldet eine Angabe, die keine Liste ist, und blendet keine Sicht ein', () => {
    const d = parseTableDefinition(tabelle({ views: 'Books by this author' }));
    expect(d).not.toHaveProperty('views');
    expect(d.hints).toEqual([
      { code: 'views', index: -1, name: null, key: 'views', expected: 'list-of-query-files' },
    ]);
    // Die übrigen Angaben der Definition bleiben wirksam.
    expect(d.fields.map((f) => f.name)).toEqual(['name']);
  });

  it('meldet einen Eintrag, der kein Name ist, einzeln und behält die übrigen', () => {
    const d = parseTableDefinition(tabelle({ views: ['Books by this author', 3, '  ', { a: 1 }] }));
    expect(d.views).toEqual(['Books by this author']);
    expect(d.hints.map((h) => [h.code, h.name, h.key])).toEqual([
      ['viewsEntry', '3', 'views'],
      ['viewsEntry', '  ', 'views'],
      ['viewsEntry', '{"a":1}', 'views'],
    ]);
  });

  it('eine Liste ohne brauchbaren Eintrag ergibt keine Sichten', () => {
    const d = parseTableDefinition(tabelle({ views: [] }));
    expect(d).not.toHaveProperty('views');
    expect(d.hints).toEqual([]);
  });

  it('jeder Code der Sichten steht im Hinweis-Katalog mit dem Schlüssel views', () => {
    for (const code of ['views', 'viewsEntry', 'viewDateiUnbekannt', 'viewKeineAbfrage']) {
      expect(HINWEIS_META[code], code).toBeTruthy();
      expect(HINWEIS_META[code].key).toBe('views');
    }
  });
});

describe('Katalog: Sichten einer Tabelle (AK2)', () => {
  it('nennt die Sichten einer Tabelle mit ihrer Abfrage-Datei', async () => {
    const fsp = fakeFs({
      [AUTHORS]: kartei('  views:\n    - Books by this author'),
      [LIBRARY]: BIBLIOTHEK,
      [SICHT_BUECHER]: ABFRAGE,
    });
    const sicht = sichtMit({
      [AUTHORS]: ['table'],
      [LIBRARY]: ['table'],
      [SICHT_BUECHER]: ['query'],
    });
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    const authors = u.tabellen.find((t) => t.name === 'Authors');
    expect(authors.sichten).toEqual([{ name: 'Books by this author', path: SICHT_BUECHER }]);
    expect(authors.hints).toEqual([]);
    // Eine Tabelle ohne Angabe trägt keine Liste.
    expect(u.tabellen.find((t) => t.name === 'Library')).not.toHaveProperty('sichten');
  });

  it('vergleicht wie bei form: Ordner davor, Endung und Schreibung zählen nicht', async () => {
    const fsp = fakeFs({
      [AUTHORS]: kartei('  views:\n    - sichten/BOOKS BY THIS AUTHOR.md'),
      [SICHT_BUECHER]: ABFRAGE,
    });
    const sicht = sichtMit({ [AUTHORS]: ['table'], [SICHT_BUECHER]: ['query'] });
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    expect(u.tabellen[0].sichten).toEqual([
      { name: 'sichten/BOOKS BY THIS AUTHOR', path: SICHT_BUECHER },
    ]);
  });

  it('führt eine Sicht ohne Datei und eine ohne Abfrage-Datei mit je ihrem Hinweis', async () => {
    const fsp = fakeFs({
      [AUTHORS]: kartei('  views:\n    - Fehlt\n    - Notiz\n    - Books by this author'),
      [SICHT_BUECHER]: ABFRAGE,
      [NOTIZ]: '# Notiz\n',
    });
    const sicht = sichtMit({ [AUTHORS]: ['table'], [SICHT_BUECHER]: ['query'] }, [NOTIZ]);
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    const [authors] = u.tabellen;
    // Die Reihenfolge der Angabe bleibt, auch für die Sichten ohne Datei.
    expect(authors.sichten).toEqual([
      { name: 'Fehlt', path: null },
      { name: 'Notiz', path: null },
      { name: 'Books by this author', path: SICHT_BUECHER },
    ]);
    expect(authors.hints.map((h) => [h.code, h.name, h.key])).toEqual([
      ['viewDateiUnbekannt', 'Fehlt', 'views'],
      ['viewKeineAbfrage', 'Notiz', 'views'],
    ]);
  });

  it('trägt die Hinweise beim Lesen der Definition in den Überblick', async () => {
    const fsp = fakeFs({ [AUTHORS]: kartei('  views: Books by this author') });
    const sicht = sichtMit({ [AUTHORS]: ['table'] });
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    expect(u.tabellen[0].hints.map((h) => h.code)).toEqual(['views']);
    expect(u.tabellen[0]).not.toHaveProperty('sichten');
  });

  it('die Definition einer Tabelle nennt ihre Sichten', async () => {
    const fsp = fakeFs({ [AUTHORS]: kartei('  views:\n    - Books by this author') });
    const sicht = sichtMit({ [AUTHORS]: ['table'] });
    const d = await tabellenDefinition({ sicht, status: 'ready', tabelle: 'Authors', fsp, cache });
    expect(d.gefunden).toBe(true);
    expect(d.views).toEqual(['Books by this author']);
  });
});
