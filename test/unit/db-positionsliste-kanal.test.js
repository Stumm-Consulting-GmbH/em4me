// 4T-002253 (Epic 3E-000262, F5 A, S6; AK2, AK5): Der Kanal
// `database:positionsliste` und seine Brücke — die Auskunft über den
// Positions-Bereich `{{list:…}}` einer Einzel-Maske: Abfrage-Datei, Verweis-Feld
// auf die Kopf-Tabelle und die um die Beziehung ergänzte Abfrage.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion und am
// echten Dateisystem im Temp-Ordner (Muster `db-liste-kanal.test.js`): die
// Auflösung nach Name und Pfad, die Beziehung eindeutig, über `BY`, mehrdeutig
// und fehlend, die Abfrage-Datei ohne `editable`, die unbekannte Datei, die
// Stufen der Absperrung samt Aus-Zustand. Dazu die Befunde der
// Konsistenz-Prüfung am Positions-Bereich einer Masken-Datei, die dieselbe
// Auflösung fragt (die Prüfdatei der Konsistenz-Prüfung steht an ihrem Budget).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import {
  KONSISTENZ_BEFUNDE,
  pruefeKonsistenz,
} from '../../src/main/database/konsistenz-pruefung.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';
import {
  POSITIONS_HINWEISE,
  liesPositionsListe,
} from '../../src/main/database/positions-auskunft.js';

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

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

function lege(wurzel, name, zeilen) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, Array.isArray(zeilen) ? zeilen.join('\n') : zeilen, 'utf8');
  return pfad;
}

const LIBRARY = ['---', 'db-table:', '  fields:', '    - name: title', '---', ''];

// «Loans» mit einem Verweis-Feld auf «Library», «Doppelt» mit zweien.
function ausleihen(felder) {
  return ['---', 'db-table:', '  fields:', ...felder, '    - name: borrower', '---', ''];
}
const VERWEIS = (name) => [
  `    - name: ${name}`,
  '      type: record',
  '      options:',
  '        table: Library',
];

function abfrageDatei(tabelle, angaben = ['editable: true', 'allow: [create, update, delete]']) {
  return [
    '---',
    'db-query:',
    ...angaben.map((z) => `  ${z}`),
    '---',
    '',
    '```perspective-query',
    `TABLE RECORDS borrower FROM "${tabelle}" SORT borrower`,
    '```',
    '',
  ];
}

function bestand() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-positionsliste-'));
  tmpDirs.push(wurzel);
  const library = lege(wurzel, 'Library.md', LIBRARY);
  const loans = lege(wurzel, 'Loans.md', ausleihen(VERWEIS('book')));
  const doppelt = lege(wurzel, 'Doppelt.md', ausleihen([...VERWEIS('book'), ...VERWEIS('vorher')]));
  const ohne = lege(wurzel, 'Ohne.md', ausleihen([]));
  const abfragen = {
    ausleihen: lege(wurzel, 'Ausleihen.md', abfrageDatei('Loans')),
    doppelt: lege(wurzel, 'Doppelt Liste.md', abfrageDatei('Doppelt')),
    ohne: lege(wurzel, 'Ohne Liste.md', abfrageDatei('Ohne')),
    lesend: lege(wurzel, 'Lesend.md', abfrageDatei('Loans', ['form: Loans'])),
  };
  const sicht = {
    dbKindsPerFile: new Map([
      [library, ['table']],
      [loans, ['table']],
      [doppelt, ['table']],
      [ohne, ['table']],
      ...Object.values(abfragen).map((p) => [p, ['query']]),
    ]),
  };
  return { wurzel, sicht, library, loans, doppelt, abfragen };
}

function registriere({ datenbankAktiv = () => true, ohneTor = false, sicht = null } = {}) {
  const kanaele = new Map();
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () =>
        sicht
          ? { status: 'ready', meta: null, sicht }
          : { status: 'unavailable', meta: null, sicht: null },
      bufferTextFor: () => null,
    },
    isMarkdownPath,
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
  };
  if (!ohneTor) deps.datenbankAktiv = datenbankAktiv;
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), deps);
  return kanaele;
}

