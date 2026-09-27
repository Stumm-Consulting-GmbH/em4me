// 4T-001944 (Epic 3E-000257, Bauplan B1, B2, B5, B6; AK1, AK2, AK3, AK5, AK6):
// Die Konsistenz-Prüfung über den Bestand an den drei Prüf-Anwendungen des
// Konzepts — Vorrat (Kopf und Positionen, der Kopf geteilt in ein Folge-Segment),
// Ahnen (Selbstbezug über «vater» und «mutter») und Medien-Ausleihe
// (Zwischentabelle mit Hand-Verweisen über den fachlichen Schlüssel).
//
// **Echtes Dateisystem in temporären Ordnern**, wie die Prüfdateien des
// Regel-Werks. Allein die Tabellen-Sicht des Index ist ein Fake, weil sie die
// Menge der Tabellen und Masken-Dateien festlegt und der Index hier nicht der
// Gegenstand ist. Der Dateizugriff der Prüfung trägt allein `readFile`: Eine
// Prüfung, die zu schreiben versuchte, bräche daran.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  KONSISTENZ_BEFUNDE,
  pruefeKonsistenz,
} from '../../src/main/database/konsistenz-pruefung.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';

// --- Aufbau ----------------------------------------------------------------------------------

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

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-konsistenz-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, zeilen) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, Array.isArray(zeilen) ? zeilen.join('\n') : zeilen, 'utf8');
  return pfad;
}

// Ein Dateizugriff, der nur lesen kann.
const NUR_LESEN = { readFile: (...args) => fs.promises.readFile(...args) };

// Die Tabellen-Sicht: Kopf-Dateien mit der Marke `table`, Masken mit `form`.
function sicht({ tabellen = [], masken = [] }) {
  const karte = new Map();
  for (const p of tabellen) karte.set(p, ['table']);
  for (const p of masken) karte.set(p, ['form']);
  return { dbKindsPerFile: karte };
}

function pruefe(wurzel, s, tabelle = null) {
  return pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht: s, tabelle });
}

function datensatz(id, ...zellen) {
  return [`|- id="${id}"`, ...zellen.map((z) => (z === '' ? '|' : `| ${z}`))];
}

// Eine ungeteilte Tabelle aus Definitions-Zeilen und Datensätzen.
function tabelle(definition, records) {
  return ['---', ...definition, '---', '', '```perspective-records', ...records.flat(), '```', ''];
}

function codes(ergebnis) {
  return ergebnis.befunde.map((b) => b.code);
}

function nurCode(ergebnis, code) {
  return ergebnis.befunde.filter((b) => b.code === code);
}

// --- Vorrat: Kopf und Positionen -------------------------------------------------------------

// Der Kopf ist geteilt: zwei Datensätze in der Kopf-Datei, einer im Segment.
function vorrat({ kopfRecords, segmentRecords, positionen } = {}) {
  const wurzel = bereich();
  const kopf = lege(wurzel, 'Kopf.md', [
    '---',
    'doc-part: v1|1|Kopf',
    'db-table:',
    '  fields:',
    '    - name: nummer',
    '      required: true',
    '    - name: datum',
    '      type: date',
    '  key: nummer',
    '  lastId: 3',
    '---',
    '',
    '```perspective-records',
    ...(
      kopfRecords || [datensatz('r-00001', 'K-1', '2026-09-01'), datensatz('r-00002', 'K-2', '')]
    ).flat(),
  ]);
  const segment = lege(wurzel, 'Kopf•part-00002.md', [
    '---',
    'doc-part: v1|2|Kopf',
    '---',
    ...(segmentRecords || [datensatz('r-00003', 'K-3', '2026-09-03')]).flat(),
    '',
    '```',
    '',
  ]);
  const position = lege(
    wurzel,
    'Position.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: kopf',
        '      type: record',
        '      options:',
        '        table: Kopf',
        '    - name: artikel',
        '      required: true',
        '    - name: menge',
        '      type: number',
        "      check: 'value > 0'",
        '  display: artikel',
        '  lastId: 2',
      ],
      positionen || [
        datensatz('r-00001', 'r-00001', 'Schraube', '10'),
        datensatz('r-00002', 'K-3', 'Mutter', '5'),
      ],
    ),
  );
  return { wurzel, kopf, segment, position, s: sicht({ tabellen: [kopf, position] }) };
}

