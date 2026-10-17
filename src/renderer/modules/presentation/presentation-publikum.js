// 4T-002278 (Epic 3E-000348): Die Vorführung im eigenen Fenster — die Seite
// des Hauptfensters (Story 4S-001075). Das Publikums-Fenster selbst erzeugt der
// Hauptprozess (src/main/praesentation-fenster.js); seine Seite zeigt nur, was
// dieses Modul liefert.
//
// **Ein Folien-Zustand, zwei Fenster.** Die Folie bleibt die der
// Präsentations-Fläche dieser Spalte (presentation-pane.js); geblättert wird
// dort, gleich ob über die Leiste der Fläche, ihre Tasten und ihr Mausrad oder
// über eine Eingabe aus dem Publikums-Fenster. Jede neu gezeichnete Folie geht
// als eigenständiges HTML-Dokument (Weg der HTML-Export-Seiten, Bauer aus
// folien-export.js) an das Publikums-Fenster.
//
// **Wann gesendet wird:** Ein Beobachter an der Fläche der Spalte meldet jede
// Änderung ihres Inhalts — eine neu gezeichnete Folie, ein nachgezeichnetes
// Diagramm, einen neuen Zähler-Stand; gesendet wird verzögert und nur, wenn
// sich das Dokument der Folie oder ihr Index geändert hat.
//
// **Ende:** Esc im Publikums-Fenster oder auf der Fläche des Hauptfensters,
// das Kommando «Vorführung beenden», das Schließen des Publikums-Fensters und
// der Wegfall der Präsentation in ihrer Spalte (anderes Dokument, andere
// Ansicht) beenden die Vorführung. Ein Wechsel des Fokus beendet sie nicht:
// Das Hauptfenster bleibt bedienbar, und der Fokus wandert beim Bedienen des
// Publikums-Fensters ohnehin dorthin (Ausführungs-Entscheidung der Sitzung vom
// 2026-10-14 in 4T-002276).
//
// 4T-002280: Solange die Vorführung läuft, deckt «weiter» die Aufdeck-Schritte
// einzeln auf (presentation-aufdecken.js); der Schritt ist eine Angabe an den
// Listen-Punkten der gezeichneten Folie und reist so im gesendeten Dokument mit.
//
// 4T-002279: Die Referenten-Ansicht (presentation-referent.js) startet diese
// Vorführung mit einem Rückruf `beimEnde`, der auf jedem Weg des Endes läuft,
// und nimmt ihre Seite über `NICHT_SENDEN_ATTR` vom Senden aus.
//
// **Zyklusfrei:** importiert die Brücke, die Fläche und die Vorführung; den
// Bauer des Folien-Dokuments reicht folien-export.js herein (Muster des
// Teilbaum-Schritt-Satzes), weil der Ordner views/ in den Datei-Zyklus des
// Renderers gehört.
'use strict';

import { api } from '../app/api.js';
import { HUELLE_KLASSE, VERKLEINERUNG_ATTR } from './presentation-folie.js';
import { AUFDECK_ATTR, setzeAufdeckModus } from './presentation-aufdecken.js';
import { schliesseUebersicht } from './presentation-uebersicht.js';
import {
  FLAECHE_KLASSE,
  blaettere,
  folienStand,
  gezeigtePraesentation,
  praesentationsContainer,
  renderPresentation,
  richtungAusRad,
  richtungAusTaste,
} from './presentation-pane.js';
import { istVorfuehrungAktiv, registriereFensterLauf } from './presentation-vorfuehrung.js';

/** Verzögerung zwischen der letzten Änderung der Fläche und dem Senden. */
export const SENDE_VERZOEGERUNG_MS = 80;

/**
 * Attribut eines Teilbaums der Fläche, dessen Änderungen kein Senden
 * auslösen (4T-002279: die Seite der Referenten-Ansicht mit nächster Folie,
 * Notizen und Zeitgeber, der jede Sekunde neu schreibt).
 */
export const NICHT_SENDEN_ATTR = 'data-nicht-senden';

// Liegt das Ziel einer Änderung in einem ausgenommenen Teilbaum?
function ausgenommen(eintrag) {
  const ziel = eintrag && eintrag.target;
  const el = ziel && ziel.nodeType === 1 ? ziel : ziel && ziel.parentElement;
  return !!el && typeof el.closest === 'function' && !!el.closest(`[${NICHT_SENDEN_ATTR}]`);
}

