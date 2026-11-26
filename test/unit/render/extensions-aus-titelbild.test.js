// 4T-002630 (Epic 3E-000395): Aus-Zustand der Erweiterung «Titelbild»
// (cover-image), in eigener Datei nach dem Muster extensions-aus-diagramm.test.js.
// afterEach stellt den Default (alles an) her.
//
// **Nicht-Vakuität.** Jeder Fall prüft zuerst den An-Zustand am selben Dokument:
// Ein Aus-Fall, der auch ohne die Abschaltung grün wäre, weil der Kopf-Bereich
// gar nicht entsteht, bewiese nichts.
import { describe, it, expect, afterEach } from 'vitest';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';

afterEach(() => {
  configureExtensions([]);
});

const DOK = '---\ncover: bilder/strand.jpg\ncover-height: 300\n---\n# Titel\n';
const VOLL = { titelbild: true };

describe('Render-Erweiterungen: Aus-Zustand des Titelbilds (4T-002630)', () => {
  it('die Erweiterung steht in der Registry mit Kategorie und Arbeitsmodus (V1)', () => {
    const eintrag = extensionById('cover-image');
    expect(eintrag).toMatchObject({
      category: 'render',
      modeLevel: 'advanced',
      nameKey: 'help.featureName.coverImage',
      descKey: 'help.feature.coverImage',
    });
  });

  it('cover-image: kein Kopf-Bereich, Eigenschaft bleibt in Dokument und Frontmatter-Zeile (AK3)', () => {
    const vorher = String(DOK);
    // An-Zustand (Nicht-Vakuitäts-Probe): der Kopf-Bereich entsteht.
    const an = renderMarkdown(DOK, 'de', VOLL);
    expect(an).toContain('<figure class="titelbild"');
    expect(an).toContain('titelbild-hinweis');
    configureExtensions(['cover-image']);
    const aus = renderMarkdown(DOK, 'de', VOLL);
    expect(aus).not.toContain('titelbild');
    // Die Eigenschaft erscheint weiter wie jede andere in der Frontmatter-Zeile.
    expect(aus.startsWith('<div class="frontmatter-block"')).toBe(true);
    expect(aus).toContain('cover');
    expect(aus).toContain('bilder/strand.jpg');
    // Der Rest der Ausgabe ist derselbe wie im An-Zustand ohne Kopf-Bereich.
    expect(an.slice(an.indexOf('<div class="frontmatter-block"'))).toBe(aus);
    expect(DOK).toBe(vorher);
    // Wieder an: der Kopf-Bereich ist zurück.
    configureExtensions([]);
    expect(renderMarkdown(DOK, 'de', VOLL)).toContain('<figure class="titelbild"');
  });

  it('cover-image: auch Netz- und Wiki-Form erzeugen im Aus-Zustand nichts', () => {
    for (const wert of ['https://example.org/a.png', '"[[strand.jpg]]"', '[[strand.jpg]]']) {
      const dok = `---\ncover: ${wert}\n---\nText\n`;
      expect(renderMarkdown(dok, 'de', VOLL), wert).toContain('class="titelbild');
      configureExtensions(['cover-image']);
      expect(renderMarkdown(dok, 'de', VOLL), wert).not.toContain('titelbild');
      configureExtensions([]);
    }
  });
});
