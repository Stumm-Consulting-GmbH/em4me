// 4T-001049 (Epic 3E-000151): Formen der Mindmap-Zeichnung — Kanten-Pfade,
// Anfasser-Lage und das Notiz-Symbol.
//
// Eigene Datei seit 4T-001049: Mit den fünf Wurzel-Lagen trägt jede gezeichnete
// Form eine Fallunterscheidung nach der Wuchsrichtung, und die Ansicht
// überschritt darüber das Zeilen-Budget. Der Schnitt trennt **was gezeichnet
// wird** von **wie die Ansicht darauf reagiert**: Hier steht ausschließlich
// Geometrie, ohne Sitzungs-Zustand, ohne Ereignis-Behandlung und ohne i18n.
// Beschriftungen kommen als Zeichenkette herein, Ereignisse hängt der
// Aufrufer an das gelieferte Element.
//
// Farbfrei wie die Ansicht: Alle Farben stehen in styles/mindmap.css.
'use strict';

export const SVG_NS = 'http://www.w3.org/2000/svg';

// Radius des Anfassers am Ast-Ende, an dem geklappt wird.
export const ANFASSER_RADIUS = 5;

// 4T-001054: Maße des Notiz-Symbols. Die Trefferfläche ist bewusst größer als
// das gezeichnete Blatt (Befund der ersten Test-Iteration: der frühere Punkt
// mit 6 Pixeln Durchmesser war kaum zu treffen).
const NOTIZ_BREITE = 11;
const NOTIZ_HOEHE = 13;
const NOTIZ_TREFFER = 18;
const NOTIZ_ABSTAND = 12;

/**
 * Wuchsrichtung eines Knotens in der Form, in der die Zeichnung sie braucht.
 * Ohne Angabe gilt der Wuchs nach rechts, also die Ausgangs-Lage.
 */
export function wuchs(knoten) {
  const richtung = (knoten && knoten.richtung) || 'rechts';
  return {
    richtung,
    nachLinks: richtung === 'links',
    senkrecht: richtung === 'oben' || richtung === 'unten',
  };
}

// 4T-001049: Ansatz und Ende einer Kante hängen an der Wuchsrichtung des
// **Kindes**, nicht an der des Elternteils. Bei mittiger Lage trägt die Wurzel
// Kinder auf beiden Seiten; nur so verlässt die Kante sie auf der jeweils
// richtigen.
export function kantenPunkte(von, nach) {
  const { richtung } = wuchs(nach);
  if (richtung === 'links') {
    return { x1: von.x, y1: von.y, x2: nach.x + nach.breite, y2: nach.y, quer: false };
  }
  if (richtung === 'unten') {
    return {
      x1: von.x + von.breite / 2,
      y1: von.y + von.hoehe / 2,
      x2: nach.x + nach.breite / 2,
      y2: nach.y - nach.hoehe / 2,
      quer: true,
    };
  }
  if (richtung === 'oben') {
    return {
      x1: von.x + von.breite / 2,
      y1: von.y - von.hoehe / 2,
      x2: nach.x + nach.breite / 2,
      y2: nach.y + nach.hoehe / 2,
      quer: true,
    };
  }
  return { x1: von.x + von.breite, y1: von.y, x2: nach.x, y2: nach.y, quer: false };
}

