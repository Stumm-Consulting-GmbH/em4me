// 4T-002509 (Epic 3E-000402): Unit-Tests der lexikalischen Hülle der
// zeilenweisen Marker-Blöcke (src/shared/canvas/marker-grammatik.js), allein
// und ohne einen Block-Kern.
//
// Die Hülle stand bis zu diesem Task im Canvas-Kern. Die Gegenprobe des
// Auszugs sind die bestehenden Canvas-Prüfdateien (test/unit/canvas-*.test.js),
// die unverändert grün laufen; hier steht, was die Hülle für sich zusagt, damit
// der Dashboard-Kern sich auf dieselben Zusagen stützen kann.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MARKER_ZEILE_RE,
  trenneZeilen,
  ohneCr,
  ermittleZeilenende,
  entschuetze,
  schuetze,
  tokenisiere,
  entpackeWert,
  packeWert,
  leseAngaben,
} from '../../src/shared/canvas/marker-grammatik.js';

function element() {
  return { attrs: {}, attrFolge: [] };
}

describe('Hülle — Zeilen (4T-002509, AK5)', () => {
  it('trennt nur an \\n und lässt ein \\r am Zeilenende stehen', () => {
    expect(trenneZeilen('a\r\nb\nc\r')).toEqual(['a\r', 'b', 'c\r']);
    expect(trenneZeilen('')).toEqual(['']);
    expect(trenneZeilen(null)).toEqual(['']);
  });

  it('entfernt für das Lesen genau ein \\r am Ende', () => {
    expect(ohneCr('a\r')).toBe('a');
    expect(ohneCr('a')).toBe('a');
    expect(ohneCr('a\r\r')).toBe('a\r');
  });

  it('ermittelt das vorherrschende Zeilenende', () => {
    expect(ermittleZeilenende(trenneZeilen('a\r\nb\r\nc'))).toBe('\r\n');
    expect(ermittleZeilenende(trenneZeilen('a\nb\nc\r\nd'))).toBe('\n');
    expect(ermittleZeilenende(trenneZeilen('a'))).toBe('\n');
  });
});

describe('Hülle — Marker-Zeile (4T-002509, AK5)', () => {
  it('erkennt ein Wort in Spalte 0 hinter dem Ausrufezeichen', () => {
    const t = MARKER_ZEILE_RE.exec('!kachel kennzahl titel="A"');
    expect(t[1]).toBe('kachel');
    expect(t[2]).toBe('kennzahl titel="A"');
    expect(MARKER_ZEILE_RE.exec('!zeile')[1]).toBe('zeile');
    expect(MARKER_ZEILE_RE.exec('!zeile')[2]).toBeUndefined();
  });

  it('erkennt keine Zeile ohne Wort oder mit Einrückung', () => {
    expect(MARKER_ZEILE_RE.exec('!= 3')).toBeNull();
    expect(MARKER_ZEILE_RE.exec(' !karte k1')).toBeNull();
    expect(MARKER_ZEILE_RE.exec('! karte')).toBeNull();
    expect(MARKER_ZEILE_RE.exec('!1karte')).toBeNull();
  });
});

describe('Hülle — Rückstrich-Schutz (4T-002509, AK5)', () => {
  it('schützt eine Inhalts-Zeile mit führendem Ausrufezeichen', () => {
    expect(schuetze('!= 3')).toBe('\\!= 3');
    expect(schuetze('\\!x')).toBe('\\\\!x');
    expect(schuetze('kein Marker')).toBe('kein Marker');
    expect(schuetze('a !b')).toBe('a !b');
  });

  it('löst genau einen Rückstrich auf und ist umkehrbar', () => {
    expect(entschuetze('\\!= 3')).toBe('!= 3');
    expect(entschuetze('\\\\!x')).toBe('\\!x');
    expect(entschuetze('\\n')).toBe('\\n');
    for (const zeile of ['!a', '\\!a', '\\\\!a', 'a', '', '\\']) {
      expect(entschuetze(schuetze(zeile))).toBe(zeile);
    }
  });
});

