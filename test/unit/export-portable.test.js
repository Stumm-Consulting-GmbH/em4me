// 4T-000189: Export-Konsistenz des Portable-Exports.
// K-01: Frontmatter bleibt in Zeile 1, der perspective-portable-Marker steht
//       danach; die Render-Weiche erkennt Alt- und Neu-Exporte.
// K-12: KaTeX in Tabellen-Zellen bleibt Quelltext (kein eingefrorenes
//       stylesheet-abhaengiges KaTeX-HTML im Export).
// 4T-000596 (Epic 3E-000111): Inline-Berechnungen werden als selbsttragende
//       Ergebnis-Spans eingebrannt; Fehler/Code/Escape bleiben roh.
// 4T-002072 (Epic 3E-000192): Name der Datentabelle aus der Kopf-Angabe
//       `table:` als Zeile `^Name` hinter der gewöhnlichen Tabelle.
import { describe, it, expect, afterEach } from 'vitest';
import {
  convertMarkdownPortable,
  renderMarkdown,
  configureExtensions,
  PERSPECTIVE_PORTABLE_MARKER,
} from '../../src/shared/markdown/markdown.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
// 4T-001595: Erwartete Beschriftungen kommen aus den Sprachdateien, nicht aus
// der Tastatur — der Wortlaut darf sich ändern, die Aussage nicht.
import EN from '../../src/i18n/en.json';
import DE from '../../src/i18n/de.json';

const PERSPECTIVE_BLOCK = [
  '```perspective-table',
  '{| class="perspective-table"',
  '|-',
  '| $x^2$ || normal',
  '|}',
  '```',
].join('\n');

describe('Portable-Export: Frontmatter (K-01)', () => {
  const src = `---\ntitel: Export\ntags: [a, b]\n---\n\n# Kopf\n\n${PERSPECTIVE_BLOCK}\n`;

  it('Export beginnt mit ---, Marker steht nach dem Frontmatter', () => {
    const out = convertMarkdownPortable(src, true);
    expect(out.startsWith('---\n')).toBe(true);
    const fm = extractFrontmatter(out);
    expect(fm.raw).not.toBeNull();
    expect(fm.data).toEqual({ titel: 'Export', tags: ['a', 'b'] });
    expect(out.slice(fm.endOffset).trimStart().startsWith(PERSPECTIVE_PORTABLE_MARKER)).toBe(true);
  });

  it('Render-Weiche erkennt Neu-Export (Marker nach Frontmatter) als portable', () => {
    const out = convertMarkdownPortable(src, true);
    // Eindeutiger Portable-Indikator in Node: mdPortable rendert ==X== mit
    // Inline-Style ('<mark style='), der Viewer-Renderer ohne. (KaTeX und
    // Marker-Escaping unterscheiden die Renderer in Node NICHT — beide
    // haben KaTeX, und der P-02-Sanitizer faellt ohne DOMParser auf
    // Escaping zurueck.)
    // Leerzeile vor dem Anhang — sonst zieht markdown-it den Text mit in
    // den vorausgehenden HTML-Tabellen-Block.
    const html = renderMarkdown(out + '\n\nDazu ==wichtig== markiert.\n', 'de');
    expect(html).toContain('<mark style');
  });

  it('Alt-Export (Marker in Zeile 1, ohne Frontmatter) bleibt portable', () => {
    const alt = `${PERSPECTIVE_PORTABLE_MARKER}\n\nText ==alt== markiert.\n`;
    const html = renderMarkdown(alt, 'de');
    expect(html).toContain('<mark style');
  });

  it('Datei ohne Marker rendert mit dem Viewer-Renderer (kein Inline-Style)', () => {
    const html = renderMarkdown('Text ==normal== markiert.\n', 'de');
    expect(html).toContain('<mark');
    expect(html).not.toContain('<mark style');
  });

  it('Export ohne Frontmatter traegt den Marker in Zeile 1', () => {
    const out = convertMarkdownPortable(`# Nur Text\n\n${PERSPECTIVE_BLOCK}\n`, true);
    expect(out.startsWith(PERSPECTIVE_PORTABLE_MARKER)).toBe(true);
  });
});

