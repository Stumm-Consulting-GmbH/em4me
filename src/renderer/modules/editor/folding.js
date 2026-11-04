// 4T-000179 (Epic 3E-000039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { ViewPlugin, GutterMarker, gutter } from '@codemirror/view';
import { StateEffect, StateField, countColumn } from '@codemirror/state';
import {
  syntaxTree,
  foldedRanges,
  foldable,
  foldEffect,
  foldState,
  unfoldEffect,
} from '@codemirror/language';

import {
  foldHeadingRegion,
  isHeadingRegionFolded,
  paneEditors,
  unfoldHeadingRegion,
} from './editor.js';
import {
  LIST_FOLD_TRACK_EVENT,
  LIST_FOLD_TRACK_STRUKTUR,
  getListFoldTrackPosition,
} from './list-fold-track-setting.js';
import { parseListItemHead } from '../../../shared/markdown/list-outline.js';
import { createListFoldTrackLine } from './list-fold-track-zeile.js';

// 4T-000013: Folding-Struktur-Cache. Wird bei jeder Doc-Aenderung aus dem
// CodeMirror-syntaxTree neu aufgebaut. Enthaelt:
// - headings: pro Heading {kind:'heading', level, fromLine, toLine, track}.
//   toLine ist die letzte Zeile der Heading-Region, track entspricht dem
//   Heading-Level (1..6).
// - blocks: pro mehrzeiligem Block-Foldable (ListItem, Blockquote, FencedCode,
//   HTMLBlock, Table) {kind:'block', fromLine, toLine, from, to, track}.
//   track liegt rechts der Heading-Spuren: maxHeadingLevel + Verschachtelungs-
//   tiefe innerhalb anderer Blocks (Top-Level-Block => maxHeadingLevel + 1).
//   4T-002434 (Epic 3E-000375): Ein ListItem trägt zusätzlich nodeType
//   'ListItem', listType ('bullet' oder 'ordered'), markerOffset (Zeichen-
//   Index des Aufzählungszeichens oder der Nummer in seiner Zeile) und
//   indentColumn (Einrück-Spalte in Zeichenbreiten: Zitat-Präfixe zählen mit,
//   Tabulatoren springen auf die nächste Tab-Marke von state.tabSize) sowie
//   trackWithoutLists: null. Jeder übrige Block trägt trackWithoutLists, die
//   Spur im Rand bei der Lage «in der Struktur der Liste», in der die
//   Listenpunkte nicht mitzählen.
// - allRegions: vereinte Liste, sortiert nach fromLine fuer schnelle Iteration.
// - totalTracks: Spurenanzahl insgesamt (maxHeadingLevel + maxBlockDepth).
// - layouts: 4T-002434 — je Lage der Listen-Spuren (`aussen`, `struktur`) die
//   Spuren des Rands als {regionsByTrack, totalTracks}; `aussen` ist der
//   bisherige Stand, `struktur` lässt die Listenpunkte aus dem Rand.
// Die Spurenanzahl ist dynamisch: nur die in der Datei vorkommenden Heading-
// Ebenen und Block-Verschachtelungstiefen bekommen Platz. Beim Einfuegen
// neuer Ebenen waechst der Gutter ueber den Spacer-Mechanismus mit.
export const FOLDABLE_BLOCK_TYPES = new Set([
  'ListItem',
  'Blockquote',
  'FencedCode',
  'HTMLBlock',
  'Table',
]);

