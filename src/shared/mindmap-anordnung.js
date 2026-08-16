// 4T-1049 (Epic 3E-0151): Anordnung der Mindmap — aus dem Knoten-Baum des
// Kerns (mindmap-core.js) werden Positionen, in einer von fuenf Wurzel-Lagen.
//
// Eigene Datei seit 4T-1049: Baum-Abbildung und Anordnung sind zwei
// Fachlichkeiten, und mit den fuenf Lagen ueberschritt die gemeinsame Datei
// das Zeilen-Budget. Der Schnitt laeuft an der Naht, die der Kern ohnehin
// schon als Abschnitt fuehrte.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM) und ohne
// jeden Import: Preload, Renderer-Bundle und Unit-Tests laden das Modul
// gleichermassen.
//
// Anordnung (Plan-Freigabe vom 2026-08-14): Blatt-Stapel-Verfahren statt
// eines Kontur-Algorithmus (Reingold-Tilford / d3-flextree, das Verfahren
// hinter markmap). Blätter werden in Dokument-Reihenfolge gestapelt, ein
// innerer Knoten sitzt auf der Mitte seiner Kinder. Das ist überlappungsfrei
// per Konstruktion, deterministisch ohne Zusatzaufwand und in einem Durchlauf
// gerechnet; die Kompaktheit, die ein Kontur-Verfahren zusätzlich kauft, ist
// bei breiten Text-Knoten gering und kostet eine eigene Fehlerklasse.
//
// Wurzel-Lage (4T-1049, Story S-0806): Alle fünf Lagen sind **dieselbe**
// Rechnung. Sie läuft in achsenfreien Koordinaten (Tiefe und Stapel), und erst
// die Abbildung entscheidet, welche Bildschirm-Achse welche Rolle übernimmt
// und ob sie gespiegelt wird. Die mittige Lage rechnet dieselbe Anordnung
// zweimal, je Seite einmal. Ein zweiter Anordnungs-Algorithmus entsteht damit
// nicht; die Reißleine des Tasks blieb ungezogen.
'use strict';

// Voreinstellungen der Anordnung. Bewusst hier und nicht in der Ansicht:
// Sie gehören zum Modell, damit ein Test dieselben Werte sieht wie die
// Darstellung. Die Ansicht übersteuert sie über opts.
const LAYOUT_VORGABEN = {
  // Lücke zwischen zwei Ebenen, **nicht** deren Rasterabstand: Die Spalte
  // einer Ebene ist so breit wie ihr breitester Knoten. Ein festes Raster
  // ließe einen Knoten, der breiter als das Raster ist, in die Spalte seiner
  // Kinder ragen (in 4T-1045 an der Gegenprobe der Überlappungs-Prüfung
  // aufgefallen: hoechstBreite lag über dem damaligen Rasterabstand).
  spaltenAbstand: 60,
  zeilenAbstand: 8, // senkrechter Abstand zweier Geschwister-Blätter
  // 4T-1049: Dieselben zwei Lücken für den senkrechten Wuchs. Sie sind
  // eigene Werte und nicht dieselben Zahlen mit vertauschter Achse, weil die
  // Knoten quer zur Wuchsrichtung ihre **Breite** belegen: 8 Pixel zwischen
  // zwei nebeneinander stehenden Beschriftungen lesen sich als ein Wort, und
  // eine Ebenen-Lücke von 60 Pixeln zwischen 28 Pixel hohen Zeilen zerreißt
  // den Baum in der Senkrechten.
  reihenAbstand: 44, // Lücke zwischen zwei Ebenen bei senkrechtem Wuchs
  geschwisterAbstand: 24, // waagerechter Abstand zweier Geschwister-Blätter
  knotenHoehe: 28, // Höhe eines Knotens ohne eigene Messung
  zeichenBreite: 7.2, // Schätzbreite eines Zeichens ohne eigene Messung
  mindestBreite: 40,
  hoechstBreite: 320, // ab hier bricht der Text um (Option maxWidth)
};

// --- Anordnung --------------------------------------------------------------

// Schätzung der Knoten-Größe ohne DOM. Die Ansicht reicht über opts.messen
// eine echte Messung nach; ohne sie bleibt die Schätzung, und die Anordnung
// ist trotzdem überlappungsfrei, weil sie ausschließlich mit den hier
// gelieferten Maßen rechnet.
function masseSchaetzen(knoten, v) {
  const zeichen = String(knoten.titel || '').length;
  const roh = Math.max(v.mindestBreite, zeichen * v.zeichenBreite + 24);
  const breite = Math.min(roh, v.hoechstBreite);
  // Umbruch: Bei gekappter Breite wächst die Höhe zeilenweise mit.
  const zeilen = roh > v.hoechstBreite ? Math.ceil(roh / v.hoechstBreite) : 1;
  return { breite, hoehe: v.knotenHoehe * zeilen };
}

