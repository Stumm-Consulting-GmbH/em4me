// 4T-002434 (Epic 3E-000375): Gliederungsspur der Listenpunkte in der Zeile.
//
// Bei der Lage «in der Struktur der Liste» (Einstellung aus
// list-fold-track-setting.js) zeichnet nicht mehr der Gliederungs-Rand die
// Spur eines Listenpunkts, sondern die Zeile selbst: Der Falt-Anzeiger steht
// unmittelbar vor dem Aufzählungszeichen oder der Nummer, die senkrechte Linie
// zu den Unterpunkten läuft auf derselben Einrückung durch die Zeilen darunter.
// Bei «links außen» liefert das Modul keine Dekoration; der Rand bleibt, wie er
// ist (Story 4S-001121, AK4).
//
// **Zeichen-Weg** (Messung vom 2026-10-28, Protokoll unter
// Tests/3E-000375/messung-2026-10-28/): ein Inline-Widget im Text-Fluss
// unmittelbar vor dem Marker statt eines Rand-Markers mit Versatz in
// Zeichenbreiten. Das Widget steht an der Text-Position des Markers und damit
// dort, wo der Browser den Marker tatsächlich zeichnet — bei jeder Schrift,
// bei Tabulatoren und hinter einem Zitat-Präfix, auch wenn die Live-Ansicht
// das Präfix ausblendet. Ein Versatz in `ch` misst dagegen die Breite der
// Ziffer Null und lag bei proportionaler Schrift auf der siebten Ebene 44 px
// neben dem Marker, im Zitat der Live-Ansicht bis 51 px.
//
// **Wie das Widget keinen Platz nimmt.** Es ist ein leeres Inline-Element mit
// absolut positionierten Kindern ohne `left`: Die Kinder stehen waagerecht an
// ihrer statischen Position, also genau an der Text-Stelle des Widgets, und
// verschieben keinen Buchstaben. Der Anzeiger rückt mit einem negativen
// Außenabstand um seine Breite davor. Die senkrechte Linie zu den
// Unterpunkten ist ein zweites Kind desselben Widgets, beginnt an der
// Unterkante der Start-Zeile und reicht bis zur Unterkante der letzten Zeile
// des Punkts; Bezugsrahmen ist die Zeile (`position: relative` über die
// Zeilen-Klasse `scg-list-track-line`). **Warum keine Linie je Zeile:** Ein
// Element mitten in einer mit Tabulatoren eingerückten Zeile änderte in der
// Messung die Breite der folgenden Tabulatoren und verschob den Text um bis
// zu vier Zeichenbreiten; eine Linie aus dem Widget der Start-Zeile berührt
// die übrigen Zeilen nicht. Nur wenn die Start-Zeile oberhalb des sichtbaren
// Ausschnitts liegt, setzt ein Linien-Widget auf der ersten sichtbaren Zeile
// des Punkts fort. Der Dokument-Text bleibt unangetastet; hängender Einzug
// und Cursor-Sprung hinter den Marker rechnen am Text und sehen die Widgets
// nicht.
//
// **Warum eine Fabrik.** Falt-Struktur und Falt-Kommandos liegen in folding.js,
// das dieses Modul in das Bündel der Gliederung aufnimmt; ein Import in die
// Gegenrichtung schlösse einen Kreis über die Ordner-Grenze (Wächter
// scripts/lint-ordner-importe.js). folding.js reicht deshalb hinein, was hier
// gebraucht wird.
'use strict';

import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { countColumn } from '@codemirror/state';
import { foldState } from '@codemirror/language';

import { LIST_FOLD_TRACK_STRUKTUR, getListFoldTrackPosition } from './list-fold-track-setting.js';

const lineDeco = Decoration.line({ class: 'scg-list-track-line' });

// Senkrechte Linie unter einem Anzeiger: von der Unterkante der Zeile, in der
// sie beginnt, bis zur Unterkante der letzten Zeile des Listenpunkts. Die
// Höhen kommen aus der Höhen-Karte des Editors (`lineBlockAt`) und damit
// samt umgebrochener Folgezeilen und gefalteter Unterpunkte; bei einer
// Änderung der Geometrie baut das Plugin neu.
function guideLine(top, height) {
  const line = document.createElement('span');
  line.className = 'scg-list-guide-line';
  line.style.top = top + 'px';
  line.style.height = height + 'px';
  return line;
}

