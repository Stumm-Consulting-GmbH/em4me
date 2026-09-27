// 4T-001945 (Epic 3E-000257, Bauplan B4; AK1 bis AK3): Der Verwendungsnachweis
// an den drei Prüf-Anwendungen des Konzepts — Vorrat (Kopf und Positionen, auch
// in einem Folge-Segment), Ahnen (Selbstbezug) und Medien-Ausleihe
// (Zwischentabelle, Hand-Verweis über den fachlichen Schlüssel).
//
// **Echtes Dateisystem in temporären Ordnern** (Muster
// `db-regel-loeschschutz.test.js`, dessen Aufbau-Helfer hier übernommen sind).
// Allein die Tabellen-Sicht des Index ist ein Fake, weil sie die Menge der
// Tabellen und Masken-Dateien festlegt und der Index hier nicht der Gegenstand
// ist.
//
// **Die Gleichheit mit dem Lösch-Schutz** wird an der echten
// Schreib-Schnittstelle gemessen: Dieselbe Ausgangslage, einmal als Vorschau,
// einmal als abgewiesenes Löschen, muss dieselben Tabellen, Felder, dieselbe
// Zahl und denselben ersten Abhängigen ergeben.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  verwendungDerTabelle,
  verwendungDesDatensatzes,
} from '../../src/main/database/verwendungsnachweis.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { loeschschutzRegel } from '../../src/main/database/record-regel-loeschschutz.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

// --- Aufbau ---------------------------------------------------------------------------------

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verwendung-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function feldZeilen({ name, type, table }) {
  const zeilen = [`    - name: ${name}`];
  if (table !== undefined)
    zeilen.push('      type: record', '      options:', `        table: ${table}`);
  else if (type !== undefined) zeilen.push(`      type: ${type}`);
  return zeilen;
}

function definitionsZeilen({ felder, key, display, lastId }) {
  const zeilen = ['db-table:', '  fields:', ...felder.flatMap(feldZeilen)];
  if (Array.isArray(key)) zeilen.push('  key:', ...key.map((name) => `    - ${name}`));
  else if (key !== undefined) zeilen.push(`  key: ${key}`);
  if (display !== undefined) zeilen.push(`  display: ${display}`);
  zeilen.push(`  lastId: ${lastId}`);
  return zeilen;
}

function datensatzZeilen([id, ...texte]) {
  return [`|- id="${id}"`, ...texte.map((text) => `| ${text}`)];
}

function tabelle({ felder, key, display, records = [], lastId = records.length }) {
  const block = [];
  records.forEach((record, i) => {
    if (i > 0) block.push('');
    block.push(...datensatzZeilen(record));
  });
  return [
    '---',
    ...definitionsZeilen({ felder, key, display, lastId }),
    '---',
    '',
    '```perspective-records',
    ...block,
    '```',
    '',
  ].join('\n');
}

function maske(tabellenName) {
  return [
    '---',
    'title: Maske',
    'db-form:',
    `  table: ${tabellenName}`,
    '---',
    '',
    '{{name}}',
    '',
  ].join('\n');
}

// Die Tabellen-Sicht des Index als Fake: Kopf-Dateien mit der Marke `table`,
// Masken-Dateien mit der Marke `form`. Folge-Segmente tragen keine Marke.
function sichtMit(tabellen, masken = []) {
  return {
    dbKindsPerFile: new Map([
      ...tabellen.map((pfad) => [pfad, ['table']]),
      ...masken.map((pfad) => [pfad, ['form']]),
    ]),
  };
}

// --- Die drei Miniaturen ----------------------------------------------------------------------

const KOPF_FELDER = [{ name: 'nummer' }, { name: 'datum', type: 'date' }];
const POSITION_FELDER = [{ name: 'kopf', table: 'Kopf' }, { name: 'artikel' }];

function vorrat() {
  const wurzel = bereich();
  const kopf = lege(
    wurzel,
    'Kopf.md',
    tabelle({
      felder: KOPF_FELDER,
      key: 'nummer',
      records: [
        ['r-00001', 'K-1', '2026-09-01'],
        ['r-00002', 'K-2', '2026-09-02'],
      ],
    }),
  );
  const position = lege(
    wurzel,
    'Position.md',
    tabelle({
      felder: POSITION_FELDER,
      display: 'artikel',
      records: [
        ['r-00001', 'r-00001', 'Schraube'],
        ['r-00002', 'r-00001', 'Mutter'],
        ['r-00003', 'r-00002', 'Scheibe'],
      ],
    }),
  );
  return { wurzel, kopf, position, sicht: sichtMit([kopf, position]) };
}

