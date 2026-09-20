// 4T-001765 (Epic 3E-000186): Aktivierbarkeit der Statusleisten-Schalter und
// ihre Darstellung.
//
// Zwei Dinge in einem Modul, weil sie dieselbe Frage von zwei Seiten
// beantworten: **ob** ein Schalter der Leiste gerade aktivierbar ist (Punkt 1
// des Lösungsansatzes) und **wie** die Leiste einen nicht aktivierbaren
// Schalter zeigt (Punkte 3 und 6).
//
// **Die Leiste ist Verbraucher des Verfügbarkeits-Modells, nicht dessen
// Zwilling** (E6 des Epics). Bis hierher beantwortete sie die Frage an drei
// Stellen selbst — `tabs/tabs.js` für die Ansichts- und die Editor-Schalter,
// `views/scroll-sync.js` für den Bildlauf-Gleichlauf, `views/history-status.js`
// für die Dokument-Historie. Alle drei rufen jetzt `setzeLeistenSchalter` auf
// und tragen keine eigene Bedingung mehr; die Regel je Schalter steht im
// Katalog `src/shared/commands/command-availability.js`, gefunden über das
// Kommando, das der Schalter auslöst. Damit gibt es zu jeder Bedingung genau
// eine Antwort für Menü, Kommando-Palette und Leiste.
//
// **Warum der Kontext hereingegeben wird und nicht hier gebaut.** Den
// Renderer-Kontext baut genau eine Stelle, `rendererAvailabilityContext` in
// `command-palette.js` (benannte Grenze des Modells, 4T-001636). Dieses Modul
// importiert sie bewusst NICHT: Die Palette liegt in der eingefrorenen
// Zyklus-Komponente des Renderers (`scripts/ordner-import-ausnahme.json`), und
// ein Import von hier aus zöge diese Datei in einen Ordner-übergreifenden
// Zyklus — ein Befund des Wächters `scripts/lint-ordner-importe.js`, weil die
// Komponente nicht wachsen darf. Die drei Aufrufer liegen ohnehin in ihr und
// reichen den Kontext mit; dieses Modul importiert nur den prozessneutralen
// Kern und die Preload-Brücke.
//
// **Drei unabhängige Sichtbarkeits-Achsen, und ihre Vorrang-Ordnung** (Punkt 5
// des Lösungsansatzes). Die Ausblend-Liste des Anwenders (`sb-user-hidden`,
// 4T-000520) wirkt VOR dieser Wahl: Was dort abgewählt ist, bleibt in beiden
// Werten weg, auch wenn es gerade aktivierbar wäre — sie und diese Achse
// sperren einander nicht, sondern gelten nebeneinander, und `display: none`
// gewinnt in jedem Fall. Das erweiterungs-bedingte Verschwinden über das
// `hidden`-Attribut bleibt unberührt; es sagt «gibt es nicht» und nicht «geht
// gerade nicht». Deshalb eine eigene Klasse und nicht das `hidden`-Attribut:
// Erweiterungs-Gates sowie Wort-Statistik und Zoom-Anzeige verwalten jenes
// selbst, und eine zweite Partei an demselben Attribut hieße, dass beide
// Seiten den Zustand der jeweils anderen löschen (Begründung wörtlich wie bei
// `sb-collapsed`, 4T-001579).
'use strict';

import { COMMANDS } from '../../shared/commands/commands.js';
import { isAvailable } from '../../shared/commands/command-availability.js';
import { api } from './app/api.js';

// 4T-001765 (E3 des Epics): Die beiden Werte der Einstellung. `blass` ist die
// Vorgabe und das heutige Verhalten — der Schalter bleibt an seinem Platz,
// sichtbar stillgelegt; `ausgeblendet` nimmt ihn für die Dauer des Zustands
// aus der Leiste. Ein dritter Wert «wie früher» (normal aussehender, nicht
// reagierender Schalter) ist ausgeschlossen: Er stellte genau den Mangel
// wieder her, den der Product Owner am 2026-09-09 beanstandet hat.
export const STATUSBAR_UNAVAILABLE_PALE = 'blass';
export const STATUSBAR_UNAVAILABLE_HIDDEN = 'ausgeblendet';
export const STATUSBAR_UNAVAILABLE_MODES = [
  STATUSBAR_UNAVAILABLE_PALE,
  STATUSBAR_UNAVAILABLE_HIDDEN,
];
export const STATUSBAR_UNAVAILABLE_MODE_KEY = 'statusbar.unavailableMode';

// Die dritte Sichtbarkeits-Achse: nicht aktivierbar UND Wert «ausblenden».
// Die Klasse trägt den zusammengesetzten Zustand und nicht bloß «nicht
// aktivierbar» — damit bleibt der Kandidaten-Filter der Faltung eine reine
// Klassen-Prüfung und braucht den Modus nicht zu kennen.
export const KLASSE_UNVERFUEGBAR_VERSTECKT = 'sb-unavailable-hidden';

