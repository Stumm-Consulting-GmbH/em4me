// 4T-001850 (Epic 3E-000110): Die Geometrie eines Zuges mit der Maus — wo das
// Gezogene landet, wann ein Klick zu einem Zug wird und wann die Fläche unter
// dem Zeiger weiterrollen muss.
//
// **Warum dieses Modul getrennt von seinem ersten Verbraucher steht.** Der
// Bestand hat für das Ziehen keinen gemeinsamen Baustein: vier handgebaute
// Stellen auf den Browser-eigenen Zieh-Ereignissen und die maus-basierten
// räumlichen Ansichten, jede mit ihrer eigenen Rechnung. Die Tafel wäre die
// fünfte gewesen. Was sich ohne Kenntnis der Tafel sagen lässt — eine
// Einfüge-Position aus einem Zeiger-Punkt und einer Reihe von Rechtecken, die
// Schwelle zwischen Klick und Zug, der Rand-Roll-Takt —, steht deshalb hier:
// prozessneutral, ohne DOM, ohne Zustand und für sich prüfbar. Die Tafel ist
// der erste Verbraucher; die bestehenden Zieh-Stellen sind in diesem Vorgang
// bewusst **nicht** umgebaut worden.
//
// **Alle Maße sind Bildschirm-Pixel im Bezugssystem des Sichtfensters**, also
// genau das, was `MouseEvent.clientX/clientY` und `getBoundingClientRect()`
// liefern. Damit ist die Rechnung unabhängig davon, wie weit eine Fläche unter
// dem Zeiger gerollt ist — beide Seiten messen gegen dasselbe Fenster.
'use strict';

// Bewegung in Bildschirm-Pixeln, unterhalb derer ein Zug ein Klick bleibt.
// Wert und Begründung von `canvas-bedienung.js` übernommen, das ihn seinerseits
// aus `graph-view.js` hat: Ohne Schwelle löste jedes Zittern der Hand beim
// Auswählen einen Schreibvorgang aus.
const ZIEH_SCHWELLE = 3;

// Breite des Randstreifens, in dem eine Fläche unter dem Zeiger weiterrollt,
// und die größte Schrittweite je Takt. Der Streifen ist etwas breiter als eine
// Bildlaufleiste, damit er sich mit der Maus treffen lässt; die Schrittweite
// ist so gewählt, dass ein Takt von 60 Bildern je Sekunde eine Spalte in rund
// einer Sekunde durchfährt.
const RAND_BREITE = 36;
const ROLL_TEMPO = 14;

/**
 * Ist aus dem Drücken der Taste ein Zug geworden?
 *
 * @param {number} bewegung Aufsummierte Bewegung in Bildschirm-Pixeln.
 * @param {number} [schwelle] Grenze; ohne Angabe die des Bestands.
 * @returns {boolean} `false`, solange es ein Klick bleibt.
 */
function ueberSchwelle(bewegung, schwelle = ZIEH_SCHWELLE) {
  return Number.isFinite(bewegung) && bewegung > schwelle;
}

function mitte(rechteck, achse) {
  return achse === 'x' ? rechteck.left + rechteck.width / 2 : rechteck.top + rechteck.height / 2;
}

/**
 * Vor welchem Element der Reihe landet das Gezogene?
 *
 * Gezählt wird, an wie vielen Mitten der Zeiger bereits vorbei ist: Liegt er
 * über der Mitte des ersten Rechtecks, ist die Antwort `0` (ganz nach vorn);
 * liegt er unter der Mitte des letzten, ist sie die Länge der Reihe (ganz nach
 * hinten). Die Mitte und nicht der Rand, weil sonst ein Zug über ein großes
 * Element hinweg auf halber Strecke die Antwort wechselte, obwohl der Zeiger
 * noch im selben Element steht.
 *
 * Die Reihe enthält das gezogene Element selbst; der Aufrufer weiß, welches es
 * ist, und erkennt daran, ob das Ziel dem Ausgang entspricht.
 *
 * @param {{x: number, y: number}} punkt Zeiger-Punkt im Sichtfenster.
 * @param {Array<{left: number, top: number, width: number, height: number}>} rechtecke
 *   Rechtecke der Elemente in ihrer Reihenfolge.
 * @param {{achse?: 'x'|'y'}} [optionen] `y` für eine Spalte, `x` für eine Reihe.
 * @returns {number} Einfüge-Position von `0` bis zur Länge der Reihe.
 */