const PERSON_FELDER = [
  { name: 'name' },
  { name: 'vater', table: 'Person' },
  { name: 'pate', table: 'Person' },
];

function ahnen(records) {
  const wurzel = bereich();
  const person = lege(
    wurzel,
    'Person.md',
    tabelle({ felder: PERSON_FELDER, display: 'name', records }),
  );
  return { wurzel, person, sicht: sichtMit([person]) };
}

const MEDIUM_FELDER = [{ name: 'signatur' }, { name: 'titel' }];
const LEUTE_FELDER = [{ name: 'kuerzel' }, { name: 'name' }];
const AUSLEIHE_FELDER = [
  { name: 'medium', table: 'Medium' },
  { name: 'person', table: 'Person' },
  { name: 'datum', type: 'date' },
  { name: 'notiz' },
];
const HEUTE = '2026-09-24';

function ausleihe(leihen) {
  const wurzel = bereich();
  const medium = lege(
    wurzel,
    'Bibliothek/Medium.md',
    tabelle({
      felder: MEDIUM_FELDER,
      key: 'signatur',
      display: 'titel',
      records: [
        ['r-00001', 'M-17', 'Faust'],
        ['r-00002', 'M-18', 'Woyzeck'],
      ],
    }),
  );
  const person = lege(
    wurzel,
    'Bibliothek/Person.md',
    tabelle({
      felder: LEUTE_FELDER,
      key: 'kuerzel',
      records: [
        ['r-00001', 'ab', 'Anna'],
        ['r-00002', 'cd', 'Bert'],
      ],
    }),
  );
  const leihe = lege(wurzel, 'Ausleihe.md', tabelle({ felder: AUSLEIHE_FELDER, records: leihen }));
  return { wurzel, medium, person, leihe, tabellen: [medium, person, leihe] };
}

function tabellenAuskunft(p, tabelleAngabe) {
  return verwendungDerTabelle({ fsp, wurzel: p.wurzel, sicht: p.sicht, tabelle: tabelleAngabe });
}

function datensatzAuskunft(p, tabelleAngabe, kennung) {
  return verwendungDesDatensatzes({
    fsp,
    wurzel: p.wurzel,
    sicht: p.sicht,
    tabelle: tabelleAngabe,
    kennung,
  });
}

// --- Tabellen-Ebene (AK1, AK3) ----------------------------------------------------------------

describe('Verwendung einer Tabelle (4T-001945, AK1, AK3)', () => {
  it('nennt die Zwischentabelle der Medien-Ausleihe bei beiden Zielen mit ihrer Spalte', async () => {
    const a = ausleihe([['r-00001', 'r-00001', 'r-00002', HEUTE, '']]);
    const p = { ...a, sicht: sichtMit(a.tabellen) };

    const medium = await tabellenAuskunft(p, 'Medium');
    expect(medium).toEqual({
      status: 'ready',
      tabelle: 'Medium',
      pfad: a.medium,
      tabellen: [{ name: 'Ausleihe', pfad: a.leihe, felder: ['medium'] }],
      masken: [],
    });
    const person = await tabellenAuskunft(p, a.person);
    expect(person.tabellen).toEqual([{ name: 'Ausleihe', pfad: a.leihe, felder: ['person'] }]);
    // Die Antwort übersteht den Struktur-Klon der Prozess-Grenze unverändert.
    expect(structuredClone(medium)).toEqual(medium);
  });

  it('nennt eine Tabelle ohne Verwender als nicht verwendet: beide Listen leer', async () => {
    const a = ausleihe([]);
    const p = { ...a, sicht: sichtMit(a.tabellen) };
    const antwort = await tabellenAuskunft(p, 'Ausleihe');
    expect(antwort.status).toBe('ready');
    expect(antwort.tabellen).toEqual([]);
    expect(antwort.masken).toEqual([]);
  });

  it('nennt beim Selbstbezug der Ahnen die eigene Tabelle mit beiden Verweis-Spalten', async () => {
    const p = ahnen([['r-00001', 'Adam', '', '']]);
    const antwort = await tabellenAuskunft(p, 'person');
    expect(antwort.tabellen).toEqual([
      { name: 'Person', pfad: p.person, felder: ['vater', 'pate'] },
    ]);
  });

  it('nennt die Masken-Dateien der Tabelle und keine fremde oder verwaiste', async () => {
    const a = ausleihe([]);
    const eigene = lege(a.wurzel, 'Bibliothek/Medium Form.md', maske('Medium'));
    const klein = lege(a.wurzel, 'Masken/Katalog.md', maske('medium'));
    const fremde = lege(a.wurzel, 'Bibliothek/Person Form.md', maske('Person'));
    const verwaist = lege(a.wurzel, 'Alt Form.md', maske('Gibt es nicht'));
    const kaputt = lege(a.wurzel, 'Kaputt Form.md', '---\ndb-form: [\n---\n');
    const p = { ...a, sicht: sichtMit(a.tabellen, [eigene, klein, fremde, verwaist, kaputt]) };

    const antwort = await tabellenAuskunft(p, 'Medium');
    expect(antwort.masken.map((m) => m.pfad).sort()).toEqual([eigene, klein].sort());
    expect(antwort.tabellen).toEqual([{ name: 'Ausleihe', pfad: a.leihe, felder: ['medium'] }]);
  });

  it('AK3 zählt einen Prosa-Verweis in einer Text-Spalte oder einem Dokument nicht', async () => {
    const a = ausleihe([]);
    const prosa = lege(
      a.wurzel,
      'Leseliste.md',
      tabelle({
        felder: [{ name: 'titel' }, { name: 'hinweis' }],
        records: [['r-00001', 'Faust', 'siehe [[Medium#^r-00001]] und Medium']],
      }),
    );
    lege(a.wurzel, 'Notiz.md', '# Notiz\n\nFaust steht unter [[Medium#^r-00001]].\n');
    const p = { ...a, sicht: sichtMit([...a.tabellen, prosa]) };

    const tabellenEbene = await tabellenAuskunft(p, 'Medium');
    expect(tabellenEbene.tabellen.map((t) => t.name)).toEqual(['Ausleihe']);
    const datensatzEbene = await datensatzAuskunft(p, 'Medium', 'r-00001');
    expect(datensatzEbene.datensaetze).toEqual([]);
  });
});

