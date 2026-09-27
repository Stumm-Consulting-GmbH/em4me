// 4T-001928 (Epic 3E-000256, E5.4, E22.3): Die Verweis-Regel des Regel-Werks
// an den drei Prüf-Anwendungen des Konzepts — Vorrat (Kopf und Positionen),
// Ahnen (Selbstbezug, geteilte Tabelle) und Medien-Ausleihe (Zwischentabelle mit
// zwei Verweisen über den fachlichen Schlüssel).
//
// **Echte Schreib-Schnittstelle, echte Sperr-Verwaltung, echtes Dateisystem** in
// temporären Ordnern (Muster `db-record-auftrag.test.js` und
// `db-regelwerk-naht.test.js`). Die Regel hängt über die echte Fabrik
// `erzeugePruefNaht` an der Schnittstelle; ob ein Verweis abgewiesen und ob eine
// Kennung geschrieben wird, entscheidet die Datei. Allein die Tabellen-Sicht des
// Index ist ein Fake, weil der Index hier nicht der Gegenstand ist: Er liefert
// die Menge der Tabellen, und genau diese Menge legt der Prüffall fest.
//
// **Ein Spion steht nur dort, wo ein Ausbleiben nachzuweisen ist:** Eine
// beobachtende Regel hinter der Verweis-Regel sieht deren Ersetzungen und belegt,
// dass keine mit leerem oder anders geformtem Wert entsteht.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verweis-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

// Ein Feld der Definition. `table` macht es zur Verweis-Spalte.
function feldZeilen({ name, type, table }) {
  const zeilen = [`    - name: ${name}`];
  if (table !== undefined)
    zeilen.push('      type: record', '      options:', `        table: ${table}`);
  else if (type !== undefined) zeilen.push(`      type: ${type}`);
  return zeilen;
}

// Die Definition einer Tabelle: Felder, fachlicher Schlüssel (ein Name oder
// eine Liste) und Hochwasserstand.
function definitionsZeilen({ felder, key, lastId }) {
  const zeilen = ['db-table:', '  fields:', ...felder.flatMap(feldZeilen)];
  if (Array.isArray(key)) zeilen.push('  key:', ...key.map((name) => `    - ${name}`));
  else if (key !== undefined) zeilen.push(`  key: ${key}`);
  zeilen.push(`  lastId: ${lastId}`);
  return zeilen;
}

// Die Zeilen eines Datensatzes; die Zell-Texte stehen in der Reihenfolge der Felder.
function datensatzZeilen([id, ...texte]) {
  return [`|- id="${id}"`, ...texte.map((text) => `| ${text}`)];
}

// Eine ungeteilte Tabelle, die Datensätze mit trennender Leerzeile, wie in der
// Nachbar-Prüfdatei.
function tabelle({ felder, key, lastId = 0, records = [] }) {
  const zeilen = [
    '---',
    ...definitionsZeilen({ felder, key, lastId }),
    '---',
    '',
    '```perspective-records',
  ];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(...datensatzZeilen(record));
  });
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ZEITPUNKT = '2026-09-24T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };

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
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    ...zusatz,
  });
}

// Die Tabellen-Sicht des Index als Fake: bereit, mit genau den genannten
// Kopf-Dateien als Tabellen. Folge-Segmente tragen keine Marke.
function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

// Eine Regel hinter der Verweis-Regel, die allein die Ersetzungen mitliest.
function beobachter() {
  const regel = {
    name: 'beobachter',
    gesehen: [],
    pruefe(kontext) {
      regel.gesehen.push(kontext.ersetzungen);
      return {};
    },
  };
  return regel;
}

// Eine Schnittstelle mit der Verweis-Regel an der echten Naht.
function mitVerweis(tabellenSicht, weitere = []) {
  return schnittstelle({
    pruefNaht: erzeugePruefNaht({ regeln: [verweisRegel, ...weitere], tabellenSicht, fsp }),
  });
}

function neu(tabelleAngabe, werte, id) {
  return { tabelle: tabelleAngabe, art: 'create', ...(id ? { id } : {}), werte };
}

function aendere(tabelleAngabe, id, erwartet, werte) {
  return { tabelle: tabelleAngabe, art: 'update', id, erwartet, werte };
}

function loesche(tabelleAngabe, id, erwartet) {
  return { tabelle: tabelleAngabe, art: 'delete', id, erwartet };
}