function einfuegePosition(punkt, rechtecke, optionen = {}) {
  if (!Array.isArray(rechtecke) || rechtecke.length === 0) return 0;
  const achse = optionen.achse === 'x' ? 'x' : 'y';
  const wert = achse === 'x' ? punkt.x : punkt.y;
  let position = 0;
  for (const rechteck of rechtecke) {
    if (wert <= mitte(rechteck, achse)) break;
    position++;
  }
  return position;
}

/**
 * Wo die Einfüge-Marke steht — als Rechteck im Sichtfenster.
 *
 * Vor dem Element an `position`, hinter dem letzten, wenn `position` die Länge
 * der Reihe ist. Für eine **leere** Reihe gibt es kein Element, an dem sich
 * zielen liesse; dann tritt `leerRechteck` an seine Stelle, und die Marke steht
 * an dessen Anfang. Ohne beides gibt es nichts zu zeigen, und die Antwort ist
 * `null` statt eines erfundenen Rechtecks.
 *
 * @param {Array<{left: number, top: number, width: number, height: number}>} rechtecke
 * @param {number} position Einfüge-Position aus `einfuegePosition`.
 * @param {{achse?: 'x'|'y', dicke?: number, leerRechteck?: object|null}} [optionen]
 * @returns {{x: number, y: number, breite: number, hoehe: number}|null}
 */
function markenRechteck(rechtecke, position, optionen = {}) {
  const achse = optionen.achse === 'x' ? 'x' : 'y';
  const dicke = Number.isFinite(optionen.dicke) && optionen.dicke > 0 ? optionen.dicke : 3;
  const reihe = Array.isArray(rechtecke) ? rechtecke : [];
  if (reihe.length === 0) {
    const leer = optionen.leerRechteck;
    if (!leer) return null;
    return achse === 'x'
      ? { x: leer.left, y: leer.top, breite: dicke, hoehe: leer.height }
      : { x: leer.left, y: leer.top, breite: leer.width, hoehe: dicke };
  }
  const grenze = Math.max(0, Math.min(position, reihe.length));
  const vorn = grenze < reihe.length;
  const bezug = vorn ? reihe[grenze] : reihe[reihe.length - 1];
  if (achse === 'x') {
    const x = vorn ? bezug.left : bezug.left + bezug.width;
    return { x: x - dicke / 2, y: bezug.top, breite: dicke, hoehe: bezug.height };
  }
  const y = vorn ? bezug.top : bezug.top + bezug.height;
  return { x: bezug.left, y: y - dicke / 2, breite: bezug.width, hoehe: dicke };
}

// Anteil, mit dem ein Punkt in einen Randstreifen hineinragt: `0` ausserhalb,
// `1` am Rand und darüber hinaus. Damit rollt die Fläche nah am Rand schneller
// als weiter innen, statt mit einem Sprung anzufangen.
function randAnteil(abstand, rand) {
  if (!(rand > 0)) return 0;
  if (abstand >= rand) return 0;
  if (abstand <= 0) return 1;
  return (rand - abstand) / rand;
}