// --- Datensatz-Ebene (AK2, AK3) ---------------------------------------------------------------

describe('Verwendung eines Datensatzes (4T-001945, AK2, AK3)', () => {
  it('nennt die verweisenden Datensätze mit Tabelle, Feld, Kennung und Anzeige-Form', async () => {
    const p = vorrat();
    const antwort = await datensatzAuskunft(p, 'Kopf', 'r-00001');
    expect(antwort).toEqual({
      status: 'ready',
      tabelle: 'Kopf',
      pfad: p.kopf,
      kennung: 'r-00001',
      datensaetze: [
        {
          tabelle: 'Position',
          pfad: p.position,
          feld: 'kopf',
          kennung: 'r-00001',
          anzeige: 'Schraube',
        },
        {
          tabelle: 'Position',
          pfad: p.position,
          feld: 'kopf',
          kennung: 'r-00002',
          anzeige: 'Mutter',
        },
      ],
    });
    // Die Kennung darf in Kurzform kommen.
    expect((await datensatzAuskunft(p, p.kopf, 'r-2')).datensaetze).toEqual([
      {
        tabelle: 'Position',
        pfad: p.position,
        feld: 'kopf',
        kennung: 'r-00003',
        anzeige: 'Scheibe',
      },
    ]);
  });

  it('findet den verweisenden Datensatz in einem Folge-Segment', async () => {
    const wurzel = bereich();
    const kopf = lege(
      wurzel,
      'Kopf.md',
      tabelle({ felder: KOPF_FELDER, key: 'nummer', records: [['r-00001', 'K-1', '2026-09-01']] }),
    );
    const position = lege(
      wurzel,
      'Position.md',
      [
        '---',
        'doc-part: v1|1|Position',
        ...definitionsZeilen({ felder: POSITION_FELDER, display: 'artikel', lastId: 2 }),
        '---',
        '',
        '```perspective-records',
        ...datensatzZeilen(['r-00001', '', 'Schraube']),
      ].join('\n'),
    );
    lege(
      wurzel,
      'Position•part-00002.md',
      [
        '---',
        'doc-part: v1|2|Position',
        '---',
        ...datensatzZeilen(['r-00002', 'r-00001', 'Mutter']),
        '```',
        '',
      ].join('\n'),
    );

    const antwort = await datensatzAuskunft(
      { wurzel, sicht: sichtMit([kopf, position]) },
      'Kopf',
      'r-00001',
    );
    expect(antwort.datensaetze).toEqual([
      { tabelle: 'Position', pfad: position, feld: 'kopf', kennung: 'r-00002', anzeige: 'Mutter' },
    ]);
  });

  it('zählt einen Hand-Verweis über den einteiligen Schlüssel-Wert', async () => {
    const a = ausleihe([
      ['r-00001', 'M-18', 'r-00001', HEUTE, ''],
      ['r-00002', 'r-2', 'cd', HEUTE, ''],
    ]);
    const p = { ...a, sicht: sichtMit(a.tabellen) };

    const woyzeck = await datensatzAuskunft(p, 'Medium', 'r-00002');
    expect(woyzeck.datensaetze.map((d) => [d.tabelle, d.feld, d.kennung])).toEqual([
      ['Ausleihe', 'medium', 'r-00001'],
      ['Ausleihe', 'medium', 'r-00002'],
    ]);
    // Die Zwischentabelle zeigt auch auf die Person, über Kennung und Kürzel.
    const bert = await datensatzAuskunft(p, 'Person', 'r-00002');
    expect(bert.datensaetze.map((d) => [d.feld, d.kennung])).toEqual([['person', 'r-00002']]);
    const anna = await datensatzAuskunft(p, 'Person', 'r-00001');
    expect(anna.datensaetze.map((d) => [d.feld, d.kennung])).toEqual([['person', 'r-00001']]);
    // Ohne Anzeige-Form ist die Anzeige leer und nicht erfunden.
    expect(anna.datensaetze[0].anzeige).toBeNull();
  });

  it('nennt beim Selbstbezug jedes Feld einzeln und den Datensatz selbst nicht', async () => {
    const p = ahnen([
      ['r-00001', 'Adam', '', ''],
      ['r-00002', 'Bert', 'r-00001', 'r-00001'],
      ['r-00003', 'Cara', '', 'r-00001'],
      ['r-00004', 'Ich', '', 'r-00004'],
    ]);
    const adam = await datensatzAuskunft(p, 'Person', 'r-00001');
    expect(adam.datensaetze.map((d) => [d.kennung, d.feld, d.anzeige])).toEqual([
      ['r-00002', 'vater', 'Bert'],
      ['r-00002', 'pate', 'Bert'],
      ['r-00003', 'pate', 'Cara'],
    ]);
    expect((await datensatzAuskunft(p, 'Person', 'r-00004')).datensaetze).toEqual([]);
  });

  it('nennt einen Datensatz ohne Verwender als nicht verwendet', async () => {
    const a = ausleihe([['r-00001', 'r-00002', 'r-00001', HEUTE, '']]);
    const p = { ...a, sicht: sichtMit(a.tabellen) };
    const faust = await datensatzAuskunft(p, 'Medium', 'r-00001');
    expect(faust.status).toBe('ready');
    expect(faust.datensaetze).toEqual([]);
  });
});

