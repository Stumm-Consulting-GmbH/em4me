// 4T-002334 (Epic 3E-000264, Entscheidung E29.1 mit S4): Der Sitzungs-Eintrag
// des Masken-Dokuments.
//
// **Warum ein Register.** Eine System-Seite hat keinen Pfad und fiel deshalb
// aus dem Schnappschuss der Spalten (`buildPanesSnapshot` in `views/views.js`
// nimmt nur Reiter mit Pfad). Ihr Gegenstand liegt im Zustand ihres Moduls,
// nicht am Reiter. Die Seite meldet hier beim Laden zwei Funktionen an: welchen
// Eintrag ihr offener Reiter gerade trägt und wie sie aus einem Eintrag wieder
// geöffnet wird. Die Ansicht fragt nur das Register und importiert nichts aus
// dem Datenbank-Ordner; heute meldet sich allein die Masken-Seite an.
//
// **Der Eintrag je Spalte** (Feld `systemTabs` des Schnappschusses):
// `{ page, position, aktiv, tabelle, kennung, maske }`. `position` ist die Zahl
// der Datei-Reiter vor dem Reiter der Seite, `aktiv` sagt, ob er der aktive
// Reiter war. Eine Neuanlage ohne gespeicherten Datensatz liefert keinen
// Eintrag. Ohne Eintrag fehlt das Feld, und eine alte Sitzung liest sich wie
// bisher.
//
// **Wiederherstellen** (`stelleMaskenWieder`) läuft nach den Datei-Reitern,
// dem aktiven Reiter und den Gruppen und vor dem Zusammenlegen der Spalten
// (`sitzungs-wiederherstellung.js`). Scheitert das Öffnen, etwa weil die
// Erweiterung «Datenbank» ausgeschaltet ist, bleiben die Datei-Reiter
// unberührt, und der Eintrag wird zum ruhenden Eintrag.
//
// **Der ruhende Eintrag** hängt an der Spalte (am Spalten-Objekt, nicht an
// ihrer Nummer, damit er spätere Verschiebungen übersteht und mit der Spalte
// vergeht; entfällt eine Spalte beim Zusammenlegen in `restorePanes`, wandern
// ihre ruhenden Einträge mit `uebergibRuhende` in die verbleibende Spalte,
// hinter deren Datei-Reiter). Er fließt in jeden
// Schnappschuss zurück, solange in dieser Spalte kein Reiter der Seite offen
// ist; öffnet die Seite dort, entfällt er. So kommt die Maske beim nächsten
// Start mit eingeschalteter Erweiterung zurück (Haus-Muster von Buch und Regal,
// hier mit einem Zwischenspeicher).
//
// Bewusst ohne Import aus dem Fenster-Zustand oder den Reiter-Modulen mit
// Seiteneffekten: Das Modul hängt nur an den reinen Helfern des Reiter-Modells,
// der Fenster-Zustand kommt beim Wiederherstellen herein. So bleibt es außerhalb
// des Import-Kreises um die Ansicht und in jsdom prüfbar.
'use strict';

import { moveTabToIndexKeepActive } from '../tabs/tab-groups.js';
import { setSelection } from '../tabs/tab-selection.js';

// Seiten-Kennung → { eintrag(tab), oeffne(eintrag) }.
const seiten = new Map();
// Spalten-Objekt → ruhende Einträge dieser Spalte.
const ruhend = new WeakMap();

/**
 * Meldet eine System-Seite für die Sitzung an.
 *
 * @param {string} pageId Kennung der Seite (Wert von `tab.systemPage`).
 * @param {{eintrag: Function, oeffne: Function}} def `eintrag(tab)` liefert
 *   `{ tabelle, kennung, maske }` oder null; `oeffne(eintrag)` öffnet die Seite
 *   in der aktiven Spalte und liefert ein Promise.
 */
export function registriereSystemSeite(pageId, def) {
  if (typeof pageId !== 'string' || pageId === '' || !def) return;
  if (typeof def.eintrag !== 'function' || typeof def.oeffne !== 'function') return;
  seiten.set(pageId, def);
}

// Ein Eintrag in seiner gültigen Form, sonst null. `maske` ist eine
// nicht-leere Zeichenkette oder null.
function normiere(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const { page, tabelle, kennung } = roh;
  if (typeof page !== 'string' || page === '') return null;
  if (typeof tabelle !== 'string' || tabelle === '') return null;
  if (typeof kennung !== 'string' || kennung === '') return null;
  const position = Number.isInteger(roh.position) && roh.position >= 0 ? roh.position : 0;
  const maske = typeof roh.maske === 'string' && roh.maske !== '' ? roh.maske : null;
  return { page, position, aktiv: roh.aktiv === true, tabelle, kennung, maske };
}

function eintragDesReiters(tab) {
  const seite = seiten.get(tab.systemPage);
  let roh;
  try {
    roh = seite.eintrag(tab);
  } catch {
    roh = null;
  }
  return roh ? normiere({ ...roh, page: tab.systemPage }) : null;
}

/**
 * Die Einträge der System-Seiten einer Spalte für den Schnappschuss: die
 * offenen Reiter angemeldeter Seiten und danach die ruhenden Einträge der
 * Spalte, deren Seite dort nicht offen ist.
 *
 * @param {{tabs: object[], activeIndex: number}} pane Die Spalte.
 * @returns {object[]} Leer, wenn nichts zu sichern ist.
 */
