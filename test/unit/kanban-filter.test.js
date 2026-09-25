// 4T-001907 (Epic 3E-000318): Unit-Tests des Filters der Tafel — welche
// Karten zu einem Suchtext passen, je Spalte gezählt (Story 4S-000983, AK2 und
// AK3 der Story).
//
// Geprüft wird **prozessneutral** — Eingabe ist das Modell aus `leseTafel`,
// Ausgabe sind die treffenden Karten je Spalte. Kein DOM, keine Sprache: Was die
// Tafel daraus macht, steht in `test/unit/renderer/kanban-suche.test.js`.
//
// Die Treffer-Regel ist die der räumlichen Arbeitsfläche (`canvas-filter.js`):
// getrimmter, kleingeschriebener Suchtext als **eine** Teilzeichenkette. Die
// Fälle unten belegen gerade diese Regel, damit ein späteres Auseinanderlaufen
// der beiden Filter-Felder hier rot wird.
import { describe, it, expect } from 'vitest';
import { leseTafel } from '../../src/shared/kanban/kanban-core.js';
import {
  karteTrifft,
  normalisiereTafelSuche,
  tafelFiltern,
} from '../../src/shared/kanban/kanban-filter.js';
import { normalisiereCanvasSuche } from '../../src/shared/canvas/canvas-filter.js';

const TAFEL = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## Offen',
  '',
  '- [ ] Angebot schreiben #kunde',
  '\tMit Preisliste für die Messe',
  '- [ ] Rechnung prüfen',
  '- [ ] Termin vereinbaren @{2026-10-01}',
  '',
  '## In Arbeit',
  '',
  '- [ ] Präsentation #Kunde/Nord',
  '',
  '## Erledigt',
  '',
  '- [x] Messestand gebucht',
  '',
].join('\r\n');

const model = () => leseTafel(TAFEL);
const texte = (ergebnis, m = model()) =>
  m.spalten.map((spalte, nr) =>
    spalte.karten.filter((k) => ergebnis.spalten[nr].kartenZeilen.has(k.zeile)).map((k) => k.text),
  );

describe('normalisiereTafelSuche', () => {
  it('trimmt und schreibt klein — dieselbe Regel wie auf der Arbeitsfläche', () => {
    expect(normalisiereTafelSuche('  Angebot ')).toBe('angebot');
    expect(normalisiereTafelSuche(null)).toBe('');
    expect(normalisiereTafelSuche('   ')).toBe('');
    for (const eingabe of ['  Ä  B ', 'MESSE', '#Kunde', '']) {
      expect(normalisiereTafelSuche(eingabe)).toBe(normalisiereCanvasSuche(eingabe));
    }
  });
});

describe('karteTrifft', () => {
  const m = model();
  const karte = (text) => m.spalten.flatMap((s) => s.karten).find((k) => k.text.startsWith(text));

  it('findet im Text der Karte, ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(karteTrifft(karte('Angebot'), m.zeilen, 'ANGEBOT')).toBe(true);
    expect(karteTrifft(karte('Angebot'), m.zeilen, 'schreiben')).toBe(true);
    expect(karteTrifft(karte('Rechnung'), m.zeilen, 'angebot')).toBe(false);
  });

  it('findet in einer eingerückten Folgezeile', () => {
    expect(karteTrifft(karte('Angebot'), m.zeilen, 'preisliste')).toBe(true);
    // Die Folgezeile gehört zu ihrer Karte und zu keiner anderen.
    expect(karteTrifft(karte('Rechnung'), m.zeilen, 'preisliste')).toBe(false);
  });

  it('findet Tags, mit und ohne Raute, auch verschachtelte', () => {
    expect(karteTrifft(karte('Angebot'), m.zeilen, '#kunde')).toBe(true);
    expect(karteTrifft(karte('Präsentation'), m.zeilen, '#kunde')).toBe(true);
    expect(karteTrifft(karte('Präsentation'), m.zeilen, 'kunde/nord')).toBe(true);
  });

  it('findet einen Termin des Vorbild-Werkzeugs, den die Karte als Abzeichen zeigt', () => {
    expect(karteTrifft(karte('Termin'), m.zeilen, '2026-10-01')).toBe(true);
  });

  it('sucht den Text als eine Teilzeichenkette, nicht Wort für Wort', () => {
    expect(karteTrifft(karte('Angebot'), m.zeilen, 'angebot schreiben')).toBe(true);
    // Beide Wörter kommen vor, aber nicht in dieser Folge: kein Treffer.
    expect(karteTrifft(karte('Angebot'), m.zeilen, 'schreiben angebot')).toBe(false);
  });

  it('eine leere Suche filtert nicht', () => {
    expect(karteTrifft(karte('Rechnung'), m.zeilen, '')).toBe(true);
    expect(karteTrifft(karte('Rechnung'), m.zeilen, '   ')).toBe(true);
  });
});

describe('tafelFiltern', () => {
  it('zählt Treffer und Gesamtzahl je Spalte und über die ganze Tafel', () => {
    const ergebnis = tafelFiltern(model(), 'messe');
    expect(ergebnis.aktiv).toBe(true);
    expect(ergebnis.suche).toBe('messe');
    expect(texte(ergebnis)).toEqual([['Angebot schreiben #kunde'], [], ['Messestand gebucht']]);
    expect(ergebnis.spalten.map((s) => [s.treffer, s.gesamt])).toEqual([
      [1, 3],
      [0, 1],
      [1, 1],
    ]);
    expect([ergebnis.treffer, ergebnis.gesamt]).toEqual([2, 5]);
  });

  it('führt jede Spalte im Ergebnis, auch ohne Treffer', () => {
    const ergebnis = tafelFiltern(model(), 'gibt es nirgends');
    expect(ergebnis.spalten).toHaveLength(3);
    expect(ergebnis.treffer).toBe(0);
    expect(ergebnis.gesamt).toBe(5);
    expect(ergebnis.spalten.every((s) => s.kartenZeilen.size === 0)).toBe(true);
  });

  it('eine leere Suche lässt alle Karten stehen und ist nicht aktiv', () => {
    const ergebnis = tafelFiltern(model(), '  ');
    expect(ergebnis.aktiv).toBe(false);
    expect([ergebnis.treffer, ergebnis.gesamt]).toEqual([5, 5]);
    expect(ergebnis.spalten.every((s) => s.funde.size === 0)).toBe(true);
  });

  it('liefert die Fundstellen im Original-Text, getrennt nach Text und Folgezeile', () => {
    const m = model();
    const ergebnis = tafelFiltern(m, 'MESSE');
    const angebot = m.spalten[0].karten[0];
    const fund = ergebnis.spalten[0].funde.get(angebot.zeile);
    expect(fund.text).toBeNull();
    expect(fund.folge).toHaveLength(1);
    const [von, bis] = fund.folge[0].stellen[0];
    // Die Stellen zählen ohne das Wagenrücklauf-Zeichen des Zeilen-Puffers.
    expect(m.zeilen[fund.folge[0].zeile].slice(von, bis)).toBe('Messe');
  });

  it('verändert das Modell nicht', () => {
    const m = model();
    const vorher = JSON.stringify(m);
    tafelFiltern(m, 'kunde');
    expect(JSON.stringify(m)).toBe(vorher);
  });

  it('übersteht ein fehlendes oder keine Tafel tragendes Modell', () => {
    expect(tafelFiltern(null, 'x')).toMatchObject({ treffer: 0, gesamt: 0, spalten: [] });
    expect(tafelFiltern(leseTafel('# Nur ein Dokument'), 'x').spalten).toEqual([]);
  });
});
