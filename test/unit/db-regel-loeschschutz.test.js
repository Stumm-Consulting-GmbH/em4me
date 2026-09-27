// 4T-001929 (Epic 3E-000256, E22.3, E5.4): Der Lösch-Schutz des Regel-Werks an
// den drei Prüf-Anwendungen des Konzepts — Vorrat (Kopf und Positionen, auch in
// einem Folge-Segment), Ahnen (Selbstbezug) und Medien-Ausleihe (Zwischentabelle,
// Hand-Verweis über den fachlichen Schlüssel).
//
// **Echte Schreib-Schnittstelle, echte Sperr-Verwaltung, echtes Dateisystem** in
// temporären Ordnern (Muster `db-regel-verweis.test.js`). Die Regel hängt über
// die echte Fabrik `erzeugePruefNaht` an der Schnittstelle; ob ein Löschen
// abgewiesen wird, entscheiden die Dateien. Allein die Tabellen-Sicht des Index
// ist ein Fake, weil sie die Menge der Tabellen festlegt und der Index hier nicht
// der Gegenstand ist.
//
// **Gemessen wird an der Platte und am Befund:** Eine Abweisung lässt jede Datei
// zeichengleich stehen, ein angenommener Auftrag löscht genau, was er nennt, und
// keine Zelle eines Dritten ändert sich.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { loeschschutzRegel } from '../../src/main/database/record-regel-loeschschutz.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

// --- Aufbau (Helfer kopiert aus `db-regel-verweis.test.js`) ---------------------------------

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-loeschschutz-'));
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

function datensatzBlock(records) {
  const zeilen = [];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(...datensatzZeilen(record));
  });
  return zeilen;
}