// 4T-1049 (Epic 3E-0151): Wurzel-Lage. Der Wert benennt, wo die **Wurzel**
// sitzt, nicht wohin der Baum wächst; die Wuchsrichtung ist die Gegenrichtung
// (Lage «links» heißt: Wurzel links, Äste nach rechts). Ein unbekannter Wert
// fällt auf «links» zurück, weil die Ansicht lieber ein anderes als gar kein
// Bild zeigt (Story S-0806, AK7).
function istSenkrecht(lage) {
  return lage === 'oben' || lage === 'unten';
}

// Blätter eines sichtbaren Teilbaums. Sie und nicht die Knoten insgesamt
// bestimmen den Platzbedarf quer zur Wuchsrichtung, weil innere Knoten auf
// der Mitte ihrer Kinder sitzen und keine eigene Bahn belegen.
function blattZahl(knoten) {
  const kinder = knoten.eingeklappt ? [] : knoten.kinder || [];
  if (kinder.length === 0) return 1;
  let summe = 0;
  for (const kind of kinder) summe += blattZahl(kind);
  return summe;
}

/**
 * 4T-1049 (Epic 3E-0151): Verteilungs-Regel der mittigen Lage.
 *
 * Die Kinder der Wurzel bleiben in Dokument-Reihenfolge und werden an genau
 * **einer** Stelle geteilt: Die vordere Gruppe geht auf die zuerst gelesene
 * (rechte) Seite, der Rest auf die linke. Die Schnittstelle ist die, bei der
 * sich die Blatt-Zahlen beider Seiten am wenigsten unterscheiden; bei
 * Gleichstand bekommt die vordere Seite den größeren Anteil, und die vordere
 * Gruppe ist nie leer (Story S-0806, AK8).
 *
 * Gewogen wird in Blättern und nicht in gemessenen Pixeln: So hängt das Bild
 * nicht an Schriftart und Messumgebung, und dasselbe Dokument ergibt stets
 * dieselbe Verteilung (AK2).
 *
 * @param {Array<object>} kinder sichtbare Kinder der Wurzel.
 * @returns {{vorne: Array<object>, hinten: Array<object>}}
 */
function teileWurzelKinder(kinder) {
  const gewicht = kinder.map(blattZahl);
  const gesamt = gewicht.reduce((a, b) => a + b, 0);
  let vorneSumme = 0;
  let besteZahl = kinder.length;
  let besterAbstand = Infinity;
  for (let k = 1; k <= kinder.length; k++) {
    vorneSumme += gewicht[k - 1];
    const abstand = Math.abs(vorneSumme - (gesamt - vorneSumme));
    // «kleiner gleich» statt «kleiner»: Bei Gleichstand gewinnt der spätere
    // Schnitt, die vordere Seite bekommt also den größeren Anteil.
    if (abstand <= besterAbstand) {
      besterAbstand = abstand;
      besteZahl = k;
    }
  }
  return { vorne: kinder.slice(0, besteZahl), hinten: kinder.slice(besteZahl) };
}

/**
 * Kanonische Anordnung in achsenfreien Koordinaten: `_d` ist die führende
 * Kante auf der **Tiefen**-Achse (Ebenen), `_s` die Mitte auf der
 * **Stapel**-Achse (Geschwister). Welche Bildschirm-Achse welche Rolle
 * übernimmt, entscheidet erst die Abbildung; die Rechnung ist für alle fünf
 * Lagen dieselbe.
 *
 * Blatt-Stapel-Verfahren wie in 4T-1045, um eine Zusicherung erweitert: Jeder
 * Teilbaum belegt ein eigenes Intervall der Stapel-Achse, das mindestens so
 * groß ist wie sein eigener Knoten, und jeder Knoten liegt vollständig in
 * seinem Intervall. Damit ist Überlappungsfreiheit auch dann garantiert, wenn
 * ein Knoten quer zur Wuchsrichtung breiter ist als die Spanne seiner Kinder;
 * bei waagerechtem Wuchs war das kaum sichtbar (die Knotenhöhen sind nahezu
 * gleich), bei senkrechtem Wuchs sind die Breiten sehr verschieden.
 */