// --- Gleichheit mit dem Lösch-Schutz (AK2) ----------------------------------------------------

const ZEITPUNKT = '2026-09-24T08:00:00Z';

function schnittstelleMitSchutz(sicht) {
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
    jetzt: () => ZEITPUNKT,
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
    pruefNaht: erzeugePruefNaht({
      regeln: [loeschschutzRegel],
      tabellenSicht: () => ({ status: 'ready', sicht }),
      fsp,
    }),
  });
}

// Die Vorschau in der Gestalt der Befunde des Lösch-Schutzes: je abhängiger
// Tabelle Felder, Zahl der verschiedenen Datensätze und der erste.
function alsBefunde(datensaetze) {
  const jeTabelle = new Map();
  for (const d of datensaetze) {
    if (!jeTabelle.has(d.tabelle)) jeTabelle.set(d.tabelle, { felder: [], kennungen: [] });
    const eintrag = jeTabelle.get(d.tabelle);
    if (!eintrag.felder.includes(d.feld)) eintrag.felder.push(d.feld);
    if (!eintrag.kennungen.includes(d.kennung)) eintrag.kennungen.push(d.kennung);
  }
  return [...jeTabelle].map(([zieltabelle, e]) => ({
    zieltabelle,
    felder: e.felder,
    anzahl: e.kennungen.length,
    erster: e.kennungen[0],
  }));
}

async function vergleicheMitLoeschschutz(p, tabelleAngabe, id, erwartet) {
  const vorschau = await datensatzAuskunft(p, tabelleAngabe, id);
  const ergebnis = await schnittstelleMitSchutz(p.sicht).fuehreAuftragAus(p.wurzel, {
    anweisungen: [{ tabelle: tabelleAngabe, art: 'delete', id, erwartet }],
  });
  const befunde = ergebnis.ok
    ? []
    : ergebnis.lagen
        .filter((lage) => lage.naht && lage.naht.code === REGEL_LAGEN.loeschenAbhaengige)
        .map(({ naht }) => ({
          zieltabelle: naht.zieltabelle,
          felder: naht.felder,
          anzahl: naht.anzahl,
          erster: naht.erster,
        }));
  expect(alsBefunde(vorschau.datensaetze), `${tabelleAngabe} ${id}`).toEqual(befunde);
  return befunde;
}

