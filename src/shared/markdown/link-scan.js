// 4T-0344 (Epic 3E-0062): Gemeinsame Erkennungs-Quelle fuer Wiki-Links und
// relative Markdown-Links. Single Source of Truth fuer die Link-Regexe, die
// Inline-Code-Maskierung, die Frontmatter-Grenze und die Namens-Normalisierung.
// Backlinks-Index (src/main/backlinks.js) UND Rewrite-Kern
// (src/shared/link-rewrite.js) lesen ausschliesslich hieraus, damit sie
// dieselben Stellen als Link erkennen. Divergenz zwischen Index und Rewrite war
// das Haupt-Risiko der Konzept-Diskussion: schreibt der Rewrite nach anderen
// Regeln um als der Index Kandidaten meldet, trifft er Stellen, die keine Links
// sind, oder uebersieht welche. Electron-frei, rein auf Strings (Vorbild:
// src/shared/markdown/slug.js, src/shared/subpages.js).
'use strict';

// Markdown-Datei-Endungen (Basename-Suffix, case-insensitiv).
const MD_EXT_RE = /\.(md|markdown|mdown|mkd)$/i;

// Fenced-Code-Block-Marker (```+ oder ~~~+, bis zu drei fuehrende Spaces).
const FENCE_RE = /^\s{0,3}(```+|~~~+)/;

// Frontmatter-Schluss-Zeile: '---' oder '...' am exakten Zeilenanfang. Zusammen
// mit einem '---' in Zeile 1 grenzt das den YAML-Block ab. Halt-Heuristik
// identisch zu extractFrontmatter (src/shared/markdown/frontmatter.js), damit
// der zeilenweise Scan denselben Block-Bereich erkennt wie der Render-Pfad.
const FRONTMATTER_END_LINE = /^(---|\.\.\.)\s*$/;

// Wiki-Link: [[Foo]] oder [[Foo|Label]]. Ziel-Gruppe non-greedy bis ]] oder zur
// ersten Pipe. Mehrere Treffer pro Zeile moeglich, daher das g-Flag. Als Factory
// (frische Instanz je Aufruf), damit kein lastIndex-State zwischen Backlinks-
// Parser und Rewrite-Kern geteilt wird.
function createWikiLinkRegex() {
  return /\[\[([^\]\n|]+?)(?:\|[^\]\n]*)?\]\]/g;
}

// Relative Markdown-Links: [Text](pfad.md) oder (pfad.md#anker). Nur .md-artige
// Endungen; externe Schemata (http:, mailto:, data:) faengt das Muster nicht.
// 4T-0476 (Epic 3E-0088): zusätzlich die CommonMark-Destination in spitzen
// Klammern ([Text](<Mein Ziel.md>) bzw. (<Mein Ziel.md#anker>)), die
// Leerzeichen im Ziel erlaubt. Gruppen 1/2 = Ziel/Anker der <…>-Form,
// Gruppen 3/4 = Ziel/Anker der klammerlosen Form; Konsumenten lesen über
// mdLinkTargetFromMatch statt roher Gruppen-Indizes.
function createMdLinkRegex() {
  return /\[[^\]\n]*\]\((?:<([^<>\n]+?\.(?:md|markdown|mdown|mkd))(?:#([^<>\n]*))?>|([^)\s#?]+\.(?:md|markdown|mdown|mkd))(?:#([^)\s]+))?)\)/gi;
}

// Ziel, Anker und Schreibform aus einem createMdLinkRegex-Match lesen.
// angle=true kennzeichnet die <…>-Form (Ziel roh, Leerzeichen möglich).
function mdLinkTargetFromMatch(m) {
  if (m[1] !== undefined) {
    return { target: m[1], anchor: m[2] || null, angle: true };
  }
  return { target: m[3], anchor: m[4] || null, angle: false };
}

// Vergleichs-Schluessel fuer Datei-/Wiki-Namen. NTFS ist case-insensitiv und
// Dateinamen koennen NFD-dekomponiert sein; Index, Linter, Klick-Pfad und
// Rewrite muessen gleich entscheiden.
function normalizeNameKey(s) {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase();
}

// Inline-Code-Spans einer Zeile maskieren (durch Spaces gleicher Laenge ersetzt,
// damit die Zeichen-Offsets erhalten bleiben). Zwei Paesse: zuerst Doppel-
// Backticks (lazy, fuer ``code mit ` darin``), dann Single-Backticks. Die
// Reihenfolge ist wichtig, weil ein Single-Pass allein die inneren Single-
// Backticks eines Doppel-Backtick-Spans missdeutet und den Inhalt unmaskiert
// laesst. Der Aufrufer scannt Links auf der maskierten Zeile und ersetzt an
// denselben Offsets im Original, sodass [[Beispiel]] in Inline-Code weder als
// Backlink zaehlt noch umgeschrieben wird.
function maskInlineCode(line) {
  return String(line)
    .replace(/``(?:[^`\n]|`(?!`))+?``/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
}

// 0-basierter Index der ersten Body-Zeile nach dem YAML-Frontmatter, oder 0,
// wenn kein Frontmatter erkannt wird. Erkennung: '---' in Zeile 1 (nur Trailing-
// Whitespace erlaubt), Schluss ueber FRONTMATTER_END_LINE. Ein oeffnendes '---'
// ohne Schluss ist regulaere Markdown-Trennlinie, kein Frontmatter (return 0).
// Der YAML-Block liegt bei erkanntem Frontmatter in lines[1 .. return-2] (die
// Schluss-Zeile bei return-1 ist ausgeschlossen).
function frontmatterBodyStart(lines) {
  if (lines.length >= 2 && lines[0].trimEnd() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (FRONTMATTER_END_LINE.test(lines[i])) return i + 1;
    }
  }
  return 0;
}

module.exports = {
  MD_EXT_RE,
  FENCE_RE,
  FRONTMATTER_END_LINE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
  normalizeNameKey,
  maskInlineCode,
  frontmatterBodyStart,
};
