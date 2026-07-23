// 4T-0660 (Epic 3E-0112): Leerzeile beginnt eine neue nummerierte Liste.
//
// Bewusste Abweichung von der Standard-Interpretation (Festlegung des
// Product Owners vom 2026-07-21): Ohne diese Regel setzt eine Leerzeile die
// Liste nur weitlaeufig fort und die Anzeige zaehlt ueber sie hinweg durch,
// waehrend der Quelltext wieder bei 1 beginnt. Genau diese Abweichung
// zwischen Quell- und Renderansicht meldete der Product Owner als Fehler.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';

afterEach(() => configureExtensions([]));

const ZWEI_LISTEN = '1. Erste A\n2. Erste B\n\n1. Zweite A\n2. Zweite B\n';

describe('Listen-Neustart nach Leerzeile (4T-0660)', () => {
  it('setzt die Nummer am ersten Punkt nach der Leerzeile zurueck', () => {
    // Der Zeilen-Mapper haengt zusaetzlich data-source-line an, deshalb wird
    // nur der Attribut-Anfang geprueft.
    const html = renderMarkdown(ZWEI_LISTEN, 'de');
    expect(html).toContain('<li value="1"');
    // Genau ein Neustart, nicht an jedem Punkt.
    expect(html.match(/<li value=/g)).toHaveLength(1);
  });

  it('uebernimmt die Nummer des Quelltexts, nicht immer die 1', () => {
    const html = renderMarkdown('1. A\n2. B\n\n7. C\n8. D\n', 'de');
    expect(html).toContain('<li value="7"');
  });

  it('laesst eine Liste ohne Leerzeile unberuehrt', () => {
    const html = renderMarkdown('1. A\n2. B\n3. C\n', 'de');
    expect(html).not.toContain('<li value=');
  });

  it('greift nicht in Aufzaehlungen', () => {
    const html = renderMarkdown('- A\n- B\n\n- C\n', 'de');
    expect(html).not.toContain('<li value=');
  });

  it('wirkt auch in der verschachtelten Ebene', () => {
    const html = renderMarkdown('1. Oben\n   1. A\n\n   1. B\n', 'de');
    expect(html).toContain('<li value="1"');
  });

  it('laesst den Portable-Export unveraendert (er bleibt Markdown)', () => {
    // Der Portable-Export liefert Markdown mit eingebetteten HTML-Tabellen,
    // nicht fertiges HTML. Die Listen-Nummern bleiben dort Quelltext; ein
    // fremdes Programm zaehlt sie nach der Standard-Regel ueber die
    // Leerzeile hinweg durch. Die Abweichung wirkt also nur in dieser App.
    const exported = convertMarkdownPortable(ZWEI_LISTEN, false, 'de');
    expect(exported).not.toContain('<li value=');
    expect(exported).toContain('1. Zweite A');
  });

  it('faellt bei abgeschalteter Erweiterung auf das Standard-Verhalten zurueck', () => {
    configureExtensions(['outliner']);
    const html = renderMarkdown(ZWEI_LISTEN, 'de');
    expect(html).not.toContain('<li value=');
  });
});
