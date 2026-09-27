// 4T-001931 (Epic 3E-000256, E22.3): Die Prüfregeln im Regel-Werk der
// Schreib-Schnittstelle — Feld-Regeln und Datensatz-Regeln der Definition,
// hart angewandt auf den resultierenden Datensatz.
//
// **Echte Schreib-Schnittstelle, echte Sperr-Verwaltung, echtes Dateisystem** in
// temporären Ordnern (Muster `db-regel-verweis.test.js`). Die Regel hängt über
// die echte Fabrik `erzeugePruefNaht` an der Schnittstelle; ob ein Auftrag
// abgewiesen wird, entscheidet die Datei. Allein die Tabellen-Sicht des Index
// ist ein Fake: Die Prüfregeln brauchen sie nicht, die Verweis-Regel im
// Zusammenspiel-Fall schon.
//
// Die Regeln stehen im Frontmatter der Tabellen-Datei, wie ein Autor sie
// schreibt: `check` je Feld, `checks` am Behälter.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { pruefregelnRegel } from '../../src/main/database/record-regel-pruefregeln.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegPfadFuer } from '../../src/main/database/change-log.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pruefregeln-'));
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

// Die Fremd-Änderung: ein Umschreiben von Hand, an der Schnittstelle vorbei
// (Muster `db-record-auftrag-stand.test.js`). Der Ersatz muss treffen.
function vonHand(pfad, alt, neu) {
  const vorher = lies(pfad);
  expect(vorher.includes(alt), `von Hand: «${alt}» nicht gefunden`).toBe(true);
  fs.writeFileSync(pfad, vorher.replace(alt, neu), 'utf8');
  return lies(pfad);
}

// Die Zeilen eines Datensatzes; die Zell-Texte stehen in der Reihenfolge der Felder.
function datensatzZeilen([id, ...texte]) {
  return [`|- id="${id}"`, ...texte.map((text) => (text === '' ? '|' : `| ${text}`))];
}

// Eine ungeteilte Tabelle: die Definition als fertige Frontmatter-Zeilen, die
// Datensätze mit trennender Leerzeile.
function tabelle(definitionsZeilen, records = []) {
  const zeilen = ['---', ...definitionsZeilen, '---', '', '```perspective-records'];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(...datensatzZeilen(record));
  });
  zeilen.push('```', '');
  return zeilen.join('\n');
}

// Ein Kurs-Verzeichnis: eine Regex-Regel, eine Ausdrucks-Regel mit Meldung und
// eine Datensatz-Regel über zwei Daten.
const KURS_DEFINITION = [
  'db-table:',
  '  fields:',
  '    - name: Kuerzel',
  "      check: '/^[A-ZÄÖÜ]{2,4}$/u'",
  '    - name: Plaetze',
  '      type: number',
  '      check:',
  "        rule: 'value > 0 AND value <= 30'",
  '        message: Zwischen 1 und 30 Plätze.',
  '    - name: Beginn',
  '      type: date',
  '    - name: Ende',
  '      type: date',
  '  checks:',
  "    - rule: 'Ende >= Beginn'",
  '      message: Das Ende liegt vor dem Beginn.',
  '  lastId: 2',
];
const KURS_1 = ['r-00001', 'ÖKO', '12', '2026-10-01', '2026-10-31'];
const KURS_2 = ['r-00002', 'BIO', '20', '2026-11-01', '2026-11-30'];
const KURS_1_GELESEN = { Kuerzel: 'ÖKO', Plaetze: '12', Beginn: '2026-10-01', Ende: '2026-10-31' };

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

function neu(tabelleAngabe, werte) {
  return { tabelle: tabelleAngabe, art: 'create', werte };
}

function aendere(tabelleAngabe, id, erwartet, werte, mehr = {}) {
  return { tabelle: tabelleAngabe, art: 'update', id, erwartet, werte, ...mehr };
}

function loesche(tabelleAngabe, id, erwartet) {
  return { tabelle: tabelleAngabe, art: 'delete', id, erwartet };
}

function kurse(records = [KURS_1, KURS_2]) {
  const wurzel = bereich();
  const pfad = lege(wurzel, 'Kurs.md', tabelle(KURS_DEFINITION, records));
  return { wurzel, pfad, s: mitRegeln([pruefregelnRegel], sichtMit(pfad)) };
}

function nahte(ergebnis) {
  return ergebnis.lagen.map((lage) => lage.naht);
}

// --- AK1: Feld-Regel beim Anlegen und Ändern ---------------------------------------------

