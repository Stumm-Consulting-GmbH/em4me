// 4T-001927 (Epic 3E-000256, E5.3, E22.3, E22.5): Die Schlüssel-Regel des
// Regel-Werks an zwei Prüf-Anwendungen — einer Personen-Tabelle mit einteiligem
// Schlüssel über zwei Segmente und der Medien-Ausleihe des Konzepts
// (Zwischentabelle mit zweiteiligem Schlüssel aus zwei Verweis-Spalten).
//
// **Echte Schreib-Schnittstelle, echte Sperr-Verwaltung, echtes Dateisystem** in
// temporären Ordnern (Muster `db-regel-verweis.test.js`; die Helfer sind von dort
// kopiert und nicht importiert, damit jede Prüfdatei für sich steht). Die Regel
// hängt über die echte Fabrik `erzeugePruefNaht` an der Schnittstelle; ob ein
// Schlüssel abgewiesen wird, entscheidet die Datei. Allein die Tabellen-Sicht
// des Index ist ein Fake, und nur dort, wo die Verweis-Regel mitläuft: Die
// Schlüssel-Regel selbst fragt sie nicht.
//
// **Je Abweisung zwei Belege:** Die Datei bleibt zeichengleich, und der Befund
// der Naht trägt Code und Angaben der Meldung.
//
// **AK7 als Quelltext-Wächter:** Der Vergleichs-Schlüssel hat im Quelltext genau
// eine Definition, und Index-Zugriff und Regel beziehen sie aus demselben Blatt.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { schluesselRegel } from '../../src/main/database/record-regel-schluessel.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Alle JS-Dateien eines Ordners, rekursiv, mit Pfad relativ zur Projekt-Wurzel.
function jsDateienUnter(ordner) {
  const funde = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) funde.push(...jsDateienUnter(voll));
    else if (eintrag.isFile() && eintrag.name.endsWith('.js')) funde.push(voll);
  }
  return funde;
}

// Gemessen werden Haupt-Prozess und geteilte Blätter: Dort leben Index und
// Regel, und dort allein könnte ein zweiter Bildungs-Weg entstehen. Der Renderer
// bleibt draußen, weil sein gebündeltes Erzeugnis eine Kopie der geteilten
// Blätter trägt und die Zuordnungs-Messung sonst jede Renderer-Datei als
// gelesenen Pfad dieser Prüfdatei zählte.
const QUELLEN = ['main', 'shared']
  .flatMap((teil) => jsDateienUnter(path.join(ROOT, 'src', teil)))
  .map((voll) => ({
    rel: path.relative(ROOT, voll).split(path.sep).join('/'),
    text: fs.readFileSync(voll, 'utf8'),
  }));

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-schluessel-'));
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
// eine Liste), Anzeige-Form und Hochwasserstand.
function definitionsZeilen({ felder, key, display, lastId }) {
  const zeilen = ['db-table:', '  fields:', ...felder.flatMap(feldZeilen)];
  if (Array.isArray(key)) zeilen.push('  key:', ...key.map((name) => `    - ${name}`));
  else if (key !== undefined) zeilen.push(`  key: ${key}`);
  if (display !== undefined) zeilen.push(`  display: ${display}`);
  zeilen.push(`  lastId: ${lastId}`);
  return zeilen;
}

// Die Zeilen eines Datensatzes; die Zell-Texte stehen in der Reihenfolge der Felder.
function datensatzZeilen([id, ...texte]) {
  return [`|- id="${id}"`, ...texte.map((text) => `| ${text}`)];
}

// Die Datensätze mit trennender Leerzeile, wie die Anwendung sie schreibt.
function datensatzBlock(records) {
  const zeilen = [];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(...datensatzZeilen(record));
  });
  return zeilen;
}