describe('Portable-Export: KaTeX in Tabellen-Zellen (K-12)', () => {
  it('Zellen behalten $...$ als Quelltext, kein katex-Markup im Export', () => {
    const out = convertMarkdownPortable(`${PERSPECTIVE_BLOCK}\n`, true);
    expect(out).toContain('$x^2$');
    expect(out).not.toContain('katex');
  });

  it('uebrige Zell-Formatierung bleibt erhalten (Tabelle als HTML)', () => {
    const out = convertMarkdownPortable(`${PERSPECTIVE_BLOCK}\n`, true);
    expect(out).toContain('<table');
    expect(out).toContain('normal');
  });
});

// 4T-000596 (Epic 3E-000111): Inline-Berechnungen im Portable-Export.
describe('Portable-Export: Inline-Berechnungen (4T-000596)', () => {
  afterEach(() => {
    configureExtensions([]);
  });

  it('brennt das Ergebnis als Span mit Inline-Style und Tooltip ein', () => {
    const out = convertMarkdownPortable('A {= 2+3 =} B\n', true);
    expect(out).toContain('<span class="inline-calc" style=');
    expect(out).toContain('title="2+3">5</span>');
    expect(out).not.toContain('{= 2+3 =}');
    // Konvertierte Spans sind Roh-HTML — der Marker erzwingt die
    // mdPortable-Ansicht (html:true mit Whitelist-Sanitizer).
    expect(out.startsWith(PERSPECTIVE_PORTABLE_MARKER)).toBe(true);
  });

  it('die Portable-Ansicht rendert den eingebrannten Span (Sanitizer-Whitelist)', () => {
    const out = convertMarkdownPortable('A {= 2+3 =} B\n', true);
    const html = renderMarkdown(out, 'de');
    expect(html).toContain('inline-calc');
    expect(html).toContain('>5</span>');
  });

  it('fehlerhafte Ausdruecke bleiben roh (Quelltext-Erhalt)', () => {
    const out = convertMarkdownPortable('A {= 2+ =} B\n', true);
    expect(out).toContain('{= 2+ =}');
    expect(out).not.toContain('inline-calc');
  });

  it('Code-Span und Fenced-Code bleiben unangetastet', () => {
    const out = convertMarkdownPortable('A `{= 2+3 =}` B\n\n```\n{= 4+4 =}\n```\n', true);
    expect(out).toContain('`{= 2+3 =}`');
    expect(out).toContain('{= 4+4 =}');
    expect(out).not.toContain('inline-calc');
  });

  it('Escape \\{= bleibt escaped erhalten', () => {
    const out = convertMarkdownPortable('A \\{= 2+3 =} B\n', true);
    expect(out).toContain('\\{= 2+3 =}');
    expect(out).not.toContain('inline-calc');
  });

  it('deaktivierte Erweiterung konvertiert nicht', () => {
    configureExtensions(['inline-calc']);
    const out = convertMarkdownPortable('A {= 2+3 =} B\n', true);
    expect(out).toContain('{= 2+3 =}');
    expect(out).not.toContain('inline-calc');
  });
});