function ordneKanonischAn(wurzel, v, messen, senkrecht, kinderVon) {
  const ebenenLuecke = senkrecht ? v.reihenAbstand : v.spaltenAbstand;
  const stapelLuecke = senkrecht ? v.geschwisterAbstand : v.zeilenAbstand;
  const dMass = (k) => (senkrecht ? k.hoehe : k.breite);
  const sMass = (k) => (senkrecht ? k.breite : k.hoehe);

  // Durchlauf 1: Maße nehmen und je Ebene die dickste Bahn ermitteln. Nur
  // sichtbare Knoten zählen, damit ein eingeklappter Ast die Bahn seiner
  // verborgenen Kinder nicht aufbläht.
  const dJeTiefe = [];
  const sammle = (knoten, tiefe) => {
    const mass = messen(knoten) || { breite: v.mindestBreite, hoehe: v.knotenHoehe };
    knoten.breite = mass.breite;
    knoten.hoehe = mass.hoehe;
    knoten.tiefe = tiefe;
    dJeTiefe[tiefe] = Math.max(dJeTiefe[tiefe] || 0, dMass(knoten));
    for (const kind of kinderVon(knoten)) sammle(kind, tiefe + 1);
  };
  sammle(wurzel, 0);

  // Lage je Ebene: kumulativ aus den Bahnbreiten, damit kein Knoten in die
  // Bahn der nächsten Ebene ragt.
  const dStart = [];
  let d = 0;
  for (let t = 0; t < dJeTiefe.length; t++) {
    dStart[t] = d;
    d += dJeTiefe[t] + ebenenLuecke;
  }

  // Durchlauf 2: Platzbedarf jedes Teilbaums auf der Stapel-Achse, von unten
  // nach oben. Der eigene Knoten geht als Mindestmaß ein.
  const messeSpanne = (knoten) => {
    const kinder = kinderVon(knoten);
    if (kinder.length === 0) {
      knoten._spanne = sMass(knoten);
      return knoten._spanne;
    }
    let summe = 0;
    for (const kind of kinder) summe += messeSpanne(kind) + stapelLuecke;
    knoten._spanne = Math.max(sMass(knoten), summe - stapelLuecke);
    return knoten._spanne;
  };
  messeSpanne(wurzel);

  // Durchlauf 3: Intervalle vergeben. Der Kinder-Block sitzt mittig im
  // Intervall des Elternteils, der Knoten selbst auf der Mitte seines ersten
  // und letzten Kindes — geklemmt auf sein Intervall, damit die Zusicherung
  // «Knoten liegt in seinem Intervall» auch bei sehr ungleichen Kindern hält.
  const platziere = (knoten, tiefe, von) => {
    knoten._d = dStart[tiefe];
    const kinder = kinderVon(knoten);
    if (kinder.length === 0) {
      knoten._s = von + knoten._spanne / 2;
      return;
    }
    let block = 0;
    for (const kind of kinder) block += kind._spanne + stapelLuecke;
    block -= stapelLuecke;
    let lauf = von + (knoten._spanne - block) / 2;
    for (const kind of kinder) {
      platziere(kind, tiefe + 1, lauf);
      lauf += kind._spanne + stapelLuecke;
    }
    const mitte = (kinder[0]._s + kinder[kinder.length - 1]._s) / 2;
    const halb = sMass(knoten) / 2;
    knoten._s = Math.min(Math.max(mitte, von + halb), von + knoten._spanne - halb);
  };
  platziere(wurzel, 0, 0);

  const letzte = dJeTiefe.length - 1;
  return {
    dGesamt: letzte >= 0 ? dStart[letzte] + dJeTiefe[letzte] : 0,
    sGesamt: wurzel._spanne || 0,
  };
}

// Abbildung der kanonischen Lage auf die Bildschirm-Achsen. `x` ist stets die
// linke Kante, `y` die senkrechte Mitte eines Knotens; `richtung` sagt, wohin
// der Knoten wächst, und trägt damit die gesamte Seiten-Abhängigkeit der
// Ansicht (Text-Ausrichtung, Anfasser, Kanten-Ansatz).
function bildeAb(wurzel, kinderVon, lage, dGesamt, versatzS) {
  const setze = (knoten) => {
    const d = knoten._d;
    const s = knoten._s - (versatzS || 0);
    if (lage === 'rechts') {
      knoten.x = dGesamt - d - knoten.breite;
      knoten.y = s;
      knoten.richtung = 'links';
    } else if (lage === 'oben') {
      knoten.x = s - knoten.breite / 2;
      knoten.y = d + knoten.hoehe / 2;
      knoten.richtung = 'unten';
    } else if (lage === 'unten') {
      knoten.x = s - knoten.breite / 2;
      knoten.y = dGesamt - d - knoten.hoehe / 2;
      knoten.richtung = 'oben';
    } else {
      knoten.x = d;
      knoten.y = s;
      knoten.richtung = 'rechts';
    }
    for (const kind of kinderVon(knoten)) setze(kind);
  };
  setze(wurzel);
}

function sichtbareKinderVon(knoten) {
  return knoten.eingeklappt ? [] : knoten.kinder || [];
}