/**
 * Wie weit die Fläche unter dem Zeiger in diesem Takt weiterrollen soll.
 *
 * Ohne diesen Schritt endete jeder Zug am Rand des sichtbaren Ausschnitts: Wer
 * eine Karte in eine Spalte ziehen will, die gerade nicht zu sehen ist, käme
 * nicht hin. Gerechnet wird gegen das Rechteck der rollenden Fläche, nicht
 * gegen das Fenster — verschachtelte Roll-Flächen bekommen so jede ihren
 * eigenen Takt.
 *
 * @param {{x: number, y: number}} punkt Zeiger-Punkt im Sichtfenster.
 * @param {{left: number, top: number, width: number, height: number}} rechteck
 *   Rechteck der rollenden Fläche.
 * @param {{rand?: number, tempo?: number, achse?: 'x'|'y'|'beide'}} [optionen]
 * @returns {{dx: number, dy: number}} Schrittweite; `0`, wo nicht gerollt wird.
 */
function randRollSchritt(punkt, rechteck, optionen = {}) {
  const schritt = { dx: 0, dy: 0 };
  if (!punkt || !rechteck) return schritt;
  const rand = Number.isFinite(optionen.rand) ? optionen.rand : RAND_BREITE;
  const tempo = Number.isFinite(optionen.tempo) ? optionen.tempo : ROLL_TEMPO;
  const achse = optionen.achse === 'x' || optionen.achse === 'y' ? optionen.achse : 'beide';
  const rechts = rechteck.left + rechteck.width;
  const unten = rechteck.top + rechteck.height;
  if (achse !== 'y') {
    const nachLinks = randAnteil(punkt.x - rechteck.left, rand);
    const nachRechts = randAnteil(rechts - punkt.x, rand);
    if (nachLinks > 0) schritt.dx = -Math.round(tempo * nachLinks);
    else if (nachRechts > 0) schritt.dx = Math.round(tempo * nachRechts);
  }
  if (achse !== 'x') {
    const nachOben = randAnteil(punkt.y - rechteck.top, rand);
    const nachUnten = randAnteil(unten - punkt.y, rand);
    if (nachOben > 0) schritt.dy = -Math.round(tempo * nachOben);
    else if (nachUnten > 0) schritt.dy = Math.round(tempo * nachUnten);
  }
  return schritt;
}

/**
 * Liegt der Punkt in dem Rechteck?
 *
 * Die eine Regel für alle Fragesteller: Was unter dem Zeiger liegt, darf nicht
 * an zwei Stellen verschieden beantwortet werden. Der Rand zählt dazu, sonst
 * fiele der Zeiger zwischen zwei angrenzende Flächen.
 *
 * **Eine Achsen-Angabe schränkt die Frage ein**, und das ist kein Beiwerk: Eine
 * Spalte füllt ihren Streifen der Höhe nach, und ein Zeiger unterhalb der
 * letzten Karte meint erkennbar weiterhin diese Spalte. Nur die Waagerechte zu
 * fragen ist dort die richtige Antwort und nicht die bequemere.
 *
 * @param {{x: number, y: number}} punkt
 * @param {{left: number, top: number, width: number, height: number}} rechteck
 * @param {{achse?: 'x'|'y'}} [optionen] Ohne Angabe zählen beide Achsen.
 * @returns {boolean}
 */
function imRechteck(punkt, rechteck, optionen = {}) {
  if (!punkt || !rechteck) return false;
  const achse = optionen.achse === 'x' || optionen.achse === 'y' ? optionen.achse : null;
  const waagerecht = punkt.x >= rechteck.left && punkt.x <= rechteck.left + rechteck.width;
  const senkrecht = punkt.y >= rechteck.top && punkt.y <= rechteck.top + rechteck.height;
  if (achse === 'x') return waagerecht;
  if (achse === 'y') return senkrecht;
  return waagerecht && senkrecht;
}

module.exports = {
  ZIEH_SCHWELLE,
  RAND_BREITE,
  ROLL_TEMPO,
  ueberSchwelle,
  einfuegePosition,
  markenRechteck,
  randRollSchritt,
  imRechteck,
};
