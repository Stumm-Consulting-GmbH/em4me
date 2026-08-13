// Höhen-Modell der Sidebar-Blöcke: Bezugsgröße, Einfrieren und Zieh-Griff.
// 4T-0990 (Epic 3E-0196): aus panels.js ausgezogen. Der Kern verdrahtet die
// Griffe beim Aufbau einer Spalte; hier liegt, woher die Höhe eines Blocks
// kommt, wohin sie geschrieben wird und wie sie am Drag hängt. Eigener
// Zustand entsteht dabei nicht — gespeichert wird ausschließlich über die
// Zugriffs-Funktionen des Layout-Modells (sidebar-layout.js).
'use strict';

import { state } from '../app/app-state.js';
import {
  activePanelInSlot,
  clampPanelHeight,
  findPanelInLayout,
  getGroupHeight,
  getPanelHeight,
  getPanelHeightMode,
  getSidebarLayout,
  groupHeightKey,
  HEIGHT_MODE_GROUP,
  setGroupHeight,
  setPanelHeight,
  sidebarPanelById,
} from '../sidebar-layout.js';

import { panelSectionEl } from './panel-sections.js';

// 4T-0855 (Epic 3E-0164): Bezugsgröße der Höhe eines Blocks. Im Panel-Modus
// (Vorgabe) ist es das governing Panel, also der aktive Reiter einer Gruppe
// beziehungsweise das Einzel-Panel; im Gruppen-Modus ist es bei einer
// Reiter-Gruppe die Gruppe selbst. Ein Slot mit nur einem Panel verhält sich
// in beiden Modi gleich — ohne Reiter-Wechsel gibt es kein Springen, also
// auch nichts festzuhalten.
//
// Die Höhe wird in beiden Fällen auf die Sektion des governing Panels
// angewendet (nur sie ist sichtbar); verschieden ist allein, woher der Wert
// kommt und wohin er geschrieben wird.
export function heightRefForSlot(slot, governingId) {
  if (getPanelHeightMode() === HEIGHT_MODE_GROUP && slot && slot.panels.length > 1) {
    return { group: true, key: groupHeightKey(slot) };
  }
  return { group: false, key: governingId };
}

export function readHeightRef(ref) {
  if (!ref || ref.key == null) return null;
  return ref.group ? getGroupHeight(ref.key) : getPanelHeight(ref.key);
}

export function writeHeightRef(ref, value, opts) {
  if (!ref || ref.key == null) return undefined;
  return ref.group ? setGroupHeight(ref.key, value, opts) : setPanelHeight(ref.key, value, opts);
}

// 4T-0634 (Epic 3E-0119): Alle sichtbaren Blöcke derselben Sidebar-Seite,
// die noch keine fixierte Höhe haben, auf ihrer aktuellen Ist-Höhe
// einfrieren (Messung in der Pane des Griffs, Anwendung in allen Panes).
// Erst alles messen, dann fixieren — das Fixieren löst Reflows aus, die
// spätere Messungen verfälschen würden. Damit ist während eines Drags jede
// Sektion der Seite höhenstabil und ausschließlich das gezogene Panel
// folgt der Maus; ohne das Einfrieren verteilte der Flex-Algorithmus das
// Höhen-Defizit auf die automatisch bemessenen Nachbar-Blöcke.
function freezeSidePanelHeights(paneIdx, dragPanelId) {
  const layout = getSidebarLayout();
  const pos = findPanelInLayout(layout, dragPanelId);
  if (!pos) return;
  // 4T-0855 (Epic 3E-0164): Eingefroren wird je Block seine Bezugsgröße —
  // im Gruppen-Modus also die Gruppen-Höhe und nicht die des aktiven Reiters.
  // Gemessen wird unverändert an der Sektion des governing Panels, weil nur
  // sie sichtbar ist.
  const bloecke = [];
  for (const slot of layout[pos.side] || []) {
    const visible = slot.panels.filter((id) => {
      const def = sidebarPanelById(id);
      return def && def.getVisible(paneIdx);
    });
    if (visible.length === 0) continue;
    // 4T-0942: dieselbe spaltenweise Wahl wie beim Rendern.
    const slotActive = activePanelInSlot(slot, paneIdx);
    const governingId = visible.includes(slotActive) ? slotActive : visible[0];
    bloecke.push({ governingId, ref: heightRefForSlot(slot, governingId) });
  }
  // 4T-0682 (Epic 3E-0139): Den letzten sichtbaren Block nicht einfrieren.
  // Er hat keinen eigenen Griff (der Griff steuert immer den Block darüber),
  // und ein Store-Eintrag für ihn liesse sich danach nie wieder ändern.
  // renderSidebarSide nimmt ihm die fixierte Höhe ohnehin wieder ab; ihn
  // hier auszulassen verhindert, dass der Eintrag überhaupt erst entsteht.
  bloecke.pop();
  const measured = [];
  for (const { governingId, ref } of bloecke) {
    if (readHeightRef(ref) != null) continue;
    const sec = panelSectionEl(paneIdx, governingId);
    if (!sec) continue;
    measured.push({ governingId, ref, height: sec.getBoundingClientRect().height });
  }
  for (const { governingId, ref, height } of measured) {
    const next = clampPanelHeight(height);
    if (next == null) continue;
    for (let i = 0; i < state.panes.length; i++) {
      const sec = panelSectionEl(i, governingId);
      if (sec) {
        sec.style.height = next + 'px';
        sec.classList.add('has-fixed-height');
      }
    }
    writeHeightRef(ref, next, { persist: false });
  }
}

