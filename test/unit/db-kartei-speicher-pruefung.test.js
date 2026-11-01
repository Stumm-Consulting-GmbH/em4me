// 4T-002404 (Epic 3E-000266; Story 4S-001126, AK1 bis AK5): Die Prüfung einer
// Karteikarte beim Speichern — die geschnittene Prüf-Funktion für einen
// einzelnen Dateikopf, ihr Anschluss an den Speicher-Kanal und ihr Aus-Zustand.
//
// **Die tragende Zusage ist eine Abwesenheit:** Das Speichern ändert seinen
// Ausgang nie. Eine Karteikarte mit Befunden wird geschrieben, und ein Fehler
// in der Prüfung macht aus einem gelungenen Speichern keinen Fehlschlag. Die
// Fälle prüfen deshalb neben den Befunden immer den Datei-Inhalt und `ok`.
//
// **Dieselbe Prüfung wie die Konsistenz-Prüfung:** Ein Fall hält für dieselbe
// Karteikarte die Befunde beider Wege gegeneinander.
//
// Echtes Dateisystem in temporären Ordnern, die Sicht des Index als kleine
// Karte (Muster `db-kartei-form.test.js`); der Speicher-Kanal mit den
// Abhängigkeiten aus `db-definitions-schutz.test.js`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { KONSISTENZ_BEFUNDE, pruefeKonsistenz } = require_(
  '../../src/main/database/konsistenz-pruefung.js',
);
const { HERKUNFT, pruefeKarteikarte } = require_('../../src/main/database/datensatz-pruefung.js');
const { neuerLauf } = require_('../../src/main/database/record-regel-hilfen.js');
const { erzeugeSpeicherPruefung } = require_('../../src/main/database/speicher-pruefung.js');
const { registerFilesIpc } = require_('../../src/main/ipc/files.js');

let tmpDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const NUR_LESEN = { readFile: (...args) => fs.promises.readFile(...args) };

function zeilen(...liste) {
  return [...liste, ''].join('\n');
}

// Die Kartei «Autoren» mit Pflicht-Feld, Datum, Zahl mit Prüfregel und Verweis
// auf die Tabelle «Verlage» (Tabellen-Form, Schlüssel `name`).
const AUTOREN = zeilen(
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '      required: true',
  '    - name: born',
  '      type: date',
  '    - name: alter',
  '      type: number',
  "      check: 'value > 0'",
  '    - name: verlag',
  '      type: record',
  '      options:',
  '        table: Verlage',
  '  key: name',
  '  lastId: 3',
  '---',
  '',
  'Je Autor eine Karteikarte.',
);

const VERLAGE = zeilen(
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '  key: name',
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Aufbau',
  '```',
);

function karte(...kopf) {
  return zeilen('---', ...kopf, '---', '', 'Freier Text.');
}

const REGELKONFORM = karte(
  'db-record: r-00001',
  'name: Ada',
  'born: 1815-12-10',
  'alter: 36',
  'verlag: Aufbau',
);
const VERLETZT = karte(
  'db-record: r-00001',
  'name:',
  'born: unbekannt',
  'alter: -2',
  'verlag: Fehlt',
);

// Ein Bereich mit beiden Tabellen; `karten` sind Name und Text der Dokumente
// im Ordner der Kartei.
function bereich(karten) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-speichern-'));
  tmpDirs.push(wurzel);
  const ordner = path.join(wurzel, 'Autoren');
  fs.mkdirSync(ordner);
  const autoren = path.join(ordner, 'Autoren.md');
  fs.writeFileSync(autoren, AUTOREN, 'utf8');
  const verlage = path.join(wurzel, 'Verlage.md');
  fs.writeFileSync(verlage, VERLAGE, 'utf8');
  const pfade = {};
  for (const [name, text] of Object.entries(karten)) {
    pfade[name] = path.join(ordner, `${name}.md`);
    fs.writeFileSync(pfade[name], text, 'utf8');
  }
  const sicht = {
    dbKindsPerFile: new Map([
      [autoren, ['table']],
      [verlage, ['table']],
    ]),
    files: new Map([autoren, verlage, ...Object.values(pfade)].map((p) => [p, []])),
  };
  return { wurzel, ordner, autoren, pfade, sicht };
}