// Laufende Vorführung im eigenen Fenster oder null.
let lauf = null;
// Bauer des Folien-Dokuments: (huelle) => Promise<{html, breite, hoehe}|null>.
let dokumentBauer = null;
// Die Meldungen des Hauptprozesses hängen einmal je Fenster.
let meldungenVerdrahtet = false;

/** Reicht den Bauer des Folien-Dokuments herein (folien-export.js). */
export function registriereFolienDokumentBauer(fn) {
  dokumentBauer = typeof fn === 'function' ? fn : null;
}

/** Läuft gerade eine Vorführung im eigenen Fenster? */
export function istFensterVorfuehrungAktiv() {
  return lauf !== null;
}

function verdrahteMeldungen() {
  if (meldungenVerdrahtet) return;
  meldungenVerdrahtet = true;
  if (typeof api.onPresentationWindowInput === 'function') {
    api.onPresentationWindowInput((eingabe) => verarbeiteEingabe(eingabe));
  }
  if (typeof api.onPresentationWindowClosed === 'function') {
    api.onPresentationWindowClosed(() => beende({ fensterZu: true }));
  }
}

/**
 * Verarbeitet eine Eingabe aus dem Publikums-Fenster: Esc beendet, Tasten,
 * Rad und Klick blättern nach denselben Regeln wie die Fläche.
 *
 * @param {{art: string}} eingabe geprüft im Hauptprozess.
 * @returns {boolean} true, wenn sie etwas bewirkt hat.
 */
export function verarbeiteEingabe(eingabe) {
  if (!lauf || !eingabe) return false;
  if (eingabe.art === 'beenden') return beende();
  let richtung = null;
  if (eingabe.art === 'klick') richtung = 'weiter';
  else if (eingabe.art === 'taste') richtung = richtungAusTaste(eingabe);
  else if (eingabe.art === 'rad') {
    richtung = richtungAusRad(eingabe, lauf.radSperre);
    if (richtung === 'gesperrt') return false;
  }
  if (!richtung) return false;
  return blaettere(lauf.paneIdx, richtung) !== null;
}

// Esc auf der Fläche des Hauptfensters beendet; anderswo bleibt Esc, wo es ist.
function beiTaste(ereignis) {
  if (!lauf || ereignis.key !== 'Escape') return;
  const ziel = ereignis.target;
  if (!ziel || typeof ziel.closest !== 'function' || !ziel.closest(`.${FLAECHE_KLASSE}`)) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  beende();
}

// Gerufen vom Beobachter (mit seinen Einträgen) und nach dem Öffnen (ohne).
function planeSenden(eintraege) {
  if (!lauf) return;
  if (Array.isArray(eintraege) && eintraege.length > 0 && eintraege.every(ausgenommen)) return;
  if (lauf.timer) clearTimeout(lauf.timer);
  lauf.timer = setTimeout(() => {
    if (lauf) lauf.timer = null;
    void sendeFolie();
  }, SENDE_VERZOEGERUNG_MS);
}

/**
 * Baut die gezeigte Folie als Dokument und reicht sie an das
 * Publikums-Fenster, wenn sie sich seit dem letzten Senden geändert hat.
 *
 * @returns {Promise<boolean>} true, wenn gesendet wurde.
 */
export async function sendeFolie() {
  const eigener = lauf;
  if (!eigener || !dokumentBauer || typeof api.sendPresentationSlide !== 'function') return false;
  if (gezeigtePraesentation(eigener.paneIdx) !== eigener.tab) {
    beende();
    return false;
  }
  const stand = folienStand(eigener.paneIdx);
  const huelle = eigener.container.querySelector(`.${HUELLE_KLASSE}`);
  if (!stand || !huelle) return false;
  const nummer = ++eigener.sendeNummer;
  const dokument = await dokumentBauer(huelle);
  // Inzwischen beendet oder von einem jüngeren Lauf überholt.
  if (lauf !== eigener || nummer !== eigener.sendeNummer || !dokument) return false;
  if (dokument.html === eigener.zuletzt.html && stand.index === eigener.zuletzt.index) return false;
  eigener.zuletzt = { html: dokument.html, index: stand.index };
  await api.sendPresentationSlide({
    html: dokument.html,
    index: stand.index,
    gesamt: stand.anzahl,
    breite: dokument.breite,
    hoehe: dokument.hoehe,
  });
  return true;
}