function nahtCodes(ergebnis) {
  return ergebnis.lagen.map((lage) => lage.naht.code);
}

// --- Vorrat: Kopf und Positionen ------------------------------------------------------------

const KOPF_FELDER = [{ name: 'nummer' }, { name: 'datum', type: 'date' }];
const POSITION_FELDER = [{ name: 'kopf', table: 'Kopf' }, { name: 'artikel' }];
const KOPF_1 = { nummer: 'K-1', datum: '2026-09-01' };

function vorrat() {
  const wurzel = bereich();
  const kopf = lege(
    wurzel,
    'Kopf.md',
    tabelle({ felder: KOPF_FELDER, lastId: 1, records: [['r-00001', 'K-1', '2026-09-01']] }),
  );
  const position = lege(wurzel, 'Position.md', tabelle({ felder: POSITION_FELDER }));
  return { wurzel, kopf, position, sicht: sichtMit(kopf, position) };
}

describe('Verweis-Regel an der Vorrat-Anwendung (4T-001928, AK1, AK2, AK4, AK5)', () => {
  it('AK2 nimmt Kopf und zwei Positionen in einem Auftrag an, mit der Kennung aus dem Eröffnen', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const s = mitVerweis(sicht);
    const eroeffnet = await s.eroeffneNeuanlage(wurzel, 'Kopf.md');
    expect(eroeffnet).toMatchObject({ ok: true, kennung: 'r-00002' });

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kopf.md', { nummer: 'K-2', datum: '2026-09-24' }, eroeffnet.kennung),
        neu('Position.md', { kopf: eroeffnet.kennung, artikel: 'Schraube' }),
        // Die Kurzform wird auf die aufgefüllte Kennung gebracht.
        neu('Position.md', { kopf: 'r-2', artikel: 'Mutter' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(kopf)).toContain('|- id="r-00002"\n| K-2');
    const nachher = lies(position);
    expect(nachher).toContain('|- id="r-00001"\n| r-00002\n| Schraube');
    expect(nachher).toContain('|- id="r-00002"\n| r-00002\n| Mutter');
    expect(nachher).not.toContain('| r-2\n');
  });

  it('AK1 schreibt eine vorhandene Kennung unverändert und ohne Ersetzung', async () => {
    const { wurzel, position, sicht } = vorrat();
    const zeuge = beobachter();

    const ergebnis = await mitVerweis(sicht, [zeuge]).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Position.md', { kopf: 'r-00001', artikel: 'Schraube' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(position)).toContain('| r-00001\n| Schraube');
    expect(zeuge.gesehen).toEqual([[]]);
  });

  it('AK3 weist jede Position ohne vorhandenen Kopf ab und schreibt nichts', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const vorher = { kopf: lies(kopf), position: lies(position) };

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Position.md', { kopf: 'r-00009', artikel: 'Schraube' }),
        neu('Position.md', { kopf: 'r-8', artikel: 'Mutter' }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    // Gemeldet werden ALLE Verletzungen des Auftrags, nicht nur die erste.
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.pruefBefund, LAGEN.pruefBefund]);
    expect(nahtCodes(ergebnis)).toEqual([
      REGEL_LAGEN.verweisZielFehlt,
      REGEL_LAGEN.verweisZielFehlt,
    ]);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      position: 0,
      tabelle: 'Position.md',
      id: 'r-00001',
      feld: 'kopf',
      wert: 'r-00009',
      zieltabelle: 'Kopf',
    });
    expect(ergebnis.lagen[0].naht.grund).toBeUndefined();
    expect(ergebnis.lagen[1].naht).toMatchObject({ position: 1, wert: 'r-8' });
    expect(lies(kopf)).toBe(vorher.kopf);
    expect(lies(position)).toBe(vorher.position);
  });

  it('AK2 lässt eine im selben Auftrag gelöschte Kennung nicht gelten', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const vorher = { kopf: lies(kopf), position: lies(position) };

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Kopf.md', 'r-00001', KOPF_1),
        neu('Position.md', { kopf: 'r-00001', artikel: 'Schraube' }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisZielFehlt,
      position: 1,
      feld: 'kopf',
      wert: 'r-00001',
      zieltabelle: 'Kopf',
      grund: 'imAuftragGeloescht',
    });
    expect(lies(kopf)).toBe(vorher.kopf);
    expect(lies(position)).toBe(vorher.position);
  });

  it('AK4 schreibt eine leere Verweis-Zelle ohne Pflicht-Angabe, ohne Ersetzung', async () => {
    const { wurzel, position, sicht } = vorrat();
    const zeuge = beobachter();

    const ergebnis = await mitVerweis(sicht, [zeuge]).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Position.md', { kopf: '', artikel: 'Scheibe' })],
    });

    expect(ergebnis.ok).toBe(true);
    // Die leere Zelle steht als bloßer Zell-Marker da.
    expect(lies(position)).toContain('|- id="r-00001"\n|\n| Scheibe');
    // Keine Ersetzung, schon gar keine mit leerem Wert.
    expect(zeuge.gesehen).toEqual([[]]);
  });

  it('AK5 weist ohne bereite Sicht einen Auftrag mit Verweis-Zellen einmal ab und lässt einen ohne durch', async () => {
    const { wurzel, kopf, position } = vorrat();
    const vorher = lies(position);
    const nichtBereit = () => ({ status: 'indexing', sicht: null });

    const abgewiesen = await mitVerweis(nichtBereit).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Position.md', { kopf: 'r-00001', artikel: 'Schraube' }),
        neu('Position.md', { kopf: 'r-00001', artikel: 'Mutter' }),
      ],
    });

    expect(abgewiesen.ok).toBe(false);
    expect(abgewiesen.lagen).toHaveLength(1);
    expect(abgewiesen.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.katalogNichtBereit,
      position: 0,
      tabelle: 'Position.md',
      grund: 'indexing',
    });
    expect(lies(position)).toBe(vorher);

    // Ohne hereingereichte Sicht gibt es keinen Index: derselbe Abweis.
    const ohneSicht = await mitVerweis(undefined).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Position.md', { kopf: 'r-00001', artikel: 'Schraube' })],
    });
    expect(ohneSicht.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.katalogNichtBereit,
      grund: 'unavailable',
    });

    // Ohne Verweis-Zelle, auch mit leerer, fragt die Regel die Sicht nicht.
    const durch = await mitVerweis(nichtBereit).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kopf.md', { nummer: 'K-3', datum: '2026-09-24' }),
        neu('Position.md', { kopf: '', artikel: 'Scheibe' }),
      ],
    });
    expect(durch.ok).toBe(true);
    expect(lies(kopf)).toContain('| K-3');
    expect(lies(position)).toContain('| Scheibe');
  });
});

