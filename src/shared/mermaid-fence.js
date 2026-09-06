// 4T-001471 (Epic 3E-000178): Electron-freier Kern der Mermaid-Fence-Behandlung
// im portablen Export — Erkennung der Fences und die Ersetzung ihres Quelltextes
// durch ein fertiges Bild.
//
// Bewusst ohne DOM, ohne Mermaid und ohne Renderer-Zugriff: Der rechnende Teil
// (welche Stelle im Text ist ein Diagramm, was tritt an ihre Stelle) ist damit
// ohne laufendes Programm pruefbar; das Zeichnen selbst liegt beim Aufrufer.
// Muster: src/shared/journal-timeline-core.js, der Kern der zweiten
// Fence-Ersetzung desselben Exports.
'use strict';

// Fence-Erkennung mit Koerper. Der Koerper laeuft zeilenweise ueber einen
// tempered-greedy-Ausdruck (jede Zeile, die nicht die Schliess-Zeile ist); ein
// lazy [\s\S]*? wuerde bei leerem Koerper bis zur Schliess-Zeile des NAECHSTEN
// Fences ueberspannen. Uebernommen vom Timeline-Kern, dort begruendet.
//
// Der Info-String wird bewusst nur bis zum ersten Zeilenende gelesen: Der
// Renderer erkennt Diagramme an `code.language-mermaid`, also am ersten Wort;
// weitere Angaben dahinter (etwa Attribut-Bloecke) aendern daran nichts.
const MERMAID_FENCE_RE =
  /^ {0,3}(`{3,})mermaid[^\n]*\n((?:(?! {0,3}\1[ \t]*$)[^\n]*\n)*) {0,3}\1[ \t]*$/gm;

// Enthaelt der Text ueberhaupt einen Mermaid-Fence? Spart dem Export das Laden
// der Mermaid-Bibliothek und den verborgenen Container, wenn nichts zu tun ist.
function hasMermaidFence(text) {
  MERMAID_FENCE_RE.lastIndex = 0;
  return MERMAID_FENCE_RE.test(String(text == null ? '' : text));
}

// Sammelt die Quelltexte aller Mermaid-Fences in Textreihenfolge. Der Aufrufer
// zeichnet sie und reicht die Ergebnisse an replaceMermaidFences zurueck.
// Duplikate bleiben erhalten: Zwei gleiche Diagramme sind zwei Fences.
function collectMermaidSources(text) {
  const source = String(text == null ? '' : text);
  const out = [];
  MERMAID_FENCE_RE.lastIndex = 0;
  let treffer;
  while ((treffer = MERMAID_FENCE_RE.exec(source)) !== null) {
    out.push(String(treffer[2] == null ? '' : treffer[2]));
  }
  return out;
}

// Ersetzt jeden Mermaid-Fence durch das, was `build(body)` liefert. Liefert
// build null oder undefined, bleibt der Fence unveraendert stehen — der Weg fuer
// ein fehlerhaftes Diagramm und fuer den Aus-Zustand der Erweiterung (Epic-
// Entscheidung E4: der Empfaenger sieht dann Quelltext statt einer Fehlermeldung).
//
// WICHTIG: Der Ersatz kommt aus einer Callback-FUNKTION und nie aus einem
// Ersetzungs-TEXT. In einem Ersetzungs-Text von String.replace sind `$`-Folgen
// Sonderzeichen; ein SVG-String, der eine solche Folge enthaelt, wuerde still
// verstuemmelt oder aufgeblaeht. Am 2026-09-05 hat genau dieser Mechanismus
// eine Aufgaben-Datei verdoppelt (Fehlerklasse L7, Beleg 4T-001423). Der
// Rueckgabewert eines Callbacks ist davon nicht betroffen.
function replaceMermaidFences(text, build) {
  const source = String(text == null ? '' : text);
  MERMAID_FENCE_RE.lastIndex = 0;
  return source.replace(MERMAID_FENCE_RE, (ganzer, _zaun, body) => {
    const ersatz = build(String(body == null ? '' : body));
    return ersatz == null ? ganzer : String(ersatz);
  });
}

// Das eingebrannte Bild als Bild-Element mit Data-Adresse.
//
// ENTSCHEIDUNG D (Product Owner, 2026-09-05), die einen Teil von E2 zuruecknimmt.
// Zuerst stand hier das SVG als rohes inline HTML. Beim erneuten Oeffnen der
// exportierten Datei verschwand das Diagramm spurlos: Die Datei traegt den
// Marker 'perspective-portable', der den Whitelist-Sanitizer P-02 scharf
// schaltet, und dessen bewusst enge Liste kennt kein <svg>. Uebrig blieb ein
// leerer Block — schlechter als der Zustand vor dem Epic, in dem der Fence
// stehenblieb und die Anwendung ihn zeichnete.
//
// Warum ein Bild-ELEMENT und nicht die Markdown-Bildsyntax: markdown-it weist
// in seiner eingebauten Link-Pruefung Data-Adressen ab, ausser fuer gif, png,
// jpeg und webp — svg+xml gehoert nicht dazu. Ueber die Bildsyntax kaeme das
// Diagramm also gar nicht erst ins Dokument (am 2026-09-05 gemessen: null
// Bilder in der Anzeige). Das Bild-Element umgeht diese Pruefung nicht heimlich:
// Es traegt seinen Preis, naemlich den Eintrag 'img' in der Whitelist, und dort
// ist die Adresse auf eingebettete Bilder beschraenkt.
//
// Die Sicherheits-Eigenschaft, die den Weg traegt: Ein SVG, das ueber ein Bild
// geladen wird, fuehrt in keinem Browser Skripte aus — anders als ein inline
// eingesetztes SVG. Preis ist die Base64-Aufblaehung um rund ein Drittel.
//
// Base64 ueber die UTF-8-Bytes, nicht ueber die Zeichen: Ein Diagramm mit
// Umlauten in den Beschriftungen wuerde sonst beim Kodieren scheitern.
function mermaidSvgBlock(svgHtml, altText) {
  const svg = String(svgHtml == null ? '' : svgHtml).trim();
  if (!svg) return null;
  const bytes = new TextEncoder().encode(svg);
  let binaer = '';
  for (const b of bytes) binaer += String.fromCharCode(b);
  // Anfuehrungszeichen im Alt-Text wuerden aus dem Attribut ausbrechen.
  const alt = String(altText == null || altText === '' ? 'Diagramm' : altText)
    .split(String.fromCharCode(34))
    .join('');
  return `<img alt="${alt}" src="data:image/svg+xml;base64,${btoa(binaer)}">\n`;
}

// Erkennt ein von Mermaid erzeugtes Fehler-SVG. Mermaid zeichnet bei
// fehlerhaftem Quelltext ein eigenes Bild und markiert es so; dieselbe Pruefung
// nutzt der Renderer beim Anzeigen (render-mermaid.js).
function istFehlerSvg(svgHtml) {
  const svg = String(svgHtml == null ? '' : svgHtml);
  return !svg.trim() || /aria-roledescription="error"/.test(svg);
}

module.exports = {
  MERMAID_FENCE_RE,
  hasMermaidFence,
  collectMermaidSources,
  replaceMermaidFences,
  mermaidSvgBlock,
  istFehlerSvg,
};