// Eine ungeteilte Tabelle, die Datensätze mit trennender Leerzeile.
function tabelle({ felder, key, display, records = [], lastId = records.length }) {
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
// Kopf-Dateien als Tabellen. Folge-Segmente tragen keine Marke.
function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

// Eine Schnittstelle mit dem Lösch-Schutz an der echten Naht.
function mitSchutz(tabellenSicht) {
  return schnittstelle({
    pruefNaht: erzeugePruefNaht({ regeln: [loeschschutzRegel], tabellenSicht, fsp }),
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

// Der Inhalt aller genannten Dateien, für den Vergleich «zeichengleich».
function stand(...pfade) {
  return pfade.map(lies);
}

// --- Vorrat: Kopf und Positionen ------------------------------------------------------------

const KOPF_FELDER = [{ name: 'nummer' }, { name: 'datum', type: 'date' }];
const POSITION_FELDER = [{ name: 'kopf', table: 'Kopf' }, { name: 'artikel' }];
const KOPF_1 = { nummer: 'K-1', datum: '2026-09-01' };
const KOPF_2 = { nummer: 'K-2', datum: '2026-09-02' };
const SCHRAUBE = { kopf: 'r-00001', artikel: 'Schraube' };
const MUTTER = { kopf: 'r-00001', artikel: 'Mutter' };

function vorrat({ positionen } = {}) {
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
      records: positionen || [
        ['r-00001', 'r-00001', 'Schraube'],
        ['r-00002', 'r-00001', 'Mutter'],
        ['r-00003', 'r-00002', 'Scheibe'],
      ],
    }),
  );
  return { wurzel, kopf, position, sicht: sichtMit(kopf, position) };
}

describe('Lösch-Schutz an der Vorrat-Anwendung (4T-001929, AK1, AK3, AK4)', () => {
  it('AK1 weist das Löschen des Kopfes allein ab, mit Tabelle, Feld, Zahl und erstem Abhängigen', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const vorher = stand(kopf, position);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kopf.md', 'r-00001', KOPF_1)],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.pruefBefund]);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.loeschenAbhaengige,
      position: 0,
      tabelle: 'Kopf.md',
      id: 'r-00001',
      zieltabelle: 'Position',
      felder: ['kopf'],
      anzahl: 2,
      erster: 'r-00001',
      // Die Anzeige-Form der Positionen ist der Artikel.
      anzeige: 'r-00001 (Schraube)',
    });
    expect(stand(kopf, position)).toEqual(vorher);
  });

  it('AK3 löscht den Kopf mit allen Positionen in einem Auftrag', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Position.md', 'r-00001', SCHRAUBE),
        loesche('Kopf.md', 'r-00001', KOPF_1),
        loesche('Position.md', 'r-00002', MUTTER),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(kopf)).not.toContain('id="r-00001"');
    expect(lies(kopf)).toContain('|- id="r-00002"\n| K-2');
    const nachher = lies(position);
    expect(nachher).not.toContain('id="r-00001"');
    expect(nachher).not.toContain('id="r-00002"');
    // Die Position des anderen Kopfes bleibt unberührt stehen.
    expect(nachher).toContain('|- id="r-00003"\n| r-00002\n| Scheibe');
  });

  it('AK3 lässt umgehängte und geleerte Verweise nicht zählen, eine bloße Änderung daneben schon', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const s = mitSchutz(sicht);
    const vorher = stand(kopf, position);

    // Nur der Artikel ändert sich; der Verweis bleibt und hält das Löschen auf.
    const gehalten = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Kopf.md', 'r-00001', KOPF_1),
        aendere('Position.md', 'r-00001', SCHRAUBE, { kopf: 'r-00002' }),
        aendere('Position.md', 'r-00002', MUTTER, { artikel: 'Mutter M6' }),
      ],
    });
    expect(nahtCodes(gehalten)).toEqual([REGEL_LAGEN.loeschenAbhaengige]);
    expect(gehalten.lagen[0].naht).toMatchObject({
      anzahl: 1,
      erster: 'r-00002',
      anzeige: 'r-00002 (Mutter M6)',
    });
    expect(stand(kopf, position)).toEqual(vorher);

    const umgehaengt = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Kopf.md', 'r-00001', KOPF_1),
        aendere('Position.md', 'r-00001', SCHRAUBE, { kopf: 'r-00002' }),
        aendere('Position.md', 'r-00002', MUTTER, { kopf: '' }),
      ],
    });
    expect(umgehaengt.ok).toBe(true);
    expect(lies(kopf)).not.toContain('id="r-00001"');
    const nachher = lies(position);
    expect(nachher).toContain('|- id="r-00001"\n| r-00002\n| Schraube');
    expect(nachher).toContain('|- id="r-00002"\n|\n| Mutter');
  });

  it('AK3 zählt eine im selben Auftrag angelegte Position, die auf den gelöschten Kopf zeigt', async () => {
    const { wurzel, kopf, position, sicht } = vorrat();
    const vorher = stand(kopf, position);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Kopf.md', 'r-00001', KOPF_1),
        loesche('Position.md', 'r-00001', SCHRAUBE),
        loesche('Position.md', 'r-00002', MUTTER),
        neu('Position.md', { kopf: 'r-1', artikel: 'Dübel' }),
      ],
    });

    expect(nahtCodes(ergebnis)).toEqual([REGEL_LAGEN.loeschenAbhaengige]);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      position: 0,
      zieltabelle: 'Position',
      anzahl: 1,
      erster: 'r-00004',
      anzeige: 'r-00004 (Dübel)',
    });
    expect(stand(kopf, position)).toEqual(vorher);
  });

  it('AK4 findet die abhängige Position in einem Folge-Segment', async () => {
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
    const segment = lege(
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
    const vorher = stand(kopf, position, segment);

    // Die Sicht kennt allein die Kopf-Dateien; das Segment findet der Lese-Weg.
    const ergebnis = await mitSchutz(sichtMit(kopf, position)).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kopf.md', 'r-00001', KOPF_1)],
    });

    expect(nahtCodes(ergebnis)).toEqual([REGEL_LAGEN.loeschenAbhaengige]);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      zieltabelle: 'Position',
      felder: ['kopf'],
      anzahl: 1,
      erster: 'r-00002',
      anzeige: 'r-00002 (Mutter)',
    });
    expect(stand(kopf, position, segment)).toEqual(vorher);
  });

  it('übergeht eine fremde Kopf-Datei, die sich nicht lesen oder auslegen lässt', async () => {
    const { wurzel, kopf, position } = vorrat({
      positionen: [['r-00003', 'r-00002', 'Scheibe']],
    });
    const kaputt = lege(wurzel, 'Kaputt.md', '---\ndb-table: [\n---\n');
    const fehlt = path.join(wurzel, 'Verschwunden.md');

    const ergebnis = await mitSchutz(sichtMit(kaputt, kopf, position, fehlt)).fuehreAuftragAus(
      wurzel,
      { anweisungen: [loesche('Kopf.md', 'r-00001', KOPF_1)] },
    );

    expect(ergebnis.ok).toBe(true);
    expect(lies(kopf)).not.toContain('id="r-00001"');
  });
});

