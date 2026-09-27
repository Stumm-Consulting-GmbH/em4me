// 4T-001926 (Epic 3E-000256, Bauplan B7): Das Regel-Werk der
// Schreib-Schnittstelle — Prüf-Naht, Befund-Form, Ersetzungen, Lage-Katalog und
// Verdrahtung.
//
// **Gegenstand ist die Naht, nicht eine Regel.** Die Regel-Module entstehen in
// den folgenden Vorgängen des Epics; hier stehen Fake-Regeln, die Befunde und
// Ersetzungen liefern oder werfen. Geprüft wird an einer echten
// Schreib-Schnittstelle mit denselben Nähten wie in `db-record-auftrag.test.js`
// (echte Sperr-Verwaltung, Klammer und Wiederanlauf) und am echten Dateisystem
// in temporären Ordnern: Ob ein Befund den Auftrag abweist und ob eine
// Ersetzung in der Datei ankommt, entscheidet die Datei, nicht eine Attrappe.
//
// **Spione stehen nur dort, wo ein Ausbleiben nachzuweisen ist**: der Zähler der
// Fake-Regel im Aus-Zustand und bei einem abweichenden Stand.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import {
  REGEL_LAGEN,
  regelBefund,
  erzeugePruefNaht,
  wendeErsetzungenAn,
} from '../../src/main/database/record-regeln.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegPfadFuer } from '../../src/main/database/change-log.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FRAGMENTE = SPRACHEN.map((code) => ({
  code,
  werte: JSON.parse(quelltext(`src/i18n/fragments/${code}/database.json`)),
}));

const VERDRAHTUNG = quelltext('src/main/app/wiring.js');

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-regelwerk-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

// Eine Tabellen-Datei mit drei Feldern, in der Gestalt der Nachbar-Prüfdatei:
// `Name` trägt die Pflicht-Angabe, `Anzahl` den Typ `number`.
function tabelle(records, lastId) {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '      required: true',
    '    - name: Ort',
    '    - name: Anzahl',
    '      type: number',
    `  lastId: ${lastId}`,
    '---',
    '',
    '```perspective-records',
  ];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(
      `|- id="${record.id}"`,
      `| ${record.name}`,
      `| ${record.ort}`,
      `| ${record.anzahl}`,
    );
  });
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel', anzahl: '3' };

function gezeigt(record) {
  return { Name: record.name, Ort: record.ort, Anzahl: record.anzahl };
}

function aendere(id, erwartet, werte) {
  return { tabelle: 'Kunden.md', art: 'update', id, erwartet, werte };
}

function lege(wurzel, inhalt) {
  const ziel = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

// Dieselben Nähte wie in `db-record-auftrag.test.js` und in der Verdrahtung.
function schnittstelle(zusatz = {}) {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-09-24T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
    ...zusatz,
  });
}

// Eine Fake-Regel mit Zähler. `antwort` ist ein Wert oder eine Funktion über den
// Kontext; `gesehen` sammelt die Kontexte der Aufrufe.
function fakeRegel(name, antwort) {
  const regel = {
    name,
    gesehen: [],
    pruefe(kontext) {
      regel.gesehen.push(kontext);
      return typeof antwort === 'function' ? antwort(kontext) : antwort;
    },
  };
  return regel;
}

// Eine Schnittstelle, deren Naht aus der Fabrik mit den übergebenen Regeln stammt.
function mitRegeln(regeln) {
  return schnittstelle({ pruefNaht: erzeugePruefNaht({ regeln }) });
}

// --- AK1: die Naht ohne und mit Regeln ------------------------------------------------------

