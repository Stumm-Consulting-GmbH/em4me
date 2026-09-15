// 4T-001668 (Epic 3E-000287): Prüffälle des Canvas-Blocks außerhalb der
// Canvas-Ansicht — AK1, AK2 und AK6 der Story 4S-000923.
//
// Geprüft wird der **Weg durch die Render-Pipeline**, nicht das Markup-Modul
// für sich: Lese-Ansicht, geteilte Ansicht, Live-Widget und Druck bekommen
// ihren Block über genau diesen einen Weg (Entscheidung E8), und ein Fall, der
// am Modul vorbei prüft, sagte über keinen von ihnen etwas.
//
// Die Snapshot-Fixture test/fixtures/render/canvas-flaeche.md hält die
// vollständige Form des Blocks fest; hier stehen die Regeln, die eine
// Snapshot-Zeile allein nicht als Regel ausweist.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';
import { VORSCHAU_KARTEN, VORSCHAU_ZEICHEN } from '../../../src/shared/markdown/canvas-block.js';
import { CANVAS_EXTENSION_ID, findCanvasFences } from '../../../src/shared/canvas/canvas-core.js';
import { isExtensionEnabled } from '../../../src/shared/extensions/extensions-core.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

afterEach(() => {
  configureExtensions([]);
});

const FENCE = (rumpf) => '```perspective-canvas\n' + rumpf + '\n```';
const KARTEN = (n) =>
  Array.from(
    { length: n },
    (_, i) => `!karte k${i + 1} x=0 y=0 b=200 h=100\n## Karte ${i + 1}`,
  ).join('\n');

