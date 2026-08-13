// Gliederungs-Nummerierung des Live-Modus: Nummern-Widget vor der
// Überschrift-Zeile und die viewport-unabhängige Nummern-Map aus der
// Falt-Struktur.
// 4T-0996 (Epic 3E-0196): aus live-widgets.js herausgelöst; der Lezer-Pass
// verbraucht das Widget, die Kernfunktion die Map (einmal je Build).
'use strict';

import { WidgetType } from '@codemirror/view';

import { computeHeadingNumbers } from '../../../shared/heading-numbers.js';
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { foldStructureField } from '../editor/folding.js';
import { resolveHeadingNumberingForDoc } from '../heading-numbering.js';

// 4T-0471 (Epic 3E-0087): Nummern-Praefix einer Ueberschrift im Live-Modus
// (Inline-Widget vor der Zeile; Vorbild CalloutIconWidget). Reines Text-
// Widget, das keine Editor-Events schluckt.
export class HeadingNumberWidget extends WidgetType {
  constructor(number) {
    super();
    this.number = number;
  }
  eq(other) {
    return other instanceof HeadingNumberWidget && other.number === this.number;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-heading-number';
    span.textContent = this.number + ' ';
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0471: Roh-Titel einer Heading-Zeile OHNE Marker-/Attribut-Strip fuer die
// Marker-Erkennung des Kerns (nur der #-Praefix wird entfernt).
function liveRawHeadingTitle(doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return '';
  const raw = doc.line(lineNumber).text;
  const atx = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
  if (atx) return atx[1];
  return raw.trim();
}

// 4T-0471: Nummern-Map (fromLine -> Nummer) fuer den aktuellen Zustand. Nutzt
// die volle Heading-Liste aus der foldStructure (die Zaehlung muss auch
// ausserhalb des Viewports stimmen). null, wenn die Erweiterung aus ist oder
// es keine Ueberschriften gibt.
export function computeLiveHeadingNumbers(state, frontmatterEndLine) {
  if (!isExtensionActive('heading-numbering')) return null;
  const struct = state.field(foldStructureField, false);
  const all = struct && Array.isArray(struct.headings) ? struct.headings : [];
  // Pseudo-Ueberschriften im Frontmatter-Block ausschliessen: Lezer parst
  // `schluessel: wert` + `---` als Setext-Heading. Der Render-Pfad trennt die
  // Frontmatter ab; hier filtern wir sie analog aus der Zaehlung.
  const hs = all.filter((h) => h.fromLine > frontmatterEndLine);
  if (hs.length === 0) return null;
  const fmData =
    frontmatterEndLine > 0
      ? extractFrontmatter(state.doc.sliceString(0, state.doc.line(frontmatterEndLine).to)).data
      : null;
  const ctx = resolveHeadingNumberingForDoc(fmData);
  const nums = computeHeadingNumbers(
    hs.map((h) => ({ level: h.level, rawTitle: liveRawHeadingTitle(state.doc, h.fromLine) })),
    ctx,
  );
  const map = new Map();
  hs.forEach((h, i) => {
    if (nums[i] && nums[i].number) map.set(h.fromLine, nums[i].number);
  });
  return map;
}