describe('Regel-Werk: die Prüf-Naht sammelt in fester Reihenfolge (4T-001926, AK1)', () => {
  it('AK1 lässt ohne Regel-Module einen gültigen Auftrag durch', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);

    const ergebnis = await mitRegeln([]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(pfad)).toBe(vorher.replace('| Basel', '| Chur'));
    // Die leere Naht selbst: kein Befund, keine Ersetzung.
    expect(
      await erzeugePruefNaht()({ anweisungen: [], schritte: [], bestaende: new Map() }),
    ).toEqual({ befunde: [], ersetzungen: [] });
  });

  it('AK1 AK2 meldet die Befunde zweier Regeln in der übergebenen Reihenfolge und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);
    const befundA = regelBefund(REGEL_LAGEN.pruefregelVerletzt, {
      position: 0,
      tabelle: 'Kunden.md',
      id: 'r-00001',
      feld: 'Ort',
      wert: 'Chur',
      regel: 'nichtChur',
      meldung: 'Chur ist nicht zulässig.',
    });
    const befundB = regelBefund(REGEL_LAGEN.schluesselDoppeltImBestand, {
      position: 0,
      tabelle: 'Kunden.md',
      id: 'r-00001',
      felder: ['Name'],
      wert: 'Anna',
      anzeige: 'Anna (r-00007)',
    });

    const ergebnis = await mitRegeln([
      fakeRegel('erste', { befunde: [befundA] }),
      fakeRegel('zweite', { befunde: [befundB] }),
    ]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([
      'auftragPruefBefund',
      'auftragPruefBefund',
    ]);
    expect(ergebnis.lagen.map((lage) => lage.naht.code)).toEqual([
      REGEL_LAGEN.pruefregelVerletzt,
      REGEL_LAGEN.schluesselDoppeltImBestand,
    ]);
    // Unverändert durchgereicht, als dasselbe Objekt, und die Hülle nennt die
    // Stelle des Befunds.
    expect(ergebnis.lagen[0].naht).toBe(befundA);
    expect(ergebnis.lagen[1].naht).toBe(befundB);
    expect(ergebnis.lagen[0]).toMatchObject({ position: 0, tabelle: 'Kunden.md', id: 'r-00001' });
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK1 reicht Bereichs-Wurzel, Tabellen-Sicht und Dateizugriff an jedes Modul durch', async () => {
    const wurzel = bereich();
    lege(wurzel, tabelle([ANNA], 1));
    const tabellenSicht = () => ({ status: 'ready', sicht: {} });
    const fsp = { readFile: async () => '' };
    const regel = fakeRegel('beobachter', {});

    await schnittstelle({
      pruefNaht: erzeugePruefNaht({ regeln: [regel], tabellenSicht, fsp }),
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(regel.gesehen).toHaveLength(1);
    const kontext = regel.gesehen[0];
    expect(kontext.bereichsWurzel).toBe(wurzel);
    expect(kontext.tabellenSicht).toBe(tabellenSicht);
    expect(kontext.fsp).toBe(fsp);
    expect(kontext.anweisungen).toHaveLength(1);
    expect(kontext.schritte).toHaveLength(1);
    expect(kontext.bestaende.has('Kunden.md')).toBe(true);
    expect(kontext.ersetzungen).toEqual([]);
  });
});

// --- B2: ein defektes Regel-Modul lässt nie still durch -------------------------------------

