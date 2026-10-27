// 4T-002347 (Epic 3E-000184): Die gemeinsame Abschnitts-Heimat.
//
// Bestands-Lesung: Die Regel ist die des Anker-Auszugs der Einbettungen
// (`extractEmbedSnippet`, `src/main/index/embed.js`, vor dem Auszug am
// 2026-10-22): Überschrift nach `HEADING_RE`, Abschnitt bis zur nächsten
// Überschrift gleichen oder höheren Rangs, Code-Blöcke übersprungen. Die
// Prüfdateien der Einbettung (`embed-ausschnitt.test.js`,
// `embed-anker-ausschnitt.test.js`) laufen unverändert und belegen die
// Verhaltensgleichheit; hier steht die Heimat selbst.
import { describe, it, expect } from 'vitest';
import {
  HEADING_RE,
  findHeadingSection,
  headingSections,
} from '../../src/shared/markdown/heading-sections.js';
import { HEADING_RE as INDEX_HEADING_RE } from '../../src/main/index/parse.js';

const zeilen = (text) => text.split('\n');

describe('Abschnitts-Heimat', () => {
  it('ist die eine Fassung von HEADING_RE, auch für den Index', () => {
    // Über ESM und CJS entstehen zwei Modul-Instanzen; verglichen wird das Muster.
    expect(INDEX_HEADING_RE.source).toBe(HEADING_RE.source);
    expect('## Titel ##'.match(HEADING_RE)[1]).toBe('Titel');
    expect(HEADING_RE.test('#######  sieben')).toBe(false);
    expect(HEADING_RE.test('#ohne')).toBe(false);
  });

  it('reicht bis zur nächsten Überschrift gleichen oder höheren Rangs', () => {
    const l = zeilen('# A\ntext\n## B\nb\n### C\nc\n## D\n# E');
    expect(findHeadingSection(l, 'b')).toEqual({ start: 2, end: 6, level: 2 });
    expect(findHeadingSection(l, 'a')).toEqual({ start: 0, end: 7, level: 1 });
    expect(findHeadingSection(l, 'e')).toEqual({ start: 7, end: 8, level: 1 });
  });

  it('übergeht Überschriften in Code-Blöcken für Anfang und Ende', () => {
    const l = zeilen('## A\n```\n## B\n```\nnoch A\n## C');
    expect(findHeadingSection(l, 'b')).toBeNull();
    expect(findHeadingSection(l, 'a')).toEqual({ start: 0, end: 5, level: 2 });
  });

  it('nimmt den ersten Treffer und liefert null ohne Treffer', () => {
    const l = zeilen('## X\n1\n## X\n2');
    expect(findHeadingSection(l, 'x').start).toBe(0);
    expect(findHeadingSection(l, 'y')).toBeNull();
  });

  it('listet alle Abschnitte mit Text, Kennung und Lage ab einer Startzeile', () => {
    const l = zeilen('# kein\n---\n## Über uns\nx\n```\n# nein\n```\n## Zwei');
    expect(headingSections(l, 1)).toEqual([
      { text: 'Über uns', slug: 'uber-uns', level: 2, start: 2, end: 7 },
      { text: 'Zwei', slug: 'zwei', level: 2, start: 7, end: 8 },
    ]);
    expect(headingSections(l).map((s) => s.text)).toEqual(['kein', 'Über uns', 'Zwei']);
  });
});
