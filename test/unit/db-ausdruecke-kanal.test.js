// 4T-002252 (Epic 3E-000262, F6 A, S1, S8; AK1 bis AK4): Der Kanal
// `database:ausdruecke` und seine Brücke — Werte und Bedingungen einer
// Einzel-Maske über Verweis-Pfade, gerechnet im Haupt-Prozess gegen den
// Entwurfs-Stand des Datensatzes.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion (Muster
// `db-datensatz-kanal.test.js`) und am echten Index-Leser im Temp-Ordner (Muster
// `record-table-read.test.js`): Der Pfad `book.title` aus dem gespeicherten
// Stand und aus einem Entwurf mit anderem Buch, ein leerer Verweis, ein
// Ziel-Feld, das die Ziel-Tabelle nicht führt, eine Bedingung über den Pfad, ein
// Ausdruck ohne Pfad, die Neuanlage, die Form-Prüfung und der Aus-Zustand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
import { clearCaches } from '../../src/main/index/record-table-read.js';

const require_ = createRequire(import.meta.url);
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '    - name: onloan',
  '      type: boolean',
  '  display: title',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Zauberberg',
  '| 1000',
  '| x',
  '|- id="r-00002"',
  '| Anna Karenina',
  '| 864',
  '|',
  '```',
  '',
].join('\n');

const LOANS = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: book',
  '      type: record',
  '      options:',
  '        table: Library',
  '    - name: borrower',
  '  display: borrower',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| r-00001',
  '| Clara',
  '|- id="r-00002"',
  '|',
  '| Mia',
  '```',
  '',
].join('\n');

const openRoots = new Set();
let tmpDirs = [];

afterEach(() => {
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
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Der Bereich mit beiden Tabellen und bereitem Index; die Wurzel ist die des
// Index, wie sie das Fenster als Bereichs-Wurzel meldet.
async function bereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ausdruecke-kanal-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'Library.md'), LIBRARY, 'utf8');
  const loans = path.join(dir, 'Loans.md');
  fs.writeFileSync(loans, LOANS, 'utf8');
  let ergebnis = backlinksFor(loans);
  openRoots.add(rootForActiveFile(loans));
  for (let i = 0; i < 500 && ergebnis.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    ergebnis = backlinksFor(loans);
  }
  expect(ergebnis.status).toBe('ready');
  return rootForActiveFile(loans);
}

function registriere({ datenbankAktiv = () => true } = {}) {
  const kanaele = new Map();
  registerDatabaseIpc((name, fn) => kanaele.set(name, fn), {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () => ({ status: 'unavailable', meta: null, sicht: null }),
      bufferTextFor: () => null,
    },
    isMarkdownPath,
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
    datenbankAktiv,
  });
  return kanaele;
}

function kanal(optionen) {
  return registriere(optionen).get('database:ausdruecke');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

function anfrage(zusatz = {}) {
  return {
    tabelle: 'Loans.md',
    kennung: 'r-00001',
    entwurf: {},
    ausdruecke: [{ id: '0', quelle: 'book.title' }],
    ...zusatz,
  };
}

async function gestaltOhneZugriff() {
  return registriere().get('database:changeLog')({}, undefined);
}

describe('database:ausdruecke: Registrierung und Brücke (4T-002252, S1)', () => {
  it('registriert den Kanal und bindet die Brücke an ihn', async () => {
    expect(registriere().has('database:ausdruecke')).toBe(true);
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke });
    const params = anfrage();
    expect(await bruecke.databaseAusdruecke(params)).toEqual({ name: 'database:ausdruecke' });
    expect(invoke).toHaveBeenCalledWith('database:ausdruecke', params);
  });
});

