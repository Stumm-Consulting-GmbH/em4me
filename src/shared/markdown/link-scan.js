// 4T-000344 (Epic 3E-000062): Gemeinsame Erkennungs-Quelle fuer Wiki-Links und
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

// 4T-001451 (Epic 3E-000190): Verknuepfungs-Links `[[@kuerzel:Ziel]]` zeigen aus
// dem Bereich hinaus. Fuer Index, Backlinks und Nachfuehrung sind sie KEIN
// lokales Ziel: Die eingehende Richtung bleibt in Stufe 1 ausdruecklich
// draussen (Entscheidung E3), und die Nachfuehrung traegt ohnehin nicht ueber
// die Bereichs-Grenze (E5). Die Konsumenten des Wiki-Musters ueberspringen sie
// deshalb, statt sie als Datei-Namen zu deuten.
const { isAreaLinkTarget, splitAreaLink } = require('../area-link-syntax.js');

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
// 4T-000476 (Epic 3E-000088): zusätzlich die CommonMark-Destination in spitzen
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

// Vergleichs-Schluessel des logischen WIKI-NAMENSRAUMS, nicht der Datei-
// Identitaet: Ein Verweis [[readme]] soll README.md treffen, und Dateinamen
// koennen NFD-dekomponiert sein; Index, Linter, Klick-Pfad und Rewrite muessen
// gleich entscheiden.
//
// 4T-001275 (Epic 3E-000232): Die Faltung bleibt hier bewusst plattform-unabhaengig
// und fragt src/shared/platform.js NICHT. Sie ist keine Aussage ueber das
// Dateisystem — der Beleg dafuer steht in resolve.js (B-04/B-23 aus 4T-000175:
// der Linter meldete [[readme]] als gebrochen, obwohl der Klick README.md
// oeffnete) und in der NFC-Normalisierung eine Zeile weiter, die mit der
// Plattform nichts zu tun hat. Der frueher hier stehende Verweis auf NTFS war
// die falsche Begruendung fuer ein richtiges Verhalten. Dieselbe Abgrenzung
// wie in src/main/index/profil-verweis-ziele.js.
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

// --- Verweis-Angaben der Canvas-Karten (4T-001749, Epic 3E-000289) ------------
//
// Drei Stellen müssen dieselbe Angabe erkennen: der Verweis-Parser des
// Bereichs-Index (src/main/index/parse.js), die ausgehenden Verweise der
// offenen Datei (src/renderer/modules/panels/panel-outgoing.js) und der
// Umbenennungs-Nachzug (src/shared/link-rewrite.js). Dreimal dieselbe Regel an
// drei Orten laufen unweigerlich auseinander — genau der Grund, aus dem dieses
// Modul überhaupt entstanden ist.
//
// **Warum der Canvas-Kern hier nicht geladen wird** (Entscheidung 4T-001749).
// `src/shared/canvas/canvas-core.js` liest dieselbe Attribut-Grammatik, und
// naheliegend wäre, ihn einfach zu benutzen. Dagegen sprechen drei Gründe:
// Der Kern bringt das ganze Element-Modell, die Befund-Semantik und den
// Serialisierer mit, während hier **eine** Angabe einer Marker-Zeile gebraucht
// wird — und der Bereichs-Index läuft über jede Datei jedes Bereichs. Dieses
// Modul ist bewusst abhängigkeits-arm (eine einzige Abhängigkeit, die
// Verknüpfungs-Syntax), und es ist die Erkennungs-Schicht **unter** den
// Fachlichkeiten; hinge sie am Canvas-Kern, wäre der Canvas-Kern eine
// Abhängigkeit des Backlinks-Index und des Rewrite-Kerns. Und es gälte in
// beide Richtungen, denn der Kern lädt seinerseits den Endungs-Satz.
//
// **Was die Zusage «dieselbe Grammatik» trägt, ist kein Versprechen, sondern
// ein Wächter:** `tokenisiereMitOffsets` ist die Zerlegung aus dem Kern
// (`tokenisiere`) um die Zeichen-Position je Token erweitert,
// `kartenVerweisWert` sein `entpackeWert`, und ein Prüffall hält beide Leser
// über einer Tabelle von Marker-Zeilen gegeneinander.