describe('Regel-Werk: ein defektes Regel-Modul weist ab (4T-001926, B2)', () => {
  it('B2 macht aus einem Wurf den Befund regelUnerwartet und fragt die folgende Regel trotzdem', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);
    const danach = fakeRegel('danach', {});

    const ergebnis = await mitRegeln([
      fakeRegel('kaputt', () => {
        throw new Error('Katalog kaputt');
      }),
      danach,
    ]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.unerwartet,
      regel: 'kaputt',
      grund: 'Katalog kaputt',
    });
    expect(danach.gesehen).toHaveLength(1);
    expect(lies(pfad)).toBe(vorher);
  });

  it('B2 weist eine unbrauchbare Antwort und einen Code außerhalb des Katalogs ab', async () => {
    const naht = erzeugePruefNaht({
      regeln: [
        fakeRegel('ohneAntwort', undefined),
        fakeRegel('fremderCode', { befunde: [{ code: 'regelErfunden', position: 0 }] }),
        fakeRegel('keineListe', { befunde: 'nein' }),
        fakeRegel('schiefeErsetzung', { ersetzungen: [{ position: 0, feld: 'Ort', wert: 7 }] }),
      ],
    });

    const { befunde, ersetzungen } = await naht({ anweisungen: [], schritte: [] });

    expect(befunde.map((b) => [b.code, b.regel, b.grund])).toEqual([
      [REGEL_LAGEN.unerwartet, 'ohneAntwort', 'antwortUngueltig'],
      [REGEL_LAGEN.unerwartet, 'fremderCode', 'codeUnbekannt'],
      [REGEL_LAGEN.unerwartet, 'keineListe', 'antwortUngueltig'],
      [REGEL_LAGEN.unerwartet, 'schiefeErsetzung', 'ersetzungUngueltig'],
    ]);
    expect(ersetzungen).toEqual([]);
  });

  it('B2 verweigert den Aufbau mit einem Modul ohne pruefe, ohne Namen oder ohne Liste', () => {
    expect(() => erzeugePruefNaht({ regeln: {} })).toThrow(TypeError);
    expect(() => erzeugePruefNaht({ regeln: [{ name: 'x' }] })).toThrow(TypeError);
    expect(() => erzeugePruefNaht({ regeln: [{ pruefe: () => ({}) }] })).toThrow(TypeError);
    expect(() => erzeugePruefNaht({ tabellenSicht: 'nein' })).toThrow(TypeError);
    expect(() => regelBefund('regelErfunden', {})).toThrow(TypeError);
  });
});

// --- AK4: die Ersetzungen ---------------------------------------------------------------------

describe('Regel-Werk: Ersetzungen wirken auf die geschriebenen Werte (4T-001926, AK4, B3)', () => {
  it('AK4 schreibt den ersetzten Wert, und der Stand-Vergleich misst weiter am ursprünglichen', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);

    // Die Erwartung nennt den ursprünglichen Stand «Basel»; der Auftrag setzt
    // «Chur», die Regel ersetzt ihn durch «Zürich». Die Schreibweise des Feldes
    // weicht absichtlich ab: Verglichen wird wie in der Feld-Karte.
    const ergebnis = await mitRegeln([
      fakeRegel('ersetzer', { ersetzungen: [{ position: 0, feld: 'ort', wert: 'Zürich' }] }),
    ]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(pfad)).toBe(vorher.replace('| Basel', '| Zürich'));
    expect(ergebnis.ergebnisse[0].stand).toMatchObject({ Ort: 'Zürich' });
  });

  it('AK4 lässt einen abweichenden Stand abweisen, bevor die Naht überhaupt gefragt wird', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);
    const regel = fakeRegel('ersetzer', {
      ersetzungen: [{ position: 0, feld: 'Ort', wert: 'Basel' }],
    });

    const ergebnis = await mitRegeln([regel]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', { ...gezeigt(ANNA), Ort: 'Bern' }, { Ort: 'Chur' })],
    });

    expect(ergebnis.code).toBe(LAGEN.standWeichtAb);
    expect(regel.gesehen).toHaveLength(0);
    expect(lies(pfad)).toBe(vorher);
  });

  it('AK4 weist eine Ersetzung auf ein nicht genanntes Feld ab und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);

    const ergebnis = await mitRegeln([
      fakeRegel('uebergriff', { ersetzungen: [{ position: 0, feld: 'Anzahl', wert: '9' }] }),
    ]).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen[0].code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.unerwartet,
      position: 0,
      feld: 'Anzahl',
      regel: 'uebergriff',
      grund: 'ersetzungFeldNichtGenannt',
    });
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('B2 zeigt der zweiten Regel die Ersetzung der ersten', async () => {
    const zweite = fakeRegel('zweite', {});
    const naht = erzeugePruefNaht({
      regeln: [
        fakeRegel('erste', { ersetzungen: [{ position: 0, feld: 'Ort', wert: 'X' }] }),
        zweite,
      ],
    });

    const { ersetzungen } = await naht({ anweisungen: [], schritte: [] });

    expect(zweite.gesehen[0].ersetzungen).toEqual([
      { position: 0, feld: 'Ort', wert: 'X', regel: 'erste' },
    ]);
    expect(ersetzungen).toEqual([{ position: 0, feld: 'Ort', wert: 'X', regel: 'erste' }]);
  });

  it('B3 wendet keine Ersetzung an, wenn eine unzulässig ist', () => {
    const anweisungen = [
      { position: 0, tabelle: 'Kunden.md', id: 'r-00001', werte: { Ort: 'Chur' } },
    ];

    const befunde = wendeErsetzungenAn(anweisungen, [
      { position: 0, feld: 'Ort', wert: 'Zürich' },
      { position: 3, feld: 'Ort', wert: 'Bern' },
    ]);

    expect(befunde.map((b) => b.grund)).toEqual(['ersetzungPositionUnbekannt']);
    expect(anweisungen[0].werte).toEqual({ Ort: 'Chur' });
    expect(wendeErsetzungenAn(anweisungen, undefined)).toEqual([]);
    expect(wendeErsetzungenAn(anweisungen, 'nein')[0].grund).toBe('ersetzungUngueltig');
  });
});

