// 4T-000595 (Epic 3E-000111): Inline-Berechnungen {= Ausdruck =} — Marker-
// Grammatik (Grenzfaelle, Escape, Quotes), kontext-freie Auswertung ueber
// die Query-Engine und das Fehlerbild mit Tooltip-Codes. Render-Nachweise
// laufen gegen renderMarkdown (Default-Zustand, alles an); die Abgrenzung
// gegen Critic Markup und markdown-it-attrs ist explizit mitgetestet
// (Syntax-Verifikation der 4T-000595-Loesung).
import { describe, it, expect } from 'vitest';
import {
  matchInlineCalcAt,
  findInlineCalcSpans,
  evaluateInlineCalc,
  inlineCalcSpec,
  INLINE_CALC_ERROR_GLYPH,
} from '../../../src/shared/markdown/inline-calc.js';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

describe('matchInlineCalcAt: Marker-Grammatik', () => {
  it('findet den ersten =}-Schliesser und liefert den Roh-Ausdruck', () => {
    const m = matchInlineCalcAt('{= 2+3 =} Rest', 1);
    expect(m).toEqual({ expr: ' 2+3 ', end: 9 });
  });

  it('lehnt {== ab (Critic-Highlight-Anker)', () => {
    expect(matchInlineCalcAt('{== markiert ==}', 1)).toBeNull();
  });

  it('laesst = im Ausdruck zu (Vergleiche), Schliesser bleibt =}', () => {
    const m = matchInlineCalcAt('{= 1 == 1 =}', 1);
    expect(m.expr).toBe(' 1 == 1 ');
    expect(m.end).toBe(12);
  });

  it('ueberspringt =} innerhalb von Engine-String-Literalen', () => {
    const src = '{= "x=}" =}';
    const m = matchInlineCalcAt(src, 1);
    expect(m.expr).toBe(' "x=}" ');
    expect(m.end).toBe(src.length);
  });

  it('unterminierte Quote laesst das Konstrukt Literal', () => {
    expect(matchInlineCalcAt('{= "offen =}', 1)).toBeNull();
  });

  it('unvollstaendiger Marker und Zeilenumbruch sind kein Konstrukt', () => {
    expect(matchInlineCalcAt('{= 2+3', 1)).toBeNull();
    expect(matchInlineCalcAt('{= 2\n+3 =}', 1)).toBeNull();
  });

  it('leerer bzw. Nur-Whitespace-Ausdruck ist kein Konstrukt', () => {
    expect(matchInlineCalcAt('{==}', 1)).toBeNull();
    expect(matchInlineCalcAt('{= =}', 1)).toBeNull();
  });
});

describe('findInlineCalcSpans: Spannen und Escape', () => {
  it('liefert alle Spannen einer Zeile', () => {
    const spans = findInlineCalcSpans('A {= 1+1 =} und {= 2*2 =} B');
    expect(spans).toEqual([
      { from: 2, to: 11, expr: ' 1+1 ' },
      { from: 16, to: 25, expr: ' 2*2 ' },
    ]);
  });

  it('Backslash-Paritaet: \\{= bleibt Literal, \\\\{= ist ein Konstrukt', () => {
    expect(findInlineCalcSpans('A \\{= 1+1 =} B')).toEqual([]);
    const spans = findInlineCalcSpans('A \\\\{= 1+1 =} B');
    expect(spans).toHaveLength(1);
    expect(spans[0].expr).toBe(' 1+1 ');
  });

  it('verschachtelte Klammern im Ausdruck bleiben eine Spanne', () => {
    const spans = findInlineCalcSpans('{= (2+3)*(4-1) =}');
    expect(spans).toEqual([{ from: 0, to: 17, expr: ' (2+3)*(4-1) ' }]);
  });
});

