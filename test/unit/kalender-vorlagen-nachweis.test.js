// 4T-001998 (Epic 3E-000307): Nachweis der sechs Kalender-Vorlagen im heutigen
// Modell, Quelle 1 — Voll-Durchlauf jeden Tag vom 1900-01-01 bis 2100-12-31
// gegen eine Rechnung, die nicht die eigene ist (Grundsatz E8 des Epics):
// die Internationalisierungs-Schnittstelle (Intl.DateTimeFormat mit
// Kalender-Option) für Indisch, Buddhistisch, Äthiopisch, Koptisch und Minguo,
// die veröffentlichte Formel der julianischen Tages-Nummer für Julianisch.
// Dazu je Vorlage die Grenzfälle als benannte Erwartungen und die Rundreise in
// einem sehr fernen Jahr. Die Stichtage der zweiten Quelle und die Umrechnung
// mit Zeit-Anteil prüft test/unit/kalender-vorlagen-stichtage.test.js.
//
// Laufzeit: Je Vorlage ein eigener Fall mit einem Formatierer je Kalender, der
// für alle 73 414 Tage wiederverwendet wird; gemessen am 2026-09-30 isoliert
// 0,6 bis 1,2 s je Fall, rund 4,3 s für die ganze Datei. Ein
// Fall je Vorlage statt eines gemeinsamen Durchlaufs hält jeden Fall weit unter
// dem voreingestellten Zeitlimit, ohne ein eigenes Limit zu brauchen.
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import { convertInBlock, epochOf, cycleAt } from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus der gregorianischen Vorlage und der geprüften Vorlage, beide über
// die Sammlung mit deutschem Katalog erzeugt.
function blockMit(id) {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: [
          findCalendarTemplate('gregorian').create(tDe),
          findCalendarTemplate(id).create(tDe),
        ],
      },
    ],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(['gregorian', id]);
  return { block, kalender: block.calendars[1] };
}

