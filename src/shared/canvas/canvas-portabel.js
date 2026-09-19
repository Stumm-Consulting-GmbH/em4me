// 4T-001777 (Epic 3E-000291): Die Entsprechung einer Canvas-Fläche im portablen
// Export (Story 4S-000951).
//
// **Entscheidung E7 des Konzepts «Canvas als räumliche Arbeitsfläche»**: Der
// Export ersetzt die Fence durch eine **strukturierte Markdown-Entsprechung**
// und nicht durch ein Bild. Wie diese Entsprechung im Einzelnen aussieht, hat
// der Product Owner am 2026-09-18 mit den Freigaben F1 bis F3 entschieden:
//
//   F1 Eine **Gruppe** wird zur Zwischen-Überschrift mit ihrem Namen, und die
//      Elemente, die geometrisch in ihr liegen (G6), stehen darunter. Eine
//      **Form mit Beschriftung** wird ein Aufzählungs-Punkt mit ihrer Art und
//      ihrer Beschriftung; eine Form **ohne** Beschriftung entfällt, weil sie
//      ohne die räumliche Darstellung nichts aussagt.
//   F2 Die **Verbindungen** stehen als **eine** Liste am Ende jeder Fläche,
//      jede genau einmal, in der Form «Von → Nach» mit ihrer Beschriftung,
//      sofern vorhanden. Eine Zeile unter jeder Karte entsteht nicht.
//   F3 Jede Fläche beginnt mit einer **fetten Kopf-Zeile** aus Titel und
//      Umfang; die Karten folgen mit ihrem **unveränderten** Text. Der Export
//      setzt **keine** erzeugte Überschrift über eine Karte und verschiebt
//      keine Überschriften-Ebene.
//
// Prozessneutral (CJS, reine Funktionen, kein DOM, kein Electron, kein
// Datei-Zugriff), Muster `canvas-filter.js`. Eigene Datei neben dem Kern aus
// demselben Grund wie dort: `canvas-core.js` steht auf seinem Größen-Budget,
// und die Ausgabe-Form ist eine eigene Fachlichkeit neben dem Lesen und
// Schreiben der Fence. Eine **Pfad-Auflösung findet hier nicht statt** — das
// ist gerade der Grund, aus dem die Ersetzung im prozessneutralen Konverter
// hängt und nicht in der asynchronen Renderer-Kette.
//
// **Kein Deckel** (Festlegung vom 2026-09-17): Alle Karten erscheinen
// vollständig. Die Vorschau des Blocks in der Lese-Ansicht deckelt bei sechs
// Karten, weil sie eine **Vorschau** ist; der portable Export ist das Gegenteil
// davon, und ein Deckel wäre dort Inhaltsverlust.
'use strict';

const {
  FORM_ART_VORGABE,
  canvasFlaechenTitel,
  canvasKartenVorschau,
  canvasUmfang,
  linienRichtung,
  parseCanvasFence,
} = require('./canvas-core.js');
const { gruppenMitglieder } = require('./canvas-geometrie.js');
// Die Umfang-Zeile ist dieselbe wie die des Blocks aus E8 und wird deshalb
// **dort** gebildet; eine zweite Kopie der Regel liefe bei der nächsten
// Element-Art auseinander (4T-001777).
const { canvasUmfangText } = require('../markdown/canvas-block.js');

/**
 * Label-Schlüssel dieser Ausgabe. `markdown.js` löst sie gegen die Sprachdatei
 * auf (Muster `CANVAS_BLOCK_LABEL_KEYS`); ohne Auflösung bleibt der Schlüssel
 * stehen, die Entsprechung entsteht also auch ohne Sprachdatei.
 *
 * **Die Liste nennt auch fremde Schlüssel**, und das ist Absicht: Die Art einer
 * Form, das Ersatzwort einer Gruppe und das einer Karte ohne Beschriftung sind
 * in der Anwendung bereits übersetzt. Ein zweiter Satz eigener `portabel`-
 * Schlüssel mit demselben Inhalt wäre eine zweite Pflege-Stelle für dasselbe
 * Wort. Die Schlüssel der **Umfang**-Zeile stehen bewusst nicht hier: Sie
 * gehören dem Block, stehen in dessen Liste, und beide Listen fließen in
 * dieselbe Beschriftungs-Karte.
 */
