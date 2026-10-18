// 4T-002018 (Epic 3E-000360, Stories 4S-000205 und 4S-000208): Was eine
// Einbettung `![[Ziel#^id]]` von einer Pipe-Tabelle zeigt. Entschieden ist
// Weg 1 (Product Owner, 2026-10-03): Eine Kennung in eigener Zeile unter der
// Tabelle meint die ganze Tabelle, eine Kennung am Ende einer Tabellen-Zeile
// weiterhin diese Zeile.
//
// Die Fälle A, B, C und E sind die Schreibweisen der Probe im Objekt der
// Aufgabe; vor der Behebung lieferten B die letzte Zeile, C einen leeren Text
// (Rot-Probe im Lösungs-Kapitel). Die Gegenproben D, Listen-Eintrag, Zitat und
// Absatz müssen unverändert bleiben. Dazu der Gleichlauf mit dem Sprungziel
// der gerenderten Ausgabe und der Cursor-Folge des Block-Eigenschaften-Panels
// (AK3).
import { describe, it, expect } from 'vitest';
import { extractEmbedSnippet } from '../../src/main/index/embed.js';
import { renderMarkdown } from '../../src/shared/markdown/markdown.js';
import { blockAnchorForLine } from '../../src/shared/block-anchors.js';

const Z = '`'.repeat(3);
const TABELLE = ['| Name | Wert |', '|---|---|', '| a | 1 |', '| b | 2 |'];
const GANZE_TABELLE = TABELLE.join('\n');
const text = (...zeilen) => zeilen.join('\n');