export function computeFoldStructure(state) {
  const headings = [];
  const blocks = [];
  syntaxTree(state).iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (match) {
        const level = parseInt(match[1], 10);
        const fromLine = state.doc.lineAt(node.from).number;
        headings.push({
          kind: 'heading',
          level,
          fromLine,
          toLine: 0,
          track: level,
        });
        return;
      }
      if (FOLDABLE_BLOCK_TYPES.has(node.name)) {
        const startLine = state.doc.lineAt(node.from);
        const endLine = state.doc.lineAt(node.to);
        if (endLine.number <= startLine.number) return; // einzeilig -> nicht faltbar
        const region = {
          kind: 'block',
          fromLine: startLine.number,
          toLine: endLine.number,
          from: startLine.to,
          to: node.to,
          track: 0,
          trackWithoutLists: 0,
        };
        if (node.name === 'ListItem') Object.assign(region, listItemFacts(state, node, startLine));
        blocks.push(region);
      }
    },
  });
  const totalLines = state.doc.lines;
  // R1-07 (4T-000180): Heading-Regionen-Enden per Rueckwaerts-Lauf in O(n)
  // statt O(n^2). nextStart[l] haelt die fromLine des naechsten spaeteren
  // Headings mit exakt Level l; das Regionsende ist das Minimum ueber die
  // Levels 1..h.level (erstes spaeteres Heading mit Level <= h.level).
  {
    const nextStart = new Array(7).fill(totalLines + 1);
    for (let i = headings.length - 1; i >= 0; i--) {
      const h = headings[i];
      let end = totalLines + 1;
      for (let l = 1; l <= h.level; l++) {
        if (nextStart[l] < end) end = nextStart[l];
      }
      h.toLine = end - 1;
      nextStart[h.level] = h.fromLine;
    }
  }
  let maxHeadingLevel = 0;
  for (const h of headings) {
    if (h.level > maxHeadingLevel) maxHeadingLevel = h.level;
  }
  // R1-07 (4T-000180): Block-Verschachtelungstiefe per Containment-Stack
  // (Begründung bei assignBlockTracks).
  assignBlockTracks(blocks, maxHeadingLevel, 'track');
  // 4T-002434: dieselbe Tiefen-Rechnung ohne die Listenpunkte — die Spuren,
  // die bei der Lage «in der Struktur der Liste» im Rand bleiben.
  const nonListBlocks = blocks.filter((b) => b.nodeType !== 'ListItem');
  assignBlockTracks(nonListBlocks, maxHeadingLevel, 'trackWithoutLists');
  const allRegions = headings.concat(blocks).sort((a, b) => a.fromLine - b.fromLine);
  const aussen = trackLayout(allRegions, maxHeadingLevel, 'track');
  const struktur = trackLayout(
    allRegions.filter((r) => r.nodeType !== 'ListItem'),
    maxHeadingLevel,
    'trackWithoutLists',
  );
  return {
    headings,
    blocks,
    allRegions,
    regionsByTrack: aussen.regionsByTrack,
    maxHeadingLevel,
    totalTracks: aussen.totalTracks,
    layouts: { aussen, struktur },
  };
}

// R1-07 (4T-000180): Block-Verschachtelungstiefe per Containment-Stack in
// O(n) statt O(n^2). blocks kommt aus syntaxTree.iterate in Pre-Order
// (Eltern vor Kindern, Dokument-Reihenfolge); der Stack haelt die aktuell
// umschliessenden Bloecke. Zeilen-identische Bloecke (z.B. ListItem und
// gleichlanger innerer Blockquote) zaehlen wie zuvor nicht zur Tiefe des
// jeweils anderen (keine ECHTE Umschliessung), bleiben aber im Stack, damit
// tiefere Kinder beide zaehlen. 4T-002434: als Funktion herausgezogen, weil
// sie zweimal läuft — über alle Blöcke (`track`) und über die Blöcke ohne
// Listenpunkte (`trackWithoutLists`).
function assignBlockTracks(blocks, maxHeadingLevel, field) {
  const stack = [];
  for (const b of blocks) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.fromLine <= b.fromLine && top.toLine >= b.toLine) break;
      stack.pop();
    }
    let equalTop = 0;
    for (let k = stack.length - 1; k >= 0; k--) {
      const s = stack[k];
      if (s.fromLine === b.fromLine && s.toLine === b.toLine) equalTop++;
      else break;
    }
    b[field] = maxHeadingLevel + (stack.length - equalTop) + 1;
    stack.push(b);
  }
}

// R1-08 (4T-000180): Regionen pro Spur, sortiert nach fromLine. Innerhalb
// einer Spur sind Regionen disjunkt (gleiches Heading-Level bzw. gleiche
// Block-Tiefe ueberlappen hoechstens an einer Randzeile) — der Gutter kann
// damit pro Zeile und Spur binaer suchen statt alle Regionen linear zu
// durchlaufen. 4T-002434: je Lage eine Aufteilung; Überschriften tragen ihre
// Ebene in beiden Feldern (`track`).
function trackLayout(regions, maxHeadingLevel, field) {
  const regionsByTrack = new Map();
  let totalTracks = maxHeadingLevel;
  for (const r of regions) {
    const track = r.kind === 'heading' ? r.track : r[field];
    if (track > totalTracks) totalTracks = track;
    let list = regionsByTrack.get(track);
    if (!list) {
      list = [];
      regionsByTrack.set(track, list);
    }
    list.push(r);
  }
  return { regionsByTrack, totalTracks };
}

