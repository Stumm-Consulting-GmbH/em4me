// 4T-000644 (Epic 3E-000127): Kern der geführten Produkt-Tour.
//
// Die Tour läuft über driver.js (devDependency, per esbuild im Renderer-
// Bundle). Das Overlay- und Popover-Stilblatt des Pakets kommt nicht über den
// Bundle, sondern als eigene Datei aus scripts/build-tour-assets.js; die
// Anpassung an die Farb-Token der App liegt in styles/tour.css und hängt an
// der hier gesetzten Popover-Klasse `em4me-tour`.
//
// Zwei Einstiege: der automatische Anlauf beim allerersten Start
// (maybeStartTourOnFirstRun, aus der Start-Sequenz in app-init.js) und der
// Start von Hand über das Kommando. Nur der automatische Anlauf fasst den
// Merker `tourSeen` an — er liest ihn vor dem Start und schreibt ihn beim Ende
// der Tour. Der Merker hat bewusst KEINEN Vorgabewert im Store: Erst der
// Zustand «noch nie gesetzt» belegt den Erststart, ein gesetzter Wert (gleich
// welcher) unterdrückt den automatischen Anlauf dauerhaft.
'use strict';

import { driver } from 'driver.js';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { TOUR_STATIONEN } from './tour-stationen.js';

// Store-Schlüssel des Erststart-Merkers (ohne Vorgabewert, siehe Kopf).
const TOUR_SEEN_KEY = 'tourSeen';

// Die laufende Tour als Paar { instanz, schreibeMerker }, sonst null. driver.js
// kennt keine globale Instanz-Verwaltung; ohne diesen Griff bliebe eine zweite
// Tour über der ersten liegen. Der Merker-Schreiber reist mit, damit auch der
// Neustart-Pfad (startTour bei laufender Tour) das Ende einer automatischen
// Tour als Abbruch verbuchen kann.
let laufendeTour = null;

// Ist das Element als Tour-Ziel brauchbar? driver.js hebt ein Ziel über seine
// Bildschirm-Fläche hervor, deshalb reicht die reine Existenz im DOM nicht.
// Geprüft werden drei Fälle, die im Bestand vorkommen: das Element hängt gar
// nicht (mehr) im Dokument, es ist per display:none ausgeblendet (Klasse
// sb-user-hidden der vom Nutzer abgewählten Statusbar-Buttons — dann ist die
// Fläche 0), oder es ist per visibility:hidden verborgen (der Pane-Container
// im Leer-Zustand, der seine Fläche behält).
function istSichtbaresZiel(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

// Liefert das Zielelement einer Station oder null (ankerlose Station, fehlender
// oder verborgener Anker).
function zielElement(anker) {
  if (!anker) return null;
  const el = document.querySelector(`[data-tour="${anker}"]`);
  return istSichtbaresZiel(el) ? el : null;
}

// Baut die driver.js-Schritte aus der Stationen-Folge. Eine Station ohne
// brauchbares Ziel läuft als Karte ohne `element`, also frei zentriert statt
// mit Hervorhebung; der Text der Station bleibt damit erhalten, statt die
// Station stillschweigend zu überspringen.
function baueSchritte() {
  return TOUR_STATIONEN.map((station) => {
    const schritt = {
      popover: {
        title: t(`tour.${station.id}.title`),
        description: t(`tour.${station.id}.text`),
      },
    };
    const el = zielElement(station.anker);
    if (el) schritt.element = el;
    return schritt;
  });
}

// Startet die Tour. `automatisch` unterscheidet den Erststart-Anlauf vom Start
// von Hand und entscheidet allein darüber, ob der Merker geschrieben wird.
//
// Läuft bereits eine Tour, wird sie zerstört und frisch gestartet: Ein zweiter
// Start ist immer eine bewusste Anwender-Handlung (Kommando oder Menü), und
// zwei übereinander liegende Overlays wären nicht bedienbar.
export function startTour(optionen = {}) {
  const { automatisch = false } = optionen;

  if (laufendeTour) {
    const vorige = laufendeTour;
    laufendeTour = null;
    // Der direkte destroy() umgeht den onDestroyStarted-Hook (Paket-Vertrag,
    // siehe unten); das Ende einer automatischen Tour wird deshalb hier als
    // Abbruch verbucht, bevor sie abgeräumt wird.
    vorige.schreibeMerker();
    vorige.instanz.destroy();
  }

  // Der Merker wird genau einmal je automatischer Tour geschrieben, bei
  // Abschluss und Abbruch gleichermaßen. Die Schreibung hängt bewusst NICHT
  // allein an onDestroyed: driver.js 1.8.0 ruft onDestroyed nur, wenn der
  // rAF-Übergang (Vorgabe 400ms) abgeschlossen und damit __activeElement/
  // __activeStep gesetzt sind — ein Sofort-Abbruch bliebe sonst unverbucht
  // (Befund der Test-Stufe, am Paket verifiziert).
  let merkerGeschrieben = false;
  const schreibeMerker = () => {
    if (!automatisch || merkerGeschrieben) return;
    merkerGeschrieben = true;
    Promise.resolve(api.setSetting(TOUR_SEEN_KEY, true)).catch(() => {
      // Der Merker konnte nicht geschrieben werden. Folge ist allein, dass
      // die Tour beim nächsten Start erneut anläuft; es gibt nichts
      // zurückzunehmen.
    });
  };
  const instanz = driver({
    steps: baueSchritte(),
    showProgress: true,
    // driver.js ersetzt {{current}}/{{total}} selbst, der Text kommt fertig
    // aus den Sprachdateien.
    progressText: t('tour.progress'),
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    allowClose: true,
    popoverClass: 'em4me-tour',
    // Paket-Vertrag von driver.js: Ist onDestroyStarted konfiguriert, laufen
    // alle Nutzer-Schließwege (ESC, Schließen-Knopf, Overlay-Klick, «Fertig»)
    // nur bis zu diesem Hook, und der Hook-Besitzer beendet selbst per
    // destroy(); destroy() wiederum ruft den Hook nicht erneut auf.
    onDestroyStarted: () => {
      schreibeMerker();
      instanz.destroy();
    },
    onDestroyed: () => {
      if (laufendeTour && laufendeTour.instanz === instanz) laufendeTour = null;
      // Rückfall-Schreibung; nach dem Hook oben ist sie flag-gesichert leer.
      schreibeMerker();
    },
  });
  laufendeTour = { instanz, schreibeMerker };
  instanz.drive();
}

// Erststart-Anlauf. Startet die Tour nur, wenn der Merker noch nie gesetzt
// wurde; jeder gesetzte Wert unterdrückt sie. Lesefehler laufen an den Aufrufer
// zurück, der sie behandelt (app-init.js).
export async function maybeStartTourOnFirstRun() {
  const gesehen = await api.getSetting(TOUR_SEEN_KEY);
  if (gesehen != null) return;
  startTour({ automatisch: true });
}