describe('database:ausdruecke: Werte über Verweis-Pfade (4T-002252, AK1 bis AK4)', () => {
  it('liefert den Titel des verwiesenen Buchs aus dem gespeicherten Stand', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(ereignis(wurzel), anfrage());
    expect(antwort).toEqual({
      status: 'ready',
      werte: [{ id: '0', wert: 'Zauberberg', erfuellt: true, unbekannt: null }],
    });
  });

  it('folgt einem Entwurf mit anderem Buch, ohne dass gespeichert wurde', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(
      ereignis(wurzel),
      anfrage({
        entwurf: { book: 'r-00002', borrower: 'Clara' },
        ausdruecke: [
          { id: '0', quelle: 'book.title' },
          { id: '1', quelle: 'book.onloan' },
          { id: '2', quelle: 'book.pages + 1' },
        ],
      }),
    );
    expect(antwort.werte).toEqual([
      { id: '0', wert: 'Anna Karenina', erfuellt: true, unbekannt: null },
      { id: '1', wert: false, erfuellt: false, unbekannt: null },
      { id: '2', wert: 865, erfuellt: true, unbekannt: null },
    ]);
    expect(fs.readFileSync(path.join(wurzel, 'Loans.md'), 'utf8')).toBe(LOANS);
  });

  it('eine Bedingung über den Pfad ist erfüllt, wenn das verwiesene Buch ausgeliehen ist', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(
      ereignis(wurzel),
      anfrage({ ausdruecke: [{ id: 'b', quelle: 'book.onloan' }] }),
    );
    expect(antwort.werte).toEqual([{ id: 'b', wert: true, erfuellt: true, unbekannt: null }]);
  });

  it('ein leerer Verweis ergibt null ohne Fehler, gespeichert wie im Entwurf', async () => {
    const wurzel = await bereich();
    const gespeichert = await kanal()(ereignis(wurzel), anfrage({ kennung: 'r-00002' }));
    expect(gespeichert.werte).toEqual([{ id: '0', wert: null, erfuellt: false, unbekannt: null }]);
    const geleert = await kanal()(ereignis(wurzel), anfrage({ entwurf: { book: '' } }));
    expect(geleert.werte).toEqual([{ id: '0', wert: null, erfuellt: false, unbekannt: null }]);
  });

  it('ein Ziel-Feld, das die Ziel-Tabelle nicht führt, kommt als unbekannt zurück', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(
      ereignis(wurzel),
      anfrage({ ausdruecke: [{ id: '0', quelle: 'book.autor' }] }),
    );
    expect(antwort.werte).toEqual([
      { id: '0', wert: null, erfuellt: false, unbekannt: 'book.autor' },
    ]);
  });

  it('ein Ausdruck ohne Pfad und ein ungültiger Ausdruck rechnen weich', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(
      ereignis(wurzel),
      anfrage({
        ausdruecke: [
          { id: '0', quelle: 'upper(borrower)' },
          { id: '1', quelle: 'book.title +' },
        ],
      }),
    );
    expect(antwort.werte).toEqual([
      { id: '0', wert: 'CLARA', erfuellt: true, unbekannt: null },
      { id: '1', wert: null, erfuellt: false, unbekannt: null },
    ]);
  });

  it('rechnet in der Neuanlage allein über den Entwurf', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(
      ereignis(wurzel),
      anfrage({ kennung: null, entwurf: { book: 'r-00002', borrower: 'Neu' } }),
    );
    expect(antwort.werte[0].wert).toBe('Anna Karenina');
  });

  it('eine unbekannte Tabelle ist eine Fehlerlage, kein Wurf', async () => {
    const wurzel = await bereich();
    const antwort = await kanal()(ereignis(wurzel), anfrage({ tabelle: 'Nirgends.md' }));
    expect(antwort.status).toBe('error');
    expect(typeof antwort.code).toBe('string');
  });
});

describe('database:ausdruecke: Absperrung und Aus-Zustand (4T-002252, S1)', () => {
  it('jede Anfrage in falscher Form endet ohne Zugriff', async () => {
    const wurzel = await bereich();
    const ohne = await gestaltOhneZugriff();
    const falsch = [
      undefined,
      anfrage({ tabelle: '' }),
      anfrage({ kennung: '' }),
      anfrage({ kennung: undefined }),
      anfrage({ entwurf: null }),
      anfrage({ entwurf: { book: 3 } }),
      anfrage({ ausdruecke: 'book.title' }),
      anfrage({ ausdruecke: [{ id: '', quelle: 'x' }] }),
      anfrage({ ausdruecke: [{ id: '0' }] }),
      anfrage({
        ausdruecke: Array.from({ length: 201 }, (_, i) => ({ id: String(i), quelle: 'x' })),
      }),
    ];
    for (const params of falsch) {
      expect(await kanal()(ereignis(wurzel), params)).toEqual(ohne);
    }
  });

  it('außerhalb des Bereichs, ohne Bereich und ohne Markdown-Endung ohne Zugriff', async () => {
    const wurzel = await bereich();
    const ohne = await gestaltOhneZugriff();
    expect(await kanal()(ereignis(wurzel), anfrage({ tabelle: '../Loans.md' }))).toEqual(ohne);
    expect(await kanal()(ereignis(null), anfrage())).toEqual(ohne);
    expect(await kanal()(ereignis(wurzel), anfrage({ tabelle: 'Loans.txt' }))).toEqual(ohne);
  });

  it('im Aus-Zustand der Erweiterung liefert der Kanal keine Daten', async () => {
    const wurzel = await bereich();
    const ohne = await gestaltOhneZugriff();
    const aus = kanal({ datenbankAktiv: () => false });
    expect(await aus(ereignis(wurzel), anfrage())).toEqual(ohne);
  });
});
