// 4T-001747 (Epic 3E-000289): Leiste an der gewählten Karte — das Feld für das
// Verweis-Ziel, der Knopf «Ziel öffnen» und der Knopf «Verweis entfernen».
//
// **Warum ein eigenes Modul neben canvas-verweis-karten.js.** Dasselbe Muster
// und dieselbe Begründung wie bei `canvas-linien-leiste.js` und
// `canvas-formen-leiste.js`: Die Leiste **baut** und **liest** nur, sie ändert
// nichts. Was ein Klick oder eine Eingabe bedeutet, sagt sie als Befehl an;
// ausgeführt wird er in der Bedienung, wo auch der Schreibweg liegt. Damit gibt
// es weiterhin genau einen Ort, an dem eine Handlung zu einer Transaktion wird.
//
// **Die Leiste erscheint an jeder gewählten Karte, nicht nur an einer
// Verweis-Karte** (Entscheidung F2 des Product Owners vom 2026-09-12): Eine
// Text-Karte wird über dieses Feld zur Verweis-Karte und über den Knopf daneben
// wieder zur Text-Karte. Öffnen und Entfernen erscheinen nur, wenn die Karte
// auf etwas zeigt — ein Knopf, der nichts zu tun hätte, wäre kein Zugang.
//
// **Das Feld «Bild» ist mit 4T-001748 angefügt**, wie es der Schnitt vorsah:
// ein zweites Eingabe-Feld daneben, ein eigener Befehl über seine eigene
// Klasse, ein eigener Knopf «Bild entfernen». Beide Felder stehen **immer** da,
// weil über sie eine Text-Karte zur Verweis- **und** zur Bild-Karte wird; dass
// sie einander ausschließen, entscheidet der Kern und nicht die Leiste.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`; die Beschriftungen kommen über das injizierte `t`. Die
// Vorschläge für das Ziel reicht die Bedienung nach, sobald der Bereichs-Index
// geantwortet hat — dieses Modul fragt nichts.
'use strict';

import { kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';

// Abstand der Leiste über der Oberkante der Karte, in Flächen-Einheiten.
// Derselbe Wert wie an der Formen-Leiste: Es ist dieselbe Art von Werkzeug, und
// zwei Abstände dafür wären zwei Sprachen auf einer Fläche.
const LEISTEN_ABSTAND = 6;

// Fortlaufende Nummer der Vorschlags-Liste. Ein `<datalist>` wird über seine
// Kennung angebunden, und auf einer Fläche kann mehr als eine Eingabe
// gleichzeitig im Baum stehen (Leiste und freistehende Ziel-Abfrage).
let listenNummer = 0;

function knopf(aktion, beschriftung, zeichen) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-karte-knopf';
  el.dataset.aktion = aktion;
  // Sichtbar ein Zeichen, benannt der Text — dasselbe Verhältnis wie an der
  // Formen-Leiste: Die Leiste sitzt mitten auf der Fläche und bleibt schmal,
  // die Beschriftung trägt trotzdem jede Sprache über Titel und Namen.
  el.textContent = zeichen;
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  return el;
}

// 4T-001748: Der gemeinsame Rumpf beider Eingabe-Felder. Sie unterscheiden sich
// allein in ihrer Klasse und ihrer Beschriftung; zwei vollständige Fassungen
// nebeneinander liefen bei der nächsten Änderung auseinander. Die
// Vorschlags-Liste bekommt **jedes** Feld: Verweis-Ziele und Bild-Namen kommen
// aus je eigenen Sichten des Bereichs-Index, angeboten werden beide gleich.
function baueFeld(klasse, beschriftung, wert) {
  const huelle = document.createElement('span');
  huelle.className = 'canvas-karte-feld';
  const feld = document.createElement('input');
  feld.type = 'text';
  feld.className = klasse;
  feld.value = wert == null ? '' : String(wert);
  feld.spellcheck = false;
  feld.placeholder = beschriftung;
  feld.title = beschriftung;
  feld.setAttribute('aria-label', beschriftung);
  const liste = document.createElement('datalist');
  listenNummer += 1;
  liste.id = `canvas-karte-vorschlaege-${listenNummer}`;
  feld.setAttribute('list', liste.id);
  huelle.appendChild(feld);
  huelle.appendChild(liste);
  return huelle;
}