// Kommando je Ansichts-Schalter der mittleren Zone. Der Schlüssel ist das
// `data-view` des Knopfes in index.html, der Wert das Kommando, das er
// auslöst; die Bedingung holt der Katalog aus der Registry.
export const ANSICHTS_KOMMANDOS = {
  live: 'view.modeLive',
  source: 'view.modeSource',
  split: 'view.modeSplit',
  rendered: 'view.modeRendered',
  mindmap: 'view.modeMindmap',
  canvas: 'view.modeCanvas',
};

/**
 * Die Schalter der Leiste, deren Aktivierbarkeit vom Zustand abhängt (E5 des
 * Epics: die mittlere und die rechte Zone). Die Panel-Schalter der linken
 * Zone, die eigenen Kommando-Schaltflächen, die Sprachwahl und der Wechsel des
 * Erscheinungsbilds kennen den Zustand «nicht aktivierbar» nicht und stehen
 * deshalb bewusst NICHT in dieser Liste.
 *
 * Die Liste ist Dokumentation UND Prüfgegenstand (Muster
 * `STATUSBAR_HIDE_TARGETS`): Ihr Wächter-Prüffall stellt jeden Eintrag gegen
 * die Registry und gegen die Bedingung, die der Schalter vor dem Umbau trug.
 */
export const STATUSBAR_AVAILABILITY_TARGETS = [
  { elementId: 'btn-fold-gutter', commandId: 'view.toggleFoldGutter' },
  { elementId: 'btn-numbers', commandId: 'view.toggleLineNumbers' },
  { elementId: 'btn-wrap', commandId: 'view.toggleWordWrap' },
  ...Object.entries(ANSICHTS_KOMMANDOS).map(([ansicht, commandId]) => ({
    selector: `.view-toggle .view-btn[data-view="${ansicht}"]`,
    commandId,
  })),
  { elementId: 'btn-edit', commandId: 'view.toggleEdit' },
  { elementId: 'btn-scroll-sync', commandId: 'view.toggleScrollSync' },
  { elementId: 'btn-history', commandId: 'history.open' },
];

// Bedingungs-Name je Kommando, einmal aus der Registry aufgelöst. Ein
// unbekanntes Kommando ergibt `undefined`; `isAvailable` antwortet dann mit
// «verfügbar» und damit wie der Bestand vor dem Umbau (Begründung dort).
const BEDINGUNG_JE_KOMMANDO = new Map(COMMANDS.map((c) => [c.id, c.availability]));

// Laufzeit-Wahrheit des Fensters. Bis `initStatusbarUnavailableModeFromStore()`
// gelaufen ist, gilt die Vorgabe.
let unverfuegbarModus = STATUSBAR_UNAVAILABLE_PALE;

/**
 * Bedingungs-Name des Verfügbarkeits-Modells für ein Kommando.
 *
 * @param {string} commandId Kommando-Kennung.
 * @returns {string|undefined} Name aus dem Katalog.
 */
export function bedingungFuerKommando(commandId) {
  return BEDINGUNG_JE_KOMMANDO.get(commandId);
}

/**
 * Ist der Schalter dieses Kommandos im gegebenen Kontext aktivierbar?
 *
 * Die eine gemeinsame Antwort der Leiste (AK1). Sie wertet allein den Katalog
 * aus; eine zusätzliche Bedingung an dieser Stelle wäre die dritte Fassung
 * derselben Regel und damit genau das, was E6 ausschließt.
 *
 * @param {string} commandId Kommando des Schalters.
 * @param {object} ctx Kontext aus `rendererAvailabilityContext()`.
 * @returns {boolean}
 */
export function istLeistenSchalterAktivierbar(commandId, ctx) {
  return isAvailable(bedingungFuerKommando(commandId), ctx);
}

/**
 * Setzt Zustand und Darstellung eines Leisten-Schalters.
 *
 * `disabled` meldet den Zustand wie bisher (Entwicklungsrichtlinien,
 * Kapitel 10: ein Zustands-Schalter meldet seinen Zustand, und die Farbe ist
 * nie der einzige Träger — die `:disabled`-Regeln des Stilblatts hängen an
 * genau diesem Attribut). Die Klasse kommt bei «ausblenden» hinzu; bei
 * «blass anzeigen» wird sie entfernt, sodass der Wert Zeichen für Zeichen das
 * heutige Verhalten ergibt (AK4).
 *
 * @param {Element|null} el Schaltfläche der Leiste.
 * @param {string} commandId Kommando des Schalters.
 * @param {object} ctx Kontext aus `rendererAvailabilityContext()`.
 * @returns {boolean} Ist der Schalter aktivierbar?
 */
export function setzeLeistenSchalter(el, commandId, ctx) {
  const aktivierbar = istLeistenSchalterAktivierbar(commandId, ctx);
  if (el) {
    el.disabled = !aktivierbar;
    el.classList.toggle(
      KLASSE_UNVERFUEGBAR_VERSTECKT,
      !aktivierbar && unverfuegbarModus === STATUSBAR_UNAVAILABLE_HIDDEN,
    );
  }
  return aktivierbar;
}

