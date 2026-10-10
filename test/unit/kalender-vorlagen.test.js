// 4T-001997 (Epic 3E-000307): Sammlung der mitgelieferten Kalender-Vorlagen —
// Menü-Liste und Reihenfolge, Zeit-Ebenen und gemeinsame Tages-Achse jeder
// Vorlage der Sammlung, der Anker-Helfer an einer julianischen Prüf-Definition
// und die unveränderte Rechnung der gregorianischen Vorlage. Das Aufklapp-Menü
// selbst prüft test/unit/renderer/kalender-vorlagen-menue.test.js.
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import fr from '../../src/i18n/fr.json';
import es from '../../src/i18n/es.json';
import it_ from '../../src/i18n/it.json';
import { convertInBlock } from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../src/shared/calendar/calendar-template.js';
import {
  CALENDAR_TEMPLATES,
  findCalendarTemplate,
  templateBlockAnchor,
  templateTimeLevels,
} from '../../src/shared/calendar/calendar-templates.js';

// Übersetzungs-Funktion über den deutschen Katalog; ein fehlender Schlüssel
// fällt als Fehler auf, statt still den Schlüssel als Text zu liefern.
const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus der gregorianischen Vorlage (Vorgabe-Anker) und einer Probe.
function blockMitGregorianisch(probe) {
  const config = normalizeCalendarConfig({
    blocks: [{ id: 'welt', calendars: [createGregorianTemplate({ id: 'bezug' }), probe] }],
  });
  return config.blocks[0];
}

// Julianischer Kalender als Prüf-Definition: Längen-Tabelle wie gregorianisch,
// Schaltregel allein «alle 4 Jahre». Stichtag-Paar: julianisch 1582-10-05 ist
// der Tag der gregorianischen Einführung, 1582-10-15.
function julianischeProbe() {
  const def = createGregorianTemplate({ id: 'julianisch', name: 'Julianisch' });
  const jahr = def.levels.find((lv) => lv.id === 'year');
  jahr.rel = { ...jahr.rel, rules: [{ cycle: 4 }] };
  def.cycles = [];
  def.blockAnchor = templateBlockAnchor(def, {
    own: [1582, 10, 5],
    gregorian: [1582, 10, 15],
  });
  return def;
}

describe('Menü-Liste der Vorlagen (4T-001997)', () => {
  it('AK1: nur gelieferte Vorlagen, aufsteigend nach ihrem Platz, gregorianisch zuoberst', () => {
    // 4T-001998 (Epic 3E-000307): die sechs Vorlagen im heutigen Modell;
    // 4T-002000: die japanische an Platz 12; 4T-002002: die tabellarische
    // islamische an Platz 3.
    expect(CALENDAR_TEMPLATES.map((entry) => entry.id)).toEqual([
      'gregorian',
      'julian',
      'islamic-tabular',
      'indian',
      'buddhist',
      'ethiopic',
      'coptic',
      'japanese',
      'minguo',
    ]);
    expect(CALENDAR_TEMPLATES.map((entry) => entry.order)).toEqual([1, 2, 3, 8, 9, 10, 11, 12, 13]);
    const plaetze = CALENDAR_TEMPLATES.map((entry) => entry.order);
    expect(plaetze).toEqual([...plaetze].sort((a, b) => a - b));
    expect(CALENDAR_TEMPLATES[0].order).toBe(1);
  });

  it('jeder Eintrag trägt Kennung, Platz, Namens-Schlüssel und Fabrik; die Suche findet ihn', () => {
    for (const entry of CALENDAR_TEMPLATES) {
      expect(typeof entry.id).toBe('string');
      expect(Number.isInteger(entry.order)).toBe(true);
      expect(typeof tDe(entry.nameKey)).toBe('string');
      expect(typeof entry.create).toBe('function');
      expect(findCalendarTemplate(entry.id)).toBe(entry);
    }
    expect(findCalendarTemplate('gibt-es-nicht')).toBeNull();
  });

  it('der Name der angelegten Zeitrechnung ist der Menü-Name', () => {
    for (const entry of CALENDAR_TEMPLATES) {
      expect(entry.create(tDe).name).toBe(tDe(entry.nameKey));
    }
  });
});

