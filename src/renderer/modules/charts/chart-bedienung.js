// 4T-002024 (Epic 3E-000192): Klick, Rechtsklick, Fokus und Escape auf dem
// Gitter einer Datentabelle und auf einem gezeichneten Diagramm — im Live-Modus
// und in der gerenderten Hälfte der geteilten Ansicht.
//
// **Warum an der Spalten-Wurzel und in der Capture-Phase.** Das Kontextmenü
// des Editors hört am Editor selbst (`view.dom`, editor/editor.js) und setzt
// die Schreibmarke an die Stelle des Klicks; im Widget eines Blocks ist das
// dessen Anfang, und der Block klappt zum Quelltext auf (Erhebung P1, P2, P4
// des Tasks). Ein Hörer an der umschließenden Spalte in der Capture-Phase
// kommt vor ihm an und hält das Ereignis auf, ohne das Menü des Editors zu
// ändern (Entscheidungen «Gitter bleibt» und «Auswählen» des Product Owners
// vom 2026-09-30). Derselbe Hörer deckt die gerenderte Hälfte ab, die bisher
// gar kein Kontextmenü hatte («Auch rechts»).
//
// **Was abgefangen wird:** ein Rechtsklick auf Gitter oder Diagramm eines
// Blocks des geöffneten Dokuments — die Lage wird gesetzt, und ein kurzes Menü
// mit genau dem einen passenden Eintrag erscheint, solange das Kommando wählbar
// ist. Im Live-Modus bei ausgeschaltetem Bearbeiten wird abgefangen, aber kein
// Menü gezeigt (Entscheidung C3 der Sitzung). **Nicht abgefangen:** in der
// Lese-Ansicht, bei ausgeschalteter Erweiterung «Diagramm zu einer
// Datentabelle» (C4, alles wie vorher) und an passiven Orten (Einbettung,
// Ausgabe eines Skript-Blocks, Karte einer Canvas-Fläche).
//
// **Linke Taste:** Auf dem Diagramm im Live-Modus wählt sie es aus (die Lage
// wird gesetzt, die Schreibmarke bleibt, der Editor behält den Fokus). Auf dem
// Gitter bleibt sie unberührt, der Zell-Editor arbeitet wie bisher; die Lage
// «Datentabelle angeklickt» wird dabei nur vermerkt.
//
// **Vom DOM zum Block** mit zwei Schlössern: im Live-Modus über die Stelle des
// Widgets (`posAtDOM`), in der gerenderten Hälfte über die Zeilen-Angabe des
// Containers (nicht über den Index, der auch Zäune in Listen zählt); in beiden
// Fällen muss an dieser Zeile ein Block derselben Art beginnen und denselben
// Inhalt tragen wie der Container.
'use strict';

import { t } from '../../i18n.js';
import { contextMenu, state } from '../app/app-state.js';
import { isCommandIdAvailable } from '../command-palette.js';
import { istAktiverOrt } from '../database/datensatz-zeilen-zugang.js';
import { showContextMenuItems } from '../dialogs/context-menu-utils.js';
import { paneEditors } from '../editor/editor.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { activeTabOfPane } from '../views/pane-lookup.js';
import { runChartEdit, runChartInsert } from './chart-commands.js';
import {
  blockBei,
  klickLage,
  lageFuer,
  loescheLage,
  registriereLageMeldung,
  setzeLage,
} from './chart-lage.js';
import { diagrammEintraege } from './chart-menu.js';
import { CHART_EXTENSION_ID } from '../../../shared/markdown/perspective-chart.js';

const BLOECKE = '.perspective-datatable, .perspective-chart';

// Vergleich des Inhalts tolerant gegen CRLF und das abschließende Zeilenende
// des Containers (Muster `normalizeBody` im Zell-Editor der Datentabelle).
function normalisiere(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
}