function pruefung(aufbau, { aktiv = true, vorlagenOrdner = null } = {}) {
  return erzeugeSpeicherPruefung({
    tabellenSicht: () => ({
      status: 'ready',
      meta: { wurzel: aufbau.wurzel },
      sicht: aufbau.sicht,
    }),
    erweiterungAktiv: () => aktiv,
    vorlagenOrdner: async () => vorlagenOrdner,
    fsp: NUR_LESEN,
  });
}

const CODES = (befunde) => befunde.map((b) => b.code);

describe('Prüfung einer Karteikarte beim Speichern (4T-002404, AK1 bis AK3)', () => {
  it('meldet Pflicht, Typ, Prüfregel und Verweis je Feld', async () => {
    const aufbau = bereich({ Ada: VERLETZT });
    const befunde = await pruefung(aufbau)({ pfad: aufbau.pfade.Ada, text: VERLETZT });
    expect(CODES(befunde)).toEqual([
      KONSISTENZ_BEFUNDE.pflichtFehlt,
      KONSISTENZ_BEFUNDE.typVerletzt,
      KONSISTENZ_BEFUNDE.pruefregelVerletzt,
      KONSISTENZ_BEFUNDE.verweisZielFehlt,
    ]);
    expect(befunde.map((b) => b.feld)).toEqual(['name', 'born', 'alter', 'verlag']);
    expect(befunde[1]).toMatchObject({
      tabelle: 'Autoren',
      pfad: aufbau.autoren,
      datei: aufbau.pfade.Ada,
      id: 'r-00001',
      wert: 'unbekannt',
    });
    expect(befunde[3]).toMatchObject({ wert: 'Fehlt', zieltabelle: 'Verlage' });
  });

  it('meldet die Schlüssel-Dublette als Befund, nicht als Abweisung', async () => {
    const bea = karte('db-record: r-00002', 'name: Ada');
    const aufbau = bereich({ Ada: REGELKONFORM, Bea: bea });
    const befunde = await pruefung(aufbau)({ pfad: aufbau.pfade.Bea, text: bea });
    expect(befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.schluesselDoppelt,
        datei: aufbau.pfade.Bea,
        felder: ['name'],
        wert: 'Ada',
        kennungen: ['r-00001', 'r-00002'],
      }),
    ]);
  });

  it('liefert für einen regelkonformen Dateikopf eine leere Liste', async () => {
    const aufbau = bereich({ Ada: REGELKONFORM });
    expect(await pruefung(aufbau)({ pfad: aufbau.pfade.Ada, text: REGELKONFORM })).toEqual([]);
  });

  it('prüft kein Dokument ohne Kennung und keine Datei außerhalb des Kartei-Ordners', async () => {
    const notiz = karte('name: Notiz', 'born: unbekannt');
    const aufbau = bereich({ Notiz: notiz });
    const pruefe = pruefung(aufbau);
    expect(await pruefe({ pfad: aufbau.pfade.Notiz, text: notiz })).toBeNull();
    // Dieselbe Kennung im Wurzel-Ordner: keine Kartei-Tabelle daneben.
    const fremd = path.join(aufbau.wurzel, 'Fremd.md');
    fs.writeFileSync(fremd, VERLETZT, 'utf8');
    expect(await pruefe({ pfad: fremd, text: VERLETZT })).toBeNull();
    // Die Tabellen-Datei selbst ist keine Karteikarte.
    expect(await pruefe({ pfad: aufbau.autoren, text: AUTOREN })).toBeNull();
  });

  it('prüft kein Dokument im Vorlagen-Ordner', async () => {
    const aufbau = bereich({ Ada: VERLETZT });
    const pruefe = pruefung(aufbau, { vorlagenOrdner: aufbau.ordner });
    expect(await pruefe({ pfad: aufbau.pfade.Ada, text: VERLETZT })).toBeNull();
  });

  it('liefert dieselben Befunde wie die Konsistenz-Prüfung (AK5)', async () => {
    const ada = karte(
      'db-record: r-00001',
      'name: Ada',
      'born: unbekannt',
      'alter: -2',
      'verlag: Fehlt',
    );
    const bea = karte('db-record: r-00002', 'name: Ada', 'born: 1990-01-01');
    const aufbau = bereich({ Ada: ada, Bea: bea });
    const beimSpeichern = await pruefung(aufbau)({ pfad: aufbau.pfade.Ada, text: ada });
    const konsistenz = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel: aufbau.wurzel,
      sicht: aufbau.sicht,
    });
    const anAda = konsistenz.befunde.filter((b) => b.datei === aufbau.pfade.Ada);
    expect(CODES(beimSpeichern)).toEqual([
      KONSISTENZ_BEFUNDE.typVerletzt,
      KONSISTENZ_BEFUNDE.pruefregelVerletzt,
      KONSISTENZ_BEFUNDE.verweisZielFehlt,
      KONSISTENZ_BEFUNDE.schluesselDoppelt,
    ]);
    expect(beimSpeichern).toEqual(anAda);
  });

  it('verlangt die Herkunft des Aufrufs', async () => {
    const aufbau = bereich({ Ada: REGELKONFORM });
    const lauf = neuerLauf({
      bereichsWurzel: aufbau.wurzel,
      schritte: [],
      bestaende: new Map(),
      tabellenSicht: () => ({ status: 'ready', sicht: aufbau.sicht }),
      fsp: NUR_LESEN,
    });
    const auftrag = { lauf, sicht: aufbau.sicht, kopf: aufbau.autoren, pfad: aufbau.pfade.Ada };
    await expect(pruefeKarteikarte({ ...auftrag, herkunft: 'irgendwo' })).rejects.toThrow(
      TypeError,
    );
    expect(await pruefeKarteikarte({ ...auftrag, herkunft: HERKUNFT.speichern })).toEqual({
      herkunft: HERKUNFT.speichern,
      befunde: [],
    });
  });

  it('protokolliert einen Fehler der Prüfung und liefert keine Befunde', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pruefe = erzeugeSpeicherPruefung({
      tabellenSicht: () => {
        throw new Error('Index kaputt');
      },
      erweiterungAktiv: () => true,
      fsp: NUR_LESEN,
    });
    expect(await pruefe({ pfad: '/x/Ada.md', text: VERLETZT })).toBeNull();
    expect(warnung).toHaveBeenCalledTimes(1);
  });

  it('prüft im Aus-Zustand der Erweiterung «Datenbank» nichts', async () => {
    const aufbau = bereich({ Ada: VERLETZT });
    const sicht = vi.fn(() => ({
      status: 'ready',
      meta: { wurzel: aufbau.wurzel },
      sicht: aufbau.sicht,
    }));
    const pruefe = erzeugeSpeicherPruefung({
      tabellenSicht: sicht,
      erweiterungAktiv: () => false,
      fsp: NUR_LESEN,
    });
    expect(await pruefe({ pfad: aufbau.pfade.Ada, text: VERLETZT })).toBeNull();
    expect(sicht).not.toHaveBeenCalled();
  });
});

