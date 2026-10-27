// 4T-002351 (Epic 3E-000184): Die Lage der Hervorhebung in einer Befehls-Zeile
// (src/shared/workflows/workflow-highlight.js).
//
// Die Funktion liest den Zeilen-Leser und die Vorlagen-Engine; geprüft wird,
// dass die drei Arten an der richtigen Stelle der Zeile stehen, auch wenn ein
// Text `\"` enthält und der Wert damit kürzer ist als die Zeile.
import { describe, it, expect } from 'vitest';
import { workflowHighlightRanges } from '../../src/shared/workflows/workflow-highlight.js';

// Die Spannen als lesbare Liste «Art:Text».
const zeige = (zeile) =>
  workflowHighlightRanges(zeile).map(
    (s) => `${s.kind}:${zeile.replace(/\r$/, '').slice(s.from, s.to)}`,
  );

describe('workflowHighlightRanges', () => {
  it('färbt das Schlüsselwort und einen Text (AK1)', () => {
    expect(zeige('notify "fertig"')).toEqual(['keyword:notify', 'string:"fertig"']);
  });

  it('erlaubt Leerraum am Zeilenanfang', () => {
    expect(zeige('   open "a.md"')).toEqual(['keyword:open', 'string:"a.md"']);
  });

  it('färbt bei einem Paar feld="Wert" (G4) allein den Wert', () => {
    expect(zeige('x feld="Wert"')).toEqual(['keyword:x', 'string:"Wert"']);
  });

  it('färbt Optionen als Wörter nicht, ihren Text schon', () => {
    expect(zeige('insert "a.md" under "{{title}}" from-file "b.md"')).toEqual([
      'keyword:insert',
      'string:"a.md"',
      'string:"{{title}}"',
      'placeholder:{{title}}',
      'string:"b.md"',
    ]);
  });

  it('färbt Platzhalter im Text an ihrer Stelle (AK1)', () => {
    expect(zeige('create "{{folder}}/{{title}}.md"')).toEqual([
      'keyword:create',
      'string:"{{folder}}/{{title}}.md"',
      'placeholder:{{folder}}',
      'placeholder:{{title}}',
    ]);
  });

  it('rechnet die Lage hinter einem \\" im Text richtig zurück', () => {
    expect(zeige('append "a \\"b\\" {{date}} c" x')).toEqual([
      'keyword:append',
      'string:"a \\"b\\" {{date}} c"',
      'placeholder:{{date}}',
    ]);
  });

  it('färbt Platzhalter im Wert eines Paars', () => {
    expect(zeige('x feld="{{title}}" "b.md"')).toEqual([
      'keyword:x',
      'string:"{{title}}"',
      'placeholder:{{title}}',
      'string:"b.md"',
    ]);
  });

  it('behandelt \\{{ als Text und nicht als Platzhalter', () => {
    expect(zeige('notify "\\{{nicht}}"')).toEqual(['keyword:notify', 'string:"\\{{nicht}}"']);
  });

  it('zählt Umlaute als je ein Zeichen', () => {
    expect(zeige('notify "Größe {{title}}"')).toEqual([
      'keyword:notify',
      'string:"Größe {{title}}"',
      'placeholder:{{title}}',
    ]);
  });

  it('lässt ein Zeilenende \\r weg', () => {
    expect(zeige('wait 2\r')).toEqual(['keyword:wait']);
  });

  it('färbt Wörter ohne Anführungszeichen außer dem Schlüsselwort nicht', () => {
    expect(zeige('command editor.toggleBold')).toEqual(['keyword:command']);
  });

  it('gibt für Leerzeile, Kommentar und Lese-Fehler keine Spanne', () => {
    expect(workflowHighlightRanges('')).toEqual([]);
    expect(workflowHighlightRanges('   # Kommentar')).toEqual([]);
    expect(workflowHighlightRanges('move "a.md""b"')).toEqual([]);
    expect(workflowHighlightRanges('open "offen')).toEqual([]);
  });

  it('färbt einen fehlerhaften Platzhalter nicht, wohl aber seinen Text', () => {
    expect(zeige('notify "{{offen"')).toEqual(['keyword:notify', 'string:"{{offen"']);
  });

  it('färbt ein unbekanntes Schlüsselwort wie ein bekanntes; das Urteil fällt in der Prüfung', () => {
    expect(zeige('fliege "Mond.md"')).toEqual(['keyword:fliege', 'string:"Mond.md"']);
  });
});