// 4T-001594 (Epic 3E-000129): Beschriftungen des Ereignis-Exports — der dritte
// Lade-Weg des Katalogs (Preload- und Node-Kontext).
//
// Zwei Änderungen, beide vom Product Owner am 2026-09-10 entschieden: Der
// Rückfall bei unbekannter Sprache geht auf Englisch statt auf Deutsch (AK5),
// und eine eingespielte eigene Sprache versorgt den Weg über einen
// mitgegebenen Katalog, weil `src/shared` kein Benutzerprofil kennt.
describe('Portable-Export: Beschriftungen der Ereignis-Tabelle (4T-001594)', () => {
  const EREIGNIS_BLOCK = [
    '```perspective-events',
    '| 2020-01-01 | 2020-06-30 | Projektstart | projekt | Notiz | | | | |',
    '```',
  ].join('\n');

  afterEach(() => {
    configureExtensions([]);
  });

  it('eine unbekannte Sprache fällt auf Englisch zurück, nicht mehr auf Deutsch', () => {
    const out = convertMarkdownPortable(`${EREIGNIS_BLOCK}\n`, true, 'zz');
    expect(out).toContain('Date');
    expect(out).toContain('Event');
    // Die Gegenprobe trägt den Fall: Vor 4T-001594 stand hier Deutsch.
    expect(out).not.toContain('Zeitpunkt');
    expect(out).not.toContain('Ereignis');
  });

  it('eine mitgelieferte Sprache bleibt unverändert bei ihren eigenen Texten', () => {
    const out = convertMarkdownPortable(`${EREIGNIS_BLOCK}\n`, true, 'de');
    expect(out).toContain('Zeitpunkt');
    expect(out).toContain('Ereignis');
  });

  it('ein mitgegebener Katalog versorgt eine eingespielte eigene Sprache', () => {
    const out = convertMarkdownPortable(`${EREIGNIS_BLOCK}\n`, true, 'custom:nds', {
      'events.column.date': 'Tiedpunkt',
      'events.column.text': 'Begeevnis',
    });
    expect(out).toContain('Tiedpunkt');
    expect(out).toContain('Begeevnis');
    expect(out).not.toContain('Date');
    // 4T-001595: Was der Katalog nicht kennt, kommt aus der englischen Fassung
    // statt als roher Schlüssel-Name. Der erwartete Text stammt aus der
    // Sprachdatei, nicht aus der Tastatur — der Wortlaut darf sich ändern, die
    // Aussage nicht.
    expect(out).toContain(EN['events.span.label']);
    expect(out).not.toContain('events.span.label');
  });
});

// 4T-001595 (Epic 3E-000129): Rückfall je Schlüssel auf Englisch im dritten
// Leser. Der Fall ist die eingespielte eigene Sprache, deren Katalog
// unvollständig ist — bei den fünf mitgelieferten, schlüsselgleichen Fassungen
// ist die Kette wirkungslos, und genau das ist die Zusicherung (AK6).
describe('Portable-Export: Rückfall je Beschriftung auf Englisch (4T-001595)', () => {
  const EREIGNIS_BLOCK = [
    '```perspective-events',
    '| 2020-01-01 | 2020-06-30 | Projektstart | projekt | Notiz | | | | |',
    '```',
  ].join('\n');

  afterEach(() => {
    configureExtensions([]);
  });

  it('füllt eine fehlende Beschriftung englisch auf und lässt die übrigen eigen', () => {
    // Der Katalog kennt die Zeitpunkt-Spalte, nicht aber die Dauer-Angabe.
    const out = convertMarkdownPortable(`${EREIGNIS_BLOCK}\n`, true, 'custom:nds', {
      'events.column.date': 'Tiedpunkt',
    });
    expect(out).toContain('Tiedpunkt');
    expect(out).toContain(EN['events.span.label']);
    // AK2: Ein roher Schlüssel-Name erscheint nicht mehr.
    expect(out).not.toContain('events.span.label');
    expect(out).not.toContain('events.column.date');
  });

  it('lässt eine mitgelieferte Fassung unverändert bei ihren eigenen Texten (AK6)', () => {
    const out = convertMarkdownPortable(`${EREIGNIS_BLOCK}\n`, true, 'de');
    expect(out).toContain(DE['events.column.date']);
    expect(out).toContain(DE['events.span.label']);
    // Kein englischer Einschlag: Der Rückfall greift bei schlüsselgleichen
    // Katalogen an keiner Stelle.
    expect(out).not.toContain(EN['events.span.label']);
  });
});