// --- Der Speicher-Kanal ----------------------------------------------------------------------

function kanaele(speicherPruefung, ziel = null) {
  const handlers = new Map();
  registerFilesIpc((k, fn) => handlers.set(k, fn), {
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: ziel }) },
    senderWindow: () => ({ id: 1 }),
    areaOfWindow: () => null,
    tForWindow: (_win, k) => k,
    isMddPath: () => false,
    isMarkdownPath: (p) => /\.md$/i.test(p),
    watchFile: () => {},
    unwatchFile: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    recordMddExternalOnOpen: async () => {},
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    saveGuard: { istKonflikt: () => false },
    pushRecent: () => {},
    getStore: () => null,
    readAreaLinks: async () => [],
    speicherPruefung,
  });
  return handlers;
}

const EREIGNIS = { sender: { id: 1 } };

describe('Anschluss an den Speicher-Kanal: melden, nie abweisen (4T-002404, AK1, AK2)', () => {
  it('speichert eine Karteikarte mit Befunden und liefert sie im Ergebnis', async () => {
    const aufbau = bereich({ Ada: REGELKONFORM });
    const speichere = kanaele(pruefung(aufbau)).get('file:save');
    const antwort = await speichere(EREIGNIS, aufbau.pfade.Ada, VERLETZT);
    expect(antwort.ok).toBe(true);
    expect(fs.readFileSync(aufbau.pfade.Ada, 'utf8')).toBe(VERLETZT);
    expect(CODES(antwort.karteiBefunde)).toEqual([
      KONSISTENZ_BEFUNDE.pflichtFehlt,
      KONSISTENZ_BEFUNDE.typVerletzt,
      KONSISTENZ_BEFUNDE.pruefregelVerletzt,
      KONSISTENZ_BEFUNDE.verweisZielFehlt,
    ]);
    // Nach dem Beheben und erneuten Speichern ist die Liste leer.
    const behoben = await speichere(EREIGNIS, aufbau.pfade.Ada, REGELKONFORM);
    expect(behoben).toMatchObject({ ok: true, karteiBefunde: [] });
  });

  it('liefert für ein gewöhnliches Dokument keine Angabe', async () => {
    const aufbau = bereich({});
    const datei = path.join(aufbau.wurzel, 'Notiz.md');
    const antwort = await kanaele(pruefung(aufbau)).get('file:save')(EREIGNIS, datei, '# Notiz\n');
    expect(antwort.ok).toBe(true);
    expect(antwort.karteiBefunde).toBeUndefined();
  });

  it('bleibt bei einem Fehler der Prüfung ein gelungenes Speichern', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const aufbau = bereich({ Ada: REGELKONFORM });
    const wirft = async () => {
      throw new Error('Prüfung gescheitert');
    };
    const antwort = await kanaele(wirft).get('file:save')(EREIGNIS, aufbau.pfade.Ada, VERLETZT);
    expect(antwort.ok).toBe(true);
    expect(antwort.karteiBefunde).toBeUndefined();
    expect(fs.readFileSync(aufbau.pfade.Ada, 'utf8')).toBe(VERLETZT);
  });

  it('meldet auch beim Speichern unter', async () => {
    const aufbau = bereich({ Ada: REGELKONFORM });
    const ziel = path.join(aufbau.ordner, 'Ada Kopie.md');
    const kopie = VERLETZT.replace('r-00001', 'r-00002');
    const antwort = await kanaele(pruefung(aufbau), ziel).get('file:saveAs')(
      EREIGNIS,
      aufbau.pfade.Ada,
      kopie,
    );
    expect(antwort).toMatchObject({ ok: true, path: ziel });
    expect(fs.readFileSync(ziel, 'utf8')).toBe(kopie);
    expect(CODES(antwort.karteiBefunde)).toContain(KONSISTENZ_BEFUNDE.typVerletzt);
  });

  it('liefert im Aus-Zustand der Erweiterung keine Angabe und speichert', async () => {
    const aufbau = bereich({ Ada: REGELKONFORM });
    const speichere = kanaele(pruefung(aufbau, { aktiv: false })).get('file:save');
    const antwort = await speichere(EREIGNIS, aufbau.pfade.Ada, VERLETZT);
    expect(antwort.ok).toBe(true);
    expect(antwort.karteiBefunde).toBeUndefined();
    expect(fs.readFileSync(aufbau.pfade.Ada, 'utf8')).toBe(VERLETZT);
  });
});