// Eine ungeteilte Tabelle.
function tabelle({ felder, key, display, lastId = 0, records = [] }) {
  return [
    '---',
    ...definitionsZeilen({ felder, key, display, lastId }),
    '---',
    '',
    '```perspective-records',
    ...datensatzBlock(records),
    '```',
    '',
  ].join('\n');
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
// Kopf-Dateien als Tabellen.
function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

// Eine Schnittstelle mit den genannten Regeln an der echten Naht.
function mitRegeln(regeln, tabellenSicht) {
  return schnittstelle({ pruefNaht: erzeugePruefNaht({ regeln, tabellenSicht, fsp }) });
}

function mitSchluessel() {
  return mitRegeln([schluesselRegel]);
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

// Liest die genannten Dateien; `unveraendert` vergleicht zeichengleich.
function stand(...pfade) {
  return pfade.map(lies);
}

function unveraendert(pfade, vorher) {
  expect(stand(...pfade)).toEqual(vorher);
}

// --- Personen: einteiliger Schlüssel über zwei Segmente ----------------------------------------

const LEUTE_FELDER = [{ name: 'Kuerzel' }, { name: 'name' }, { name: 'ort' }];
const ANNA = ['r-00001', 'ab', 'Anna', 'Basel'];
const BERT = ['r-00002', 'cd', 'Bert', 'Bern'];
const CARA = ['r-00003', 'ef', 'Cara', 'Chur'];
const DORA = ['r-00004', 'gh', 'Dora', 'Davos'];

// Die Werte eines Datensatzes als Erwartung einer Anweisung.
function werteVon([, kuerzel, name, ort]) {
  return { Kuerzel: kuerzel, name, ort };
}

// Eine geteilte Tabelle nach dem Ablage-Format (Muster `db-regel-verweis.test.js`):
// Die Kopf-Datei trägt Definition, öffnenden Zaun und die ersten Datensätze, das
// Folge-Segment die übrigen und den schließenden Zaun.
function leute({ kopfRecords = [ANNA, BERT], segmentRecords = [CARA, DORA] } = {}) {
  const wurzel = bereich();
  const lastId = kopfRecords.length + segmentRecords.length;
  const kopf = lege(
    wurzel,
    'Leute.md',
    [
      '---',
      'doc-part: v1|1|Leute',
      // Der Schlüssel in anderer Schreibung als das Feld: Die Meldung nennt das
      // Feld in der Schreibweise der Definition.
      ...definitionsZeilen({ felder: LEUTE_FELDER, key: 'kuerzel', display: 'name', lastId }),
      '---',
      '',
      '```perspective-records',
      ...datensatzBlock(kopfRecords),
    ].join('\n'),
  );
  const segment = lege(
    wurzel,
    'Leute•part-00002.md',
    ['---', 'doc-part: v1|2|Leute', '---', ...datensatzBlock(segmentRecords), '```', ''].join('\n'),
  );
  return { wurzel, kopf, segment, dateien: [kopf, segment] };
}

describe('Schlüssel-Regel an der Personen-Tabelle (4T-001927, AK1 bis AK4)', () => {
  it('AK1 weist ein Anlegen mit vorhandenem Schlüssel ab und nennt Kennung und Anzeige-Form', async () => {
    const { wurzel, dateien } = leute();
    const vorher = stand(...dateien);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Leute.md', { Kuerzel: 'cd', name: 'Carl', ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.schluesselDoppeltImBestand,
      position: 0,
      tabelle: 'Leute.md',
      id: 'r-00005',
      felder: ['Kuerzel'],
      wert: 'cd',
      vorhanden: 'r-00002',
      anzeige: 'r-00002 (Bert)',
    });
    unveraendert(dateien, vorher);
  });

  it('AK1 weist ein Ändern auf einen fremden Schlüssel ab', async () => {
    const { wurzel, dateien } = leute();
    const vorher = stand(...dateien);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Leute.md', 'r-00001', werteVon(ANNA), { Kuerzel: 'cd' })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.schluesselDoppeltImBestand,
      position: 0,
      id: 'r-00001',
      felder: ['Kuerzel'],
      wert: 'cd',
      vorhanden: 'r-00002',
      anzeige: 'r-00002 (Bert)',
    });
    unveraendert(dateien, vorher);
  });

  it('AK2 lässt das Ändern auf den eigenen Schlüssel und das Ändern eines anderen Feldes durch', async () => {
    const { wurzel, kopf } = leute();
    const s = mitSchluessel();

    const eigener = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Leute.md', 'r-00001', werteVon(ANNA), { Kuerzel: 'ab' })],
    });
    expect(eigener.ok).toBe(true);

    const anderes = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Leute.md', 'r-00001', werteVon(ANNA), { name: 'Anni' })],
    });
    expect(anderes.ok).toBe(true);
    expect(lies(kopf)).toContain('|- id="r-00001"\n| ab\n| Anni\n| Basel');
  });

  it('AK3 prüft das Folge-Segment beim Anlegen und beim Ändern', async () => {
    const { wurzel, dateien } = leute();
    const vorher = stand(...dateien);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Leute.md', { Kuerzel: 'gh', name: 'Gerd', ort: 'Genf' }),
        aendere('Leute.md', 'r-00001', werteVon(ANNA), { Kuerzel: 'ef' }),
      ],
    });

    expect(ergebnis.lagen.map((lage) => lage.naht)).toMatchObject([
      { code: REGEL_LAGEN.schluesselDoppeltImBestand, position: 0, vorhanden: 'r-00004' },
      { code: REGEL_LAGEN.schluesselDoppeltImBestand, position: 1, vorhanden: 'r-00003' },
    ]);
    expect(ergebnis.lagen[0].naht.anzeige).toBe('r-00004 (Dora)');
    unveraendert(dateien, vorher);
  });

  it('AK3 weist zwei Anweisungen mit demselben Schlüssel ab und nennt beide Positionen', async () => {
    const { wurzel, dateien } = leute();
    const vorher = stand(...dateien);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Leute.md', { Kuerzel: 'xy', name: 'Xaver', ort: 'Zug' }),
        aendere('Leute.md', 'r-00003', werteVon(CARA), { ort: 'Aarau' }),
        neu('Leute.md', { Kuerzel: 'xy', name: 'Yves', ort: 'Sitten' }),
      ],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.schluesselDoppelt,
      position: 2,
      tabelle: 'Leute.md',
      id: 'r-00006',
      felder: ['Kuerzel'],
      wert: 'xy',
      positionen: [0, 2],
    });
    unveraendert(dateien, vorher);
  });

  it('AK4 nimmt Löschen und Neuanlegen desselben Schlüssels im selben Auftrag an', async () => {
    const { wurzel, dateien } = leute();

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Leute.md', 'r-00002', werteVon(BERT)),
        neu('Leute.md', { Kuerzel: 'cd', name: 'Carl', ort: 'Chur' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    const nachher = stand(...dateien).join('\n');
    expect(nachher).not.toContain('id="r-00002"');
    expect(nachher).toContain('|- id="r-00005"\n| cd\n| Carl\n| Chur');
  });

  it('AK4 nimmt einen Tausch der Schlüssel zweier Datensätze in einem Auftrag an', async () => {
    const { wurzel, kopf } = leute();

    // Der geänderte Schritt zählt mit seinem resultierenden Schlüssel, nicht mit
    // dem vorgefundenen: `ab` wird frei, bevor Bert ihn bekommt.
    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Leute.md', 'r-00002', werteVon(BERT), { Kuerzel: 'ab' }),
        aendere('Leute.md', 'r-00001', werteVon(ANNA), { Kuerzel: 'cd' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    const nachher = lies(kopf);
    expect(nachher).toContain('|- id="r-00001"\n| cd\n| Anna');
    expect(nachher).toContain('|- id="r-00002"\n| ab\n| Bert');
  });
});

describe('Schlüssel-Regel an den Grenzfällen (4T-001927, AK5, AK6, Festlegung 4)', () => {
  it('AK5 prüft einen Schlüssel mit leerem Teil nicht', async () => {
    const { wurzel, segment } = leute();

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Leute.md', { Kuerzel: '', name: 'Ohne', ort: 'Olten' }),
        neu('Leute.md', { Kuerzel: '', name: 'Auch ohne', ort: 'Olten' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(segment)).toContain('| Auch ohne');
  });

  it('AK5 prüft eine Tabelle ohne Schlüssel nicht', async () => {
    const wurzel = bereich();
    const notiz = lege(
      wurzel,
      'Notiz.md',
      tabelle({ felder: [{ name: 'titel' }], lastId: 1, records: [['r-00001', 'Gleich']] }),
    );

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Notiz.md', { titel: 'Gleich' }), neu('Notiz.md', { titel: 'Gleich' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(notiz).match(/\| Gleich/g)).toHaveLength(3);
  });

  it('unterscheidet Groß- und Kleinschreibung', async () => {
    const { wurzel, segment } = leute();

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Leute.md', { Kuerzel: 'CD', name: 'Claude', ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(segment)).toContain('| CD\n| Claude');
  });

  it('AK6 meldet eine Alt-Dublette im Bestand mit ihrer eigenen Lage und allen Kennungen', async () => {
    const zweiteDora = ['r-00004', 'cd', 'Dora', 'Davos'];
    const { wurzel, dateien } = leute({ segmentRecords: [CARA, zweiteDora] });
    const vorher = stand(...dateien);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Leute.md', { Kuerzel: 'cd', name: 'Carl', ort: 'Chur' }),
        aendere('Leute.md', 'r-00001', werteVon(ANNA), { Kuerzel: 'cd' }),
      ],
    });

    const erwartet = {
      code: REGEL_LAGEN.schluesselBestandUneindeutig,
      tabelle: 'Leute.md',
      felder: ['Kuerzel'],
      wert: 'cd',
      kennungen: ['r-00002', 'r-00004'],
      anzahl: 2,
      anzeige: 'r-00002 (Bert), r-00004 (Dora)',
    };
    expect(ergebnis.lagen.map((lage) => lage.naht)).toEqual([
      { ...erwartet, position: 0, id: 'r-00005' },
      { ...erwartet, position: 1, id: 'r-00001' },
    ]);
    unveraendert(dateien, vorher);
  });

  it('Festlegung 4 lässt ein fremdes Feld an einem Datensatz der Alt-Dublette ändern', async () => {
    const zweiteDora = ['r-00004', 'cd', 'Dora', 'Davos'];
    const { wurzel, kopf, segment } = leute({ segmentRecords: [CARA, zweiteDora] });

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Leute.md', 'r-00002', werteVon(BERT), { ort: 'Biel' }),
        aendere('Leute.md', 'r-00004', werteVon(zweiteDora), { Kuerzel: 'cd', name: 'Doris' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(kopf)).toContain('|- id="r-00002"\n| cd\n| Bert\n| Biel');
    expect(lies(segment)).toContain('|- id="r-00004"\n| cd\n| Doris');
  });

  it('prüft einen Schlüssel in der letzten Spalte, Datensätze durch Leerzeile getrennt', async () => {
    const wurzel = bereich();
    // Der Trennabstand hängt beim Auslegen am Text der letzten Zelle; zum Wert
    // gehört er nicht (Nebenbefund am Index, derselbe Fall).
    const kuerzel = lege(
      wurzel,
      'Kuerzel.md',
      tabelle({
        felder: [{ name: 'name' }, { name: 'kuerzel' }],
        key: 'kuerzel',
        lastId: 2,
        records: [
          ['r-00001', 'Anna', 'ab'],
          ['r-00002', 'Bert', 'cd'],
        ],
      }),
    );
    const vorher = lies(kuerzel);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Kuerzel.md', { name: 'Arno', kuerzel: 'ab' })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.schluesselDoppeltImBestand,
      felder: ['kuerzel'],
      wert: 'ab',
      vorhanden: 'r-00001',
      // Ohne eigene Anzeige-Form benennt der einteilige Schlüssel den Datensatz.
      anzeige: 'r-00001 (ab)',
    });
    expect(lies(kuerzel)).toBe(vorher);
  });
});