// Der Inhalt eines Blocks aus dem Dokument, wie ihn der Render-Weg in das
// Attribut des Containers schreibt: die Zeilen zwischen den Zaun-Zeilen, jede
// um bis zu so viele Leerzeichen gekürzt, wie der Öffner eingerückt ist
// (F4; markdown-it schneidet die Einrückung des Zauns vom Inhalt ab, der
// Schreib-Kern trägt sie mit). Gelesen wird nur der Bereich des Blocks.
function blockInhalt(doc, bereich) {
  const oeffner = doc.line(bereich.open).text;
  const einzug = oeffner.length - oeffner.replace(/^ +/, '').length;
  const schnitt = new RegExp(`^ {0,${einzug}}`);
  const bis = bereich.close === null ? doc.lines : bereich.close - 1;
  const zeilen = [];
  for (let z = bereich.open + 1; z <= bis; z++) zeilen.push(doc.line(z).text.replace(schnitt, ''));
  return zeilen.join('\n');
}

// Das Block-Element unter dem Ziel. Im Live-Modus zählt auch der Rand des
// Widgets um das Gitter herum (Erhebung P2b: leerer Rand rechts neben dem
// Gitter, innerhalb des Rahmens).
function blockElement(ziel) {
  const block = ziel.closest(BLOECKE);
  if (block) return block;
  const widget = ziel.closest('.cm-live-block');
  return widget
    ? widget.querySelector(':scope > .perspective-datatable, :scope > .perspective-chart')
    : null;
}

// Öffner-Zeile des Blocks im Dokument, oder null, wenn die Zuordnung nicht
// zweifelsfrei gelingt.
function oeffnerZeile(block, art, live, view) {
  const doc = view.state.doc;
  let zeile;
  if (live) {
    let pos;
    try {
      pos = view.posAtDOM(block);
    } catch {
      return null;
    }
    if (typeof pos !== 'number' || pos < 0) return null;
    zeile = doc.lineAt(Math.min(pos, doc.length)).number;
  } else {
    zeile = parseInt(
      art === 'diagramm' ? block.dataset.chartLineStart : block.dataset.dtLineStart,
      10,
    );
    if (!Number.isInteger(zeile) || zeile < 1 || zeile > doc.lines) return null;
  }
  // Die Bereiche des Dokument-Stands statt eines Durchlaufs über das ganze
  // Dokument je Klick und je Fokus-Wechsel (V1); sie folgen den Findern des
  // Schreib-Kerns.
  const bereich = blockBei(view.state, art, zeile);
  if (!bereich || bereich.open !== zeile) return null;
  const erwartet = art === 'diagramm' ? block.dataset.chartSource : block.dataset.dtSource;
  return normalisiere(blockInhalt(doc, bereich)) === normalisiere(erwartet) ? zeile : null;
}

/**
 * Der Treffer eines Ereignis-Ziels: Gitter oder Diagramm eines Blocks des
 * geöffneten Dokuments dieser Spalte.
 *
 * @param {EventTarget} ziel
 * @param {Element} root Spalten-Wurzel.
 * @param {number} idx Spalte.
 * @returns {{art: string, block: Element, live: boolean, view: object,
 *   tab: object, zeile: number}|null}
 */
export function trefferZu(ziel, root, idx) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const block = blockElement(ziel);
  if (!block || !root.contains(block) || !istAktiverOrt(block)) return null;
  const view = paneEditors[idx];
  const tab = activeTabOfPane(state.panes, idx);
  if (!view || !tab) return null;
  const cm = block.closest('.cm-editor');
  const live = !!cm;
  if (live ? cm !== view.dom || tab.viewMode !== 'live' : tab.viewMode === 'live') return null;
  const art = block.classList.contains('perspective-chart') ? 'diagramm' : 'datentabelle';
  const zeile = oeffnerZeile(block, art, live, view);
  return zeile === null ? null : { art, block, live, view, tab, zeile };
}