describe('Zeit-Ebenen und Tages-Achse jeder Vorlage (4T-001997)', () => {
  // Generisch über die Sammlung: Eine spätere Vorlage wird ohne Änderung
  // dieses Falls mitgeprüft, sobald ihr Eintrag das Stichtag-Paar trägt.
  it('AK4: Sekunde, Minute, Stunde wie gregorianisch und ein Stichtag auf derselben Tages-Achse', () => {
    for (const entry of CALENDAR_TEMPLATES) {
      const def = entry.create(tDe);
      const zeit = def.levels.slice(0, 3);
      expect(zeit.map((lv) => lv.id)).toEqual(['second', 'minute', 'hour']);
      expect(zeit.map((lv) => (lv.rel ? lv.rel.count : null))).toEqual([null, 60, 60]);
      expect(zeit.map((lv) => lv.start)).toEqual([0, 0, 0]);
      expect(def.levels[3].rel).toEqual({ type: 'factor', count: 24 });

      expect(entry.referenceDay).toBeDefined();
      const { own, gregorian } = entry.referenceDay;
      const block = blockMitGregorianisch({ ...def, id: 'probe' });
      expect(block.calendars.map((c) => c.id)).toEqual(['bezug', 'probe']);
      const hin = convertInBlock(block, 'probe', own.concat([0, 0, 0]), 'bezug');
      expect(hin).toEqual({ ok: true, tuple: gregorian.concat([0, 0, 0]) });
      const zurueck = convertInBlock(block, 'bezug', gregorian.concat([12, 30, 0]), 'probe');
      expect(zurueck).toEqual({ ok: true, tuple: own.concat([12, 30, 0]) });
    }
  });

  it('der Baustein der Zeit-Ebenen trägt Einzahl, Mehrzahl und den Bereich «Zeit»', () => {
    const zeit = templateTimeLevels(tDe);
    expect(zeit.map((lv) => [lv.id, lv.name, lv.namePlural, lv.section])).toEqual([
      ['second', 'Sekunde', 'Sekunden', 'Zeit'],
      ['minute', 'Minute', 'Minuten', 'Zeit'],
      ['hour', 'Stunde', 'Stunden', 'Zeit'],
    ]);
    // Gleich gebaut wie die Zeit-Ebenen der gregorianischen Vorlage.
    expect(zeit).toEqual(createGregorianTemplate().levels.slice(0, 3));
  });
});

describe('Anker-Helfer an einer julianischen Prüf-Definition (4T-001997)', () => {
  it('AK4: der Anker aus dem Stichtag-Paar legt die Zeitrechnung auf die gregorianische Tages-Achse', () => {
    const block = blockMitGregorianisch(julianischeProbe());
    expect(block.calendars.map((c) => c.id)).toEqual(['bezug', 'julianisch']);
    const nachGregorianisch = (tuple) => convertInBlock(block, 'julianisch', tuple, 'bezug');
    expect(nachGregorianisch([1582, 10, 5, 0, 0, 0]).tuple).toEqual([1582, 10, 15, 0, 0, 0]);
    expect(nachGregorianisch([1582, 10, 4, 0, 0, 0]).tuple).toEqual([1582, 10, 14, 0, 0, 0]);
    // 1900 ist julianisch ein Schaltjahr, gregorianisch nicht.
    expect(nachGregorianisch([1900, 2, 29, 0, 0, 0]).tuple).toEqual([1900, 3, 13, 0, 0, 0]);
    expect(convertInBlock(block, 'bezug', [1900, 3, 13, 18, 0, 0], 'julianisch').tuple).toEqual([
      1900, 2, 29, 18, 0, 0,
    ]);
  });

  it('ungültige Eingaben ergeben keinen Anker', () => {
    const def = createGregorianTemplate();
    expect(templateBlockAnchor(def, null)).toBeNull();
    expect(templateBlockAnchor(def, { own: [2000, 1], gregorian: [2000, 1, 1] })).toBeNull();
    expect(templateBlockAnchor(def, { own: [2001, 2, 29], gregorian: [2000, 1, 1] })).toBeNull();
    expect(
      templateBlockAnchor(
        { ...def, blockScale: { num: 2, den: 1 } },
        { own: [2000, 1, 1], gregorian: [2000, 1, 1] },
      ),
    ).toBeNull();
    // Gegenprobe: derselbe Tag in beiden ergibt den Vorgabe-Anker.
    expect(templateBlockAnchor(def, { own: [2000, 1, 1], gregorian: [2000, 1, 1] })).toEqual([
      0, 1, 1, 0, 0, 0,
    ]);
  });
});