/**
 * Startet die Vorführung der Spalte im eigenen Fenster, an der gezeigten Folie.
 *
 * @param {number} paneIdx
 * @param {{beimEnde?: Function}} [optionen] beimEnde: gerufen, sobald diese
 *   Vorführung auf irgendeinem Weg endet (4T-002279: die Referenten-Ansicht
 *   endet mit ihr).
 * @returns {boolean} true, wenn sie gestartet ist; false, wenn bereits eine
 *   Vorführung läuft oder die Spalte keine Präsentation zeigt.
 */
export function starteVorfuehrungImFenster(paneIdx, { beimEnde = null } = {}) {
  if (lauf || istVorfuehrungAktiv()) return false;
  const tab = gezeigtePraesentation(paneIdx);
  const container = praesentationsContainer(paneIdx);
  if (!tab || !container || typeof api.openPresentationWindow !== 'function') return false;
  verdrahteMeldungen();
  const eigener = {
    paneIdx,
    tab,
    container,
    radSperre: { bis: 0 },
    timer: null,
    beobachter: null,
    sendeNummer: 0,
    zuletzt: { html: null, index: -1 },
    beimEnde: typeof beimEnde === 'function' ? beimEnde : null,
  };
  lauf = eigener;
  window.addEventListener('keydown', beiTaste, true);
  // 4T-002280: Die Übersicht schließt, die gezeigte Folie beginnt zugedeckt.
  schliesseUebersicht(paneIdx);
  setzeAufdeckModus(paneIdx, true, tab);
  renderPresentation(paneIdx);
  if (typeof MutationObserver === 'function') {
    eigener.beobachter = new MutationObserver(planeSenden);
    // Aufdeck-Schritt und Verkleinerung ändern nur Angaben am Artikel.
    eigener.beobachter.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [AUFDECK_ATTR, VERKLEINERUNG_ATTR],
    });
  }
  Promise.resolve(api.openPresentationWindow()).then(
    (antwort) => {
      if (lauf !== eigener) return;
      if (!antwort || !antwort.ok) beende({ fensterZu: true });
      else planeSenden();
    },
    () => {
      if (lauf === eigener) beende({ fensterZu: true });
    },
  );
  return true;
}

/**
 * Beendet die Vorführung im eigenen Fenster: Beobachter und Zuhörer fort, das
 * Publikums-Fenster zu. Die Fläche bleibt auf der zuletzt gezeigten Folie.
 *
 * @param {{fensterZu?: boolean}} [optionen] fensterZu: das Fenster ist schon zu.
 * @returns {boolean} true, wenn eine lief.
 */
export function beende({ fensterZu = false } = {}) {
  const eigener = lauf;
  if (!eigener) return false;
  lauf = null;
  if (eigener.timer) clearTimeout(eigener.timer);
  if (eigener.beobachter) eigener.beobachter.disconnect();
  window.removeEventListener('keydown', beiTaste, true);
  // 4T-002280: Die Fläche zeigt die Folie wieder vollständig.
  setzeAufdeckModus(eigener.paneIdx, false, eigener.tab);
  renderPresentation(eigener.paneIdx);
  if (!fensterZu && typeof api.closePresentationWindow === 'function') {
    Promise.resolve(api.closePresentationWindow()).catch(() => {});
  }
  if (eigener.beimEnde) eigener.beimEnde();
  return true;
}

/**
 * Beendet die Vorführung, wenn ihre Spalte die Präsentation nicht mehr zeigt
 * (anderes Dokument oder andere Ansicht). Ein Wechsel der aktiven Spalte allein
 * beendet sie nicht: Das Hauptfenster bleibt bedienbar.
 *
 * @returns {boolean} true, wenn beendet wurde.
 */
export function pruefeFensterVorfuehrung() {
  if (!lauf) return false;
  if (gezeigtePraesentation(lauf.paneIdx) === lauf.tab) return false;
  return beende();
}

registriereFensterLauf({
  aktiv: istFensterVorfuehrungAktiv,
  pruefe: () => pruefeFensterVorfuehrung(),
  beende: () => beende(),
});
