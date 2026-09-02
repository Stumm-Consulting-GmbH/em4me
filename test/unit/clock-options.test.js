// 4T-000372 (Epic 3E-000069): Rechen-Kern der Uhr-Erweiterung.
//
// Prueft die prozessneutralen Funktionen aus src/shared/clock/clock-options.js:
// Normalisierung defekter Store-Staende, Timer-Takt (Energie-Ruecksicht),
// Zeiger-Winkel, digitale Zeit in beiden Stunden-Formaten, ISO-Kalender-
// woche und die vier Datums-Formate. Bewusst ohne jsdom — das Modul haengt
// weder am DOM noch an Electron.
import { describe, expect, it } from 'vitest';
import {
  ANALOG_SIZES,
  CLOCK_MODES,
  CLOCK_MODE_KEYS,
  CLOCK_SCALE,
  DEFAULT_CLOCK_OPTIONS,
  analogSizePx,
  clockScale,
  clockModeKey,
  formatClockDate,
  formatClockTime,
  handAngles,
  isoWeekNumber,
  needsSecondTick,
  normalizeClockMode,
  normalizeClockOptions,
  MIN_CALENDAR_YEAR,
  MAX_CALENDAR_YEAR,
  clampCalendarYear,
  currentMonthView,
  normalizeMonthView,
  shiftMonthView,
} from '../../src/shared/clock/clock-options.js';

// 4T-000636 (Epic 3E-000069): Modus-Modell der Umschaltleiste.
describe('normalizeClockMode und clockModeKey (4T-000636)', () => {
  // 4T-000752 (Epic 3E-000146): Der Kalender haengt hinten an, die Reihenfolge
  // der vier bestehenden Tasten bleibt unveraendert.
  it('kennt genau die fuenf Modi in der Leisten-Reihenfolge', () => {
    expect(CLOCK_MODES).toEqual(['clock', 'alarm', 'timer', 'stopwatch', 'calendar']);
  });

  it('uebernimmt gueltige Modi unveraendert', () => {
    for (const mode of CLOCK_MODES) expect(normalizeClockMode(mode)).toBe(mode);
  });

  it('faellt bei fehlenden und defekten Werten auf die Uhr zurueck', () => {
    for (const raw of [null, undefined, '', 'countdown', 42, {}, ['timer']]) {
      expect(normalizeClockMode(raw)).toBe('clock');
    }
  });

  it('liefert je Spalte einen eigenen Store-Schluessel', () => {
    expect(clockModeKey(0)).toBe('clockPanel.modeColumn0');
    expect(clockModeKey(1)).toBe('clockPanel.modeColumn1');
    expect(CLOCK_MODE_KEYS).toHaveLength(2);
    // Ausserhalb des Bereichs kein erfundener Schluessel.
    expect(clockModeKey(2)).toBeNull();
    expect(clockModeKey(-1)).toBeNull();
  });
});

describe('normalizeClockOptions (4T-000372)', () => {
  it('liefert die Defaults fuer fehlende und defekte Staende', () => {
    expect(normalizeClockOptions(null)).toEqual(DEFAULT_CLOCK_OPTIONS);
    expect(normalizeClockOptions(undefined)).toEqual(DEFAULT_CLOCK_OPTIONS);
    expect(normalizeClockOptions('kaputt')).toEqual(DEFAULT_CLOCK_OPTIONS);
    expect(normalizeClockOptions(42)).toEqual(DEFAULT_CLOCK_OPTIONS);
  });

  it('uebernimmt gueltige Werte unveraendert', () => {
    const raw = {
      showAnalog: false,
      showDigital: true,
      showDate: false,
      showWeek: true,
      analogSize: 'large',
      dial: 'ticks',
      secondHand: false,
      secondMotion: 'sweep',
      hourFormat: 12,
      showSeconds: false,
      dateFormat: 'iso',
      // 4T-000637: Schlummer-Dauer des Weckers gehoert seither zum Optionen-
      // Objekt (Konfiguration, nicht Bedien-Zustand).
      snoozeMinutes: 12,
      // 4T-000752: Kalenderwochen-Spalte des Monatskalenders.
      showCalendarWeek: false,
    };
    expect(normalizeClockOptions(raw)).toEqual(raw);
  });

  it('faengt unbekannte Auswahl-Werte auf den Default zurueck', () => {
    const result = normalizeClockOptions({
      analogSize: 'riesig',
      dial: 'roemisch',
      secondMotion: 'huepfend',
      hourFormat: 13,
      dateFormat: 'egal',
    });
    expect(result.analogSize).toBe('medium');
    expect(result.dial).toBe('quarters');
    expect(result.secondMotion).toBe('step');
    expect(result.hourFormat).toBe(24);
    expect(result.dateFormat).toBe('long');
  });

  it('akzeptiert das Stundenformat auch als String (hand-editierter Store)', () => {
    expect(normalizeClockOptions({ hourFormat: '12' }).hourFormat).toBe(12);
    expect(normalizeClockOptions({ hourFormat: '24' }).hourFormat).toBe(24);
  });

  it('ignoriert Nicht-Booleans und fremde Felder', () => {
    const result = normalizeClockOptions({ showAnalog: 'ja', fremd: 1 });
    expect(result.showAnalog).toBe(true);
    expect(result).not.toHaveProperty('fremd');
  });
});

