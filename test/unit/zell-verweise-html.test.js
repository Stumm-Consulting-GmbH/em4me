// 4T-002014 (Epic 3E-000332): der enge Zell-Renderer der Datentabelle.
//
// Geprüft wird der Renderer für sich, ohne Datentabelle und ohne Pipeline: was
// er aus einer Zelle macht (Entscheidung F1 b des Product Owners vom
// 2026-09-28) und dass eine Zelle ohne Verweis-Zeichen byte-gleich zur
// bisherigen Anzeige bleibt. Die Einbettung in Grid, Export und Aus-Zustände
// steht in `perspective-datatable.test.js`.
import { describe, it, expect } from 'vitest';
import { baueZellRenderer } from '../../src/shared/markdown/cell-links-html.js';
import { escapeHtml } from '../../src/shared/markdown/slug.js';

const anzeige = baueZellRenderer({ wikiLinks: true, tags: true, areaLinks: true });
const portabel = baueZellRenderer({ wikiLinks: true, tags: true, portable: true });

describe('Zell-Renderer: Verweis-Schreibweisen (F1 b)', () => {
  it('Wiki-Verweis, mit Alias und mit Anker wie im Fließtext', () => {
    expect(anzeige('[[Ziel]]')).toBe('<a href="Ziel.md" class="wikilink">Ziel</a>');
    // In der Datentabelle steht der Alias-Trenner maskiert; der Parser liefert
    // den Wert mit einfachem Trenner, beide Formen ergeben denselben Verweis.
    expect(anzeige('[[Ziel|Alias]]')).toBe('<a href="Ziel.md" class="wikilink">Alias</a>');
    expect(anzeige('[[Ziel\\|Alias]]')).toBe('<a href="Ziel.md" class="wikilink">Alias</a>');
    expect(anzeige('[[Ziel#Kapitel Eins]]')).toBe(
      '<a href="Ziel.md#kapitel-eins" class="wikilink">Ziel#Kapitel Eins</a>',
    );
    expect(anzeige('[[Ziel#^block-1]]')).toBe(
      '<a href="Ziel.md#block-1" class="wikilink">Ziel#^block-1</a>',
    );
  });

  it('Markdown-Link, auch mit Web-Adresse', () => {
    expect(anzeige('[Text](Ziel.md)')).toBe('<a href="Ziel.md">Text</a>');
    expect(anzeige('[Web](https://example.org/a#b)')).toBe(
      '<a href="https://example.org/a#b">Web</a>',
    );
  });

  it('Schlagwort, aber keine Zahl, kein Farbcode und kein Wort-Inneres', () => {
    expect(anzeige('#projekt')).toBe('<a href="#tag:projekt" class="tag-link">#projekt</a>');
    expect(anzeige('#projekt/teil')).toContain('href="#tag:projekt/teil"');
    for (const text of ['#1', '#ff0000', 'C#', 'https://example.org/x#y']) {
      expect(anzeige(text)).toBe(escapeHtml(text));
    }
  });

  it('mehrere Verweise in einer Zelle, dazwischen Text', () => {
    expect(anzeige('[[A]] und [[B]], #tag')).toBe(
      '<a href="A.md" class="wikilink">A</a> und <a href="B.md" class="wikilink">B</a>, ' +
        '<a href="#tag:tag" class="tag-link">#tag</a>',
    );
  });

  it('Einbettung erscheint als Verweis, nicht eingebettet', () => {
    expect(anzeige('![[Bild.png]]')).toBe('<a href="Bild.png" class="wikilink">Bild.png</a>');
    expect(anzeige('![[Notiz]]')).toBe('<a href="Notiz.md" class="wikilink">Notiz</a>');
    expect(anzeige('![Bild](bild.png)')).toBe('<a href="bild.png">Bild</a>');
    // Ohne Verweis dahinter bleibt das Ausrufezeichen Text.
    expect(anzeige('![nix #t')).toBe('![nix <a href="#tag:t" class="tag-link">#t</a>');
  });

  it('Kürzel der Bereichs-Verknüpfung wie im Fließtext; aus-geschaltet bleibt es Teil des Ziels', () => {
    expect(anzeige('[[@zt:Datei]]')).toBe(
      '<a href="@zt:Datei.md" class="wikilink arealink" data-area-prefix="zt">@zt:Datei</a>',
    );
    const ohneBereich = baueZellRenderer({ wikiLinks: true, tags: true, areaLinks: false });
    expect(ohneBereich('[[@zt:Datei]]')).toBe(
      '<a href="@zt:Datei.md" class="wikilink">@zt:Datei</a>',
    );
  });

  it('gefährliche Adress-Schemata werden kein Verweis', () => {
    expect(anzeige('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
    expect(anzeige('[[javascript:alert(1)]]')).not.toContain('<a');
  });
});

describe('Zell-Renderer: übrige Auszeichnung bleibt Text (F1 b)', () => {
  it('Fett, Kursiv, Formel, Roh-HTML, Auto-Link und Typografie bleiben, wie geschrieben', () => {
    const text = '**fett** _kursiv_ $x^2$ <b>h</b> https://example.org (c) -- [[Z]]';
    expect(anzeige(text)).toBe(
      '**fett** _kursiv_ $x^2$ &lt;b&gt;h&lt;/b&gt; https://example.org (c) -- ' +
        '<a href="Z.md" class="wikilink">Z</a>',
    );
  });

  it('Inline-Code ist der Ausweg und hält den Verweis wörtlich', () => {
    expect(anzeige('`[[Z]]` und `#tag`')).toBe('<code>[[Z]]</code> und <code>#tag</code>');
  });

  it('Backslash bleibt stehen; es gibt keine Maskierung außer dem Inline-Code', () => {
    expect(anzeige('a\\b [[Z]]')).toBe('a\\b <a href="Z.md" class="wikilink">Z</a>');
  });
});

describe('Zell-Renderer: Schnellweg (byte-gleich ohne Verweis-Zeichen)', () => {
  it('eine Zelle ohne [[, ]( und # geht unverändert durch escapeHtml', () => {
    for (const text of [
      '',
      'Anna',
      '**fett** und `code` und $x$',
      '<script>alert(1)</script> & "x" \'y\'',
      'P|pe',
      'a\\*b',
      '[Text]',
    ]) {
      expect(anzeige(text)).toBe(escapeHtml(text));
    }
  });

  it('eine Zelle mit Verweis-Zeichen, aber ohne Verweis, bleibt ebenfalls gleich', () => {
    for (const text of ['Wert #1 & <x>', 'C# "Programm"', 'a](b ohne Klammer-Anfang']) {
      expect(anzeige(text)).toBe(escapeHtml(text));
    }
  });

  it('null und undefined ergeben eine leere Zelle', () => {
    expect(anzeige(null)).toBe('');
    expect(anzeige(undefined)).toBe('');
  });
});

describe('Zell-Renderer: Schalter', () => {
  it('ohne Wiki-Links bleibt [[…]] Text, das Schlagwort wirkt', () => {
    const r = baueZellRenderer({ wikiLinks: false, tags: true });
    expect(r('[[Ziel]] #t')).toBe('[[Ziel]] <a href="#tag:t" class="tag-link">#t</a>');
  });

  it('ohne Tags bleibt #wort Text, der Verweis wirkt', () => {
    const r = baueZellRenderer({ wikiLinks: true, tags: false });
    expect(r('[[Ziel]] #t')).toBe('<a href="Ziel.md" class="wikilink">Ziel</a> #t');
  });

  it('der Markdown-Link ist Kern und wirkt ohne beide Schalter', () => {
    const r = baueZellRenderer({});
    expect(r('[[Ziel]] #t [T](z.md)')).toBe('[[Ziel]] #t <a href="z.md">T</a>');
  });

  it('der portable Renderer bildet dieselben Verweise', () => {
    expect(portabel('[[Ziel|A]] #t')).toBe(
      '<a href="Ziel.md" class="wikilink">A</a> <a href="#tag:t" class="tag-link">#t</a>',
    );
  });
});