// --- AK3: die Anwender-Texte ---------------------------------------------------------------

describe('Regel-Werk: je Regel-Lage ein Text in allen fünf Sprachen (4T-001926, AK3)', () => {
  it('AK3 führt für jeden der zwölf Codes einen nicht leeren Text in jedem Fragment', () => {
    const codes = Object.values(REGEL_LAGEN);
    expect(codes).toHaveLength(13);
    const fehlend = [];
    for (const { code: sprache, werte } of FRAGMENTE) {
      for (const code of codes) {
        const text = werte[`database.auftrag.${code}`];
        if (typeof text !== 'string' || text.trim() === '') fehlend.push(`${sprache}: ${code}`);
      }
    }
    expect(fehlend).toEqual([]);
    // Gegenprobe: Ein erfundener Code fehlte in jedem Fragment.
    expect(
      FRAGMENTE.every(({ werte }) => werte['database.auftrag.regelErfunden'] === undefined),
    ).toBe(true);
  });
});

// --- AK6: der Aus-Zustand ------------------------------------------------------------------

describe('Regel-Werk: im Aus-Zustand der Erweiterung läuft keine Regel (4T-001926, AK6)', () => {
  it('AK6 verweigert vor der Naht, und die Fake-Regel wird nie gefragt', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, tabelle([ANNA], 1));
    const vorher = lies(pfad);
    const regel = fakeRegel('zaehler', {});

    const ergebnis = await schnittstelle({
      erweiterungAktiv: () => false,
      pruefNaht: erzeugePruefNaht({ regeln: [regel] }),
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.erweiterungAus });
    expect(regel.gesehen).toHaveLength(0);
    expect(lies(pfad)).toBe(vorher);
  });
});

// --- AK5: die Verdrahtung ------------------------------------------------------------------

describe('Regel-Werk: die Verdrahtung reicht die Naht genau einmal herein (4T-001926, AK5)', () => {
  it('AK5 baut die Naht einmal und reicht sie der Schreib-Schnittstelle', () => {
    expect(VERDRAHTUNG).toMatch(
      /const \{ erzeugePruefNaht \} = require\('\.\.\/database\/record-regeln'\);/,
    );
    expect(VERDRAHTUNG.match(/erzeugePruefNaht\(/g)).toHaveLength(1);
    expect(VERDRAHTUNG).toMatch(/erzeugeSchreibSchnittstelle\(\{[^}]*\n\s*pruefNaht,\n\s*\}\);/);
    // Die Tabellen-Sicht ist die des Datenbank-Kanals, nach Bereichs-Wurzel.
    expect(VERDRAHTUNG).toContain(
      'tabellenSicht: (bereichsWurzel) => backlinks.datenbankSicht(null, bereichsWurzel)',
    );
    expect(VERDRAHTUNG.length).toBeGreaterThan(1000);
  });
});