/**
 * Baut das Eingabe-Feld für ein Verweis-Ziel samt seiner Vorschlags-Liste.
 *
 * Dasselbe Feld steht an zwei Stellen: in der Leiste der gewählten Karte und
 * freistehend bei der Ziel-Abfrage des Anlege-Kommandos. Ein zweites Feld mit
 * eigener Bauart wäre ein zweiter Ort für dieselbe Eingabe.
 *
 * @param {Function} t Übersetzungs-Funktion (injiziert).
 * @param {string} [wert] Vorbelegung.
 * @returns {HTMLElement} Hülle mit Eingabe und Vorschlags-Liste.
 */
export function baueZielFeld(t, wert) {
  return baueFeld('canvas-karte-verweis-feld', t('canvas.verweisZiel'), wert);
}

/**
 * Baut das Eingabe-Feld für ein Bild samt seiner Vorschlags-Liste (4T-001748,
 * G8).
 *
 * Seine Vorschläge sind die **Bild-Dateien** des Bereichs und kommen aus einer
 * eigenen Sicht des Bereichs-Index (`autocomplete:imageTargets`) — die des
 * Ziel-Feldes daneben führt Markdown-Dateien und Zweitnamen und wäre hier ein
 * Angebot auf Ziele, die eine Bild-Karte nicht nehmen kann. Nachgereicht werden
 * sie wie dort, sobald der Index geantwortet hat; dieses Modul fragt nichts.
 *
 * @param {Function} t Übersetzungs-Funktion (injiziert).
 * @param {string} [wert] Vorbelegung.
 * @returns {HTMLElement} Hülle mit Eingabe und Vorschlags-Liste.
 */
export function baueBildFeld(t, wert) {
  return baueFeld('canvas-karte-bild-feld', t('canvas.bild'), wert);
}

/** Die Ziel-Eingabe innerhalb einer Hülle oder eines Teilbaums, oder `null`. */
export function zielFeldVon(wurzel) {
  if (!wurzel || typeof wurzel.querySelector !== 'function') return null;
  return wurzel.querySelector('.canvas-karte-verweis-feld');
}

/** Die Bild-Eingabe innerhalb einer Hülle oder eines Teilbaums, oder `null`. */
export function bildFeldVon(wurzel) {
  if (!wurzel || typeof wurzel.querySelector !== 'function') return null;
  return wurzel.querySelector('.canvas-karte-bild-feld');
}

// 4T-001748: Die Liste **neben einem bestimmten Feld** füllen. Seit die Leiste
// zwei Felder mit je eigener Liste trägt, wäre das erste `<datalist>` im
// Teilbaum die falsche Antwort — sie gehört dem Feld in derselben Hülle.
function fuelleListe(feld, namen) {
  const huelle =
    feld && typeof feld.closest === 'function' ? feld.closest('.canvas-karte-feld') : null;
  const liste = huelle ? huelle.querySelector('datalist') : null;
  if (!liste) return;
  liste.textContent = '';
  for (const name of Array.isArray(namen) ? namen : []) {
    const option = document.createElement('option');
    option.value = String(name);
    liste.appendChild(option);
  }
}

/**
 * Trägt die Verweis-Ziele des Bereichs-Index in die Liste des Ziel-Feldes nach.
 *
 * Sie kommen nach, weil die Abfrage über die Prozess-Brücke läuft und die
 * Leiste sofort dastehen soll: Ein Feld, das erst nach der Antwort erschiene,
 * wäre für den Anwender eine Verzögerung ohne Grund.
 *
 * @param {HTMLElement} wurzel Hülle oder Teilbaum mit dem Feld.
 * @param {Array<string>} namen
 */
