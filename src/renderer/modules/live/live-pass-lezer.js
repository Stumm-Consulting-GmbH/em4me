// Lezer-Baum-Pass des Live-Modus: Betonung, Inline-Code, Links, ATX- und
// Setext-Überschriften, Blockquotes, Listen-Einstieg und Bilder.
// 4T-0996 (Epic 3E-0196): erster Pass der zerlegten Kernfunktion aus
// live-widgets.js. Rumpf unverändert übernommen; der Kontext kommt als
// Objekt statt über Closures. Der Listen-/Aufgaben-Zweig liegt wegen des
// Datei-Budgets in live-pass-tasks.js.
'use strict';

import { Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  liveBlockquoteLineDeco,
  liveBoldDeco,
  liveCodeDeco,
  liveHeadingLineDecos,
  liveItalicDeco,
  liveLinkMarkDeco,
  liveMarkerHiddenDeco,
  liveSetextUnderlineLineDeco,
  liveStrikeDeco,
} from './live-deco.js';
import { HeadingNumberWidget } from './live-heading-numbers.js';
import { runListItemPass } from './live-pass-tasks.js';
import {
  LIVE_HEADING_ATTRS_RE,
  LIVE_HEADING_MARKER_RE,
  imageIsStandalone,
  stripAngleDestination,
} from './live-scans.js';
import { nodeInsideCode } from './live-shared.js';
import { ImageWidget } from './live-widget-render.js';

