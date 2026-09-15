// 4T-001655 (Epic 3E-000287): Zeichnung der Verbindungen — Pfad, Pfeilspitze,
// Farbe, Beschriftung, Hervorhebung und der breite Treffer-Pfad, über den eine
// Linie überhaupt anfassbar wird.
//
// **Warum ein eigenes Modul neben canvas-view.js.** Die Ansicht lag nach
// 4T-001654 bei 443 von 500 Code-Zeilen; die vier Zutaten dieses Tasks (Farbe,
// Beschriftung, Hervorhebung, Treffer-Fläche) hätten sie über das Budget
// gehoben. Der Schnitt folgt dabei nicht der Not, sondern der Fachlichkeit:
// Die Verbindungs-Ebene ist die einzige Zeichnung der Fläche, die ihre Maße
// **rechnen** muss statt sie aus dem Modell zu übernehmen — die Karten stehen
// an ihrer Lage, eine Linie entsteht erst aus beiden Enden.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`; die Beschriftung ist Dokument-Text und braucht keine
// Übersetzung. Farben kommen ausschließlich aus Theme-Variablen — der Name an
// der Linie zeigt über den Kern auf einen Theme-Schlüssel, und dieses Modul
// setzt daraus `var(--tab-group-<schluessel>)`. Ein eigener Farbwert steht
// nirgends.
'use strict';

import { LINIEN_FARBEN, linienRichtung } from '../../../shared/canvas/canvas-core.js';
import {
  pfeilSpitzePfad,
  verbindungsMitte,
  verbindungsPfad,
  waehleSeiten,
} from '../../../shared/canvas/canvas-geometrie.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Breite des unsichtbaren Treffer-Pfades. Die gezeichnete Linie ist 1,6
// Einheiten breit; wer sie mit der Maus treffen müsste, träfe sie nie.
const TREFFER_BREITE = 14;

// Maße der Beschriftung. Die Zeilenhöhe ist gesetzt und nicht gemessen: Ein
// SVG-Text lässt sich erst nach dem Einhängen ausmessen, und die Zeichnung
// soll ohne einen zweiten Durchgang auskommen. Die Breiten-Schätzung
// (Zeichen mal mittlere Zeichenbreite) trägt nur das Hintergrund-Rechteck;
// steht der Text einmal darüber hinaus, bleibt er lesbar.
const ZEILEN_HOEHE = 14;
const ZEICHEN_BREITE = 6.2;
const GRUND_POLSTER = 5;

// Die Elemente, auf denen ein Klick **nicht** dem Hintergrund der Fläche gilt.
// Die Regel steht einmal hier, weil sie an drei Stellen dieselbe sein muss:
// beim Ziehen der Fläche, beim Aufheben der Karten-Auswahl und beim
// Doppelklick, der sonst eine Karte anlegte (4T-001655).
//
// 4T-001701: Die Formen kommen als vierte Art hinzu. Die Aufzählung wächst
// damit weiter an **einer** Stelle; eine zweite Kopie in der Formen-Bedienung
// liefe unweigerlich auseinander. Bemerkenswert ist, was hier **nicht** steht:
// die Hülle `.canvas-form` fängt keinen Zeiger (sie ist für ihn durchlässig),
// gemeint ist allein ihr Umriss — wer neben das Dreieck klickt, meint die
// Fläche und nicht die Form.
// 4T-001702: Die Gruppen kommen als fünfte Art hinzu, und dieselbe Bemerkung
// gilt doppelt: Von der Gruppe steht hier allein, was den Zeiger **fängt** —
// Treffer-Rahmen, Beschriftung, Griff, Leiste und Eingabe. Ihr Innenraum ist
// ausdrücklich Hintergrund: Wer mitten in eine Gruppe klickt, meint die Fläche
// oder das Element darin, und ein Doppelklick dort legt eine Karte an.
// 4T-001747: Die Leiste der gewählten Karte und die freistehende Ziel-Abfrage
// des Anlege-Kommandos kommen als sechste Art hinzu. Beide liegen über der
// Fläche und fangen den Zeiger; ohne sie hier begänne unter der Leiste das
// Ziehen der Fläche, und ein Doppelklick auf das Eingabe-Feld legte eine Karte
// an.
const VORDERGRUND_WAHL =
  '.canvas-karte, .canvas-linie, .canvas-linie-leiste, .canvas-linie-eingabe, ' +
  '.canvas-form-flaeche, .canvas-form-griff, .canvas-form-leiste, .canvas-form-eingabe, ' +
  '.canvas-gruppe-treffer, .canvas-gruppe-text, .canvas-gruppe-griff, ' +
  '.canvas-gruppe-leiste, .canvas-gruppe-eingabe, ' +
  '.canvas-karte-leiste, .canvas-karte-ziel-eingabe';

