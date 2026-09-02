// Zweiter Regex-Pass-Block des Live-Modus, gefahren nach den Block-Pässen:
// Inline-Mathematik, Wiki-Einbettungen, Fußnoten, Emoji, Kalender-Werte,
// Inline-Berechnungen, Abkürzungen, Bild-Größen, Critic Markup, Tief- und
// Hochstellung, Spoiler und Attribut-Spannen.
// 4T-000996 (Epic 3E-000196): aus der Kernfunktion von live-widgets.js
// herausgelöst. Rümpfe unverändert übernommen; die Reihenfolge ist
// semantiktragend (Inline-Mathematik vor den Fußnoten, Critic Markup vor
// Tief-, Hoch- und Einfügungs-Pass), die Critic-Spannen sind ein
// Kontext-Feld statt einer Closure.
'use strict';

import { Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import emojiDefs from 'markdown-it-emoji/lib/data/full.mjs';

import { findCalendarValues } from '../../../shared/calendar/calendar-core.js';
import { findInlineCalcSpans, inlineCalcSpec } from '../../../shared/markdown/inline-calc.js';
import { calendarValueBadgeSpec } from '../../../shared/markdown/plugins.js';
import { t } from '../../i18n.js';
import { getAreaCalendarConfig } from '../calendar/calendar-config.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  LIVE_MATH_INLINE_RE,
  LIVE_WIKI_EMBED_RE,
  liveAbbrMarkDeco,
  liveCriticCommentDeco,
  liveCriticDelDeco,
  liveCriticInsDeco,
  liveCriticMarkDeco,
  liveFootnoteRefMarkDeco,
  liveInsDeco,
  liveMarkerHiddenDeco,
  liveSpoilerDeco,
  liveSubDeco,
  liveSupDeco,
} from './live-deco.js';
import {
  LIVE_CRITIC_CLOSE_FOR,
  LIVE_CRITIC_RE,
  LIVE_EMOJI_RE,
  LIVE_FOOTNOTE_REF_RE,
  LIVE_IMG_SIZE_RE,
  LIVE_INS_RE,
  LIVE_SPAN_ATTRS_RE,
  LIVE_SPOILER_RE,
  LIVE_SUB_RE,
  LIVE_SUP_RE,
  computeAbbrScan,
  imageIsStandalone,
  positionInsideTable,
} from './live-scans.js';
import { positionInsideCode } from './live-shared.js';
import { CalendarValueBadgeWidget, EmojiWidget, InlineCalcWidget } from './live-widget-inline.js';
import { ImageWidget, MathInlineWidget, WikiEmbedWidget } from './live-widget-render.js';

