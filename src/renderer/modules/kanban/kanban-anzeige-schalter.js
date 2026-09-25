// 4T-001904 (Epic 3E-000318): Die Anzeige-Schalter der Tafel im
// Anzeige-Prozess — Laden, Umschalten, Übernehmen aus anderen Fenstern.
//
// **Welche Schalter es gibt, steht nicht hier**, sondern in der geteilten Liste
// `src/shared/kanban-anzeige.js`, aus der auch der Hauptprozess sein
// Menü-Häkchen liest. Dieses Modul hält allein den laufenden Wert je Schalter
// und meldet einen Wechsel; die Neu-Zeichnung aller offenen Tafeln hängt die
// Einbettung (`kanban-pane.js`) als Rückruf ein. Umgekehrt importiert dieses
// Modul die Einbettung nicht — sonst entstünde ein Kreis, weil die Einbettung
// die Werte beim Zeichnen hier abfragt.
//
// **Der Weg ist der des Auto-Speichern-Häkchens:** Der Anzeige-Prozess schaltet
// und schreibt über `settings:set`; der Hauptprozess baut daraufhin die Menüs
// aller Fenster neu (Häkchen aus der gespeicherten Einstellung) und meldet den
// neuen Wert an alle Fenster, damit auch die Tafeln der anderen Fenster
// nachziehen. Das auslösende Fenster zeichnet sofort und nimmt die Meldung
// danach als gleichbleibenden Wert ohne Wirkung entgegen.
'use strict';

import { api } from '../app/api.js';
import {
  KANBAN_ANZEIGE_SCHALTER,
  kanbanAnzeigeSchalter,
  normalisiereKanbanAnzeige,
} from '../../../shared/kanban-anzeige.js';

let werte = normalisiereKanbanAnzeige(null);
let beiWechsel = null;
let abonniert = false;

function melde() {
  if (typeof beiWechsel === 'function') beiWechsel();
}

/** Der laufende Wert eines Schalters (Einstellungs-Schlüssel). */
export function kanbanAnzeige(schluessel) {
  return werte[schluessel] === true;
}

/**
 * Der Stand aller Schalter als ein Objekt. Es wird bei jedem Wechsel ersetzt
 * und nie verändert; die Einbettung erkennt einen Wechsel deshalb an der
 * Identität, ohne die Schalter einzeln zu kennen.
 */
export function kanbanAnzeigeStand() {
  return werte;
}

/** Hängt den Rückruf ein, der nach jedem Wechsel alle Tafeln neu zeichnet. */
export function setzeKanbanAnzeigeBeiWechsel(fn) {
  beiWechsel = typeof fn === 'function' ? fn : null;
}

/**
 * Übernimmt einen Wert, etwa aus der Meldung eines anderen Fensters.
 *
 * Ein unbekannter Schlüssel und ein unveränderter Wert bleiben ohne Wirkung;
 * so löst das auslösende Fenster mit der Rückmeldung keine zweite Zeichnung
 * aus.
 *
 * @returns {boolean} `true`, wenn sich etwas geändert hat.
 */
export function uebernimmKanbanAnzeige(schluessel, wert) {
  const schalter = kanbanAnzeigeSchalter(schluessel);
  if (!schalter || schalter.schluessel !== schluessel) return false;
  const neu = typeof wert === 'boolean' ? wert : schalter.vorgabe;
  if (werte[schluessel] === neu) return false;
  werte = { ...werte, [schluessel]: neu };
  melde();
  return true;
}

/**
 * Schaltet einen Schalter um — der Weg von Menü-Häkchen und Kommando-Palette.
 *
 * Die Tafeln zeichnen sofort; gespeichert wird danach, global über den
 * bestehenden Einstellungs-Weg. Ein fehlender Weg (Prüffall ohne Brücke) lässt
 * die Anzeige trotzdem umschalten.
 *
 * @param {string} kommando Kommando der Registry, z. B. `kanban.toggleTagsFooter`.
 * @returns {boolean} `false` bei unbekanntem Kommando.
 */
export function schalteKanbanAnzeige(kommando) {
  const schalter = kanbanAnzeigeSchalter(kommando);
  if (!schalter || schalter.kommando !== kommando) return false;
  const neu = !kanbanAnzeige(schalter.schluessel);
  uebernimmKanbanAnzeige(schalter.schluessel, neu);
  if (api && typeof api.setSetting === 'function') {
    Promise.resolve(api.setSetting(schalter.schluessel, neu)).catch(() => {});
  }
  return true;
}

/**
 * Liest alle Schalter aus der Einstellung und hört auf die Meldungen anderer
 * Fenster. Einmal je Fenster; ein zweiter Aufruf liest nur neu.
 *
 * @returns {Promise<void>}
 */
export async function ladeKanbanAnzeige() {
  if (!abonniert && api && typeof api.onKanbanAnzeigeChanged === 'function') {
    abonniert = true;
    api.onKanbanAnzeigeChanged((meldung) => {
      if (meldung && typeof meldung === 'object') {
        uebernimmKanbanAnzeige(meldung.schluessel, meldung.wert);
      }
    });
  }
  if (!api || typeof api.getSetting !== 'function') return;
  for (const s of KANBAN_ANZEIGE_SCHALTER) {
    let wert;
    try {
      wert = await api.getSetting(s.schluessel);
    } catch {
      wert = undefined;
    }
    uebernimmKanbanAnzeige(s.schluessel, wert);
  }
}