// Falt-Anzeiger vor dem Marker, mit der Linie zu den Unterpunkten als Kind.
// Die Zeilennummer steht im DOM und wird beim Klick gelesen, damit ein
// wiederverwendetes Element nie auf eine alte Zeile zeigt. `ignoreEvent`
// bleibt bei der Vorgabe `true`: Der Editor setzt beim Klick auf den Anzeiger
// keine Schreibmarke, das Falten übernimmt der eigene Hörer. Das Zeichen
// (⌄ offen, › gefaltet) setzt das Stilblatt über `data-folded` als
// Pseudo-Inhalt, damit der Text-Inhalt der Zeile im DOM der Dokument-Text
// bleibt.
class ListFoldIndicator extends WidgetType {
  constructor(fromLine, folded, guide, toggle) {
    super();
    this.fromLine = fromLine;
    this.folded = folded;
    this.guide = guide; // {top, height} oder null
    this.toggle = toggle;
  }
  eq(other) {
    return (
      other.fromLine === this.fromLine &&
      other.folded === this.folded &&
      sameGuide(other.guide, this.guide)
    );
  }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'scg-list-fold';
    const marker = document.createElement('span');
    marker.className = 'scg-list-fold-marker';
    marker.dataset.folded = String(this.folded);
    marker.dataset.foldKind = 'block';
    marker.dataset.foldLine = String(this.fromLine);
    marker.addEventListener('mousedown', (event) => event.preventDefault());
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      const line = parseInt(marker.dataset.foldLine, 10);
      if (Number.isFinite(line)) this.toggle(view, line);
    });
    wrap.appendChild(marker);
    if (this.guide) wrap.appendChild(guideLine(this.guide.top, this.guide.height));
    return wrap;
  }
}