/** Gilt ein Ereignis-Ziel als Hintergrund der Fläche? */
export function istHintergrund(ziel) {
  return !(ziel && typeof ziel.closest === 'function' && ziel.closest(VORDERGRUND_WAHL));
}

/**
 * Theme-Variable zu einem Farb-Namen der Grammatik.
 *
 * @param {string} [name] Name aus dem Satz des Kerns.
 * @returns {string} `var(--tab-group-…)`, oder leer für die gewohnte
 *   Linienfarbe aus dem Stilblatt.
 */
export function farbVariable(name) {
  const schluessel = name ? LINIEN_FARBEN[name] : null;
  return schluessel ? `var(--tab-group-${schluessel})` : '';
}

function svgKnoten(art, klasse) {
  const el = document.createElementNS(SVG_NS, art);
  el.setAttribute('class', klasse);
  return el;
}

/**
 * Inhalts-Zeilen eines Elements als Beschriftung. Leere Zeilen am Ende fallen
 * weg: Der Parser hängt dem Inhalt eines Elements die Trennzeile zum nächsten
 * an, und eine leere Zeile im Bild wäre nur ein Loch.
 *
 * 4T-001701: Bewusst über die Art hinweg und deshalb exportiert. Die
 * Beschriftung einer Form ist derselbe Rohtext wie die einer Verbindung, und
 * eine zweite Funktion mit demselben Rumpf wäre ein zweiter Ort für dieselbe
 * Regel — dasselbe Muster wie `setzeElementInhalt` in der Karten-Bedienung.
 */
export function beschriftungsZeilen(el) {
  const zeilen = String(el.inhalt || '').split('\n');
  while (zeilen.length > 0 && zeilen[zeilen.length - 1].trim() === '') zeilen.pop();
  return zeilen;
}

function zeichneBeschriftung(gruppe, zeilen, mitte, farbe) {
  const breite = Math.max(...zeilen.map((z) => z.length)) * ZEICHEN_BREITE + GRUND_POLSTER * 2;
  const hoehe = zeilen.length * ZEILEN_HOEHE + GRUND_POLSTER * 2;
  // Das Hintergrund-Rechteck ist kein Schmuck: Ohne es stünde der Text auf der
  // Linie und wäre an der Kreuzung zweier Verbindungen unlesbar.
  const grund = svgKnoten('rect', 'canvas-linie-grund');
  grund.setAttribute('x', String(mitte.x - breite / 2));
  grund.setAttribute('y', String(mitte.y - hoehe / 2));
  grund.setAttribute('width', String(breite));
  grund.setAttribute('height', String(hoehe));
  grund.setAttribute('rx', '3');
  if (farbe) grund.style.stroke = farbe;
  gruppe.appendChild(grund);

  const text = svgKnoten('text', 'canvas-linie-text');
  text.setAttribute('x', String(mitte.x));
  text.setAttribute('y', String(mitte.y - hoehe / 2 + GRUND_POLSTER + ZEILEN_HOEHE * 0.75));
  text.setAttribute('text-anchor', 'middle');
  zeilen.forEach((zeile, i) => {
    // Zeile für Zeile als eigener `tspan`: Ein SVG-Text bricht nicht um, und
    // die Beschriftung einer Verbindung ist mehrzeilig erlaubt. Klartext ohne
    // Markdown-Rendern — das gehört in die Karte, nicht an die Linie.
    const teil = svgKnoten('tspan', 'canvas-linie-textzeile');
    teil.setAttribute('x', String(mitte.x));
    if (i > 0) teil.setAttribute('dy', String(ZEILEN_HOEHE));
    teil.textContent = zeile;
    text.appendChild(teil);
  });
  gruppe.appendChild(text);
}

/**
 * Zeichnet eine einzelne Verbindung.
 *
 * @param {object} el Linien-Element des Modells.
 * @param {Function} karteZu (id) => Karten-Element oder `null`.
 * @param {boolean} [gewaehlt]
 * @returns {SVGElement|null} die Gruppe, oder `null` für eine Verbindung ins
 *   Leere: Der Kern meldet sie als Befund und behält sie, gezeichnet wird sie
 *   nicht, weil ihr ein Ende fehlt (AK7).
 */
