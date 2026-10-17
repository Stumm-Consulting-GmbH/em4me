// 4T-002279 (Epic 3E-000348): Die Referenten-Ansicht — ein Zustand der
// Präsentations-Fläche des Hauptfensters (Story 4S-001075). Sie öffnet das
// Publikums-Fenster (presentation-publikum.js) und zeigt im Hauptfenster neben
// der aktuellen Folie die nächste Folie, die Sprecher-Notizen der aktuellen
// Folie und einen Zeitgeber.
//
// **Ein Folien-Zustand, zwei Fenster.** Die aktuelle Folie ist die der Fläche
// (presentation-pane.js); geblättert wird dort, aus der Fläche wie aus dem
// Publikums-Fenster, und die Vorführung im eigenen Fenster sendet die neu
// gezeichnete Folie. Diese Ansicht führt keinen eigenen Folien-Index, sondern
// zieht nach jedem Zeichnen der Fläche nach (`registriereNachZeichnen`). Ihr
// Zustand trägt den Aufdeck-Schritt der aktuellen Folie (4T-002280: die Zahl
// der sichtbaren Schritte aus presentation-aufdecken.js); die aktuelle Folie
// zeigt ihn, die nächste Folie erscheint vollständig.
//
// **Notizen** sind die Notizen der Folie aus dem Format-Kern (4T-002277:
// `{ text, herkunft }` in Dokument-Reihenfolge), gerendert über dieselbe
// Pipeline wie die Folie (`rendereInElement`), nie als Roh-HTML.
//
// **Ende:** Die Referenten-Ansicht endet mit der Vorführung im eigenen
// Fenster, gleich auf welchem Weg (Esc in einem der beiden Fenster, Kommando
// «Vorführung beenden», Schließen des Publikums-Fensters, Wegfall der
// Präsentation in ihrer Spalte). Die Fläche kehrt dann in die gewöhnliche
// Präsentations-Ansicht zurück, auf der zuletzt gezeigten Folie, und der
// Zeitgeber endet.
//
// **Senden:** Die Seite der Referenten-Ansicht trägt das Attribut
// `NICHT_SENDEN_ATTR`; ihre Änderungen (nächste Folie, Notizen, jede Sekunde
// der Zeitgeber) lösen kein Senden an das Publikums-Fenster aus.
//
// **Zyklusfrei:** importiert die Brücke, die Fläche, die Folie und die
// Vorführung im eigenen Fenster; den Fenster-Zustand kennt es nicht.
'use strict';

import { t } from '../../i18n.js';
import { baueFolie, beobachteBuehne, passeFolieEin } from './presentation-folie.js';
import { sichtbareSchritte } from './presentation-aufdecken.js';
import {
  FLAECHE_KLASSE,
  fokussierePraesentation,
  folienDerSpalte,
  folienStand,
  gezeigtePraesentation,
  praesentationsContainer,
  registriereNachZeichnen,
  renderPresentation,
  rendereInElement,
  zeichneWeitereFolie,
} from './presentation-pane.js';
import {
  NICHT_SENDEN_ATTR,
  beende as beendeFensterVorfuehrung,
  starteVorfuehrungImFenster,
} from './presentation-publikum.js';

/** Takt des Zeitgebers. */
export const ZEIT_TAKT_MS = 1000;

/** Klassen der Referenten-Ansicht; Maße und Farben stehen in presentation.css. */
export const REFERENT_ZUSTAND = 'praesentation-flaeche--referent';
export const REFERENT_KLASSE = 'praesentation-referent';
export const NAECHSTE_KLASSE = 'praesentation-referent-naechste';
export const VORSCHAU_KLASSE = 'praesentation-referent-vorschau';
export const ENDE_KLASSE = 'praesentation-referent-ende';
export const NOTIZEN_KLASSE = 'praesentation-referent-notizen';
export const NOTIZ_KLASSE = 'praesentation-referent-notiz';
export const KEINE_NOTIZEN_KLASSE = 'praesentation-referent-leer';
export const VERSTRICHEN_KLASSE = 'praesentation-referent-verstrichen';
export const UHRZEIT_KLASSE = 'praesentation-referent-uhrzeit';
export const ANHALTEN_KLASSE = 'praesentation-referent-anhalten';
export const ZURUECKSETZEN_KLASSE = 'praesentation-referent-zuruecksetzen';

// Laufende Referenten-Ansicht oder null.
let lauf = null;

/** Läuft gerade eine Referenten-Ansicht? */
export function istReferentenAnsichtAktiv() {
  return lauf !== null;
}