export function systemTabsFuer(pane) {
  if (!pane || !Array.isArray(pane.tabs)) return [];
  const liste = [];
  const offen = new Set();
  let dateien = 0;
  pane.tabs.forEach((tab, i) => {
    if (tab.path) {
      dateien++;
      return;
    }
    if (!tab.systemPage || !seiten.has(tab.systemPage)) return;
    offen.add(tab.systemPage);
    const eintrag = eintragDesReiters(tab);
    if (eintrag) liste.push({ ...eintrag, position: dateien, aktiv: i === pane.activeIndex });
  });
  const ruhende = ruhend.get(pane);
  if (ruhende) {
    const bleiben = ruhende.filter((e) => !offen.has(e.page));
    if (bleiben.length > 0) ruhend.set(pane, bleiben);
    else ruhend.delete(pane);
    for (const e of bleiben) liste.push({ ...e, aktiv: false });
  }
  return liste;
}

function merkeRuhend(pane, eintrag) {
  const liste = ruhend.get(pane) || [];
  liste.push({ ...eintrag, aktiv: false });
  ruhend.set(pane, liste);
}

/**
 * Übergibt die ruhenden Einträge einer entfallenden Spalte an die verbleibende
 * (Entscheidung zum Randfall: Eine Spalte, die nur die Maske trug, ist bei
 * abgeschalteter Erweiterung nach dem Wiederherstellen leer und entfällt beim
 * Zusammenlegen; ihr Eintrag geht dabei nicht verloren). Die Einträge stehen
 * danach hinter allen Datei-Reitern der Ziel-Spalte und nie als aktiver Reiter.
 *
 * @param {object} von Die entfallende Spalte.
 * @param {object} an Die verbleibende Spalte.
 */
export function uebergibRuhende(von, an) {
  const liste = von ? ruhend.get(von) : null;
  if (!liste || !an || von === an) return;
  ruhend.delete(von);
  const dateien = Array.isArray(an.tabs) ? an.tabs.filter((tab) => tab.path).length : 0;
  for (const e of liste) merkeRuhend(an, { ...e, position: dateien });
}

// Index im Streifen ohne den Reiter der Seite: hinter den ersten `position`
// Datei-Reitern; gibt es weniger, hinter dem letzten.
function zielIndex(tabs, position) {
  if (position <= 0) return 0;
  let gezaehlt = 0;
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].path) gezaehlt++;
    if (gezaehlt === position) return i + 1;
  }
  let letzter = -1;
  tabs.forEach((tab, i) => {
    if (tab.path) letzter = i;
  });
  return letzter + 1;
}

// Öffnet einen Eintrag in der Spalte und stellt ihn an seine Stelle. Liefert
// true, wenn der Reiter der Seite danach in dieser Spalte steht.
async function oeffneAn(state, paneIdx, eintrag) {
  const seite = seiten.get(eintrag.page);
  const pane = state.panes[paneIdx];
  if (!seite || !pane) return false;
  // Die Seite gibt es je Fenster nur einmal; ein zweiter Eintrag bände sie um.
  if (state.panes.some((p) => p.tabs.some((tab) => tab.systemPage === eintrag.page))) return false;
  const vorherSpalte = state.activePaneIndex;
  const vorherAktiv = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  try {
    state.activePaneIndex = paneIdx;
    const { tabelle, kennung, maske } = eintrag;
    await seite.oeffne({ tabelle, kennung, maske });
    const idx = pane.tabs.findIndex((tab) => tab.systemPage === eintrag.page);
    if (idx < 0) return false;
    const rest = pane.tabs.filter((_, i) => i !== idx);
    moveTabToIndexKeepActive(pane, idx, zielIndex(rest, eintrag.position));
    if (!eintrag.aktiv && vorherAktiv && pane.tabs.includes(vorherAktiv)) {
      pane.activeIndex = pane.tabs.indexOf(vorherAktiv);
      setSelection(pane, pane.activeIndex);
    }
    return true;
  } catch (err) {
    console.warn('[sitzungs-maske] Wiederherstellen gescheitert:', err);
    return pane.tabs.some((tab) => tab.systemPage === eintrag.page);
  } finally {
    state.activePaneIndex = vorherSpalte;
  }
}

/**
 * Stellt die gesicherten System-Seiten einer Spalte wieder her. Was sich nicht
 * öffnen lässt, wird zum ruhenden Eintrag der Spalte; die Datei-Reiter bleiben
 * in jedem Fall unberührt.
 *
 * @param {number} paneIdx Nummer der Spalte im Fenster-Zustand.
 * @param {object[]|undefined} systemTabs Die gesicherten Einträge.
 * @param {{panes: object[], activePaneIndex: number}} state Der Fenster-Zustand.
 * @returns {Promise<void>}
 */
export async function stelleMaskenWieder(paneIdx, systemTabs, state) {
  const pane = state && Array.isArray(state.panes) ? state.panes[paneIdx] : null;
  if (!pane || !Array.isArray(systemTabs)) return;
  for (const roh of systemTabs) {
    const eintrag = normiere(roh);
    if (!eintrag) continue;
    if (!(await oeffneAn(state, paneIdx, eintrag))) merkeRuhend(pane, eintrag);
  }
}
