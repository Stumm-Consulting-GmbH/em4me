// 4T-001701 (Epic 3E-000288): Leiste an der gewählten Form — Art, Beschriftung,
// die acht Randfarben und die acht Füllfarben samt «keine Füllung».
//
// **Warum ein eigenes Modul neben canvas-formen-bedienung.js.** Dasselbe
// Muster und dieselbe Begründung wie bei `canvas-linien-leiste.js`: Die Leiste
// **baut** und **liest** nur, sie ändert nichts. Was ein Klick oder eine
// Auswahl bedeutet, sagt sie als Befehl an; ausgeführt wird er in der
// Bedienung, wo auch der Schreibweg liegt. Damit gibt es weiterhin genau einen
// Ort, an dem eine Handlung zu einer Transaktion wird.
//
// **Zwei Farb-Reihen statt einer**, anders als bei der Verbindung: Eine Form
// trägt zwei Farb-Angaben, und ein gemeinsamer Satz von Knöpfen ließe offen,
// welche von beiden gemeint ist. Die Zugehörigkeit steht an der Reihe
// (`data-angabe`) und im Titel jedes Knopfes, damit sie auch ohne Augenmaß
// ablesbar ist.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`; die Beschriftungen kommen über das injizierte `t`, die
// Farb-Namen über die Schlüssel der Reiter-Gruppen, weil es dieselben acht
// Farben sind. Farbwerte stehen nirgends — der Punkt trägt die Theme-Variable.
'use strict';

import {
  FORM_ARTEN,
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
} from '../../../shared/canvas/canvas-core.js';
import { kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';
import { farbVariable } from './canvas-linien.js';

// Schlüssel der Art-Namen. Ein Schlüssel je Art statt eines gemeinsamen
// Musters mit angehängtem Namen: Die Namen der Grammatik sind deutsch, die
// Schlüssel der Anwendung sind es nicht, und ein zusammengesetzter Schlüssel
// entzöge sich dem Wächter `check-i18n.js`.
//
// Exportiert, weil das Kontextmenü dieselben sechs Namen anbietet (B6) und
// eine zweite Zuordnung dort auseinanderliefe.
export const ART_SCHLUESSEL = {
  rechteck: 'canvas.formArtRechteck',
  abgerundet: 'canvas.formArtAbgerundet',
  oval: 'canvas.formArtOval',
  dreieck: 'canvas.formArtDreieck',
  raute: 'canvas.formArtRaute',
  stern: 'canvas.formArtStern',
};

// Abstand der Leiste über der Oberkante der Form, in Flächen-Einheiten. Sie
// sitzt **über** der Form und nicht in ihr: In der Form verdeckte sie die
// Beschriftung, und bei einer kleinen Form wäre sie breiter als ihr Träger.
const LEISTEN_ABSTAND = 6;

function knopf(aktion, beschriftung, zeichen) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-form-knopf';
  el.dataset.aktion = aktion;
  // Sichtbar ein Zeichen, benannt der Text — dasselbe Verhältnis wie an der
  // Linien-Leiste: Die Leiste sitzt mitten auf der Fläche und bleibt schmal,
  // die Beschriftung trägt trotzdem jede Sprache über Titel und Namen.
  el.textContent = zeichen;
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  return el;
}

function artFeld(t, wert) {
  const el = document.createElement('select');
  el.className = 'canvas-form-art';
  const beschriftung = t('canvas.formArt');
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  for (const art of FORM_ARTEN) {
    const option = document.createElement('option');
    option.value = art;
    option.textContent = t(ART_SCHLUESSEL[art]);
    el.appendChild(option);
  }
  // Eine von Hand eingetragene, unbekannte Art bleibt Befund des Kerns und
  // wird hier **nicht** stillschweigend überschrieben: Das Feld zeigt die
  // Ersatz-Art, die Zeile ändert sich erst, wenn der Anwender wählt.
  el.value = FORM_ARTEN.includes(wert) ? wert : FORM_ARTEN[0];
  return el;
}