// --- Ahnen: Selbstbezug ---------------------------------------------------------------------

const PERSON_FELDER = [
  { name: 'name' },
  { name: 'vater', table: 'Person' },
  { name: 'pate', table: 'Person' },
];
const ADAM = { name: 'Adam', vater: '', pate: '' };

function ahnen(records) {
  const wurzel = bereich();
  const person = lege(wurzel, 'Person.md', tabelle({ felder: PERSON_FELDER, records }));
  return { wurzel, person, sicht: sichtMit(person) };
}

describe('Lösch-Schutz an der Ahnen-Anwendung (4T-001929, AK1, Festlegung 6)', () => {
  it('AK1 weist das Löschen eines Vaters mit Kindern in derselben Tabelle ab', async () => {
    const { wurzel, person, sicht } = ahnen([
      ['r-00001', 'Adam', '', ''],
      ['r-00002', 'Bert', 'r-00001', ''],
      ['r-00003', 'Cara', 'r-1', ''],
    ]);
    const vorher = lies(person);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Person.md', 'r-00001', ADAM)],
    });

    expect(ergebnis.lagen.map((lage) => lage.naht)).toEqual([
      {
        code: REGEL_LAGEN.loeschenAbhaengige,
        position: 0,
        tabelle: 'Person.md',
        id: 'r-00001',
        zieltabelle: 'Person',
        felder: ['vater'],
        // Die Kurzform `r-1` zählt wie die aufgefüllte Kennung.
        anzahl: 2,
        erster: 'r-00002',
        // Ohne Anzeige-Form und Schlüssel ist die Kennung die Anzeige.
        anzeige: 'r-00002',
      },
    ]);
    expect(lies(person)).toBe(vorher);
  });

  it('meldet zwei Verweis-Spalten auf dieselbe Tabelle in einem Befund mit beiden Feldern', async () => {
    const { wurzel, person, sicht } = ahnen([
      ['r-00001', 'Adam', '', ''],
      ['r-00002', 'Bert', 'r-00001', 'r-00001'],
      ['r-00003', 'Cara', '', 'r-00001'],
    ]);
    const vorher = lies(person);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Person.md', 'r-00001', ADAM)],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.loeschenAbhaengige,
      felder: ['vater', 'pate'],
      // Bert verweist zweimal und zählt einmal.
      anzahl: 2,
      erster: 'r-00002',
    });
    expect(lies(person)).toBe(vorher);
  });

  it('AK3 löscht einen Vater mit allen Kindern und einen Datensatz, der auf sich selbst zeigt', async () => {
    const { wurzel, person, sicht } = ahnen([
      ['r-00001', 'Adam', '', ''],
      ['r-00002', 'Bert', 'r-00001', ''],
      ['r-00003', 'Ich', '', 'r-00003'],
    ]);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Person.md', 'r-00001', ADAM),
        loesche('Person.md', 'r-00002', { name: 'Bert', vater: 'r-00001', pate: '' }),
        loesche('Person.md', 'r-00003', { name: 'Ich', vater: '', pate: 'r-00003' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(person)).not.toContain('|- id=');
  });
});

// --- Medien-Ausleihe: Zwischentabelle -------------------------------------------------------