describe('Prüfregeln: Feld-Regel beim Anlegen und Ändern (4T-001931, AK1)', () => {
  it('weist ein Anlegen gegen die Regex-Regel ab und lässt die Datei zeichengleich', async () => {
    const { wurzel, pfad, s } = kurse();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kurs.md', {
          Kuerzel: 'Öko1',
          Plaetze: '10',
          Beginn: '2026-12-01',
          Ende: '2026-12-02',
        }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.pruefBefund]);
    expect(nahte(ergebnis)).toEqual([
      {
        code: REGEL_LAGEN.pruefregelVerletzt,
        position: 0,
        tabelle: 'Kurs.md',
        id: 'r-00003',
        feld: 'Kuerzel',
        wert: 'Öko1',
        regel: '/^[A-ZÄÖÜ]{2,4}$/u',
        // Ohne Meldungstext trägt der Befund die Quelle der Regel.
        meldung: '',
        grund: 'regex',
      },
    ]);
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('weist ein Ändern gegen die Ausdrucks-Regel ab und nennt den Meldungstext', async () => {
    const { wurzel, pfad, s } = kurse();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kurs.md', 'r-00001', KURS_1_GELESEN, { Plaetze: '40' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([
      {
        code: REGEL_LAGEN.pruefregelVerletzt,
        position: 0,
        tabelle: 'Kurs.md',
        id: 'r-00001',
        feld: 'Plaetze',
        wert: '40',
        regel: 'value > 0 AND value <= 30',
        meldung: 'Zwischen 1 und 30 Plätze.',
        grund: 'ausdruck',
      },
    ]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('lässt einen gültigen Auftrag durch und schreibt ihn', async () => {
    const { wurzel, pfad, s } = kurse();

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kurs.md', {
          Kuerzel: 'ÄRZT',
          Plaetze: '30',
          Beginn: '2026-12-01',
          Ende: '2026-12-01',
        }),
        aendere('Kurs.md', 'r-00002', { Plaetze: '20' }, { Plaetze: '25' }),
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).toContain('|- id="r-00003"\n| ÄRZT\n| 30\n| 2026-12-01\n| 2026-12-01');
    expect(nachher).toContain('|- id="r-00002"\n| BIO\n| 25');
  });

  it('prüft einen leeren Wert nicht; ob leer erlaubt ist, sagt die Pflicht-Angabe', async () => {
    const { wurzel, pfad, s } = kurse();

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Kurs.md', { Kuerzel: '', Beginn: '2026-12-01', Ende: '2026-12-02' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00003"\n|\n|\n| 2026-12-01');
  });

  it('prüft beim Löschen nichts, auch nicht einen regelwidrigen Datensatz', async () => {
    const { wurzel, pfad, s } = kurse([['r-00001', 'zu lang', '99', '2026-10-31', '2026-10-01']]);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        loesche('Kurs.md', 'r-00001', {
          Kuerzel: 'zu lang',
          Plaetze: '99',
          Beginn: '2026-10-31',
          Ende: '2026-10-01',
        }),
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).not.toContain('r-00001');
  });
});

// --- AK2: Datensatz-Regel und mehrere Verletzungen ----------------------------------------

describe('Prüfregeln: Datensatz-Regel und alle Verletzungen (4T-001931, AK2)', () => {
  it('weist ein Ändern ab, das nur eines der beteiligten Felder anfasst', async () => {
    const { wurzel, pfad, s } = kurse();
    const vorher = lies(pfad);

    // Das Ende bleibt, wie es ist; der neue Beginn liegt dahinter.
    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kurs.md', 'r-00001', KURS_1_GELESEN, { Beginn: '2026-11-15' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([
      {
        code: REGEL_LAGEN.datensatzregelVerletzt,
        position: 0,
        tabelle: 'Kurs.md',
        id: 'r-00001',
        felder: ['Beginn', 'Ende'],
        regel: 'Ende >= Beginn',
        meldung: 'Das Ende liegt vor dem Beginn.',
        grund: 'ausdruck',
      },
    ]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('meldet alle Verletzungen je Position: Felder in ihrer Reihenfolge, dann Datensatz-Regeln', async () => {
    const { wurzel, pfad, s } = kurse();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        neu('Kurs.md', { Kuerzel: 'x', Plaetze: '0', Beginn: '2026-12-02', Ende: '2026-12-01' }),
        aendere('Kurs.md', 'r-00002', { Plaetze: '20' }, { Plaetze: '31' }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis).map((n) => [n.position, n.code, n.feld || n.felder])).toEqual([
      [0, REGEL_LAGEN.pruefregelVerletzt, 'Kuerzel'],
      [0, REGEL_LAGEN.pruefregelVerletzt, 'Plaetze'],
      [0, REGEL_LAGEN.datensatzregelVerletzt, ['Beginn', 'Ende']],
      [1, REGEL_LAGEN.pruefregelVerletzt, 'Plaetze'],
    ]);
    expect(lies(pfad)).toBe(vorher);
  });
});

// --- AK4: Erzwingen übergeht keine Regel -------------------------------------------------

