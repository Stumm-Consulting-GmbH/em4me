// 4T-000470 (Epic 3E-000087): Render-Anbindung der Gliederungs-Nummerierung.
//
// Deckt die Anwendung des Nummerierungs-Kerns in der Markdown-Pipeline ab:
// Nummern als eigenes Span im Render-Pane, Marker-Entfernung (auch bei
// inaktiver Nummerierung), Slug-Stabilitaet, Start-Ebene, Frontmatter-
// Schalter, Portable-Export (Marker weg, keine Nummern eingebrannt) und der
// Aus-Zustand der Erweiterung (Marker bleibt Literal-Text).
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
  configureHeadingNumbering,
} from '../../../src/shared/markdown/markdown.js';

// Standard-Zustand nach jedem Test: Nummerierung aus, alle Erweiterungen an.
afterEach(() => {
  configureHeadingNumbering({ enabled: false, startLevel: 1 });
  configureExtensions([]);
});

describe('Gliederungs-Nummerierung — Render-Pane (4T-000470)', () => {
  it('GN-01: stellt hierarchische Nummern als eigenes Span voran', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const html = renderMarkdown('# A\n## B\n### C\n## D\n# E', 'de');
    expect(html).toContain('<span class="heading-number">1</span> A');
    expect(html).toContain('<span class="heading-number">1.1</span> B');
    expect(html).toContain('<span class="heading-number">1.1.1</span> C');
    expect(html).toContain('<span class="heading-number">1.2</span> D');
    expect(html).toContain('<span class="heading-number">2</span> E');
  });

  it('GN-02: {-} nimmt aus, ohne die Geschwister-Zaehlung zu stoeren; Marker unsichtbar', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const html = renderMarkdown('# A\n## B\n## C {-}\n## D', 'de');
    expect(html).not.toContain('{-}');
    expect(html).toContain('<span class="heading-number">1.1</span> B');
    expect(html).toContain('>C</h2>'); // ausgenommen, keine Nummer
    expect(html).toContain('<span class="heading-number">1.2</span> D'); // zaehlt weiter
  });

  it('GN-03: {+} bezieht bei globaler Deaktivierung einzelne Ueberschriften ein', () => {
    configureHeadingNumbering({ enabled: false, startLevel: 1 });
    const html = renderMarkdown('# A\n# B {+}', 'de');
    expect(html).toContain('>A</h1>'); // ohne Nummer
    expect(html).not.toContain('heading-number">1</span> A');
    expect(html).toContain('<span class="heading-number">1</span> B');
    expect(html).not.toContain('{+}');
  });

  it('GN-04: \\{-} bleibt Literal und die Ueberschrift wird normal nummeriert', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const html = renderMarkdown('# Titel \\{-}', 'de');
    expect(html).toContain('{-}');
    expect(html).toContain('<span class="heading-number">1</span>');
  });

  it('GN-05: die Anker-ID bleibt ohne Nummer (Slug-Stabilitaet)', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const html = renderMarkdown('# Kapitel Eins', 'de');
    expect(html).toContain('id="kapitel-eins"');
    expect(html).not.toContain('id="1-kapitel-eins"');
  });

  it('Zusammenspiel mit Heading-Attributen: {#id} und Nummer koexistieren', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const withAttr = renderMarkdown('# Titel {#eigen}', 'de');
    expect(withAttr).toContain('id="eigen"');
    expect(withAttr).toContain('<span class="heading-number">1</span> Titel');
    // Marker zuletzt: der before-inline-Strip nimmt ihn, bevor die Attribut-
    // Erweiterung {#eigen} verarbeitet; die Ausnahme wirkt (keine Nummer).
    const withMarker = renderMarkdown('# Titel {#eigen} {-}', 'de');
    expect(withMarker).toContain('id="eigen"');
    expect(withMarker).not.toContain('{-}');
    expect(withMarker).toContain('>Titel</h1>');
  });

  it('GN-06: Start-Ebene 2 laesst H1 ohne Nummer, H2 beginnt bei 1', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 2 });
    const html = renderMarkdown('# Titel\n## A\n## B', 'de');
    expect(html).toContain('>Titel</h1>');
    expect(html).not.toContain('heading-number">1</span> Titel');
    expect(html).toContain('<span class="heading-number">1</span> A');
    expect(html).toContain('<span class="heading-number">2</span> B');
  });

  it('entfernt die Marker auch bei inaktiver Nummerierung (nie sichtbar)', () => {
    configureHeadingNumbering({ enabled: false, startLevel: 1 });
    const html = renderMarkdown('# A {-}\n# C', 'de');
    expect(html).not.toContain('{-}');
    expect(html).not.toContain('heading-number');
  });
});

describe('Gliederungs-Nummerierung — Frontmatter-Schalter (4T-000470)', () => {
  it('numbered-headings: true aktiviert bei globaler Deaktivierung', () => {
    configureHeadingNumbering({ enabled: false, startLevel: 1 });
    const html = renderMarkdown('---\nnumbered-headings: true\n---\n# A', 'de', {
      frontmatterBlock: false,
    });
    expect(html).toContain('<span class="heading-number">1</span> A');
  });

  it('numbered-headings: false uebersteuert die globale Aktivierung', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const html = renderMarkdown('---\nnumbered-headings: false\n---\n# A', 'de', {
      frontmatterBlock: false,
    });
    expect(html).not.toContain('heading-number');
    expect(html).toContain('>A</h1>');
  });
});

describe('Gliederungs-Nummerierung — Portable-Export (4T-000470)', () => {
  it('entfernt die Marker, ohne Nummern einzubrennen (PO-Entscheidung)', () => {
    const out = convertMarkdownPortable('# Alpha {-}\n## Beta\n### Gamma {+}', false);
    expect(out).not.toContain('{-}');
    expect(out).not.toContain('{+}');
    expect(out).toContain('# Alpha');
    expect(out).toContain('## Beta');
    expect(out).toContain('### Gamma');
    expect(out).not.toMatch(/#\s+\d+(\.\d+)*\s/); // keine eingebrannten Nummern
  });

  it('escaptes \\{-} bleibt im Export Literal', () => {
    const out = convertMarkdownPortable('# Titel \\{-}', false);
    expect(out).toContain('\\{-}');
  });

  it('Marker in Fenced-Code bleiben unberuehrt', () => {
    const out = convertMarkdownPortable('```\n# Shell {-}\n```\n', false);
    expect(out).toContain('# Shell {-}');
  });
});

describe('Gliederungs-Nummerierung — Aus-Zustand der Erweiterung (4T-000470)', () => {
  it('deaktiviert bleibt der Marker Literal-Text und es gibt keine Nummern', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    // Auch die Attribut-Erweiterung aus: {-}/{+} teilen die Curly-Syntax mit
    // den Heading-Attributen (markdown-it-attrs). Bei aktiver Nummerierung
    // greift der Marker-Strip davor; im Aus-Zustand wuerde die Attribut-
    // Erweiterung das {-} sonst als leeren Attribut-Block schlucken. Nur ohne
    // sie bleibt der Marker echtes Literal-Text (dokumentierte Kopplung).
    configureExtensions(['heading-numbering', 'attributes']);
    const html = renderMarkdown('# A {-}\n## B', 'de');
    expect(html).toContain('{-}');
    expect(html).not.toContain('heading-number');
  });

  it('deaktiviert bleibt der Marker auch im Portable-Export erhalten', () => {
    configureExtensions(['heading-numbering']);
    const out = convertMarkdownPortable('# A {-}', false);
    expect(out).toContain('{-}');
  });
});