export function zeichneVerbindung(el, karteZu, gewaehlt = false) {
  const von = karteZu(el.von);
  const nach = karteZu(el.nach);
  if (!von || !nach) return null;

  const gruppe = svgKnoten('g', gewaehlt ? 'canvas-linie canvas-linie-gewaehlt' : 'canvas-linie');
  gruppe.setAttribute('data-canvas-id', el.id || '');
  // Die Auswahl ist eine Aussage über das Element und gehört an das Element,
  // nicht allein in eine CSS-Klasse (Muster der Karte).
  gruppe.setAttribute('aria-selected', String(!!gewaehlt));

  const seiten = waehleSeiten(von, nach, el.attrs && el.attrs.von, el.attrs && el.attrs.nach);
  const d = verbindungsPfad(von, nach, seiten);
  const farbe = farbVariable(el.farbe);

  // Zuerst der breite, unsichtbare Treffer-Pfad: Er liegt unter dem sichtbaren
  // und fängt den Klick ein, ohne das Bild zu verändern.
  const treffer = svgKnoten('path', 'canvas-linie-treffer');
  treffer.setAttribute('d', d);
  treffer.setAttribute('stroke-width', String(TREFFER_BREITE));
  gruppe.appendChild(treffer);

  const pfadEl = svgKnoten('path', 'canvas-linie-pfad');
  pfadEl.setAttribute('d', d);
  if (farbe) pfadEl.style.stroke = farbe;
  gruppe.appendChild(pfadEl);

  // 4T-001655 (Befund 2 vom 2026-09-10): `vor` trägt eine Spitze am Ziel,
  // `beide` zusätzlich eine am Anfang, `keine` gar keine. Für die zweite
  // Spitze genügt derselbe Pfad mit dem anderen Ende: `pfeilSpitzePfad` setzt
  // die Spitze auf die Kante und den Rumpf nach außen, zeigt also immer in
  // ihre Karte hinein — genau das, was die rückwärts gerichtete Spitze
  // ausdrückt. Eine eigene Rechnung wäre dieselbe Rechnung.
  const richtung = linienRichtung(el);
  for (const ende of richtung === 'beide' ? ['nach', 'von'] : richtung === 'vor' ? ['nach'] : []) {
    const spitze = svgKnoten('path', 'canvas-linie-spitze');
    spitze.setAttribute('d', pfeilSpitzePfad(ende === 'nach' ? nach : von, seiten[ende]));
    if (farbe) spitze.style.fill = farbe;
    gruppe.appendChild(spitze);
  }

  const zeilen = beschriftungsZeilen(el);
  if (zeilen.length > 0)
    zeichneBeschriftung(gruppe, zeilen, verbindungsMitte(von, nach, seiten), farbe);
  return gruppe;
}

/**
 * Zeichnet die ganze Verbindungs-Ebene neu.
 *
 * Sie wird als Ganzes ersetzt und nicht fortgeschrieben: Eine Verbindung hängt
 * an zwei Karten, und schon eine bewegte Karte ändert mehrere Pfade. Der
 * Vergleich, welche Gruppe bleiben dürfte, kostete mehr als das Neuzeichnen.
 *
 * @param {SVGElement} ebene Ziel-Gruppe im Viewport.
 * @param {object} ctx
 * @param {Array<object>} ctx.linien Linien-Elemente des Modells.
 * @param {Function} ctx.karteZu (id) => Karten-Element oder `null`.
 * @param {string} [ctx.gewaehlt] Kennung der gewählten Verbindung.
 */
export function zeichneLinienEbene(ebene, { linien, karteZu, gewaehlt }) {
  ebene.textContent = '';
  for (const el of linien || []) {
    const gruppe = zeichneVerbindung(el, karteZu, !!gewaehlt && el.id === gewaehlt);
    if (gruppe) ebene.appendChild(gruppe);
  }
}

/**
 * Pfad der Vorschau-Linie beim Anlegen: gerade vom Anschlusspunkt zum Zeiger.
 *
 * Bewusst gerade und nicht als Kurve: Die Vorschau sagt aus, **woher** die
 * Verbindung kommt und **wohin** der Zeiger zeigt; das zweite Ende steht ja
 * noch nicht fest, und eine Kurve ohne Ziel-Seite wäre eine Behauptung.
 */
export function vorschauPfad(start, zeiger) {
  return `M ${start.x} ${start.y} L ${zeiger.x} ${zeiger.y}`;
}

export { SVG_NS };