describe('Prüfregeln: Erzwingen nach einer Fremd-Änderung (4T-001931, AK4)', () => {
  it('weist ab, wenn die fremde Fassung eine Datensatz-Regel verletzt', async () => {
    const { wurzel, pfad, s } = kurse();
    // Von Hand: das Ende vor den Beginn gelegt.
    const vonHandGeaendert = vonHand(pfad, '| 2026-10-31', '| 2026-09-01');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kurs.md', 'r-00001', KURS_1_GELESEN, { Plaetze: '15' }, { erzwingen: true }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toMatchObject([
      { code: REGEL_LAGEN.datensatzregelVerletzt, id: 'r-00001', felder: ['Beginn', 'Ende'] },
    ]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('prüft auch ein Feld, das der erzwungene Auftrag nicht anfasst', async () => {
    const { wurzel, pfad, s } = kurse();
    const vonHandGeaendert = vonHand(pfad, '| 12', '| 99');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kurs.md', 'r-00001', KURS_1_GELESEN, { Kuerzel: 'ÖKOL' }, { erzwingen: true }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toMatchObject([
      { code: REGEL_LAGEN.pruefregelVerletzt, feld: 'Plaetze', wert: '99' },
    ]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
  });

  it('prüft beim von Hand gelöschten Datensatz den zuletzt gelesenen Stand mit', async () => {
    const { wurzel, pfad, s } = kurse();
    const ohneKurs1 = vonHand(
      pfad,
      '|- id="r-00001"\n| ÖKO\n| 12\n| 2026-10-01\n| 2026-10-31\n\n',
      '',
    );

    // Die Wiederanlage baut auf dem zuletzt gelesenen Stand auf; der neue Beginn
    // liegt hinter dessen Ende.
    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere(
          'Kurs.md',
          'r-00001',
          KURS_1_GELESEN,
          { Beginn: '2026-11-15' },
          { erzwingen: true },
        ),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toMatchObject([
      { code: REGEL_LAGEN.datensatzregelVerletzt, id: 'r-00001' },
    ]);
    expect(lies(pfad)).toBe(ohneKurs1);
  });

  it('schreibt die erzwungene Fassung, wenn das Ergebnis alle Regeln erfüllt', async () => {
    const { wurzel, pfad, s } = kurse();
    vonHand(pfad, '| 12', '| 14');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kurs.md', 'r-00001', KURS_1_GELESEN, { Plaetze: '16' }, { erzwingen: true }),
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('| ÖKO\n| 16\n');
  });
});

// --- Zusammenspiel mit der Verweis-Regel ---------------------------------------------------

describe('Prüfregeln hinter der Verweis-Regel: die ersetzte Kennung zählt (4T-001931)', () => {
  const KOPF_DEFINITION = [
    'db-table:',
    '  fields:',
    '    - name: nummer',
    '  key: nummer',
    '  lastId: 1',
  ];
  const POSITION_DEFINITION = [
    'db-table:',
    '  fields:',
    '    - name: kopf',
    '      type: record',
    '      options:',
    '        table: Kopf',
    "      check: '/^r-\\d{5}$/'",
    '    - name: artikel',
    '  lastId: 0',
  ];

  function vorrat() {
    const wurzel = bereich();
    const kopf = lege(wurzel, 'Kopf.md', tabelle(KOPF_DEFINITION, [['r-00001', 'K-1']]));
    const position = lege(wurzel, 'Position.md', tabelle(POSITION_DEFINITION));
    return { wurzel, position, sicht: sichtMit(kopf, position) };
  }

  it('sieht den Schlüssel-Wert als die Kennung, die die Verweis-Regel einsetzt', async () => {
    const { wurzel, position, sicht } = vorrat();

    const ergebnis = await mitRegeln([verweisRegel, pruefregelnRegel], sicht).fuehreAuftragAus(
      wurzel,
      { anweisungen: [neu('Position.md', { kopf: 'K-1', artikel: 'Schraube' })] },
    );

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(position)).toContain('|- id="r-00001"\n| r-00001\n| Schraube');
  });

  it('weist denselben Wert ohne die Verweis-Regel davor ab (Gegenprobe)', async () => {
    const { wurzel, position, sicht } = vorrat();
    const vorher = lies(position);

    const ergebnis = await mitRegeln([pruefregelnRegel], sicht).fuehreAuftragAus(wurzel, {
      anweisungen: [neu('Position.md', { kopf: 'K-1', artikel: 'Schraube' })],
    });

    expect(nahte(ergebnis)).toMatchObject([
      { code: REGEL_LAGEN.pruefregelVerletzt, feld: 'kopf', wert: 'K-1', grund: 'regex' },
    ]);
    expect(lies(position)).toBe(vorher);
  });
});