// --- Ahnen: Selbstbezug und geteilte Tabelle ------------------------------------------------

const PERSON_FELDER = [
  { name: 'name' },
  { name: 'vater', table: 'Person' },
  { name: 'mutter', table: 'Person' },
];

// Eine geteilte Tabelle nach dem Ablage-Format (Muster `db-record-auftrag.test.js`):
// Die Kopf-Datei trägt Definition und öffnenden Zaun, das Folge-Segment beginnt
// mit einem Datensatz-Marker und trägt den schließenden Zaun.
function ahnen() {
  const wurzel = bereich();
  const kopf = lege(
    wurzel,
    'Person.md',
    [
      '---',
      'doc-part: v1|1|Person',
      ...definitionsZeilen({ felder: PERSON_FELDER, lastId: 2 }),
      '---',
      '',
      '```perspective-records',
      ...datensatzZeilen(['r-00001', 'Anna', '', '']),
    ].join('\n'),
  );
  const segment = lege(
    wurzel,
    'Person•part-00002.md',
    [
      '---',
      'doc-part: v1|2|Person',
      '---',
      ...datensatzZeilen(['r-00002', 'Bert', '', '']),
      '```',
      '',
    ].join('\n'),
  );
  return { wurzel, kopf, segment };
}

const ANNA = { name: 'Anna', vater: '', mutter: '' };