describe('Ausschnitt einer Pipe-Tabelle (4T-002018)', () => {
  it('A: Kennung am Ende einer Tabellen-Zeile — diese Zeile', () => {
    const quelle = text(...TABELLE.slice(0, 3), '| b | 2 | ^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe('| b | 2 |');
  });

  it('A: auch an einer Zeile mitten in der Tabelle', () => {
    const quelle = text(...TABELLE.slice(0, 2), '| a | 1 | ^zeile', '| b | 2 |');
    expect(extractEmbedSnippet(quelle, '^zeile')).toBe('| a | 1 |');
  });

  it('B: Kennung in eigener Zeile nach einer Leerzeile — die ganze Tabelle', () => {
    const quelle = text(...TABELLE, '', '^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(GANZE_TABELLE);
  });

  it('B: mit Leerzeile davor und danach, Text darunter', () => {
    const quelle = text('Davor.', '', ...TABELLE, '', '^tab', '', 'Danach.');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(GANZE_TABELLE);
  });

  it('B: mehrere Leerzeilen davor', () => {
    const quelle = text(...TABELLE, '', '', '^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(GANZE_TABELLE);
  });

  it('C: Kennung direkt unter der Tabelle — die ganze Tabelle, kein leerer Text', () => {
    const quelle = text(...TABELLE, '^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(GANZE_TABELLE);
  });

  it('C: zwei Anker-Zeilen direkt unter der Tabelle — beide die ganze Tabelle', () => {
    const quelle = text(...TABELLE, '^eins', '^zwei');
    expect(extractEmbedSnippet(quelle, '^eins')).toBe(GANZE_TABELLE);
    expect(extractEmbedSnippet(quelle, '^zwei')).toBe(GANZE_TABELLE);
  });

  it('E: Kennung am Ende des Inhalts der letzten Zelle ist kein Anker — keine Einbettung', () => {
    const quelle = text(...TABELLE.slice(0, 3), '| b | 2 ^tab |');
    expect(extractEmbedSnippet(quelle, '^tab')).toBeNull();
  });

  it('B im Zitat — die Tabelle ohne die Anker-Zeile', () => {
    const quelle = text('> | Name | Wert |', '> |---|---|', '> | a | 1 |', '>', '> ^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(
      text('> | Name | Wert |', '> |---|---|', '> | a | 1 |'),
    );
  });

  it('C im Zitat — die Tabelle ohne die Anker-Zeile', () => {
    const quelle = text('> | Name | Wert |', '> |---|---|', '> | a | 1 |', '> ^tab');
    expect(extractEmbedSnippet(quelle, '^tab')).toBe(
      text('> | Name | Wert |', '> |---|---|', '> | a | 1 |'),
    );
  });

  it('eine Anker-Zeile mitten in der Tabelle bleibt eine Tabellen-Zeile', () => {
    const quelle = text(...TABELLE.slice(0, 2), '^mitte', '| b | 2 |');
    expect(extractEmbedSnippet(quelle, '^mitte')).toBe('');
  });
});

describe('Gegenproben: andere Blöcke behalten ihren Ausschnitt (AK4)', () => {
  it('D: Code-Block mit Kennung in eigener Zeile nach einer Leerzeile', () => {
    const quelle = text(`${Z}js`, 'const x = 1;', Z, '', '^code');
    expect(extractEmbedSnippet(quelle, '^code')).toBe(text(`${Z}js`, 'const x = 1;', Z));
  });

  it('D: Code-Block mit Kennung direkt darunter', () => {
    const quelle = text(`${Z}js`, 'const x = 1;', Z, '^code');
    expect(extractEmbedSnippet(quelle, '^code')).toBe(text(`${Z}js`, 'const x = 1;', Z));
  });

  it('Listen-Eintrag mit Unterliste', () => {
    const quelle = text('- eins ^li', '  - unter', '- zwei');
    expect(extractEmbedSnippet(quelle, '^li')).toBe(text('- eins', '  - unter'));
  });

  it('Zitat', () => {
    const quelle = text('> Zeile eins', '> Zeile zwei ^zi', '', 'Danach.');
    expect(extractEmbedSnippet(quelle, '^zi')).toBe(text('> Zeile eins', '> Zeile zwei'));
  });

  it('Absatz', () => {
    const quelle = text('Erster Satz.', 'Zweiter Satz. ^ab', '', 'Danach.');
    expect(extractEmbedSnippet(quelle, '^ab')).toBe(text('Erster Satz.', 'Zweiter Satz.'));
  });

  it('Absatz direkt unter einer Tabelle mit Anker am Zeilenende bleibt der Absatz', () => {
    const quelle = text(...TABELLE, '', 'Nachsatz. ^ns');
    expect(extractEmbedSnippet(quelle, '^ns')).toBe('Nachsatz.');
  });
});

describe('Gleichlauf: Sprungziel und Cursor-Folge deuten wie der Ausschnitt (AK3)', () => {
  const idTraeger = (html, id) => {
    const m = html.match(new RegExp(`<(\\w+)[^>]* id="${id}"`));
    return m ? m[1] : null;
  };

  it('A: das Sprungziel ist die Tabellen-Zeile', () => {
    const html = renderMarkdown(text(...TABELLE.slice(0, 3), '| b | 2 | ^tab'), 'de');
    expect(idTraeger(html, 'tab')).toBe('tr');
    expect(html).not.toContain('^tab');
  });

  it('B und C: das Sprungziel ist die Tabelle, kein leerer Träger', () => {
    for (const quelle of [text(...TABELLE, '', '^tab'), text(...TABELLE, '^tab')]) {
      const html = renderMarkdown(quelle, 'de');
      expect(idTraeger(html, 'tab')).toBe('table');
      expect(html).not.toContain('<p');
      expect(html).not.toContain('^tab');
    }
  });

  it('B: jede Zeile der Tabelle gehört im Block-Eigenschaften-Panel zur Kennung', () => {
    const quelle = text(...TABELLE, '', '^tab', '', 'Danach.');
    const proZeile = quelle.split('\n').map((_, i) => blockAnchorForLine(quelle, i + 1));
    expect(proZeile).toEqual(['tab', 'tab', 'tab', 'tab', null, 'tab', null, null]);
  });

  it('B: eine Tabelle ohne Anker darunter bleibt ohne Kennung', () => {
    const quelle = text(...TABELLE, '', 'Danach. ^ab');
    expect(blockAnchorForLine(quelle, 1)).toBeNull();
  });

  it('C: jede Zeile der Tabelle gehört zur Kennung (wie bisher)', () => {
    const quelle = text(...TABELLE, '^tab');
    const proZeile = quelle.split('\n').map((_, i) => blockAnchorForLine(quelle, i + 1));
    expect(proZeile).toEqual(['tab', 'tab', 'tab', 'tab', 'tab']);
  });
});
