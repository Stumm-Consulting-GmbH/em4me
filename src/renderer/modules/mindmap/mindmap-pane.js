// 4T-1047 (Epic 3E-0151): Einbettung der Mindmap-Ansicht in die Pane.
//
// Hält je Spalte genau eine Ansichts-Instanz, versorgt sie mit dem Baum aus
// der Preload-Brücke und aktualisiert sie verzögert nach Dokument-Änderungen
// (Muster der Gliederungs-Sicht: ein Zeitgeber je Spalte). Der Sprung zur
// Quellzeile geht über dieselben Wege wie die Gliederung.
//
// Die Ansicht selbst (mindmap-view.js) kennt weder api noch i18n noch den
// Fenster-Zustand; alles davon wird hier gereicht. Dieses Modul ist damit die
// einzige Stelle, an der die Mindmap den Renderer-Zustand berührt.
'use strict';

import { EditorView } from '@codemirror/view';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { getPaneEls, state, tabDisplayName } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { resolveMindmapOptionen } from '../../../shared/mindmap-optionen.js';
import { getMindmapVoreinstellung } from './mindmap-einstellungen.js';
import { createMindmapView } from './mindmap-view.js';

// Verzögerung der Live-Aktualisierung. Gleicher Wert wie die Gliederung:
// Er ist am Tippen erprobt und hält die Karte gefühlt sofort aktuell.
export const MINDMAP_RENDER_DEBOUNCE_MS = 200;

const ansichten = []; // paneIdx -> Controller
const timer = []; // paneIdx -> Zeitgeber

// Springt zur Quellzeile und macht sie sichtbar.
//
// 4T-1054: Der Sprung **wechselt in die geteilte Ansicht** (Entscheidung des
// Product Owners vom 2026-08-16). Vorher setzte er nur den Cursor, und zwar im
// Editor der Mindmap-Ansicht, die den Editor gerade ausblendet: Für den Nutzer
// passierte sichtbar nichts. Ein Sprung, den man nicht sieht, ist kein Sprung.
//
// Der Moduswechsel läuft über ein Ereignis statt über einen Import von
// views.js. Grund ist der Zyklus: views.js importiert dieses Modul bereits für
// das Zeichnen, und die Gegenrichtung zöge die Ansichts-Ebene in die
// Lade-Kette der Mindmap. Nach dem Vorfall in 4T-1047 wird diese Richtung
// bewusst über eine Meldung entkoppelt.
export const MINDMAP_JUMP_EVENT = 'scg:mindmap-jump';

function springeZuZeile(paneIdx, zeile) {
  if (zeile == null) return;
  document.dispatchEvent(new CustomEvent(MINDMAP_JUMP_EVENT, { detail: { paneIdx, zeile } }));
}

/**
 * Setzt den Cursor auf die Zeile und rückt sie ins Bild. Wird von der
 * Ansichts-Ebene gerufen, **nachdem** sie den Modus gewechselt hat; vorher
 * wäre der Editor unsichtbar und der Sprung wirkungslos.
 */
export function setzeCursorAufZeile(paneIdx, zeile) {
  const view = paneEditors[paneIdx];
  if (!view || zeile == null) return;
  const doc = view.state.doc;
  const nummer = Math.min(Math.max(1, zeile + 1), doc.lines);
  const linie = doc.line(nummer);
  view.dispatch({
    selection: { anchor: linie.from },
    effects: EditorView.scrollIntoView(linie.from, { y: 'center' }),
  });
  view.focus();
}

// Baut die Ansicht einer Spalte auf, falls noch nicht vorhanden.
function ansichtFuer(paneIdx) {
  if (ansichten[paneIdx]) return ansichten[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!els || !els.mindmapEl) return null;
  els.mindmapEl.innerHTML = '';
  ansichten[paneIdx] = createMindmapView(els.mindmapEl, {
    t,
    onJumpToLine: (zeile) => springeZuZeile(paneIdx, zeile),
  });
  return ansichten[paneIdx];
}

/**
 * Zeichnet die Mindmap der Spalte neu. Holt den Baum über die Brücke, weil
 * die Markdown-Pipeline im Preload lebt; der Aufruf ist synchron und damit
 * so billig wie das Rendern der Lese-Ansicht.
 */
export function renderMindmap(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || tab.viewMode !== 'mindmap') return;
  const ansicht = ansichtFuer(paneIdx);
  if (!ansicht) return;

  const inhalt = typeof tab.content === 'string' ? tab.content : '';
  let ergebnis;
  try {
    // Der Anzeigename trägt die Wurzel, wenn das Dokument nicht genau eine
    // Überschrift erster Ebene hat; er deckt Pfad-, Handbuch- und
    // Unbenannt-Reiter bereits lokalisiert ab.
    ergebnis = api.buildMindmap(inhalt, { wurzelTitel: tabDisplayName(tab) });
  } catch {
    ergebnis = null;
  }
  // 4T-1048: Effektive Optionen aus Voreinstellung und Kopfbereich des
  // Dokuments. Der Kopfbereich wird hier gelesen und nicht in der Brücke,
  // weil dort der Baum entsteht und nicht die Darstellung.
  let fmData;
  try {
    fmData = extractFrontmatter(inhalt).data;
  } catch {
    fmData = null;
  }
  const optionen = resolveMindmapOptionen(getMindmapVoreinstellung(), fmData);
  ansicht.setTree(ergebnis ? ergebnis.root : null, {
    gekappt: Boolean(ergebnis && ergebnis.gekappt),
    darstellung: optionen,
    anfangsTiefe: optionen.anfangsTiefe >= 0 ? optionen.anfangsTiefe : null,
  });
}

/** Verzögerte Aktualisierung nach einer Dokument-Änderung. */
export function scheduleMindmapRender(paneIdx) {
  if (timer[paneIdx]) clearTimeout(timer[paneIdx]);
  timer[paneIdx] = setTimeout(() => {
    timer[paneIdx] = null;
    renderMindmap(paneIdx);
  }, MINDMAP_RENDER_DEBOUNCE_MS);
}

/** Passt die Karte der Spalte in das Sichtfenster ein. */
export function fitMindmap(paneIdx) {
  const ansicht = ansichten[paneIdx];
  if (ansicht) ansicht.fit();
}

/**
 * Löst die Ansicht einer Spalte. Wird beim Verlassen des Modus gerufen,
 * damit weder Zeitgeber noch Fenster-Listener zurückbleiben.
 */
export function destroyMindmap(paneIdx) {
  if (timer[paneIdx]) {
    clearTimeout(timer[paneIdx]);
    timer[paneIdx] = null;
  }
  const ansicht = ansichten[paneIdx];
  if (ansicht) {
    ansicht.destroy();
    ansichten[paneIdx] = null;
  }
}

// 4T-1048 (Epic 3E-0151): Eine geänderte Voreinstellung wirkt ohne Neustart
// auf offene Karten (Story 4S-0805, AK5). Das Ereignis kommt aus
// mindmap-einstellungen.js, sobald der Nutzer den Bereich anwendet.
document.addEventListener('scg:mindmap-optionen-changed', () => {
  for (let paneIdx = 0; paneIdx < state.panes.length; paneIdx++) renderMindmap(paneIdx);
});
