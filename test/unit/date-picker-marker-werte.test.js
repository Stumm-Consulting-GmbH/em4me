// B-09 (4T-0937, erhoben im Charter-Durchgang 4T-0899, Pruef-Runde 4): Jeder
// Datums-Wert einer Aufgaben-Zeile ist anklickbar, nicht nur der hinter dem
// Erinnerungs-Marker.
//
// Gemeldeter Ablauf (Product Owner, 2026-08-08): In zwei benachbarten Zeilen
// verhaelt sich derselbe Datums-Wert verschieden — der Wert hinter ⏰ oeffnet
// den Waehler, der hinter 📅 nicht.
//
// Geprueft wird hier die reine Bereichs-Ermittlung, also die Stelle, an der
// die Ausnahme sass. Sie traegt die Zusicherung ueber ALLE Marker-Arten und
// nicht ueber eine Stichprobe (AK6): Die Erwartung leitet sich aus derselben
// Registry ab wie der Code, damit ein neuer Marker diesen Test zwingt.
import { describe, it, expect } from 'vitest';
import {
  DATE_MARKER_READ_VARIANTS,
  DATE_MARKER_SYMBOLS,
  markerValueRangesInLine,
  REMINDER_SYMBOL,
  TASK_DATE_FIELDS,
} from '../../src/shared/tasks/task-markers.js';

const DATUM = '2026-09-01';

function zeileMit(symbol, wert = DATUM) {
  return `- [ ] Aufgabe ${symbol} ${wert}`;
}

function werte(zeile, opts = { withReminder: true }) {
  return markerValueRangesInLine(zeile, opts).map((r) => zeile.slice(r.from, r.to));
}

describe('B-09: Wert-Bereiche aller Datums-Marker', () => {
  it('erfasst jedes kanonische Marker-Symbol, nicht nur die Erinnerung', () => {
    for (const feld of TASK_DATE_FIELDS) {
      const zeile = zeileMit(DATE_MARKER_SYMBOLS[feld]);
      expect(werte(zeile), `Feld ${feld}`).toEqual([DATUM]);
    }
    expect(werte(zeileMit(REMINDER_SYMBOL))).toEqual([DATUM]);
  });

  it('erfasst auch die tolerierten Lese-Varianten', () => {
    for (const feld of TASK_DATE_FIELDS) {
      for (const variante of DATE_MARKER_READ_VARIANTS[feld]) {
        const zeile = zeileMit(variante);
        expect(werte(zeile), `Variante ${feld}/${variante}`).toEqual([DATUM]);
      }
    }
  });

  it('erfasst mehrere Marker derselben Zeile in Lese-Reihenfolge', () => {
    const zeile = `- [ ] Aufgabe ${DATE_MARKER_SYMBOLS.due} 2026-09-01 ${DATE_MARKER_SYMBOLS.scheduled} 2026-09-02 ${REMINDER_SYMBOL} 2026-09-03 08:15`;
    expect(werte(zeile)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03 08:15']);
  });

  it('nimmt die Uhrzeit nur zur Erinnerung, nicht zu den uebrigen Markern', () => {
    const mitZeit = `- [ ] Aufgabe ${DATE_MARKER_SYMBOLS.due} 2026-09-01 10:30`;
    // Der Faelligkeits-Marker traegt ein reines Datum; die 10:30 dahinter
    // gehoert nicht zu ihm und darf den Wert-Bereich nicht verlaengern.
    expect(werte(mitZeit)).toEqual(['2026-09-01']);
    const erinnerung = `- [ ] Aufgabe ${REMINDER_SYMBOL} 2026-09-01 10:30`;
    expect(werte(erinnerung)).toEqual(['2026-09-01 10:30']);
  });

  it('laesst den Erinnerungs-Wert bei abgeschalteter Erweiterung aus', () => {
    const zeile = `- [ ] Aufgabe ${DATE_MARKER_SYMBOLS.due} 2026-09-01 ${REMINDER_SYMBOL} 2026-09-02`;
    expect(werte(zeile, { withReminder: false })).toEqual(['2026-09-01']);
    expect(werte(zeile, { withReminder: true })).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('toleriert den Variation Selector hinter dem Symbol', () => {
    const zeile = `- [ ] Aufgabe ${DATE_MARKER_SYMBOLS.due}️ ${DATUM}`;
    expect(werte(zeile)).toEqual([DATUM]);
  });

  it('findet ohne Marker nichts', () => {
    expect(werte(`- [ ] Aufgabe ohne Marker ${DATUM}`)).toEqual([]);
  });
});
