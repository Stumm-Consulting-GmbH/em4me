// 4T-002374 (Epic 3E-000156): Prüffall der gemeinsamen Hilfsfunktion
// test/code-spannen.js. Die beiden Wächter, die sie nutzen
// (release-hinweise.test.js, web-inhalte.test.js), prüfen am Bestand; hier
// steht die Regel selbst an kleinen Texten, auch an den Grenzfällen, die der
// Bestand gerade nicht enthält.
import { describe, it, expect } from 'vitest';
import {
  PLATZHALTER_MUSTER,
  ohneCodeSpannen,
  fundeAusserhalbCodeSpannen,
  platzhalterAusserhalbCodeSpannen,
} from '../code-spannen.js';

describe('Platzhalter außerhalb von Code-Spannen (4T-002374)', () => {
  it('ein Platzhalter in einer Code-Spanne ist kein Befund', () => {
    // Der Anlass vom 2026-10-24: der Anwender-Text 1.152.0 nennt `{{end}}`.
    expect(platzhalterAusserhalbCodeSpannen('Etwa `{{end}}` am Ende der Maske.')).toEqual([]);
  });

  it('ein Platzhalter außerhalb ist einer, auch in derselben Zeile wie eine Code-Spanne', () => {
    expect(platzhalterAusserhalbCodeSpannen('{{titel}}')).toEqual(['{{titel}}']);
    expect(platzhalterAusserhalbCodeSpannen('Vor `{{end}}` steht {{titel}}, danach `x`.')).toEqual([
      '{{titel}}',
    ]);
    expect(
      platzhalterAusserhalbCodeSpannen('{{a}} `{{b}}` {{c}}\n`{{d}}` {{e}}'),
      'alle Treffer, in der Reihenfolge des Textes',
    ).toEqual(['{{a}}', '{{c}}', '{{e}}']);
  });

  it('eine Code-Spanne endet an der Zeile: ein Backtick ohne Gegenstück verdeckt nichts', () => {
    expect(platzhalterAusserhalbCodeSpannen('`{{a}}\n{{b}}`')).toEqual(['{{a}}', '{{b}}']);
  });

  it('nur ein Wort in doppelten geschweiften Klammern gilt als Platzhalter', () => {
    expect(platzhalterAusserhalbCodeSpannen('{{date::yyyy}} {{ titel }} {titel}')).toEqual([]);
    expect(platzhalterAusserhalbCodeSpannen('{{titel_2}}')).toEqual(['{{titel_2}}']);
  });

  it('nimmt jedes Muster, mit und ohne Flag g, und lässt es unverändert', () => {
    const kommentar = /<!--/;
    const text = 'Die Angabe `<!-- dauer: 5 -->` je Folie. <!-- Anleitung --> <!-- zwei -->';
    expect(fundeAusserhalbCodeSpannen(text, kommentar)).toEqual(['<!--', '<!--']);
    expect(kommentar.flags).toBe('');
    // Ein Muster mit Flag g trägt einen Zustand; zwei Aufrufe liefern dasselbe.
    const text2 = 'a {{x}} b {{y}}';
    expect(platzhalterAusserhalbCodeSpannen(text2)).toEqual(['{{x}}', '{{y}}']);
    expect(platzhalterAusserhalbCodeSpannen(text2)).toEqual(['{{x}}', '{{y}}']);
    expect(PLATZHALTER_MUSTER.lastIndex).toBe(0);
  });

  it('ohneCodeSpannen entfernt genau die Spannen und lässt den übrigen Text stehen', () => {
    expect(ohneCodeSpannen('a `b` c `d` e')).toBe('a  c  e');
    expect(ohneCodeSpannen('ohne Spanne')).toBe('ohne Spanne');
  });
});
