// @vitest-environment jsdom
// 4T-001775 (Epic 3E-000304): Die Beschriftung einer Lesezeichen-Zeile.
//
// Der Fall ist anders gebaut als die uebrigen Anzeigen dieses Epics: Das
// Lesezeichen-Panel zeigt NICHT den Dateinamen, sondern einen GESPEICHERTEN
// Anzeigenamen, der beim Anlegen aus dem Basisnamen entsteht und danach frei
// aenderbar ist. Gekuerzt wird deshalb nur der automatische Name; ein
// gewaehlter bleibt Zeichen fuer Zeichen stehen (Variante 1).
//
// Geprueft werden die drei reinen Funktionen aus bookmarks-tree.js — die
// Erkennung des automatischen Namens, die Beschriftung und die
// Rueckabbildung beim Bestaetigen des Inline-Umbenennens. Der Bedienweg selbst
// (Feld oeffnen, unveraendert bestaetigen, eigenen Namen setzen) liegt im
// E2E-Fall BL-07 in test/e2e/funktionen/bereichs-lesezeichen.spec.js, der dazu
// den GESPEICHERTEN Baum liest — an der Anzeige allein waere nicht zu sehen, ob
// aus dem automatischen Namen ein gewaehlter geworden ist.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const { bookmarkAutoName, bookmarkLabel, bookmarkNameAusEingabe } =
  await import('../../../src/renderer/modules/bookmarks/bookmarks-tree.js');

// Ein Datei-Knoten wie im Baum: absolutes Ziel (allgemeiner Abschnitt) oder
// wurzel-relatives (Bereichs-Abschnitt).
const knoten = (filePath, displayName) => ({ type: 'file', id: 'b-1', filePath, displayName });

describe('Lesezeichen: automatischer Name (4T-001775)', () => {
  it('liest den Basisnamen aus absolutem und relativem Ziel', () => {
    expect(bookmarkAutoName(knoten('C:/notizen/Konzept.md', 'Konzept.md'))).toBe('Konzept.md');
    expect(bookmarkAutoName(knoten('unter/notiz.md', 'notiz.md'))).toBe('notiz.md');
    expect(bookmarkAutoName({ type: 'file', id: 'b-2' })).toBe('');
    expect(bookmarkAutoName(null)).toBe('');
  });
});

describe('Lesezeichen: Beschriftung (4T-001775)', () => {
  it('kuerzt den automatischen Namen um die Markdown-Endung', () => {
    expect(bookmarkLabel(knoten('C:/notizen/Konzept.md', 'Konzept.md'))).toBe('Konzept');
    expect(bookmarkLabel(knoten('C:/notizen/Notiz.markdown', 'Notiz.markdown'))).toBe('Notiz');
    // Bereichs-Lesezeichen: dasselbe an einem wurzel-relativen Ziel.
    expect(bookmarkLabel(knoten('unter/notiz.md', 'notiz.md'))).toBe('notiz');
  });

  it('laesst einen vom Anwender gewaehlten Namen unangetastet', () => {
    // Der tragende Fall der Entscheidung: Was der Anwender geschrieben hat,
    // wird nicht beschnitten — auch dann nicht, wenn es wie eine Endung endet.
    expect(bookmarkLabel(knoten('C:/notizen/Konzept.md', 'Mein Entwurf'))).toBe('Mein Entwurf');
    expect(bookmarkLabel(knoten('C:/notizen/Konzept.md', 'Entwurf.md'))).toBe('Entwurf.md');
  });

  it('kuerzt auch ohne gespeicherten Anzeigenamen', () => {
    // Alt-Bestand und Rueckfall: fehlt der Name, gilt der Basisname.
    expect(bookmarkLabel(knoten('C:/notizen/Konzept.md', undefined))).toBe('Konzept');
    expect(bookmarkLabel(knoten('C:/notizen/Konzept.md', ''))).toBe('Konzept');
  });

  it('laesst eine fremde Endung stehen und faellt bei reiner Endung zurueck', () => {
    expect(bookmarkLabel(knoten('C:/notizen/Liste.txt', 'Liste.txt'))).toBe('Liste.txt');
    expect(bookmarkLabel(knoten('C:/notizen/.md', '.md'))).toBe('.md');
  });
});

describe('Lesezeichen: Rueckabbildung beim Bestaetigen (4T-001775)', () => {
  it('haelt den automatischen Namen, wenn das Feld unveraendert bestaetigt wird', () => {
    // Ohne diesen Schritt machte ein blosses Enter oder der Verlust des Fokus
    // aus dem automatischen Namen still einen gewaehlten — und die naechste
    // Umbenennung der Datei zoege ihn nicht mehr nach.
    const node = knoten('C:/notizen/Konzept.md', 'Konzept.md');
    expect(bookmarkNameAusEingabe(node, 'Konzept')).toBe('Konzept.md');
  });

  it('nimmt eine echte Aenderung als gewaehlten Namen', () => {
    const node = knoten('C:/notizen/Konzept.md', 'Konzept.md');
    expect(bookmarkNameAusEingabe(node, 'Mein Entwurf')).toBe('Mein Entwurf');
    // Auch der volle Dateiname bleibt als Eingabe stehen: Er IST der
    // automatische Name und bleibt damit automatisch.
    expect(bookmarkNameAusEingabe(node, 'Konzept.md')).toBe('Konzept.md');
  });

  it('bleibt ohne Ziel bei der Eingabe', () => {
    expect(bookmarkNameAusEingabe({ type: 'file', id: 'b-3' }, 'Frei gewaehlt')).toBe(
      'Frei gewaehlt',
    );
  });
});
