// 4T-001655 (Epic 3E-000287): Leiste an der gewählten Verbindung — Richtung,
// Umkehren, Beschriftung, die acht Farben und seit dem Befund 3 des Product
// Owners vom 2026-09-10 die beiden Auswahlfelder für Start- und Ziel-Seite.
//
// **Warum ein eigenes Modul neben canvas-verbindungen.js.** Die Bedienung lag
// nach dem ersten Bau bei 443 von 500 Code-Zeilen; die beiden Auswahlfelder
// und der dreiteilige Richtungs-Kreis hätten sie über das Budget gehoben. Der
// Schnitt folgt dabei der Fachlichkeit und nicht der Not: Die Leiste **baut**
// und **liest** nur, sie ändert nichts. Was ein Klick oder eine Auswahl
// bedeutet, sagt sie als Befehl an; ausgeführt wird er in der Bedienung, wo
// auch der Schreibweg liegt. Damit gibt es weiterhin genau einen Ort, an dem
// eine Handlung zu einer Transaktion wird.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`; die Beschriftungen kommen über das injizierte `t`, die
// Farb-Namen über die Schlüssel der Reiter-Gruppen, weil es dieselben acht
// Farben sind. Farbwerte stehen nirgends — der Punkt trägt die Theme-Variable.
'use strict';

import {
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
  linienRichtung,
} from '../../../shared/canvas/canvas-core.js';
import { farbVariable } from './canvas-linien.js';

// Die Werte der Auswahlfelder, in der Reihenfolge, in der sie erscheinen.
// `auto` steht voran, weil es der Zustand ohne Angabe ist und der Anwender
// dorthin zurückwill, wenn ihm die eigene Wahl nicht gefällt.
export const SEITEN_WAHL = ['auto', 'links', 'rechts', 'oben', 'unten'];

// Schlüssel der Seiten-Namen. Es gibt sie noch nicht im Bestand: Nachgesehen
// am 2026-09-10 trägt keine der fünf Sprachdateien «links» oder «oben» als
// eigenständiges Wort — was es gibt, sind Sätze wie «Nach oben verschieben»
// und Namen wie «Outgoing-Links», die hier nichts zu suchen haben.
const SEITEN_SCHLUESSEL = {
  auto: 'canvas.seiteAuto',
  links: 'canvas.seiteLinks',
  rechts: 'canvas.seiteRechts',
  oben: 'canvas.seiteOben',
  unten: 'canvas.seiteUnten',
};

// Zeichen des Richtungs-Knopfes. Es zeigt den **jetzigen** Zustand, nicht den
// nächsten: Der Anwender liest an der Leiste ab, was die Linie ist, und
// erfährt beim Drücken, was sie wird — die umgekehrte Lesart hätte dieselbe
// Fläche zweideutig gemacht.
const RICHTUNGS_ZEICHEN = { vor: '→', beide: '↔', keine: '—' };

function knopf(aktion, beschriftung, zeichen) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-linie-knopf';
  el.dataset.aktion = aktion;
  // Sichtbar ein Zeichen, benannt der Text: Die Leiste sitzt mitten auf der
  // Fläche und darf nicht breiter sein als die Linie lang ist; die
  // Beschriftung trägt trotzdem jede Sprache, über Titel und Namen.
  el.textContent = zeichen;
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  return el;
}

function farbKnopf(t, name) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-linie-farbe';
  el.dataset.farbe = name || '';
  if (name) {
    el.style.background = farbVariable(name);
    el.title = t(`tabGroup.color.${LINIEN_FARBEN[name]}`);
  } else {
    el.classList.add('canvas-linie-farbe-keine');
    el.title = t('canvas.linieKeineFarbe');
  }
  el.setAttribute('aria-label', el.title);
  return el;
}

/**
 * Auswahlfeld für eine Anschluss-Seite (Befund 3).
 *
 * @param {Function} t Übersetzungs-Funktion.
 * @param {string} angabe `von` oder `nach` — der Name der Angabe an der Zeile.
 * @param {string} [wert] jetziger Wert; alles Unbekannte zeigt als `auto`.
 */
function seitenFeld(t, angabe, wert) {
  const el = document.createElement('select');
  el.className = 'canvas-linie-seite';
  el.dataset.angabe = angabe;
  const beschriftung = t(angabe === 'von' ? 'canvas.linieVonSeite' : 'canvas.linieNachSeite');
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  for (const seite of SEITEN_WAHL) {
    const option = document.createElement('option');
    option.value = seite;
    option.textContent = t(SEITEN_SCHLUESSEL[seite]);
    el.appendChild(option);
  }
  // Ein von Hand eingetragener, unbekannter Wert bleibt Befund des Kerns und
  // wird hier **nicht** stillschweigend zu `auto` geschrieben: Das Feld zeigt
  // `auto`, aber die Zeile ändert sich erst, wenn der Anwender wählt.
  el.value = SEITEN_WAHL.includes(wert) ? wert : 'auto';
  return el;
}

/**
 * Baut die Leiste einer gewählten Verbindung.
 *
 * @param {object} ctx
 * @param {object} ctx.el Linien-Element des Modells.
 * @param {Function} ctx.t Übersetzungs-Funktion (injiziert).
 * @param {{x: number, y: number}} ctx.mitte Mittelpunkt des Pfades, in
 *   Flächen-Koordinaten.
 * @returns {HTMLElement} die Leiste, noch nicht eingehängt.
 */
export function baueLinienLeiste({ el, t, mitte }) {
  const leiste = document.createElement('div');
  leiste.className = 'canvas-linie-leiste';
  leiste.dataset.canvasId = el.id || '';
  leiste.appendChild(
    knopf('richtung', t('canvas.linieRichtung'), RICHTUNGS_ZEICHEN[linienRichtung(el)]),
  );
  leiste.appendChild(knopf('umkehren', t('canvas.linieUmkehren'), '⇄'));
  leiste.appendChild(knopf('beschriftung', t('canvas.linieBeschriftung'), 'T'));
  const attrs = el.attrs || {};
  leiste.appendChild(seitenFeld(t, 'von', attrs.von));
  leiste.appendChild(seitenFeld(t, 'nach', attrs.nach));
  const farben = document.createElement('span');
  farben.className = 'canvas-linie-farben';
  for (const name of LINIEN_FARB_NAMEN) farben.appendChild(farbKnopf(t, name));
  farben.appendChild(farbKnopf(t, null));
  leiste.appendChild(farben);
  leiste.style.left = `${mitte.x}px`;
  leiste.style.top = `${mitte.y}px`;
  return leiste;
}

/**
 * Liest, was ein Ereignis auf der Leiste bedeutet.
 *
 * Bewusst ein **Befehl** statt einer Wirkung: Dieses Modul kennt weder Modell
 * noch Schreibweg, und ein Rückruf je Knopf wäre eine zweite Aufzählung
 * derselben Handlungen.
 *
 * @param {EventTarget} ziel Ziel des Klick- oder Änderungs-Ereignisses.
 * @returns {{art: string, wert?: string}|null} `null`, wenn das Ereignis
 *   keinen Knopf und kein Feld der Leiste getroffen hat.
 */
export function leistenBefehl(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const farbe = ziel.closest('.canvas-linie-farbe');
  if (farbe) return { art: 'farbe', wert: farbe.dataset.farbe || null };
  const feld = ziel.closest('.canvas-linie-seite');
  if (feld) return { art: 'seite', angabe: feld.dataset.angabe, wert: feld.value };
  const taste = ziel.closest('.canvas-linie-knopf');
  if (!taste) return null;
  return { art: taste.dataset.aktion };
}
