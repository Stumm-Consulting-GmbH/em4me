// 4T-001701 (Epic 3E-000288): Zeichnung einer geometrischen Form auf der
// Canvas-Fläche — Hülle, Umriss der sechs Arten, Rand- und Füllfarbe, die
// Beschriftung und der Größen-Griff.
//
// **Warum ein eigenes Modul neben canvas-view.js.** Die Ansicht lag vor diesem
// Vorgang bei 377 von 500 Code-Zeilen, und der Umbau auf die gemeinsame
// Element-Ebene kostet sie schon einen Teil davon. Der Schnitt folgt dabei der
// Fachlichkeit und nicht der Not — die Form ist die erste Element-Art, deren
// **Gestalt** aus ihren Angaben entsteht statt aus ihrer Lage; das ist
// dieselbe Trennung, mit der `canvas-linien.js` neben der Ansicht steht.
//
// **Die Hülle ist der Preis der gemeinsamen Element-Ebene** (Entscheidung E4
// in der Fassung vom 2026-09-12). Karten sind HTML und Formen sind SVG; in
// **einer** geordneten Ebene können sie nur nebeneinander liegen, wenn beide
// dasselbe DOM sprechen. Also bekommt jede Form ein positioniertes `div` mit
// ihrem SVG darin — die Reihenfolge im Baum ist dann die Zeichen-Reihenfolge
// über alle Arten hinweg, und das löst G3 vollständig ein.
//
// **Die Hülle ist für den Zeiger durchlässig**, der Umriss darin nicht. Ohne
// das wählte ein Klick in die leere Ecke eines Dreiecks die Form aus, und eine
// Karte hinter dieser Ecke wäre unerreichbar. Die Zusage steht zur Hälfte hier
// (Klassen) und zur Hälfte im Stilblatt (`pointer-events`).
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n` — die Beschriftung ist Dokument-Text und braucht keine
// Übersetzung. Farben kommen ausschließlich aus Theme-Variablen; ein eigener
// Farbwert steht nirgends.
'use strict';

import { formGeometrie, kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';
import { SVG_NS, beschriftungsZeilen, farbVariable } from './canvas-linien.js';

// Maße einer neu angelegten Form. Bewusst kleiner als die Karte: Eine Form
// hebt hervor und trägt keinen Text; sie soll nicht als Erstes das halbe
// Sichtfenster füllen.
export const FORM_BREITE = 180;
export const FORM_HOEHE = 120;

/**
 * Zeichnet eine Form als positionierte Hülle mit ihrem Umriss darin.
 *
 * @param {object} el Formen-Element des Modells (`art === 'form'`).
 * @param {boolean} [aenderbar] Ist das Dokument änderbar? Im Anzeige-Modus
 *   entsteht der Größen-Griff gar nicht erst (Entscheidung E3): Ihn nur
 *   unsichtbar zu schalten reichte nicht — er bliebe anfassbar.
 * @returns {HTMLElement} die Hülle, noch nicht eingehängt.
 */
export function zeichneForm(el, aenderbar = true) {
  const r = kartenRechteck(el);
  const huelle = document.createElement('div');
  huelle.className = 'canvas-form';
  huelle.dataset.canvasId = el.id || '';
  // Die Auswahl ist eine Aussage über das Element und gehört deshalb an das
  // Element, nicht allein in eine CSS-Klasse (Muster der Karte).
  huelle.setAttribute('aria-selected', 'false');
  huelle.style.left = `${r.x}px`;
  huelle.style.top = `${r.y}px`;
  huelle.style.width = `${r.b}px`;
  huelle.style.height = `${r.h}px`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'canvas-form-svg');
  // Breite und Höhe in Einheiten der Fläche, ohne `viewBox`: Die gemeinsame
  // Vergrößerung liegt schon auf der Ebene darüber, und eine zweite Skalierung
  // im SVG zöge den Strich mit in die Breite.
  svg.setAttribute('width', String(r.b));
  svg.setAttribute('height', String(r.h));

  const figur = formGeometrie(el.formArt, r.b, r.h);
  const umriss = document.createElementNS(SVG_NS, figur.tag);
  const gefuellt = !!el.fuellung;
  umriss.setAttribute(
    'class',
    gefuellt ? 'canvas-form-flaeche canvas-form-gefuellt' : 'canvas-form-flaeche',
  );
  for (const [name, wert] of Object.entries(figur.attrs)) {
    umriss.setAttribute(name, String(wert));
  }
  // Rand deckend, Füllung getönt: Die Tönung macht das Stilblatt über die
  // Deckkraft der Fläche (`fill-opacity`), damit der Strich davon unberührt
  // bleibt. Ohne Angabe greift die Standardfarbe aus dem Stilblatt — hier wird
  // dann nichts gesetzt, statt einen Wert zu erfinden.
  const rand = farbVariable(el.rand);
  if (rand) umriss.style.stroke = rand;
  if (gefuellt) umriss.style.fill = farbVariable(el.fuellung);
  svg.appendChild(umriss);
  huelle.appendChild(svg);

  // Beschriftung als **einfacher Text**, mittig in der Form (Entscheidung F3
  // des Product Owners vom 2026-09-12): kein Markdown und keine Scroll-Fläche
  // — das bleibt der Unterschied zur Karte.
  const zeilen = beschriftungsZeilen(el);
  if (zeilen.length > 0) {
    const text = document.createElement('div');
    text.className = 'canvas-form-text';
    text.textContent = zeilen.join('\n');
    huelle.appendChild(text);
  }

  if (aenderbar) {
    const griff = document.createElement('div');
    griff.className = 'canvas-form-griff';
    griff.setAttribute('aria-hidden', 'true');
    huelle.appendChild(griff);
  }
  return huelle;
}
