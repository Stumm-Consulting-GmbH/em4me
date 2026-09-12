// 4T-001702 (Epic 3E-000288): Zeichnung einer Gruppe auf der Canvas-Fläche —
// Rahmen, Tönung, Beschriftung oben links, Größen-Griff und die Leiste an der
// gewählten Gruppe.
//
// **Warum ein eigenes Modul neben canvas-formen.js.** Eine Gruppe ist kein
// Sonderfall der Form, sondern die Gegenthese zu ihr: Die Form ist ein Körper,
// den man anfasst, die Gruppe ein **Rahmen um fremde Elemente**, deren
// Innenraum für den Zeiger durchlässig bleiben muss. Diese eine Eigenschaft
// zieht sich durch Zeichnung, Treffer-Fläche und Stilblatt; sie in die
// Formen-Zeichnung hineinzuflechten hieße, jede Zeile dort mit einer Weiche zu
// versehen.
//
// **Warum die Leiste hier steht und nicht in einem dritten Modul.** Bei den
// Formen trägt sie Art, acht Randfarben und neun Füllungen und hat dafür ein
// eigenes Modul verdient (`canvas-formen-leiste.js`); die Leiste der Gruppe ist
// **eine** Farb-Reihe und ein Knopf. Ein eigenes Modul dafür wäre eine Datei
// für sechzig Zeilen. Die Trennung, um die es 4T-001701 ging, bleibt gewahrt:
// Auch hier **baut** und **liest** die Leiste nur, ausgeführt wird ihr Befehl in
// der Bedienung, wo der Schreibweg liegt.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n` — die Beschriftungen der Leiste kommen über das injizierte `t`,
// die Beschriftung der Gruppe ist Dokument-Text und braucht keine Übersetzung.
// Farben kommen ausschließlich aus Theme-Variablen; ein eigener Farbwert steht
// nirgends.
'use strict';

