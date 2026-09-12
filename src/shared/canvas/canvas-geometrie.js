// 4T-001653 (Epic 3E-000287): Reine Geometrie der Canvas — Anschlusspunkte,
// Verbindungs-Pfade, Pfeilspitzen, Hülle, Einpassung und Zoom um einen Punkt.
//
// Prozessneutral (CJS, reine Funktionen, kein DOM, kein Electron; Muster
// src/shared/mindmap-core.js). Die Zeichen-Schicht liegt daneben im Renderer
// und setzt nur zusammen, was hier gerechnet wird — dieselbe Trennung wie
// mindmap-core.js gegen mindmap-formen.js, und aus demselben Grund: Was ohne
// Browser prüfbar ist, wird ohne Browser geprüft.
//
// **Koordinaten.** `x`/`y` einer Karte bezeichnen ihre **linke obere Ecke**,
// `b`/`h` ihre Größe, alles in geräteunabhängigen Einheiten mit dem Ursprung
// in der Mitte der Fläche (Kapitel 6 des Konzepts). Das Vorbild-Format JSON
// Canvas legt seine Knoten ebenso an.
'use strict';

// Kleinste dargestellte Karte. Eine Karte mit fehlender oder defekter
// Größen-Angabe liest der Kern als 0 (Befund, kein Abbruch); ohne Untergrenze
// wäre sie unsichtbar und damit auch nicht mehr anfassbar. Die Fehler-Semantik
// des Kerns verlangt, dass ein defektes Element die Anzeige stören darf —
// nicht, dass es verschwindet.
const MIN_BREITE = 40;
const MIN_HOEHE = 24;

// Zoom-Grenzen, Werte von `mindmap-view.js` übernommen: dort am Bestand
// erprobt, und zwei räumliche Ansichten sollen sich gleich anfühlen.
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 5;

// Anteil des Sichtfensters, den das Einpassen ausnutzt. Der Rest ist Rand.
const EINPASS_ANTEIL = 0.9;

// Länge der Bézier-Anfasser einer Verbindung, geklemmt: Bei nahen Karten
// bliebe ein fester Wert als Schleife stehen, bei fernen als Knick.
const ANFASSER_MIN = 20;
const ANFASSER_MAX = 120;

// Größe der Pfeilspitze einer gerichteten Verbindung.
const SPITZE_LAENGE = 11;
const SPITZE_BREITE = 7;

const SEITEN = ['links', 'rechts', 'oben', 'unten'];

/** Größen-Rechteck einer Karte mit angewandten Mindestmaßen. */
function kartenRechteck(karte) {
  const x = Number.isFinite(karte && karte.x) ? karte.x : 0;
  const y = Number.isFinite(karte && karte.y) ? karte.y : 0;
  const b = Math.max(MIN_BREITE, Number.isFinite(karte && karte.b) ? karte.b : 0);
  const h = Math.max(MIN_HOEHE, Number.isFinite(karte && karte.h) ? karte.h : 0);
  return { x, y, b, h };
}

/** Anschlusspunkt einer Seite, in der Mitte der jeweiligen Kante. */
function seitenPunkt(karte, seite) {
  const r = kartenRechteck(karte);
  switch (seite) {
    case 'links':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'rechts':
      return { x: r.x + r.b, y: r.y + r.h / 2 };
    case 'oben':
      return { x: r.x + r.b / 2, y: r.y };
    case 'unten':
      return { x: r.x + r.b / 2, y: r.y + r.h };
    default:
      return { x: r.x + r.b / 2, y: r.y + r.h / 2 };
  }
}

// 4T-001655 (Befund 3 des Product Owners vom 2026-09-10): Tiefe der vier
// Ziel-Zonen an den Rändern einer Karte, in Flächen-Einheiten. Gedeckelt auf
// ein Drittel der jeweiligen Kantenlänge, damit auch eine kleine Karte einen
// Rest Körper behält — ohne den Deckel wäre eine Karte von 40 × 24 Einheiten
// ganz Zone, und `nach=auto` ließe sich dort gar nicht mehr treffen.
const ZONEN_TIEFE = 24;

