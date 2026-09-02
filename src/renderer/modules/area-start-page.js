// 4T-1365 (Epic 3E-0171): Start-Seite eines Bereichs im Anzeige-Prozess —
// Merker der Festlegung, Kennzeichnung einer Datei-Zeile, Kontextmenue-Eintrag
// und der Schreib-Weg.
//
// Eigenes Modul und nicht Teil von area-panel.js: Die Fachlichkeit ist von der
// Ordner- und Datei-Darstellung des Panels unabhaengig, und area-panel.js steht
// an seinem Groessen-Budget (491 von 500 Zeilen vor diesem Vorhaben). Der
// Schnitt folgt damit der Verantwortlichkeit und nicht der Zeilenzahl.
//
// Die Richtung der Abhaengigkeit ist bewusst einseitig: area-panel.js ruft
// hierher, nie umgekehrt. Den Neuaufbau der Panels nach einer Aenderung reicht
// der Aufrufer als Rueckruf herein, statt dass dieses Modul area-panel.js
// importierte — das waere ein Zyklus (Entwicklungsrichtlinien, Modul-Schnitt).
//
// Eigener Zustand: der Merker der zuletzt gelesenen Festlegung. Er ist noetig,
// weil Panel-Aufbau und Kontextmenue synchron entscheiden muessen, die Abfrage
// des Haupt-Prozesses aber asynchron ist.
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import { state } from './app/app-state.js';
import { showStatusbarHint } from './views/views.js';
import { isFilesystemCaseInsensitive } from '../../shared/platform.js';

// Absoluter Pfad der Start-Seite oder null. Eine ins Leere zeigende Festlegung
// gilt hier als "keine": Gekennzeichnet wird nur, was es gibt.
let startPageCache = null;

function normPath(p) {
  let s = String(p || '');
  if (isFilesystemCaseInsensitive()) s = s.replace(/\//g, '\\').toLowerCase();
  return s.replace(/[\\/]+$/, '');
}

/**
 * Festlegung des aktuellen Bereichs neu lesen.
 *
 * @returns {Promise<string|null>} Absoluter Pfad oder null.
 */
export async function ladeStartSeite() {
  if (typeof api.getAreaStartPage !== 'function') return (startPageCache = null);
  try {
    const res = await api.getAreaStartPage();
    startPageCache = res && res.hasArea && res.path && !res.missing ? res.path : null;
  } catch {
    startPageCache = null;
  }
  return startPageCache;
}

/**
 * Ist dieser Pfad die Start-Seite des Bereichs?
 *
 * @param {string} absPath Absoluter Datei-Pfad.
 * @returns {boolean} true, wenn er der Festlegung entspricht.
 */
export function istStartSeite(absPath) {
  if (!startPageCache) return false;
  const a = normPath(startPageCache);
  return a !== '' && a === normPath(absPath);
}

/**
 * Datei-Zeile als Start-Seite kennzeichnen, sofern sie es ist.
 *
 * @param {HTMLElement} row Zeile der Dateiliste.
 * @param {string} absPath Absoluter Datei-Pfad.
 */
export function markiereStartSeite(row, absPath) {
  if (!istStartSeite(absPath)) return;
  row.classList.add('area-file-start-page');
  row.title = `${absPath}\n${t('areaPanel.startPageMarker')}`;
}

/**
 * Steht der Start-Seiten-Eintrag zur Verfuegung? Er haengt bewusst an keiner
 * Erweiterung, sondern allein an einem geoeffneten Bereich: Die Start-Seite ist
 * eine Kern-Faehigkeit des Bereichs, kein Zusatz.
 *
 * @returns {boolean} true, wenn der Eintrag angeboten werden kann.
 */
export function startSeiteVerfuegbar() {
  return !!state.areaPath && typeof api.setAreaStartPage === 'function';
}

/**
 * Kontextmenue-Eintrag anhaengen. Ein Eintrag traegt beide Handlungen und
 * wechselt seinen Text nach dem Zustand; damit wird das Entfernen nie dort
 * angeboten, wo es nichts zu entfernen gibt.
 *
 * @param {HTMLElement} menu Menue-Behaelter.
 * @param {string} absPath Absoluter Datei-Pfad der angeklickten Zeile.
 * @param {() => void} schliessen Menue schliessen (Aufrufer-Mechanik).
 * @param {() => void} aufRefresh Panels nach der Aenderung neu aufbauen.
 */
export function appendStartPageItem(menu, absPath, schliessen, aufRefresh) {
  const gesetzt = istStartSeite(absPath);
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.dataset.menuId = 'area-file-start-page';
  item.textContent = gesetzt ? t('areaPanel.startPageClear') : t('areaPanel.startPageSet');
  item.addEventListener('click', () => {
    schliessen();
    void setzeStartSeite(gesetzt ? null : absPath, aufRefresh);
  });
  menu.appendChild(item);
}

/**
 * Start-Seite setzen (absoluter Pfad) oder entfernen (null).
 *
 * @param {string|null} absPathOderNull Ziel-Datei oder null zum Entfernen.
 * @param {() => void} aufRefresh Rueckruf fuer den Neuaufbau der Panels.
 * @returns {Promise<boolean>} true bei Erfolg.
 */
export async function setzeStartSeite(absPathOderNull, aufRefresh) {
  if (typeof api.setAreaStartPage !== 'function') return false;
  let res;
  try {
    res = await api.setAreaStartPage(absPathOderNull);
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    showStatusbarHint(t('areaPanel.startPageFailed'));
    return false;
  }
  await ladeStartSeite();
  if (typeof aufRefresh === 'function') aufRefresh();
  showStatusbarHint(
    absPathOderNull ? t('areaPanel.startPageSetDone') : t('areaPanel.startPageClearDone'),
  );
  return true;
}