const MEDIUM_FELDER = [{ name: 'signatur' }, { name: 'titel' }];
const LEUTE_FELDER = [{ name: 'kuerzel' }, { name: 'name' }];
const AUSLEIHE_FELDER = [
  { name: 'medium', table: 'Medium' },
  { name: 'person', table: 'Person' },
  { name: 'datum', type: 'date' },
  { name: 'notiz' },
];
const FAUST = { signatur: 'M-17', titel: 'Faust' };
const WOYZECK = { signatur: 'M-18', titel: 'Woyzeck' };
const HEUTE = '2026-09-24';

function ausleihe({ leihen, mediumKey = 'signatur' }) {
  const wurzel = bereich();
  const medium = lege(
    wurzel,
    'Bibliothek/Medium.md',
    tabelle({
      felder: MEDIUM_FELDER,
      key: mediumKey,
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
  return { wurzel, medium, person, leihe, sicht: sichtMit(medium, person, leihe) };
}

describe('Lösch-Schutz an der Medien-Ausleihe (4T-001929, AK1, AK2, AK6)', () => {
  it('AK1 weist das Löschen eines Mediums mit Ausleihen in der Zwischentabelle ab', async () => {
    const { wurzel, medium, person, leihe, sicht } = ausleihe({
      leihen: [
        ['r-00001', 'r-00001', 'r-00001', HEUTE, ''],
        ['r-00002', 'r-00001', 'r-00002', HEUTE, ''],
        ['r-00003', 'r-00002', 'r-00002', HEUTE, ''],
      ],
    });
    const vorher = stand(medium, person, leihe);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Bibliothek/Medium.md', 'r-00001', FAUST)],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.loeschenAbhaengige,
      position: 0,
      tabelle: 'Bibliothek/Medium.md',
      id: 'r-00001',
      zieltabelle: 'Ausleihe',
      felder: ['medium'],
      anzahl: 2,
      erster: 'r-00001',
      anzeige: 'r-00001',
    });
    expect(stand(medium, person, leihe)).toEqual(vorher);
  });

  it('AK2 zählt einen Hand-Verweis über den einteiligen Schlüssel-Wert', async () => {
    const { wurzel, medium, leihe, sicht } = ausleihe({
      leihen: [['r-00001', 'M-18', 'r-00001', HEUTE, '']],
    });
    const vorher = stand(medium, leihe);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Bibliothek/Medium.md', 'r-00001', FAUST),
        loesche('Bibliothek/Medium.md', 'r-00002', WOYZECK),
      ],
    });

    // Faust ist frei, Woyzeck hängt über seine Signatur.
    expect(ergebnis.lagen.map((lage) => lage.naht)).toMatchObject([
      {
        code: REGEL_LAGEN.loeschenAbhaengige,
        position: 1,
        id: 'r-00002',
        zieltabelle: 'Ausleihe',
        felder: ['medium'],
        anzahl: 1,
        erster: 'r-00001',
      },
    ]);
    expect(stand(medium, leihe)).toEqual(vorher);
  });

  it('AK2 zählt einen Schlüssel-Wert bei mehrteiligem Schlüssel nicht, er ist kein Verweis', async () => {
    const { wurzel, medium, leihe, sicht } = ausleihe({
      mediumKey: ['signatur', 'titel'],
      leihen: [['r-00001', 'M-18', 'r-00001', HEUTE, '']],
    });
    const vorher = lies(leihe);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Bibliothek/Medium.md', 'r-00002', WOYZECK)],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(medium)).not.toContain('id="r-00002"');
    expect(lies(leihe)).toBe(vorher);
  });

  it('AK6 lässt einen Prosa-Verweis nicht schützen, löscht nichts mit und leert keine Zelle', async () => {
    const { wurzel, medium, person, leihe, sicht } = ausleihe({
      leihen: [['r-00001', 'r-00002', 'r-00001', HEUTE, 'siehe r-00001 und [[Medium#^r-00001]]']],
    });
    const notiz = lege(wurzel, 'Notiz.md', '# Notiz\n\nFaust steht unter [[Medium#^r-00001]].\n');
    const vorher = stand(person, leihe, notiz);

    const ergebnis = await mitSchutz(sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Bibliothek/Medium.md', 'r-00001', FAUST)],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(medium)).not.toContain('id="r-00001"');
    expect(lies(medium)).toContain('|- id="r-00002"\n| M-18');
    expect(stand(person, leihe, notiz)).toEqual(vorher);
  });
});