import { LINIEN_FARBEN, LINIEN_FARB_NAMEN } from '../../../shared/canvas/canvas-core.js';
import { formGeometrie, kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';
import { SVG_NS, beschriftungsZeilen, farbVariable } from './canvas-linien.js';

// Maße einer neu angelegten Gruppe. Bewusst größer als Karte und Form: Eine
// Gruppe fasst zusammen, und was sie fassen soll, muss hineinpassen.
export const GRUPPE_BREITE = 420;
export const GRUPPE_HOEHE = 280;

// Breite des unsichtbaren Treffer-Rahmens, in Flächen-Einheiten. Der gezeichnete
// Rahmen ist zwei Einheiten breit; wer ihn mit der Maus treffen müsste, träfe
// ihn nie. Wert und Begründung vom Treffer-Pfad der Verbindungen übernommen.
const TREFFER_BREITE = 14;

// Höhe des Beschriftungs-Streifens für die Eingabe, in Flächen-Einheiten. Die
// Eingabe sitzt oben in der Gruppe, wo auch die Beschriftung steht — eine
// Eingabe über die ganze Gruppe verdeckte deren Inhalt.
export const BESCHRIFTUNGS_HOEHE = 44;

// Abstand der Leiste über der Oberkante, in Flächen-Einheiten (Wert der
// Formen-Leiste; zwei Leisten auf einer Fläche sollen gleich sitzen).
const LEISTEN_ABSTAND = 6;

/**
 * Zeichnet eine Gruppe als positionierte Hülle mit ihrem Rahmen darin.
 *
 * **Der Innenraum bleibt durchlässig.** Die Hülle fängt keinen Zeiger, der
 * Rahmen fängt ihn nur auf seinem Strich (Treffer-Rechteck), und die Tönung der
 * Fläche fängt ihn gar nicht. Damit bleibt jede Karte und jede Form **in** der
 * Gruppe anklickbar, auch wenn die Gruppe im Stapel über ihr liegt — ohne das
 * wäre eine nach vorn geholte Gruppe ein Deckel über ihrem eigenen Inhalt.
 *
 * @param {object} el Gruppen-Element des Modells (`art === 'gruppe'`).
 * @param {boolean} [aenderbar] Ist das Dokument änderbar? Im Anzeige-Modus
 *   entsteht der Größen-Griff gar nicht erst (Entscheidung E3): Ihn nur
 *   unsichtbar zu schalten reichte nicht — er bliebe anfassbar.
 * @returns {HTMLElement} die Hülle, noch nicht eingehängt.
 */
export function zeichneGruppe(el, aenderbar = true) {
  const r = kartenRechteck(el);
  const huelle = document.createElement('div');
  huelle.className = 'canvas-gruppe';
  huelle.dataset.canvasId = el.id || '';
  // Die Auswahl ist eine Aussage über das Element und gehört deshalb an das
  // Element, nicht allein in eine CSS-Klasse (Muster der Karte).
  huelle.setAttribute('aria-selected', 'false');
  huelle.style.left = `${r.x}px`;
  huelle.style.top = `${r.y}px`;
  huelle.style.width = `${r.b}px`;
  huelle.style.height = `${r.h}px`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'canvas-gruppe-svg');
  // Breite und Höhe in Einheiten der Fläche, ohne `viewBox`: Die gemeinsame
  // Vergrößerung liegt schon auf der Ebene darüber, und eine zweite Skalierung
  // im SVG zöge den Strich mit in die Breite (Muster der Formen-Zeichnung).
  svg.setAttribute('width', String(r.b));
  svg.setAttribute('height', String(r.h));

  // Der Rahmen ist das Rechteck der Formen-Geometrie: dieselbe Einrückung um
  // die halbe Strichstärke, damit die Hülle den Strich nicht abschneidet. Eine
  // zweite Einrück-Regel daneben liefe bei der nächsten Änderung auseinander.
  const figur = formGeometrie('rechteck', r.b, r.h);
  const farbe = farbVariable(el.farbe);

  // Zuerst das breite, unsichtbare Treffer-Rechteck: Es liegt unter dem
  // sichtbaren Rahmen und fängt den Klick auf dem Rand ein, ohne das Bild zu
  // verändern. Seine Fläche bleibt leer — der Innenraum gehört dem, was darin
  // liegt.
  const treffer = document.createElementNS(SVG_NS, 'rect');
  treffer.setAttribute('class', 'canvas-gruppe-treffer');
  for (const [name, wert] of Object.entries(figur.attrs)) {
    treffer.setAttribute(name, String(wert));
  }
  treffer.setAttribute('stroke-width', String(TREFFER_BREITE));
  svg.appendChild(treffer);

  // Rand deckend, Fläche getönt (Entscheidung F5 des Product Owners vom
  // 2026-09-12). Die Tönung macht das Stilblatt über die Deckkraft der Fläche
  // (`fill-opacity`), damit der Strich davon unberührt bleibt; ohne Angabe
  // greift die Standardfarbe aus dem Stilblatt — hier wird dann nichts gesetzt,
  // statt einen Wert zu erfinden.
  const rahmen = document.createElementNS(SVG_NS, 'rect');
  rahmen.setAttribute('class', 'canvas-gruppe-rahmen');
  for (const [name, wert] of Object.entries(figur.attrs)) {
    rahmen.setAttribute(name, String(wert));
  }
  if (farbe) {
    rahmen.style.stroke = farbe;
    rahmen.style.fill = farbe;
  }
  svg.appendChild(rahmen);
  huelle.appendChild(svg);

  // Beschriftung als **einfacher Text**, oben links im Rahmen (Story
  // 4S-000931): kein Markdown und keine Scroll-Fläche. Sie ist anfassbar, denn
  // sie ist neben dem Rand der zweite Griff der Gruppe — bei einer großen
  // Gruppe liegt der Rand weit draußen.
  const zeilen = beschriftungsZeilen(el);
  if (zeilen.length > 0) {
    const text = document.createElement('div');
    text.className = 'canvas-gruppe-text';
    text.textContent = zeilen.join('\n');
    if (farbe) text.style.color = farbe;
    huelle.appendChild(text);
  }

  if (aenderbar) {
    const griff = document.createElement('div');
    griff.className = 'canvas-gruppe-griff';
    griff.setAttribute('aria-hidden', 'true');
    huelle.appendChild(griff);
  }
  return huelle;
}

