// 4T-001769 (Epic 3E-000290): Zeichnung einer Karte auf der Canvas-Fläche.
//
// **Warum ein eigenes Modul.** Form und Gruppe haben ihre Zeichnung seit
// 4T-001701 und 4T-001702 je in einer eigenen Datei (`canvas-formen.js`,
// `canvas-gruppen.js`); die Karte war die letzte der drei Arten, deren
// Zeichnung noch in der Ansicht selbst stand. Der Schnitt folgt damit dem
// Vorbild im Bestand und nicht einer neuen Idee — und er macht in der Ansicht
// den Platz frei, den die Kopplung an die Karten-Liste dort braucht
// (Datei-Größen-Budget: ein neues Modul statt Wachstum der bestehenden).
//
// Abhängigkeits-frei wie die Nachbarn (Injektions-Bauweise E4): kein
// `app-state`, kein `api`, kein `i18n` — Übersetzung, Markdown-Pipeline und
// Einbettungs-Abruf kommen als Optionen herein.
'use strict';

import { kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';
// 4T-001747: Welchen Körper die Karte bekommt — ihren eigenen Text oder den
// Inhalt des verwiesenen Dokuments samt Kopfzeile —, entscheidet das
// Anzeige-Modul. Der Abruf des Ziels läuft asynchron; die Karte steht sofort
// und füllt sich nach, ohne dass die Fläche neu gezeichnet wird.
import { baueKartenInneres } from './canvas-verweis-anzeige.js';

/**
 * Baut das DOM-Element einer Karte.
 *
 * @param {object} el Element der Art `karte`.
 * @param {object} anzeige Injizierte Umgebung: `t`, `pfad`, `renderMarkdown`,
 *   `nachRender`, `leseEinbettung`, `leseBild` und `aenderbar` (Befund 1 des
 *   Product Owners vom 2026-09-10).
 * @returns {HTMLElement}
 */
export function zeichneKarte(el, anzeige) {
  const r = kartenRechteck(el);
  const karte = document.createElement('article');
  karte.className = 'canvas-karte';
  karte.dataset.canvasId = el.id || '';
  // 4T-001654: Die Auswahl ist eine Aussage über das Element und gehört
  // deshalb an das Element, nicht allein in eine CSS-Klasse.
  karte.setAttribute('aria-selected', 'false');
  karte.style.left = `${r.x}px`;
  karte.style.top = `${r.y}px`;
  karte.style.width = `${r.b}px`;
  karte.style.height = `${r.h}px`;
  baueKartenInneres(karte, el, anzeige);
  // 4T-001654: Griff für die Größen-Änderung, unten rechts (Muster
  // buildPanelResizer). Er steht im Baum und wird erst sichtbar, wenn die
  // Karte gewählt ist oder der Zeiger über ihr steht — ein dauerhaft
  // sichtbarer Griff je Karte machte die Fläche unruhig.
  //
  // Befund 1 vom 2026-09-10: Im nicht änderbaren Dokument entsteht er gar
  // nicht. Ihn nur unsichtbar zu schalten reichte nicht — er bliebe
  // anfassbar, und genau das war der gemeldete Fehler.
  if (anzeige.aenderbar) {
    const griff = document.createElement('div');
    griff.className = 'canvas-karte-griff';
    griff.setAttribute('aria-hidden', 'true');
    karte.appendChild(griff);
  }
  return karte;
}
