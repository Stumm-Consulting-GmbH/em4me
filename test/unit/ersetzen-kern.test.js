// 4T-001526 (Epic 3E-000169): Prüffälle des geteilten Ersetzungs-Kerns.
//
// Der Kern ist geteilt, weil zwei Wege dasselbe einsetzen müssen: die Platte im
// Hauptprozess (4T-001524) und der Puffer eines offenen Reiters im
// Anzeige-Prozess (Entscheidung E5). Geprüft wird deshalb hier die REGEL, und
// nicht zweimal ihre Anwendung.
//
// Schwerpunkt sind die Rückverweise (E6, AK2) und die Offset-Disziplin: Ersetzt
// wird ausschließlich an den übergebenen Stellen, und eine Stelle, die nicht
// mehr passt, wird gemeldet statt geraten.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  baueSuchAusdruck,
  fundstellen,
  wendeErsetzungenAn,
} = require('../../src/shared/ersetzen-kern.js');

// Die Offsets, die die Suche liefern würde — hier aus demselben Kern, damit der
// Prüffall sie nicht von Hand nachrechnet und sich dabei verzählt.
function offsetsVon(text, muster, flags = 'gm') {
  return [...fundstellen(text, baueSuchAusdruck(muster, flags)).keys()];
}

describe('baueSuchAusdruck', () => {
  it('ergaenzt das fehlende g-Flag', () => {
    // Ohne g faende der Lauf immer nur den ersten Fund und liefe endlos.
    expect(baueSuchAusdruck('a', 'm').flags).toContain('g');
    // RegExp normalisiert die Reihenfolge der Flags; verglichen wird deshalb
    // die Menge und nicht die Schreibweise.
    expect([...baueSuchAusdruck('a', 'gmi').flags].sort().join('')).toBe('gim');
  });

  it('faellt ohne Flags auf gm zurueck', () => {
    expect(baueSuchAusdruck('a', '').flags).toBe('gm');
  });
});

describe('fundstellen', () => {
  it('liefert Offset und Fund-Text jeder Stelle', () => {
    const gefunden = fundstellen('ab ab', baueSuchAusdruck('ab', 'gm'));
    expect([...gefunden.entries()]).toEqual([
      [0, 'ab'],
      [3, 'ab'],
    ]);
  });

  it('bleibt bei einem Null-Breiten-Muster stehen, statt endlos zu laufen', () => {
    // ^ und $ finden nichts von Breite; ohne die Absicherung liefe die Schleife
    // ewig auf derselben Stelle.
    const gefunden = fundstellen('eins\nzwei\n', baueSuchAusdruck('^', 'gm'));
    expect(gefunden.size).toBe(0);
  });
});

describe('wendeErsetzungenAn: Auswahl der Stellen', () => {
  const text = 'Notiz eins\nzweite Notiz\ndritte Notiz\n';

  it('ersetzt ausschliesslich an den uebergebenen Stellen', () => {
    const offsets = offsetsVon(text, 'Notiz');
    expect(offsets).toHaveLength(3);
    const erg = wendeErsetzungenAn(text, [offsets[0], offsets[2]], {
      muster: 'Notiz',
      flags: 'gm',
      ersetzung: 'Merk',
      regexModus: false,
    });
    expect(erg.ok).toBe(true);
    expect(erg.anzahl).toBe(2);
    expect(erg.text).toBe('Merk eins\nzweite Notiz\ndritte Merk\n');
  });

  it('nimmt die Stellen in beliebiger Reihenfolge und doppelt entgegen', () => {
    const offsets = offsetsVon(text, 'Notiz');
    const erg = wendeErsetzungenAn(text, [offsets[2], offsets[0], offsets[0]], {
      muster: 'Notiz',
      flags: 'gm',
      ersetzung: 'Merk',
      regexModus: false,
    });
    expect(erg.ok).toBe(true);
    // Zweimal dieselbe Stelle ist eine Stelle, nicht zwei Ersetzungen.
    expect(erg.anzahl).toBe(2);
    expect(erg.text).toBe('Merk eins\nzweite Notiz\ndritte Merk\n');
  });

  it('meldet eine Stelle, an der kein Fund beginnt', () => {
    const erg = wendeErsetzungenAn(text, [3], {
      muster: 'Notiz',
      flags: 'gm',
      ersetzung: 'Merk',
      regexModus: false,
    });
    expect(erg).toEqual({ ok: false, grund: 'offsetUngueltig' });
  });

  it('meldet ein unbrauchbares Muster, statt still nichts zu tun', () => {
    const erg = wendeErsetzungenAn(text, [0], {
      muster: '(unvollstaendig',
      flags: 'gm',
      ersetzung: 'x',
      regexModus: false,
    });
    expect(erg.ok).toBe(false);
    expect(erg.grund).toBe('muster');
  });

  it('laesst einen Text ohne Stellen unveraendert', () => {
    const erg = wendeErsetzungenAn(text, [], {
      muster: 'Notiz',
      flags: 'gm',
      ersetzung: 'Merk',
      regexModus: false,
    });
    expect(erg.ok).toBe(true);
    expect(erg.text).toBe(text);
    expect(erg.anzahl).toBe(0);
  });
});