/** Element eines Eintrags der Ziel-Liste, oder null. */
function elementFuer(ziel) {
  return ziel.elementId
    ? document.getElementById(ziel.elementId)
    : document.querySelector(ziel.selector);
}

/**
 * Zieht die Darstellung aller Ziel-Schalter auf den geltenden Modus nach.
 *
 * Gelesen wird der Zustand, den die drei Aufrufer gesetzt haben (`disabled`),
 * und nicht der Kontext: Ein Modus-Wechsel ändert nichts an der
 * Aktivierbarkeit, sondern allein an ihrer Darstellung — und so braucht dieses
 * Modul weder den Kontext-Bau noch einen Rückruf in die Leiste.
 */
export function wendeUnverfuegbarModusAn() {
  const versteckt = unverfuegbarModus === STATUSBAR_UNAVAILABLE_HIDDEN;
  for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
    const el = elementFuer(ziel);
    if (el) el.classList.toggle(KLASSE_UNVERFUEGBAR_VERSTECKT, versteckt && el.disabled === true);
  }
}

/**
 * Bringt einen beliebigen (auch defekten) Stand auf einen der beiden Werte.
 *
 * Jeder Wert außer `ausgeblendet` fällt auf die Vorgabe zurück — dieselbe
 * Rückfall-Regel wie beim Falt-Modus (`normalisiereFaltModus` in
 * statusbar-overflow.js).
 *
 * @param {*} wert Rohwert aus Speicher, Broadcast oder Einstellungs-Entwurf.
 * @returns {'blass'|'ausgeblendet'} Gültiger Modus.
 */
export function normalisiereUnverfuegbarModus(wert) {
  return wert === STATUSBAR_UNAVAILABLE_HIDDEN
    ? STATUSBAR_UNAVAILABLE_HIDDEN
    : STATUSBAR_UNAVAILABLE_PALE;
}

export function getStatusbarUnavailableMode() {
  return unverfuegbarModus;
}

/**
 * App-Start: persistierten Modus laden (Muster
 * `initStatusbarCollapseModeFromStore`).
 *
 * Läuft als Vorlauf von `initStatusbarOverflow()` und nicht als eigener
 * Schritt in `init()` von app-init.js: Jener Verdrahtungs-Knoten steht auf
 * seinem Datei-Budget (`scripts/datei-groessen-ausnahmen.json`), und der
 * Falt-Modus ist aus demselben Grund dorthin gewandert. Ein fehlender oder
 * defekter Stand ergibt die Vorgabe «blass anzeigen».
 *
 * @returns {Promise<'blass'|'ausgeblendet'>} Der geladene Modus.
 */
export async function initStatusbarUnavailableModeFromStore() {
  let gespeichert;
  try {
    gespeichert = await api.getSetting(STATUSBAR_UNAVAILABLE_MODE_KEY);
  } catch (err) {
    console.warn('Darstellung nicht aktivierbarer Schalter laden fehlgeschlagen:', err);
  }
  unverfuegbarModus = normalisiereUnverfuegbarModus(gespeichert);
  return unverfuegbarModus;
}

/**
 * Modus setzen — normalisiert, zieht die Leiste nach, benachrichtigt offene
 * Einstellungs-Entwürfe und persistiert.
 *
 * `persist: false` für den Empfang des Fenster-Broadcasts
 * (`statusbarUnavailableMode:changed`), damit der Speicher nicht doppelt
 * geschrieben wird; ein unveränderter Modus ist ein No-op (Muster
 * `setStatusbarCollapseMode`).
 *
 * Die Faltung wird hier NICHT angestoßen: Ihr MutationObserver sieht die
 * Klassen-Änderung von `wendeUnverfuegbarModusAn()` und misst von selbst neu
 * (Modul-Kopf von statusbar-overflow.js, «Warum eine Beobachtung und keine
 * Aufrufe aus den Nachbar-Modulen»). Ein Aufruf von hier wäre zudem der
 * Gegen-Import zwischen zwei Nachbar-Modulen.
 *
 * @param {*} wert Gewünschter Modus.
 * @param {{persist?: boolean}} [opts] Persistierung steuern.
 * @returns {Promise<'blass'|'ausgeblendet'>} Der wirksame Modus.
 */
export async function setStatusbarUnavailableMode(wert, { persist = true } = {}) {
  const naechster = normalisiereUnverfuegbarModus(wert);
  if (naechster === unverfuegbarModus) return unverfuegbarModus;
  unverfuegbarModus = naechster;
  wendeUnverfuegbarModusAn();
  document.dispatchEvent(new CustomEvent('scg:statusbar-unavailable-mode-changed'));
  if (persist) {
    try {
      await api.setSetting(STATUSBAR_UNAVAILABLE_MODE_KEY, naechster);
    } catch (err) {
      console.warn('Darstellung nicht aktivierbarer Schalter speichern fehlgeschlagen:', err);
    }
  }
  return unverfuegbarModus;
}