describe('Konsistenz-Prüfung: ein sauberer Bestand (AK1, AK5)', () => {
  it('meldet am Vorrat keine Befunde und zählt Tabellen und Datensätze über alle Segmente', async () => {
    const { wurzel, kopf, position, s } = vorrat();
    const ergebnis = await pruefe(wurzel, s);
    expect(ergebnis.status).toBe('ready');
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.tabellen).toEqual([
      { name: 'Kopf', pfad: kopf, datensaetze: 3, befunde: 0 },
      { name: 'Position', pfad: position, datensaetze: 2, befunde: 0 },
    ]);
    expect(typeof ergebnis.dauerMs).toBe('number');
  });

  it('meldet eine leere Tabelle und eine leere Datenbank ohne Befund', async () => {
    const wurzel = bereich();
    const leer = lege(wurzel, 'Leer.md', tabelle(['db-table:', '  fields:', '    - name: a'], []));
    const eine = await pruefe(wurzel, sicht({ tabellen: [leer] }));
    expect(eine.befunde).toEqual([]);
    expect(eine.tabellen).toEqual([{ name: 'Leer', pfad: leer, datensaetze: 0, befunde: 0 }]);
    const keine = await pruefe(wurzel, sicht({}));
    expect(keine).toMatchObject({ status: 'ready', befunde: [], tabellen: [] });
  });

  it('liefert ohne Sicht «unavailable» und für eine unbekannte Tabelle eine Fehlerlage', async () => {
    const { wurzel, s } = vorrat();
    expect(await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht: null })).toEqual({
      status: 'unavailable',
      befunde: [],
      tabellen: [],
      dauerMs: 0,
    });
    expect(await pruefe(wurzel, s, 'Lager')).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
    await expect(pruefeKonsistenz({ wurzel, sicht: s })).rejects.toThrow(TypeError);
  });
});