describe('Hülle — Tokenisierung und Werte (4T-002509, AK5)', () => {
  it('trennt an Leerraum außerhalb von Anführungszeichen', () => {
    expect(tokenisiere('a  b\tc')).toEqual(['a', 'b', 'c']);
    expect(tokenisiere('titel="ein Titel" x=1')).toEqual(['titel="ein Titel"', 'x=1']);
    expect(tokenisiere('t="a \\" b" u="c\\\\"')).toEqual(['t="a \\" b"', 'u="c\\\\"']);
    expect(tokenisiere('')).toEqual([]);
  });

  it('entpackt Anführungszeichen und Escapes, lässt ein Wort stehen', () => {
    expect(entpackeWert('"a \\" b"')).toBe('a " b');
    expect(entpackeWert('"C:\\\\x"')).toBe('C:\\x');
    expect(entpackeWert('wort')).toBe('wort');
    expect(entpackeWert('"')).toBe('"');
  });

  it('packt nur, wo der Wert es braucht, oder auf Verlangen immer', () => {
    expect(packeWert('wort')).toBe('wort');
    expect(packeWert('zwei Wörter')).toBe('"zwei Wörter"');
    expect(packeWert('')).toBe('""');
    expect(packeWert('a=b')).toBe('"a=b"');
    expect(packeWert('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(packeWert('wort', { immerQuoten: true })).toBe('"wort"');
    for (const wert of ['wort', 'zwei Wörter', 'a"b\\c', '', 'x=y']) {
      expect(entpackeWert(tokenisiere('n=' + packeWert(wert))[0].slice(2))).toBe(wert);
    }
  });
});

describe('Hülle — Angaben und Operanden (4T-002509, AK5)', () => {
  it('trennt Angaben von Stellungs-Operanden und führt die Reihenfolge', () => {
    const el = element();
    const operanden = leseAngaben(el, 'kennzahl titel="A b" breite=halb farbe=rot zweites');
    expect(operanden).toEqual(['kennzahl', 'zweites']);
    expect(el.attrs).toEqual({ titel: 'A b', breite: 'halb', farbe: 'rot' });
    expect(el.attrFolge).toEqual(['titel', 'breite', 'farbe']);
  });

  it('behält bei doppelter Angabe die erste Stelle und den letzten Wert', () => {
    const el = element();
    leseAngaben(el, 'a=1 b=2 a=3');
    expect(el.attrFolge).toEqual(['a', 'b']);
    expect(el.attrs.a).toBe('3');
  });

  it('nimmt ein Gleichheitszeichen am Anfang oder in Anführungszeichen nicht als Angabe', () => {
    const el = element();
    const operanden = leseAngaben(el, '=x "a=b" k1');
    expect(operanden).toEqual(['=x', '"a=b"', 'k1']);
    expect(el.attrFolge).toEqual([]);
  });

  it('verträgt einen fehlenden Rest', () => {
    const el = element();
    expect(leseAngaben(el, undefined)).toEqual([]);
    expect(el.attrFolge).toEqual([]);
  });
});

describe('Hülle — eine Heimat (4T-002509, AK5)', () => {
  it('ist abhängigkeitsfrei', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/canvas/marker-grammatik.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual([]);
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('wird von Canvas- und Dashboard-Kern gelesen, nicht nachgebaut', () => {
    for (const pfad of [
      '../../src/shared/canvas/canvas-core.js',
      '../../src/shared/dashboard/dashboard-core.js',
    ]) {
      const quelle = readFileSync(new URL(pfad, import.meta.url), 'utf8');
      expect(quelle, `${pfad} liest die Hülle nicht aus dem Blatt`).toMatch(
        /require\('(\.\/|\.\.\/canvas\/)marker-grammatik\.js'\)/,
      );
      expect(quelle, `${pfad} trägt noch eine eigene Tokenisierung`).not.toMatch(
        /function (tokenisiere|entpackeWert|packeWert|trenneZeilen|schuetze)\(/,
      );
    }
  });
});