// --- Medien-Ausleihe: zweiteiliger Schlüssel aus zwei Verweisen ------------------------------

const MEDIUM_FELDER = [{ name: 'signatur' }, { name: 'titel' }];
const PERSON_FELDER = [{ name: 'kuerzel' }, { name: 'name' }];
const AUSLEIHE_FELDER = [
  { name: 'medium', table: 'Medium' },
  { name: 'person', table: 'Person' },
  { name: 'datum', type: 'date' },
];
const HEUTE = '2026-09-24';

function ausleihe() {
  const wurzel = bereich();
  const medium = lege(
    wurzel,
    'Bibliothek/Medium.md',
    tabelle({
      felder: MEDIUM_FELDER,
      key: 'signatur',
      lastId: 2,
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
      felder: PERSON_FELDER,
      key: 'kuerzel',
      lastId: 2,
      records: [
        ['r-00001', 'ab', 'Anna'],
        ['r-00002', 'cd', 'Bert'],
      ],
    }),
  );
  // Faust ist an Anna ausgeliehen.
  const leihe = lege(
    wurzel,
    'Ausleihe.md',
    tabelle({
      felder: AUSLEIHE_FELDER,
      key: ['medium', 'person'],
      lastId: 1,
      records: [['r-00001', 'r-00001', 'r-00001', '2026-09-01']],
    }),
  );
  return { wurzel, leihe, sicht: sichtMit(medium, person, leihe) };
}

