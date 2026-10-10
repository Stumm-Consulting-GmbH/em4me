// 4T-002000 (Epic 3E-000307): Nachweis der japanischen Kalender-Vorlage —
// Voll-Durchlauf gegen die Internationalisierungs-Schnittstelle (Kalender
// «japanese») einschließlich Ära, die benannte Ausnahme am Meiji-Beginn, jeder
// Ära-Beginn tagesgenau gegen die Fachquellen der Erhebung, die kanonische Form
// mit dem Kürzel der Ära (Kennzeichen alwaysWriteEpoch aus 4T-001999) und die
// Umrechnung im Block mit Uhrzeit. Grundsatz E8 des Epics: nie gegen die
// eigene Umrechnung. Menü-Platz und Namen in fünf Sprachen prüft
// test/unit/kalender-vorlagen.test.js mit den übrigen Vorlagen.
//
// Die Stichtage stammen aus der Erhebung Tests/3E-000307/Erhebung/teil-b/japan.md
// (unversioniert; dort je Paar das wörtliche Zitat und der abgelegte
// Abruf-Text, Abruf jeweils am 2026-09-30).
//
// Laufzeit: gemessen am 2026-09-30 isoliert rund 0,5 s für den Voll-Durchlauf
// (84 806 Tage, ein Formatierer für alle Tage).
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import {
  convertInBlock,
  epochOf,
  cycleAt,
  formatTuple,
  parseCanonical,
} from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus der gregorianischen und der japanischen Vorlage, beide über die
// Sammlung mit deutschem Katalog erzeugt.
function blockMitJapanisch() {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: [
          findCalendarTemplate('gregorian').create(tDe),
          findCalendarTemplate('japanese').create(tDe),
        ],
      },
    ],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(['gregorian', 'japanese']);
  return { block, kalender: block.calendars[1] };
}

// Epochen der Vorlage: 0 = «vor Meiji», dann die Ären in dieser Reihenfolge.
const AEREN = ['Meiji', 'Taishō', 'Shōwa', 'Heisei', 'Reiwa'];

// Stand der Vorlage zu einem gregorianischen Tag; ohne expect, weil die
// Funktion im Voll-Durchlauf für jeden Tag läuft.
function vorlagenStand(block, kalender, gregorianisch) {
  const r = convertInBlock(block, 'gregorian', gregorianisch.concat([0, 0, 0]), 'japanese');
  if (!r.ok) throw new Error(`Umrechnung von ${gregorianisch.join('-')} scheitert: ${r.code}`);
  const ep = epochOf(kalender, r.tuple);
  return {
    epoche: ep.index,
    jahr: ep.year,
    monat: r.tuple[1],
    tag: r.tuple[2],
    wochentag: cycleAt(kalender, r.tuple, 'week').position,
    tupel: r.tuple,
  };
}