/**
 * Stand der laufenden Referenten-Ansicht (für Prüfung und Folge-Tasks).
 *
 * @returns {{paneIdx: number, index: number, aufdeckSchritt: number,
 *   laeuft: boolean, verstrichenMs: number}|null}
 */
export function referentenStand() {
  if (!lauf) return null;
  return {
    paneIdx: lauf.paneIdx,
    index: lauf.index,
    aufdeckSchritt: lauf.aufdeckSchritt,
    laeuft: lauf.zeit.laeuft,
    verstrichenMs: verstrichen(lauf.zeit),
  };
}

/**
 * Verstrichene Zeit als «m:ss», ab einer Stunde «h:mm:ss».
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatiereDauer(ms) {
  const sekunden = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const s = String(sekunden % 60).padStart(2, '0');
  const minuten = Math.floor(sekunden / 60);
  if (minuten < 60) return `${minuten}:${s}`;
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}:${s}`;
}

/**
 * Uhrzeit in Stunden und Minuten, in der Sprache der Oberfläche.
 *
 * @param {Date} datum
 * @param {string} [sprache]
 * @returns {string}
 */
export function formatiereUhrzeit(datum, sprache) {
  try {
    return datum.toLocaleTimeString(sprache || undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return datum.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

function verstrichen(zeit) {
  return zeit.laeuft ? zeit.basis + (Date.now() - zeit.seit) : zeit.basis;
}

function element(tag, klasse) {
  const el = document.createElement(tag);
  el.className = klasse;
  return el;
}

function knopf(klasse) {
  const el = element('button', `praesentation-knopf ${klasse}`);
  el.type = 'button';
  return el;
}

// Baut die Seite der Referenten-Ansicht: nächste Folie, Notizen, Zeitgeber.
function baueSeite() {
  const seite = element('aside', REFERENT_KLASSE);
  seite.setAttribute(NICHT_SENDEN_ATTR, '');

  const naechste = element('section', NAECHSTE_KLASSE);
  const naechsteTitel = element('div', 'praesentation-referent-titel');
  naechsteTitel.dataset.text = 'presentation.referent.naechste';
  const vorschau = element('div', VORSCHAU_KLASSE);
  vorschau.append(baueFolie());
  const ende = element('div', ENDE_KLASSE);
  ende.dataset.text = 'presentation.referent.ende';
  ende.hidden = true;
  naechste.append(naechsteTitel, vorschau, ende);

  const notizen = element('section', NOTIZEN_KLASSE);
  const notizenTitel = element('div', 'praesentation-referent-titel');
  notizenTitel.dataset.text = 'presentation.referent.notizen';
  const inhalt = element('div', 'markdown-body praesentation-referent-notizen-inhalt');
  inhalt.tabIndex = 0;
  const leer = element('p', KEINE_NOTIZEN_KLASSE);
  leer.dataset.text = 'presentation.referent.keineNotizen';
  notizen.append(notizenTitel, inhalt, leer);

  const zeit = element('section', 'praesentation-referent-zeit');
  const verstrichenEl = element('span', VERSTRICHEN_KLASSE);
  verstrichenEl.setAttribute('role', 'timer');
  const uhrzeit = element('span', UHRZEIT_KLASSE);
  zeit.append(verstrichenEl, uhrzeit, knopf(ANHALTEN_KLASSE), knopf(ZURUECKSETZEN_KLASSE));

  seite.append(naechste, notizen, zeit);
  seite.addEventListener('click', (ereignis) => {
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    if (ziel.closest(`.${ANHALTEN_KLASSE}`)) schalteZeitgeber();
    else if (ziel.closest(`.${ZURUECKSETZEN_KLASSE}`)) setzeZeitgeberZurueck();
  });
  return seite;
}

// Die Seite der laufenden Ansicht in der Fläche ihrer Spalte, bei Bedarf neu
// angehängt (die Fläche wird beim Wiedereintritt neu gebaut).
function seiteDerFlaeche(eigener) {
  const container = praesentationsContainer(eigener.paneIdx);
  const flaeche = container ? container.querySelector(`.${FLAECHE_KLASSE}`) : null;
  if (!flaeche) return null;
  flaeche.classList.add(REFERENT_ZUSTAND);
  let seite = flaeche.querySelector(`.${REFERENT_KLASSE}`);
  if (!seite) {
    seite = baueSeite();
    flaeche.append(seite);
    eigener.stand = null;
    beobachteBuehne(seite.querySelector(`.${VORSCHAU_KLASSE}`));
  }
  return seite;
}

// Texte der Seite; billig, bei jedem Nachzug gesetzt (Sprachwechsel).
function beschrifte(seite) {
  for (const el of seite.querySelectorAll('[data-text]')) el.textContent = t(el.dataset.text);
  const anhalten = seite.querySelector(`.${ANHALTEN_KLASSE}`);
  const zuruecksetzen = seite.querySelector(`.${ZURUECKSETZEN_KLASSE}`);
  const text =
    lauf && !lauf.zeit.laeuft
      ? 'presentation.referent.fortsetzen'
      : 'presentation.referent.anhalten';
  anhalten.textContent = t(text);
  anhalten.setAttribute('aria-pressed', lauf && !lauf.zeit.laeuft ? 'true' : 'false');
  zuruecksetzen.textContent = t('presentation.referent.zuruecksetzen');
  seite.querySelector(`.${VERSTRICHEN_KLASSE}`).title = t('presentation.referent.verstrichen');
  seite.querySelector(`.${UHRZEIT_KLASSE}`).title = t('presentation.referent.uhrzeit');
}

// Nächste Folie und Notizen zur aktuellen Folie.
function zeichneSeite(eigener, seite, index, anzahl) {
  const folien = folienDerSpalte(eigener.paneIdx);
  const vorschau = seite.querySelector(`.${VORSCHAU_KLASSE}`);
  const ende = seite.querySelector(`.${ENDE_KLASSE}`);
  const hatNaechste = index + 1 < anzahl;
  vorschau.hidden = !hatNaechste;
  ende.hidden = hatNaechste;
  if (hatNaechste) {
    zeichneWeitereFolie(eigener.paneIdx, vorschau.firstElementChild, index + 1);
    passeFolieEin(vorschau);
  }
  const folie = folien[index] || null;
  const notizen = folie && Array.isArray(folie.notizen) ? folie.notizen : [];
  const inhalt = seite.querySelector('.praesentation-referent-notizen-inhalt');
  inhalt.replaceChildren();
  for (const notiz of notizen) {
    const text = notiz && typeof notiz.text === 'string' ? notiz.text : '';
    if (!text.trim()) continue;
    const el = element('div', NOTIZ_KLASSE);
    el.dataset.herkunft = notiz.herkunft === 'html' ? 'html' : 'prozent';
    rendereInElement(eigener.paneIdx, el, text);
    inhalt.append(el);
  }
  inhalt.hidden = inhalt.childElementCount === 0;
  seite.querySelector(`.${KEINE_NOTIZEN_KLASSE}`).hidden = !inhalt.hidden;
  inhalt.scrollTop = 0;
}

/**
 * Zieht die Referenten-Ansicht nach dem Zeichnen der Fläche nach: Folien-
 * Index, Aufdeck-Schritt (4T-002280), nächste Folie, Notizen.
 *
 * @param {number} paneIdx
 * @param {boolean} neu Die Fläche hat die Folie neu gezeichnet.
 */
function zieheNach(paneIdx, neu) {
  const eigener = lauf;
  if (!eigener || eigener.paneIdx !== paneIdx) return;
  if (gezeigtePraesentation(paneIdx) !== eigener.tab) return;
  const stand = folienStand(paneIdx);
  const seite = seiteDerFlaeche(eigener);
  if (!stand || !seite) return;
  eigener.index = stand.index;
  const folie = folienDerSpalte(paneIdx)[stand.index] || null;
  eigener.aufdeckSchritt = sichtbareSchritte(paneIdx, eigener.tab, stand.index, folie);
  beschrifte(seite);
  const sprache = document.documentElement.lang || '';
  const schluessel = `${stand.index}/${stand.anzahl}/${sprache}`;
  if (
    neu ||
    !eigener.stand ||
    eigener.stand.schluessel !== schluessel ||
    eigener.stand.content !== eigener.tab.content
  ) {
    zeichneSeite(eigener, seite, stand.index, stand.anzahl);
    eigener.stand = { schluessel, content: eigener.tab.content };
  } else {
    passeFolieEin(seite.querySelector(`.${VORSCHAU_KLASSE}`));
  }
  zeigeZeit(seite);
}

registriereNachZeichnen(zieheNach);

// Schreibt verstrichene Zeit und Uhrzeit.
function zeigeZeit(seite) {
  if (!lauf || !seite) return;
  const sprache = document.documentElement.lang || '';
  seite.querySelector(`.${VERSTRICHEN_KLASSE}`).textContent = formatiereDauer(
    verstrichen(lauf.zeit),
  );
  seite.querySelector(`.${UHRZEIT_KLASSE}`).textContent = formatiereUhrzeit(new Date(), sprache);
}

function takt() {
  if (!lauf) return;
  const container = praesentationsContainer(lauf.paneIdx);
  zeigeZeit(container ? container.querySelector(`.${REFERENT_KLASSE}`) : null);
}

/**
 * Hält den Zeitgeber an oder setzt ihn fort.
 *
 * @returns {boolean|null} läuft er danach? null ohne Referenten-Ansicht.
 */
export function schalteZeitgeber() {
  if (!lauf) return null;
  const zeit = lauf.zeit;
  if (zeit.laeuft) {
    zeit.basis = verstrichen(zeit);
    zeit.laeuft = false;
  } else {
    zeit.seit = Date.now();
    zeit.laeuft = true;
  }
  aktualisiereZeitgeber();
  return zeit.laeuft;
}

/**
 * Setzt den Zeitgeber auf null; ein laufender läuft von dort weiter, ein
 * angehaltener bleibt angehalten.
 *
 * @returns {boolean} false ohne Referenten-Ansicht.
 */
export function setzeZeitgeberZurueck() {
  if (!lauf) return false;
  lauf.zeit.basis = 0;
  lauf.zeit.seit = Date.now();
  aktualisiereZeitgeber();
  return true;
}

function aktualisiereZeitgeber() {
  const container = lauf ? praesentationsContainer(lauf.paneIdx) : null;
  const seite = container ? container.querySelector(`.${REFERENT_KLASSE}`) : null;
  if (!seite) return;
  beschrifte(seite);
  zeigeZeit(seite);
}

/**
 * Startet die Referenten-Ansicht der Spalte: öffnet das Publikums-Fenster mit
 * der gezeigten Folie und zeigt im Hauptfenster aktuelle und nächste Folie,
 * Notizen und Zeitgeber. Einstieg des Kommandos «Referenten-Ansicht».
 *
 * @param {number} paneIdx
 * @returns {boolean} true, wenn sie gestartet ist; false, wenn bereits eine
 *   Referenten-Ansicht oder Vorführung läuft oder die Spalte keine
 *   Präsentation zeigt.
 */
export function starteReferentenAnsicht(paneIdx) {
  if (lauf) return false;
  const tab = gezeigtePraesentation(paneIdx);
  if (!tab || !praesentationsContainer(paneIdx)) return false;
  const jetzt = Date.now();
  const eigener = {
    paneIdx,
    tab,
    index: -1,
    aufdeckSchritt: 0,
    stand: null,
    takt: null,
    zeit: { basis: 0, seit: jetzt, laeuft: true },
  };
  lauf = eigener;
  const gestartet = starteVorfuehrungImFenster(paneIdx, { beimEnde: () => raeumeAuf(eigener) });
  if (!gestartet) {
    lauf = null;
    return false;
  }
  if (lauf !== eigener) return false;
  renderPresentation(paneIdx);
  // Ohne Neuzeichnen der Fläche meldet sie sich nicht; dann von Hand.
  if (!eigener.stand) zieheNach(paneIdx, true);
  eigener.takt = setInterval(takt, ZEIT_TAKT_MS);
  fokussierePraesentation(paneIdx);
  return true;
}

/**
 * Beendet die Referenten-Ansicht samt der Vorführung im eigenen Fenster.
 *
 * @returns {boolean} true, wenn eine lief.
 */
export function beendeReferentenAnsicht() {
  const eigener = lauf;
  if (!eigener) return false;
  // Die Vorführung ruft beim Ende raeumeAuf; lief sie nicht mehr, von Hand.
  if (!beendeFensterVorfuehrung()) raeumeAuf(eigener);
  return true;
}

// Ende der Referenten-Ansicht: Zeitgeber fort, Seite fort, die Fläche zurück in
// die gewöhnliche Präsentations-Ansicht auf der zuletzt gezeigten Folie.
function raeumeAuf(eigener) {
  if (lauf !== eigener) return;
  lauf = null;
  if (eigener.takt) clearInterval(eigener.takt);
  const container = praesentationsContainer(eigener.paneIdx);
  const flaeche = container ? container.querySelector(`.${FLAECHE_KLASSE}`) : null;
  if (flaeche) {
    flaeche.classList.remove(REFERENT_ZUSTAND);
    const seite = flaeche.querySelector(`.${REFERENT_KLASSE}`);
    if (seite) seite.remove();
  }
  if (gezeigtePraesentation(eigener.paneIdx) === eigener.tab) {
    renderPresentation(eigener.paneIdx);
    fokussierePraesentation(eigener.paneIdx);
  }
}