// 4T-000996: Zweiter Inline-Block eines Sichtbereichs.
export function runLateInlinePasses(ctx) {
  const { state, ranges, activeLines, basePath, frontmatterEndLine } = ctx;
  const { mathBlockRanges, text, from, criticSpans } = ctx;
  // === 4T-000084: Regex-Pass Inline-Math ($x$) ===
  // Wird vor dem Footnote-Pass platziert, weil Math-Inhalt potenziell
  // `[^id]`-aehnliche Sequenzen enthalten koennte; mit Inline-Math als
  // Replace-Decoration ist der Bereich danach nicht mehr fuer den
  // Footnote-Pass aktiv (Decoration.replace nimmt den Range raus).
  if (isExtensionActive('katex')) {
    for (const m of text.matchAll(LIVE_MATH_INLINE_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (activeLines.has(lineNo)) continue;
      if (lineNo <= frontmatterEndLine) continue;
      const fullEnd = docPos + m[0].length;
      // Innerhalb eines KaTeX-Blocks? Skip — Block-Pass laeuft separat.
      let insideBlock = false;
      for (const block of mathBlockRanges) {
        if (docPos >= block.from && fullEnd <= block.to) {
          insideBlock = true;
          break;
        }
      }
      if (insideBlock) continue;
      ranges.push(
        Decoration.replace({
          widget: new MathInlineWidget(m[0], basePath),
        }).range(docPos, fullEnd),
      );
    }
  }

  // === 4T-000084: Regex-Pass Wiki-Embeds (![[…]]) ===
  if (isExtensionActive('wiki-embeds')) {
    for (const m of text.matchAll(LIVE_WIKI_EMBED_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (activeLines.has(lineNo)) continue;
      if (lineNo <= frontmatterEndLine) continue;
      const fullEnd = docPos + m[0].length;
      ranges.push(
        Decoration.replace({
          widget: new WikiEmbedWidget(m[0], basePath),
        }).range(docPos, fullEnd),
      );
    }
  }

  // === Regex-Pass: Footnote-Verweis ([^id]) ===
  if (isExtensionActive('footnotes')) {
    for (const m of text.matchAll(LIVE_FOOTNOTE_REF_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      // R1-11 (4T-000186): Frontmatter ausklammern.
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      const id = m[1];
      const fullEnd = docPos + m[0].length;
      const idStart = docPos + 2; // nach `[^`
      const idEnd = fullEnd - 1; // vor `]`
      if (idEnd <= idStart) continue;
      ranges.push(liveMarkerHiddenDeco.range(docPos, idStart));
      ranges.push(liveFootnoteRefMarkDeco(id).range(idStart, idEnd));
      ranges.push(liveMarkerHiddenDeco.range(idEnd, fullEnd));
    }
  }

  // === 4T-000197: Regex-Pass Emoji-Shortcodes (:smile:) ===
  // exec-Loop statt matchAll, weil bei Nicht-Shortcode-Kandidaten der
  // lastIndex auf das schliessende `:` zurueckgesetzt werden muss —
  // sonst verschluckt z.B. `a:x:smile:` den Start von `:smile:`.
  if (isExtensionActive('emoji')) {
    LIVE_EMOJI_RE.lastIndex = 0;
    let m;
    while ((m = LIVE_EMOJI_RE.exec(text)) !== null) {
      const char = emojiDefs[m[1]];
      if (!char) {
        LIVE_EMOJI_RE.lastIndex = m.index + m[0].length - 1;
        continue;
      }
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      ranges.push(
        Decoration.replace({
          widget: new EmojiWidget(char),
        }).range(docPos, docPos + m[0].length),
      );
    }
  }

  // === 4T-000546 (Epic 3E-000097): Regex-Pass Kalender-Werte (@{Name: Wert}) ===
  // Inline-Replace durch die Badge-Darstellung (Spec-Quelle wie der
  // Render-Pane); der Klick-Bereich spricht den mousedown-Handler des
  // calendarValuePlugin an (calendar-picker.js). Cursor auf der Zeile
  // zeigt den Roh-Text (activeLines-Guard).
  if (isExtensionActive('custom-calendars')) {
    for (const v of findCalendarValues(text)) {
      const docPos = from + v.from;
      if (positionInsideCode(state, docPos)) continue;
      const line = state.doc.lineAt(docPos);
      if (line.number <= frontmatterEndLine) continue;
      if (activeLines.has(line.number)) continue;
      if (docPos + v.raw.length > line.to) continue;
      const spec = calendarValueBadgeSpec(v.name, v.value, getAreaCalendarConfig(), t);
      ranges.push(
        Decoration.replace({
          widget: new CalendarValueBadgeWidget(spec.cls, spec.title, spec.text, {
            from: docPos,
            to: docPos + v.raw.length,
          }),
        }).range(docPos, docPos + v.raw.length),
      );
    }
  }

  // === 4T-000596 (Epic 3E-000111): Regex-Pass Inline-Berechnungen ({= … =}) ===
  // Inline-Replace durch das Ergebnis-Widget (Spec-Quelle wie der Render-
  // Pane, Fehler als ⚠︎ mit lokalisiertem Tooltip). Cursor auf der Zeile
  // zeigt den Roh-Ausdruck (activeLines-Guard); ein Klick aufs Widget setzt
  // den Cursor ins Konstrukt (Widget-eigener Handler).
  if (isExtensionActive('inline-calc')) {
    for (const s of findInlineCalcSpans(text)) {
      const docPos = from + s.from;
      if (positionInsideCode(state, docPos)) continue;
      const line = state.doc.lineAt(docPos);
      if (line.number <= frontmatterEndLine) continue;
      if (activeLines.has(line.number)) continue;
      if (docPos + (s.to - s.from) > line.to) continue;
      const spec = inlineCalcSpec(s.expr);
      const cls = spec.ok ? 'cm-inline-calc' : 'cm-inline-calc cm-inline-calc-error';
      const title = spec.ok ? spec.title : t('inlineCalc.error.' + spec.errorCode);
      ranges.push(
        Decoration.replace({
          widget: new InlineCalcWidget(cls, title, spec.text),
        }).range(docPos, docPos + (s.to - s.from)),
      );
    }
  }

  // === 4T-000197: Regex-Pass Abbreviation-Vorkommen ===
  // Pro definiertem Kuerzel werden Wort-Vorkommen im sichtbaren Bereich
  // mit dotted-underline-Mark plus Tooltip-Attribut versehen. Wort-
  // Grenzen Unicode-bewusst (markdown-it-abbr ersetzt nur ganze
  // Woerter). Definitionszeilen selbst bleiben roh sichtbar.
  if (isExtensionActive('abbreviations')) {
    const {
      defs: abbrDefs,
      defLines: abbrDefLines,
      regexes: abbrRegexes,
    } = computeAbbrScan(state.doc);
    for (const [abbrWord, longText] of abbrDefs) {
      const re = abbrRegexes.get(abbrWord);
      for (const m of text.matchAll(re)) {
        const docPos = from + m.index;
        const lineNo = state.doc.lineAt(docPos).number;
        if (abbrDefLines.has(lineNo)) continue;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        if (positionInsideCode(state, docPos)) continue;
        ranges.push(liveAbbrMarkDeco(longText).range(docPos, docPos + m[0].length));
      }
    }
  }

  // === 4T-000198: Regex-Pass Image-Size (![alt](url =WxH)) ===
  // Der Lezer-Image-Branch oben greift hier nicht (kein URL-Child im
  // abgebrochenen Image-Knoten) — kein Doppel-Replace moeglich.
  // 4T-000293: gehoert zur figures-Erweiterung; deaktiviert bleibt das
  // Groessen-Suffix Roh-Text (Paritaet: der Render zeigt es dann auch roh).
  if (isExtensionActive('figures')) {
    for (const m of text.matchAll(LIVE_IMG_SIZE_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const line = state.doc.lineAt(docPos);
      if (line.number <= frontmatterEndLine) continue;
      if (activeLines.has(line.number)) continue;
      const standalone = imageIsStandalone(state, line, m[0]);
      ranges.push(
        Decoration.replace({
          widget: new ImageWidget(m[1], m[2], basePath, { sourceText: m[0], standalone }),
        }).range(docPos, docPos + m[0].length),
      );
    }
  }

  // === 4T-000203: Regex-Pass Critic Markup ===
  // Laeuft VOR den Sub/Sup/Ins-Paessen und sammelt seine Spannen —
  // `{++x++}` darf dort nicht erneut als `++x++` matchen (im Render-
  // Pfad konsumiert die frueher registrierte Critic-Rule zuerst).
  // 4T-000293: bei deaktivierter Critic-Erweiterung bleibt criticSpans
  // leer — die Typografie-Paesse duerfen dann in `{++x++}` matchen
  // (Paritaet: ohne Critic-Rule konsumiert auch der Render die Spanne
  // nicht zuerst).
  if (isExtensionActive('critic-markup')) {
    const decoFor = {
      '++': liveCriticInsDeco,
      '--': liveCriticDelDeco,
      '==': liveCriticMarkDeco,
      '>>': liveCriticCommentDeco,
    };
    for (const m of text.matchAll(LIVE_CRITIC_RE)) {
      if (LIVE_CRITIC_CLOSE_FOR[m[1]] !== m[3]) continue;
      if (m[1] === '~~' && m[2].indexOf('~>') < 0) continue;
      criticSpans.push([m.index, m.index + m[0].length]);
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      const fullEnd = docPos + m[0].length;
      const innerStart = docPos + 3; // nach `{++`
      const innerEnd = fullEnd - 3; // vor `++}`
      if (innerEnd <= innerStart) continue;
      ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
      if (m[1] === '~~') {
        // Substitution: alt als del, `~>` versteckt, neu als ins.
        const sepIdx = m[2].indexOf('~>');
        const sepStart = innerStart + sepIdx;
        if (sepIdx > 0) ranges.push(liveCriticDelDeco.range(innerStart, sepStart));
        ranges.push(liveMarkerHiddenDeco.range(sepStart, sepStart + 2));
        if (sepStart + 2 < innerEnd) ranges.push(liveCriticInsDeco.range(sepStart + 2, innerEnd));
      } else {
        ranges.push(decoFor[m[1]].range(innerStart, innerEnd));
      }
      ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
    }
  }
  const insideCriticSpan = (idx) => criticSpans.some(([a, b]) => idx >= a && idx < b);

  // === 4T-000201: Regex-Paesse Sub (~x~), Sup (^^x^^), Ins (++x++) ===
  // Muster = Highlight-Pass: Marker-Paar in Nicht-Cursor-Zeilen
  // verstecken, Inhalt mit Style-Mark versehen. Der Sub-Pass laeuft
  // nach dem Lezer-Strikethrough-Pass; die Lookarounds schliessen
  // `~~`-Bereiche aus.
  if (isExtensionActive('typography')) {
    const passes = [
      { re: LIVE_SUB_RE, markerLen: 1, deco: liveSubDeco },
      { re: LIVE_SUP_RE, markerLen: 2, deco: liveSupDeco },
      { re: LIVE_INS_RE, markerLen: 2, deco: liveInsDeco },
    ];
    for (const pass of passes) {
      for (const m of text.matchAll(pass.re)) {
        if (insideCriticSpan(m.index)) continue;
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const fullEnd = docPos + m[0].length;
        const innerStart = docPos + pass.markerLen;
        const innerEnd = fullEnd - pass.markerLen;
        if (innerEnd <= innerStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
        ranges.push(pass.deco.range(innerStart, innerEnd));
        ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
      }
    }
  }

  // === 4T-000203: Regex-Pass Spoiler (||Text||) ===
  // Zeilen in Lezer-Table-Knoten ueberspringen — dort gewinnt die
  // Zellen-Trennung (Verhalten konsistent zum Render-Pfad, wo der
  // Block-Tabellen-Parser die Zeile vor den Inline-Rules zerschneidet).
  if (isExtensionActive('spoiler')) {
    for (const m of text.matchAll(LIVE_SPOILER_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      if (positionInsideTable(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      const fullEnd = docPos + m[0].length;
      const innerStart = docPos + 2;
      const innerEnd = fullEnd - 2;
      if (innerEnd <= innerStart) continue;
      ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
      ranges.push(liveSpoilerDeco.range(innerStart, innerEnd));
      ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
    }
  }

  // === 4T-000202: Regex-Pass Bracketed Spans ([Text]{...}) ===
  // `[` und `]{...}` verstecken, Inhalt sichtbar lassen. Lezer-Link-
  // Guard: liegt der Treffer in einem Link-/Image-Knoten (z.B. eine
  // definierte Shortcut-Referenz `[ref]` mit folgendem Block), bleibt
  // die Quelle sichtbar — der Link-Pfad gehoert dem Lezer-Pass.
  if (isExtensionActive('attributes')) {
    for (const m of text.matchAll(LIVE_SPAN_ATTRS_RE)) {
      const docPos = from + m.index;
      if (positionInsideCode(state, docPos)) continue;
      const lineNo = state.doc.lineAt(docPos).number;
      if (lineNo <= frontmatterEndLine) continue;
      if (activeLines.has(lineNo)) continue;
      let insideLink = false;
      for (let n = syntaxTree(state).resolveInner(docPos + 1, 1); n; n = n.parent) {
        if (n.name === 'Link' || n.name === 'Image') {
          insideLink = true;
          break;
        }
      }
      if (insideLink) continue;
      const fullEnd = docPos + m[0].length;
      const contentStart = docPos + 1;
      const contentEnd = contentStart + m[1].length;
      ranges.push(liveMarkerHiddenDeco.range(docPos, contentStart));
      ranges.push(liveMarkerHiddenDeco.range(contentEnd, fullEnd));
    }
  }
}
