// 4T-001344 (Epic 3E-000239): Klick in die gerenderte Pipe-Tabelle der
// Live-Ansicht. Der Klick trifft die Zelle, in der er landet, und setzt die
// Schreibmarke an die angeklickte Stelle ihres Quelltextes.
//
// **Warum ein eigener Handler am Container.** MarkdownBlockWidget.ignoreEvent()
// liefert true, weshalb CodeMirror keinerlei Zeiger-Ereignis aus dem Widget an
// seine Handler gibt. Dieses ignoreEvent gilt aber nicht nur fuer Pipe-Tabellen,
// sondern fuer alle Block-Widgets derselben Klasse — Perspective-Tabellen,
// Ereignis-Fences, Fenced-Code, Journal-Navigation, Timeline und Skript-Bloecke.
// Es zu oeffnen traefe alle; deshalb bindet das Widget hier seinen eigenen
// Handler, wie es das FrontmatterBlockWidget (live-mermaid-widget.js) und der
// Datatable-Grid-Editor bereits tun. Die Abgrenzung auf klassische
// Pipe-Tabellen leistet der Aufrufer ueber den Cache-Schluessel.
'use strict';

import { EditorView } from '@codemirror/view';

import { locatePipeCellPosition, parsePipeTable } from '../../../shared/markdown/table-edit.js';
// 4T-001345 (Epic 3E-000239): Zell-Eingabe in der stehenden Tabelle. Der
// Klick-Pfad setzt die Schreibmarke und uebergibt dann an den Zell-Editor;
// beide Zugriffe laufen zur Laufzeit im Handler, der Import bleibt gerichtet.
import { ereignisGehoertZurBearbeitung } from './live-table-zelle.js';

// Logische Zelle aus dem gerenderten DOM (exportiert, weil der Unit-Test die
// Zuordnung ohne laufenden Editor pruefen koennen soll): Kopfzeilen liegen im thead, Datenzeilen
// im tbody. markdown-it erzeugt fuer Pipe-Tabellen weder colspan noch rowspan,
// weshalb der Kind-Index der Zelle unmittelbar der Spalte entspricht.
export function zellPosition(zeile, zelle) {
  const imKopf = !!zelle.closest('thead');
  const geschwister = zeile.parentElement ? zeile.parentElement.children : [];
  const rowIndex = imKopf ? 0 : Array.prototype.indexOf.call(geschwister, zeile);
  const col = Array.prototype.indexOf.call(zeile.children, zelle);
  return { rowKind: imKopf ? 'header' : 'body', rowIndex: Math.max(0, rowIndex), col };
}

// Zeichen-Offset des Klicks im Text der Zelle — die Stelle, an der die
// Schreibmarke landen soll (AK3).
//
// **Warum nur bei einfachem Text.** Der gerenderte Zell-Text und der Quelltext
// der Zelle sind nicht dasselbe, sobald Auszeichnung im Spiel ist: `**fett**`
// wird zu `fett`, ein Link zu seinem Titel, `\|` zu `|`. Ein zeichengenaues
// Zurueckrechnen brauchte eine Quell-Zuordnung durch das Inline-Rendering, also
// eine zweite Abbildung neben dem Renderer, die bei jedem neuen Inline-Konstrukt
// mitzupflegen waere. Entscheidung des Product Owners vom 2026-09-04: Zellen
// ohne Auszeichnung treffen zeichengenau, ausgezeichnete Zellen fallen auf den
// Anfang des Zell-Inhalts zurueck. Erkannt wird der einfache Fall daran, dass
// die Zelle aus genau einem Textknoten besteht und dieser mit dem Quelltext der
// Zelle uebereinstimmt.
export function klickOffsetInZelle(event, zelle, quellText) {
  const knoten = zelle.childNodes.length === 1 ? zelle.firstChild : null;
  if (!knoten || knoten.nodeType !== Node.TEXT_NODE) return 0;
  if (String(knoten.textContent) !== quellText) return 0;
  let treffer = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    treffer = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const p = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (p) treffer = { startContainer: p.offsetNode, startOffset: p.offset };
  }
  if (!treffer || treffer.startContainer !== knoten) return 0;
  return Math.max(0, Math.min(treffer.startOffset, quellText.length));
}

// Bindet den Klick-Pfad an den Container eines Pipe-Tabellen-Widgets. `source`
// ist der Roh-Quelltext des Tabellen-Blocks, mit dem das Widget gebaut wurde.
// Laeuft bei jedem Einhaengen des Widgets — auch beim Cache-Klon, weil
// cloneNode die Listener verliert (Muster der uebrigen Nachverarbeitung).
export function bindLiveTableCellClicks(container, source) {
  // 4T-001346: Die Laenge des Blocks am Container. Der Auswahl-Beobachter
  // (live-table-zelle.js) erkennt daran, ob eine Stelle des Dokuments in DIESER
  // Tabelle liegt, ohne den Quelltext ein zweites Mal im DOM zu halten — er
  // steht ohnehin im Dokument und wird von dort gelesen.
  container.dataset.tabellenLaenge = String(String(source).length);
  // **mousedown statt click**, wie beim uebrigen Klick-Pfad des Live-Modus:
  // Ein click-Handler kaeme nach der Auswahl-Behandlung des Browsers.
  container.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const ziel = event.target;
    if (!(ziel instanceof Element)) return;
    // 4T-001345: Ein Klick INS offene Eingabefeld setzt nur die Schreibmarke
    // darin; er darf die Bearbeitung nicht ein zweites Mal oeffnen.
    if (ereignisGehoertZurBearbeitung(ziel)) return;
    const zelle = ziel.closest('th, td');
    if (!zelle || !container.contains(zelle)) return;
    // Perspective-Tabellen und Ereignis-Fences bringen ihren eigenen
    // Zell-Editor mit und bleiben unberuehrt.
    if (zelle.closest('.perspective-datatable, .perspective-events')) return;
    const zeile = zelle.closest('tr');
    if (!zeile) return;
    // Kein Editor, kein Klick-Pfad. Das ist zugleich die Abgrenzung zur
    // Lese-Ansicht und zum Handbuch: Beide zeigen ihre Tabellen ueber die
    // Render-Pane und nicht ueber ein Live-Widget, dort gibt es weder diesen
    // Container noch eine View. Ein zusaetzlicher Riegel gegen den
    // schreibgeschuetzten Editor waere hier falsch — die Schreibmarke zu
    // setzen ist keine Aenderung, und der Weg ueber die Pfeiltasten fuehrt
    // dort ebenso in die Tabelle.
    const editorEl = container.closest('.cm-editor');
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    if (!view) return;
    const lines = String(source).split('\n');
    const model = parsePipeTable(lines);
    // Strukturell defekte Tabelle: nicht bearbeiten, sondern dem Bestands-Weg
    // ueberlassen (Architekturentscheidung E4 des Epics).
    if (!model) return;
    const pos = zellPosition(zeile, zelle);
    const stelle = locatePipeCellPosition(lines, model, pos);
    const zeilenText = lines[stelle.line] || '';
    const quellText = zeilenText.slice(stelle.contentStart, stelle.contentEnd);
    const feinOffset = klickOffsetInZelle(event, zelle, quellText);
    const basis = view.posAtDOM(container);
    const anker = basis + stelle.offset + feinOffset;
    event.preventDefault();
    view.dispatch({
      selection: { anchor: Math.max(0, Math.min(anker, view.state.doc.length)) },
      scrollIntoView: true,
    });
    view.focus();
  });
}