// Fortsetzung der Linie, wenn die Start-Zeile des Listenpunkts oberhalb des
// sichtbaren Ausschnitts liegt und ihr Anzeiger deshalb nicht gezeichnet
// ist: an der Einrück-Spalte der ersten sichtbaren Zeile des Punkts. `filler`
// füllt eine Zeile, die vor der Spalte endet, unsichtbar auf, als Pseudo-
// Inhalt (`data-filler`), damit er Breite hat, aber kein Text ist.
class ListGuide extends WidgetType {
  constructor(filler, height) {
    super();
    this.filler = filler;
    this.height = height;
  }
  eq(other) {
    return other.filler === this.filler && other.height === this.height;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'scg-list-guide';
    if (this.filler) {
      const filler = document.createElement('span');
      filler.className = 'scg-list-guide-filler';
      filler.dataset.filler = this.filler;
      wrap.appendChild(filler);
    }
    wrap.appendChild(guideLine(0, this.height));
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

function sameGuide(a, b) {
  if (!a || !b) return a === b;
  return a.top === b.top && a.height === b.height;
}

/**
 * Text-Stelle einer Zeile, an der die Einrück-Spalte `column` erreicht ist.
 *
 * Vor der Spalte dürfen nur Leerraum und Zitat-Zeichen stehen; Text davor
 * (eine nicht eingerückte Fortsetzung) bekommt keine Linie. Endet die Zeile
 * vorher, wird bis zur Spalte aufgefüllt — mit dem Präfix der Start-Zeile,
 * wenn die Zeile dessen Anfang ist, sonst mit Leerzeichen. Eine Stelle mitten
 * in einer Einrückung, hinter der noch ein Tabulator folgt, gilt nicht: Ein
 * Element dort ändert in Chromium die Breite der folgenden Tabulatoren und
 * verschöbe den Text (Messung vom 2026-10-28).
 *
 * @param {string} text Text der Zeile.
 * @param {number} column Einrück-Spalte in Zeichenbreiten.
 * @param {number} tabSize Tabulator-Breite des Editors.
 * @param {string} startPrefix Text der Start-Zeile vor ihrem Marker.
 * @returns {{offset: number, filler: string}|null} Stelle und Auffüllung.
 */
export function guidePosition(text, column, tabSize, startPrefix = '') {
  let col = 0;
  for (let i = 0; i < text.length; i++) {
    if (col === column) {
      const rest = /^[ \t>]*/.exec(text.slice(i))[0];
      return i > 0 && rest.includes('\t') ? null : { offset: i, filler: '' };
    }
    if (col > column) return null;
    const ch = text[i];
    if (ch !== ' ' && ch !== '\t' && ch !== '>') return null;
    col = ch === '\t' ? col + tabSize - (col % tabSize) : col + 1;
  }
  if (col === column) return { offset: text.length, filler: '' };
  if (col > column) return null;
  const filler =
    startPrefix.startsWith(text) && countColumn(startPrefix, tabSize) === column
      ? startPrefix.slice(text.length)
      : ' '.repeat(column - col);
  return { offset: text.length, filler };
}

// Höhe in ganzen Zehntel-Pixeln, damit eq bei Rundungsrauschen der
// Höhen-Karte nicht ständig neu zeichnet. Die Höhen-Karte misst in
// Bildschirm-Pixeln; der Zoom eines Dokuments (CSS-Eigenschaft `zoom` am
// Editor, app-state.js) vergrößert die Pixel-Angaben des Widgets ein zweites
// Mal, deshalb wird durch den Maßstab des Editors geteilt.
function px(value, scale) {
  return Math.round((value / (scale || 1)) * 10) / 10;
}

function buildDecorations(view, deps) {
  if (getListFoldTrackPosition() !== LIST_FOLD_TRACK_STRUKTUR) return Decoration.none;
  const struct = view.state.field(deps.structureField, false);
  if (!struct) return Decoration.none;
  const items = struct.blocks.filter((b) => b.nodeType === 'ListItem');
  if (items.length === 0) return Decoration.none;
  const { doc, tabSize } = view.state;
  const ranges = [];
  const lines = new Set();
  const done = new Set();
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (const r of items) {
      if (r.fromLine > last) break;
      if (r.toLine < first || done.has(r)) continue;
      done.add(r);
      const startLine = doc.line(r.fromLine);
      const folded = deps.isFolded(view.state, { from: r.from, to: r.to });
      const endBottom = view.lineBlockAt(doc.line(r.toLine).from).bottom;
      if (r.fromLine >= first) {
        const startBlock = view.lineBlockAt(startLine.from);
        const guide = folded
          ? null
          : {
              top: px(startBlock.height, view.scaleY),
              height: px(endBottom - startBlock.bottom, view.scaleY),
            };
        const widget = new ListFoldIndicator(r.fromLine, folded, guide, deps.toggle);
        ranges.push(Decoration.widget({ widget, side: -1 }).range(startLine.from + r.markerOffset));
        lines.add(startLine.from);
      } else if (!folded) {
        const line = doc.line(first);
        const startPrefix = startLine.text.slice(0, r.markerOffset);
        const pos = guidePosition(line.text, r.indentColumn, tabSize, startPrefix);
        if (!pos) continue;
        const height = px(endBottom - view.lineBlockAt(line.from).top, view.scaleY);
        const widget = new ListGuide(pos.filler, height);
        ranges.push(Decoration.widget({ widget, side: 1 }).range(line.from + pos.offset));
        lines.add(line.from);
      }
    }
  }
  for (const lineFrom of lines) ranges.push(lineDeco.range(lineFrom));
  return Decoration.set(ranges, true);
}

/**
 * Baut das Zeilen-Plugin der Listen-Spur.
 *
 * @param {object} deps Aus folding.js hereingereicht.
 * @param {import('@codemirror/state').StateField} deps.structureField Falt-Struktur.
 * @param {(state: object, range: {from: number, to: number}) => boolean} deps.isFolded
 * @param {(view: object, lineNumber: number) => boolean} deps.toggle Falten über die Start-Zeile.
 * @param {(update: object) => boolean} deps.isTrackChange Wechsel der Lage in der Aktualisierung.
 * @returns {ViewPlugin} Plugin mit Dekorationen.
 */
export function createListFoldTrackLine(deps) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view, deps);
      }
      update(update) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          deps.isTrackChange(update) ||
          update.startState.field(foldState, false) !== update.state.field(foldState, false) ||
          update.startState.field(deps.structureField, false) !==
            update.state.field(deps.structureField, false)
        ) {
          this.decorations = buildDecorations(update.view, deps);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