export function setzeZielVorschlaege(wurzel, namen) {
  fuelleListe(zielFeldVon(wurzel), namen);
}

/**
 * Trägt die Bild-Namen des Bereichs-Index in die Liste des Bild-Feldes nach
 * (4T-001748), aus demselben Grund und auf demselben Weg.
 *
 * @param {HTMLElement} wurzel Hülle oder Teilbaum mit dem Feld.
 * @param {Array<string>} namen
 */
export function setzeBildVorschlaege(wurzel, namen) {
  fuelleListe(bildFeldVon(wurzel), namen);
}

/**
 * Baut die Leiste einer gewählten Karte.
 *
 * @param {object} ctx
 * @param {object} ctx.el Karten-Element des Modells.
 * @param {Function} ctx.t Übersetzungs-Funktion (injiziert).
 * @returns {HTMLElement} die Leiste, noch nicht eingehängt.
 */
export function baueKartenLeiste({ el, t }) {
  const r = kartenRechteck(el);
  const leiste = document.createElement('div');
  leiste.className = 'canvas-karte-leiste';
  leiste.dataset.canvasId = el.id || '';
  // Die Reihe der Felder: Verweis und — seit 4T-001748 — Bild. Beide stehen
  // immer da, weil über sie eine Text-Karte zur Verweis- und zur Bild-Karte
  // wird; dass sie einander ausschließen, entscheidet der Kern.
  leiste.appendChild(baueZielFeld(t, el.doc || ''));
  leiste.appendChild(baueBildFeld(t, el.bild || ''));
  // «Ziel öffnen» gilt beiden Angaben und heißt deshalb an beiden gleich; die
  // Entfernen-Knöpfe sind je Angabe eigene, weil sie je eine andere Angabe
  // wegnehmen. Keiner erscheint ohne Gegenstand — ein Knopf, der nichts zu tun
  // hätte, wäre kein Zugang.
  if (el.doc || el.bild) leiste.appendChild(knopf('oeffnen', t('canvas.verweisOeffnen'), '↗'));
  if (el.doc) leiste.appendChild(knopf('entfernen', t('canvas.verweisEntfernen'), '✕'));
  if (el.bild) leiste.appendChild(knopf('bildEntfernen', t('canvas.bildEntfernen'), '✕'));
  leiste.style.left = `${r.x + r.b / 2}px`;
  leiste.style.top = `${r.y - LEISTEN_ABSTAND}px`;
  return leiste;
}

/**
 * Liest, was ein Ereignis auf der Leiste bedeutet.
 *
 * Bewusst ein **Befehl** statt einer Wirkung (Muster `formLeistenBefehl`):
 * Dieses Modul kennt weder Modell noch Schreibweg, und ein Rückruf je Knopf
 * wäre eine zweite Aufzählung derselben Handlungen.
 *
 * @param {EventTarget} ziel Ziel des Klick- oder Änderungs-Ereignisses.
 * @returns {{art: string, wert?: string}|null} `null`, wenn das Ereignis weder
 *   Feld noch Knopf der Leiste getroffen hat.
 */
export function kartenLeistenBefehl(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const feld = ziel.closest('.canvas-karte-verweis-feld');
  if (feld) return { art: 'verweis', wert: feld.value };
  // 4T-001748: je Feld eine eigene Klasse. So sagt der Befehl, welche Angabe
  // gemeint ist, und die Bedienung muss nicht aus dem Wert raten.
  const bildFeld = ziel.closest('.canvas-karte-bild-feld');
  if (bildFeld) return { art: 'bild', wert: bildFeld.value };
  const taste = ziel.closest('.canvas-karte-knopf');
  if (!taste) return null;
  return { art: taste.dataset.aktion };
}

export { LEISTEN_ABSTAND };
