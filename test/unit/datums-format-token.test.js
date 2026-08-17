// 4T-1057 (Epic 3E-0210): Tests der Datums-Format-Token mit Namen und ohne
// führende Null samt Literal-Schutz (formatDateMs) und der Sprach-Zufuhr
// über den Vorlagen-Kontext (fillTemplate).
import { describe, it, expect } from 'vitest';
import { formatDateMs } from '../../src/shared/query/query-format.js';
import { analyzeTemplate, fillTemplate } from '../../src/shared/template-engine.js';

// Mittwoch, 12. August 2026, 09:05:07 lokale Zeit.
const MS = new Date(2026, 7, 12, 9, 5, 7).getTime();
// Donnerstag, 5. März 2026 — einstelliger Tag und Monat.
const MS_KURZ = new Date(2026, 2, 5).getTime();

describe('formatDateMs: bestehende Token unverändert (Regression)', () => {
  it('Zahlen-Token liefern die bekannten Formen', () => {
    expect(formatDateMs(MS, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-08-12 09:05:07');
    expect(formatDateMs(MS, 'kkkk-KWww')).toBe('2026-KW33');
    expect(formatDateMs(MS, 'yyyy-Qq')).toBe('2026-Q3');
  });
});

describe('formatDateMs: Namens-Token in den fünf Oberflächen-Sprachen (AK4)', () => {
  const faelle = [
    ['de', 'August', 'Mittwoch'],
    ['en', 'August', 'Wednesday'],
    ['fr', 'août', 'mercredi'],
    ['es', 'agosto', 'miércoles'],
    ['it', 'agosto', 'mercoledì'],
  ];
  for (const [sprache, monat, wochentag] of faelle) {
    it(`liefert Monats- und Wochentagsnamen für ${sprache}`, () => {
      expect(formatDateMs(MS, 'MMMM', sprache)).toBe(monat);
      expect(formatDateMs(MS, 'EEEE', sprache)).toBe(wochentag);
    });
  }

  it('Kurzformen sind nicht leer und kürzer als die Langformen', () => {
    const kurzMonat = formatDateMs(MS, 'MMM', 'de');
    const kurzTag = formatDateMs(MS, 'EEE', 'de');
    expect(kurzMonat.length).toBeGreaterThan(0);
    expect(kurzMonat.length).toBeLessThanOrEqual(formatDateMs(MS, 'MMMM', 'de').length);
    expect(kurzTag.length).toBeGreaterThan(0);
    expect(kurzTag.length).toBeLessThanOrEqual(formatDateMs(MS, 'EEEE', 'de').length);
  });

  it('fällt bei ungültigem Sprach-Tag auf die Laufzeit-Locale zurück statt zu werfen', () => {
    expect(formatDateMs(MS, 'MMMM', '00').length).toBeGreaterThan(0);
  });
});

describe('formatDateMs: Formen ohne führende Null', () => {
  it('d und M liefern einstellige Werte ohne Null', () => {
    expect(formatDateMs(MS_KURZ, 'd.M.yyyy')).toBe('5.3.2026');
    expect(formatDateMs(MS, 'd.M.yyyy')).toBe('12.8.2026');
  });
});

describe('formatDateMs: Literal-Schutz und Erkennungs-Reihenfolge (AK2/AK3)', () => {
  it('Klammer-Text bleibt wörtlich, auch mit Token-Buchstaben', () => {
    expect(formatDateMs(MS, 'EEEE[, der] d. MMMM yyyy', 'de')).toBe(
      'Mittwoch, der 12. August 2026',
    );
    expect(formatDateMs(MS, '[dd.MM.yyyy]')).toBe('dd.MM.yyyy');
    expect(formatDateMs(MS, '[Das Jahr] yyyy', 'de')).toBe('Das Jahr 2026');
  });

  it('ohne Klammern bleiben bestehende Formate unverändert', () => {
    expect(formatDateMs(MS, 'dd.MM.yyyy')).toBe('12.08.2026');
  });

  it('ein Monatsname zerfällt nie in Monatszahlen', () => {
    expect(formatDateMs(MS, 'MMMM', 'de')).toBe('August');
    expect(formatDateMs(MS, 'MMMMM', 'de')).toBe('August8');
  });

  it('ein unpaariges [ bleibt Literal, der Rest wird ersetzt', () => {
    expect(formatDateMs(MS, '[yyyy')).toBe('[2026');
  });
});

describe('fillTemplate: Sprach-Zufuhr über den Vorlagen-Kontext', () => {
  it('reicht die Sprache an die Datums-Platzhalter durch', () => {
    const analysis = analyzeTemplate('{{date::EEEE[, der] d. MMMM yyyy}}');
    expect(analysis.ok).toBe(true);
    const filled = fillTemplate(analysis, { nowMs: MS, locale: 'fr' });
    expect(filled.ok).toBe(true);
    expect(filled.text).toBe('mercredi, der 12. août 2026');
  });

  it('ohne locale bleibt die Laufzeit-Locale wirksam', () => {
    const analysis = analyzeTemplate('{{date::MMMM yyyy}}');
    const filled = fillTemplate(analysis, { nowMs: MS });
    expect(filled.ok).toBe(true);
    expect(filled.text.endsWith('2026')).toBe(true);
    expect(filled.text.length).toBeGreaterThan('2026'.length + 1);
  });
});