describe('Schlüssel-Regel an der Medien-Ausleihe (4T-001927, AK1, AK2, AK3, AK5)', () => {
  it('AK1 weist einen vorhandenen zweiteiligen Schlüssel ab und nennt die Kennung', async () => {
    const { wurzel, leihe } = ausleihe();
    const vorher = lies(leihe);

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'r-00001', person: 'r-00001', datum: HEUTE })],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.schluesselDoppeltImBestand,
      position: 0,
      tabelle: 'Ausleihe.md',
      id: 'r-00002',
      felder: ['medium', 'person'],
      wert: 'r-00001 / r-00001',
      vorhanden: 'r-00001',
      // Ein mehrteiliger Schlüssel ohne Anzeige-Form: Die Kennung benennt ihn.
      anzeige: 'r-00001',
    });
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK2 gilt ein mehrteiliger Schlüssel nur bei allen Teilen gleich als doppelt', async () => {
    const { wurzel, leihe } = ausleihe();

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Ausleihe.md', { medium: 'r-00001', person: 'r-00002', datum: HEUTE }),
        neu('Ausleihe.md', { medium: 'r-00002', person: 'r-00001', datum: HEUTE }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(leihe).match(/\|- id=/g)).toHaveLength(3);
  });

  it('AK5 prüft einen zweiteiligen Schlüssel mit leerem Teil nicht', async () => {
    const { wurzel } = ausleihe();

    const ergebnis = await mitSchluessel().fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Ausleihe.md', { medium: 'r-00001', person: '', datum: HEUTE }),
        neu('Ausleihe.md', { medium: 'r-00001', person: '', datum: HEUTE }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
  });

  it('zählt mit der Verweis-Regel davor die Kennung, die deren Ersetzung zurücklässt', async () => {
    const { wurzel, leihe, sicht } = ausleihe();
    const vorher = lies(leihe);
    const s = mitRegeln([verweisRegel, schluesselRegel], sicht);

    // Geschrieben sind Schlüssel-Werte der Ziele; erst die Ersetzung macht
    // daraus die Kennungen, unter denen der Schlüssel bereits vergeben ist.
    const imBestand = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-17', person: 'ab', datum: HEUTE })],
    });
    expect(imBestand.lagen).toHaveLength(1);
    expect(imBestand.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.schluesselDoppeltImBestand,
      wert: 'r-00001 / r-00001',
      vorhanden: 'r-00001',
    });
    expect(lies(leihe)).toBe(vorher);

    // Zwei Schreibweisen desselben Schlüssels in einem Auftrag (AK3).
    const imAuftrag = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Ausleihe.md', { medium: 'M-17', person: 'cd', datum: HEUTE }),
        neu('Ausleihe.md', { medium: 'r-1', person: 'r-00002', datum: HEUTE }),
      ],
    });
    expect(imAuftrag.lagen).toHaveLength(1);
    expect(imAuftrag.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.schluesselDoppelt,
      position: 1,
      wert: 'r-00001 / r-00002',
      positionen: [0, 1],
    });
    expect(lies(leihe)).toBe(vorher);

    // Gegenprobe: ein freier Schlüssel, geschrieben als Kennungen.
    const frei = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Ausleihe.md', { medium: 'M-18', person: 'ab', datum: HEUTE })],
    });
    expect(frei.ok).toBe(true);
    expect(lies(leihe)).toContain(`|- id="r-00002"\n| r-00002\n| r-00001\n| ${HEUTE}`);
  });
});

// --- AK7: ein Vergleichs-Schlüssel ------------------------------------------------------------

describe('Ein Vergleichs-Schlüssel für Index und Regel (4T-001927, AK7)', () => {
  it('schluesselKey hat genau eine Definition, im geteilten Blatt', () => {
    const definitionen = QUELLEN.flatMap(({ rel, text }) =>
      text
        .split('\n')
        .filter((zeile) => zeile.startsWith('function schluesselKey('))
        .map(() => rel),
    );
    expect(definitionen).toEqual(['src/shared/database/record-schluessel.js']);
  });

  it('Index-Zugriff und Schlüssel-Regel beziehen sie aus dem Blatt', () => {
    const bezug =
      /const \{[^}]*\bschluesselKey\b[^}]*\} = require\('\.\.\/\.\.\/shared\/database\/record-schluessel\.js'\);/;
    const text = (rel) => QUELLEN.find((q) => q.rel === rel).text;
    expect(text('src/main/index/datensatz-zugriff.js')).toMatch(bezug);
    expect(text('src/main/database/record-regel-schluessel.js')).toMatch(bezug);
  });
});
