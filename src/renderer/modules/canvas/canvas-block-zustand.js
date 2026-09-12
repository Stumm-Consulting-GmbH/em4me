// 4T-001668 (Epic 3E-000287): Bedienung und Ansichts-Zustand des Canvas-Blocks
// außerhalb der Canvas-Ansicht (Entscheidung E8).
//
// Das Markup baut die Pipeline (`src/shared/markdown/canvas-block.js`); hier
// kommt dazu, was ein Dokument braucht: der **Zugang** zur Canvas-Ansicht und
// der **Klapp-Zustand** je geöffnetem Dokument und Fence.
//
// **Der Klapp-Zustand lebt im Arbeitsspeicher** — eine `WeakMap` je geöffnetem
// Dokument mit einer `Map` je Fence-Stelle, Muster `events-view-state.js`. Er
// wird **nie** in das Dokument geschrieben: Eine reine Ansichts-Handlung darf
// das Dokument nicht schmutzig machen, und bei einem Format mit zugesagter
// Byte-Gleichheit (G2 aus 4T-001652) wäre ein in die Fence geschriebener
// Klapp-Zustand besonders unangenehm. Er stirbt mit dem geöffneten Dokument.
//
// **Die Stelle der Fence ist der Schlüssel** — die Zeile ihrer öffnenden
// Zaun-Zeile. Verschiebt sich die Fence im Text, geht der Klapp-Zustand
// verloren; eine Wiedererkennungs-Heuristik wäre für eine Anzeige-Kleinigkeit
// mehr Maschinerie, als der Nutzen trägt.
//
// **Warum die Klick-Pfade hier binden und nicht über die zentralen
// CodeMirror-Handler laufen:** `MarkdownBlockWidget.ignoreEvent()` liefert
// `true`, weshalb CodeMirror kein Zeiger-Ereignis aus dem Widget an seine
// Handler gibt. Das gilt für **alle** Block-Widgets derselben Klasse; es zu
// öffnen träfe Perspective-Tabellen, Ereignis-Fences und Fenced-Code mit.
// Deshalb bindet der Block seinen eigenen Handler, wie es der
// Pipe-Tabellen-Klick (`live-table-klick.js`) und der Datatable-Grid-Editor
// bereits tun.
//
// **Warum der Fenster-Zustand injiziert und nicht importiert wird** (Muster
// `initCanvasPane` im Nachbar-Modul): Ein statischer Import von `app-state.js`
// oder der Kommando-Palette zöge diesen Ordner in den eingefrorenen
// Datei-Zyklus des Renderers, und der Ordner-Import-Wächter ist eine Ratsche.
// Dieses Modul importiert deshalb außer CodeMirror gar nichts — es wird von
// `render-mermaid.js` und `live-widget-render.js` gerufen, die beide **in**
// jener Komponente liegen.
'use strict';

import { EditorView } from '@codemirror/view';

// Injizierter Zugang zum Fenster-Zustand; siehe Modul-Kopf.
let umgebung = null;

// tab -> Map<startZeile, true>. Nur zugeklappte Fences stehen darin; der
// Normalfall «aufgeklappt» braucht keinen Eintrag.
const zugeklappt = new WeakMap();

/**
 * Verdrahtet die Bedienung des Canvas-Blocks mit dem Fenster-Zustand.
 *
 * @param {object} zugang
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument oder null.
 * @param {Function} zugang.oeffneFlaeche (paneIdx, startZeile) => void. Wechselt
 *   in die Canvas-Ansicht der Spalte und wählt dort die Fläche dieser Fence.
 */
export function initCanvasBlock(zugang) {
  umgebung = zugang || null;
}

/**
 * Spalten-Index eines Blocks. Die Spalten-Gruppe umschließt sowohl den Editor
 * (Live-Modus) als auch die Lese-Ansicht, weshalb **ein** Weg für beide
 * Herkünfte genügt.
 *
 * @param {Element} el
 * @returns {number} Index oder -1.
 */
export function spalteZu(el) {
  const gruppe = el && el.closest ? el.closest('.pane-group') : null;
  if (!gruppe) return -1;
  const idx = parseInt(gruppe.dataset.pane, 10);
  return Number.isFinite(idx) ? idx : -1;
}

/**
 * Stelle der Fence im **aktuellen** Dokument.
 *
 * Im Live-Modus taugt das Attribut des Markups nicht: Das Block-Widget rendert
 * allein den Quelltext der Fence, die Pipeline zählt ihre Zeilen deshalb ab
 * eins. Die echte Stelle kennt dort nur der Editor — sie ist die Zeile, an der
 * das Widget im Dokument steht. In der Lese-Ansicht ist das Attribut dagegen
 * genau richtig, weil dort das ganze Dokument durch die Pipeline lief.
 *
 * @param {Element} block
 * @returns {number} 1-basierte Zeile oder 0.
 */