function farbKnopf(t, angabe, name, gewaehlt) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-form-farbe';
  el.dataset.angabe = angabe;
  el.dataset.farbe = name || '';
  const muster = angabe === 'rand' ? 'canvas.formRandFarbe' : 'canvas.formFuellFarbe';
  if (name) {
    el.style.background = farbVariable(name);
    el.title = t(muster).replace('{farbe}', t(`tabGroup.color.${LINIEN_FARBEN[name]}`));
  } else {
    el.classList.add('canvas-form-farbe-keine');
    el.title = t('canvas.formKeineFuellung');
  }
  if (gewaehlt) el.classList.add('canvas-form-farbe-aktiv');
  el.setAttribute('aria-label', el.title);
  el.setAttribute('aria-pressed', String(!!gewaehlt));
  return el;
}

// Eine Reihe Farb-Knöpfe. Die Füllung bekommt zusätzlich «keine» am Ende, der
// Rand nicht: Eine Form ohne Rand wäre bei fehlender Füllung unsichtbar und
// damit auch nicht mehr anfassbar.
function farbReihe(t, angabe, wert) {
  const reihe = document.createElement('span');
  reihe.className = 'canvas-form-farben';
  reihe.dataset.angabe = angabe;
  reihe.setAttribute(
    'aria-label',
    t(angabe === 'rand' ? 'canvas.formRand' : 'canvas.formFuellung'),
  );
  for (const name of LINIEN_FARB_NAMEN) {
    reihe.appendChild(farbKnopf(t, angabe, name, wert === name));
  }
  if (angabe === 'fuellung') reihe.appendChild(farbKnopf(t, angabe, null, !wert));
  return reihe;
}

/**
 * Baut die Leiste einer gewählten Form.
 *
 * @param {object} ctx
 * @param {object} ctx.el Formen-Element des Modells.
 * @param {Function} ctx.t Übersetzungs-Funktion (injiziert).
 * @returns {HTMLElement} die Leiste, noch nicht eingehängt.
 */
export function baueFormenLeiste({ el, t }) {
  const r = kartenRechteck(el);
  const leiste = document.createElement('div');
  leiste.className = 'canvas-form-leiste';
  leiste.dataset.canvasId = el.id || '';
  leiste.appendChild(artFeld(t, el.formArt));
  leiste.appendChild(knopf('beschriftung', t('canvas.formBeschriftung'), 'T'));
  leiste.appendChild(farbReihe(t, 'rand', el.rand));
  leiste.appendChild(farbReihe(t, 'fuellung', el.fuellung));
  leiste.style.left = `${r.x + r.b / 2}px`;
  leiste.style.top = `${r.y - LEISTEN_ABSTAND}px`;
  return leiste;
}

/**
 * Liest, was ein Ereignis auf der Leiste bedeutet.
 *
 * Bewusst ein **Befehl** statt einer Wirkung (Muster `leistenBefehl`): Dieses
 * Modul kennt weder Modell noch Schreibweg, und ein Rückruf je Knopf wäre eine
 * zweite Aufzählung derselben Handlungen.
 *
 * @param {EventTarget} ziel Ziel des Klick- oder Änderungs-Ereignisses.
 * @returns {{art: string, wert?: string|null}|null} `null`, wenn das Ereignis
 *   keinen Knopf und kein Feld der Leiste getroffen hat.
 */
export function formLeistenBefehl(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const farbe = ziel.closest('.canvas-form-farbe');
  if (farbe) {
    return {
      art: farbe.dataset.angabe === 'rand' ? 'rand' : 'fuellung',
      // Der leere Datensatz ist der Knopf «keine Füllung». Er reicht `null`
      // weiter statt einer leeren Zeichenkette, weil der Kern die Abwesenheit
      // einer Angabe genau so schreibt.
      wert: farbe.dataset.farbe || null,
    };
  }
  const feld = ziel.closest('.canvas-form-art');
  if (feld) return { art: 'formArt', wert: feld.value };
  const taste = ziel.closest('.canvas-form-knopf');
  if (!taste) return null;
  return { art: taste.dataset.aktion };
}