// 4T-0996: Lezer-Pass eines Sichtbereichs. Der Kontext trägt die einmal je
// Build ermittelten Werte; die Knoten-Verzweigungen darunter sind
// unverändert aus der früheren Kernfunktion übernommen.
export function runLezerPass(ctx) {
  const { state, ranges, activeLines, basePath, frontmatterEndLine } = ctx;
  const { calloutLines, headingNumberByLine, from, to } = ctx;
  // === Lezer-Pass: StrongEmphasis, Emphasis, Strikethrough, InlineCode ===
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      // W-12 (4T-0309): Fehler-Isolation pro Knoten. Wirft die Verarbeitung
      // eines einzelnen Konstrukts (komplexes Kind-Walking), soll nur dieser
      // Knoten uebersprungen werden — nicht der gesamte Live-Decoration-Build
      // scheitern (sonst faellt der Live-Modus fuer das ganze Update auf
      // Roh-Quelltext zurueck).
      try {
        const name = node.name;
        if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
          if (nodeInsideCode(node)) return;
          const lineNo = state.doc.lineAt(node.from).number;
          // R1-11 (4T-0186): Frontmatter-Zeilen nicht dekorieren (Parity
          // zum markdown-it-Pfad, der den Block separat verarbeitet).
          if (lineNo <= frontmatterEndLine) return;
          if (activeLines.has(lineNo)) return;
          const styleDeco =
            name === 'StrongEmphasis'
              ? liveBoldDeco
              : name === 'Emphasis'
                ? liveItalicDeco
                : liveStrikeDeco;
          const markerName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
          const markers = [];
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === markerName) markers.push({ from: inner.from, to: inner.to });
            inner = inner.nextSibling;
          }
          if (markers.length !== 2) return;
          const contentFrom = markers[0].to;
          const contentTo = markers[1].from;
          if (contentTo <= contentFrom) return;
          ranges.push(liveMarkerHiddenDeco.range(markers[0].from, markers[0].to));
          ranges.push(styleDeco.range(contentFrom, contentTo));
          ranges.push(liveMarkerHiddenDeco.range(markers[1].from, markers[1].to));
          return;
        }
        if (name === 'InlineCode') {
          if (nodeInsideCode(node)) return;
          const lineNo = state.doc.lineAt(node.from).number;
          // R1-11 (4T-0186): Frontmatter ausklammern.
          if (lineNo <= frontmatterEndLine) return;
          if (activeLines.has(lineNo)) return;
          const markers = [];
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === 'CodeMark') markers.push({ from: inner.from, to: inner.to });
            inner = inner.nextSibling;
          }
          if (markers.length !== 2) return;
          const contentFrom = markers[0].to;
          const contentTo = markers[1].from;
          if (contentTo <= contentFrom) return;
          ranges.push(liveMarkerHiddenDeco.range(markers[0].from, markers[0].to));
          ranges.push(liveCodeDeco.range(contentFrom, contentTo));
          ranges.push(liveMarkerHiddenDeco.range(markers[1].from, markers[1].to));
          return;
        }
        if (name === 'Link') {
          // 4T-0082: Markdown-Link `[Text](url)`. Knoten-Kinder sind in
          // Reihenfolge LinkMark `[`, Label-Inhalt, LinkMark `]`,
          // LinkMark `(`, URL, ggf. LinkTitle, LinkMark `)`. Wir
          // verstecken die vier LinkMarks und den (...)-Bereich, der
          // Inhalt zwischen `[` und `]` bekommt cm-live-link-Klasse.
          if (nodeInsideCode(node)) return;
          const lineNo = state.doc.lineAt(node.from).number;
          // R1-11 (4T-0186): Frontmatter ausklammern.
          if (lineNo <= frontmatterEndLine) return;
          if (activeLines.has(lineNo)) return;
          const linkMarks = [];
          let urlFrom = -1;
          let urlTo = -1;
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === 'LinkMark') {
              linkMarks.push({ from: inner.from, to: inner.to });
            } else if (inner.name === 'URL') {
              urlFrom = inner.from;
              urlTo = inner.to;
            }
            inner = inner.nextSibling;
          }
          if (linkMarks.length < 4 || urlFrom < 0) return;
          const contentFrom = linkMarks[0].to;
          const contentTo = linkMarks[1].from;
          if (contentTo <= contentFrom) return;
          const url = stripAngleDestination(state.doc.sliceString(urlFrom, urlTo));
          ranges.push(liveMarkerHiddenDeco.range(linkMarks[0].from, linkMarks[0].to));
          ranges.push(liveLinkMarkDeco(url, false).range(contentFrom, contentTo));
          ranges.push(liveMarkerHiddenDeco.range(linkMarks[1].from, linkMarks[1].to));
          // `(url)` als zusammenhaengender Block versteckt: von der
          // oeffnenden `(`-LinkMark bis zur schliessenden `)`-LinkMark.
          ranges.push(
            liveMarkerHiddenDeco.range(linkMarks[2].from, linkMarks[linkMarks.length - 1].to),
          );
          return;
        }
        // 4T-0083: ATX-Headings (`# ... ` bis `###### ...`). Lezer-Knoten
        // heisst ATXHeading1..ATXHeading6, Level steckt im Namen. Wir setzen
        // Decoration.line auf die Heading-Zeile (Font-Groesse via CSS) und
        // verstecken in Nicht-Cursor-Zeile den HeaderMark (`#`-Folge) plus
        // das folgende Whitespace — sonst rueckt der gerenderte Text um ein
        // Spatium ein.
        const atxMatch = name.match(/^ATXHeading([1-6])$/);
        if (atxMatch) {
          const level = parseInt(atxMatch[1], 10);
          const headingLine = state.doc.lineAt(node.from);
          if (headingLine.number <= frontmatterEndLine) return;
          ranges.push(liveHeadingLineDecos[level - 1].range(headingLine.from));
          if (activeLines.has(headingLine.number)) return;
          // 4T-0471 (Epic 3E-0087): berechnete Nummer als Inline-Widget vor
          // der Zeile (Vorbild CalloutIconWidget); nur auf inaktiven Zeilen.
          const headingNum = headingNumberByLine
            ? headingNumberByLine.get(headingLine.number)
            : null;
          if (headingNum) {
            ranges.push(
              Decoration.widget({
                widget: new HeadingNumberWidget(headingNum),
                side: -1,
              }).range(headingLine.from),
            );
          }
          let headerMarkEnd = -1;
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === 'HeaderMark') {
              headerMarkEnd = inner.to;
              break;
            }
            inner = inner.nextSibling;
          }
          if (headerMarkEnd < 0) return;
          const tail = state.doc.sliceString(headerMarkEnd, headingLine.to);
          const wsMatch = tail.match(/^[ \t]+/);
          const hideTo = headerMarkEnd + (wsMatch ? wsMatch[0].length : 0);
          ranges.push(liveMarkerHiddenDeco.range(node.from, hideTo));
          // 4T-0202: trailing {#id}/{.klasse}-Attribut-Block ausblenden
          // (der Render strippt ihn aus dem Heading-Text). 4T-0293: nur
          // bei aktiver attributes-Erweiterung.
          const headingText = state.doc.sliceString(headingLine.from, headingLine.to);
          // 4T-0471 (Epic 3E-0087): echten {-}/{+}-Marker verstecken (wenn
          // die Nummerierung aktiv ist); sonst wie bisher den Attribut-Block.
          // Bei beidem gewinnt der Marker am Zeilenende (Rand-Fall {#id} {-}).
          const markerMatch = isExtensionActive('heading-numbering')
            ? headingText.match(LIVE_HEADING_MARKER_RE)
            : null;
          const attrsMatch = isExtensionActive('attributes')
            ? headingText.match(LIVE_HEADING_ATTRS_RE)
            : null;
          const hideMatch = markerMatch || attrsMatch;
          if (hideMatch) {
            ranges.push(
              liveMarkerHiddenDeco.range(headingLine.from + hideMatch.index, headingLine.to),
            );
          }
          return;
        }
        // 4T-0083: Setext-Headings (`Titel\n===` oder `Titel\n---`). Knoten
        // umfasst Titel-Zeile und Unterstreichungs-Zeile; HeaderMark-Child
        // markiert die Unterstreichung. Titel-Zeile bekommt cm-live-h1/h2,
        // Unterstreichungs-Zeile bekommt cm-live-setext-underline und wird
        // in Nicht-Cursor-Position als Marker versteckt.
        const setextMatch = name.match(/^SetextHeading([12])$/);
        if (setextMatch) {
          const level = parseInt(setextMatch[1], 10);
          const titleLine = state.doc.lineAt(node.from);
          if (titleLine.number <= frontmatterEndLine) return;
          ranges.push(liveHeadingLineDecos[level - 1].range(titleLine.from));
          // 4T-0471 (Epic 3E-0087): Nummer-Widget vor der Titel-Zeile (nur inaktiv).
          if (!activeLines.has(titleLine.number)) {
            const setextNum = headingNumberByLine
              ? headingNumberByLine.get(titleLine.number)
              : null;
            if (setextNum) {
              ranges.push(
                Decoration.widget({
                  widget: new HeadingNumberWidget(setextNum),
                  side: -1,
                }).range(titleLine.from),
              );
            }
          }
          let underlineFrom = -1;
          let underlineTo = -1;
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === 'HeaderMark') {
              underlineFrom = inner.from;
              underlineTo = inner.to;
            }
            inner = inner.nextSibling;
          }
          if (underlineFrom < 0) return;
          const underlineLine = state.doc.lineAt(underlineFrom);
          ranges.push(liveSetextUnderlineLineDeco.range(underlineLine.from));
          if (!activeLines.has(underlineLine.number)) {
            ranges.push(liveMarkerHiddenDeco.range(underlineFrom, underlineTo));
          }
          // 4T-0202: trailing Attribut-Block der Titel-Zeile ausblenden
          // (4T-0293: nur bei aktiver attributes-Erweiterung).
          if (!activeLines.has(titleLine.number)) {
            const titleText = state.doc.sliceString(titleLine.from, titleLine.to);
            const markerMatch = isExtensionActive('heading-numbering')
              ? titleText.match(LIVE_HEADING_MARKER_RE)
              : null;
            const attrsMatch = isExtensionActive('attributes')
              ? titleText.match(LIVE_HEADING_ATTRS_RE)
              : null;
            const hideMatch = markerMatch || attrsMatch;
            if (hideMatch) {
              ranges.push(
                liveMarkerHiddenDeco.range(titleLine.from + hideMatch.index, titleLine.to),
              );
            }
          }
          return;
        }
        // 4T-0083: Blockquote. Callout-Blockquotes werden ueber das im
        // Pre-Pass aufgebaute calloutLines-Set uebersprungen — der Lezer
        // splittet Callout-Blocks gelegentlich in mehrere Blockquote-
        // Knoten, ein Test nur auf die erste Knoten-Zeile reicht nicht.
        // Pro Quote-Zeile: Decoration.line cm-live-blockquote, in Nicht-
        // Cursor-Zeile per Pattern-Match auch verschachtelte `> > `-
        // Marker-Folgen verstecken. Pattern-Variante ist robuster als
        // direkte QuoteMark-Child-Iteration, weil der Lezer-AST die
        // QuoteMarks teils tief verschachtelt liefert.
        if (name === 'Blockquote') {
          if (nodeInsideCode(node)) return;
          const firstLine = state.doc.lineAt(node.from);
          if (firstLine.number <= frontmatterEndLine) return;
          if (calloutLines.has(firstLine.number)) return;
          const lastLine = state.doc.lineAt(node.to);
          for (let lineNo = firstLine.number; lineNo <= lastLine.number; lineNo++) {
            const line = state.doc.line(lineNo);
            ranges.push(liveBlockquoteLineDeco.range(line.from));
            if (activeLines.has(lineNo)) continue;
            const lineText = state.doc.sliceString(line.from, line.to);
            const quoteMatch = lineText.match(/^[ \t]*(?:>[ \t]*)+/);
            if (quoteMatch && quoteMatch[0].length > 0) {
              ranges.push(liveMarkerHiddenDeco.range(line.from, line.from + quoteMatch[0].length));
            }
          }
          return;
        }
        // 4T-0996: Listen-Items samt Aufgaben-Badges liegen in
        // live-pass-tasks.js; Position im Pass und Rückkehr unverändert.
        if (name === 'ListItem') {
          runListItemPass(ctx, node);
          return;
        }
        // 4T-0084: Bilder. Lezer-Knoten Image umfasst `![alt](url)` und
        // hat URL als Kind. alt-Text extrahieren wir aus dem Roh-Text
        // zwischen `[` und `]` (Markdown-Inline-Markup im Alt wird im
        // Render-Pane sowieso plain ausgegeben). Inline-Replace ohne
        // block-Mode; bei Cursor in der Zeile entfaellt die Decoration
        // und die Quelle ist editierbar.
        if (name === 'Image') {
          if (nodeInsideCode(node)) return;
          const imgLine = state.doc.lineAt(node.from);
          if (imgLine.number <= frontmatterEndLine) return;
          if (activeLines.has(imgLine.number)) return;
          // R1-01 (4T-0174): Mehrzeilige Images (legales CommonMark, z.B.
          // Zeilenumbruch im alt-Text) NICHT inline ersetzen — ein Inline-
          // Replace ueber Zeilengrenzen laesst CM6 beim DocView-Emit
          // ausserhalb unseres try/catch werfen, bei jedem Update erneut
          // (Live-Modus dauerhaft unbenutzbar). Sie bleiben Roh-Text.
          if (state.doc.lineAt(node.to).number !== imgLine.number) return;
          let urlFrom = -1,
            urlTo = -1;
          let inner = node.node.firstChild;
          while (inner) {
            if (inner.name === 'URL') {
              urlFrom = inner.from;
              urlTo = inner.to;
              break;
            }
            inner = inner.nextSibling;
          }
          if (urlFrom < 0) return;
          const url = stripAngleDestination(state.doc.sliceString(urlFrom, urlTo));
          const fullText = state.doc.sliceString(node.from, node.to);
          const altMatch = fullText.match(/^!\[([^\]]*)\]/);
          const alt = altMatch ? altMatch[1] : '';
          // 4T-0198: allein stehende Bilder rendern im Render-Pane als
          // <figure> (implicit-figures) — das Widget zieht dann die
          // komplette Figure inkl. Caption nach.
          const standalone = imageIsStandalone(state, imgLine, fullText);
          ranges.push(
            Decoration.replace({
              widget: new ImageWidget(alt, url, basePath, { standalone }),
            }).range(node.from, node.to),
          );
          return;
        }
      } catch (err) {
        console.warn('[Live] Knoten uebersprungen:', node && node.name, err);
      }
    },
  });
}