describe('wendeErsetzungenAn: Rueckverweise (AK2, Entscheidung E6)', () => {
  it('setzt die Klammer-Gruppen im Regex-Modus ein', () => {
    const text = 'A-Notiz und B-Notiz\n';
    const offsets = offsetsVon(text, '(\\w+)-Notiz');
    const erg = wendeErsetzungenAn(text, offsets, {
      muster: '(\\w+)-Notiz',
      flags: 'gm',
      ersetzung: 'Notiz-$1',
      regexModus: true,
    });
    expect(erg.text).toBe('Notiz-A und Notiz-B\n');
  });

  it('setzt bei einer Gruppe ins Leere Leertext ein, statt abzubrechen', () => {
    // $2 gibt es nicht. String.replace laesst den Rueckverweis dann woertlich
    // stehen — genau das ist der Fall, den AK2 als «bricht nicht ab» meint:
    // Der Lauf geht weiter und die uebrigen Stellen werden ersetzt.
    const text = 'A-Notiz und B-Notiz\n';
    const offsets = offsetsVon(text, '(\\w+)-Notiz');
    const erg = wendeErsetzungenAn(text, offsets, {
      muster: '(\\w+)-Notiz',
      flags: 'gm',
      ersetzung: '$1$2',
      regexModus: true,
    });
    expect(erg.ok).toBe(true);
    expect(erg.anzahl).toBe(2);
    // Beide Stellen sind ersetzt; die leere Gruppe hat den Lauf nicht gestoppt.
    expect(erg.text).not.toContain('Notiz');
  });

  it('nimmt den Ersetzungs-Text ohne Regex-Modus woertlich', () => {
    const text = 'A-Notiz\n';
    const offsets = offsetsVon(text, '(\\w+)-Notiz');
    const erg = wendeErsetzungenAn(text, offsets, {
      muster: '(\\w+)-Notiz',
      flags: 'gm',
      ersetzung: 'Notiz-$1',
      regexModus: false,
    });
    expect(erg.text).toBe('Notiz-$1\n');
  });
});

describe('wendeErsetzungenAn: Datei-Form', () => {
  it('ruehrt BOM und Windows-Zeilenenden nicht an', () => {
    // Die Offsets zaehlen ueber den ROHEN Text; dadurch bleiben beide von
    // selbst erhalten, ohne dass der Kern sie kennen muesste.
    const text = '﻿Notiz eins\r\nzweite Notiz\r\n';
    const offsets = offsetsVon(text, 'Notiz');
    const erg = wendeErsetzungenAn(text, offsets, {
      muster: 'Notiz',
      flags: 'gm',
      ersetzung: 'Merk',
      regexModus: false,
    });
    expect(erg.text).toBe('﻿Merk eins\r\nzweite Merk\r\n');
  });
});
