// 4T-001945 (Epic 3E-000257, Bauplan B2, B4): Der Kanal `database:verwendung`
// und seine Brücke — der Verwendungsnachweis auf Tabellen- und Datensatz-Ebene,
// am echten Handler über die echte Registrier-Funktion und am echten
// Dateisystem im Temp-Ordner (Muster `db-konsistenz-kanal.test.js`).
//
// Gemessen werden die Stufen der Absperrung samt Aus-Zustand, der Anstoß des
// Index, beide Ebenen über Namen und Pfad und die Kanal-Liste.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verwendung-kanal-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, zeilen) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
  return pfad;
}

// «Kunden» und «Bestellung» mit einer Verweis-Spalte auf «Kunden»; eine Bestellung
// zeigt über die Kennung, eine über das Kürzel auf «Alpha», dazu die Maske der
// Kunden.
function bestand(wurzel) {
  const kunden = lege(wurzel, 'Kunden.md', [
    '---',
    'db-table:',
    '  fields:',
    '    - name: kuerzel',
    '    - name: name',
    '  key: kuerzel',
    '  display: name',
    '  lastId: 2',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| ALP',
    '| Alpha',
    '|- id="r-00002"',
    '| BET',
    '| Beta',
    '```',
    '',
  ]);
  const bestellung = lege(wurzel, 'Bestellung.md', [
    '---',
    'db-table:',
    '  fields:',
    '    - name: titel',
    '    - name: kunde',
    '      type: record',
    '      options:',
    '        table: Kunden',
    '  display: titel',
    '  lastId: 2',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Erste',
    '| r-00001',
    '|- id="r-00002"',
    '| Zweite',
    '| ALP',
    '```',
    '',
  ]);
  const maske = lege(wurzel, 'Kunden Form.md', ['---', 'db-form:', '  table: Kunden', '---', '']);
  return { kunden, bestellung, maske };
}

function sichtFuer({ kunden, bestellung, maske }) {
  return {
    dbKindsPerFile: new Map([
      [kunden, ['table']],
      [bestellung, ['table']],
      [maske, ['form']],
    ]),
  };
}

function registriere({ datenbankAktiv = () => true, ohneTor = false, sicht = null } = {}) {
  const kanaele = new Map();
  const anstoesse = [];
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: (...args) => anstoesse.push(args),
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
  return { kanaele, anstoesse };
}

