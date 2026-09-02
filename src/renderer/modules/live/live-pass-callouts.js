// Block-Pässe des Live-Modus: Callout-Blöcke aus dem Vor-Scan und die
// Custom-Container. Beide setzen Zeilen-Decorations, verstecken ihre
// Marker-Zeilen und setzen Icon- und Standardtitel-Widgets.
// 4T-000996 (Epic 3E-000196): aus der Kernfunktion von live-widgets.js
// herausgelöst. Rümpfe unverändert übernommen; der Block läuft zwischen den
// beiden Inline-Blöcken.
'use strict';

import { Decoration } from '@codemirror/view';

import { getLanguage } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  liveCalloutHeaderLineDeco,
  liveCalloutLineDeco,
  liveContainerLineDeco,
  liveMarkerHiddenDeco,
} from './live-deco.js';
import { computeContainerScan } from './live-scans.js';
import { positionInsideCode } from './live-shared.js';
import { CalloutDefaultTitleWidget, CalloutIconWidget } from './live-widget-inline.js';

// 4T-000996: Callout- und Container-Pass eines Sichtbereichs.
export function runCalloutPasses(ctx) {
  const { state, ranges, activeLines, frontmatterEndLine } = ctx;
  const { calloutInfos, from, to } = ctx;
  // === 4T-000087: Callout-Decoration-Pass ===
  // Pro Callout-Info aus dem Pre-Pass: Line-Decorations auf alle Block-
  // Zeilen, Hide-Range fuer den Header-Marker `> [!type][+-]?`, Hide-
  // Range fuer `> ` pro Body-Zeile (cursor-bewusst), Inline-Widget mit
  // dem Typ-Icon, optional Inline-Widget mit dem lokalisierten Default-
  // Titel. Viewport-Filter, damit Callouts ausserhalb des sichtbaren
  // Bereichs keine Decorations erzeugen.
  {
    const vpFromLine = state.doc.lineAt(from).number;
    const vpToLine = state.doc.lineAt(to).number;
    const language = getLanguage();
    for (const info of calloutInfos) {
      if (info.lastLineNo < vpFromLine || info.headerLineNo > vpToLine) continue;
      const headerLine = state.doc.line(info.headerLineNo);
      for (let lineNo = info.headerLineNo; lineNo <= info.lastLineNo; lineNo++) {
        const line = state.doc.line(lineNo);
        ranges.push(liveCalloutLineDeco(info.type).range(line.from));
      }
      ranges.push(liveCalloutHeaderLineDeco.range(headerLine.from));
      // Marker-Range in der Header-Zeile: optionale Einrueckung +
      // `> [!type][+-]?` plus folgendes Whitespace bis zum
      // (optionalen) Override-Titel.
      const headerText = state.doc.sliceString(headerLine.from, headerLine.to);
      // R1-13 (4T-000186): Muster synchron zur Pre-Pass-Erkennung halten.
      const markerMatch = headerText.match(/^( {0,3}>[ \t]*\[!([a-z]+)\][+-]?)([ \t]*)/);
      if (!markerMatch) continue;
      const markerEnd = headerLine.from + markerMatch[1].length;
      const markerEndWithWs = markerEnd + markerMatch[3].length;
      const headerActive = activeLines.has(info.headerLineNo);
      // Icon-Widget vor dem Header-Anfang (Box-Border ist links, Icon
      // rueckt direkt dahinter ein). Immer sichtbar — auch in Cursor-
      // Zeile, weil die Quelle im Cursor-Zustand zusaetzlich sichtbar
      // wird, das Icon stoert dabei nicht.
      ranges.push(
        Decoration.widget({
          widget: new CalloutIconWidget(info.type),
          side: -1,
        }).range(headerLine.from),
      );
      if (!headerActive) {
        ranges.push(liveMarkerHiddenDeco.range(headerLine.from, markerEndWithWs));
        if (!info.overrideTitle) {
          ranges.push(
            Decoration.widget({
              widget: new CalloutDefaultTitleWidget(info.type, language),
              side: 1,
            }).range(markerEndWithWs),
          );
        }
      }
      // Body-Zeilen: `> ` (auch verschachtelt `> > `) pro Zeile
      // verstecken, in Cursor-Zeile sichtbar lassen.
      for (let lineNo = info.headerLineNo + 1; lineNo <= info.lastLineNo; lineNo++) {
        if (activeLines.has(lineNo)) continue;
        const line = state.doc.line(lineNo);
        const lineText = state.doc.sliceString(line.from, line.to);
        const quoteMatch = lineText.match(/^[ \t]*(?:>[ \t]*)+/);
        if (quoteMatch && quoteMatch[0].length > 0) {
          ranges.push(liveMarkerHiddenDeco.range(line.from, line.from + quoteMatch[0].length));
        }
      }
    }
  }

  // === 4T-000200: Custom-Container-Decoration-Pass ===
  // Bekannte Callout-Typen nutzen die 4T-000087-Bausteine (Line-Decos,
  // Icon- und Default-Titel-Widget) unveraendert; unbekannte Namen
  // bekommen die neutrale cm-live-container-Line-Deco. Marker-Zeilen
  // werden in Nicht-Cursor-Zeilen versteckt; bei Containern ohne
  // Override-Titel die komplette Header-Zeile (der Render verwirft
  // einen Titel-Rest bei unbekannten Namen ebenfalls).
  if (isExtensionActive('custom-containers')) {
    const vpFromLine = state.doc.lineAt(from).number;
    const vpToLine = state.doc.lineAt(to).number;
    const language = getLanguage();
    const { containerInfos } = computeContainerScan(state.doc);
    for (const info of containerInfos) {
      if (info.endLineNo < vpFromLine || info.headerLineNo > vpToLine) continue;
      if (info.headerLineNo <= frontmatterEndLine) continue;
      const headerLine = state.doc.line(info.headerLineNo);
      if (positionInsideCode(state, headerLine.from)) continue;
      for (let lineNo = info.headerLineNo; lineNo <= info.endLineNo; lineNo++) {
        const line = state.doc.line(lineNo);
        ranges.push(
          (info.isCallout ? liveCalloutLineDeco(info.type) : liveContainerLineDeco).range(
            line.from,
          ),
        );
      }
      if (info.isCallout) {
        ranges.push(liveCalloutHeaderLineDeco.range(headerLine.from));
        ranges.push(
          Decoration.widget({
            widget: new CalloutIconWidget(info.type),
            side: -1,
          }).range(headerLine.from),
        );
      }
      if (!activeLines.has(info.headerLineNo)) {
        if (info.isCallout && info.overrideTitle) {
          // Nur `::: name ` verstecken, Override-Titel bleibt sichtbar.
          const headerText = state.doc.sliceString(headerLine.from, headerLine.to);
          const hm = headerText.match(/^ {0,3}:{3,}\s*[a-z][a-z0-9-]*[ \t]*/);
          if (hm) {
            ranges.push(
              liveMarkerHiddenDeco.range(headerLine.from, headerLine.from + hm[0].length),
            );
          }
        } else {
          ranges.push(liveMarkerHiddenDeco.range(headerLine.from, headerLine.to));
          if (info.isCallout) {
            ranges.push(
              Decoration.widget({
                widget: new CalloutDefaultTitleWidget(info.type, language),
                side: 1,
              }).range(headerLine.to),
            );
          }
        }
      }
      if (
        info.hasClose &&
        info.endLineNo !== info.headerLineNo &&
        !activeLines.has(info.endLineNo)
      ) {
        const endLine = state.doc.line(info.endLineNo);
        ranges.push(liveMarkerHiddenDeco.range(endLine.from, endLine.to));
      }
    }
  }
}