const kanal = (optionen) => registriere(optionen).get('database:positionsliste');
const ereignis = (wurzel) => ({ wurzel, sender: { id: 1 } });

describe('database:positionsliste: Registrierung und Brücke (4T-002253)', () => {
  it('registriert den Kanal und bindet die Brücke unverändert', async () => {
    expect(registriere().has('database:positionsliste')).toBe(true);
    const invoke = vi.fn(async (name) => ({ name }));
    const params = { datei: 'Ausleihen', by: null, kopf: { tabelle: '/a/L.md', kennung: 'r-1' } };
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    expect(await bruecke.databasePositionsliste(params)).toEqual({
      name: 'database:positionsliste',
    });
    expect(invoke.mock.calls[0][1]).toBe(params);
  });

  it('führt jeden Hinweis-Code im Katalog der Hinweise', () => {
    for (const code of Object.values(POSITIONS_HINWEISE))
      expect(HINWEIS_META[code], code).toEqual({ key: null, expected: null });
  });
});

describe('database:positionsliste: Auflösung und Beziehung (4T-002253, AK2, AK5)', () => {
  it('löst die Datei nach Name auf und ergänzt die Abfrage um das eine Verweis-Feld', async () => {
    const { wurzel, sicht, library, loans, abfragen } = bestand();
    const antwort = await kanal({ sicht })(ereignis(wurzel), {
      datei: 'Ausleihen',
      by: null,
      kopf: { tabelle: library, kennung: 'r-00002' },
    });
    expect(antwort).toEqual({
      istListe: true,
      pfad: abfragen.ausleihen,
      query: 'TABLE RECORDS borrower FROM "Loans" WHERE book = "r-00002" SORT borrower',
      beziehung: { feld: 'book' },
      tabelle: loans,
      // 4T-002308: ohne Steckbrief keine Rollen, also alles erlaubt.
      rechte: { create: true, update: true, delete: true, define: true },
      // 4T-002311: ohne geltende Rolle keine.
      rolle: null,
      hinweis: null,
    });
  });

  it('nimmt bei mehreren Verweis-Feldern das hinter BY, sonst «mehrdeutig»', async () => {
    const { wurzel, sicht, library } = bestand();
    const k = kanal({ sicht });
    const frage = (by) => ({
      datei: 'Doppelt Liste.md',
      by,
      kopf: { tabelle: library, kennung: 'r-1' },
    });
    const mitBy = await k(ereignis(wurzel), frage('Vorher'));
    expect(mitBy.istListe).toBe(true);
    expect(mitBy.beziehung).toEqual({ feld: 'vorher' });
    expect(await k(ereignis(wurzel), frage(null))).toEqual({
      istListe: false,
      hinweis: 'listBeziehungMehrdeutig',
    });
    expect((await k(ereignis(wurzel), frage('borrower'))).hinweis).toBe('listBeziehungMehrdeutig');
  });

  it('meldet fehlende Beziehung, unbekannte Datei und eine Datei ohne editable', async () => {
    const { wurzel, sicht, library } = bestand();
    const k = kanal({ sicht });
    const frage = (datei) => ({ datei, by: null, kopf: { tabelle: library, kennung: 'r-1' } });
    expect((await k(ereignis(wurzel), frage('Ohne Liste'))).hinweis).toBe('listBeziehungFehlt');
    expect(await k(ereignis(wurzel), frage('Gibt Es Nicht'))).toEqual({
      istListe: false,
      hinweis: 'listDateiUnbekannt',
    });
    // Ohne `editable: true` lesend, aber mit der Abfrage, damit der Bereich zeigt.
    const lesend = await k(ereignis(wurzel), frage('Lesend'));
    expect(lesend.istListe).toBe(false);
    expect(lesend.hinweis).toBe('listNichtBearbeitbar');
    expect(lesend.query).toContain('WHERE book = "r-1"');
  });

  it('weist ungültige Form, Aus-Zustand, fehlenden Bereich und fremde Kopf-Tabelle ab', async () => {
    const { wurzel, sicht, library } = bestand();
    const gut = { datei: 'Ausleihen', by: null, kopf: { tabelle: library, kennung: 'r-1' } };
    const keine = { istListe: false };
    const k = kanal({ sicht });
    expect(await k(ereignis(wurzel), { ...gut, datei: '' })).toEqual(keine);
    expect(await k(ereignis(wurzel), { ...gut, by: 3 })).toEqual(keine);
    expect(await k(ereignis(wurzel), { ...gut, kopf: { tabelle: library } })).toEqual(keine);
    expect(
      await k(ereignis(wurzel), { ...gut, kopf: { tabelle: '/x.txt', kennung: 'r' } }),
    ).toEqual(keine);
    expect(await k(ereignis(null), gut)).toEqual(keine);
    expect(await kanal({ sicht, datenbankAktiv: () => false })(ereignis(wurzel), gut)).toEqual(
      keine,
    );
    expect(await kanal({ sicht, ohneTor: true })(ereignis(wurzel), gut)).toEqual(keine);
    expect(await kanal({})(ereignis(wurzel), gut)).toEqual(keine);
  });
});