// Info-Zeichenfolge der Fläche. Sie steht hier, weil drei Scanner dieselbe
// Fence erkennen müssen; der Kern führt sie für seinen eigenen Gebrauch.
const CANVAS_FENCE_INFO = 'perspective-canvas';

// Trägt die Info-Zeichenfolge einer Fence die Canvas-Marke? Gelesen wird das
// erste Wort, wie es der Mindmap-Kern für dieselbe Fence tut; der Aufrufer
// schneidet den Fence-Marker selbst ab (er kennt seine eigene Fence-Regex).
function istCanvasFenceInfo(info) {
  return (
    String(info || '')
      .trim()
      .split(/\s+/)[0] === CANVAS_FENCE_INFO
  );
}

// Marker-Zeile einer Karte: `!karte` in Spalte 0, gefolgt von Leerraum oder
// Zeilen-Ende. Die Grammatik des Kerns verlangt die Spalte 0 ausdrücklich, und
// eine Inhalts-Zeile, die selbst so beginnen soll, trägt einen Rückstrich.
const KARTEN_MARKER_RE = /^!karte(?=[ \t]|$)/;

// Die beiden Verweis-Angaben der Karte (G7, G8 der Canvas-Grammatik).
const KARTEN_VERWEIS_NAMEN = ['doc', 'bild'];

// Zeilen-Inhalt ohne das CRLF-Artefakt, für alles Prüfende.
function ohneCr(zeile) {
  const text = String(zeile == null ? '' : zeile);
  return text.endsWith('\r') ? text.slice(0, -1) : text;
}

// Zerlegung der Marker-Zeile in Tokens, wörtlich nach `tokenisiere` des
// Canvas-Kerns: Ein Wert ist entweder ein Wort ohne Leerraum oder eine
// Zeichenkette in doppelten Anführungszeichen mit `\"` und `\\` als Escapes.
// Zusätzlich wird die Anfangs-Position jedes Tokens mitgeführt — der
// Umbenennungs-Nachzug ersetzt eine Spanne und darf die übrige Zeile nicht
// anfassen.
function tokenisiereMitOffsets(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const start = i;
    let tok = '';
    let inQuote = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQuote) {
        if (ch === '\\' && i + 1 < text.length) {
          tok += ch + text[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inQuote = false;
        tok += ch;
        i++;
        continue;
      }
      if (/\s/.test(ch)) break;
      if (ch === '"') inQuote = true;
      tok += ch;
      i++;
    }
    tokens.push({ text: tok, start });
  }
  return tokens;
}

// Wert einer Angabe auspacken, wörtlich nach `entpackeWert` des Canvas-Kerns.
function kartenVerweisWert(roh) {
  const text = String(roh == null ? '' : roh);
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return text;
}