export function startZeileZu(block) {
  const editorEl = block && block.closest ? block.closest('.cm-editor') : null;
  if (editorEl) {
    const view = EditorView.findFromDOM(editorEl);
    if (!view) return 0;
    try {
      const pos = Math.min(view.posAtDOM(block), view.state.doc.length);
      return view.state.doc.lineAt(Math.max(0, pos)).number;
    } catch {
      return 0;
    }
  }
  const attr = parseInt(block && block.dataset ? block.dataset.canvasStart : '', 10);
  return Number.isFinite(attr) ? attr : 0;
}

function zustandFuer(block, erzeugen) {
  if (!umgebung || typeof umgebung.aktivesDokument !== 'function') return null;
  const tab = umgebung.aktivesDokument(spalteZu(block));
  if (!tab) return null;
  let karte = zugeklappt.get(tab);
  if (!karte) {
    if (!erzeugen) return null;
    karte = new Map();
    zugeklappt.set(tab, karte);
  }
  return karte;
}

// Setzt Klasse, Knopf-Beschriftung und aria-Zustand auf den gemerkten Stand.
function wendeAn(block, zu) {
  block.classList.toggle('canvas-block-ist-zu', zu);
  const knopf = block.querySelector('.canvas-block-klappen');
  if (!knopf) return;
  knopf.setAttribute('aria-expanded', zu ? 'false' : 'true');
  knopf.textContent = zu ? '+' : '−';
  // Die beiden Beschriftungen kommen aus dem Markup, damit dieses Modul das
  // i18n-Modul nicht importieren muss (siehe Modul-Kopf).
  const titel = zu ? knopf.dataset.canvasAuf : knopf.dataset.canvasZu;
  if (titel) knopf.title = titel;
}

/**
 * Bindet die Klick-Pfade aller Canvas-Blöcke im Container und stellt ihren
 * Klapp-Zustand wieder her.
 *
 * Läuft bei **jedem** Einhängen — auch beim Cache-Klon eines Live-Widgets,
 * weil `cloneNode` die Listener verliert (Muster der übrigen Nachverarbeitung).
 * Ist der Container noch nicht angeschlossen, wird der Versuch kurz
 * wiedervorgelegt: `posAtDOM` braucht ein angeschlossenes Element (Muster
 * `applyPerspectiveEventsViewStates`).
 *
 * @param {Element} container
 * @param {number} [versuche]
 */
export function applyCanvasBlocks(container, versuche = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const bloecke =
    container.classList && container.classList.contains('canvas-block')
      ? [container]
      : Array.from(container.querySelectorAll('.canvas-block'));
  if (bloecke.length === 0) return;
  if (!container.isConnected) {
    if (versuche > 0) {
      requestAnimationFrame(() => applyCanvasBlocks(container, versuche - 1));
    }
    return;
  }
  for (const block of bloecke) {
    // Blöcke in einer Markdown-Einbettung bleiben passiv (Muster
    // `resolveContext` der Ereignis-Fence): Ihre Stelle bezieht sich auf die
    // eingebettete Datei und nicht auf das geöffnete Dokument. Ein Zugang, der
    // in der falschen Datei suchte, wäre schlechter als keiner — der Block
    // zeigt weiter Art, Umfang und Vorschau, seine Knöpfe verschwinden.
    if (block.closest('.wiki-embed-md-body')) {
      block.classList.add('canvas-block-passiv');
      continue;
    }
    const startZeile = startZeileZu(block);
    const karte = zustandFuer(block, false);
    wendeAn(block, !!(karte && karte.get(startZeile)));
    if (block.dataset.canvasGebunden === '1') continue;
    block.dataset.canvasGebunden = '1';
    binde(block);
  }
}

// **mousedown statt click**, wie beim übrigen Klick-Pfad des Live-Modus: Ein
// click-Handler käme nach der Auswahl-Behandlung des Browsers, und genau die
// setzte den Schreibpunkt in die Fence — der Block klappte auf, noch bevor die
// Ansicht gewechselt hat (AK5).
function binde(block) {
  block.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const ziel = event.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    const knopf = ziel.closest('.canvas-block-knopf');
    if (!knopf || !block.contains(knopf)) return;
    // Der Schreibpunkt darf sich nicht bewegen: `preventDefault` hält die
    // Auswahl des Browsers auf, `stopPropagation` die Handler darüber.
    event.preventDefault();
    event.stopPropagation();
    const startZeile = startZeileZu(block);
    if (knopf.classList.contains('canvas-block-klappen')) {
      const karte = zustandFuer(block, true);
      const zu = !(karte && karte.get(startZeile));
      if (karte) {
        if (zu) karte.set(startZeile, true);
        else karte.delete(startZeile);
      }
      wendeAn(block, zu);
      return;
    }
    if (knopf.classList.contains('canvas-block-oeffnen')) {
      if (!umgebung || typeof umgebung.oeffneFlaeche !== 'function') return;
      umgebung.oeffneFlaeche(spalteZu(block), startZeile);
    }
  });
}