describe('Konsistenz-Prüfung: Vorrat (AK2)', () => {
  it('findet die Schlüssel-Dublette über zwei Segmente mit allen Positionen', async () => {
    const { wurzel, kopf, segment, s } = vorrat({
      segmentRecords: [datensatz('r-00003', 'K-1', '2026-09-03')],
    });
    const ergebnis = await pruefe(wurzel, s);
    const dubletten = nurCode(ergebnis, KONSISTENZ_BEFUNDE.schluesselDoppelt);
    expect(dubletten).toHaveLength(2);
    expect(dubletten[0]).toMatchObject({
      tabelle: 'Kopf',
      pfad: kopf,
      datei: kopf,
      id: 'r-00001',
      felder: ['nummer'],
      wert: 'K-1',
      kennungen: ['r-00001', 'r-00003'],
      anzeige: 'K-1',
    });
    expect(dubletten[1]).toMatchObject({
      datei: segment,
      id: 'r-00003',
      kennungen: ['r-00001', 'r-00003'],
    });
    // Die Zeile ist die Datei-Zeile des Datensatz-Markers (Muster der Auskunft).
    expect(fs.readFileSync(kopf, 'utf8').split('\n')[dubletten[0].zeile - 1]).toBe(
      '|- id="r-00001"',
    );
    expect(fs.readFileSync(segment, 'utf8').split('\n')[dubletten[1].zeile - 1]).toBe(
      '|- id="r-00003"',
    );
    expect(ergebnis.tabellen[0].befunde).toBe(2);
  });

  it('findet die Kennungs-Dublette in zwei Dateien und zweimal in einer', async () => {
    const zweiDateien = vorrat({ segmentRecords: [datensatz('r-00002', 'K-9', '2026-09-09')] });
    const a = await pruefe(zweiDateien.wurzel, zweiDateien.s);
    expect(nurCode(a, KONSISTENZ_BEFUNDE.kennungDoppelt)).toEqual([
      expect.objectContaining({ id: 'r-00002', kennungen: ['r-00002'], datei: zweiDateien.kopf }),
    ]);
    const eineDatei = vorrat({
      kopfRecords: [
        datensatz('r-00001', 'K-1', '2026-09-01'),
        datensatz('r-00001', 'K-7', '2026-09-07'),
      ],
    });
    const b = await pruefe(eineDatei.wurzel, eineDatei.s);
    expect(nurCode(b, KONSISTENZ_BEFUNDE.kennungDoppelt)).toEqual([
      expect.objectContaining({ id: 'r-00001', kennungen: ['r-00001'] }),
    ]);
  });

  it('findet den Verweis auf eine gelöschte Kennung und auf einen fehlenden Schlüssel-Wert', async () => {
    const { wurzel, position, s } = vorrat({
      positionen: [
        datensatz('r-00001', 'r-00009', 'Schraube', '10'),
        datensatz('r-00002', 'K-8', 'Mutter', '5'),
      ],
    });
    const ergebnis = await pruefe(wurzel, s);
    expect(nurCode(ergebnis, KONSISTENZ_BEFUNDE.verweisZielFehlt)).toEqual([
      expect.objectContaining({
        tabelle: 'Position',
        pfad: position,
        id: 'r-00001',
        anzeige: 'Schraube',
        feld: 'kopf',
        wert: 'r-00009',
        zieltabelle: 'Kopf',
      }),
      expect.objectContaining({ id: 'r-00002', wert: 'K-8', zieltabelle: 'Kopf' }),
    ]);
  });

  it('findet Pflicht, Typ und Feld-Regel an den Zellen', async () => {
    const { wurzel, s } = vorrat({
      positionen: [
        datensatz('r-00001', 'r-00001', '', 'viele'),
        datensatz('r-00002', 'r-00001', 'Mutter', '-2'),
      ],
    });
    const ergebnis = await pruefe(wurzel, s);
    expect(codes(ergebnis)).toEqual([
      KONSISTENZ_BEFUNDE.pflichtFehlt,
      KONSISTENZ_BEFUNDE.typVerletzt,
      KONSISTENZ_BEFUNDE.pruefregelVerletzt,
    ]);
    expect(ergebnis.befunde[0]).toMatchObject({ id: 'r-00001', feld: 'artikel', anzeige: null });
    expect(ergebnis.befunde[1]).toMatchObject({ feld: 'menge', wert: 'viele' });
    expect(ergebnis.befunde[2]).toMatchObject({
      id: 'r-00002',
      feld: 'menge',
      wert: '-2',
      regel: 'value > 0',
      grund: 'ausdruck',
      meldung: '',
    });
  });

  it('findet die fehlende Zelle als Pflicht-Befund und die abweichende Zellen-Zahl', async () => {
    const { wurzel, s } = vorrat({
      positionen: [
        ['|- id="r-00001"', '| r-00001'],
        datensatz('r-00002', 'r-00001', 'Mutter', '5', 'zu viel'),
      ],
    });
    const ergebnis = await pruefe(wurzel, s);
    expect(codes(ergebnis)).toEqual([
      KONSISTENZ_BEFUNDE.zellenZahl,
      KONSISTENZ_BEFUNDE.pflichtFehlt,
      KONSISTENZ_BEFUNDE.zellenZahl,
    ]);
    expect(ergebnis.befunde[0]).toMatchObject({ id: 'r-00001', wert: '1', anzahl: 3 });
    expect(ergebnis.befunde[1]).toMatchObject({ id: 'r-00001', feld: 'artikel' });
    expect(ergebnis.befunde[2]).toMatchObject({ id: 'r-00002', wert: '4', anzahl: 3 });
  });

  it('prüft auf Anfrage nur eine Tabelle, über Namen oder Pfad', async () => {
    const { wurzel, position, s } = vorrat({
      segmentRecords: [datensatz('r-00003', 'K-1', '2026-09-03')],
      positionen: [datensatz('r-00001', 'r-00009', 'Schraube', '10')],
    });
    for (const angabe of ['Position', position]) {
      const ergebnis = await pruefe(wurzel, s, angabe);
      expect(ergebnis.tabellen.map((t) => t.name)).toEqual(['Position']);
      expect(codes(ergebnis)).toEqual([KONSISTENZ_BEFUNDE.verweisZielFehlt]);
    }
  });
});

// --- Ahnen: Selbstbezug ----------------------------------------------------------------------

function ahnen(records) {
  const wurzel = bereich();
  const person = lege(
    wurzel,
    'Person.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: name',
        '    - name: vater',
        '      type: record',
        '      options:',
        '        table: Person',
        '    - name: mutter',
        '      type: record',
        '      options:',
        '        table: Person',
        '    - name: geboren',
        '      type: date',
        '    - name: gestorben',
        '      type: date',
        '  checks:',
        "    - rule: 'gestorben >= geboren'",
        '      message: Tod vor Geburt.',
        '  display: name',
        '  lastId: 3',
      ],
      records,
    ),
  );
  return { wurzel, person, s: sicht({ tabellen: [person] }) };
}