// 4T-001777 (Epic 3E-000291): Die Canvas-Fläche im portablen Export — hier der
// **Integrations-Fall** über `convertMarkdownPortable`; die Ausgabe-Form selbst
// prüft `test/unit/canvas-portabel.test.js`.
//
// Der Fall ist AK5 und AK6 der Story 4S-000951 und damit die Zusage, die der
// Export macht: Eine Verweis-Karte und eine Bild-Karte erscheinen in **genau
// der** Schreibweise, in der derselbe Verweis und dasselbe Bild im übrigen Text
// desselben Exports erschienen. Deshalb steht beides in einem Dokument — einmal
// auf der Karte, einmal im Fließtext — und wird gegeneinander gehalten.
describe('Portable-Export: Verweis- und Bild-Karten der Canvas (4T-001777)', () => {
  const ZIEL = 'Konzepte/Import.md#Zielbild';
  const BILD = 'Anlagen/Skizze.png';
  const DOKUMENT = [
    `Im Fließtext steht [[${ZIEL}]] und dazu ![[${BILD}]].`,
    '',
    '```perspective-canvas',
    `!karte k1 x=0 y=0 b=200 h=100 doc="${ZIEL}"`,
    `!karte k2 x=300 y=0 b=200 h=100 bild="${BILD}"`,
    '```',
    '',
  ].join('\n');

  afterEach(() => {
    configureExtensions([]);
  });

  it('schreibt beide Konstrukte auf der Karte wie im Fließtext', () => {
    const out = convertMarkdownPortable(DOKUMENT, false, 'de');
    // Der Fließtext bleibt unberührt — das ist der Bezugspunkt.
    expect(out).toContain(`Im Fließtext steht [[${ZIEL}]] und dazu ![[${BILD}]].`);
    // Und die Karten benutzen dieselbe Schreibweise: je ein zweites Vorkommen.
    expect(out.split(`[[${ZIEL}]]`)).toHaveLength(3);
    expect(out.split(`![[${BILD}]]`)).toHaveLength(3);
    expect(out).not.toContain('perspective-canvas');
  });
});

// 4T-001833 (Epic 3E-000254): Der Datensatz-Block schließt im Export nach der
// Standard-Regel — dasselbe Zeichen wie der öffnende Zaun, mindestens so lang,
// dahinter nur Leerraum. Bis dahin erkannte der Export allein einen
// Backtick-Zaun, der mit genau derselben Zeile schloss, mit der er öffnete.
describe('Portable-Export: Zaun des Datensatz-Blocks (4T-001833)', () => {
  // Ein Tabellen-Dokument mit frei wählbaren Zaun-Zeilen und zwei Datensätzen.
  function tabelle(oeffnend, schliessend, innen = []) {
    return [
      '---',
      'db-table:',
      '  fields:',
      '    - name: name',
      '    - name: ort',
      '---',
      '',
      oeffnend + 'perspective-records',
      '|- id="r-00001"',
      '| Anna',
      '| Basel',
      ...innen,
      '|- id="r-00002"',
      '| Bert',
      '| Bern',
      schliessend,
      '',
      'Prosa danach.',
      '',
    ].join('\n');
  }

  afterEach(() => {
    configureExtensions([]);
  });

  // 4T-001833: Tilden sind ein gültiger Zaun.
  it('exportiert einen Block mit Tilden-Zaun als Tabelle', () => {
    const out = convertMarkdownPortable(tabelle('~~~', '~~~'), true, 'de');
    expect(out).toContain('<td>Anna</td>');
    expect(out).toContain('<td>Bern</td>');
    expect(out).not.toContain('perspective-records');
  });

  // 4T-001833: Ein längerer schließender Zaun schließt.
  it('exportiert einen Block mit längerem schließenden als öffnenden Zaun als Tabelle', () => {
    const out = convertMarkdownPortable(tabelle('```', '`````  '), true, 'de');
    expect(out).toContain('<td>Anna</td>');
    expect(out).toContain('<td>Bern</td>');
    expect(out).not.toContain('perspective-records');
    expect(out).toContain('Prosa danach.');
  });

  // 4T-001833: Eine kürzere innere Zaun-Zeile beendet den Block nicht.
  it('lässt den Block nicht an einer kürzeren inneren Zaun-Zeile enden', () => {
    const out = convertMarkdownPortable(
      tabelle('````', '````', ['```', 'code', '```']),
      true,
      'de',
    );
    expect(out).toContain('<td>Basel<br>```<br>code<br>```</td>');
    expect(out).toContain('<td>Bert</td>');
    expect(out).not.toContain('perspective-records');
  });
});