describe('evaluateInlineCalc: kontext-freie Auswertung', () => {
  it('Arithmetik mit Praezedenz und Klammern', () => {
    expect(evaluateInlineCalc('2+3*4')).toMatchObject({ ok: true, text: '14' });
    expect(evaluateInlineCalc('(2+3) * (4 - 1)')).toMatchObject({ ok: true, text: '15' });
    expect(evaluateInlineCalc('10/4')).toMatchObject({ ok: true, text: '2.5' });
    expect(evaluateInlineCalc('-5 + 2')).toMatchObject({ ok: true, text: '-3' });
    // Engine-Grammatik: Feldnamen duerfen '-' enthalten — '4-1' ist EIN
    // Feld-Token, Subtraktion braucht ein Leerzeichen vor dem Minus
    // (deckungsgleich zur Query; dokumentierter Sonderfall der Loesung).
    expect(evaluateInlineCalc('4-1')).toEqual({ ok: false, code: 'field' });
    expect(evaluateInlineCalc('4 - 1')).toMatchObject({ ok: true, text: '3' });
  });

  it('Vergleiche und Logik liefern true/false (Gleichheit ist =)', () => {
    expect(evaluateInlineCalc('1 = 1')).toMatchObject({ ok: true, text: 'true' });
    expect(evaluateInlineCalc('2 != 3')).toMatchObject({ ok: true, text: 'true' });
    expect(evaluateInlineCalc('2 >= 3')).toMatchObject({ ok: true, text: 'false' });
    expect(evaluateInlineCalc('1 = 1 AND 2 = 2')).toMatchObject({ ok: true, text: 'true' });
    // '==' ist KEIN Operator der Engine — der Marker-Scanner laesst die
    // Spanne intakt (siehe matchInlineCalcAt), die Auswertung meldet syntax.
    expect(evaluateInlineCalc('1 == 1')).toEqual({ ok: false, code: 'syntax' });
  });

  it('String-Konkatenation und -Funktionen', () => {
    expect(evaluateInlineCalc('"Mark" + "down"')).toMatchObject({ ok: true, text: 'Markdown' });
    expect(evaluateInlineCalc("upper('abc')")).toMatchObject({ ok: true, text: 'ABC' });
    expect(evaluateInlineCalc("length('Wort')")).toMatchObject({ ok: true, text: '4' });
  });

  it('Datums- und Dauer-Arithmetik', () => {
    expect(evaluateInlineCalc('date(2026-01-01) + dur(30d)')).toMatchObject({
      ok: true,
      text: '2026-01-31',
    });
    expect(evaluateInlineCalc('date(2026-01-31) - date(2026-01-01)')).toMatchObject({
      ok: true,
      text: '30d',
    });
    expect(evaluateInlineCalc('dur(1d) + dur(2h)')).toMatchObject({ ok: true, text: '1d 2h' });
  });

  it('Katalog-Funktionen (sum/number/choice/dateformat/default)', () => {
    expect(evaluateInlineCalc('sum(5)')).toMatchObject({ ok: true, text: '5' });
    expect(evaluateInlineCalc("number('42')")).toMatchObject({ ok: true, text: '42' });
    expect(evaluateInlineCalc("choice(1 = 2, 'ja', 'nein')")).toMatchObject({
      ok: true,
      text: 'nein',
    });
    expect(evaluateInlineCalc("dateformat(date(2026-01-01), 'dd.MM.yyyy')")).toMatchObject({
      ok: true,
      text: '01.01.2026',
    });
    expect(evaluateInlineCalc('default(1/0, 99)')).toMatchObject({ ok: true, text: '99' });
  });

  it('Fehler-Codes: syntax, field, function, value', () => {
    expect(evaluateInlineCalc('2+')).toEqual({ ok: false, code: 'syntax' });
    expect(evaluateInlineCalc('2 + 3 rest')).toEqual({ ok: false, code: 'syntax' });
    expect(evaluateInlineCalc('file.size + 1')).toEqual({ ok: false, code: 'field' });
    expect(evaluateInlineCalc('foo(1)')).toEqual({ ok: false, code: 'function' });
    expect(evaluateInlineCalc('sum(1, 2)')).toEqual({ ok: false, code: 'function' });
    expect(evaluateInlineCalc('1/0')).toEqual({ ok: false, code: 'value' });
    expect(evaluateInlineCalc("'a' * 2")).toEqual({ ok: false, code: 'value' });
  });

  it('nackte Woerter sind Feld-Referenzen und damit der field-Fehler', () => {
    // Die Engine kennt keine true/false-Literale; nackte Identifier loesen
    // als Feld auf und sind im kontext-freien Rahmen nicht unterstuetzt.
    expect(evaluateInlineCalc('true')).toEqual({ ok: false, code: 'field' });
  });
});