describe('Konsistenz-Prüfung: Ahnen mit Selbstbezug (AK2)', () => {
  it('nimmt den Verweis auf einen Datensatz derselben Tabelle an und findet das fehlende Ziel', async () => {
    const { wurzel, s } = ahnen([
      datensatz('r-00001', 'Adam', '', '', '1900-01-01', '1980-01-01'),
      datensatz('r-00002', 'Kain', 'r-1', 'r-00099', '1930-01-01', '1990-01-01'),
    ]);
    const ergebnis = await pruefe(wurzel, s);
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.verweisZielFehlt,
        id: 'r-00002',
        anzeige: 'Kain',
        feld: 'mutter',
        wert: 'r-00099',
        zieltabelle: 'Person',
      }),
    ]);
  });

  it('findet die verletzte Datensatz-Regel mit ihren Feldern und ihrer Meldung', async () => {
    const { wurzel, s } = ahnen([datensatz('r-00001', 'Abel', '', '', '1930-01-01', '1920-01-01')]);
    const ergebnis = await pruefe(wurzel, s);
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.datensatzregelVerletzt,
        id: 'r-00001',
        felder: ['geboren', 'gestorben'],
        regel: 'gestorben >= geboren',
        meldung: 'Tod vor Geburt.',
        grund: 'ausdruck',
      }),
    ]);
  });
});

// --- Medien-Ausleihe: Zwischentabelle ----------------------------------------------------------

function ausleihe({ medien, ausleihen, ausleiheFelder } = {}) {
  const wurzel = bereich();
  const medium = lege(
    wurzel,
    'Medium.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: signatur',
        '    - name: titel',
        '  key: signatur',
        '  display: titel',
        '  lastId: 2',
      ],
      medien || [datensatz('r-00001', 'M-1', 'Faust'), datensatz('r-00002', 'M-2', 'Emil')],
    ),
  );
  const person = lege(
    wurzel,
    'Person.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: vorname',
        '    - name: nachname',
        '  key: [vorname, nachname]',
        '  lastId: 1',
      ],
      [datensatz('r-00001', 'Anna', 'Muster')],
    ),
  );
  const leihe = lege(
    wurzel,
    'Ausleihe.md',
    tabelle(
      ausleiheFelder || [
        'db-table:',
        '  fields:',
        '    - name: medium',
        '      type: record',
        '      options:',
        '        table: Medium',
        '    - name: person',
        '      type: record',
        '      options:',
        '        table: Person',
        '    - name: ort',
        '      type: record',
        '      options:',
        '        table: Lager',
        '  lastId: 1',
      ],
      ausleihen || [datensatz('r-00001', 'M-1', 'r-00001', '')],
    ),
  );
  return { wurzel, medium, person, leihe, tabellen: [medium, person, leihe] };
}