describe('needsSecondTick — Timer-Disziplin (4T-000372)', () => {
  it('Sekunden-Takt bei sichtbarem Sekundenzeiger', () => {
    expect(needsSecondTick({ showAnalog: true, secondHand: true, showDigital: false })).toBe(true);
  });

  it('Sekunden-Takt bei digitaler Sekunden-Anzeige', () => {
    expect(needsSecondTick({ showAnalog: false, showDigital: true, showSeconds: true })).toBe(true);
  });

  it('Minuten-Takt, wenn keine Sekunde sichtbar ist', () => {
    expect(
      needsSecondTick({
        showAnalog: true,
        secondHand: false,
        showDigital: true,
        showSeconds: false,
      }),
    ).toBe(false);
  });

  it('ein ausgeblendeter Bestandteil zaehlt nicht mit', () => {
    // Sekundenzeiger an, aber die analoge Uhr ist aus: kein Sekunden-Takt.
    expect(
      needsSecondTick({
        showAnalog: false,
        secondHand: true,
        showDigital: true,
        showSeconds: false,
      }),
    ).toBe(false);
  });
});

describe('analogSizePx (4T-000372)', () => {
  it('liefert je Stufe eine feste Kantenlaenge, aufsteigend', () => {
    const s = analogSizePx({ analogSize: 'small' });
    const m = analogSizePx({ analogSize: 'medium' });
    const l = analogSizePx({ analogSize: 'large' });
    expect(s).toBeLessThan(m);
    expect(m).toBeLessThan(l);
    expect(analogSizePx(null)).toBe(m);
  });
});

// 4T-000679 (Epic 3E-000139): Schrift-Faktor der digitalen Anzeige. Die
// Basiswerte in Pixeln stehen in styles.css, hier steht nur der Faktor.
describe('clockScale (4T-000679)', () => {
  it('die kleine Stufe traegt unveraendert das bisherige Schriftbild', () => {
    // Faktor 1 heisst 17 / 12 / 11,5 px wie vor dem Epic. Haelt die
    // PO-Festlegung vom 2026-07-22 fest: nicht die Default-Stufe 'medium'
    // erbt das alte Bild, sondern 'small'.
    expect(clockScale({ analogSize: 'small' })).toBe(1);
  });

  it('mittel und gross wachsen darueber, streng aufsteigend', () => {
    const s = clockScale({ analogSize: 'small' });
    const m = clockScale({ analogSize: 'medium' });
    const l = clockScale({ analogSize: 'large' });
    expect(m).toBeGreaterThan(s);
    expect(l).toBeGreaterThan(m);
  });

  it('faellt bei fehlendem und defektem Stand auf den Default zurueck', () => {
    const m = clockScale({ analogSize: 'medium' });
    expect(clockScale(null)).toBe(m);
    expect(clockScale({ analogSize: 'riesig' })).toBe(m);
  });

  it('deckt genau die Stufen des Optionen-Modells ab', () => {
    // Waechter gegen eine spaeter ergaenzte Stufe ohne Faktor: Sie wuerde
    // sonst still undefined liefern und die CSS-Variable unbrauchbar machen.
    expect(Object.keys(CLOCK_SCALE).sort()).toEqual([...ANALOG_SIZES].sort());
  });
});