// 4T-002434 (Epic 3E-000375): Lage eines Listenpunkts in seiner Zeile. Der
// Knoten beginnt im Syntaxbaum am Aufzählungszeichen oder an der Nummer, also
// hinter Einrückung und Zitat-Präfix; `markerOffset` ist dieser Zeichen-Index,
// `indentColumn` dieselbe Stelle in Zeichenbreiten. Die Listenart liest die
// gemeinsame Erkennung des Listenpunkt-Kopfs (`parseListItemHead`); ein Punkt
// ohne Text hinter dem Marker, den sie nicht erkennt, nimmt die Art der Liste
// aus dem Syntaxbaum.
function listItemFacts(state, node, startLine) {
  const markerOffset = node.from - startLine.from;
  const head = parseListItemHead(startLine.text.slice(markerOffset));
  const parentName = node.node && node.node.parent ? node.node.parent.name : '';
  const ordered = head ? head.ordered : parentName === 'OrderedList';
  return {
    nodeType: 'ListItem',
    listType: ordered ? 'ordered' : 'bullet',
    markerOffset,
    indentColumn: countColumn(startLine.text.slice(0, markerOffset), state.tabSize),
    trackWithoutLists: null,
  };
}

// 4T-002434: Spuren des Rands für die wirksame Lage der Listen-Spuren.
export function activeTrackLayout(struct) {
  if (!struct) return null;
  return getListFoldTrackPosition() === LIST_FOLD_TRACK_STRUKTUR
    ? struct.layouts.struktur
    : struct.layouts.aussen;
}