describe('Konsistenz-Prüfung: Medien-Ausleihe mit Zwischentabelle (AK2)', () => {
  it('löst den Hand-Verweis über den Schlüssel auf und meldet sonst nichts', async () => {
    const { wurzel, tabellen } = ausleihe();
    expect((await pruefe(wurzel, sicht({ tabellen }))).befunde).toEqual([]);
  });

  it('findet die vier Verweis-Fälle', async () => {
    const { wurzel, tabellen } = ausleihe({
      medien: [
        datensatz('r-00001', 'M-1', 'Faust'),
        datensatz('r-00002', 'M-1', 'Faust, zweites Exemplar'),
      ],
      ausleihen: [datensatz('r-00001', 'M-1', 'Anna', 'Regal 3')],
    });
    const ergebnis = await pruefe(wurzel, sicht({ tabellen }));
    const leihe = ergebnis.befunde.filter((b) => b.tabelle === 'Ausleihe');
    expect(leihe).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.verweisMehrdeutig,
        feld: 'medium',
        wert: 'M-1',
        zieltabelle: 'Medium',
        anzahl: 2,
        kennungen: ['r-00001', 'r-00002'],
      }),
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.verweisSchluesselMehrteilig,
        feld: 'person',
        wert: 'Anna',
        zieltabelle: 'Person',
      }),
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt,
        feld: 'ort',
        wert: 'Regal 3',
        zieltabelle: 'Lager',
      }),
    ]);
    // Die Schlüssel-Dublette im Ziel ist ein eigener Befund der Ziel-Tabelle.
    expect(nurCode(ergebnis, KONSISTENZ_BEFUNDE.schluesselDoppelt)).toHaveLength(2);
    // Die Verweis-Spalte ohne Ziel-Angabe: Tabelle unbekannt ohne Ziel.
    const ohneZiel = ausleihe({
      ausleiheFelder: ['db-table:', '  fields:', '    - name: medium', '      type: record'],
      ausleihen: [datensatz('r-00001', 'M-1')],
    });
    const b = await pruefe(ohneZiel.wurzel, sicht({ tabellen: ohneZiel.tabellen }), 'Ausleihe');
    expect(b.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt,
        zieltabelle: null,
        grund: 'zielAngabeFehlt',
      }),
    ]);
  });

  it('findet die Masken-Fälle: unbekanntes Feld, unbekannter Platzhalter, unbekannte Tabelle', async () => {
    const { wurzel, medium, tabellen } = ausleihe();
    const maske = lege(wurzel, 'Medium Form.md', [
      '---',
      'title: Medium',
      'db-form:',
      '  table: Medium',
      '---',
      '# Medium',
      '**Titel:** {{field:titel}}',
      '**Autor:** {{field:autor}}',
      '{{value:signatur}}',
      '',
    ]);
    const fremd = lege(wurzel, 'Lager Form.md', ['---', 'db-form:', '  table: Lager', '---', '']);
    const s = sicht({ tabellen, masken: [maske, fremd] });
    const ergebnis = await pruefe(wurzel, s);
    // Die Masken-Dateien in der Reihenfolge ihrer Pfade.
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.maskeTabelleUnbekannt,
        tabelle: 'Lager',
        pfad: null,
        datei: fremd,
      }),
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.maskeFeldUnbekannt,
        tabelle: 'Medium',
        pfad: medium,
        datei: maske,
        zeile: 8,
        feld: 'autor',
      }),
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.maskePlatzhalterUnbekannt,
        datei: maske,
        zeile: 9,
        wert: 'value:signatur',
      }),
    ]);
    expect(ergebnis.tabellen.find((t) => t.name === 'Medium').befunde).toBe(2);
    // Die Prüfung EINER Tabelle nimmt nur deren Masken mit.
    const eine = await pruefe(wurzel, s, 'Ausleihe');
    expect(eine.befunde).toEqual([]);
  });
});

// --- Unlesbare Definition, Byte-Gleichheit ------------------------------------------------------

describe('Konsistenz-Prüfung: Robustheit und Schreibfreiheit (AK3, AK5)', () => {
  it('meldet eine unlesbare Definition als Befund ihrer Tabelle und prüft weiter', async () => {
    const { wurzel, kopf, position } = vorrat({
      positionen: [datensatz('r-00001', 'r-00009', 'Schraube', '10')],
    });
    const kaputt = lege(wurzel, 'Kaputt.md', ['---', 'db-table: [', '---', '']);
    const fehlt = path.join(wurzel, 'Verschwunden.md');
    const ergebnis = await pruefe(wurzel, sicht({ tabellen: [kaputt, fehlt, kopf, position] }));
    const unlesbar = nurCode(ergebnis, KONSISTENZ_BEFUNDE.definitionUnlesbar);
    expect(unlesbar).toEqual([
      expect.objectContaining({ tabelle: 'Kaputt', datei: kaputt, grund: null }),
      expect.objectContaining({ tabelle: 'Verschwunden', datei: fehlt }),
    ]);
    // Die Fehlermeldung des Dateizugriffs reist als Grund mit.
    expect(typeof unlesbar[1].grund).toBe('string');
    expect(nurCode(ergebnis, KONSISTENZ_BEFUNDE.verweisZielFehlt)).toHaveLength(1);
    expect(ergebnis.befunde).toHaveLength(3);
    // Die Tabellen in der Reihenfolge ihrer Pfade, wie die Sicht sie liefert.
    expect(ergebnis.tabellen.map((t) => [t.name, t.datensaetze, t.befunde])).toEqual([
      ['Kaputt', 0, 1],
      ['Kopf', 3, 0],
      ['Position', 1, 1],
      ['Verschwunden', 0, 1],
    ]);
  });

  it('lässt jede Datei byte-gleich stehen', async () => {
    const { wurzel, kopf, segment, position, s } = vorrat({
      segmentRecords: [datensatz('r-00003', 'K-1', '2026-09-03')],
      positionen: [datensatz('r-00001', 'r-00009', '', 'x')],
    });
    const dateien = [kopf, segment, position];
    const vorher = dateien.map((p) => fs.readFileSync(p));
    const zeiten = dateien.map((p) => fs.statSync(p).mtimeMs);
    const ergebnis = await pruefe(wurzel, s);
    expect(ergebnis.befunde.length).toBeGreaterThan(0);
    dateien.forEach((p, i) => {
      expect(fs.readFileSync(p).equals(vorher[i]), p).toBe(true);
      expect(fs.statSync(p).mtimeMs, p).toBe(zeiten[i]);
    });
    expect(fs.readdirSync(wurzel).sort()).toEqual(
      ['Kopf.md', 'Kopf•part-00002.md', 'Position.md'].sort(),
    );
  });
});