describe('handAngles (4T-000372)', () => {
  it('12:00:00 stellt alle Zeiger auf 0 Grad', () => {
    const a = handAngles(new Date(2026, 6, 19, 12, 0, 0), { secondMotion: 'step' });
    expect(a.hour).toBe(0);
    expect(a.minute).toBe(0);
    expect(a.second).toBe(0);
  });

  it('03:15:30 — Minutenzeiger auf 93 Grad, Sekundenzeiger auf 180 Grad', () => {
    const a = handAngles(new Date(2026, 6, 19, 3, 15, 30), { secondMotion: 'step' });
    // 15 min * 6 Grad + 30 s * 0.1 Grad Mitlauf.
    expect(a.minute).toBeCloseTo(93, 5);
    expect(a.second).toBeCloseTo(180, 5);
    // 3 h * 30 Grad + 15 min * 0.5 Grad + 30 s * (0.5/60) Grad.
    expect(a.hour).toBeCloseTo(97.75, 5);
  });

  it('Stundenzeiger laeuft gleitend mit (kein Sprung auf der vollen Stunde)', () => {
    const halb = handAngles(new Date(2026, 6, 19, 9, 30, 0), {});
    expect(halb.hour).toBeCloseTo(285, 5); // 9*30 + 30*0.5
  });

  it('21 Uhr entspricht 9 Uhr auf dem Zifferblatt', () => {
    const abends = handAngles(new Date(2026, 6, 19, 21, 0, 0), {});
    const morgens = handAngles(new Date(2026, 6, 19, 9, 0, 0), {});
    expect(abends.hour).toBe(morgens.hour);
  });

  it('gleitende Bewegung bezieht die Millisekunden ein, springende nicht', () => {
    const d = new Date(2026, 6, 19, 12, 0, 30, 500);
    expect(handAngles(d, { secondMotion: 'step' }).second).toBeCloseTo(180, 5);
    expect(handAngles(d, { secondMotion: 'sweep' }).second).toBeCloseTo(183, 5);
  });
});

describe('formatClockTime (4T-000372)', () => {
  const abends = new Date(2026, 6, 19, 18, 5, 9);
  const mitternacht = new Date(2026, 6, 19, 0, 5, 9);
  const mittag = new Date(2026, 6, 19, 12, 5, 9);

  it('24-Stunden-Format mit und ohne Sekunden', () => {
    expect(formatClockTime(abends, { hourFormat: 24, showSeconds: true })).toBe('18:05:09');
    expect(formatClockTime(abends, { hourFormat: 24, showSeconds: false })).toBe('18:05');
  });

  it('12-Stunden-Format haengt das lokalisierte Kuerzel an', () => {
    expect(
      formatClockTime(abends, { hourFormat: 12, showSeconds: true }, { am: 'AM', pm: 'PM' }),
    ).toBe('6:05:09 PM');
    expect(
      formatClockTime(abends, { hourFormat: 12, showSeconds: false }, { am: 'vm', pm: 'nm' }),
    ).toBe('6:05 nm');
  });

  it('0 Uhr und 12 Uhr zeigen beide die 12', () => {
    expect(formatClockTime(mitternacht, { hourFormat: 12, showSeconds: false })).toBe('12:05 AM');
    expect(formatClockTime(mittag, { hourFormat: 12, showSeconds: false })).toBe('12:05 PM');
  });
});

describe('isoWeekNumber (4T-000372)', () => {
  it('rechnet bekannte ISO-Wochen korrekt', () => {
    // 2026-01-01 ist ein Donnerstag und gehoert damit in KW 1.
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2026, 6, 19))).toBe(29);
    // 2024-12-30 (Montag) gehoert bereits in die KW 1 des Folgejahres.
    expect(isoWeekNumber(new Date(2024, 11, 30))).toBe(1);
    // 2021-01-01 (Freitag) gehoert noch in die KW 53 des Vorjahres.
    expect(isoWeekNumber(new Date(2021, 0, 1))).toBe(53);
  });
});