describe('inlineCalcSpec: Anzeige-Spezifikation', () => {
  it('ok: Ergebnis-Text mit getrimmtem Ausdruck als Tooltip', () => {
    expect(inlineCalcSpec(' 2+3 ')).toEqual({ ok: true, text: '5', title: '2+3' });
  });

  it('Fehler: Fehler-Zeichen plus Code', () => {
    expect(inlineCalcSpec(' 2+ ')).toEqual({
      ok: false,
      text: INLINE_CALC_ERROR_GLYPH,
      title: '2+',
      errorCode: 'syntax',
    });
  });
});

describe('Render-Integration (renderMarkdown, Default-Zustand)', () => {
  it('rendert das Ergebnis als Span mit Ausdrucks-Tooltip', () => {
    const html = renderMarkdown('A {= 2+3*4 =} B', 'de');
    expect(html).toContain('<span class="inline-calc" title="2+3*4">14</span>');
    expect(html).not.toContain('{=');
  });

  it('rendert Fehler als Zeichen mit data-i18n-title-Code', () => {
    const html = renderMarkdown('A {= 2+ =} B', 'de');
    expect(html).toContain('inline-calc-error');
    expect(html).toContain('data-i18n-title="inlineCalc.error.syntax"');
    expect(html).toContain(INLINE_CALC_ERROR_GLYPH);
    const field = renderMarkdown('A {= file.size =} B', 'de');
    expect(field).toContain('data-i18n-title="inlineCalc.error.field"');
  });

  it('Escape \\{= bleibt Literal-Text', () => {
    const html = renderMarkdown('A \\{= 2+2 =} B', 'de');
    expect(html).not.toContain('inline-calc');
    expect(html).toContain('{= 2+2 =}');
  });

  it('Critic Markup bleibt unberuehrt ({==, {~~, {>>)', () => {
    const html = renderMarkdown('A {== markiert ==} und {~~alt~>neu~~} B', 'de');
    expect(html).toContain('<mark class="critic">');
    expect(html).toContain('<del class="critic">');
    expect(html).not.toContain('inline-calc');
  });

  it('Konstrukt direkt nach Inline-Element: attrs konsumiert nicht mehr', () => {
    // Vor 4T-000595 konsumierte markdown-it-attrs das {…} nach dem Element;
    // die Inline-Regel laeuft frueher und erzeugt das Ergebnis-Span.
    const html = renderMarkdown('A *kursiv*{= 2+2 =} B', 'de');
    expect(html).toContain('<em>kursiv</em>');
    expect(html).toContain('>4</span>');
  });

  it('Konstrukt am Block-Ende (Tabellen-Zelle, Liste) rendert das Ergebnis', () => {
    const table = renderMarkdown('| a |\n|---|\n| {= 6*7 =} |', 'de');
    expect(table).toContain('>42</span>');
    const list = renderMarkdown('- Punkt {= 6/2 =}', 'de');
    expect(list).toContain('>3</span>');
  });

  it('attrs-Bestand bleibt intakt ([Span]{.klasse})', () => {
    const html = renderMarkdown('A [Wort]{.rot} B', 'de');
    expect(html).toContain('<span class="rot">Wort</span>');
  });

  it('mehrere Konstrukte pro Zeile rendern unabhaengig', () => {
    const html = renderMarkdown('{= 1+1 =} und {= 2*2 =}', 'de');
    expect(html).toContain('>2</span>');
    expect(html).toContain('>4</span>');
  });
});