// Ohne Änderbarkeit entsteht keine Klick-Lage (F5): weder Auswahl noch
// Hervorhebung, bei Klick wie bei Rechtsklick.
function setze(tr) {
  if (tr.view.state.readOnly) return;
  tr.view.dispatch({
    effects: setzeLage.of({
      art: tr.art,
      pos: tr.view.state.doc.line(tr.zeile).from,
      modus: tr.live ? 'live' : 'split',
    }),
  });
}

function loesche(view) {
  if (view && klickLage(view.state)) view.dispatch({ effects: loescheLage.of(null) });
}

// Die Ansicht, in der die Bedienung wirkt: nicht in der Lese-Ansicht und nicht
// bei ausgeschalteter Erweiterung.
function wirkt(tr) {
  return tr.tab.viewMode !== 'rendered' && isExtensionActive(CHART_EXTENSION_ID);
}

const KOMMANDO = { 'chart.insert': runChartInsert, 'chart.edit': runChartEdit };

// Die Spalte des Editors, wenn er der aktiven Spalte gehört.
function tabDerAktivenSpalte(view) {
  const idx = state.activePaneIndex;
  return paneEditors[idx] === view ? activeTabOfPane(state.panes, idx) : null;
}

// Meldung an das Menü der Anwendung; zur Laufzeit geladen, damit dieses Modul
// den Reiter-Bereich nicht statisch an sich bindet.
function meldeMenue() {
  import('../tabs/tabs.js')
    .then((m) => m.reportMenuStateNow())
    .catch((err) => console.warn('chart-bedienung: Menü-Meldung fehlgeschlagen:', err));
}

// Ein Eingabefeld behält seinen Rechtsklick (V6), etwa die offene Zell-Eingabe
// der Datentabelle: Das Ereignis wird nicht abgebrochen (`preventDefault`
// unterdrückte auch die Rechtschreib-Meldung des Hauptprozesses), und es
// erscheint kein eigenes Menü. Weitergereicht an das Kontextmenü des Editors
// wird es aber nicht: Dessen Koordinaten-Auflösung setzte die Schreibmarke an
// den Anfang des Blocks, der Block klappte zum Quelltext auf, und die offene
// Eingabe ginge samt ihrem Wert verloren (gemessen am 2026-09-30 an der
// laufenden Anwendung).
const EINGABE = 'input, textarea';

// Offene Oberflächen, denen ein Escape ohne Fokus gehört: Menü, Dialoge (auch
// die zur Laufzeit gebauten), Kommando-Palette.
const OFFENE_OBERFLAECHE =
  '.bookmark-modal:not([hidden]), .about-modal:not([hidden]), ' +
  '.alias-modal:not([hidden]), .wordcount-modal:not([hidden])';

// Escape bei Fokus auf der Seite (F6): nach dem Schließen der Palette etwa
// steht der Fokus auf `body`, und der Hörer an der Spalten-Wurzel erreicht die
// Taste nicht. Dann gilt sie der aktiven Spalte.
function beiEscapeAufDerSeite(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.target !== document.body) return;
  if (contextMenu && !contextMenu.hidden) return;
  if (document.querySelector(OFFENE_OBERFLAECHE)) return;
  loesche(paneEditors[state.activePaneIndex]);
}
let seitenHoererGebunden = false;

const gebunden = new WeakSet();

/**
 * Bindet die Bedienung an die Wurzel einer Spalte (einmal je Spalte).
 *
 * @param {Element} root Spalten-Wurzel (`.pane-group`).
 * @param {number} idx Spalte.
 * @param {object} [umgebung] Ersatz der Anschlüsse in Prüfungen.
 * @param {Function} [umgebung.istVerfuegbar] (kommandoId) => boolean; ohne
 *   Angabe `isCommandIdAvailable` der Kommando-Palette.
 * @param {Function} [umgebung.meldeMenue] Meldung an das Menü der Anwendung.
 */
