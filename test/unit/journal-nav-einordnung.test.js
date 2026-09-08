// @vitest-environment jsdom
// 4T-001489 (Epic 3E-000276): Die zeitliche Einordnung des Journal-Navigations-
// Blocks — die Zeile unter der Perioden-Beschriftung.
//
// **Was hier geprueft wird und was nicht.** Die Perioden-Rechnung selbst liegt
// in `periodDistance` und ist in `journal-perioden.test.js` samt Mutationsprobe
// abgesichert. Hier steht die Schicht darueber: dass die Zeile IMMER belegt ist,
// dass sie in der Einheit der Periode rechnet, dass der Null-Fall bei den
// bestehenden Schluesseln bleibt und dass die Sprache der Oberflaeche folgt.
//
// **Warum keine festen Wortlaute geprueft werden.** Ein Prueffall, der
// „gestern" oder „vor 3 Wochen" woertlich erwartet, zementiert die ICU-Fassung
// der Umgebung, in der er laeuft — hier Node, waehrend die Anwendung auf
// Electron laeuft. Er waere damit ein Fall mit unausgesprochener Annahme ueber
// sein Umfeld (Fehlerklasse L10) und wuerde bei einem ICU-Sprung rot, ohne dass
// die Anwendung einen Fehler haette. Geprueft wird deshalb gegen
// `Intl.RelativeTimeFormat` DERSELBEN Umgebung: Die Zusicherung lautet, dass
// die Zeile der Standard-Formulierung folgt, nicht wie diese lautet. Den realen
// Wortlaut in der Laufzeit der Anwendung haelt der Ablauf-Prueffall fest.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let sprache = 'de';
const UEBERSETZT = {
  'journalNav.today': 'Heute',
  'journalNav.thisWeek': 'Diese Woche',
  'journalNav.thisMonth': 'Dieser Monat',
  'journalNav.thisQuarter': 'Dieses Quartal',
  'journalNav.thisYear': 'Dieses Jahr',
};

vi.mock('../../src/renderer/i18n.js', () => ({
  getLanguage: () => sprache,
  t: (key) => UEBERSETZT[key] || key,
}));
vi.mock('../../src/renderer/modules/app/api.js', () => ({ api: {} }));
vi.mock('../../src/renderer/modules/calendar/journal-pfad-pruefung.js', () => ({
  pruefeBlockPfad: () => null,
  zeigeBlockFehler: () => {},
}));

const { periodRelationLine } =
  await import('../../src/renderer/modules/calendar/journal-nav-view.js');
const { periodOf, addPeriods } = await import('../../src/shared/journal-core.js');

const GRANULARITAETEN = ['day', 'week', 'month', 'quarter', 'year'];

function erwarteteFormulierung(abstand, granularitaet, locale) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(abstand, granularitaet);
}

beforeEach(() => {
  sprache = 'de';
});

describe('periodRelationLine — die Zeile ist in jeder Periode belegt (4T-001489)', () => {
  it('liefert fuer jede Granularitaet in Vergangenheit, Gegenwart und Zukunft einen Text', () => {
    // AK1: Der Befund war, dass die Zeile ausserhalb der laufenden Periode leer
    // blieb. Keine Kombination darf null oder leer ergeben.
    for (const granularitaet of GRANULARITAETEN) {
      const laufend = periodOf(Date.now(), granularitaet);
      for (const schritte of [-7, -2, -1, 0, 1, 2, 7]) {
        const zeile = periodRelationLine(addPeriods(laufend, schritte));
        expect(zeile, `${granularitaet} / ${schritte}`).toBeTruthy();
        expect(String(zeile).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('behaelt fuer die laufende Periode die bestehende Aussage', () => {
    // AK3: Der Null-Fall bleibt bei den fuenf gewachsenen Schluesseln und
    // wechselt nicht auf die Standard-Formulierung.
    const erwartet = {
      day: 'Heute',
      week: 'Diese Woche',
      month: 'Dieser Monat',
      quarter: 'Dieses Quartal',
      year: 'Dieses Jahr',
    };
    for (const granularitaet of GRANULARITAETEN) {
      expect(periodRelationLine(periodOf(Date.now(), granularitaet))).toBe(erwartet[granularitaet]);
    }
  });

  it('rechnet in der Einheit der Periode, nicht in Tagen', () => {
    // AK2 und Entscheidung E2 des Epics: Ein Wochen-Eintrag sagt „letzte
    // Woche" und nicht „vor sieben Tagen". Gemessen gegen die
    // Standard-Formulierung derselben Einheit.
    for (const granularitaet of GRANULARITAETEN) {
      const laufend = periodOf(Date.now(), granularitaet);
      for (const schritte of [-3, -1, 1, 3]) {
        expect(periodRelationLine(addPeriods(laufend, schritte))).toBe(
          erwarteteFormulierung(schritte, granularitaet, 'de'),
        );
      }
    }
  });

  it('nutzt die Sonderformen des unmittelbaren Nachbarn', () => {
    // AK4, Teil 1: `numeric: 'auto'` liefert „gestern" statt „vor 1 Tag". Der
    // Nachweis laeuft ueber den Vergleich mit der strengen Variante: Beide
    // duerfen sich nicht gleichen, sonst waere die Option wirkungslos.
    const tag = periodOf(Date.now(), 'day');
    const auto = periodRelationLine(addPeriods(tag, -1));
    const streng = new Intl.RelativeTimeFormat('de', { numeric: 'always' }).format(-1, 'day');
    expect(auto).not.toBe(streng);
    expect(auto).toBe(erwarteteFormulierung(-1, 'day', 'de'));
  });

  it('folgt der Oberflaechen-Sprache', () => {
    // AK4, Teil 2: geprueft an zwei Sprachen, wie im Pruef-Block vorgesehen.
    const woche = addPeriods(periodOf(Date.now(), 'week'), -2);
    sprache = 'de';
    const deutsch = periodRelationLine(woche);
    sprache = 'it';
    const italienisch = periodRelationLine(woche);
    expect(deutsch).toBe(erwarteteFormulierung(-2, 'week', 'de'));
    expect(italienisch).toBe(erwarteteFormulierung(-2, 'week', 'it'));
    expect(deutsch).not.toBe(italienisch);
  });

  it('beherrscht die Quartals-Einheit in allen fuenf Oberflaechen-Sprachen', () => {
    // AK5: Der im Task vorgesehene Rueckfall auf eine eigene Schablone haengt
    // an dieser Zusicherung. Faellt sie, muss sie auffallen — hier fuer die
    // Umgebung des Unit-Laufs, im Ablauf-Prueffall fuer die der Anwendung.
    for (const s of ['de', 'en', 'fr', 'es', 'it']) {
      sprache = s;
      const zeile = periodRelationLine(addPeriods(periodOf(Date.now(), 'quarter'), -1));
      expect(zeile, s).toBeTruthy();
      expect(zeile, s).toBe(erwarteteFormulierung(-1, 'quarter', s));
      // Die Formulierung muss die Einheit tatsaechlich benennen und nicht auf
      // eine Zahl ohne Wort zurueckfallen.
      expect(String(zeile).length, s).toBeGreaterThan(3);
    }
  });
});