describe('Canvas-Block: Art, Umfang und Zugang (AK1)', () => {
  it('die Fence wird zum Block und nicht zum Code-Block', () => {
    const html = renderMarkdown(FENCE(KARTEN(2)), 'de');
    expect(html).toContain('class="perspective-canvas canvas-block"');
    expect(html).not.toContain('language-perspective-canvas');
  });

  it('die Kopfzeile nennt Art und Umfang in Karten und Verbindungen', () => {
    const html = renderMarkdown(FENCE(`${KARTEN(2)}\n!linie e1 k1 -> k2`), 'de');
    expect(html).toContain('>Canvas-Fläche<');
    expect(html).toContain('>2 Karten, 1 Verbindung<');
  });

  it('Einzahl und Mehrzahl kommen aus getrennten Schlüsseln', () => {
    expect(renderMarkdown(FENCE(KARTEN(1)), 'de')).toContain('>1 Karte, 0 Verbindungen<');
  });

  // 4T-001700 (Epic 3E-000288): Die Umfang-Zeile nennt seit der Stufe 2 auch
  // Formen und Gruppen (AK8, Entscheidung E8 fortgeschrieben am 2026-09-12).
  it('die Kopfzeile nennt Formen und Gruppen, sobald welche da sind', () => {
    const rumpf = [
      KARTEN(1),
      '!form s1 x=0 y=0 b=90 h=90 art=stern',
      '!form s2 x=9 y=0 b=90 h=90',
      '!gruppe g1 x=0 y=0 b=300 h=300 farbe=blau',
    ].join('\n');
    expect(renderMarkdown(FENCE(rumpf), 'de')).toContain(
      '>1 Karte, 0 Verbindungen, 2 Formen, 1 Gruppe<',
    );
  });

  it('ohne Formen und Gruppen bleibt die Zeile so knapp wie zuvor', () => {
    // Die Gegenprobe: Ein dauerhaftes «0 Formen» wäre Rauschen in einer
    // Kopfzeile, die knapp bleiben soll — dieselbe Regel wie beim Befund.
    const html = renderMarkdown(FENCE(`${KARTEN(2)}\n!linie e1 k1 -> k2`), 'de');
    expect(html).toContain('>2 Karten, 1 Verbindung<');
    expect(html).not.toContain('Formen');
    expect(html).not.toContain('Gruppen');
  });

  // 4T-001746 (Epic 3E-000289): Die Gegenprobe der Stufe 3 — sie bringt
  // **keine** neue Zahl. Eine Verweis-Karte und eine Bild-Karte sind Karten,
  // und der Verweis ist eine Eigenschaft der Karte und keine Art neben ihr.
  it('zählt Verweis- und Bild-Karten in derselben Karten-Zahl', () => {
    const rumpf = [
      KARTEN(1),
      '!karte k2 x=0 y=0 b=200 h=100 doc="Konzepte/Import.md#Zielbild"',
      '!karte k3 x=0 y=0 b=200 h=100 bild="Anlagen/Skizze.png"',
    ].join('\n');
    const html = renderMarkdown(FENCE(rumpf), 'de');
    expect(html).toContain('>3 Karten, 0 Verbindungen<');
    // Keine zusätzliche Zahl in der Kopfzeile — weder für Verweise noch für
    // Bilder; die Umfang-Zeile sieht aus wie vor der Stufe 3.
    expect(html).not.toContain('Verweis');
    expect(html).not.toContain('Bild-');
  });

  it('zeigt eine Verweis-Karte ohne Beschriftung mit ihrem Ziel', () => {
    // Ohne diesen Rückfall stünde die Karte als leere Zeile in der Vorschau.
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100 doc="Konzepte/Import.md#Zielbild"',
      '!karte k2 x=0 y=0 b=200 h=100 bild="Anlagen/Skizze.png"',
    ].join('\n');
    const html = renderMarkdown(FENCE(rumpf), 'de');
    expect(html).toContain('Konzepte/Import.md#Zielbild');
    expect(html).toContain('Skizze.png');
  });

  it('eine einzelne Form und eine einzelne Gruppe stehen in der Einzahl', () => {
    const rumpf = [KARTEN(1), '!form s1 x=0 y=0 b=90 h=90', '!gruppe g1 x=0 y=0 b=9 h=9'].join(
      '\n',
    );
    expect(renderMarkdown(FENCE(rumpf), 'de')).toContain(
      '>1 Karte, 0 Verbindungen, 1 Form, 1 Gruppe<',
    );
  });

  it('der Zugang ist ein Knopf und trägt die Stelle der Fence', () => {
    const doc = `# Titel\n\n${FENCE(KARTEN(1))}\n`;
    const html = renderMarkdown(doc, 'de');
    const stelle = findCanvasFences(doc)[0].startZeile;
    expect(html).toContain(`data-canvas-oeffnen="${stelle}"`);
    expect(html).toContain(`data-canvas-start="${stelle}"`);
  });

  it('die Stelle stimmt auch mit Kopfbereich mit dem Kern überein', () => {
    const doc = `---\ntitel: x\nart: probe\n---\n\nText\n\n${FENCE(KARTEN(1))}\n`;
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain(`data-canvas-start="${findCanvasFences(doc)[0].startZeile}"`);
  });

  it('Befunde erscheinen als Hinweis, ein fehlerfreier Block schweigt', () => {
    const mitBefund = renderMarkdown(
      FENCE('!karte k1 x=0 y=0 b=200 h=100\nText\n!linie e1 k1 -> weg'),
      'de',
    );
    expect(mitBefund).toContain('canvas-block-befunde');
    expect(mitBefund).toContain('>1 Befund<');
    expect(renderMarkdown(FENCE(KARTEN(1)), 'de')).not.toContain('canvas-block-befunde');
  });
});