describe('Verweis-Regel an der Ahnen-Anwendung (4T-001928, AK2, AK6)', () => {
  it('AK2 nimmt den Selbstbezug eines neuen Datensatzes an', async () => {
    const { wurzel, kopf, segment } = ahnen();
    const s = mitVerweis(sichtMit(kopf));
    const eroeffnet = await s.eroeffneNeuanlage(wurzel, 'Person.md');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu(
          'Person.md',
          { name: 'Cara', vater: eroeffnet.kennung, mutter: 'r-1' },
          eroeffnet.kennung,
        ),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(segment)).toContain('|- id="r-00003"\n| Cara\n| r-00003\n| r-00001');
  });

  it('AK6 findet das Ziel im Folge-Segment der eigenen, geteilten Tabelle', async () => {
    const { wurzel, kopf } = ahnen();

    const ergebnis = await mitVerweis(sichtMit(kopf)).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Person.md', 'r-00001', ANNA, { vater: 'r-2' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(kopf)).toContain('|- id="r-00001"\n| Anna\n| r-00002\n|');
  });

  it('AK6 findet das Ziel im Folge-Segment einer Tabelle außerhalb des Auftrags', async () => {
    const { wurzel, kopf } = ahnen();
    const taufe = lege(
      wurzel,
      'Register/Taufe.md',
      tabelle({ felder: [{ name: 'taeufling', table: 'person' }, { name: 'ort' }] }),
    );
    const vorher = lies(taufe);
    const s = mitVerweis(sichtMit(kopf, taufe));

    const gefunden = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Register/Taufe.md', { taeufling: 'r-00002', ort: 'Basel' })],
    });
    expect(gefunden.ok).toBe(true);
    expect(lies(taufe)).toContain('|- id="r-00001"\n| r-00002\n| Basel');

    // Gegenprobe im selben Bereich: Eine Kennung, die in keinem Segment steht.
    fs.writeFileSync(taufe, vorher, 'utf8');
    const fehlt = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Register/Taufe.md', { taeufling: 'r-00004', ort: 'Basel' })],
    });
    expect(fehlt.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisZielFehlt,
      zieltabelle: 'Person',
      wert: 'r-00004',
    });
    expect(lies(taufe)).toBe(vorher);
  });

  it('AK3 weist einen Schlüssel-Wert ab, wenn die Ziel-Tabelle keinen Schlüssel trägt', async () => {
    const { wurzel, kopf } = ahnen();
    const vorher = lies(kopf);

    const ergebnis = await mitVerweis(sichtMit(kopf)).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Person.md', 'r-00001', ANNA, { mutter: 'Bert' })],
    });

    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisZielFehlt,
      feld: 'mutter',
      wert: 'Bert',
      zieltabelle: 'Person',
      grund: 'keinSchluessel',
    });
    expect(lies(kopf)).toBe(vorher);
  });
});

// --- Medien-Ausleihe: Zwischentabelle über den fachlichen Schlüssel -------------------------

const MEDIUM_FELDER = [{ name: 'signatur' }, { name: 'titel' }];
const LEUTE_FELDER = [{ name: 'kuerzel' }, { name: 'name' }];
const AUSLEIHE_FELDER = [
  { name: 'medium', table: 'Medium' },
  { name: 'person', table: 'Person' },
  { name: 'datum', type: 'date' },
];
const FAUST = ['r-00001', 'M-17', 'Faust'];
const WOYZECK = ['r-00002', 'M-18', 'Woyzeck'];

function ausleihe({
  medien = [FAUST, WOYZECK],
  mediumKey = 'signatur',
  felder = AUSLEIHE_FELDER,
} = {}) {
  const wurzel = bereich();
  const medium = lege(
    wurzel,
    'Bibliothek/Medium.md',
    tabelle({ felder: MEDIUM_FELDER, key: mediumKey, lastId: medien.length, records: medien }),
  );
  const person = lege(
    wurzel,
    'Bibliothek/Person.md',
    tabelle({
      felder: LEUTE_FELDER,
      key: 'kuerzel',
      lastId: 2,
      records: [
        ['r-00001', 'ab', 'Anna'],
        ['r-00002', 'cd', 'Bert'],
      ],
    }),
  );
  const leihe = lege(wurzel, 'Ausleihe.md', tabelle({ felder }));
  return { wurzel, medium, person, leihe, sicht: sichtMit(medium, person, leihe) };
}

const HEUTE = '2026-09-24';

