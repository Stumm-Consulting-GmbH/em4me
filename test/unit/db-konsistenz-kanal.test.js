// 4T-001944 (Epic 3E-000257, Bauplan B3, B6; AK1, AK7): Der Kanal
// `database:konsistenz` und seine Brücke — die Konsistenz-Prüfung einer oder
// aller Tabellen, am echten Handler über die echte Registrier-Funktion und am
// echten Dateisystem im Temp-Ordner (Muster `db-datensaetze-kanal.test.js`).
//
// Gemessen werden die Stufen der Absperrung samt Aus-Zustand, der Anstoß des
// Index, die Prüfung einer Tabelle über Namen und Pfad, die Prüfung aller
// Tabellen und die Kanal-Liste.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { KONSISTENZ_BEFUNDE } from '../../src/main/database/konsistenz-pruefung.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-konsistenz-kanal-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, zeilen) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, zeilen.join('\n'), 'utf8');
  return pfad;
}

// Zwei Tabellen: «Kunden» mit einer Schlüssel-Dublette, «Bestellung» mit einem
// Verweis ins Leere.
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
    '| ALP',
    '| Alpha zwei',
    '```',
    '',
  ]);
  const bestellung = lege(wurzel, 'Bestellung.md', [
    '---',
    'db-table:',
    '  fields:',
    '    - name: kunde',
    '      type: record',
    '      options:',
    '        table: Kunden',
    '  lastId: 1',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| r-00007',
    '```',
    '',
  ]);
  return { kunden, bestellung };
}

function sichtFuer(...kopfDateien) {
  return { dbKindsPerFile: new Map(kopfDateien.map((p) => [p, ['table']])) };
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
  return registriere(optionen).kanaele.get('database:konsistenz');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

// Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal.
async function gestaltOhneZugriff() {
  return registriere().kanaele.get('database:changeLog')({}, undefined);
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:konsistenz: Registrierung und Brücke (4T-001944, B3)', () => {
  it('registriert den Kanal neben den neun bestehenden', () => {
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
      // 4T-001945 (Epic 3E-000257): der Verwendungsnachweis.
      'database:verwendung',
    ]);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { tabelle: null };
    expect(await bruecke.databaseKonsistenz(params)).toEqual({ name: 'database:konsistenz' });
    expect(invoke).toHaveBeenCalledWith('database:konsistenz', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- Eine und alle Tabellen (AK1) --------------------------------------------------------

describe('database:konsistenz: eine und alle Tabellen (AK1)', () => {
  it('prüft mit tabelle: null alle Tabellen der Sicht', async () => {
    const wurzel = neueWurzel();
    const { kunden, bestellung } = bestand(wurzel);
    const antwort = await kanal({ sicht: sichtFuer(kunden, bestellung) })(ereignis(wurzel), {
      tabelle: null,
    });
    expect(antwort.status).toBe('ready');
    expect(antwort.tabellen.map((t) => [t.name, t.datensaetze, t.befunde])).toEqual([
      ['Bestellung', 1, 1],
      ['Kunden', 2, 2],
    ]);
    expect(antwort.befunde.map((b) => b.code)).toEqual([
      KONSISTENZ_BEFUNDE.verweisZielFehlt,
      KONSISTENZ_BEFUNDE.schluesselDoppelt,
      KONSISTENZ_BEFUNDE.schluesselDoppelt,
    ]);
    // Die Antwort übersteht den Struktur-Klon der Prozess-Grenze unverändert.
    expect(structuredClone(antwort)).toEqual(antwort);
  });

  it('prüft eine Tabelle über Namen, absoluten und relativen Pfad', async () => {
    const wurzel = neueWurzel();
    const { kunden, bestellung } = bestand(wurzel);
    const handler = kanal({ sicht: sichtFuer(kunden, bestellung) });
    for (const angabe of ['Kunden', 'kunden', kunden, 'Kunden.md']) {
      const antwort = await handler(ereignis(wurzel), { tabelle: angabe });
      expect(antwort.status, angabe).toBe('ready');
      expect(
        antwort.tabellen.map((t) => t.pfad),
        angabe,
      ).toEqual([kunden]);
      expect(antwort.befunde, angabe).toHaveLength(2);
    }
  });

  it('meldet eine unbekannte Tabelle als Fehlerlage', async () => {
    const wurzel = neueWurzel();
    const { kunden } = bestand(wurzel);
    expect(
      await kanal({ sicht: sichtFuer(kunden) })(ereignis(wurzel), { tabelle: 'Lieferanten' }),
    ).toEqual({ status: 'error', code: LAGEN.tabelleUnbekannt });
  });

  it('stößt den Index an wie der Auftrags-Kanal', async () => {
    const wurzel = neueWurzel();
    const { kunden } = bestand(wurzel);
    const { kanaele, anstoesse } = registriere({ sicht: sichtFuer(kunden) });
    await kanaele.get('database:konsistenz')(ereignis(wurzel), { tabelle: null });
    expect(anstoesse).toEqual([[null, '1:database', wurzel]]);
  });
});

// --- Fail-closed (B3, AK7) ---------------------------------------------------------------

describe('database:konsistenz: fail-closed (B3, AK7)', () => {
  it('weist ungültige Parameter, fehlenden Bereich und fehlende Sicht ohne Dateizugriff ab', async () => {
    const wurzel = neueWurzel();
    const { kunden } = bestand(wurzel);
    const ohne = await gestaltOhneZugriff();
    const lesen = vi.spyOn(fs.promises, 'readFile');
    try {
      const handler = kanal({ sicht: sichtFuer(kunden) });
      // `tabelle` muss ausdrücklich dastehen: fehlend ist nicht «alle».
      for (const params of [undefined, null, {}, { tabelle: '' }, { tabelle: 5 }, []]) {
        expect(await handler(ereignis(wurzel), params)).toEqual(ohne);
      }
      expect(await handler(ereignis(null), { tabelle: null })).toEqual(ohne);
      expect(await kanal()(ereignis(wurzel), { tabelle: null })).toEqual(ohne);
      expect(lesen).not.toHaveBeenCalled();
    } finally {
      lesen.mockRestore();
    }
  });

  it('antwortet im Aus-Zustand der Erweiterung und ohne Tor ohne Zugriff', async () => {
    const wurzel = neueWurzel();
    const { kunden } = bestand(wurzel);
    const ohne = await gestaltOhneZugriff();
    const aus = kanal({ sicht: sichtFuer(kunden), datenbankAktiv: () => false });
    expect(await aus(ereignis(wurzel), { tabelle: null })).toEqual(ohne);
    const ohneTor = kanal({ sicht: sichtFuer(kunden), ohneTor: true });
    expect(await ohneTor(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(ohne);
  });

  it('prüft die Lage am aufgelösten Pfad: eine Tabelle außerhalb des Bereichs wird abgewiesen', async () => {
    const wurzel = neueWurzel();
    const fremd = neueWurzel();
    const { kunden } = bestand(fremd);
    const handler = kanal({ sicht: sichtFuer(kunden) });
    const ohne = await gestaltOhneZugriff();
    expect(await handler(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(ohne);
    expect(await handler(ereignis(wurzel), { tabelle: kunden })).toEqual(ohne);
  });
});