const WOCHENTAG = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Leser der Schnittstelle mit EINEM Formatierer. Die Ära kommt als Name
// zurück; ab Meiji ist ihre Epoche der Platz in AEREN plus eins, jede ältere
// Ära (etwa «Keiō (1865–1868)») liefert -1.
function schnittstelle() {
  const format = new Intl.DateTimeFormat('en-u-ca-japanese-nu-latn', {
    timeZone: 'UTC',
    era: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  expect(format.resolvedOptions().calendar).toBe('japanese');
  return (datum) => {
    const teile = {};
    for (const teil of format.formatToParts(datum)) teile[teil.type] = teil.value;
    const platz = AEREN.indexOf(teile.era);
    return {
      aera: teile.era,
      epoche: platz < 0 ? -1 : platz + 1,
      jahr: Number(teile.year),
      monat: Number(teile.month),
      tag: Number(teile.day),
      wochentag: WOCHENTAG[teile.weekday],
    };
  };
}

const TAG_MS = 86400000;
const datumAus = (g) => new Date(Date.UTC(g[0], g[1] - 1, g[2]));
const segmente = (d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];

describe('Voll-Durchlauf gegen die Schnittstelle (4T-002000)', () => {
  it('AK3: 1868-10-23 bis 2100-12-31, Ära, Jahr, Monat, Tag und Wochentag ohne Abweichung', () => {
    const { block, kalender } = blockMitJapanisch();
    const lies = schnittstelle();
    const erster = Date.UTC(1868, 9, 23);
    const letzter = Date.UTC(2100, 11, 31);
    let tage = 0;
    const abweichungen = [];
    for (let ms = erster; ms <= letzter; ms += TAG_MS) {
      const d = new Date(ms);
      const g = segmente(d);
      tage++;
      const s = vorlagenStand(block, kalender, g);
      const i = lies(d);
      const modell = [s.epoche, s.jahr, s.monat, s.tag, s.wochentag];
      const soll = [i.epoche, i.jahr, i.monat, i.tag, i.wochentag];
      if (modell.some((v, k) => v !== soll[k])) {
        abweichungen.push(
          `${g.join('-')}: Modell ${modell.join('/')} ≠ Schnittstelle ${soll.join('/')}`,
        );
      }
    }
    expect(tage).toBe((letzter - erster) / TAG_MS + 1);
    expect(tage).toBe(84806);
    expect(abweichungen.length, abweichungen.slice(0, 10).join('\n')).toBe(0);
  });
});

describe('Benannte Ausnahme: Beginn der Ära Meiji (4T-002000)', () => {
  // Die Schnittstelle beginnt Meiji am 8. September 1868 und zeigt davor
  // «Keiō 4». Ausgerufen wurde die Ära am 8. Tag des 9. Monats nach dem damals
  // geltenden Mondkalender, gregorianisch am 23. Oktober 1868
  // (https://ja.wikipedia.org/wiki/慶応 und
  // https://crd.ndl.go.jp/reference/entry/index.php?page=ref_view&id=1000255208,
  // Erhebung teil-b/japan.md). Die Referenz-Datenbank der Nationalbibliothek
  // erklärt, dass Nachschlagewerke den Wechsel als «1868年9月8日» führen, mit
  // westlichem Jahr, aber Monat und Tag des Mondkalenders (Regel R11 der
  // Erhebung). Die Vorlage folgt dem gregorianischen Tag der Ausrufung; in der
  // Spanne dazwischen zählt sie «1 vor Meiji», die Schnittstelle «Meiji 1».
  //
  // 4T-002199: Die Ausnahme hängt an der Fassung der Schnittstelle (ICU). Ab
  // ICU 78 (CLDR 48) beginnt Meiji auch dort am 23. Oktober 1868 und die Spanne
  // heißt «Keiō 4»; gemessen am 2026-10-10 mit ICU 77.1 (Node 22.18, Windows)
  // gegen ICU 78.2 (Node 22.22, Linux-Container). Der Fall erkennt die Fassung
  // am ersten Tag der Spanne und prüft je Fassung, was dort gilt; die Vorlage
  // zählt in beiden Fällen unverändert «1 vor Meiji».
  it('AK3: vom 1868-09-08 bis 1868-10-22 zählt die Vorlage «1 vor Meiji», die Schnittstelle «Meiji 1» bis ICU 77 und «Keiō 4» ab ICU 78', () => {
    const { block, kalender } = blockMitJapanisch();
    const lies = schnittstelle();
    const alteFassung = lies(datumAus([1868, 9, 8])).aera === 'Meiji';
    let tage = 0;
    for (let ms = Date.UTC(1868, 8, 8); ms <= Date.UTC(1868, 9, 22); ms += TAG_MS) {
      const d = new Date(ms);
      const g = segmente(d);
      tage++;
      const s = vorlagenStand(block, kalender, g);
      const i = lies(d);
      if (alteFassung) {
        expect([i.aera, i.jahr, i.monat, i.tag], g.join('-')).toEqual(['Meiji', 1, g[1], g[2]]);
      } else {
        expect(i.aera, g.join('-')).toMatch(/^Keiō/);
        expect([i.jahr, i.monat, i.tag], g.join('-')).toEqual([4, g[1], g[2]]);
      }
      expect([s.epoche, s.jahr, s.monat, s.tag], g.join('-')).toEqual([0, 1, g[1], g[2]]);
      expect(s.wochentag).toBe(i.wochentag);
    }
    expect(tage).toBe(45);
  });

  it('AK3: am 1868-09-07 zeigt die Schnittstelle «Keiō 4», am 1868-10-23 beide «Meiji 1»', () => {
    const { block, kalender } = blockMitJapanisch();
    const lies = schnittstelle();
    const davor = lies(datumAus([1868, 9, 7]));
    expect(davor.aera).toMatch(/^Keiō/);
    expect([davor.jahr, davor.monat, davor.tag]).toEqual([4, 9, 7]);
    const vorlageDavor = vorlagenStand(block, kalender, [1868, 9, 7]);
    expect([vorlageDavor.epoche, vorlageDavor.jahr]).toEqual([0, 1]);
    const beginn = vorlagenStand(block, kalender, [1868, 10, 23]);
    expect([beginn.epoche, beginn.jahr, beginn.monat, beginn.tag]).toEqual([1, 1, 10, 23]);
    expect(lies(datumAus([1868, 10, 23]))).toMatchObject({ aera: 'Meiji', jahr: 1 });
  });
});

// Ära-Beginne und weitere Stichtage aus japan.md. eigen = [Epoche, Anzeige-
// Jahr, Monat, Tag]; bei nurJahr (Tage vor 1873, deren Monat und Tag in der
// Quelle solche des Mondkalenders sind) zählen allein Epoche und Jahr.
// «ausdrücklich» stammt aus der Tabelle «Ausdrücklich belegte Entsprechungen»,
// «regel» aus einer zitierten Regel der Erhebung.
const JA = 'https://ja.wikipedia.org/wiki/';
const EN = 'https://en.wikipedia.org/wiki/';
const NDL = 'https://crd.ndl.go.jp/reference/entry/index.php?page=ref_view&id=1000255208';
const AERA_BEGINNE = [
  {
    name: 'Meiji 1 am Tag der Ausrufung',
    gregorianisch: [1868, 10, 23],
    eigen: [1, 1],
    nurJahr: true,
    beleg: 'ausdrücklich',
    quellen: [`${JA}慶応`, NDL],
  },
  {
    name: 'Vortag: noch vor Meiji (Keiō 4/9/7)',
    gregorianisch: [1868, 10, 22],
    eigen: [0, 1],
    nurJahr: true,
    beleg: 'regel',
    quellen: [`${JA}慶応`],
  },
  {
    name: 'Meiji 5, letzter Tag des alten Kalenders',
    gregorianisch: [1872, 12, 31],
    eigen: [1, 5],
    nurJahr: true,
    beleg: 'ausdrücklich',
    quellen: [`${JA}明治`],
  },
  {
    name: 'Meiji 6, erster Tag des gregorianischen Kalenders',
    gregorianisch: [1873, 1, 1],
    eigen: [1, 6, 1, 1],
    beleg: 'ausdrücklich',
    quellen: [`${JA}明治`],
  },
  {
    name: 'Vortag des Taishō-Beginns: Meiji 45 (Edikt: ab Meiji 45/7/30 Taishō)',
    gregorianisch: [1912, 7, 29],
    eigen: [1, 45, 7, 29],
    beleg: 'regel',
    quellen: [`${JA}大正`],
  },
  {
    name: 'Taishō 1',
    gregorianisch: [1912, 7, 30],
    eigen: [2, 1, 7, 30],
    beleg: 'ausdrücklich',
    quellen: [`${JA}大正`],
  },
  {
    name: 'Taishō 10',
    gregorianisch: [1921, 11, 25],
    eigen: [2, 10, 11, 25],
    beleg: 'ausdrücklich',
    quellen: [`${JA}大正`],
  },
  {
    name: 'Vortag des Shōwa-Beginns: Taishō 15 (Edikt: ab Taishō 15/12/25 Shōwa)',
    gregorianisch: [1926, 12, 24],
    eigen: [2, 15, 12, 24],
    beleg: 'regel',
    quellen: [`${JA}昭和`, `${JA}大正`],
  },
  {
    name: 'Shōwa 1',
    gregorianisch: [1926, 12, 25],
    eigen: [3, 1, 12, 25],
    beleg: 'ausdrücklich',
    quellen: [`${JA}昭和`],
  },
  {
    name: 'Shōwa 1, letzter Tag',
    gregorianisch: [1926, 12, 31],
    eigen: [3, 1, 12, 31],
    beleg: 'ausdrücklich',
    quellen: [`${JA}昭和`],
  },
  {
    name: 'Shōwa 64, letzter Tag der Ära',
    gregorianisch: [1989, 1, 7],
    eigen: [3, 64, 1, 7],
    beleg: 'ausdrücklich',
    quellen: [`${JA}昭和`],
  },
  {
    name: 'Heisei 1',
    gregorianisch: [1989, 1, 8],
    eigen: [4, 1, 1, 8],
    beleg: 'ausdrücklich',
    quellen: [`${EN}Heisei_era`],
  },
  {
    name: 'Heisei 16',
    gregorianisch: [2004, 10, 23],
    eigen: [4, 16, 10, 23],
    beleg: 'ausdrücklich',
    quellen: [`${EN}Heisei_era`],
  },
  {
    name: 'Heisei 31, Verkündung von «Reiwa»',
    gregorianisch: [2019, 4, 1],
    eigen: [4, 31, 4, 1],
    beleg: 'ausdrücklich',
    quellen: [`${JA}元号を改める政令_(平成三十一年政令第百四十三号)`],
  },
  {
    name: 'Heisei 31, letzter Tag der Ära',
    gregorianisch: [2019, 4, 30],
    eigen: [4, 31, 4, 30],
    beleg: 'ausdrücklich',
    quellen: [`${EN}Heisei_era`],
  },
  {
    name: 'Reiwa 1',
    gregorianisch: [2019, 5, 1],
    eigen: [5, 1, 5, 1],
    beleg: 'ausdrücklich',
    quellen: [`${EN}Reiwa_era`],
  },
];

describe('Ära-Beginne gegen die Fachquellen (4T-002000)', () => {
  it.each(AERA_BEGINNE.map((p) => [`${p.gregorianisch.join('-')} ${p.name} (${p.beleg})`, p]))(
    'AK2: %s',
    (_name, paar) => {
      for (const q of paar.quellen) expect(q).toMatch(/^https:\/\//);
      const { block, kalender } = blockMitJapanisch();
      const s = vorlagenStand(block, kalender, paar.gregorianisch);
      const ist = paar.nurJahr ? [s.epoche, s.jahr] : [s.epoche, s.jahr, s.monat, s.tag];
      expect(ist).toEqual(paar.eigen);
      // Rückweg: derselbe Tag der Vorlage ergibt wieder den gregorianischen Tag.
      expect(convertInBlock(block, 'japanese', s.tupel, 'gregorian')).toEqual({
        ok: true,
        tuple: paar.gregorianisch.concat([0, 0, 0]),
      });
    },
  );

  it('AK2: jeder Ära-Beginn der Vorlage ist durch einen ausdrücklich belegten Stichtag gedeckt', () => {
    const { kalender } = blockMitJapanisch();
    const beginne = kalender.epochs.slice(1).map((e) => e.start.join('-'));
    const belegt = AERA_BEGINNE.filter(
      (p) => p.beleg === 'ausdrücklich' && p.eigen[1] === 1 && p.eigen[0] >= 1,
    ).map((p) => p.gregorianisch.join('-'));
    for (const beginn of beginne) expect(belegt).toContain(beginn);
    expect(beginne).toEqual(['1868-10-23', '1912-7-30', '1926-12-25', '1989-1-8', '2019-5-1']);
  });
});

describe('Kanonische Form mit dem Kürzel der Ära (4T-002000)', () => {
  const HEUTE = [2026, 9, 30, 0, 0, 0];

  it('AK1: ein heutiges Datum wird als «8-09-30 Reiwa» geschrieben, in der Namens-Form mit Monats-Name', () => {
    const { kalender } = blockMitJapanisch();
    expect(kalender.alwaysWriteEpoch).toBe(true);
    expect(formatTuple(kalender, HEUTE)).toBe('8-09-30 Reiwa');
    expect(formatTuple(kalender, HEUTE, { named: true })).toBe('8-September-30 Reiwa');
    // Auch in einer älteren Ära steht deren Kürzel.
    expect(formatTuple(kalender, [1989, 1, 7, 0, 0, 0])).toBe('64-01-07 Shōwa');
  });

  it('AK1: Werte mit und ohne Kürzel werden als derselbe Tag gelesen', () => {
    const { kalender } = blockMitJapanisch();
    const mit = parseCanonical(kalender, '8-09-30 Reiwa');
    const ohne = parseCanonical(kalender, '8-09-30');
    expect(mit).toEqual({ ok: true, tuple: HEUTE, epochIndex: 5 });
    expect(ohne).toEqual(mit);
    expect(parseCanonical(kalender, '31-04-30 Heisei')).toMatchObject({
      ok: true,
      tuple: [2019, 4, 30, 0, 0, 0],
    });
  });

  it('AK1: nach dem Nachtragen einer sechsten Ära bleibt ein mit «Reiwa» geschriebener Wert derselbe Tag', () => {
    const { kalender } = blockMitJapanisch();
    const geschrieben = formatTuple(kalender, HEUTE);
    const erweitert = normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          calendars: [
            {
              ...kalender,
              epochs: [...kalender.epochs, { name: 'Neue Ära', abbr: 'Neu', start: [2030, 1, 1] }],
            },
          ],
        },
      ],
    }).blocks[0].calendars[0];
    expect(erweitert.epochs).toHaveLength(7);
    expect(parseCanonical(erweitert, geschrieben)).toEqual({
      ok: true,
      tuple: HEUTE,
      epochIndex: 5,
    });
    expect(formatTuple(erweitert, HEUTE)).toBe(geschrieben);
    // Gegenprobe zum Anlass des Kennzeichens: Ohne Kürzel läse die erweiterte
    // Zeitrechnung denselben Text als Jahr 8 der neuen Ära, also als einen
    // anderen Tag.
    expect(parseCanonical(erweitert, '8-09-30').tuple).not.toEqual(HEUTE);
  });
});

describe('Umrechnung im Block zur gregorianischen Vorlage mit Uhrzeit (4T-002000)', () => {
  it('AK5: Tage in jeder Ära und vor Meiji rechnen mit Uhrzeit hin und zurück', () => {
    const { block } = blockMitJapanisch();
    // Internes Jahr = gregorianisches Jahr: dasselbe Tupel auf beiden Seiten.
    for (const tag of [
      [1850, 6, 15],
      [1868, 10, 23],
      [1900, 2, 28],
      [1912, 7, 30],
      [1926, 12, 25],
      [1989, 1, 8],
      [2000, 2, 29],
      [2019, 5, 1],
      [2026, 9, 30],
    ]) {
      for (const zeit of [
        [13, 45, 30],
        [23, 59, 59],
        [0, 0, 1],
      ]) {
        const tupel = tag.concat(zeit);
        expect(convertInBlock(block, 'gregorian', tupel, 'japanese')).toEqual({
          ok: true,
          tuple: tupel,
        });
        expect(convertInBlock(block, 'japanese', tupel, 'gregorian')).toEqual({
          ok: true,
          tuple: tupel,
        });
      }
    }
  });
});