// 4T-0475 (Epic 3E-0088): horizontaler Zieh-Griff zwischen zwei gestapelten
// Blöcken. Steuert die Höhe des Panels DARÜBER (panelId, in Gruppen der
// aktive Reiter). Drag-Muster wie bindSidebarSplitters: Starthöhe aus der
// Bounding-Box der EIGENEN Pane des Griffs (die Sichtbarkeit ist pro Pane —
// die aktive Pane könnte das Panel versteckt haben und Höhe 0 liefern),
// mousemove klemmt und wendet direkt auf die passende Sektion in BEIDEN
// Panes an (Höhe gilt global pro Panel-ID), einmaliges Persistieren am
// mouseup. Doppelklick setzt die Höhe auf Automatik zurück. 4T-0634:
// die erste Bewegung friert zusätzlich die übrigen sichtbaren Blöcke der
// Seite ein (ein reiner Klick ohne Bewegung ändert nichts); der eine
// Persist-Aufruf am mouseup schreibt das gesamte Höhen-Objekt inklusive
// der eingefrorenen Werte.
// 4T-0855 (Epic 3E-0164): `ref` bestimmt, WOHIN die gezogene Höhe geschrieben
// wird (Panel oder Gruppe); `panelId` bleibt das governing Panel und damit die
// Sektion, an der gemessen und auf die angewendet wird.
export function buildPanelResizer(paneIdx, panelId, ref) {
  const handle = document.createElement('div');
  handle.className = 'sidebar-panel-resizer';
  handle.dataset.panelId = panelId;
  if (ref && ref.group) handle.dataset.groupKey = ref.key;
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startSection = panelSectionEl(paneIdx, panelId);
    if (!startSection) return;
    const startY = ev.clientY;
    const startH = startSection.getBoundingClientRect().height;
    let frozen = false;
    function onMove(e) {
      if (!frozen) {
        frozen = true;
        freezeSidePanelHeights(paneIdx, panelId);
      }
      const dy = e.clientY - startY;
      const next = clampPanelHeight(startH + dy);
      if (next == null) return;
      for (let i = 0; i < state.panes.length; i++) {
        const sec = panelSectionEl(i, panelId);
        if (sec) {
          sec.style.height = next + 'px';
          sec.classList.add('has-fixed-height');
        }
      }
      writeHeightRef(ref, next, { persist: false });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Erst am Drag-Ende persistieren (ein Store-Schreibzugriff).
      writeHeightRef(ref, readHeightRef(ref));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  handle.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    for (let i = 0; i < state.panes.length; i++) {
      const sec = panelSectionEl(i, panelId);
      if (sec) {
        sec.style.height = '';
        sec.classList.remove('has-fixed-height');
      }
    }
    // 4T-0855: Im Gruppen-Modus setzt der Doppelklick die ganze Gruppe auf
    // Automatik zurück, weil der Eintrag der Gruppe gilt und nicht dem
    // gerade sichtbaren Reiter.
    writeHeightRef(ref, null);
  });
  return handle;
}
