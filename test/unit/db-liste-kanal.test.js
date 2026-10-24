// 4T-002249 (Epic 3E-000262, S1, S2; AK1): Der Kanal `database:liste` und seine
// Brücke — die Auskunft über eine Listen-Maske: Angaben, Quell-Tabelle, Feld je
// Spalte und die Maske, die ein Klick öffnet.
//
// 4T-002250 (S3, AK3): dazu `nichtAenderbar`, die Änderbarkeit je Zeile nach der
// Bedingung `editable` der Definition, für die genannten Kennungen.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion und am
// echten Dateisystem im Temp-Ordner (Muster `db-datensatz-kanal.test.js`): die
// Feld-Zuordnung je Spaltenart (Feld, gerechnet, Pfad, Aggregat, eigene
// Angabe), die Quell-Tabelle aus der Herkunft und aus der Abfrage, die Maske
// bekannt, fremd und unbekannt, die Datei ohne Listen-Maske, die Fehlerlagen
// und die Stufen der Absperrung samt Aus-Zustand der Erweiterung.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { feldDerSpalte, liesListe } from '../../src/main/database/listen-auskunft.js';

// --- Aufbau ------------------------------------------------------------------------------

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

function neueWurzel() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-liste-kanal-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Zwei Tabellen mit Beziehung: `Kunden` trägt das Verweis-Feld `firma` auf
// `Lieferanten`; dazu je Tabelle Masken-Dateien.
const KUNDEN = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '    - name: Ort',
  '    - name: anzahl',
  '      type: number',
  '    - name: firma',
  '      type: record',
  '      options:',
  '        table: Lieferanten',
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '| 3',
  '| Acme',
  '```',
  '',
].join('\n');

const LIEFERANTEN = '---\ndb-table:\n  fields:\n    - name: firma\n---\n';

function maskenDatei(tabelle, titel) {
  return ['---', 'db-form:', `  table: ${tabelle}`, '---', '', `# ${titel}`, ''].join('\n');
}

// Eine Abfrage-Datei mit dem Behälter `db-query` und den gegebenen Zeilen darin.
function abfrageDatei(angaben, abfrage = 'TABLE RECORDS name FROM "Kunden"') {
  const kopf = angaben === null ? [] : ['---', 'db-query:', ...angaben.map((z) => `  ${z}`), '---'];
  return [
    ...kopf,
    '',
    'Beschreibung über der Liste.',
    '',
    '```perspective-query',
    abfrage,
    '```',
    '',
  ].join('\n');
}

function bestand() {
  const wurzel = neueWurzel();
  const kunden = lege(wurzel, 'Kunden.md', KUNDEN);
  const lieferanten = lege(wurzel, 'Lieferanten.md', LIEFERANTEN);
  const lang = lege(wurzel, 'Kunden Form.md', maskenDatei('Kunden', 'Lang'));
  const kurz = lege(wurzel, 'Kunden Kurz.md', maskenDatei('Kunden', 'Kurz'));
  const fremd = lege(wurzel, 'Lieferanten Form.md', maskenDatei('Lieferanten', 'Fremd'));
  const sicht = {
    dbKindsPerFile: new Map([
      [kunden, ['table']],
      [lieferanten, ['table']],
      [lang, ['form']],
      [kurz, ['form']],
      [fremd, ['form']],
    ]),
  };
  return { wurzel, sicht, kunden, lieferanten, lang, kurz, fremd };
}

// Der echte Handler. Tor, Sicht und Bereichs-Wurzel sind einstellbar; die
// Wurzel kommt aus dem Ereignis.
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