const CANVAS_PORTABEL_LABEL_KEYS = [
  'canvas.portabel.kopf',
  'canvas.portabel.leer',
  'canvas.portabel.verbindungen',
  'canvas.portabel.verbindung',
  'canvas.portabel.verbindungMitText',
  'canvas.portabel.form',
  'canvas.portabel.befund',
  'canvas.portabel.befundFlaeche',
  'canvas.portabel.befundDetail',
  'canvas.block.art',
  'canvas.liste.gruppe',
  'canvas.liste.ohneText',
  'canvas.formArtRechteck',
  'canvas.formArtAbgerundet',
  'canvas.formArtOval',
  'canvas.formArtDreieck',
  'canvas.formArtRaute',
  'canvas.formArtStern',
];

// Die Richtungs-Zeichen einer Verbindung, wörtlich wie im Karten-Listen-Panel
// (`panel-canvas-liste.js`) und aus demselben Grund nicht in fünf
// Sprachdateien: Sie haben keine Sprache.
const PFEILE = { vor: '→', beide: '↔', keine: '—' };

// Die sechs Arten aus G5 auf ihre bereits vorhandene Übersetzung.
const FORM_ART_SCHLUESSEL = {
  rechteck: 'canvas.formArtRechteck',
  abgerundet: 'canvas.formArtAbgerundet',
  oval: 'canvas.formArtOval',
  dreieck: 'canvas.formArtDreieck',
  raute: 'canvas.formArtRaute',
  stern: 'canvas.formArtStern',
};

function leser(labels) {
  const karte = labels && typeof labels === 'object' ? labels : {};
  return (key) => (typeof karte[key] === 'string' ? karte[key] : key);
}