// Einseitige Lagen: einmal rechnen, einmal abbilden.
function layoutEinseitig(root, v, messen, lage) {
  const senkrecht = istSenkrecht(lage);
  const { dGesamt, sGesamt } = ordneKanonischAn(root, v, messen, senkrecht, sichtbareKinderVon);
  bildeAb(root, sichtbareKinderVon, lage, dGesamt, 0);
  return {
    root,
    breite: senkrecht ? sGesamt : dGesamt,
    hoehe: senkrecht ? dGesamt : sGesamt,
  };
}

// Mittige Lage: derselbe Kern zweimal, einmal je Seite. Die zweite Rechnung
// überschreibt nur die Felder der Wurzel und die ihrer eigenen Teilbäume; die
// Kinder-Mengen beider Seiten sind disjunkt, deshalb überlebt die erste
// Abbildung. Beide Seiten sitzen mit ihrer Wurzel auf derselben Höhe, die
// linke ist an der Wurzel gespiegelt.
function layoutMitte(root, v, messen) {
  const kinder = sichtbareKinderVon(root);
  if (kinder.length === 0) return layoutEinseitig(root, v, messen, 'links');

  const { vorne, hinten } = teileWurzelKinder(kinder);
  const rechteSeite = (k) => (k === root ? vorne : sichtbareKinderVon(k));
  const linkeSeite = (k) => (k === root ? hinten : sichtbareKinderVon(k));

  ordneKanonischAn(root, v, messen, false, rechteSeite);
  bildeAb(root, rechteSeite, 'links', 0, root._s);
  const wurzelBreite = root.breite;

  if (hinten.length > 0) {
    ordneKanonischAn(root, v, messen, false, linkeSeite);
    bildeAb(root, linkeSeite, 'rechts', wurzelBreite, root._s);
  }
  // Die Wurzel selbst trägt Kinder auf beiden Seiten; ihre Richtung ist
  // deshalb keine der vier, sondern «mitte». Die Kanten richten sich ohnehin
  // nach der Richtung des **Kindes**.
  root.x = 0;
  root.y = 0;
  root.richtung = 'mitte';

  // Beide Seiten liegen um die Wurzel herum und damit teils im Negativen. Ein
  // Schlussversatz rückt das Bild in den ersten Quadranten, damit die
  // gelieferten Maße wie bei den einseitigen Lagen die Bildgröße sind.
  const alle = [];
  const sammle = (k) => {
    alle.push(k);
    for (const kind of k === root ? [...vorne, ...hinten] : sichtbareKinderVon(k)) sammle(kind);
  };
  sammle(root);
  const minX = Math.min(...alle.map((k) => k.x));
  const maxX = Math.max(...alle.map((k) => k.x + k.breite));
  const minY = Math.min(...alle.map((k) => k.y - k.hoehe / 2));
  const maxY = Math.max(...alle.map((k) => k.y + k.hoehe / 2));
  for (const k of alle) {
    k.x -= minX;
    k.y -= minY;
  }
  return { root, breite: maxX - minX, hoehe: maxY - minY };
}

/**
 * Rechnet Positionen für eine der fünf Wurzel-Lagen (Story S-0806).
 *
 * Blatt-Stapel-Verfahren: Blätter in Dokument-Reihenfolge gestapelt, innere
 * Knoten auf der Mitte ihrer Kinder. Überlappungsfrei per Konstruktion und
 * ohne Zufallsquelle, also bei gleichem Eingang exakt gleiches Ergebnis
 * (AK10). Die Lage ist eine **Abbildung** dieser einen Rechnung auf die
 * gewählte Achse und kein zweiter Algorithmus; die mittige Lage rechnet
 * dieselbe Anordnung zweimal, je Seite einmal.
 *
 * @param {object} root Wurzel aus buildMindmapTree.
 * @param {object} [opts] Übersteuert LAYOUT_VORGABEN; opts.layout wählt die
 *   Wurzel-Lage (links, mitte, rechts, oben, unten), opts.messen(knoten)
 *   liefert {breite, hoehe} aus einer echten Textmessung.
 * @returns {{root: object, breite: number, hoehe: number}}
 */
function layoutMindmap(root, opts = {}) {
  const v = { ...LAYOUT_VORGABEN, ...opts };
  const messen = typeof opts.messen === 'function' ? opts.messen : (k) => masseSchaetzen(k, v);
  if (!root) return { root: null, breite: 0, hoehe: 0 };
  if (opts.layout === 'mitte') return layoutMitte(root, v, messen);
  const lage = ['links', 'rechts', 'oben', 'unten'].includes(opts.layout) ? opts.layout : 'links';
  return layoutEinseitig(root, v, messen, lage);
}

module.exports = {
  layoutMindmap,
  teileWurzelKinder,
  LAYOUT_VORGABEN,
};