function kanal(optionen) {
  return registriere(optionen).get('database:liste');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

const KEINE_LISTE = { istListe: false };

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:liste: Registrierung und Brücke (4T-002249, S1)', () => {
  it('registriert den Kanal', () => {
    expect(registriere().has('database:liste')).toBe(true);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = {
      pfad: '/raum/Liste.md',
      query: 'TABLE RECORDS name',
      spalten: [],
      tabelle: null,
    };
    expect(await bruecke.databaseListe(params)).toEqual({ name: 'database:liste' });
    expect(invoke).toHaveBeenCalledWith('database:liste', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- AK1: Feld-Zuordnung je Spaltenart (S2) ----------------------------------------------

describe('database:liste: Feld-Zuordnung je Spalte (4T-002249, S2, AK1)', () => {
  it('ordnet eine Spalte nur dann einem Feld zu, wenn sie genau ein Feld nennt', async () => {
    const { wurzel, sicht, kunden } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const spalten = [
      'name', // Feld
      ' ort ', // Feld, andere Schreibung und Leerraum
      'firma', // Verweis-Feld ist ein Feld
      'anzahl * 2', // gerechnet
      'firma.firma', // Pfad über das Verweis-Feld
      'sum(anzahl)', // Aggregat
      'upper(name)', // Funktion über ein Feld
      'record.id', // eigene Angabe des Datensatzes
      'file.name', // Angabe der Tabellen-Datei
      'this.name', // Angabe der Abfrage-Datei
      'gibtsnicht', // kein Feld der Tabelle
      '', // leer
    ];
    const antwort = await kanal({ sicht })(ereignis(wurzel), {
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten,
      tabelle: kunden,
    });
    expect(antwort.istListe).toBe(true);
    expect(antwort.spalten).toEqual([
      { index: 0, feld: 'name' },
      { index: 1, feld: 'Ort' },
      { index: 2, feld: 'firma' },
      { index: 3, feld: null },
      { index: 4, feld: null },
      { index: 5, feld: null },
      { index: 6, feld: null },
      { index: 7, feld: null },
      { index: 8, feld: null },
      { index: 9, feld: null },
      { index: 10, feld: null },
      { index: 11, feld: null },
    ]);
    expect(antwort.tabelle).toEqual({ path: kunden, name: 'Kunden' });
    expect(antwort.angaben).toEqual({ editable: true, form: null, allow: ['update'] });
    expect(antwort.maske).toBeNull();
    expect(antwort.hinweise).toEqual([]);
  });

  it('lässt ein Feld mit Punkt im Namen vor einem Pfad gelten', () => {
    const fields = [{ name: 'firma' }, { name: 'firma.kurz' }];
    expect(feldDerSpalte('firma.kurz', fields)).toBe('firma.kurz');
    expect(feldDerSpalte('Firma.Kurz', fields)).toBe('firma.kurz');
    expect(feldDerSpalte('firma.lang', fields)).toBeNull();
    expect(feldDerSpalte(42, fields)).toBeNull();
  });
});

// --- AK1: Quell-Tabelle --------------------------------------------------------------------

describe('database:liste: Quell-Tabelle aus Herkunft oder Abfrage (4T-002249, AK1)', () => {
  it('bestimmt ohne Herkunft die Tabelle aus der Abfrage, beim Namen und als Pfad', async () => {
    const { wurzel, sicht, kunden } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const lesen = kanal({ sicht });
    for (const query of [
      'TABLE RECORDS name FROM "Kunden"',
      'TABLE RECORDS name FROM "kunden" WHERE anzahl > 1',
      'TABLE RECORDS name FROM "Kunden.md"',
    ]) {
      const antwort = await lesen(ereignis(wurzel), {
        pfad,
        query,
        spalten: ['name'],
        tabelle: null,
      });
      expect(antwort.istListe, query).toBe(true);
      expect(antwort.tabelle.path, query).toBe(kunden);
    }
  });

  it('ist keine Liste, wenn die Abfrage keine oder mehr als eine Tabelle nennt', async () => {
    const { wurzel, sicht } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const lesen = kanal({ sicht });
    for (const query of [
      'TABLE RECORDS name FROM "Kunden" OR "Lieferanten"',
      'TABLE RECORDS name FROM "Gibt Es Nicht"',
      'TABLE name FROM #tag',
      'TABLE RECORDS name FROM',
      '',
    ]) {
      const antwort = await lesen(ereignis(wurzel), {
        pfad,
        query,
        spalten: ['name'],
        tabelle: null,
      });
      expect(antwort, query).toEqual(KEINE_LISTE);
    }
  });

  it('lässt die genannte Herkunft vor der Abfrage gelten', async () => {
    const { wurzel, sicht, lieferanten } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const antwort = await kanal({ sicht })(ereignis(wurzel), {
      pfad,
      query: 'TABLE RECORDS firma FROM "Kunden" OR "Lieferanten"',
      spalten: ['firma'],
      tabelle: lieferanten,
    });
    expect(antwort.tabelle).toEqual({ path: lieferanten, name: 'Lieferanten' });
    expect(antwort.spalten).toEqual([{ index: 0, feld: 'firma' }]);
  });
});

// --- AK1, AK4: die Maske, die ein Klick öffnet ----------------------------------------------

describe('database:liste: Maske nach form (4T-002249, F1 A, AK4)', () => {
  async function mitForm(form) {
    const b = bestand();
    const pfad = lege(b.wurzel, 'Liste.md', abfrageDatei(['editable: true', `form: ${form}`]));
    const antwort = await kanal({ sicht: b.sicht })(ereignis(b.wurzel), {
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: null,
    });
    return { b, antwort };
  }

  it('liefert den Pfad einer Masken-Datei derselben Tabelle', async () => {
    const { b, antwort } = await mitForm('Kunden Kurz');
    expect(antwort.istListe).toBe(true);
    expect(antwort.angaben.form).toBe('Kunden Kurz');
    expect(antwort.maske).toBe(b.kurz);
    expect(antwort.hinweise).toEqual([]);
  });

  it('meldet die Masken-Datei einer anderen Tabelle und bleibt bei der Standard-Maske', async () => {
    const { antwort } = await mitForm('Lieferanten Form');
    expect(antwort.istListe).toBe(true);
    expect(antwort.maske).toBeNull();
    expect(antwort.hinweise).toEqual([
      {
        code: 'listFormDateiFremd',
        index: -1,
        name: 'Lieferanten Form',
        key: 'form',
        expected: 'Lieferanten',
      },
    ]);
  });

  it('meldet eine unbekannte Masken-Datei und bleibt bei der Standard-Maske', async () => {
    const { antwort } = await mitForm('Gibt Es Nicht');
    expect(antwort.maske).toBeNull();
    expect(antwort.hinweise.map((h) => [h.code, h.name])).toEqual([
      ['listFormDateiUnbekannt', 'Gibt Es Nicht'],
    ]);
  });

  // 4T-002254: Die Übersicht zeigt den Hinweis «fremde Maske» unter den
  // Fehlerlagen der Abfrage-Datei, wie den Fall «unbekannt»; eine Maske derselben
  // Tabelle und eine Datei ohne Listen-Maske bleiben ohne ihn.
  it('database:overview meldet die fremde Maske an der Abfrage-Datei', async () => {
    const b = bestand();
    const fremd = lege(
      b.wurzel,
      'Fremd.md',
      abfrageDatei(['editable: true', 'form: Lieferanten Form']),
    );
    const eigen = lege(b.wurzel, 'Eigen.md', abfrageDatei(['editable: true', 'form: Kunden Kurz']));
    const lesend = lege(b.wurzel, 'Lesend.md', abfrageDatei(['form: Lieferanten Form']));
    for (const p of [fremd, eigen, lesend]) b.sicht.dbKindsPerFile.set(p, ['query']);
    const ueberblick = await registriere({ sicht: b.sicht }).get('database:overview')(
      ereignis(b.wurzel),
      { filePath: fremd },
    );
    const codes = (name) =>
      ueberblick.abfragen.find((a) => a.name === name).hints.map((h) => [h.code, h.expected]);
    expect(codes('Fremd')).toEqual([['listFormDateiFremd', 'Lieferanten']]);
    expect(codes('Eigen')).toEqual([]);
    expect(codes('Lesend')).toEqual([['listOhneEditable', null]]);
  });
});

// --- AK1: Datei ohne Listen-Maske und Angaben ------------------------------------------------

describe('database:liste: Datei ohne Listen-Maske (4T-002249, AK1)', () => {
  it('ist keine Liste ohne Behälter, ohne editable: true und mit unlesbarer Datei', async () => {
    const { wurzel, sicht } = bestand();
    const lesen = kanal({ sicht });
    const params = (pfad) => ({
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: null,
    });
    const ohneBehaelter = lege(wurzel, 'Ohne.md', abfrageDatei(null));
    const ohneEditable = lege(wurzel, 'Gewöhnlich.md', abfrageDatei(['form: Kunden Kurz']));
    const falsch = lege(wurzel, 'Falsch.md', abfrageDatei(['editable: ja']));
    const fehlt = path.join(wurzel, 'Fehlt.md');
    for (const pfad of [ohneBehaelter, ohneEditable, falsch, fehlt]) {
      expect(await lesen(ereignis(wurzel), params(pfad)), pfad).toEqual(KEINE_LISTE);
    }
  });

  it('reicht die Angaben samt ihrer Hinweise weiter', async () => {
    const { wurzel, sicht } = bestand();
    const pfad = lege(
      wurzel,
      'Liste.md',
      abfrageDatei(['editable: true', 'allow: [create, update, delete]', 'table: Kunden']),
    );
    const antwort = await kanal({ sicht })(ereignis(wurzel), {
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: null,
    });
    expect(antwort.angaben).toEqual({
      editable: true,
      form: null,
      allow: ['create', 'update', 'delete'],
    });
    expect(antwort.hinweise.map((h) => [h.code, h.name])).toEqual([
      ['listAngabeUnbekannt', 'table'],
    ]);
  });
});

// --- 4T-002250 (S3, AK3): Änderbarkeit je Zeile -------------------------------------------

// «Belege» mit der Bedingung `editable`: Ein gebuchter Beleg ist nicht änderbar.
const BELEGE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: titel',
  '    - name: status',
  '  editable:',
  '    rule: status != "gebucht"',
  '  lastId: 3',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Miete',
  '| offen',
  '|- id="r-00002"',
  '| Strom',
  '| gebucht',
  '|- id="r-00003"',
  '| Wasser',
  '|',
  '```',
  '',
].join('\n');

describe('database:liste: Änderbarkeit je Zeile (4T-002250, S3, AK3)', () => {
  function belegBestand(text = BELEGE) {
    const wurzel = neueWurzel();
    const belege = lege(wurzel, 'Belege.md', text);
    const liste = lege(
      wurzel,
      'Liste.md',
      abfrageDatei(['editable: true'], 'TABLE RECORDS titel, status FROM "Belege"'),
    );
    const sicht = { dbKindsPerFile: new Map([[belege, ['table']]]) };
    return { wurzel, sicht, belege, liste };
  }

  function frage(b, kennungen) {
    return kanal({ sicht: b.sicht })(ereignis(b.wurzel), {
      pfad: b.liste,
      query: 'TABLE RECORDS titel, status FROM "Belege"',
      spalten: ['titel', 'status'],
      tabelle: b.belege,
      ...(kennungen === undefined ? {} : { kennungen }),
    });
  }

  it('nennt die Zeilen, deren Datensatz die Bedingung nicht erfüllt', async () => {
    const antwort = await frage(belegBestand(), ['r-00001', 'r-00002', 'r-00003']);
    expect(antwort.istListe).toBe(true);
    expect(antwort.nichtAenderbar).toEqual(['r-00002']);
  });

  it('wertet nur die genannten Kennungen aus, ohne Doppel, und ohne Kennungen keine', async () => {
    const b = belegBestand();
    expect((await frage(b, ['r-00001', 'r-00002', 'r-00002'])).nichtAenderbar).toEqual(['r-00002']);
    expect((await frage(b, ['r-00001'])).nichtAenderbar).toEqual([]);
    expect((await frage(b, [])).nichtAenderbar).toEqual([]);
    expect((await frage(b)).nichtAenderbar).toEqual([]);
  });

  it('gibt eine Kennung ohne eindeutigen Datensatz als nicht änderbar aus (fail-closed)', async () => {
    const antwort = await frage(belegBestand(), ['r-00001', 'r-00099', 'keine']);
    expect(antwort.nichtAenderbar).toEqual(['r-00099', 'keine']);
  });

  it('ist ohne Bedingung leer, auch für eine unbekannte Kennung', async () => {
    const ohne = BELEGE.replace('  editable:\n    rule: status != "gebucht"\n', '');
    const b = belegBestand(ohne);
    const antwort = await frage(b, ['r-00001', 'r-00002', 'r-00099']);
    expect(antwort.istListe).toBe(true);
    expect(antwort.nichtAenderbar).toEqual([]);
  });

  it('gibt jeder Liste ohne Bedingung eine leere Angabe mit', async () => {
    const { wurzel, sicht, kunden } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const antwort = await kanal({ sicht })(ereignis(wurzel), {
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: kunden,
      kennungen: ['r-00001'],
    });
    expect(antwort.nichtAenderbar).toEqual([]);
  });

  it('weist Kennungen in falscher Form ohne Zugriff ab', async () => {
    const b = belegBestand();
    for (const kennungen of ['r-00001', [42], [''], null]) {
      expect(await frage(b, kennungen), JSON.stringify(kennungen)).toEqual(KEINE_LISTE);
    }
  });
});

// --- Absperrung und Aus-Zustand ----------------------------------------------------------

describe('database:liste: Form, Tor und Bereich (4T-002249, S1)', () => {
  it('weist eine Anfrage in falscher Form ohne Zugriff ab', async () => {
    const { wurzel, sicht } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const gut = {
      pfad,
      query: 'TABLE RECORDS name FROM "Kunden"',
      spalten: ['name'],
      tabelle: null,
    };
    const lesen = kanal({ sicht });
    expect((await lesen(ereignis(wurzel), gut)).istListe).toBe(true);
    for (const params of [
      undefined,
      null,
      'Liste.md',
      { ...gut, pfad: '' },
      { ...gut, pfad: 42 },
      { ...gut, query: null },
      { ...gut, spalten: 'name' },
      { ...gut, spalten: [42] },
      { ...gut, tabelle: '' },
      { ...gut, tabelle: 42 },
    ]) {
      expect(await lesen(ereignis(wurzel), params), JSON.stringify(params)).toEqual(KEINE_LISTE);
    }
  });

  it('weist ab ohne Bereich, außerhalb des Bereichs, ohne Markdown-Endung und ohne Sicht', async () => {
    const { wurzel, sicht, kunden } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const fremderOrdner = neueWurzel();
    const draussen = lege(fremderOrdner, 'Liste.md', abfrageDatei(['editable: true']));
    const text = lege(wurzel, 'Liste.txt', abfrageDatei(['editable: true']));
    const params = { pfad, query: 'TABLE RECORDS name FROM "Kunden"', spalten: ['name'] };
    const lesen = kanal({ sicht });
    expect(await lesen({ sender: { id: 1 } }, params)).toEqual(KEINE_LISTE);
    expect(await lesen(ereignis(wurzel), { ...params, pfad: draussen })).toEqual(KEINE_LISTE);
    expect(await lesen(ereignis(wurzel), { ...params, pfad: text })).toEqual(KEINE_LISTE);
    const fremdeTabelle = lege(fremderOrdner, 'Kunden.md', KUNDEN);
    expect(await lesen(ereignis(wurzel), { ...params, tabelle: fremdeTabelle })).toEqual(
      KEINE_LISTE,
    );
    expect(await kanal()(ereignis(wurzel), { ...params, tabelle: kunden })).toEqual(KEINE_LISTE);
  });

  it('liefert im Aus-Zustand der Erweiterung und ohne Tor keine Liste', async () => {
    const { wurzel, sicht } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const params = { pfad, query: 'TABLE RECORDS name FROM "Kunden"', spalten: ['name'] };
    let aktiv = false;
    const lesen = kanal({ sicht, datenbankAktiv: () => aktiv });
    expect(await lesen(ereignis(wurzel), params)).toEqual(KEINE_LISTE);
    expect(await kanal({ sicht, ohneTor: true })(ereignis(wurzel), params)).toEqual(KEINE_LISTE);
    aktiv = true;
    expect((await lesen(ereignis(wurzel), params)).istListe).toBe(true);
  });
});

// 4T-002308 (Epic 3E-000263, S4; AK3): Die Auskunft trägt die Erlaubnis-Menge
// der Quell-Tabelle aus derselben Auflösung wie die Übersicht.
describe('database:liste: Feld rechte (4T-002308, AK3)', () => {
  it('trägt die Rechte der Quell-Tabelle nach der eigenen Rolle (4T-002308)', async () => {
    const { wurzel, sicht } = bestand();
    const pfad = lege(wurzel, 'Liste.md', abfrageDatei(['editable: true']));
    const frage = { pfad, query: 'TABLE RECORDS name FROM "Kunden"', spalten: ['name'] };
    const ohneRollen = await kanal({ sicht })(ereignis(wurzel), { ...frage, tabelle: null });
    expect(ohneRollen.rechte).toEqual({ create: true, update: true, delete: true, define: true });
    const zeilen = ['---', 'db-database:', '  roles:', '    leser:', '      Lieferanten: all'];
    zeilen.push('  users:', '    mstumm: leser', '---', '');
    sicht.dbKindsPerFile.set(lege(wurzel, 'Datenbank.md', zeilen.join('\n')), ['database']);
    const antwort = await liesListe({
      fsp: fs.promises,
      wurzel,
      sicht,
      ...frage,
      tabelle: null,
      herkunft: () => ({ benutzer: 'mstumm', rechner: 'pc' }),
    });
    expect(antwort.istListe).toBe(true);
    expect(antwort.rechte).toEqual({ create: false, update: false, delete: false, define: false });
    // 4T-002311: dazu die geltende Rolle für den Hinweis-Text; ohne Rollen keine.
    expect([antwort.rolle, ohneRollen.rolle]).toEqual(['leser', null]);
  });
});

// --- 4T-002312: gesperrte Felder je Zeile ------------------------------------------------

describe('database:liste: gesperrte Felder je Zeile (4T-002312, AK1)', () => {
  // `titel` fest gesperrt, `betrag` nur, solange der Beleg nicht gebucht ist; die
  // Tabelle selbst sperrt den Status «zu».
  const FELD_BELEGE = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: titel',
    '      editable: false',
    '    - name: status',
    '    - name: betrag',
    '      editable: status != "gebucht"',
    '  editable: status != "zu"',
    '  lastId: 3',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Miete',
    '| offen',
    '| 10',
    '|- id="r-00002"',
    '| Strom',
    '| gebucht',
    '| 20',
    '|- id="r-00003"',
    '| Wasser',
    '| zu',
    '| 30',
    '```',
    '',
  ].join('\n');

  function frage(text, kennungen) {
    const wurzel = neueWurzel();
    const belege = lege(wurzel, 'Belege.md', text);
    const liste = lege(
      wurzel,
      'Liste.md',
      abfrageDatei(['editable: true'], 'TABLE RECORDS titel, betrag FROM "Belege"'),
    );
    const sicht = { dbKindsPerFile: new Map([[belege, ['table']]]) };
    return kanal({ sicht })(ereignis(wurzel), {
      pfad: liste,
      query: 'TABLE RECORDS titel, betrag FROM "Belege"',
      spalten: ['titel', 'betrag'],
      tabelle: belege,
      kennungen,
    });
  }

  it('4T-002312: nennt je änderbarer Zeile die gesperrten Felder, eine gesperrte Zeile nicht', async () => {
    const antwort = await frage(FELD_BELEGE, ['r-00001', 'r-00002', 'r-00003']);
    expect(antwort.istListe).toBe(true);
    expect(antwort.nichtAenderbar).toEqual(['r-00003']);
    expect(antwort.gesperrteFelder).toEqual({
      'r-00001': ['titel'],
      'r-00002': ['titel', 'betrag'],
    });
  });

  it('4T-002312: Feld-Bedingungen allein lesen den Bestand, ohne Feld-Bedingung bleibt es leer', async () => {
    const nurFeld = FELD_BELEGE.replace('  editable: status != "zu"\n', '');
    const antwort = await frage(nurFeld, ['r-00003', 'r-00002']);
    expect(antwort.nichtAenderbar).toEqual([]);
    expect(antwort.gesperrteFelder).toEqual({
      'r-00003': ['titel'],
      'r-00002': ['titel', 'betrag'],
    });
    const ohne = await frage(BELEGE, ['r-00001', 'r-00002']);
    expect(ohne.gesperrteFelder).toEqual({});
  });
});