function kanal(optionen) {
  return registriere(optionen).kanaele.get('database:verwendung');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

// Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal.
async function gestaltOhneZugriff() {
  return registriere().kanaele.get('database:changeLog')({}, undefined);
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:verwendung: Registrierung und Brücke (4T-001945, B2)', () => {
  it('registriert den Kanal neben den zehn bestehenden', () => {
    expect([...registriere().kanaele.keys()].sort()).toEqual([
      'database:auftrag',
      'database:changeLog',
      'database:datensaetze',
      'database:datensatz',
      'database:konsistenz',
      'database:maskeSchreiben',
      'database:neuanlage',
      'database:overview',
      'database:sperre',
      'database:table',
      'database:verwendung',
    ]);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { tabelle: 'Kunden', kennung: null };
    expect(await bruecke.databaseVerwendung(params)).toEqual({ name: 'database:verwendung' });
    expect(invoke).toHaveBeenCalledWith('database:verwendung', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- Beide Ebenen ------------------------------------------------------------------------

describe('database:verwendung: Tabellen- und Datensatz-Ebene (AK1, AK2)', () => {
  it('liefert mit kennung: null die verweisenden Tabellen und die Masken-Dateien', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const handler = kanal({ sicht: sichtFuer(dateien) });
    for (const angabe of ['Kunden', 'kunden', dateien.kunden, 'Kunden.md']) {
      const antwort = await handler(ereignis(wurzel), { tabelle: angabe, kennung: null });
      expect(antwort, angabe).toEqual({
        status: 'ready',
        tabelle: 'Kunden',
        pfad: dateien.kunden,
        tabellen: [{ name: 'Bestellung', pfad: dateien.bestellung, felder: ['kunde'] }],
        masken: [{ pfad: dateien.maske }],
      });
    }
    const leer = await handler(ereignis(wurzel), { tabelle: 'Bestellung', kennung: null });
    expect([leer.tabellen, leer.masken]).toEqual([[], []]);
  });

  it('liefert mit Kennung die verweisenden Datensätze, auch über den Schlüssel-Wert', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const handler = kanal({ sicht: sichtFuer(dateien) });
    const antwort = await handler(ereignis(wurzel), { tabelle: 'Kunden', kennung: 'r-00001' });
    expect(antwort.status).toBe('ready');
    expect(antwort.datensaetze).toEqual([
      {
        tabelle: 'Bestellung',
        pfad: dateien.bestellung,
        feld: 'kunde',
        kennung: 'r-00001',
        anzeige: 'Erste',
      },
      {
        tabelle: 'Bestellung',
        pfad: dateien.bestellung,
        feld: 'kunde',
        kennung: 'r-00002',
        anzeige: 'Zweite',
      },
    ]);
    expect(structuredClone(antwort)).toEqual(antwort);
    const beta = await handler(ereignis(wurzel), { tabelle: dateien.kunden, kennung: 'r-2' });
    expect(beta.datensaetze).toEqual([]);
  });

  it('meldet eine unbekannte Tabelle und einen unbekannten Datensatz als Fehlerlage', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const handler = kanal({ sicht: sichtFuer(dateien) });
    expect(await handler(ereignis(wurzel), { tabelle: 'Lieferanten', kennung: null })).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
    expect(await handler(ereignis(wurzel), { tabelle: 'Kunden', kennung: 'r-00009' })).toEqual({
      status: 'error',
      code: LAGEN.datensatzUnbekannt,
    });
  });

  it('stößt den Index an wie der Konsistenz-Kanal', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const { kanaele, anstoesse } = registriere({ sicht: sichtFuer(dateien) });
    await kanaele.get('database:verwendung')(ereignis(wurzel), {
      tabelle: 'Kunden',
      kennung: null,
    });
    expect(anstoesse).toEqual([[null, '1:database', wurzel]]);
  });
});

// --- Fail-closed (B2) --------------------------------------------------------------------

describe('database:verwendung: fail-closed (B2)', () => {
  it('weist ungültige Parameter, fehlenden Bereich und fehlende Sicht ohne Dateizugriff ab', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const ohne = await gestaltOhneZugriff();
    const lesen = vi.spyOn(fs.promises, 'readFile');
    try {
      const handler = kanal({ sicht: sichtFuer(dateien) });
      // `kennung` muss ausdrücklich dastehen: fehlend ist nicht «Tabellen-Ebene».
      for (const params of [
        undefined,
        null,
        {},
        [],
        { tabelle: '', kennung: null },
        { tabelle: 5, kennung: null },
        { tabelle: 'Kunden' },
        { tabelle: 'Kunden', kennung: '' },
        { tabelle: 'Kunden', kennung: 7 },
      ]) {
        expect(await handler(ereignis(wurzel), params), JSON.stringify(params)).toEqual(ohne);
      }
      expect(await handler(ereignis(null), { tabelle: 'Kunden', kennung: null })).toEqual(ohne);
      expect(await kanal()(ereignis(wurzel), { tabelle: 'Kunden', kennung: null })).toEqual(ohne);
      expect(lesen).not.toHaveBeenCalled();
    } finally {
      lesen.mockRestore();
    }
  });

  it('antwortet im Aus-Zustand der Erweiterung und ohne Tor ohne Zugriff', async () => {
    const wurzel = neueWurzel();
    const dateien = bestand(wurzel);
    const ohne = await gestaltOhneZugriff();
    const aus = kanal({ sicht: sichtFuer(dateien), datenbankAktiv: () => false });
    expect(await aus(ereignis(wurzel), { tabelle: 'Kunden', kennung: null })).toEqual(ohne);
    const ohneTor = kanal({ sicht: sichtFuer(dateien), ohneTor: true });
    expect(await ohneTor(ereignis(wurzel), { tabelle: 'Kunden', kennung: 'r-00001' })).toEqual(
      ohne,
    );
  });

  it('prüft die Lage am aufgelösten Pfad: eine Tabelle außerhalb des Bereichs wird abgewiesen', async () => {
    const wurzel = neueWurzel();
    const fremd = neueWurzel();
    const dateien = bestand(fremd);
    const handler = kanal({ sicht: sichtFuer(dateien) });
    const ohne = await gestaltOhneZugriff();
    expect(await handler(ereignis(wurzel), { tabelle: 'Kunden', kennung: null })).toEqual(ohne);
    expect(await handler(ereignis(wurzel), { tabelle: dateien.kunden, kennung: 'r-1' })).toEqual(
      ohne,
    );
  });
});