// Wert einer Angabe einpacken. `quotiert` erhält die Schreibform des Bestands:
// Der Nachzug ist eine Berichtigung und kein Umbau — er fasst genau die eine
// Angabe an und schreibt sie in der Form zurück, in der sie dastand, solange
// die neue Zeichenkette ohne Anführungszeichen gültig bleibt.
function packeKartenVerweisWert(wert, { quotiert = true } = {}) {
  const text = String(wert == null ? '' : wert);
  if (!quotiert && text !== '' && !/[\s"\\=]/.test(text)) return text;
  return '"' + text.replace(/([\\"])/g, '\\$1') + '"';
}

/**
 * Verweis-Angaben einer Karten-Marker-Zeile (4T-001749).
 *
 * Der Aufrufer stellt sicher, dass die Zeile in einer Fence `perspective-canvas`
 * steht; hier fällt allein die Form auf. Geliefert werden **alle** Vorkommen in
 * Dokument-Reihenfolge. Wer nur den wirksamen Wert braucht, nimmt das **letzte**
 * Vorkommen je Name — so entscheidet der Kern, dessen `attrs` beim zweiten
 * Vorkommen überschreibt.
 *
 * @param {string} zeile Die zu prüfende Zeile.
 * @returns {Array<object>} je Angabe `{ name, wert, rohWert, nameStart, rohStart, rohLen, quotiert }`.
 */
function scanneKartenVerweise(zeile) {
  const text = ohneCr(zeile);
  const marker = text.match(KARTEN_MARKER_RE);
  if (!marker) return [];
  const treffer = [];
  const versatz = marker[0].length;
  for (const tok of tokenisiereMitOffsets(text.slice(versatz))) {
    const gleich = tok.text.indexOf('=');
    // Dieselbe Bedingung wie im Kern: ein '=' an Position 0 ist kein Name, und
    // ein Anführungszeichen im Namens-Teil ist keine Angabe, sondern ein Operand.
    if (gleich <= 0 || tok.text.slice(0, gleich).includes('"')) continue;
    const name = tok.text.slice(0, gleich);
    if (!KARTEN_VERWEIS_NAMEN.includes(name)) continue;
    const rohWert = tok.text.slice(gleich + 1);
    const wert = kartenVerweisWert(rohWert);
    // Ein leerer Wert ist im Kern ein Befund und trägt keinen Verweis; hier ist
    // er schlicht kein Treffer.
    if (wert.trim() === '') continue;
    treffer.push({
      name,
      wert,
      rohWert,
      nameStart: versatz + tok.start,
      rohStart: versatz + tok.start + gleich + 1,
      rohLen: rohWert.length,
      quotiert: rohWert.length >= 2 && rohWert.startsWith('"') && rohWert.endsWith('"'),
    });
  }
  return treffer;
}

/**
 * Beschriftung der Karte, deren Marker in `zeilen[markerIndex]` steht.
 *
 * Die Inhalts-Zeilen unter dem Marker sind der eigene Text der Karte (G7/G8);
 * als Ausschnitt eines Treffers genügt ihre erste nicht-leere Zeile. Der
 * Rückstrich-Schutz einer Inhalts-Zeile, die selbst mit `!` beginnt, wird dabei
 * aufgelöst wie im Kern.
 *
 * @param {Array<string>} zeilen Alle Zeilen des Dokuments.
 * @param {number} markerIndex 0-basierter Index der Marker-Zeile.
 * @returns {string} die Beschriftung oder eine leere Zeichenkette.
 */
function kartenBeschriftung(zeilen, markerIndex) {
  if (!Array.isArray(zeilen)) return '';
  for (let i = markerIndex + 1; i < zeilen.length; i++) {
    const zeile = ohneCr(zeilen[i]);
    // Die Fence endet, oder das nächste Element beginnt: Die Karte hat keine
    // weiteren Inhalts-Zeilen.
    if (FENCE_RE.test(zeile)) return '';
    if (/^![A-Za-z]/.test(zeile)) return '';
    if (zeile.trim() === '') continue;
    return /^\\+!/.test(zeile) ? zeile.slice(1) : zeile;
  }
  return '';
}

module.exports = {
  MD_EXT_RE,
  // 4T-001451 (Epic 3E-000190): weitergereicht aus src/shared/area-link-syntax.js,
  // damit die Konsumenten des Wiki-Musters die Verknuepfungs-Form an derselben
  // Stelle bekommen wie das Muster selbst.
  isAreaLinkTarget,
  splitAreaLink,
  FENCE_RE,
  FRONTMATTER_END_LINE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
  normalizeNameKey,
  maskInlineCode,
  frontmatterBodyStart,
  // 4T-001749 (Epic 3E-000289): die geteilte Erkennung der Verweis-Angaben
  // einer Canvas-Karte. Index, ausgehende Verweise und Umbenennungs-Nachzug
  // lesen ausschliesslich hieraus.
  CANVAS_FENCE_INFO,
  istCanvasFenceInfo,
  KARTEN_MARKER_RE,
  KARTEN_VERWEIS_NAMEN,
  scanneKartenVerweise,
  kartenVerweisWert,
  packeKartenVerweisWert,
  kartenBeschriftung,
  // 4T-001749: Die Typen, deren Ziel ueber einen NAMEN aufgeloest wird
  // (Namens-, Pfad- und Unterseiten-Form des Index) statt ueber einen
  // absoluten Pfad. Der Karten-Verweis traegt seinen eigenen Typ, damit die
  // Herkunft «aus einer Flaeche» bis in die Anzeige sichtbar bleibt; aufgeloest
  // wird er wie ein Wiki-Ziel. Die Menge steht hier, weil Kanten-Bau und
  // Rueckverweise sie unabhaengig voneinander lesen.
  NAMENS_LINK_TYPEN: new Set(['wiki', 'canvas']),
};