describe('Verwendungsnachweis und Lösch-Schutz geben dieselbe Menge (4T-001945, AK2)', () => {
  it('Vorrat, Ahnen und Medien-Ausleihe: dieselben Tabellen, Felder, Zahlen und ersten', async () => {
    const v = vorrat();
    expect(
      await vergleicheMitLoeschschutz(v, 'Kopf.md', 'r-00001', {
        nummer: 'K-1',
        datum: '2026-09-01',
      }),
    ).toHaveLength(1);

    const a = ahnen([
      ['r-00001', 'Adam', '', ''],
      ['r-00002', 'Bert', 'r-00001', 'r-00001'],
      ['r-00003', 'Cara', 'r-1', ''],
      ['r-00004', 'Ich', '', 'r-00004'],
    ]);
    expect(
      await vergleicheMitLoeschschutz(a, 'Person.md', 'r-00001', {
        name: 'Adam',
        vater: '',
        pate: '',
      }),
    ).toHaveLength(1);
    // Der Selbstbezug hält das Löschen nicht auf und erscheint nicht in der Vorschau.
    expect(
      await vergleicheMitLoeschschutz(a, 'Person.md', 'r-00004', {
        name: 'Ich',
        vater: '',
        pate: 'r-00004',
      }),
    ).toEqual([]);

    const m = ausleihe([
      ['r-00001', 'M-18', 'r-00001', HEUTE, 'siehe r-00001'],
      ['r-00002', 'r-00002', 'cd', HEUTE, ''],
    ]);
    const mp = { ...m, sicht: sichtMit(m.tabellen) };
    expect(
      await vergleicheMitLoeschschutz(mp, 'Bibliothek/Medium.md', 'r-00002', {
        signatur: 'M-18',
        titel: 'Woyzeck',
      }),
    ).toEqual([{ zieltabelle: 'Ausleihe', felder: ['medium'], anzahl: 2, erster: 'r-00001' }]);
    expect(
      await vergleicheMitLoeschschutz(mp, 'Bibliothek/Medium.md', 'r-00001', {
        signatur: 'M-17',
        titel: 'Faust',
      }),
    ).toEqual([]);
  });
});

// --- Fehlerlagen ------------------------------------------------------------------------------

describe('Verwendungsnachweis: Fehlerlagen (4T-001945, B1)', () => {
  it('ohne Sicht unavailable, bei unbekannter Tabelle und unbekanntem Datensatz eine Lage', async () => {
    const p = vorrat();
    expect(
      await verwendungDerTabelle({ fsp, wurzel: p.wurzel, sicht: null, tabelle: 'Kopf' }),
    ).toEqual({
      status: 'unavailable',
      tabelle: null,
      tabellen: [],
      masken: [],
    });
    expect(
      await verwendungDesDatensatzes({
        fsp,
        wurzel: p.wurzel,
        sicht: null,
        tabelle: 'Kopf',
        kennung: 'r-1',
      }),
    ).toEqual({ status: 'unavailable', tabelle: null, kennung: null, datensaetze: [] });
    expect(await tabellenAuskunft(p, 'Lieferant')).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
    expect(await datensatzAuskunft(p, 'Lieferant', 'r-00001')).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
    for (const kennung of ['r-00009', 'kein-wert']) {
      expect(await datensatzAuskunft(p, 'Kopf', kennung), kennung).toEqual({
        status: 'error',
        code: LAGEN.datensatzUnbekannt,
      });
    }
  });

  it('verlangt den Dateizugriff und liest nur', async () => {
    const p = vorrat();
    await expect(
      verwendungDerTabelle({ wurzel: p.wurzel, sicht: p.sicht, tabelle: 'Kopf' }),
    ).rejects.toThrow(TypeError);
    const vorher = [fs.readFileSync(p.kopf, 'utf8'), fs.readFileSync(p.position, 'utf8')];
    const nurLesen = { readFile: (...args) => fsp.readFile(...args) };
    const antwort = await verwendungDesDatensatzes({
      fsp: nurLesen,
      wurzel: p.wurzel,
      sicht: p.sicht,
      tabelle: 'Kopf',
      kennung: 'r-00001',
    });
    expect(antwort.datensaetze).toHaveLength(2);
    expect([fs.readFileSync(p.kopf, 'utf8'), fs.readFileSync(p.position, 'utf8')]).toEqual(vorher);
  });
});