describe('formatClockDate (4T-000372)', () => {
  const d = new Date(2026, 6, 19);

  it('ISO bleibt sprachneutral', () => {
    expect(formatClockDate(d, { dateFormat: 'iso' }, 'de')).toBe('2026-07-19');
    expect(formatClockDate(d, { dateFormat: 'iso' }, 'en')).toBe('2026-07-19');
  });

  it('lange Form nennt Wochentag und ausgeschriebenen Monat', () => {
    const de = formatClockDate(d, { dateFormat: 'long' }, 'de');
    expect(de).toContain('Sonntag');
    expect(de).toContain('Juli');
    expect(de).toContain('2026');
  });

  it('kurze Form kommt ohne Wochentag aus', () => {
    const de = formatClockDate(d, { dateFormat: 'short' }, 'de');
    expect(de).not.toContain('Sonntag');
    expect(de).toContain('2026');
  });

  it('die Sprache steuert die Ausgabe', () => {
    expect(formatClockDate(d, { dateFormat: 'long' }, 'en')).toContain('July');
    expect(formatClockDate(d, { dateFormat: 'long' }, 'fr')).toContain('juillet');
  });

  it('ein unbekanntes Sprach-Tag faellt auf die Standard-Locale zurueck', () => {
    expect(() => formatClockDate(d, { dateFormat: 'long' }, 'nicht-existent!!')).not.toThrow();
  });
});

// 4T-000752 (Epic 3E-000146): Ansichts-Zustand und Navigation des Monatskalenders.
// Rein rechnend, deshalb hier und nicht in einer E2E-Spec.
describe('Monatskalender: Sicht und Navigation (4T-000752)', () => {
  it('normalisiert eine fehlende oder defekte Sicht auf gueltige Werte', () => {
    const jetzt = new Date(2026, 6, 27);
    expect(normalizeMonthView(null, jetzt)).toEqual(currentMonthView(jetzt));
    expect(normalizeMonthView({ year: 'x', monthIndex: 99 }, jetzt)).toEqual({
      year: new Date().getFullYear(),
      monthIndex: 6,
    });
    expect(normalizeMonthView({ year: 1960, monthIndex: 8 }, jetzt)).toEqual({
      year: 1960,
      monthIndex: 8,
    });
  });

  it('blaettert ueber die Jahres-Grenze in beide Richtungen', () => {
    expect(shiftMonthView({ year: 2026, monthIndex: 11 }, { months: 1 })).toEqual({
      year: 2027,
      monthIndex: 0,
    });
    expect(shiftMonthView({ year: 2026, monthIndex: 0 }, { months: -1 })).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });

  it('blaettert Jahre ohne den Monat zu verschieben', () => {
    expect(shiftMonthView({ year: 2026, monthIndex: 6 }, { years: -1 })).toEqual({
      year: 2025,
      monthIndex: 6,
    });
    expect(shiftMonthView({ year: 2026, monthIndex: 6 }, { years: 1 })).toEqual({
      year: 2027,
      monthIndex: 6,
    });
  });

  it('mehrere Monate auf einmal tragen korrekt ins Jahr weiter', () => {
    expect(shiftMonthView({ year: 2026, monthIndex: 6 }, { months: 30 })).toEqual({
      year: 2029,
      monthIndex: 0,
    });
    expect(shiftMonthView({ year: 2026, monthIndex: 6 }, { months: -30 })).toEqual({
      year: 2024,
      monthIndex: 0,
    });
  });

  // Die Untergrenze liegt bei 100 und nicht bei 1, weil `new Date(y, m, d)`
  // zweistellige Jahre auf 1900+y abbildet; unterhalb waere die Anzeige
  // stillschweigend falsch statt bloss begrenzt.
  it('klemmt an den Jahres-Grenzen statt in ungueltige Jahre zu laufen', () => {
    expect(clampCalendarYear(5)).toBe(MIN_CALENDAR_YEAR);
    expect(clampCalendarYear(100000)).toBe(MAX_CALENDAR_YEAR);
    expect(clampCalendarYear('1960')).toBe(1960);
    expect(shiftMonthView({ year: MIN_CALENDAR_YEAR, monthIndex: 0 }, { months: -1 })).toEqual({
      year: MIN_CALENDAR_YEAR,
      monthIndex: 0,
    });
    expect(shiftMonthView({ year: MAX_CALENDAR_YEAR, monthIndex: 11 }, { months: 1 })).toEqual({
      year: MAX_CALENDAR_YEAR,
      monthIndex: 11,
    });
  });

  it('das Beispiel aus der Anforderung ist erreichbar', () => {
    // Ein weit zurueckliegendes Jahr ueber die direkte Eingabe.
    expect(normalizeMonthView({ year: clampCalendarYear(1960), monthIndex: 8 })).toEqual({
      year: 1960,
      monthIndex: 8,
    });
  });
});