// R1-08 (4T-000180): Binaere Suche nach der letzten Region einer Spur mit
// fromLine <= lineNumber. Nur diese kann die Zeile abdecken oder dort
// starten (Spur-Listen sind disjunkt und nach fromLine sortiert).
export function findTrackRegionAtLine(list, lineNumber) {
  let lo = 0;
  let hi = list.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].fromLine <= lineNumber) {
      best = list[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export const foldStructureField = StateField.define({
  create(state) {
    return computeFoldStructure(state);
  },
  update(value, tr) {
    // Auch ohne docChange neu berechnen, wenn sich der syntaxTree geaendert
    // hat. Der lezer-markdown-Parser laeuft asynchron und liefert den
    // fertigen Tree haeufig erst ueber ein spaeteres, nicht-doc-aenderndes
    // Update nach (besonders bei groesseren Dateien). Ohne diesen Check
    // bliebe das Field mit dem initial leeren Tree haengen.
    if (!tr.docChanged && syntaxTree(tr.state) === syntaxTree(tr.startState)) {
      return value;
    }
    return computeFoldStructure(tr.state);
  },
});

// 4T-000013: Eigener Folding-Gutter mit dynamischen Hierarchie-Spuren. Pro
// tatsaechlich vorkommender Heading-Ebene UND pro Block-Verschachtelungstiefe
// (Listen, Blockquotes, Code, Tables) eine eigene Spur. Heading-Spuren liegen
// links, Block-Spuren direkt daneben rechts. Auf der Start-Zeile einer Region
// sitzt der Pfeil (⌄ offen / › zugeklappt), darunter laeuft eine senkrechte
// Linie bis zum Ende der Region. Gilt einheitlich fuer Headings und Bloecke.

export function isRegionFolded(state, region) {
  let folded = false;
  foldedRanges(state).between(region.from, region.to, (from, to) => {
    if (from === region.from && to === region.to) {
      folded = true;
      return false;
    }
  });
  return folded;
}

export function getFoldRangeForRegion(state, region) {
  if (region.kind === 'heading') {
    const lineObj = state.doc.line(region.fromLine);
    return foldable(state, lineObj.from, lineObj.to);
  }
  return { from: region.from, to: region.to };
}

// Breite pro Spur in Pixel. Marker und Spacer setzen die Container-Breite
// per Inline-Style (width + minWidth) UND per CSS-Custom-Property
// '--scg-tracks', damit die Breite robust durch das Gutter-Layout
// propagiert. CodeMirrors Spacer-Element bekommt visibility:hidden, der
// Layout-Platz haengt allein an dieser Breite.
export const FOLD_TRACK_PX = 10;

// 4T-002433 (Epic 3E-000375): Signal an den Gliederungs-Rand, dass die Lage
// der Gliederungsspuren bei Listen gewechselt hat; Wert ist die neue Lage
// (`aussen` oder `struktur`). Der Effekt trägt keinen Zustand und berührt
// weder `foldState` noch `foldStructureField` — gefaltete Bereiche bleiben
// gefaltet. Ausgelöst vom Hörer am Datei-Ende; 4T-002434 wertet ihn beim
// Zeichnen der Spur aus.
export const listFoldTrackEffect = StateEffect.define();

// 4T-002434: Trägt eine Aktualisierung den Wechsel der Lage?
export function hasListFoldTrackEffect(update) {
  return update.transactions.some((tr) => tr.effects.some((e) => e.is(listFoldTrackEffect)));
}

export function applyTrackWidth(root, totalTracks) {
  const w = totalTracks * FOLD_TRACK_PX + 'px';
  root.style.width = w;
  root.style.minWidth = w;
  root.style.flex = '0 0 ' + w;
  root.style.setProperty('--scg-tracks', String(totalTracks));
}

export class FoldGutterMarker extends GutterMarker {
  constructor(totalTracks, trackInfo) {
    super();
    this.totalTracks = totalTracks;
    this.trackInfo = trackInfo; // { [k]: 'inside' | {regionKind, folded, fromLine} }
  }
  eq(other) {
    if (!(other instanceof FoldGutterMarker)) return false;
    if (this.totalTracks !== other.totalTracks) return false;
    for (let k = 1; k <= this.totalTracks; k++) {
      const a = this.trackInfo[k];
      const b = other.trackInfo[k];
      if (a === b) continue;
      if (!a || !b) return false;
      if (a === 'inside' || b === 'inside') return false;
      if (a.regionKind !== b.regionKind) return false;
      if (a.folded !== b.folded) return false;
      if (a.fromLine !== b.fromLine) return false;
    }
    return true;
  }
  toDOM() {
    const root = document.createElement('div');
    root.className = 'scg-heading-gutter';
    applyTrackWidth(root, this.totalTracks);
    for (let k = 1; k <= this.totalTracks; k++) {
      const info = this.trackInfo[k];
      const span = document.createElement('span');
      span.className = 'scg-heading-track';
      if (info && info !== 'inside') {
        span.classList.add('scg-heading-marker');
        span.classList.add('scg-track-' + info.regionKind);
        span.textContent = info.folded ? '›' : '⌄';
        span.dataset.foldKind = info.regionKind;
        span.dataset.foldLine = String(info.fromLine);
      } else if (info === 'inside') {
        span.classList.add('scg-heading-line');
      }
      root.appendChild(span);
    }
    return root;
  }
}

// Spacer haelt die Gutter-Breite auf der maximal benoetigten Spurenanzahl.
export class FoldGutterSpacer extends GutterMarker {
  constructor(totalTracks) {
    super();
    this.totalTracks = totalTracks;
  }
  eq(other) {
    return other instanceof FoldGutterSpacer && this.totalTracks === other.totalTracks;
  }
  toDOM() {
    const root = document.createElement('div');
    root.className = 'scg-heading-gutter';
    applyTrackWidth(root, this.totalTracks);
    for (let k = 0; k < this.totalTracks; k++) {
      const span = document.createElement('span');
      span.className = 'scg-heading-track';
      root.appendChild(span);
    }
    return root;
  }
}

export const headingFoldGutter = gutter({
  class: 'cm-headingGutter',
  lineMarker(view, line) {
    // 4T-002434 (Epic 3E-000375): Spuren der wirksamen Lage — bei «in der
    // Struktur der Liste» ohne die Listenpunkte, die dann die Zeile zeichnet
    // (list-fold-track-zeile.js); bei «links außen» der bisherige Stand.
    const layout = activeTrackLayout(view.state.field(foldStructureField, false));
    if (!layout || layout.totalTracks === 0) return null;
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const trackInfo = {};
    let hasContent = false;
    // R1-08 (4T-000180): pro Spur binaere Suche statt Linear-Scan ueber alle
    // Regionen pro sichtbarer Zeile. Pro Spur ist hoechstens eine Region
    // an einer Zeile relevant (Start dominiert "inside", wie zuvor).
    for (const [track, list] of layout.regionsByTrack) {
      const r = findTrackRegionAtLine(list, lineNumber);
      if (!r) continue;
      if (r.fromLine === lineNumber) {
        const range = getFoldRangeForRegion(view.state, r);
        const folded = range ? isRegionFolded(view.state, range) : false;
        trackInfo[track] = {
          regionKind: r.kind,
          folded,
          fromLine: r.fromLine,
        };
        hasContent = true;
      } else if (r.toLine >= lineNumber) {
        trackInfo[track] = 'inside';
        hasContent = true;
      }
    }
    if (!hasContent) return null;
    return new FoldGutterMarker(layout.totalTracks, trackInfo);
  },
  // Bei Folding-Aenderungen muss der Gutter neu gerendert werden, damit der
  // Pfeil von ⌄ auf › (oder umgekehrt) wechselt. CodeMirror redraws nur bei
  // docChange automatisch; foldState- oder Struktur-Aenderungen melden wir
  // explizit.
  lineMarkerChange(update) {
    if (update.startState.field(foldState, false) !== update.state.field(foldState, false)) {
      return true;
    }
    // 4T-002433 (Epic 3E-000375): Wechsel der Einstellung «Gliederungsspuren
    // bei Listen» — die Marker neu bauen, ohne den Falt-Zustand anzufassen.
    if (hasListFoldTrackEffect(update)) return true;
    return (
      update.startState.field(foldStructureField, false) !==
      update.state.field(foldStructureField, false)
    );
  },
  initialSpacer(view) {
    const layout = activeTrackLayout(view.state.field(foldStructureField, false));
    const tracks = (layout && layout.totalTracks) || 0;
    return new FoldGutterSpacer(tracks);
  },
  updateSpacer(spacer, update) {
    const layout = activeTrackLayout(update.state.field(foldStructureField, false));
    const need = (layout && layout.totalTracks) || 0;
    if (!(spacer instanceof FoldGutterSpacer) || spacer.totalTracks !== need) {
      return new FoldGutterSpacer(need);
    }
    return spacer;
  },
  domEventHandlers: {
    click(view, _line, event) {
      const target =
        event.target instanceof Element ? event.target.closest('[data-fold-line]') : null;
      if (!target) return false;
      const lineNumber = parseInt(target.dataset.foldLine, 10);
      if (!Number.isFinite(lineNumber)) return false;
      const kind = target.dataset.foldKind;
      if (kind === 'heading') {
        if (isHeadingRegionFolded(view, lineNumber)) {
          unfoldHeadingRegion(view, lineNumber);
        } else {
          foldHeadingRegion(view, lineNumber);
        }
        return true;
      }
      if (kind === 'block') {
        // 4T-002434: Bei «in der Struktur der Liste» trägt der Rand keine
        // Listenpunkte mehr; beginnt ein anderer Block auf derselben Zeile
        // (Code-Block direkt hinter dem Marker), gilt der Klick ihm.
        const ohneListen = getListFoldTrackPosition() === LIST_FOLD_TRACK_STRUKTUR;
        return toggleBlockRegion(view, lineNumber, (b) => !ohneListen || b.nodeType !== 'ListItem');
      }
      return false;
    },
  },
});

// 4T-002434 (Epic 3E-000375): Falten und Entfalten eines Blocks über seine
// Start-Zeile — die eine Stelle für den Rand-Marker und den Anzeiger in der
// Zeile. `accept` wählt unter mehreren Blöcken derselben Start-Zeile.
export function toggleBlockRegion(view, lineNumber, accept = () => true) {
  const struct = view.state.field(foldStructureField, false);
  const region = struct ? struct.blocks.find((b) => b.fromLine === lineNumber && accept(b)) : null;
  if (!region) return false;
  const range = { from: region.from, to: region.to };
  if (isRegionFolded(view.state, range)) {
    view.dispatch({ effects: unfoldEffect.of(range) });
  } else {
    view.dispatch({ effects: foldEffect.of(range) });
  }
  return true;
}

// 4T-000013: Setzt die Gutter-Breite direkt am .cm-headingGutter-DOM, basierend
// auf der aktuellen Spurenanzahl im foldStructureField. Drittes Sicherheits-
// netz neben Inline-Style am Marker-DOM und CSS-Variable, damit der Gutter
// auch dann eine korrekte Breite hat, wenn CodeMirrors Spacer-Mechanismus die
// Marker-Breite nicht zuverlaessig hochpropagiert.
export const foldGutterWidthSync = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.apply(view);
    }
    update(update) {
      const prev = update.startState.field(foldStructureField, false);
      const curr = update.state.field(foldStructureField, false);
      if (prev !== curr || hasListFoldTrackEffect(update)) this.apply(update.view);
    }
    apply(view) {
      // 4T-002434: Breite allein aus den Spuren, die im Rand bleiben.
      const layout = activeTrackLayout(view.state.field(foldStructureField, false));
      const tracks = (layout && layout.totalTracks) || 0;
      const gutterEl = view.dom.querySelector('.cm-headingGutter');
      if (gutterEl) {
        const px = tracks * FOLD_TRACK_PX + 'px';
        gutterEl.style.minWidth = px;
        gutterEl.style.width = px;
        gutterEl.style.setProperty('--scg-tracks', String(tracks));
      }
    }
  },
);

