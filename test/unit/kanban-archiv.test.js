// 4T-001902 (Epic 3E-000318): Unit-Tests des Archivierens einer Karte —
// Anfügen an ein vorhandenes, auch fremdes Archiv, Anlage eines fehlenden,
// Zeitstempel in der Form des Vorbilds, Obergrenze von 100 Karten und
// Byte-Treue über CRLF und fehlenden Schluss-Umbruch.
//
// Eigene Prüfdatei neben kanban-operationen.test.js, weil die Operation in
// ihrem eigenen Modul liegt (src/shared/kanban/kanban-archiv.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leseTafel } from '../../src/shared/kanban/kanban-core.js';
import { archiviereKarte, ARCHIV_OBERGRENZE } from '../../src/shared/kanban/kanban-archiv.js';

function fixture(name) {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/kanban/${name}`, import.meta.url)),
    'utf8',
  );
}

const STUFE2 = fixture('tafel-stufe-2.md');
const TAFEL = fixture('beispiel-tafel.md');

const BLOCK = STUFE2.slice(STUFE2.indexOf('%% kanban:settings'));
const OHNE_ARCHIV = STUFE2.slice(0, STUFE2.indexOf('***')) + BLOCK;
const NUR_SPALTEN = STUFE2.slice(0, STUFE2.indexOf('***')).replace(/\n+$/, '\n');
const ZEIT = '2026-09-23 10:15';

// Die Karte «Abgeschlossen» mit ihrer Folgezeile, letzte Spalte.
const FERTIG = { spalte: 3, karte: 0 };

describe('kanban-archiv — Anfügen an ein vorhandenes Archiv (AK6, AK7)', () => {
  it('hängt die Karte samt Folgezeile mit Zeitstempel unten an', () => {
    const r = archiviereKarte(STUFE2, { ...FERTIG, zeitstempel: ZEIT });
    expect(r.ok).toBe(true);
    expect(r.text).toContain(
      '- [ ] Zweite alte Karte\n    mit Folgezeile\n' +
        '- [x] 2026-09-23 10:15 Abgeschlossen\n    mit Folgezeile\n\nEine Prosa-Zeile',
    );
    const model = leseTafel(r.text);
    expect(model.spalten[3].karten).toEqual([]);
    expect(model.archiv.karten.map((k) => k.text)).toEqual([
      '2026-09-20 09:00 Alte Karte #intern',
      'Zweite alte Karte',
      '2026-09-23 10:15 Abgeschlossen',
    ]);
  });

  it('führt Überschrift und Bestand des fremden Archivs unverändert weiter', () => {
    const r = archiviereKarte(STUFE2, { ...FERTIG, zeitstempel: ZEIT, ueberschrift: 'Archiv' });
    expect(r.text).toContain('***\n\n## Archive\n\n- [x] 2026-09-20 09:00 Alte Karte #intern\n');
    expect(r.text).not.toContain('## Archiv\n');
    expect(r.text.endsWith(BLOCK)).toBe(true);
  });

  it('lässt Status-Zeichen und alle übrigen Zeilen stehen', () => {
    const r = archiviereKarte(STUFE2, { spalte: 0, karte: 1 });
    expect(r.text).toContain('- [ ] Nur ein Tag @{2026-10-02}\n\nEine Prosa-Zeile');
    const ohne = (t) =>
      t
        .split('\n')
        .filter((z) => !z.includes('Nur ein Tag'))
        .join('\n');
    expect(ohne(r.text)).toBe(ohne(STUFE2));
  });

  it('schreibt ohne Zeitstempel, wenn keiner angegeben ist', () => {
    const r = archiviereKarte(STUFE2, FERTIG);
    expect(r.text).toContain('mit Folgezeile\n- [x] Abgeschlossen\n    mit Folgezeile\n');
  });

  it('führt ein Archiv in der Sprache des Vorbilds weiter', () => {
    const r = archiviereKarte(TAFEL, { spalte: 1, karte: 1, zeitstempel: ZEIT });
    expect(r.text).toContain(
      '## Archiv\n\n- [x] [[N9 ✅ 2025-12-31 Abgelegte Beispiel-Notiz]]\n' +
        '- [/] 2026-09-23 10:15 Vierte Beispiel-Aufgabe\n\n%% kanban:settings',
    );
  });
});

describe('kanban-archiv — Anlage eines fehlenden Archivs (AK6)', () => {
  it('legt den Abschnitt vor dem Einstellungs-Block an', () => {
    const r = archiviereKarte(OHNE_ARCHIV, {
      ...FERTIG,
      zeitstempel: ZEIT,
      ueberschrift: 'Archiv',
    });
    expect(r.ok).toBe(true);
    expect(r.text).toContain(
      '**Complete**\n\n\n\n***\n\n## Archiv\n\n' +
        '- [x] 2026-09-23 10:15 Abgeschlossen\n    mit Folgezeile\n\n\n%% kanban:settings',
    );
    expect(r.text.endsWith(BLOCK)).toBe(true);
    const model = leseTafel(r.text);
    expect(model.archiv.ueberschrift).toBe('Archiv');
    expect(model.spalten.length).toBe(4);
  });

  it('nimmt ohne Angabe die Überschrift des Vorbilds', () => {
    const r = archiviereKarte(OHNE_ARCHIV, FERTIG);
    expect(r.text).toContain('***\n\n## Archive\n\n- [x] Abgeschlossen\n');
  });

  it('legt den Abschnitt am Dateiende an, mit Leerzeile vor der Trennlinie', () => {
    const r = archiviereKarte(NUR_SPALTEN, FERTIG);
    expect(r.text.slice(r.text.indexOf('**Complete**'))).toBe(
      '**Complete**\n\n\n***\n\n## Archive\n\n- [x] Abgeschlossen\n    mit Folgezeile\n',
    );
  });

  it('meldet eine ungültige Überschrift und einen ungültigen Zeitstempel', () => {
    for (const [angaben, code] of [
      [{ ...FERTIG, ueberschrift: '  ' }, 'ungueltigeUeberschrift'],
      [{ ...FERTIG, ueberschrift: 'a\nb' }, 'ungueltigeUeberschrift'],
      [{ ...FERTIG, zeitstempel: '2026-09-23' }, 'zeitstempelUngueltig'],
      [{ ...FERTIG, zeitstempel: '23.09.2026 10:15' }, 'zeitstempelUngueltig'],
      [{ spalte: 9, karte: 0 }, 'unbekannteSpalte'],
      [{ spalte: 2, karte: 5 }, 'unbekannteKarte'],
    ]) {
      const r = archiviereKarte(OHNE_ARCHIV, angaben);
      expect(r.ok).toBe(false);
      expect(r.befund.code).toBe(code);
    }
  });
});

describe('kanban-archiv — Obergrenze von 100 Karten (AK8)', () => {
  // Ein Archiv mit `anzahl` Karten, jede zweite mit Folgezeile, dazwischen eine
  // Prosa-Zeile, die nie zählt und nie herausfällt.
  function mitArchiv(anzahl) {
    const karten = [];
    for (let i = 1; i <= anzahl; i++) {
      karten.push(`- [x] Alt ${i}`);
      if (i % 2 === 0) karten.push(`    Folge ${i}`);
      if (i === 1) karten.push('Prosa im Archiv');
    }
    return (
      STUFE2.slice(0, STUFE2.indexOf('***')) +
      '***\n\n## Archive\n\n' +
      karten.join('\n') +
      '\n\n\n' +
      BLOCK
    );
  }

  it('lässt ein Archiv mit 99 Karten beim Anfügen auf 100 wachsen', () => {
    const r = archiviereKarte(mitArchiv(99), FERTIG);
    const archiv = leseTafel(r.text).archiv;
    expect(archiv.karten.length).toBe(ARCHIV_OBERGRENZE);
    expect(archiv.karten[0].text).toBe('Alt 1');
  });

  it('nimmt an der Obergrenze die älteste Karte samt Folgezeile heraus (Rot-Probe)', () => {
    const vorher = mitArchiv(100);
    const r = archiviereKarte(vorher, FERTIG);
    const archiv = leseTafel(r.text).archiv;
    // Nach dem Anfügen wären es 101 Karten; es bleiben 100.
    expect(archiv.karten.length).toBe(100);
    expect(archiv.karten[0].text).toBe('Alt 2');
    expect(archiv.karten[99].text).toBe('Abgeschlossen');
    expect(r.text).not.toContain('- [x] Alt 1\n');
    expect(r.text).toContain('Prosa im Archiv\n- [x] Alt 2\n    Folge 2\n');
  });

  it('kürzt ein fremdes Archiv über der Obergrenze auf 100', () => {
    const r = archiviereKarte(mitArchiv(120), FERTIG);
    const archiv = leseTafel(r.text).archiv;
    expect(archiv.karten.length).toBe(100);
    expect(archiv.karten[0].text).toBe('Alt 22');
    expect(r.text).not.toContain('Folge 20\n');
    expect(r.text).toContain('Prosa im Archiv');
    expect(r.text.endsWith(BLOCK)).toBe(true);
  });
});

describe('kanban-archiv — Byte-Treue über CRLF und Schluss-Umbruch (AK6, AK7)', () => {
  const ueberall = (t) => t.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'));

  it('fügt in einer CRLF-Quelle nur CRLF-Zeilen an', () => {
    const crlf = STUFE2.split('\n').join('\r\n');
    const r = archiviereKarte(crlf, { ...FERTIG, zeitstempel: ZEIT });
    expect(r.text).toContain('- [x] 2026-09-23 10:15 Abgeschlossen\r\n    mit Folgezeile\r\n');
    expect(ueberall(r.text)).toBe(true);
    expect(r.text).toBe(
      archiviereKarte(STUFE2, { ...FERTIG, zeitstempel: ZEIT })
        .text.split('\n')
        .join('\r\n'),
    );
  });

  it('legt ein Archiv in einer CRLF-Quelle mit CRLF-Zeilen an', () => {
    const crlf = OHNE_ARCHIV.split('\n').join('\r\n');
    const r = archiviereKarte(crlf, FERTIG);
    expect(r.text).toContain('\r\n***\r\n\r\n## Archive\r\n\r\n- [x] Abgeschlossen\r\n');
    expect(ueberall(r.text)).toBe(true);
  });

  it('erhält den fehlenden Schluss-Umbruch einer CRLF-Quelle', () => {
    const crlf = NUR_SPALTEN.replace(/\n$/, '').split('\n').join('\r\n');
    const r = archiviereKarte(crlf, FERTIG);
    expect(r.text.endsWith('\r\n- [x] Abgeschlossen\r\n    mit Folgezeile')).toBe(true);
    expect(r.text.split('\n').every((z, i, a) => (i === a.length - 1) !== z.endsWith('\r'))).toBe(
      true,
    );
  });
});