/**
 * Ziel-Seite eines Punktes auf einer Karte (Befund 3).
 *
 * **Gerechnet und nicht am DOM abgefragt**, aus demselben Grund wie die Wahl
 * der Ziel-Karte beim Anlegen: `elementFromPoint` gäbe es nur im Browser, die
 * Lage der Karte steht dagegen im Modell. Damit ist die Zuordnung ohne DOM
 * prüfbar, und Zeichnung und Treffer lesen dieselbe Regel.
 *
 * @param {object} karte Karten-Element.
 * @param {{x: number, y: number}} punkt Punkt in Flächen-Koordinaten.
 * @returns {string} `links`, `rechts`, `oben`, `unten` — oder `auto` für den
 *   Körper der Karte und für jeden Punkt außerhalb.
 */
function zielSeiteIm(karte, punkt) {
  const r = kartenRechteck(karte);
  const x = punkt && Number.isFinite(punkt.x) ? punkt.x : NaN;
  const y = punkt && Number.isFinite(punkt.y) ? punkt.y : NaN;
  if (!(x >= r.x && x <= r.x + r.b && y >= r.y && y <= r.y + r.h)) return 'auto';
  const tiefeX = Math.min(ZONEN_TIEFE, r.b / 3);
  const tiefeY = Math.min(ZONEN_TIEFE, r.h / 3);
  // Abstand zu jeder Kante; die nächstliegende gewinnt, damit eine Ecke nicht
  // zwei Zonen zugleich trifft. Die Reihenfolge der Aufzählung entscheidet bei
  // exaktem Gleichstand und macht den Fall damit vorhersagbar statt zufällig.
  const kandidaten = [
    ['links', x - r.x, tiefeX],
    ['rechts', r.x + r.b - x, tiefeX],
    ['oben', y - r.y, tiefeY],
    ['unten', r.y + r.h - y, tiefeY],
  ].filter(([, abstand, tiefe]) => abstand <= tiefe);
  if (kandidaten.length === 0) return 'auto';
  let beste = kandidaten[0];
  for (const kandidat of kandidaten) {
    if (kandidat[1] < beste[1]) beste = kandidat;
  }
  return beste[0];
}