describe('Konsistenz-Prüfung: Positions-Bereich einer Masken-Datei (4T-002253, AK5)', () => {
  it('führt je nicht auflösbarem Positions-Bereich einen Befund mit Zeile und Angabe', async () => {
    const { wurzel, sicht } = bestand();
    const maske = lege(wurzel, 'Library Form.md', [
      '---',
      'db-form:',
      '  table: Library',
      '---',
      '{{field:title}}',
      '{{list:Ausleihen}}',
      '{{list:Gibt Es Nicht}}',
      '{{list:Doppelt Liste}}',
      '{{list:Ohne Liste}}',
      '{{list:Lesend}}',
      '{{list:Doppelt Liste BY vorher}}',
      '',
    ]);
    sicht.dbKindsPerFile.set(maske, ['form']);
    const ergebnis = await pruefeKonsistenz({ fsp: fs.promises, wurzel, sicht, tabelle: null });
    const befunde = ergebnis.befunde
      .filter((b) => b.datei === maske)
      .map((b) => [b.code, b.zeile, b.wert]);
    expect(befunde).toEqual([
      [KONSISTENZ_BEFUNDE.maskeListeDateiUnbekannt, 7, 'Gibt Es Nicht'],
      [KONSISTENZ_BEFUNDE.maskeListeBeziehungMehrdeutig, 8, 'Doppelt Liste'],
      [KONSISTENZ_BEFUNDE.maskeListeBeziehungFehlt, 9, 'Ohne Liste'],
      [KONSISTENZ_BEFUNDE.maskeListeNichtBearbeitbar, 10, 'Lesend'],
    ]);
  });
});

// 4T-002308 (Epic 3E-000263, S4; AK3): Die Auskunft trägt die Erlaubnis-Menge
// der Positions-Tabelle aus derselben Auflösung wie die Übersicht; der
// Anmeldename kommt über die Naht der Herkunft.
describe('database:positionsliste: Feld rechte (4T-002308, AK3)', () => {
  it('trägt die Rechte der Positions-Tabelle nach der eigenen Rolle (4T-002308)', async () => {
    const { wurzel, sicht, library } = bestand();
    const steckbrief = lege(wurzel, 'Datenbank.md', [
      '---',
      'db-database:',
      '  roles:',
      '    ausleihe:',
      '      Loans: [create, update]',
      '  users:',
      '    mstumm: ausleihe',
      '---',
      '',
    ]);
    sicht.dbKindsPerFile.set(steckbrief, ['database']);
    const frage = (benutzer) =>
      liesPositionsListe({
        fsp: fs.promises,
        wurzel,
        sicht,
        datei: 'Ausleihen',
        kopf: { tabelle: library, kennung: 'r-1' },
        herkunft: () => ({ benutzer, rechner: 'pc' }),
      });
    const zugeordnet = await frage('mstumm');
    expect(zugeordnet.istListe).toBe(true);
    expect(zugeordnet.rechte).toEqual({ create: true, update: true, delete: false, define: false });
    // Ohne Zuordnung und ohne Vorgabe-Rolle alles erlaubt (4T-002308).
    expect((await frage('MStumm')).rechte).toEqual({
      create: true,
      update: true,
      delete: true,
      define: true,
    });
  });
});