// 4T-000013: Bei jeder Folding-Aenderung (Gutter, Tastenkuerzel, programmatisch)
// ein DOM-Custom-Event 'scg:foldchange' auf document feuern. Konsument ist das
// Outline-Panel aus 4T-000014, das daraufhin seine Pfeil-Indikatoren auffrischt
// (Abonnent: app-init.js, document-Listener auf 'scg:foldchange').
export const foldChangeNotifier = ViewPlugin.fromClass(
  class {
    update(update) {
      let changed = false;
      for (const tr of update.transactions) {
        for (const eff of tr.effects) {
          if (eff.is(foldEffect) || eff.is(unfoldEffect)) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
      if (!changed) return;
      const paneIdx = paneEditors.indexOf(update.view);
      document.dispatchEvent(
        new CustomEvent('scg:foldchange', {
          detail: { paneIdx: paneIdx >= 0 ? paneIdx : null },
        }),
      );
    }
  },
);

// 4T-000179: api nach modules/app/api.js umgezogen (zyklenfreies Basis-Modul).

// 4T-000179: Extension-Bundle fuer die Gliederung — wird per Compartment
// ein-/ausgeschaltet (aus editor.js hierher verschoben: die Werte muessen
// beim Einbetten initialisiert sein; foldStructureField bleibt bewusst
// AUSSERHALB, weil das Outline-Panel seine Heading-Liste daraus liest).
// 4T-002434 (Epic 3E-000375): Die Listen-Spur in der Zeile gehört mit ins
// Bündel, damit sie bei ausgeblendeter Gliederung in beiden Lagen fehlt
// (Story 4S-001121, AK8).
export const listFoldTrackLine = createListFoldTrackLine({
  structureField: foldStructureField,
  isFolded: isRegionFolded,
  toggle: (view, lineNumber) =>
    toggleBlockRegion(view, lineNumber, (b) => b.nodeType === 'ListItem'),
  isTrackChange: hasListFoldTrackEffect,
});
export const foldGutterExtensions = [headingFoldGutter, foldGutterWidthSync, listFoldTrackLine];

// 4T-002433 (Epic 3E-000375): Hörer der Einstellung «Gliederungsspuren bei
// Listen». Ein Wechsel (auf der Einstellungs-Seite dieses Fensters oder über
// die Verteilung aus einem anderen) stößt in jedem offenen Editor des Fensters
// das Neuzeichnen des Gliederungs-Rands an; dieselbe Instanz bedient
// «Quellcode», «Geteilt» und «Live». Die Wache auf `document` hält den Import
// in Umgebungen ohne DOM folgenlos.
if (typeof document !== 'undefined') {
  document.addEventListener(LIST_FOLD_TRACK_EVENT, (event) => {
    const position = event.detail ? event.detail.position : undefined;
    for (const view of paneEditors) {
      if (view) view.dispatch({ effects: listFoldTrackEffect.of(position) });
    }
  });
}