/** Nach außen zeigende Normale einer Seite. */
function seitenNormale(seite) {
  switch (seite) {
    case 'links':
      return { x: -1, y: 0 };
    case 'rechts':
      return { x: 1, y: 0 };
    case 'oben':
      return { x: 0, y: -1 };
    case 'unten':
      return { x: 0, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Löst `auto` (und jede unbekannte Angabe) in eine der vier Seiten auf.
 *
 * Die Wahl folgt der Lage der beiden Mittelpunkte zueinander: Liegt die andere
 * Karte weiter waagerecht als senkrecht entfernt, gehen die Enden seitlich aus
 * den Karten heraus, sonst oben oder unten. Eine benannte Seite bleibt immer
 * stehen — auch wenn die Lage etwas anderes nahelegte, denn sie ist die
 * Aussage des Anwenders.
 *
 * @param {object} von Karte am Anfang.
 * @param {object} nach Karte am Ende.
 * @param {string} [vonSeite] Angabe `von=` der Verbindung.
 * @param {string} [nachSeite] Angabe `nach=` der Verbindung.
 * @returns {{von: string, nach: string}} die aufgelösten Seiten.
 */
function waehleSeiten(von, nach, vonSeite, nachSeite) {
  const a = kartenRechteck(von);
  const b = kartenRechteck(nach);
  const dx = b.x + b.b / 2 - (a.x + a.b / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  let auflVon;
  let auflNach;
  if (Math.abs(dx) >= Math.abs(dy)) {
    auflVon = dx >= 0 ? 'rechts' : 'links';
    auflNach = dx >= 0 ? 'links' : 'rechts';
  } else {
    auflVon = dy >= 0 ? 'unten' : 'oben';
    auflNach = dy >= 0 ? 'oben' : 'unten';
  }
  return {
    von: SEITEN.includes(vonSeite) ? vonSeite : auflVon,
    nach: SEITEN.includes(nachSeite) ? nachSeite : auflNach,
  };
}

// Zahlen im Pfad auf eine Nachkommastelle. Ohne das trägt jeder Pfad die
// vollen Gleitkomma-Stellen, und ein Vergleich zweier Zeichnungen wird zur
// Zufallsfrage der letzten Bits.
function rund(wert) {
  return Math.round(wert * 10) / 10;
}

/**
 * Pfad einer Verbindung als kubische Bézier-Kurve, die an beiden Enden
 * senkrecht aus ihrer Seite herausläuft.
 *
 * @param {object} von Karte am Anfang.
 * @param {object} nach Karte am Ende.
 * @param {{von: string, nach: string}} seiten aufgelöste Seiten.
 * @returns {string} der `d`-Wert eines SVG-Pfades.
 */
function verbindungsStuetzen(von, nach, seiten) {
  const p1 = seitenPunkt(von, seiten.von);
  const p2 = seitenPunkt(nach, seiten.nach);
  const abstand = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const griff = Math.max(ANFASSER_MIN, Math.min(ANFASSER_MAX, abstand / 2));
  const n1 = seitenNormale(seiten.von);
  const n2 = seitenNormale(seiten.nach);
  return {
    p1,
    c1: { x: p1.x + n1.x * griff, y: p1.y + n1.y * griff },
    c2: { x: p2.x + n2.x * griff, y: p2.y + n2.y * griff },
    p2,
  };
}

function verbindungsPfad(von, nach, seiten) {
  const { p1, c1, c2, p2 } = verbindungsStuetzen(von, nach, seiten);
  return (
    `M ${rund(p1.x)} ${rund(p1.y)} ` +
    `C ${rund(c1.x)} ${rund(c1.y)}, ${rund(c2.x)} ${rund(c2.y)}, ${rund(p2.x)} ${rund(p2.y)}`
  );
}

/**
 * Mittelpunkt einer Verbindung, also der Kurven-Punkt bei `t = 0,5`.
 *
 * **Gerechnet und nicht gemessen** (4T-001655): Die Beschriftung und die
 * Leiste der gewählten Verbindung sitzen an dieser Stelle. Der bequeme Weg
 * über `getPointAtLength` des gezeichneten Pfades gäbe es nur im Browser —
 * ohne DOM wäre weder die Lage der Beschriftung noch die der Leiste prüfbar,
 * und genau das trennt diese Datei von der Zeichen-Schicht.
 *
 * @param {object} von Karte am Anfang.
 * @param {object} nach Karte am Ende.
 * @param {{von: string, nach: string}} seiten aufgelöste Seiten.
 * @returns {{x: number, y: number}} der Mittelpunkt, auf eine Nachkommastelle.
 */
function verbindungsMitte(von, nach, seiten) {
  const { p1, c1, c2, p2 } = verbindungsStuetzen(von, nach, seiten);
  // Kubische Bézier bei t = 0,5: (P1 + 3·C1 + 3·C2 + P2) / 8.
  return {
    x: rund((p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8),
    y: rund((p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8),
  };
}

/**
 * Pfeilspitze am Ende einer gerichteten Verbindung, als geschlossenes Dreieck.
 *
 * **Bewusst ein eigener Pfad und kein SVG-Marker.** Ein Marker erbt die Farbe
 * seiner Linie nicht von selbst; die Auswege (`context-stroke`, ein Marker je
 * Farbe) kosten mehr, als das Dreieck wert ist. So trägt die Spitze dieselbe
 * Farbe wie ihre Linie, weil beide dieselbe CSS-Regel treffen.
 *
 * @param {object} nach Karte am Ende.
 * @param {string} seite aufgelöste Seite am Ende.
 * @returns {string} der `d`-Wert eines SVG-Pfades.
 */
function pfeilSpitzePfad(nach, seite) {
  const spitze = seitenPunkt(nach, seite);
  // Die Linie läuft entgegen der Seiten-Normalen in die Karte hinein; genau
  // dorthin zeigt die Spitze.
  const n = seitenNormale(seite);
  const basis = { x: spitze.x + n.x * SPITZE_LAENGE, y: spitze.y + n.y * SPITZE_LAENGE };
  // Senkrechte zur Richtung, für die beiden hinteren Ecken.
  const q = { x: -n.y, y: n.x };
  const e1 = { x: basis.x + q.x * (SPITZE_BREITE / 2), y: basis.y + q.y * (SPITZE_BREITE / 2) };
  const e2 = { x: basis.x - q.x * (SPITZE_BREITE / 2), y: basis.y - q.y * (SPITZE_BREITE / 2) };
  return (
    `M ${rund(spitze.x)} ${rund(spitze.y)} ` +
    `L ${rund(e1.x)} ${rund(e1.y)} L ${rund(e2.x)} ${rund(e2.y)} Z`
  );
}

/**
 * Umschließendes Rechteck aller übergebenen Karten.
 *
 * @param {Array<object>} karten
 * @returns {{links: number, oben: number, rechts: number, unten: number}|null}
 *   `null`, wenn keine Karte vorliegt — dann gibt es nichts einzupassen.
 */
function huelle(karten) {
  const liste = Array.isArray(karten) ? karten : [];
  if (liste.length === 0) return null;
  let links = Infinity;
  let oben = Infinity;
  let rechts = -Infinity;
  let unten = -Infinity;
  for (const karte of liste) {
    const r = kartenRechteck(karte);
    links = Math.min(links, r.x);
    oben = Math.min(oben, r.y);
    rechts = Math.max(rechts, r.x + r.b);
    unten = Math.max(unten, r.y + r.h);
  }
  return { links, oben, rechts, unten };
}

function klemmeZoom(wert) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, wert));
}

/**
 * Verschiebung und Vergrößerung, die eine Hülle mittig in ein Sichtfenster
 * legen. Muster `fit()` der Mindmap-Ansicht: über beide Achsen und mit Rand.
 *
 * @param {object|null} rahmen Ergebnis von `huelle`.
 * @param {number} breite Breite des Sichtfensters.
 * @param {number} hoehe Höhe des Sichtfensters.
 * @returns {{scale: number, tx: number, ty: number}|null}
 */
function einpassung(rahmen, breite, hoehe) {
  if (!rahmen) return null;
  const sichtBreite = breite > 0 ? breite : 800;
  const sichtHoehe = hoehe > 0 ? hoehe : 600;
  const spanneX = Math.max(1, rahmen.rechts - rahmen.links);
  const spanneY = Math.max(1, rahmen.unten - rahmen.oben);
  const scale = klemmeZoom(Math.min(sichtBreite / spanneX, sichtHoehe / spanneY) * EINPASS_ANTEIL);
  return {
    scale,
    tx: (sichtBreite - spanneX * scale) / 2 - rahmen.links * scale,
    ty: (sichtHoehe - spanneY * scale) / 2 - rahmen.oben * scale,
  };
}

/**
 * Fixpunkt-Zoom: Der Punkt unter dem Zeiger bleibt unter dem Zeiger.
 *
 * @param {{scale: number, tx: number, ty: number}} zustand bisherige Lage.
 * @param {number} px Zeiger im Sichtfenster, waagerecht.
 * @param {number} py Zeiger im Sichtfenster, senkrecht.
 * @param {number} faktor Vergrößerungs-Faktor (>1 heran, <1 weg).
 * @returns {{scale: number, tx: number, ty: number}} die neue Lage; bei
 *   erreichter Grenze unverändert, damit die Fläche nicht wandert.
 */
function zoomUmPunkt(zustand, px, py, faktor) {
  const alt = zustand && Number.isFinite(zustand.scale) ? zustand.scale : 1;
  const tx = zustand && Number.isFinite(zustand.tx) ? zustand.tx : 0;
  const ty = zustand && Number.isFinite(zustand.ty) ? zustand.ty : 0;
  const neu = klemmeZoom(alt * (Number.isFinite(faktor) && faktor > 0 ? faktor : 1));
  if (neu === alt) return { scale: alt, tx, ty };
  return {
    scale: neu,
    tx: px - ((px - tx) / alt) * neu,
    ty: py - ((py - ty) / alt) * neu,
  };
}

module.exports = {
  MIN_BREITE,
  MIN_HOEHE,
  ZOOM_MIN,
  ZOOM_MAX,
  SEITEN,
  ZONEN_TIEFE,
  kartenRechteck,
  zielSeiteIm,
  seitenPunkt,
  seitenNormale,
  waehleSeiten,
  verbindungsPfad,
  verbindungsMitte,
  pfeilSpitzePfad,
  huelle,
  einpassung,
  zoomUmPunkt,
};