// Eine Beschriftung, die eine Zeile sein muss: Zeilenumbrüche werden zu
// Leerzeichen (Muster `kartenBeschriftung` der Verweis-Anzeige).
function einzeilig(el) {
  return String((el && el.inhalt) || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Der Text einer Karte, wie er dasteht. Abgeschnitten werden allein die
// **leeren Zeilen am Ende** — den Abstand zum nächsten Element setzt der
// Trenner zwischen den Blöcken, und zwei Quellen desselben Abstands ergäben
// eine wachsende Lücke. Der Text selbst bleibt unangetastet (F3).
function kartenText(el) {
  return String((el && el.inhalt) || '').replace(/\s+$/, '');
}

/**
 * Der Kurzname einer Karte — derselbe, den die Karten-Liste zeigt.
 *
 * Der Rückfall geht auf die **Kennung** und nicht auf das Ersatzwort der Liste:
 * In der Verbindungs-Liste stünden sonst zwei unbeschriftete Karten unter
 * demselben Namen da, und die Aussage «Von → Nach» ginge genau dort verloren,
 * wo sie gebraucht wird. Das Panel hält es bei einer Verbindung ohne
 * Beschriftung ebenso und zeigt die Gegenstelle.
 */
function kartenName(el, L) {
  const titel = canvasKartenVorschau(el).titel;
  if (titel !== '') return titel;
  return (el && el.id) || L('canvas.liste.ohneText');
}

// Die Befunde nach dem Element, zu dem sie gehören. Zugeordnet wird über die
// Zeile: Ein Befund gehört dem letzten Element, dessen Marker-Zeile nicht hinter
// ihm liegt. Was keinem ausgegebenen Element zufällt — Befunde der Präambel,
// Befunde an Verbindungen und an einer Form ohne Beschriftung —, sammelt der
// Rest und erscheint als Hinweis der Fläche.
function befundeVerteilen(model) {
  const elemente = model.elemente || [];
  const jeElement = new Map();
  const rest = [];
  for (const befund of model.errors || []) {
    let treffer = null;
    for (const el of elemente) {
      if (el.zeile <= befund.zeile) treffer = el;
      else break;
    }
    if (!treffer) {
      rest.push(befund);
      continue;
    }
    if (!jeElement.has(treffer)) jeElement.set(treffer, []);
    jeElement.get(treffer).push(befund);
  }
  return { jeElement, rest };
}

function befundText(L, liste) {
  return liste
    .map((b) =>
      L('canvas.portabel.befundDetail')
        .replace('{code}', String(b.code || ''))
        .replace('{zeile}', String(b.zeile == null ? '' : b.zeile)),
    )
    .join(', ');
}

// Eine Karte: ihr Text, darunter ihr Verweis oder ihr Bild. **Der Text steht
// oben**, weil die Anwendung es ebenso hält — in einer Verweis- und in einer
// Bild-Karte ist die eigene Beschriftung die Kopfzeile und das Ziel der Körper
// darunter (`canvas-verweis-anzeige.js`).
//
// Die Schreibweise ist die des ganzen Dokuments und keine eigene: ein Verweis
// als Wikilink, ein Bild als Einbettung — genau so, wie derselbe Verweis und
// dasselbe Bild im übrigen Text desselben Exports erschienen (G7, G8).
function karteBloecke(el, L) {
  const bloecke = [];
  const text = kartenText(el);
  if (text.trim() !== '') bloecke.push(text);
  if (el.doc) bloecke.push(`[[${el.doc}]]`);
  else if (el.bild) bloecke.push(`![[${el.bild}]]`);
  // Eine Karte ohne Text und ohne Ziel hat nichts zu zeigen — entfallen darf
  // sie trotzdem nicht (kein Deckel, keine Karte geht verloren). Sie erscheint
  // mit demselben Ersatzwort, das auch die Karten-Liste zeigt.
  if (bloecke.length === 0) bloecke.push(L('canvas.liste.ohneText'));
  return bloecke;
}

// Eine Form: Aufzählungs-Punkt aus Art und Beschriftung (F1). Ohne
// Beschriftung entfällt sie.
function formBlock(el, L) {
  const text = einzeilig(el);
  if (text === '') return null;
  const art = L(FORM_ART_SCHLUESSEL[el.formArt] || FORM_ART_SCHLUESSEL[FORM_ART_VORGABE]);
  return '- ' + L('canvas.portabel.form').replace('{art}', art).replace('{text}', text);
}

// Eine Gruppe: fette Zeile mit ihrem Namen (F1). Ohne Beschriftung steht das
// Wort der Art da — eine leere fette Zeile wäre ein Kasten ohne Aufschrift.
function gruppenBlock(el, L) {
  return '**' + (einzeilig(el) || L('canvas.liste.gruppe')) + '**';
}

/**
 * Die Elemente einer Fläche in ihrer Reihenfolge, Gruppen mit ihren Mitgliedern.
 *
 * **Die Regel ist die Fence-Reihenfolge** (G3, zugleich die Stapel-Reihenfolge):
 * Jedes Element erscheint an seiner Stelle. Trifft die Wanderung auf eine
 * Gruppe, folgen ihr unmittelbar die Elemente, die geometrisch in ihr liegen
 * (G6, `gruppenMitglieder`); danach erscheinen sie nicht ein zweites Mal.
 * Elemente außerhalb jeder Gruppe stehen ohne Klammer da.
 *
 * **Verschachtelte Gruppen laufen über dieselbe Regel rekursiv**: Eine Gruppe
 * in einer Gruppe ist deren Mitglied (so rechnet es die Geometrie) und bringt
 * beim Ausgeben ihre eigenen Mitglieder mit; weil jedes Element nur einmal
 * ausgegeben wird, bleibt die Ausgabe auch bei überlappenden Rechtecken
 * eindeutig. Eine Einrückung entsteht nicht — Markdown kennt keine
 * Verschachtelung von Absätzen, und eine erfundene wäre Formatierung ohne
 * Aussage.
 */
function elementBloecke(model, L, befunde) {
  const stapel = (model.elemente || []).filter((el) => el.art !== 'linie');
  const erledigt = new Set();
  const bloecke = [];

  const gibAus = (el) => {
    if (erledigt.has(el)) return;
    erledigt.add(el);
    const vorher = bloecke.length;
    if (el.art === 'gruppe') bloecke.push(gruppenBlock(el, L));
    else if (el.art === 'karte') bloecke.push(...karteBloecke(el, L));
    else if (el.art === 'form') {
      const zeile = formBlock(el, L);
      if (zeile) bloecke.push(zeile);
    } else {
      // Unbekannter Marker (G1): Er gehört einer anderen Programmfassung, und
      // was an ihm lesbar ist, geht auch im Export nicht verloren.
      const text = kartenText(el);
      if (text.trim() !== '') bloecke.push(text);
    }
    // Der Hinweis steht unter dem Element — aber nur, wenn das Element
    // überhaupt etwas ausgegeben hat. Eine Form ohne Beschriftung entfällt
    // (F1), und ein Hinweis ohne seinen Gegenstand wäre ein Rätsel; ihr Befund
    // wandert stattdessen in den Hinweis der Fläche.
    const eigene = befunde.jeElement.get(el);
    if (eigene && bloecke.length > vorher) {
      bloecke.push(L('canvas.portabel.befund').replace('{befunde}', befundText(L, eigene)));
      befunde.jeElement.delete(el);
    }
    if (el.art !== 'gruppe') return;
    for (const mitglied of gruppenMitglieder(el, stapel)) gibAus(mitglied);
  };

  for (const el of stapel) gibAus(el);
  return bloecke;
}

// Die Verbindungs-Liste am Ende der Fläche (F2). Keine Verbindung, keine Liste
// und keine Zeile darüber.
function verbindungsBloecke(model, L) {
  const linien = (model.elemente || []).filter((el) => el.art === 'linie');
  if (linien.length === 0) return [];
  const namen = new Map();
  for (const el of model.elemente || []) {
    if (el.art === 'karte' && el.id) namen.set(el.id, kartenName(el, L));
  }
  const name = (id) => namen.get(id) || id || L('canvas.liste.ohneText');
  const zeilen = linien.map((linie) => {
    const text = einzeilig(linie);
    const schluessel =
      text === '' ? 'canvas.portabel.verbindung' : 'canvas.portabel.verbindungMitText';
    return (
      '- ' +
      L(schluessel)
        .replace('{von}', name(linie.von))
        .replace('{pfeil}', PFEILE[linienRichtung(linie)] || PFEILE.vor)
        .replace('{nach}', name(linie.nach))
        .replace('{text}', text)
    );
  });
  return ['**' + L('canvas.portabel.verbindungen') + '**', zeilen.join('\n')];
}

/**
 * Die Markdown-Entsprechung einer Canvas-Fläche.
 *
 * @param {string} rumpf Rumpf der Fence ohne die Zaun-Zeilen.
 * @param {object} [labels] aufgelöste Schlüssel-Text-Karte.
 * @returns {string} Markdown-Text; nie HTML, nie mit abschließendem Umbruch.
 */
function canvasPortabel(rumpf, labels) {
  const L = leser(labels);
  const model = parseCanvasFence(String(rumpf == null ? '' : rumpf));
  const befunde = befundeVerteilen(model);
  const umfang = canvasUmfang(model);
  // Eine Fläche ohne Elemente bekommt ihren Kopf und keinen Fehler: «keine
  // Elemente» sagt mehr als «0 Karten, 0 Verbindungen» und ist die vollständige
  // Auskunft über sie.
  const leerFlaeche = (model.elemente || []).length === 0;
  const kopf = L('canvas.portabel.kopf')
    .replace('{titel}', canvasFlaechenTitel(model) || L('canvas.block.art'))
    .replace('{umfang}', leerFlaeche ? L('canvas.portabel.leer') : canvasUmfangText(L, umfang));

  const bloecke = ['**' + kopf + '**'];
  bloecke.push(...elementBloecke(model, L, befunde));
  bloecke.push(...verbindungsBloecke(model, L));
  // Was keinem ausgegebenen Element zufiel, steht am Ende der Fläche: Auch
  // dieser Befund geht nicht verloren, nur seine Stelle ist die Fläche.
  const rest = [...befunde.rest, ...[...befunde.jeElement.values()].flat()].sort(
    (a, b) => (a.zeile || 0) - (b.zeile || 0),
  );
  if (rest.length > 0) {
    bloecke.push(L('canvas.portabel.befundFlaeche').replace('{befunde}', befundText(L, rest)));
  }
  return bloecke.join('\n\n');
}

module.exports = { CANVAS_PORTABEL_LABEL_KEYS, canvasPortabel };