// --- Zweitausend Datensätze (AK6, B5) ------------------------------------------------------------

// Eine Tabelle mit zweitausend Datensätzen und eine Verweis-Tabelle mit
// zweitausend Verweisen, abwechselnd über Kennung und Schlüssel-Wert.
function mengengeruest() {
  const wurzel = bereich();
  const kunden = [];
  const verweise = [];
  for (let i = 1; i <= 2000; i++) {
    const id = `r-${String(i).padStart(5, '0')}`;
    kunden.push(datensatz(id, `K${i}`, `Kunde ${i}`, `Ort ${i % 17}`));
    verweise.push(datensatz(id, i % 2 === 0 ? id : `K${i}`, String(i)));
  }
  const kopf = lege(
    wurzel,
    'Kunden.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: kuerzel',
        '      required: true',
        '    - name: name',
        '    - name: ort',
        '  key: kuerzel',
        '  display: name',
        '  lastId: 2000',
      ],
      kunden,
    ),
  );
  const bestellung = lege(
    wurzel,
    'Bestellung.md',
    tabelle(
      [
        'db-table:',
        '  fields:',
        '    - name: kunde',
        '      type: record',
        '      options:',
        '        table: Kunden',
        '    - name: menge',
        '      type: number',
        "      check: 'value > 0'",
        '  lastId: 2000',
      ],
      verweise,
    ),
  );
  return { wurzel, s: sicht({ tabellen: [kopf, bestellung] }) };
}

describe('Konsistenz-Prüfung: zweitausend Datensätze (AK6, B5)', () => {
  it('prüft alle viertausend Datensätze vollständig und ohne Befund', async () => {
    const { wurzel, s } = mengengeruest();
    const ergebnis = await pruefe(wurzel, s);
    expect(ergebnis.status).toBe('ready');
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.tabellen.map((t) => t.datensaetze)).toEqual([2000, 2000]);
  });
});

// Nach dem Vorbild der Wertehilfe (`db-datensaetze-kanal.test.js`): Die Messung
// läuft nur auf Zuruf und nie unter dem Gate, weil eine Zeit-Grenze unter fremder
// Last auf dem Rechner zum Flake würde. Aufruf:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/db-konsistenz-pruefung.test.js`.
describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Konsistenz-Prüfung (4T-001944, AK6)', () => {
  it('misst die Prüfung bei zweitausend Datensätzen und zweitausend Verweisen', async () => {
    const { wurzel, s } = mengengeruest();
    await pruefe(wurzel, s);
    const dauern = [];
    const gemeldet = [];
    for (let lauf = 0; lauf < 5; lauf++) {
      const start = performance.now();
      const ergebnis = await pruefe(wurzel, s);
      dauern.push(performance.now() - start);
      gemeldet.push(ergebnis.dauerMs);
      expect(ergebnis.tabellen.map((t) => t.datensaetze)).toEqual([2000, 2000]);
    }
    dauern.sort((a, b) => a - b);

    // Die Zeile ist das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
    // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
    // eslint-disable-next-line no-console
    console.log(
      `Messlauf Konsistenz-Prüfung: 2000 Datensätze und 2000 Verweise, Median ` +
        `${dauern[2].toFixed(1)} ms (Läufe ${dauern.map((d) => d.toFixed(1)).join(', ')} ms; ` +
        `dauerMs ${gemeldet.join(', ')})`,
    );
  });
});