// --- Tabellen-Sicht nicht bereit ------------------------------------------------------------

describe('Lösch-Schutz ohne bereite Tabellen-Sicht (4T-001929, AK5)', () => {
  it('AK5 weist einen Auftrag mit Löschungen einmal ab, am ersten Lösch-Schritt', async () => {
    const { wurzel, kopf, position } = vorrat();
    const vorher = stand(kopf, position);
    const nichtBereit = () => ({ status: 'indexing', sicht: null });

    const ergebnis = await mitSchutz(nichtBereit).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kopf.md', { nummer: 'K-3', datum: HEUTE }),
        loesche('Position.md', 'r-00003', { kopf: 'r-00002', artikel: 'Scheibe' }),
        loesche('Kopf.md', 'r-00002', KOPF_2),
      ],
    });

    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0].naht).toEqual({
      code: REGEL_LAGEN.katalogNichtBereit,
      position: 1,
      tabelle: 'Position.md',
      id: 'r-00003',
      grund: 'indexing',
    });
    expect(stand(kopf, position)).toEqual(vorher);

    // Ohne hereingereichte Sicht gibt es keinen Index: derselbe Abweis.
    const ohneSicht = await mitSchutz(undefined).fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kopf.md', 'r-00002', KOPF_2)],
    });
    expect(ohneSicht.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.katalogNichtBereit,
      grund: 'unavailable',
    });
    expect(stand(kopf, position)).toEqual(vorher);
  });

  it('AK5 fragt die Sicht bei einem Auftrag ohne Löschung nicht und lässt ihn durch', async () => {
    const { wurzel, kopf, position } = vorrat();
    let gefragt = 0;
    const nichtBereit = () => {
      gefragt += 1;
      return { status: 'indexing', sicht: null };
    };

    const ergebnis = await mitSchutz(nichtBereit).fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kopf.md', { nummer: 'K-3', datum: HEUTE }),
        aendere('Position.md', 'r-00001', SCHRAUBE, { artikel: 'Schraube M4' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(gefragt).toBe(0);
    expect(lies(kopf)).toContain('| K-3');
    expect(lies(position)).toContain('| Schraube M4');
  });
});

// --- Kosten-Messung am Mengengerüst (AK7) ---------------------------------------------------

describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Lösch-Schutz (4T-001929, AK7)', () => {
  it('misst ein Löschen gegen 5000 abhängige Datensätze in einem Segment', async () => {
    const records = [];
    for (let i = 1; i <= 5000; i += 1) {
      const kennung = `r-${String(i).padStart(5, '0')}`;
      // Drei Positionen zeigen auf den gelöschten Kopf, verteilt über die Datei.
      const ziel = i === 17 || i === 2500 || i === 4999 ? 'r-00001' : 'r-00002';
      records.push([kennung, ziel, `Artikel ${i}`]);
    }
    const { wurzel, kopf, position, sicht } = vorrat({ positionen: records });
    const vorher = stand(kopf, position);
    const s = mitSchutz(sicht);

    const beginn = performance.now();
    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kopf.md', 'r-00001', KOPF_1)],
    });
    const dauer = performance.now() - beginn;

    // Die Zeile ist das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
    // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
    // eslint-disable-next-line no-console
    console.log(`Messlauf Lösch-Schutz: 5000 Datensätze, 3 abhängig, Dauer ${dauer.toFixed(1)} ms`);
    expect(ergebnis.lagen[0].naht).toMatchObject({
      code: REGEL_LAGEN.loeschenAbhaengige,
      anzahl: 3,
      erster: 'r-00017',
    });
    expect(stand(kopf, position)).toEqual(vorher);
  });
});