describe('Canvas-Block: gedeckelte Karten-Vorschau (AK2)', () => {
  it('zeigt höchstens sechs Karten, unabhängig von der Größe der Fläche', () => {
    const sechs = renderMarkdown(FENCE(KARTEN(VORSCHAU_KARTEN)), 'de');
    const viele = renderMarkdown(FENCE(KARTEN(40)), 'de');
    const zaehle = (html) => (html.match(/canvas-block-karte"/g) || []).length;
    expect(zaehle(sechs)).toBe(VORSCHAU_KARTEN);
    expect(zaehle(viele)).toBe(VORSCHAU_KARTEN);
    expect(viele).toContain(`und ${40 - VORSCHAU_KARTEN} weitere`);
    expect(sechs).not.toContain('canvas-block-weitere');
  });

  it('der Titel ist die erste Überschrift, auch wenn Fließtext davorsteht', () => {
    const html = renderMarkdown(
      FENCE('!karte k1 x=0 y=0 b=200 h=100\nVorspann\n\n## Der Titel\n\nDanach'),
      'de',
    );
    expect(html).toContain('canvas-block-karte-titel">Der Titel<');
    expect(html).toContain('canvas-block-karte-zeile">Danach<');
  });

  it('ohne Überschrift trägt die erste nicht-leere Zeile den Titel', () => {
    const html = renderMarkdown(
      FENCE('!karte k1 x=0 y=0 b=200 h=100\n\n- Erster Punkt\n\nZweite Zeile'),
      'de',
    );
    expect(html).toContain('canvas-block-karte-titel">Erster Punkt<');
    expect(html).toContain('canvas-block-karte-zeile">Zweite Zeile<');
  });

  it('beide Zeilen werden an der Zeichen-Grenze gekürzt', () => {
    const lang = 'W'.repeat(VORSCHAU_ZEICHEN + 40);
    const html = renderMarkdown(FENCE(`!karte k1 x=0 y=0 b=200 h=100\n## ${lang}\n${lang}`), 'de');
    const gekuerzt = `${'W'.repeat(VORSCHAU_ZEICHEN - 1)}…`;
    expect(html).toContain(`canvas-block-karte-titel">${gekuerzt}<`);
    expect(html).toContain(`canvas-block-karte-zeile">${gekuerzt}<`);
    expect(html).not.toContain('W'.repeat(VORSCHAU_ZEICHEN + 1));
  });

  it('eine leere Fläche bekommt keine Vorschau, aber die Auskunft «0 Karten»', () => {
    const html = renderMarkdown(FENCE(''), 'de');
    expect(html).toContain('>0 Karten, 0 Verbindungen<');
    expect(html).not.toContain('canvas-block-rumpf');
  });

  it('der Karten-Text erscheint als Klartext und nicht als Markup', () => {
    const html = renderMarkdown(
      FENCE('!karte k1 x=0 y=0 b=200 h=100\n<script>alert(1)</script> & **fett**'),
      'de',
    );
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; **fett**');
    expect(html).not.toContain('<script>');
    // Kein Markdown-Rendering der Karten-Texte: Der Block wäre sonst ein
    // erzeugter Teilbaum im Sinne des Wächters aus 4T-001130.
    expect(html).not.toContain('<strong>fett</strong>');
  });
});

describe('Canvas-Block: Quelltext bleibt Quelltext (AK6) und Aus-Zustand (E6)', () => {
  it('der Fence-Text selbst wird nicht in den Block übernommen', () => {
    const html = renderMarkdown(FENCE('!karte k1 x=-320 y=-140 b=260 h=120\n## Titel'), 'de');
    expect(html).not.toContain('x=-320');
    expect(html).not.toContain('!karte');
  });

  // 4T-001656: Seit die Kennung `canvas` in der Registry steht, ist der
  // Aus-Zustand durch einen echten Render-Lauf belegbar — die beiden
  // Ersatz-Prüffälle von 4T-001668 (Quelltext-Probe am Tor und reine
  // Registry-Rechnung) sind damit durch die Fälle darunter abgelöst. Der
  // Maßstab ist schärfer als der ursprüngliche: Geprüft wird nicht, dass die
  // Fence Rohtext bleibt, sondern dass aus dem **Block** wieder ein
  // gewöhnlicher Code-Block wird (Story 4S-000919, AK3).
  it('AK3: abgeschaltet wird aus dem Block ein gewöhnlicher Code-Block', () => {
    const quelle = '!karte k1 x=-320 y=-140 b=260 h=120\n## Titel\nZweite Zeile';
    configureExtensions([CANVAS_EXTENSION_ID]);
    const html = renderMarkdown(FENCE(quelle), 'de');
    expect(html).not.toContain('canvas-block');
    expect(html).not.toContain('data-canvas-oeffnen');
    expect(html).toContain('<pre');
    expect(html).toContain('language-perspective-canvas');
  });

  it('AK3: der Inhalt der Fläche bleibt im Aus-Zustand vollständig lesbar', () => {
    // Der Kern der Zusage: Abgeschaltet wird die Darstellung, nicht die Angabe.
    // Deshalb erscheinen hier gerade die Koordinaten-Zeilen wieder, die der
    // Block bewusst weglässt.
    configureExtensions([CANVAS_EXTENSION_ID]);
    const html = renderMarkdown(FENCE('!karte k1 x=-320 y=-140 b=260 h=120\n## Titel'), 'de');
    expect(html).toContain('!karte k1 x=-320 y=-140 b=260 h=120');
    expect(html).toContain('## Titel');
  });

  it('AK6: nach dem Wiedereinschalten steht derselbe Block wieder da', () => {
    // Byte-Gleichheit des Ergebnisses aus **demselben** Text: Der Aus-Zustand
    // schreibt nie, es kann also nichts verloren gehen.
    const doc = `# Titel\n\n${FENCE(`${KARTEN(2)}\n!linie e1 k1 -> k2`)}\n`;
    const vorher = renderMarkdown(doc, 'de');
    configureExtensions([CANVAS_EXTENSION_ID]);
    expect(renderMarkdown(doc, 'de')).not.toContain('canvas-block');
    configureExtensions([]);
    expect(renderMarkdown(doc, 'de')).toBe(vorher);
  });

  it('die Fence-Regel hängt am Erweiterungs-Tor der Canvas-Kennung', () => {
    // Die Herkunft der Wirkung: EIN Tor für Lese-Ansicht, geteilte Ansicht,
    // Live-Widget und Druck. Der Quelltext-Fall bleibt neben dem Render-Lauf
    // stehen, weil er die **Stelle** festhält, an der das Tor sitzt.
    const quelle = readFileSync(path.join(WURZEL, 'src/shared/markdown/markdown.js'), 'utf8');
    expect(quelle).toContain("lang === 'perspective-canvas' && enabled(CANVAS_EXTENSION_ID)");
    // Die Kennung ist registriert; das Tor trägt damit den echten
    // Schalter-Stand und nicht die Kern-Antwort für unbekannte Kennungen.
    expect(isExtensionEnabled(CANVAS_EXTENSION_ID, [CANVAS_EXTENSION_ID])).toBe(false);
    expect(isExtensionEnabled(CANVAS_EXTENSION_ID, [])).toBe(true);
  });
});

describe('Canvas-Block: Lokalisierung', () => {
  it('die Beschriftungen folgen der Sprache des Render-Laufs', () => {
    const en = renderMarkdown(FENCE(KARTEN(2)), 'en');
    expect(en).toContain('>Canvas surface<');
    expect(en).toContain('>2 cards, 0 connections<');
    expect(en).toContain('title="Open canvas view"');
    const fr = renderMarkdown(FENCE(KARTEN(1)), 'fr');
    expect(fr).toContain('>Surface Canvas<');
    expect(fr).toContain('>1 carte, 0 connexions<');
  });

  // 4T-001700: Die fünf Sprachfassungen der neuen Zahlwörter, am gerenderten
  // Block statt an der Sprachdatei — der Wächter check-i18n prüft die
  // Schlüssel, hier steht die Wirkung.
  it('Formen und Gruppen erscheinen in allen fünf Sprachfassungen', () => {
    const rumpf = [KARTEN(1), '!form s1 x=0 y=0 b=90 h=90', '!gruppe g1 x=0 y=0 b=9 h=9'].join(
      '\n',
    );
    const erwartet = {
      de: '>1 Karte, 0 Verbindungen, 1 Form, 1 Gruppe<',
      en: '>1 card, 0 connections, 1 shape, 1 group<',
      fr: '>1 carte, 0 connexions, 1 forme, 1 groupe<',
      es: '>1 tarjeta, 0 conexiones, 1 forma, 1 grupo<',
      it: '>1 scheda, 0 collegamenti, 1 forma, 1 gruppo<',
    };
    for (const [sprache, text] of Object.entries(erwartet)) {
      expect(renderMarkdown(FENCE(rumpf), sprache)).toContain(text);
    }
  });

  it('die beiden Klapp-Beschriftungen reisen als Attribute mit', () => {
    const html = renderMarkdown(FENCE(KARTEN(1)), 'de');
    expect(html).toContain('data-canvas-zu="Block zuklappen"');
    expect(html).toContain('data-canvas-auf="Block aufklappen"');
  });
});