// 4T-002072 (Epic 3E-000192): Trägt eine Datentabelle ihren Namen in der
// Kopf-Angabe `table:`, folgt im Export der gewöhnlichen Tabelle nach einer
// Leerzeile die Zeile `^Name`, damit Verweise im exportierten Dokument ihr Ziel
// behalten. Wo die Tabelle Code-Block bleibt — Namens-Fehler, Tilden-Zaun,
// Erweiterung aus —, steht die Kopf-Angabe darin, und eine Zeile kommt nicht
// dazu (Bestand des Exports).
describe('Portable-Export: Name der Datentabelle aus der Kopf-Angabe (4T-002072)', () => {
  function dokument(oeffnend, schliessend, angabe) {
    return [
      '# Umsatz',
      '',
      oeffnend + 'perspective-datatable',
      angabe,
      'columns: Monat:text, Betrag:number',
      '| Januar | 100 |',
      schliessend,
      '',
      'Schluss.',
      '',
    ].join('\n');
  }

  afterEach(() => {
    configureExtensions([]);
  });

  it('hängt nach der Tabelle eine Leerzeile und ^Umsatz an; wieder gelesen ein leerer Träger', () => {
    const out = convertMarkdownPortable(dokument('```', '```', 'table: Umsatz'), true, 'de');
    expect(out).toContain('</table>\n\n^Umsatz\n\nSchluss.');
    expect(out).not.toContain('table: Umsatz');
    // Am Lese-Ende: eigener Absatz mit der Kennung, der Name nicht als Text.
    const html = renderMarkdown(out, 'de');
    expect(html).toContain('<p id="Umsatz"></p>');
    expect(html).not.toContain('^Umsatz');
  });

  // Nachbesserung F5: Steht unter der Tabelle schon `^Umsatz`, kommt keine
  // zweite Zeile dazu — auch hinter einem Frontmatter, das der Export vor der
  // Fence-Konvertierung abschneidet.
  it('Kopf-Name und Zeile ^Umsatz darunter: die Zeile steht genau einmal', () => {
    const quelle = '---\ntitel: X\n---\n' + dokument('```', '```', 'table: Umsatz');
    const mitZeile = quelle.replace('```\n\nSchluss.', '```\n^Umsatz\n\nSchluss.');
    const out = convertMarkdownPortable(mitZeile, true, 'de');
    expect(out.match(/\^Umsatz/g)).toHaveLength(1);
    expect(out).toContain('</table>\n\n^Umsatz\n\nSchluss.');
    expect(renderMarkdown(out, 'de').match(/ id="Umsatz"/g)).toHaveLength(1);
  });

  it('eine Tabelle ohne Namen bekommt keine Zeile', () => {
    const out = convertMarkdownPortable(dokument('```', '```', ''), true, 'de');
    expect(out).toContain('</table>');
    expect(out).not.toContain('^');
  });

  it('mit Namens-Fehler, im Tilden-Zaun und bei ausgeschalteter Erweiterung bleibt der Code-Block', () => {
    const fehler = dokument('```', '```', 'table: Umsatz 2026');
    expect(convertMarkdownPortable(fehler, true, 'de')).toContain(fehler);
    const tilde = dokument('~~~', '~~~', 'table: Umsatz');
    expect(convertMarkdownPortable(tilde, true, 'de')).toContain(tilde);
    configureExtensions(['perspective-datatable']);
    const aus = dokument('```', '```', 'table: Umsatz');
    const out = convertMarkdownPortable(aus, true, 'de');
    expect(out).toContain(aus);
    expect(out).not.toContain('^Umsatz');
  });
});