export function bindeDiagrammBedienung(root, idx, umgebung = {}) {
  if (!root || typeof root.addEventListener !== 'function' || gebunden.has(root)) return;
  gebunden.add(root);
  const istVerfuegbar =
    typeof umgebung.istVerfuegbar === 'function' ? umgebung.istVerfuegbar : isCommandIdAvailable;
  registriereLageMeldung(
    typeof umgebung.meldeMenue === 'function' ? umgebung.meldeMenue : meldeMenue,
    tabDerAktivenSpalte,
  );
  if (!seitenHoererGebunden) {
    seitenHoererGebunden = true;
    document.addEventListener('keydown', beiEscapeAufDerSeite);
  }

  // Ein Klick daneben hebt die Lage auf — im eigenen Editor oder in der
  // gerenderten Hälfte dieser Spalte, nicht in einem Neben-Editor der Spalte
  // wie dem Notiz-Feld der Seitenleiste (V5).
  const daneben = (ziel) => {
    const view = paneEditors[idx];
    const gerendert = root.querySelector('.pane-rendered .markdown-body');
    return (
      (view && view.contentDOM.contains(ziel)) || (gerendert !== null && gerendert.contains(ziel))
    );
  };

  root.addEventListener(
    'contextmenu',
    (e) => {
      const tr = trefferZu(e.target, root, idx);
      if (!tr || !wirkt(tr)) return;
      // Im Eingabefeld: kein Abbruch, kein eigenes Menü, nicht an den Editor
      // (siehe `EINGABE`); die Lage entsteht trotzdem (V6).
      if (e.target.closest(EINGABE)) {
        e.stopPropagation();
        setze(tr);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Ohne Änderbarkeit abgefangen, aber ohne Lage und ohne Menü (C3, F5).
      if (tr.view.state.readOnly) return;
      setze(tr);
      const eintraege = diagrammEintraege({
        lage: lageFuer(tr.view, tr.tab),
        t,
        ausfuehren: (id) => KOMMANDO[id](idx),
      }).filter((eintrag) => istVerfuegbar(eintrag.commandId));
      // Ein leeres Menü wird nicht gezeigt; bei ausgeschaltetem Bearbeiten
      // bleibt es damit beim Abfangen (C3).
      if (eintraege.length === 0) return;
      showContextMenuItems(eintraege, e.clientX, e.clientY);
    },
    true,
  );

  root.addEventListener(
    'mousedown',
    (e) => {
      if (!(e.target instanceof Element)) return;
      const view = paneEditors[idx];
      const tr = trefferZu(e.target, root, idx);
      const auswahl =
        tr &&
        wirkt(tr) &&
        (e.button === 2 || (e.button === 0 && (tr.art === 'datentabelle' || tr.live)));
      if (!auswahl) {
        if (daneben(e.target)) loesche(view);
        return;
      }
      // Knopf 0 auf dem Gitter bleibt beim Zell-Editor, ein Eingabefeld behält
      // jede Taste (V6); sonst hält das Verhindern die Auswahl des Browsers
      // auf, die die Schreibmarke in den Block setzte (Muster
      // database/datensatz-zeilen-zugang.js).
      const halten = !e.target.closest(EINGABE) && (e.button === 2 || tr.art === 'diagramm');
      if (halten) e.preventDefault();
      setze(tr);
      if (halten && tr.live) tr.view.focus();
    },
    true,
  );

  // Die gerenderte Hälfte erreicht das Gitter auch mit der Tastatur: Der Fokus
  // auf einer Zelle vermerkt die Lage wie ein Klick.
  root.addEventListener('focusin', (e) => {
    const tr = trefferZu(e.target, root, idx);
    if (!tr || tr.live || tr.art !== 'datentabelle' || !wirkt(tr)) return;
    setze(tr);
  });

  // Escape hebt die Lage auf — nur, wenn niemand sonst die Taste genommen hat,
  // kein Menü offen ist und kein Eingabefeld den Fokus hat.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (contextMenu && !contextMenu.hidden) return;
    const ziel = e.target;
    if (ziel instanceof Element && ziel.closest('input, textarea, select')) return;
    loesche(paneEditors[idx]);
  });
}