function knopf(aktion, beschriftung, zeichen) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-gruppe-knopf';
  el.dataset.aktion = aktion;
  // Sichtbar ein Zeichen, benannt der Text — dasselbe Verhältnis wie an den
  // beiden übrigen Leisten der Fläche.
  el.textContent = zeichen;
  el.title = beschriftung;
  el.setAttribute('aria-label', beschriftung);
  return el;
}

function farbKnopf(t, name, gewaehlt) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'canvas-gruppe-farbe';
  el.dataset.farbe = name || '';
  if (name) {
    el.style.background = farbVariable(name);
    el.title = t('canvas.gruppeFarbeName').replace(
      '{farbe}',
      t(`tabGroup.color.${LINIEN_FARBEN[name]}`),
    );
  } else {
    // Der neunte Knopf ist kein «ohne Farbe», sondern der Weg **zurück** zur
    // Standardfarbe: Ohne ihn bliebe eine einmal gewählte Farbe für immer, und
    // die Abwesenheit der Angabe wäre nicht mehr herstellbar.
    el.classList.add('canvas-gruppe-farbe-keine');
    el.title = t('canvas.gruppeStandardfarbe');
  }
  if (gewaehlt) el.classList.add('canvas-gruppe-farbe-aktiv');
  el.setAttribute('aria-label', el.title);
  el.setAttribute('aria-pressed', String(!!gewaehlt));
  return el;
}

/**
 * Baut die Leiste einer gewählten Gruppe.
 *
 * **Keine Füllungs-Wahl.** Die Fläche der Gruppe ist immer die Tönung ihrer
 * Farbe (F5); ein zweiter Farb-Satz dafür wäre eine Angabe, die die Grammatik
 * G6 gar nicht kennt.
 *
 * @param {object} ctx
 * @param {object} ctx.el Gruppen-Element des Modells.
 * @param {Function} ctx.t Übersetzungs-Funktion (injiziert).
 * @returns {HTMLElement} die Leiste, noch nicht eingehängt.
 */
export function baueGruppenLeiste({ el, t }) {
  const r = kartenRechteck(el);
  const leiste = document.createElement('div');
  leiste.className = 'canvas-gruppe-leiste';
  leiste.dataset.canvasId = el.id || '';
  leiste.appendChild(knopf('beschriftung', t('canvas.gruppeBeschriftung'), 'T'));
  const reihe = document.createElement('span');
  reihe.className = 'canvas-gruppe-farben';
  reihe.setAttribute('aria-label', t('canvas.gruppeFarbe'));
  for (const name of LINIEN_FARB_NAMEN) {
    reihe.appendChild(farbKnopf(t, name, el.farbe === name));
  }
  reihe.appendChild(farbKnopf(t, null, !el.farbe));
  leiste.appendChild(reihe);
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
 * @param {EventTarget} ziel Ziel des Klick-Ereignisses.
 * @returns {{art: string, wert?: string|null}|null} `null`, wenn das Ereignis
 *   keinen Knopf der Leiste getroffen hat.
 */
export function gruppenLeistenBefehl(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const farbe = ziel.closest('.canvas-gruppe-farbe');
  // Der leere Datensatz ist der Knopf «Standardfarbe». Er reicht `null` weiter
  // statt einer leeren Zeichenkette, weil der Kern die Abwesenheit einer
  // Angabe genau so schreibt.
  if (farbe) return { art: 'farbe', wert: farbe.dataset.farbe || null };
  const taste = ziel.closest('.canvas-gruppe-knopf');
  if (!taste) return null;
  return { art: taste.dataset.aktion };
}
