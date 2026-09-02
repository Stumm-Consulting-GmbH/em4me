// 4T-001311 (Epic 3E-000235): Den Inhalt eines Reiters durch eine andere Datei
// ersetzen, ohne den Reiter selbst aufzugeben.
//
// Der Unterschied zum Öffnen ist der Zustand. Ein neu geöffneter Reiter
// beginnt in der Voreinstellung: Ansichts-Modus und Änderungs-Modus lösen sich
// neu auf, Vergrößerung und Zeilen-Optionen fallen auf ihren Ausgangswert, und
// der Reiter reiht sich neben seiner Herkunft ein. Beim Blättern ist genau das
// falsch — wer im geteilten Modus arbeitet, will nach dem Blättern nicht in
// der gesetzten Ansicht landen.
//
// Deshalb behält das Reiter-Objekt seine Identität und tauscht nur Pfad und
// Inhalt. Erhalten bleiben damit ohne eigenes Zutun: Ansichts-Modus,
// Änderungs-Modus, Vergrößerung, Zeilenumbruch, Zeilennummern, Klapp-Rand,
// Scroll-Kopplung, Gruppen-Zugehörigkeit und Position im Streifen.
//
// Das Modul liegt neben tabs.js und nicht darin: Die Reiter-Verwaltung steht
// dicht an ihrem Größen-Budget, und der Ersetzungs-Weg ist eine eigene, klar
// benennbare Fachlichkeit mit genau einem Einstieg.
'use strict';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { clearIndexOverlayFor } from '../editor/editor.js';
import {
  activatePane,
  activateTab,
  bestaetigeAufgabeDesInhalts,
  findTabAcrossPanes,
} from './tabs.js';
import { showStatusbarHint } from '../views/views.js';
import { t } from '../../i18n.js';

/**
 * Zeigt `zielPfad` im Reiter (paneIdx, tabIdx) statt der bisherigen Datei.
 *
 * Drei Vorbedingungen, in dieser Reihenfolge geprüft:
 *
 *   1. **Bereits offen.** Liegt die Ziel-Datei in irgendeinem Reiter, wird
 *      dieser aktiviert und nichts ersetzt. Das entspricht dem Verhalten
 *      aller Verweise und verhindert zwei Reiter derselben Datei.
 *   2. **Ungesicherte Änderungen.** Der Wechsel gibt den bisherigen Inhalt
 *      auf, also greift dieselbe Rückfrage wie beim Schließen. Ein Abbruch
 *      lässt alles stehen.
 *   3. **Lesbarkeit.** Scheitert das Lesen, bleibt der bisherige Eintrag
 *      stehen und ein Hinweis erscheint; ein halb ersetzter Reiter wäre der
 *      schlechtere Zustand.
 *
 * Liefert true, wenn der Reiter danach die Ziel-Datei zeigt (auch über den
 * Weg „war schon offen").
 */
export async function ersetzeTabDurchDatei(paneIdx, tabIdx, zielPfad) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.tabs[tabIdx];
  if (!tab || !zielPfad) return false;
  if (tab.path === zielPfad) return true;

  const offen = findTabAcrossPanes(zielPfad);
  if (offen) {
    activatePane(offen.paneIdx);
    activateTab(offen.paneIdx, offen.tabIdx);
    api.pushRecent(zielPfad);
    return true;
  }

  if (!(await bestaetigeAufgabeDesInhalts(paneIdx, tabIdx))) return false;

  // Zwischen Rückfrage und Ersetzung kann sich der Streifen verschoben haben
  // (der Speichern-Zweig läuft asynchron). Die Position wird deshalb neu
  // bestimmt, statt dem alten Index zu vertrauen.
  const stelle = stelleDesReiters(tab);
  if (!stelle) return false;

  let daten;
  try {
    daten = await api.readFile(zielPfad);
  } catch {
    daten = null;
  }
  if (!daten || !daten.ok) {
    showStatusbarHint(null, {
      text: t('open.failedHint').replace('{name}', api.basename(zielPfad) || zielPfad),
      error: true,
      duration: 3000,
    });
    return false;
  }

  const alterPfad = tab.path;
  tab.path = daten.path;
  tab.content = daten.content;
  tab.originalContent = daten.content;
  tab.dirty = false;
  tab.missing = false;
  tab.untitledIndex = null;
  tab.scrollSrc = 0;
  tab.scrollRen = 0;

  // Die alte Datei verliert ihre Beobachtung und ihr Puffer-Overlay, sofern
  // kein anderer Reiter sie noch zeigt — dieselbe Regel wie beim Schließen.
  // Die Beobachtung der neuen Datei legt das Lesen oben bereits an.
  if (alterPfad && !findTabAcrossPanes(alterPfad)) {
    void api.unwatchFile(alterPfad);
    void clearIndexOverlayFor(alterPfad);
  }
  api.pushRecent(daten.path);

  // activateTab zieht Editor, Titelzeile, Panels und Sitzungs-Ablage nach; ein
  // eigener Nachzug wäre eine zweite, driftfähige Liste derselben Stellen.
  activatePane(stelle.paneIdx);
  activateTab(stelle.paneIdx, stelle.tabIdx);
  return true;
}

/**
 * Der Reiter, der `pfad` zeigt, oder null.
 *
 * Der aktive Reiter der aktiven Spalte hat Vorrang: Ist dieselbe Datei in
 * beiden Spalten offen, ist er der, in dem gearbeitet wird, und damit der, den
 * ein Klick im Dokument meint.
 */
export function reiterFuerPfad(pfad) {
  if (!pfad) return null;
  const aktiv = state.panes[state.activePaneIndex];
  if (aktiv && aktiv.activeIndex >= 0 && aktiv.tabs[aktiv.activeIndex]?.path === pfad) {
    return { paneIdx: state.activePaneIndex, tabIdx: aktiv.activeIndex };
  }
  return findTabAcrossPanes(pfad);
}

// Aktuelle Position eines Reiter-Objekts. Über die Objekt-Referenz und nicht
// über den Index, weil sich Indizes durch jede Streifen-Änderung verschieben.
function stelleDesReiters(tab) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.indexOf(tab);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx };
  }
  return null;
}