describe('Verweis-Regel an der Medien-Ausleihe (4T-001928, AK1, AK3)', () => {
  it('AK1 schreibt für zwei Schlüssel-Werte die aufgefüllten Kennungen der Ziele', async () => {
    const { wurzel, leihe, sicht } = ausleihe();
    const zeuge = beobachter();

    const ergebnis = await mitVerweis(sicht, [zeuge]).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-18', person: 'cd', datum: HEUTE })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(leihe)).toContain(`|- id="r-00001"\n| r-00002\n| r-00002\n| ${HEUTE}`);
    expect(zeuge.gesehen[0]).toEqual([
      { position: 0, feld: 'medium', wert: 'r-00002', regel: 'verweis' },
      { position: 0, feld: 'person', wert: 'r-00002', regel: 'verweis' },
    ]);
    // Jede Ersetzung ist eine aufgefüllte, nicht leere Kennung.
    expect(zeuge.gesehen[0].every((e) => /^r-\d{5,}$/.test(e.wert))).toBe(true);
  });

  it('AK1 füllt die Kurzform auf und löst einen im selben Auftrag angelegten Schlüssel auf', async () => {
    const { wurzel, medium, leihe, sicht } = ausleihe();

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Bibliothek/Medium.md', { signatur: 'M-99', titel: 'Lenz' }),
        neu('Ausleihe.md', { medium: 'M-99', person: 'r-1', datum: HEUTE }),
        neu('Ausleihe.md', { medium: 'r-1', person: 'ab', datum: HEUTE }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(medium)).toContain('|- id="r-00003"\n| M-99');
    const nachher = lies(leihe);
    expect(nachher).toContain(`|- id="r-00001"\n| r-00003\n| r-00001\n| ${HEUTE}`);
    expect(nachher).toContain(`|- id="r-00002"\n| r-00001\n| r-00001\n| ${HEUTE}`);
  });

  it('AK3 weist Ziel fehlt je Feld ab und vergleicht den Schlüssel ungetrimmt', async () => {
    const { wurzel, leihe, sicht } = ausleihe();
    const vorher = lies(leihe);

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: ' M-17', person: 'zz', datum: HEUTE })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.naht)).toMatchObject([
      { code: REGEL_LAGEN.verweisZielFehlt, feld: 'medium', wert: ' M-17', zieltabelle: 'Medium' },
      { code: REGEL_LAGEN.verweisZielFehlt, feld: 'person', wert: 'zz', zieltabelle: 'Person' },
    ]);
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK3 weist einen mehrdeutigen Schlüssel-Wert ab und nennt Anzahl und Kennungen', async () => {
    const { wurzel, leihe, sicht } = ausleihe({
      medien: [FAUST, WOYZECK, ['r-00003', 'M-17', 'Faust II']],
    });
    const vorher = lies(leihe);

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-17', person: 'ab', datum: HEUTE })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisMehrdeutig,
      position: 0,
      tabelle: 'Ausleihe.md',
      feld: 'medium',
      wert: 'M-17',
      zieltabelle: 'Medium',
      anzahl: 2,
      kennungen: ['r-00001', 'r-00003'],
    });
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK3 weist eine unbekannte Ziel-Tabelle ab', async () => {
    const { wurzel, leihe, sicht } = ausleihe({
      felder: [{ name: 'medium', table: 'Nirgendwo' }, ...AUSLEIHE_FELDER.slice(1)],
    });
    const vorher = lies(leihe);

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-17', person: 'ab', datum: HEUTE })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisTabelleUnbekannt,
      position: 0,
      tabelle: 'Ausleihe.md',
      feld: 'medium',
      wert: 'M-17',
      zieltabelle: 'Nirgendwo',
    });
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK3 weist einen Verweis ab, dessen Spalte keine Ziel-Tabelle nennt', async () => {
    const { wurzel, leihe, sicht } = ausleihe({
      felder: [{ name: 'medium', type: 'record' }, ...AUSLEIHE_FELDER.slice(1)],
    });
    const vorher = lies(leihe);

    const ergebnis = await mitVerweis(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'r-00001', person: 'ab', datum: HEUTE })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisTabelleUnbekannt,
      feld: 'medium',
      zieltabelle: null,
      grund: 'zielAngabeFehlt',
    });
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK3 weist einen Schlüssel-Wert bei mehrteiligem Schlüssel ab, die Kennung gilt weiter', async () => {
    const { wurzel, leihe, sicht } = ausleihe({ mediumKey: ['signatur', 'titel'] });
    const vorher = lies(leihe);
    const s = mitVerweis(sicht);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-17', person: 'ab', datum: HEUTE })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.verweisSchluesselMehrteilig,
      feld: 'medium',
      wert: 'M-17',
      zieltabelle: 'Medium',
    });
    expect(lies(leihe)).toBe(vorher);

    const perKennung = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'r-00001', person: 'ab', datum: HEUTE })],
    });
    expect(perKennung.ok).toBe(true);
    expect(lies(leihe)).toContain('| r-00001\n| r-00001');
  });
});
