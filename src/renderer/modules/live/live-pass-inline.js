// Erster Regex-Pass-Block des Live-Modus, gefahren nach dem Lezer-Pass und
// vor den Block-Pässen: Hervorhebung, %%-Kommentare, Tags, Wiki-Links und
// Trennlinien.
// 4T-0996 (Epic 3E-0196): aus der Kernfunktion von live-widgets.js
// herausgelöst. Rümpfe unverändert übernommen; die Spannen-Sammlungen der
// Wiki-Links und Attribut-Blöcke sind Kontext-Felder statt Closures.
'use strict';

import { githubLikeSlug } from '../../../shared/markdown/slug.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  LIVE_HR_LINE_RE,
  liveHrLineDeco,
  liveLinkMarkDeco,
  liveMarkerHiddenDeco,
  liveTagMarkDeco,
} from './live-deco.js';
import {
  LIVE_HIGHLIGHT_RE,
  LIVE_TAG_HAS_LETTER,
  LIVE_TAG_HEX_COLOR,
  LIVE_TAG_RE,
  LIVE_WIKILINK_RE,
} from './live-scans.js';
import { positionInsideCode } from './live-shared.js';

// 4T-0996: Erster Inline-Block eines Sichtbereichs. Die Reihenfolge der
// Pässe ist semantiktragend und unverändert.
export function runInlinePasses(ctx) {
  const { state, ranges, activeLines, frontmatterEndLine, commentRanges } = ctx;
  const { text, from, to, wikiSpans, attrSpans } = ctx;
  // === Regex-Pass: Highlight (==Text==) ===
  // 4T-0293: Marker nur bei aktiver Highlight-Erweiterung verstecken
  // (die gelbe Hinterlegung schaltet markMarkerField in live-marker-fields.js).
  if (isExtensionActive('highlight')) {
    for (const m of text.matchAll(LIVE_HIGHLIGHT_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      // R1-11 (4T-0186): Frontmatter ausklammern.
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      const innerStart = docPos + 2;
      const innerEnd = docPos + m[0].length - 2;
      if (innerEnd <= innerStart) continue;
      ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
      ranges.push(liveMarkerHiddenDeco.range(innerEnd, docPos + m[0].length));
      // Inhalt-Highlight kommt aus markMarkerField (cm-mark-marker, gelbe
      // Hinterlegung); hier wird nur das `==`-Marker-Paar versteckt.
    }
  }

  // 4T-0487 (Epic 3E-0091): Die Dekoration klickbarer Datums-/Uhrzeit-
  // Werte liegt seit dem PO-Befund der ersten Test-Runde als Basis-
  // Extension der EditorView (dateValuePlugin in date-picker.js) und
  // wirkt damit in Quelltext- UND Live-Modus — hier kein eigener Pass.

  // === Pass: %%-Kommentare (4T-0479, Epic 3E-0089) ===
  // Auf inaktiven Zeilen wird der komplette Kommentar inklusive Marker
  // ausgeblendet; auf aktiven Zeilen bleibt die Quelle stehen und
  // commentMarkerField (live-marker-fields.js) faerbt dezent. Segment-weise pro
  // Zeile, weil Mark-Decorations aus dem ViewPlugin keine Zeilenumbrueche
  // ersetzen duerfen — die Zeilen-Struktur mehrzeiliger Kommentare bleibt
  // als Leerzeilen sichtbar (bewusste Festlegung, Quelltext-Treue des
  // Live-Modus). Code-Schutz und Escapes stecken bereits im Scanner.
  for (const r of commentRanges) {
    const clipFrom = Math.max(r.from, from);
    const clipTo = Math.min(r.to, to);
    if (clipTo <= clipFrom) continue;
    let pos = clipFrom;
    while (pos < clipTo) {
      const line = state.doc.lineAt(pos);
      const segEnd = Math.min(line.to, clipTo);
      if (line.number > frontmatterEndLine && !activeLines.has(line.number) && segEnd > pos) {
        ranges.push(liveMarkerHiddenDeco.range(pos, segEnd));
      }
      pos = line.to + 1;
    }
  }

  // === Regex-Pass: Tag (#tag) ===
  // B-08-Paritaet (K-09/4T-0186): `#…` innerhalb einer [[…]]-Spanne ist
  // ein Wiki-Anker, kein Tag — der markdown-it-Pfad erkennt dort seit
  // B-08 ebenfalls keinen Tag. Ohne den Ausschluss wuerde die Tag-
  // Decoration (jetzt klickbar) den Wiki-Link-Klick kapern.
  for (const wm of text.matchAll(LIVE_WIKILINK_RE)) {
    wikiSpans.push([wm.index, wm.index + wm[0].length]);
  }
  const insideWikiSpan = (idx) => wikiSpans.some(([a, b]) => idx >= a && idx < b);
  // 4T-0202: '#id' in {...}-Attribut-Bloecken ist kein Tag (Paritaet
  // zum insideAttrBlock-Guard im tagsPlugin und zum Index-Scan).
  for (const am of text.matchAll(/\{[^{}\n]*\}/g)) {
    attrSpans.push([am.index, am.index + am[0].length]);
  }
  const insideAttrSpan = (idx) => attrSpans.some(([a, b]) => idx >= a && idx < b);
  if (isExtensionActive('tags')) {
    for (const m of text.matchAll(LIVE_TAG_RE)) {
      const tagText = m[1];
      if (tagText.startsWith('/') || tagText.endsWith('/')) continue;
      if (!LIVE_TAG_HAS_LETTER.test(tagText)) continue;
      if (LIVE_TAG_HEX_COLOR.test(tagText)) continue;
      if (insideWikiSpan(m.index)) continue;
      if (insideAttrSpan(m.index)) continue;
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (activeLines.has(lineNo)) continue;
      if (lineNo <= frontmatterEndLine) continue;
      const tagEnd = docPos + 1 + tagText.length;
      // K-09 (4T-0186): Tags im Live-Modus klickbar wie im Render-Pane —
      // das data-Attribut bedient den bestehenden Klick-Handler, der
      // '#tag:'-hrefs an die Tag-Sidebar weiterreicht.
      ranges.push(liveTagMarkDeco(tagText).range(docPos, tagEnd));
    }
  }

  // === Regex-Pass: Wiki-Link ([[Datei]] / [[Datei#Anker]] / [[Datei|Alias]]) ===
  if (isExtensionActive('wiki-links'))
    for (const m of text.matchAll(LIVE_WIKILINK_RE)) {
      const docPos = from + m.index;
      // 4T-0084: `![[…]]` ist ein Wiki-Embed und wird vom Embed-Pass
      // unten behandelt — hier ueberspringen, sonst kollidieren die
      // beiden Replace-Decorations.
      if (docPos > 0 && state.doc.sliceString(docPos - 1, docPos) === '!') continue;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      // R1-11 (4T-0186): Frontmatter ausklammern.
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      const inner = m[1];
      const pipeIdx = inner.indexOf('|');
      const targetRaw = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).replace(/\\$/, '').trim();
      if (!targetRaw) continue;
      // 4T-0082: href so konstruieren wie wikiLinksPlugin im shared-
      // Plugin (Pfad und Anker trennen, .md anhaengen wenn keine Endung).
      // K-02 (4T-0186): Anker wie dort normalisieren — Block-Anker
      // '^id' wird zu '#id' (nur bei gueltiger ID), Heading-Anker zum
      // githubLikeSlug; vorher stand der rohe Text im href und
      // Heading-Sprünge liefen ins Leere.
      const hashIdx = targetRaw.indexOf('#');
      const pathPart = hashIdx >= 0 ? targetRaw.slice(0, hashIdx) : targetRaw;
      const anchorRaw = hashIdx >= 0 ? targetRaw.slice(hashIdx + 1).trim() : '';
      let anchorPart = '';
      if (anchorRaw) {
        if (anchorRaw.startsWith('^')) {
          const id = anchorRaw.slice(1).trim();
          if (/^[\p{L}\p{N}_-]+$/u.test(id)) anchorPart = '#' + id;
        } else {
          const slug = githubLikeSlug(anchorRaw);
          if (slug) anchorPart = '#' + slug;
        }
      }
      let href;
      if (pathPart === '..' || pathPart === '../') {
        // 4T-0336 (Epic 3E-0061): Eltern-Link — Konstruktion wie im
        // wikiLinksPlugin (kein '.md', Klick-Pfad expandiert).
        href = '..' + anchorPart;
      } else if (pathPart) {
        const hasExtension = /\.[a-z0-9]{1,8}$/i.test(pathPart);
        href = (hasExtension ? pathPart : pathPart + '.md') + anchorPart;
      } else if (anchorPart) {
        href = anchorPart;
      } else {
        continue;
      }
      const fullStart = docPos;
      const fullEnd = docPos + m[0].length;
      const innerStart = docPos + 2; // nach `[[`
      const innerEnd = fullEnd - 2; // vor `]]`
      // Bei Alias: `[[` + `Datei|` verstecken, nur `Alias` sichtbar.
      // Ohne Alias: `[[` versteckt, Inhalt komplett sichtbar.
      const textStart = pipeIdx >= 0 ? innerStart + pipeIdx + 1 : innerStart;
      const textEnd = innerEnd;
      if (textEnd <= textStart) continue;
      ranges.push(liveMarkerHiddenDeco.range(fullStart, textStart));
      ranges.push(liveLinkMarkDeco(href, true).range(textStart, textEnd));
      ranges.push(liveMarkerHiddenDeco.range(textEnd, fullEnd));
    }

  // === 4T-0083: Regex-Pass HR (---, ***, ___) ===
  // Pattern-basiert statt Lezer-AST, weil HorizontalRule-Knoten in der
  // aktuellen lang-markdown-Konfiguration nicht zuverlaessig geliefert
  // wird. Pro Zeile pruefen, ob die Zeile ausschliesslich aus drei oder
  // mehr gleichen Markern (-/*/_) plus optionalem Whitespace besteht.
  // Frontmatter und Code-Kontext werden ausgeklammert.
  {
    const fromLine = state.doc.lineAt(from).number;
    const toLine = state.doc.lineAt(to).number;
    for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
      if (lineNo <= frontmatterEndLine) continue;
      const line = state.doc.line(lineNo);
      const lineText = state.doc.sliceString(line.from, line.to);
      if (!LIVE_HR_LINE_RE.test(lineText)) continue;
      if (positionInsideCode(state, line.from)) continue;
      ranges.push(liveHrLineDeco.range(line.from));
      if (!activeLines.has(lineNo)) {
        ranges.push(liveMarkerHiddenDeco.range(line.from, line.to));
      }
    }
  }
}