// Stand der Vorlage zu einem gregorianischen Tag: Epoche, Anzeige-Jahr, Monat,
// Tag, Wochentag (Montag = 0) und das interne Tupel. Ohne expect, weil die
// Funktion im Voll-Durchlauf 73 414-mal läuft; ein Fehlschlag wirft.
function vorlagenStand(block, kalender, gregorianisch) {
  const r = convertInBlock(block, 'gregorian', gregorianisch.concat([0, 0, 0]), kalender.id);
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

// Mitternacht UTC eines proleptisch-gregorianischen Tages; setUTCFullYear statt
// Date.UTC, weil Date.UTC die Jahre 0 bis 99 als 1900 bis 1999 liest.
function utc(jahr, monat, tag) {
  const d = new Date(0);
  d.setUTCFullYear(jahr, monat - 1, tag);
  return d;
}

const WOCHENTAG = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Leser der Schnittstelle für einen Kalender, mit EINEM Formatierer. Die
// Zeitalter-Angaben der Schnittstelle werden auf die Epochen der Vorlagen
// abgebildet (gemessen und festgehalten in der Erhebung der Konzept-Stufe):
//   roc       «B.R.O.C.» zählt rückwärts wie «vor Minguo», sonst Minguo.
//   coptic    das Zeitalter vor der Epoche zählt rückwärts wie «vor A.M.»,
//             das andere ist Anno Martyrum.
//   ethiopic  das Zeitalter vor der Epoche ist die Welt-Ära Amete Alem
//             (äthiopisches Jahr + 5500).
//   indian, buddhist  ein einziges Zeitalter mit Jahr 0 und negativen Jahren;
//             ein Jahr ≤ 0 ist in der Vorlage das Jahr 1 − y vor der Epoche.
// 4T-002199: Die NAMEN der Zeitalter hängen an der Fassung der Schnittstelle
// (ICU). Bis ICU 77 heißen sie bei Koptisch und Äthiopisch «ERA1» und «ERA0»;
// ab ICU 78 (CLDR 48) «AM» und «AA», und Koptisch nennt vor der Epoche gar
// kein Zeitalter mehr. Gemessen am 2026-10-10: Node 22.18 mit ICU 77.1 unter
// Windows gegen Node 22.22 mit ICU 78.2 im Linux-Container. Der Leser
// vergleicht deshalb nicht mit Namen, sondern mit dem Zeitalter eines Tages,
// der sicher in der Epoche liegt; Jahr, Monat und Tag sind in beiden Fassungen
// gleich.
const IN_DER_EPOCHE = utc(2024, 9, 11);

function schnittstelle(kalender) {
  const format = new Intl.DateTimeFormat(`en-u-ca-${kalender}-nu-latn`, {
    timeZone: 'UTC',
    era: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  expect(format.resolvedOptions().calendar).toBe(kalender);
  const zeitalterDerEpoche = format
    .formatToParts(IN_DER_EPOCHE)
    .find((teil) => teil.type === 'era')?.value;
  if (['roc', 'coptic', 'ethiopic'].includes(kalender)) expect(zeitalterDerEpoche).toBeTruthy();
  return (datum) => {
    const teile = {};
    for (const teil of format.formatToParts(datum)) teile[teil.type] = teil.value;
    let jahr = Number(teile.year);
    let epoche = 1;
    if (kalender === 'roc' || kalender === 'coptic') {
      if (teile.era !== zeitalterDerEpoche) epoche = 0;
    } else {
      if (kalender === 'ethiopic' && teile.era !== zeitalterDerEpoche) jahr -= 5500;
      if (jahr <= 0) {
        epoche = 0;
        jahr = 1 - jahr;
      }
    }
    return {
      epoche,
      jahr,
      monat: Number(teile.month),
      tag: Number(teile.day),
      wochentag: WOCHENTAG[teile.weekday],
    };
  };
}

// Julianische Tages-Nummer (JDN) aus einem gregorianischen und aus einem
// julianischen Datum (astronomische Jahres-Zählung), nach
//   https://en.wikipedia.org/wiki/Julian_day, Abschnitte «Converting Gregorian
//   calendar date to Julian day number» und «Converting Julian calendar date to
//   Julian day number», abgerufen am 2026-09-30.
// Die Quelle schreibt ganzzahlige Divisionen mit Abschneiden gegen null vor;
// die julianische Formel gilt für Jahre ≥ −4712. Wochentag nach demselben
// Artikel (ISO): mod(J, 7) + 1 mit 1 = Montag, hier 0-basiert als mod(J, 7).
const q = (a, b) => Math.trunc(a / b);
function jdnGregorianisch(Y, M, D) {
  return (
    q(1461 * (Y + 4800 + q(M - 14, 12)), 4) +
    q(367 * (M - 2 - 12 * q(M - 14, 12)), 12) -
    q(3 * q(Y + 4900 + q(M - 14, 12), 100), 4) +
    D -
    32075
  );
}
function jdnJulianisch(Y, M, D) {
  return 367 * Y - q(7 * (Y + 5001 + q(M - 9, 7)), 4) + q(275 * M, 9) + D + 1729777;
}

// Alle Tage 1900-01-01 bis 2100-12-31 als gregorianische Datums-Segmente, aus
// Date gezählt (unabhängig vom Modell).
const ERSTER = Date.UTC(1900, 0, 1);
const LETZTER = Date.UTC(2100, 11, 31);
const TAG_MS = 86400000;
function* alleTage() {
  for (let ms = ERSTER; ms <= LETZTER; ms += TAG_MS) {
    const d = new Date(ms);
    yield { datum: d, g: [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] };
  }
}
const TAGE_GESAMT = (LETZTER - ERSTER) / TAG_MS + 1;

const kurz = (s) => [s.epoche, s.jahr, s.monat, s.tag, s.wochentag];

// Voll-Durchlauf gegen die Schnittstelle: 0 Abweichungen erwartet; bei
// Abweichung nennt die Meldung die ersten betroffenen Tage.
function vollDurchlaufSchnittstelle(id, kalenderSchnittstelle) {
  const { block, kalender } = blockMit(id);
  const lies = schnittstelle(kalenderSchnittstelle);
  let tage = 0;
  const abweichungen = [];
  for (const { datum, g } of alleTage()) {
    tage++;
    const modell = kurz(vorlagenStand(block, kalender, g));
    const soll = kurz(lies(datum));
    if (modell.some((v, i) => v !== soll[i])) {
      abweichungen.push(
        `${g.join('-')}: Modell ${modell.join('/')} ≠ Schnittstelle ${soll.join('/')}`,
      );
    }
  }
  expect(tage).toBe(TAGE_GESAMT);
  expect(abweichungen.length, abweichungen.slice(0, 10).join('\n')).toBe(0);
}

describe('Quelle 1: Voll-Durchlauf 1900 bis 2100 gegen die Schnittstelle (4T-001998)', () => {
  it('AK2: Indischer Nationalkalender (Kalender «indian»), 0 Abweichungen', () => {
    vollDurchlaufSchnittstelle('indian', 'indian');
  });
  it('AK2: Buddhistische Jahreszählung (Kalender «buddhist»), 0 Abweichungen', () => {
    vollDurchlaufSchnittstelle('buddhist', 'buddhist');
  });
  it('AK2: Äthiopischer Kalender (Kalender «ethiopic»), 0 Abweichungen', () => {
    vollDurchlaufSchnittstelle('ethiopic', 'ethiopic');
  });
  it('AK2: Koptischer Kalender (Kalender «coptic»), 0 Abweichungen', () => {
    vollDurchlaufSchnittstelle('coptic', 'coptic');
  });
  it('AK2: Minguo-Kalender (Kalender «roc»), 0 Abweichungen', () => {
    vollDurchlaufSchnittstelle('minguo', 'roc');
  });
});

describe('Quelle 1: Voll-Durchlauf 1900 bis 2100 gegen die Formel der julianischen Tages-Nummer (4T-001998)', () => {
  it('AK3: Julianischer Kalender, 0 Abweichungen in Tag und Wochentag', () => {
    const { block, kalender } = blockMit('julian');
    let tage = 0;
    const abweichungen = [];
    for (const { g } of alleTage()) {
      tage++;
      const s = vorlagenStand(block, kalender, g);
      const soll = jdnGregorianisch(...g);
      // Im Zeitraum liegt alles in der Epoche «n. Chr.»; das Anzeige-Jahr ist
      // dort die astronomische Jahres-Zahl der Formel.
      const ist = s.epoche === 1 ? jdnJulianisch(s.jahr, s.monat, s.tag) : null;
      if (ist !== soll || s.wochentag !== soll % 7) {
        abweichungen.push(
          `${g.join('-')}: julianisch ${s.jahr}-${s.monat}-${s.tag} (JDN ${ist}, Wochentag ${s.wochentag}) ≠ JDN ${soll}`,
        );
      }
    }
    expect(tage).toBe(TAGE_GESAMT);
    expect(abweichungen.length, abweichungen.slice(0, 10).join('\n')).toBe(0);
  });

  it('AK3: Stichtag 04.10.1582 julianisch = 14.10.1582 gregorianisch, gefolgt von 05.10. = 15.10.', () => {
    const { block, kalender } = blockMit('julian');
    expect(jdnJulianisch(1582, 10, 4)).toBe(jdnGregorianisch(1582, 10, 14));
    expect(jdnJulianisch(1582, 10, 5)).toBe(jdnGregorianisch(1582, 10, 15));
    const vorher = vorlagenStand(block, kalender, [1582, 10, 14]);
    const nachher = vorlagenStand(block, kalender, [1582, 10, 15]);
    expect([vorher.jahr, vorher.monat, vorher.tag]).toEqual([1582, 10, 4]);
    expect([nachher.jahr, nachher.monat, nachher.tag]).toEqual([1582, 10, 5]);
    // Donnerstag, 4. Oktober, gefolgt von Freitag, 15. Oktober.
    expect([vorher.wochentag, nachher.wochentag]).toEqual([3, 4]);
  });
});

// Grenzfälle je Vorlage: gregorianischer Tag → erwarteter Stand
// [Epoche (0 = offen in die Vergangenheit), Anzeige-Jahr, Monat, Tag].
// Geprüft wird die Vorlage gegen die Erwartung und die Erwartung gegen ihre
// Quelle: bei «schnittstelle» gegen Intl, bei «formel» gegen die julianische
// Tages-Nummer, bei «regel» gegen die Regel «gregorianisches Jahr + 543,
// Monat und Tag unverändert» (die Schnittstelle rechnet «buddhist» vor 1582
// auf dem julianischen Kalender und taugt dort nicht als Gegenstück).
const GRENZFAELLE = {
  julian: {
    quelle: 'formel',
    faelle: [
      ['Tag vor dem Schalttag', [1900, 3, 12], [1, 1900, 2, 28]],
      [
        'Schalttag 29. Februar 1900 (gregorianisch kein Schaltjahr)',
        [1900, 3, 13],
        [1, 1900, 2, 29],
      ],
      ['Tag nach dem Schalttag', [1900, 3, 14], [1, 1900, 3, 1]],
      ['Jahreswechsel: letzter Tag 1999', [2000, 1, 13], [1, 1999, 12, 31]],
      ['Jahreswechsel: erster Tag 2000', [2000, 1, 14], [1, 2000, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [0, 12, 29], [0, 1, 12, 31]],
      ['Epochen-Wechsel: erster Tag der Epoche', [0, 12, 30], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [-1, 12, 30], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [-2, 12, 30], [0, 2, 1, 1]],
    ],
  },
  indian: {
    quelle: 'schnittstelle',
    kalender: 'indian',
    faelle: [
      ['Tag vor dem Schalttag (30 Chaitra 1946)', [2024, 4, 19], [1, 1946, 1, 30]],
      ['Schalttag 31 Chaitra 1946', [2024, 4, 20], [1, 1946, 1, 31]],
      ['Tag nach dem Schalttag (1 Vaisakha 1946)', [2024, 4, 21], [1, 1946, 2, 1]],
      ['gregorianischer Schalttag im Saka-Gemeinjahr', [2024, 2, 29], [1, 1945, 12, 10]],
      ['Jahreswechsel: letzter Tag 1945', [2024, 3, 20], [1, 1945, 12, 30]],
      ['Jahreswechsel: erster Tag 1946', [2024, 3, 21], [1, 1946, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [79, 3, 21], [0, 1, 12, 30]],
      ['Epochen-Wechsel: erster Tag der Epoche', [79, 3, 22], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [78, 3, 22], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [77, 3, 22], [0, 2, 1, 1]],
    ],
  },
  buddhist: {
    quelle: 'regel',
    kalender: 'buddhist',
    faelle: [
      ['Tag vor dem Schalttag', [2024, 2, 28], [1, 2567, 2, 28]],
      ['Schalttag', [2024, 2, 29], [1, 2567, 2, 29]],
      ['Tag nach dem Schalttag', [2024, 3, 1], [1, 2567, 3, 1]],
      ['Jahreswechsel: letzter Tag 2566', [2023, 12, 31], [1, 2566, 12, 31]],
      ['Jahreswechsel: erster Tag 2567', [2024, 1, 1], [1, 2567, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [-543, 12, 31], [0, 1, 12, 31]],
      ['Epochen-Wechsel: erster Tag der Epoche', [-542, 1, 1], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [-543, 1, 1], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [-544, 1, 1], [0, 2, 1, 1]],
    ],
  },
  ethiopic: {
    quelle: 'schnittstelle',
    kalender: 'ethiopic',
    faelle: [
      ['Tag vor dem Schalttag (5 Ṗagumen 2015)', [2023, 9, 10], [1, 2015, 13, 5]],
      ['Schalttag 6 Ṗagumen 2015', [2023, 9, 11], [1, 2015, 13, 6]],
      ['Tag nach dem Schalttag, Jahreswechsel (1 Mäskäräm 2016)', [2023, 9, 12], [1, 2016, 1, 1]],
      ['Jahreswechsel im Gemeinjahr: letzter Tag 2016', [2024, 9, 10], [1, 2016, 13, 5]],
      ['Jahreswechsel im Gemeinjahr: erster Tag 2017', [2024, 9, 11], [1, 2017, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [8, 8, 26], [0, 1, 13, 5]],
      ['Epochen-Wechsel: erster Tag der Epoche', [8, 8, 27], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [7, 8, 28], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [6, 8, 27], [0, 2, 1, 1]],
    ],
  },
  coptic: {
    quelle: 'schnittstelle',
    kalender: 'coptic',
    faelle: [
      ['Tag vor dem Schalttag (5 Nasie 1739)', [2023, 9, 10], [1, 1739, 13, 5]],
      ['Schalttag 6 Nasie 1739', [2023, 9, 11], [1, 1739, 13, 6]],
      ['Tag nach dem Schalttag, Jahreswechsel (1 Thout 1740)', [2023, 9, 12], [1, 1740, 1, 1]],
      ['Jahreswechsel im Gemeinjahr: letzter Tag 1740', [2024, 9, 10], [1, 1740, 13, 5]],
      ['Jahreswechsel im Gemeinjahr: erster Tag 1741', [2024, 9, 11], [1, 1741, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [284, 8, 28], [0, 1, 13, 5]],
      ['Epochen-Wechsel: erster Tag der Epoche', [284, 8, 29], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [283, 8, 30], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [282, 8, 29], [0, 2, 1, 1]],
    ],
  },
  minguo: {
    quelle: 'schnittstelle',
    kalender: 'roc',
    faelle: [
      ['Tag vor dem Schalttag', [2024, 2, 28], [1, 113, 2, 28]],
      ['Schalttag', [2024, 2, 29], [1, 113, 2, 29]],
      ['Tag nach dem Schalttag', [2024, 3, 1], [1, 113, 3, 1]],
      ['Jahreswechsel: letzter Tag 112', [2023, 12, 31], [1, 112, 12, 31]],
      ['Jahreswechsel: erster Tag 113', [2024, 1, 1], [1, 113, 1, 1]],
      ['Epochen-Wechsel: letzter Tag vor der Epoche', [1911, 12, 31], [0, 1, 12, 31]],
      ['Epochen-Wechsel: erster Tag der Epoche', [1912, 1, 1], [1, 1, 1, 1]],
      ['ein Jahr vor der Epoche', [1911, 1, 1], [0, 1, 1, 1]],
      ['zwei Jahre vor der Epoche', [1910, 1, 1], [0, 2, 1, 1]],
    ],
  },
};

function quellenStand(art, lies, gregorianisch) {
  if (art === 'schnittstelle') {
    const s = lies(utc(...gregorianisch));
    return [s.epoche, s.jahr, s.monat, s.tag];
  }
  return null;
}

describe('Grenzfälle je Vorlage (4T-001998)', () => {
  for (const [id, { quelle, kalender, faelle }] of Object.entries(GRENZFAELLE)) {
    for (const [name, gregorianisch, erwartet] of faelle) {
      it(`AK4: ${id} — ${name}: ${gregorianisch.join('-')} → ${erwartet.join('/')}`, () => {
        const { block, kalender: kal } = blockMit(id);
        const s = vorlagenStand(block, kal, gregorianisch);
        expect([s.epoche, s.jahr, s.monat, s.tag]).toEqual(erwartet);
        // Die Erwartung gegen ihre Quelle.
        if (quelle === 'schnittstelle') {
          expect(quellenStand(quelle, schnittstelle(kalender), gregorianisch)).toEqual(erwartet);
        } else if (quelle === 'formel') {
          const [epoche, jahr, monat, tag] = erwartet;
          const astronomisch = epoche === 1 ? jahr : 1 - jahr;
          expect(jdnJulianisch(astronomisch, monat, tag)).toBe(jdnGregorianisch(...gregorianisch));
        } else {
          const [epoche, jahr, monat, tag] = erwartet;
          const buddhistisch = gregorianisch[0] + 543;
          expect(epoche === 1 ? jahr : 1 - jahr).toBe(buddhistisch);
          expect([monat, tag]).toEqual(gregorianisch.slice(1));
        }
      });
    }
  }
});

describe('Sehr fernes Jahr: Rundreise Vorlage → gregorianisch → Vorlage (4T-001998)', () => {
  for (const id of ['julian', 'indian', 'buddhist', 'ethiopic', 'coptic', 'minguo']) {
    it(`AK4: ${id} — interne Jahre ±1 000 000 kommen unverändert zurück`, () => {
      const { block, kalender } = blockMit(id);
      for (const tupel of [
        [1000000, 2, 3, 12, 30, 15],
        [-1000000, 2, 3, 12, 30, 15],
        [1000000, 1, 1, 0, 0, 0],
      ]) {
        // Das ferne Jahr liegt in der passenden Epoche.
        expect(epochOf(kalender, tupel).index).toBe(tupel[0] > 0 ? 1 : 0);
        const hin = convertInBlock(block, id, tupel, 'gregorian');
        expect(hin.ok).toBe(true);
        expect(convertInBlock(block, 'gregorian', hin.tuple, id)).toEqual({
          ok: true,
          tuple: tupel,
        });
      }
    });
  }
});