describe('Gregorianische Vorlage rechnet unverändert (4T-001997)', () => {
  it('AK5: über die Sammlung erzeugt ist sie nach der Normalisierung gleich der Fabrik ohne Optionen', () => {
    const ausSammlung = findCalendarTemplate('gregorian').create(tDe);
    // Kein ausdrücklicher Anker: Die Vorlage behält den Vorgabe-Anker.
    expect(ausSammlung.blockAnchor).toBeUndefined();
    const normiere = (def) =>
      normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [def] }] }).blocks[0]
        .calendars[0];
    expect(normiere(ausSammlung)).toStrictEqual(normiere(createGregorianTemplate()));
  });
});

// 4T-001998 (Epic 3E-000307): Namen jeder Vorlage in allen fünf Sprachen. Die
// Kataloge sind das Erzeugnis von scripts/build-i18n.js (Vorlauf der Suite).
describe('Namen der Vorlagen in fünf Sprachen (4T-001998)', () => {
  const KATALOGE = { de, en, fr, es, it: it_ };
  it('AK6: jede Vorlage trägt vollständige Namen und bleibt nach der Normalisierung gültig', () => {
    for (const [code, katalog] of Object.entries(KATALOGE)) {
      const t = (key) => {
        if (!(key in katalog)) throw new Error(`Schlüssel fehlt im Katalog ${code}: ${key}`);
        return katalog[key];
      };
      for (const entry of CALENDAR_TEMPLATES) {
        const ort = `${code}/${entry.id}`;
        const def = entry.create(t);
        expect(def.name, ort).toBe(t(entry.nameKey));
        const monat = def.levels.find((lv) => lv.id === 'month');
        const monate = monat.rel.table.length;
        expect(monat.names, ort).toHaveLength(monate);
        expect(
          monat.names.every((n) => n.trim() !== ''),
          ort,
        ).toBe(true);
        for (const lv of def.levels) {
          expect(lv.name.trim(), `${ort}/${lv.id}`).not.toBe('');
          expect((lv.namePlural || '').trim(), `${ort}/${lv.id}`).not.toBe('');
        }
        const woche = def.cycles.find((c) => c.id === 'week');
        expect(woche.names, ort).toHaveLength(7);
        expect(woche.name.trim() && woche.namePlural.trim(), ort).toBeTruthy();
        for (const g of def.groups) expect(g.name.trim() && g.namePlural.trim(), ort).toBeTruthy();
        // 4T-002000: die offene Vergangenheit und mindestens eine Epoche danach
        // (die japanische Vorlage trägt fünf Ären).
        expect(def.epochs.length, ort).toBeGreaterThanOrEqual(2);
        expect(def.epochs[0].start, ort).toBeNull();
        for (const e of def.epochs) expect(e.name.trim() && e.abbr.trim(), ort).toBeTruthy();
        const norm = normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [def] }] });
        expect(norm, ort).not.toBeNull();
        const kal = norm.blocks[0].calendars[0];
        expect(kal.id, ort).toBe(entry.id);
        expect(
          kal.cycles.map((c) => c.id),
          ort,
        ).toEqual(def.cycles.map((c) => c.id));
        expect(
          kal.groups.map((g) => g.id),
          ort,
        ).toEqual(def.groups.map((g) => g.id));
        expect(
          kal.epochs.map((e) => e.name),
          ort,
        ).toEqual(def.epochs.map((e) => e.name));
        expect(kal.levels.find((lv) => lv.id === 'month').names, ort).toEqual(monat.names);
      }
    }
  });

  // 4T-002002 (Epic 3E-000307): Der Name der islamischen Vorlage sagt in jeder
  // Sprache, dass sie die tabellarische Lesart ist (Entscheidung V1).
  it('AK4 (4T-002002): der Name der islamischen Vorlage sagt in fünf Sprachen «tabellarisch»', () => {
    const entry = findCalendarTemplate('islamic-tabular');
    expect(entry.order).toBe(3);
    const namen = Object.fromEntries(
      Object.entries(KATALOGE).map(([code, katalog]) => [code, katalog[entry.nameKey]]),
    );
    expect(namen).toEqual({
      de: 'Hidschri-Kalender (tabellarisch)',
      en: 'Hijri calendar (tabular)',
      fr: 'Calendrier hégirien (tabulaire)',
      es: 'Calendario hijri tabular',
      it: 'Calendario Hijri (tabulare)',
    });
  });
});