/** Pfad-Angabe einer Kante; `linienfuehrung` ist «gerade» oder «geschwungen». */
export function kantenPfad(von, nach, linienfuehrung) {
  const { x1, y1, x2, y2, quer } = kantenPunkte(von, nach);
  if (linienfuehrung === 'gerade') {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Dieselbe Kurve, um 90 Grad gedreht: Die Anfasspunkte liegen bei
  // senkrechtem Wuchs auf der halben Höhe statt auf der halben Breite. Die
  // Linie wird gespiegelt oder gedreht, nicht anders geformt (AK5).
  if (quer) {
    const mitte = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${mitte}, ${x2} ${mitte}, ${x2} ${y2}`;
  }
  const mitte = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mitte} ${y1}, ${mitte} ${y2}, ${x2} ${y2}`;
}

/** Lage des Klapp-Anfassers: dort, wo die Kanten den Knoten verlassen. */
export function anfasserLage(knoten) {
  const { richtung, nachLinks, senkrecht } = wuchs(knoten);
  if (senkrecht) {
    return {
      cx: knoten.breite / 2,
      cy: (richtung === 'oben' ? -1 : 1) * (knoten.hoehe / 2),
    };
  }
  return { cx: nachLinks ? 0 : knoten.breite, cy: knoten.hoehe / 2 - 2 };
}

/**
 * 4T-001054 (Epic 3E-000151): Notiz-Symbol statt Punkt. Der vorherige Kreis mit
 * 3 Pixeln Radius war kaum zu treffen (Befund der ersten Test-Iteration);
 * gezeichnet wird ein Zettel mit Schreiblinien, und darüber liegt eine
 * unsichtbare, größere Trefferfläche, damit auch ein Klick am Rand sitzt.
 *
 * @param {object} knoten angeordneter Knoten.
 * @param {string} beschriftung Text des Tooltips (kommt aus i18n des Aufrufers).
 * @returns {SVGGElement} Gruppe ohne Ereignis-Behandlung.
 */
export function notizSymbol(knoten, beschriftung) {
  const gruppe = document.createElementNS(SVG_NS, 'g');
  gruppe.setAttribute('class', 'mindmap-notiz-marker');
  // 4T-001054 (zweite Test-Iteration): Das Symbol steht **hinter** dem Text,
  // nicht davor. Vor dem Text lag es auf der Unterstreichung und verdeckte
  // sie; hinter dem Ast-Ende ist Platz, den sonst nichts belegt.
  //
  // Bei einem Knoten mit Kindern geht dort allerdings die Kante ab. Für ihn
  // rückt das Symbol um seine halbe Höhe nach oben, damit es die Linie nicht
  // kreuzt; bei einem Blatt bleibt es auf Textmitte.
  //
  // 4T-001049: «Hinter dem Text» heißt bei Wuchs nach links spiegelbildlich vor
  // dem linken Rand. Bei senkrechtem Wuchs bleibt das Symbol rechts vom Text
  // und braucht keinen Versatz, weil die Kante dort oben oder unten abgeht
  // und die Fläche neben dem Text frei ist.
  const { nachLinks, senkrecht } = wuchs(knoten);
  const hatKinderFuerVersatz = (knoten.kinder || []).length > 0 && !senkrecht;
  const x = nachLinks ? -NOTIZ_ABSTAND : knoten.breite + NOTIZ_ABSTAND;
  const y = hatKinderFuerVersatz ? -(NOTIZ_HOEHE / 2 + 2) : 0;
  gruppe.setAttribute('transform', `translate(${x} ${y})`);

  const blatt = document.createElementNS(SVG_NS, 'rect');
  blatt.setAttribute('class', 'mindmap-notiz-blatt');
  blatt.setAttribute('x', String(-NOTIZ_BREITE / 2));
  blatt.setAttribute('y', String(-NOTIZ_HOEHE / 2));
  blatt.setAttribute('width', String(NOTIZ_BREITE));
  blatt.setAttribute('height', String(NOTIZ_HOEHE));
  blatt.setAttribute('rx', '1.5');
  gruppe.appendChild(blatt);

  // Drei Schreiblinien, damit der Zettel als beschriebener Zettel lesbar ist
  // und nicht als leeres Rechteck.
  for (let i = 0; i < 3; i++) {
    const linie = document.createElementNS(SVG_NS, 'line');
    linie.setAttribute('class', 'mindmap-notiz-strich');
    const zeileY = -NOTIZ_HOEHE / 2 + 3 + i * 3;
    linie.setAttribute('x1', String(-NOTIZ_BREITE / 2 + 2));
    linie.setAttribute('x2', String(NOTIZ_BREITE / 2 - 2));
    linie.setAttribute('y1', String(zeileY));
    linie.setAttribute('y2', String(zeileY));
    gruppe.appendChild(linie);
  }

  // Trefferfläche: durchsichtig, aber anklickbar. Sie ist der Grund, warum
  // das Symbol auch bei kleiner Darstellung sicher zu treffen ist.
  const treffer = document.createElementNS(SVG_NS, 'rect');
  treffer.setAttribute('class', 'mindmap-notiz-treffer');
  treffer.setAttribute('x', String(-NOTIZ_TREFFER / 2));
  treffer.setAttribute('y', String(-NOTIZ_TREFFER / 2));
  treffer.setAttribute('width', String(NOTIZ_TREFFER));
  treffer.setAttribute('height', String(NOTIZ_TREFFER));
  const markerTitel = document.createElementNS(SVG_NS, 'title');
  markerTitel.textContent = beschriftung;
  treffer.appendChild(markerTitel);
  gruppe.appendChild(treffer);

  return gruppe;
}
