// 4T-001804 (Epic 3E-000292): Übersetzungs-Kern zwischen der eigenen Fläche und
// dem offenen Format JSON Canvas — beide Richtungen und die Buchführung über
// das, was dabei nicht mitkonnte (Stories 4S-000959 und 4S-000960).
//
// **Warum ein eigenes Modul neben dem Kern.** Beide Richtungen teilen dieselbe
// Übersetzungs-Tafel. Lägen sie im Export- und im Import-Weg getrennt, liefen
// sie auseinander, sobald eine Hälfte eine Regel lernt, die die andere nicht
// kennt. Derselbe Schnitt wie `canvas-portabel.js` und `canvas-filter.js`: eine
// eigene Fachlichkeit neben dem Lesen und Schreiben der Fence, nicht ein Anbau
// an `canvas-core.js`, das auf seinem Größen-Budget steht.
//
// Prozessneutral (CJS, reine Funktionen, kein DOM, kein Electron, kein
// Datei-Zugriff). **Eine Pfad-Auflösung findet hier nicht statt**: Aufgelöste
// Ziele werden hineingereicht, und was der Kern nicht auflösen kann, meldet er
// als Posten zurück. Nähme er das Auflösen auf, verlöre er genau die
// Eigenschaft, die ihn ohne Renderer und ohne Bereich prüfbar macht.
//
// **Die Regeln stammen aus der Entscheidung F1 des Product Owners vom
// 2026-09-19** («bestmöglicher Ersatz, nie still, Bericht nach jedem Vorgang»)
// und den technischen Festlegungen des Epics. Die tragenden Zeilen beider
// Tafeln:
//
//   Ausgabe: eine **Form** wird eine Text-Karte an derselben Stelle (Art und
//     Füllung entfallen); die **Beschriftung** einer Verweis- oder Bild-Karte
//     wird ein Gruppen-Knoten `<id>-titel` um die Karte, je Seite zehn
//     Einheiten größer und im Array unmittelbar **vor** ihr; Blau und Pink
//     gehen als Farbwert hinaus, weil das fremde Format für sie keine
//     Voreinstellung führt; Befunde, unbekannte Marker und die Präambel
//     entfallen und werden gezählt.
//   Einlesen: eine **Web-Karte** und eine Datei-Karte auf einen fremden
//     Dateityp werden Text-Karten mit einem Markdown-Verweis; die **Farbe
//     einer Karte** entfällt, weil eine Karte hier keine trägt; ein freier
//     Farbwert wird der nächstliegende der acht Namen; eine Verbindung an
//     einer Gruppe entfällt; ein **Pfeil nur am Anfang** wird durch Tausch
//     beider Enden zur gerichteten Verbindung, **ohne** Verlust; ein
//     **einfacher Zeilenumbruch** im Text einer Karte wird zum festen, damit
//     die Karte dieselben Zeilen zeigt wie drüben.
//
// **Der Bericht trägt Schlüssel, keine Sätze.** Die Texte entstehen in den
// beiden Weg-Tasks über die Sprachdateien (`canvas.austausch.*`); hier stehen
// allein die stabilen Kennungen und ihre Anzahl. Ein Modul, das Sätze bildete,
// bräuchte eine Sprache — und hätte damit die Prozess-Neutralität verloren.
'use strict';

const {
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
  linienRichtung,
  parseCanvasFence,
  serializeCanvasFence,
  ID_RE,
} = require('./canvas-core.js');
const { KENNUNGS_PRAEFIXE, erzeugeKarte, erzeugeGruppe } = require('./canvas-elemente.js');
const { istBildDatei } = require('../bild-endungen.js');
const { TAB_GROUP_COLOR_VALUES } = require('../tab-group-colors.js');
const { MD_EXT_RE } = require('../markdown/link-scan.js');

/**
 * Die Posten des Verlust-Berichts als eingefrorener Satz stabiler Schlüssel.
 *
 * **Die Reihenfolge ist die Reihenfolge im Bericht** und nicht die des
 * Auftretens: Derselbe Vorgang soll denselben Bericht liefern, gleich in
 * welcher Folge die Elemente auf der Fläche stehen.
 */
const VERLUST_POSTEN = Object.freeze({
  // Ausgabe (eigen → fremd)
  formAlsTextkarte: 'formAlsTextkarte',
  beschriftungAlsRahmen: 'beschriftungAlsRahmen',
  zielNichtAufgeloest: 'zielNichtAufgeloest',
  unbekanntesElement: 'unbekanntesElement',
  befundeNichtUebertragen: 'befundeNichtUebertragen',
  praeambelNichtUebertragen: 'praeambelNichtUebertragen',
  // beide Richtungen: eine Verbindung, deren Ende keine Karte ist
  verbindungOhneKarte: 'verbindungOhneKarte',
  // Einlesen (fremd → eigen)
  webkarteAlsTextkarte: 'webkarteAlsTextkarte',
  fremderDateitypAlsTextkarte: 'fremderDateitypAlsTextkarte',
  kartenfarbeEntfallen: 'kartenfarbeEntfallen',
  farbwertGenaehert: 'farbwertGenaehert',
  gruppenhintergrundEntfallen: 'gruppenhintergrundEntfallen',
  knotenUebersprungen: 'knotenUebersprungen',
});

const POSTEN_FOLGE = Object.freeze(Object.keys(VERLUST_POSTEN));

/**
 * Die Fehler-Kennzeichen des Einlesens. Sie sind kein Posten des Berichts,
 * sondern die Aussage, dass gar nichts entstanden ist — auch sie ein
 * Schlüssel und kein Satz.
 */
const AUSTAUSCH_FEHLER = Object.freeze({ keineListen: 'keineListen' });

// Muster der eigenen Kennungen: das des Kerns, damit beide nie auseinanderlaufen.
const KENNUNGS_MUSTER = ID_RE;

// Die sechs eigenen Namen, für die das fremde Format eine Voreinstellung führt.
// Blau und Pink fehlen hier mit Absicht: Sie gehen als Farbwert hinaus.
const FARBE_NACH_VOREINSTELLUNG = Object.freeze({
  rot: '1',
  orange: '2',
  gelb: '3',
  grün: '4',
  türkis: '5',
  lila: '6',
});

const VOREINSTELLUNG_NACH_FARBE = Object.freeze(
  Object.fromEntries(
    Object.entries(FARBE_NACH_VOREINSTELLUNG).map(([name, ziffer]) => [ziffer, name]),
  ),
);

// Die vier Anschluss-Seiten. `auto` steht nicht darin, weil es dem **Fehlen**
// der Angabe entspricht und nicht einem fünften Wert.
const SEITE_NACH_CANVAS = Object.freeze({
  links: 'left',
  rechts: 'right',
  oben: 'top',
  unten: 'bottom',
});

const SEITE_NACH_EIGEN = Object.freeze(
  Object.fromEntries(Object.entries(SEITE_NACH_CANVAS).map(([eigen, fremd]) => [fremd, eigen])),
);

// Der Rahmen um eine beschriftete Verweis- oder Bild-Karte ist je Seite zehn
// Einheiten größer als sie (Entscheidung F1).
const RAHMEN_LUFT = 10;

// Eine Datei-Endung im letzten Pfad-Teil. Getrennt von `MD_EXT_RE` gebraucht:
// Ein Ziel **ohne** Endung ist im eigenen Format ein Dokument-Verweis, weil der
// Auflöser dort `.md` anhängt.
const ENDUNG_RE = /\.[A-Za-z0-9]+$/;

// --- Bericht -------------------------------------------------------------------

function neuerBericht() {
  const zaehler = new Map();
  return {
    zaehle(schluessel, anzahl = 1) {
      if (anzahl <= 0) return;
      zaehler.set(schluessel, (zaehler.get(schluessel) || 0) + anzahl);
    },
    liste() {
      return POSTEN_FOLGE.filter((s) => zaehler.has(s)).map((s) => ({
        schluessel: s,
        anzahl: zaehler.get(s),
      }));
    },
  };
}

// --- Farben --------------------------------------------------------------------

// Der Farbwert eines eigenen Namens aus der geteilten Palette — **bezogen**,
// nie kopiert, damit eine Farb-Änderung an einer Stelle bleibt.
function farbwertVon(name) {
  return TAB_GROUP_COLOR_VALUES[LINIEN_FARBEN[name]];
}

function farbeNachCanvas(name) {
  if (name == null) return undefined;
  return FARBE_NACH_VOREINSTELLUNG[name] || farbwertVon(name);
}

// `#abc` und `#aabbcc`; alles andere ist kein Farbwert.
function zerlegeHex(wert) {
  const treffer = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(wert == null ? '' : wert).trim());
  if (!treffer) return null;
  const roh = treffer[1].length === 3 ? treffer[1].replace(/./g, (z) => z + z) : treffer[1];
  return [0, 2, 4].map((i) => parseInt(roh.slice(i, i + 2), 16));
}

// Der nächstliegende der acht Namen, gemessen als Abstand im RGB-Raum gegen die
// **hellen** Werte der Palette (Festlegung des Epics). Bei Gleichstand gewinnt
// der frühere Name des Satzes — eine Reihenfolge, die im Kern festliegt und
// damit auch hier nicht vom Zufall abhängt.
function naechsterFarbname(wert) {
  const ziel = zerlegeHex(wert);
  if (!ziel) return null;
  let beste = null;
  let bester = Infinity;
  for (const name of LINIEN_FARB_NAMEN) {
    const kandidat = zerlegeHex(farbwertVon(name));
    const abstand = kandidat.reduce((summe, teil, i) => summe + (teil - ziel[i]) ** 2, 0);
    if (abstand < bester) {
      bester = abstand;
      beste = name;
    }
  }
  return beste;
}

// Eine fremde Farbe als eigener Name. Ein Wert, der weder Voreinstellung noch
// Farbwert ist, liefert nichts — das Element bleibt bei der Standardfarbe.
function farbeNachEigen(wert, bericht) {
  if (typeof wert !== 'string' || wert.trim() === '') return undefined;
  const voreinstellung = VOREINSTELLUNG_NACH_FARBE[wert.trim()];
  if (voreinstellung) return voreinstellung;
  const name = naechsterFarbname(wert);
  if (!name) return undefined;
  bericht.zaehle(VERLUST_POSTEN.farbwertGenaehert);
  return name;
}

// --- Kennungen -----------------------------------------------------------------

// Erzeugt freie Kennungen im Muster des Bestands (`k1`, `e1`, `g1`, `s1`) und
// hält den Zähler je Vorsilbe, damit die Vergabe über eine große Fläche linear
// bleibt. Belegt ist, was schon einmal vergeben oder von der Quelle reserviert
// wurde.
function kennungsGeber(belegt) {
  const zaehler = new Map();
  return (art) => {
    const praefix = KENNUNGS_PRAEFIXE[art] || 'x';
    let i = zaehler.get(praefix) || 1;
    while (belegt.has(`${praefix}${i}`)) i++;
    const kennung = `${praefix}${i}`;
    belegt.add(kennung);
    zaehler.set(praefix, i + 1);
    return kennung;
  };
}

// --- Texte und Ziele -----------------------------------------------------------

// Die Inhalts-Zeilen eines Elements, wie sie dastehen; abgeschnitten wird allein
// der Leerraum am Ende. Ein Zeilenumbruch bleibt erhalten — er ist im fremden
// Format die Entsprechung der mehrzeiligen Beschriftung.
function textVon(el) {
  return String((el && el.inhalt) || '').replace(/\s+$/, '');
}

// Fremder Text als eigene Inhalts-Zeilen: CRLF wird zu LF, weil der Rumpf der
// Fence sein Zeilenende selbst führt.
function zeilenVon(wert) {
  return typeof wert === 'string' ? wert.replace(/\r\n?/g, '\n').replace(/\s+$/, '') : '';
}

// --- Fester Zeilenumbruch im Text einer Karte ----------------------------------
//
// **Warum überhaupt gewandelt wird.** Das fremde Werkzeug zeigt eine Karte
// zeilenweise: Wo im Text ein einfacher Zeilenumbruch steht, steht in der Karte
// eine neue Zeile. Die eigene Darstellung ist Markdown und behandelt denselben
// Umbruch als Leerzeichen; eine zweizeilige Karte käme als ein fortlaufender
// Absatz herein und sähe anders aus als drüben. Beim Einlesen wird der einfache
// Umbruch deshalb zum **festen** (Entscheidung des Product Owners vom
// 2026-09-20 aus der Abnahme). Beim Ausgeben bleibt der Text unverändert: Ein
// fester Umbruch ist auch im fremden Werkzeug gültiger Text, und es geht nichts
// verloren.
//
// **Warum der Rückstrich und nicht zwei Leerzeichen.** Beide Formen stellt der
// Markdown-Renderer der Anwendung dar (`markdown.js`, `breaks: false`); der
// Rückstrich ist auch die Form, die das Handbuch-Kapitel «Harte Zeilenumbrüche»
// im eigenen Beispiel zeigt. Den Ausschlag gibt die Haltbarkeit: Zwei
// Leerzeichen am Zeilenende sind unsichtbarer Leerraum, den jeder Formatierer
// und jeder Editor mit «trailing whitespace» abschneiden darf — der Umbruch
// verschwände später still wieder. Der Rückstrich ist ein Zeichen wie jedes
// andere und übersteht das.
const FESTER_UMBRUCH = '\\';

// Ein Code-Zaun. Innerhalb eines Zauns wird nichts gewandelt: Dort ist jede
// Zeile bereits für sich, und ein angehängter Rückstrich stünde als Zeichen im
// Code.
const ZAUN_ZEILE_RE = /^ {0,3}(?:`{3,}|~{3,})/;

// Eine Zeile, die selbst ein Block-Konstrukt ist oder eines einleitet:
// Überschrift, Zitat, Listenpunkt, Trennlinie, Setext-Unterstreichung,
// Tabellen-Zeile, HTML-Block. An ihrer Grenze trennt Markdown ohnehin, und ein
// fester Umbruch am Ende eines Blocks ist keiner: Er bliebe als Rückstrich im
// Text stehen.
const BLOCK_ZEILE_RE =
  /^ {0,3}(?:#{1,6}(?:\s|$)|>|[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|(?:-{3,}|_{3,}|\*{3,})\s*$|={2,}\s*$|\||<[A-Za-z/!])/;

// Die Trennzeile einer Tabelle auch ohne führenden Strich (`---|---`): Sie macht
// die Zeile darüber zur Kopfzeile.
const TABELLEN_TRENNER_RE = /^[\s:|-]*\|[\s:|-]*$/;

function istBlockZeile(zeile) {
  return ZAUN_ZEILE_RE.test(zeile) || BLOCK_ZEILE_RE.test(zeile) || TABELLEN_TRENNER_RE.test(zeile);
}

// Trägt die Zeile schon einen festen Umbruch — als Rückstrich oder als die
// beiden Leerzeichen —, bleibt sie, wie sie ist.
function hatFestenUmbruch(zeile) {
  return zeile.endsWith(FESTER_UMBRUCH) || /\s{2,}$/.test(zeile);
}

/**
 * Der Text eines fremden Text-Knotens mit festen Zeilenumbrüchen.
 *
 * Gewandelt wird allein der einfache Umbruch **zwischen zwei nicht-leeren
 * Textzeilen**. Nicht gewandelt wird innerhalb eines Code-Zauns, vor und nach
 * einer Leerzeile, an Block-Konstrukten auf einer der beiden Seiten und an
 * einer Zeile, die den festen Umbruch schon trägt.
 *
 * @param {string} text
 * @returns {string}
 */
function mitFestenUmbruechen(text) {
  if (text === '') return text;
  const zeilen = text.split('\n');
  let imZaun = false;
  for (let i = 0; i < zeilen.length - 1; i++) {
    const zeile = zeilen[i];
    if (ZAUN_ZEILE_RE.test(zeile)) {
      imZaun = !imZaun;
      continue;
    }
    if (imZaun) continue;
    const naechste = zeilen[i + 1];
    if (zeile.trim() === '' || naechste.trim() === '') continue;
    if (istBlockZeile(zeile) || istBlockZeile(naechste)) continue;
    if (hatFestenUmbruch(zeile)) continue;
    zeilen[i] = zeile + FESTER_UMBRUCH;
  }
  return zeilen.join('\n');
}

function dateiname(pfad) {
  return String(pfad).split(/[/\\]/).pop();
}

// Ein Markdown-Verweis. Die spitzen Klammern kommen nur, wo der Pfad sie
// braucht; sonst läse sich jeder erzeugte Verweis anders als jeder getippte.
function mdVerweis(text, ziel) {
  const eingefasst = /[\s()<>]/.test(ziel) ? `<${ziel}>` : ziel;
  return `[${text}](${eingefasst})`;
}

// Ein Eintrag aus einer hineingereichten Abbildung. Zugelassen sind eine `Map`
// und ein gewöhnliches Objekt; beide Formen kommen im Bestand vor, und der
// Kern soll dem Aufrufer keine von beiden aufzwingen.
function eintragAus(abbildung, schluessel) {
  if (!abbildung) return undefined;
  if (typeof abbildung.get === 'function') return abbildung.get(schluessel);
  return Object.prototype.hasOwnProperty.call(abbildung, schluessel)
    ? abbildung[schluessel]
    : undefined;
}

/**
 * Das Ziel einer Verweis- oder Bild-Karte als `file`/`subpath` des fremden
 * Formats.
 *
 * Aufgelöst wird **nicht hier**: Die Abbildung bringt der Aufrufer mit. Fehlt
 * ein Eintrag, geht das Ziel so hinaus, wie es auf der Karte steht — der Anker
 * dabei im eigenen Feld, weil das fremde Format ihn getrennt führt und ein
 * `#` im Dateipfad dort keine Aussage hätte.
 */
function zielFuerAusgabe(ziel, abbildung, bericht) {
  const eintrag = eintragAus(abbildung, ziel);
  if (eintrag && typeof eintrag.file === 'string' && eintrag.file !== '') {
    const knoten = { file: eintrag.file };
    if (typeof eintrag.subpath === 'string' && eintrag.subpath !== '') {
      knoten.subpath = eintrag.subpath;
    }
    return knoten;
  }
  bericht.zaehle(VERLUST_POSTEN.zielNichtAufgeloest);
  const raute = ziel.indexOf('#');
  if (raute <= 0) return { file: ziel };
  return { file: ziel.slice(0, raute), subpath: ziel.slice(raute) };
}

// --- Ausgabe: Fläche → JSON Canvas ---------------------------------------------

// Die Feld-Folge eines Knotens ist die Folge des Beispiels im Epic: erst die
// Kennung und die Art, dann Lage und Größe, dann die Farbe, dann das Feld der
// Art. Sie entsteht über die Reihenfolge der Zuweisungen und nicht über eine
// zweite Liste, die veralten könnte.
function knotenGeruest(id, typ, el) {
  return { id, type: typ, x: el.x, y: el.y, width: el.b, height: el.h };
}

function titelKennung(id, belegt) {
  let kandidat = `${id}-titel`;
  for (let i = 2; belegt.has(kandidat); i++) kandidat = `${id}-titel${i}`;
  belegt.add(kandidat);
  return kandidat;
}

function kartenKnoten(el, id, optionen, bericht, belegt) {
  const ziel = el.doc != null ? el.doc : el.bild;
  if (ziel == null) {
    const knoten = knotenGeruest(id, 'text', el);
    knoten.text = textVon(el);
    return [knoten];
  }
  const knoten = knotenGeruest(id, 'file', el);
  Object.assign(knoten, zielFuerAusgabe(String(ziel), optionen.ziele, bericht));
  const beschriftung = textVon(el);
  if (beschriftung === '') return [knoten];
  // Ein `file`-Knoten trägt weder Text noch Beschriftung; der Rahmen mit Titel
  // ist der bestmögliche Ersatz (F1). Er steht **vor** der Karte, weil die
  // Array-Reihenfolge die Stapel-Reihenfolge ist und er hinter ihr liegen soll.
  bericht.zaehle(VERLUST_POSTEN.beschriftungAlsRahmen);
  const rahmen = {
    id: titelKennung(id, belegt),
    type: 'group',
    x: el.x - RAHMEN_LUFT,
    y: el.y - RAHMEN_LUFT,
    width: el.b + 2 * RAHMEN_LUFT,
    height: el.h + 2 * RAHMEN_LUFT,
    label: beschriftung,
  };
  return [rahmen, knoten];
}

function formKnoten(el, id, bericht) {
  bericht.zaehle(VERLUST_POSTEN.formAlsTextkarte);
  const knoten = knotenGeruest(id, 'text', el);
  const farbe = farbeNachCanvas(el.rand);
  if (farbe !== undefined) knoten.color = farbe;
  knoten.text = textVon(el);
  return knoten;
}

function gruppenKnoten(el, id) {
  const knoten = knotenGeruest(id, 'group', el);
  const farbe = farbeNachCanvas(el.farbe);
  if (farbe !== undefined) knoten.color = farbe;
  const label = textVon(el);
  if (label !== '') knoten.label = label;
  return knoten;
}

function kanteAus(el, id, karten) {
  if (!el.von || !el.nach || !karten.has(el.von) || !karten.has(el.nach)) return null;
  const attrs = el.attrs || {};
  const kante = { id, fromNode: karten.get(el.von) };
  if (SEITE_NACH_CANVAS[attrs.von]) kante.fromSide = SEITE_NACH_CANVAS[attrs.von];
  kante.toNode = karten.get(el.nach);
  if (SEITE_NACH_CANVAS[attrs.nach]) kante.toSide = SEITE_NACH_CANVAS[attrs.nach];
  // Die gerichtete Verbindung **ist** die Voreinstellung des fremden Formats
  // (kein Pfeil am Anfang, einer am Ende); beide Felder entfallen dann.
  const richtung = linienRichtung(el);
  if (richtung === 'beide') kante.fromEnd = 'arrow';
  if (richtung === 'keine') kante.toEnd = 'none';
  const farbe = farbeNachCanvas(el.farbe);
  if (farbe !== undefined) kante.color = farbe;
  const label = textVon(el);
  if (label !== '') kante.label = label;
  return kante;
}

// Eingabe darf das gelesene Modell oder der Rumpf der Fence sein — beides kommt
// im Bestand vor: Die Ansicht hält das Modell, der Konverter den Rumpf.
function alsModell(flaeche) {
  if (flaeche && typeof flaeche === 'object' && Array.isArray(flaeche.elemente)) return flaeche;
  return parseCanvasFence(String(flaeche == null ? '' : flaeche));
}

/**
 * Eine Fläche als Objekt des offenen Formats JSON Canvas.
 *
 * Wirft nie. Lage, Größe, Stapel-Reihenfolge und Kennungen gehen unverändert
 * über; was das fremde Format nicht kennt, bekommt seinen Ersatz oder entfällt
 * und steht in jedem Fall im Bericht.
 *
 * @param {string|object} flaeche Rumpf der Fence oder gelesenes Modell.
 * @param {object} [optionen]
 * @param {Map<string,{file: string, subpath?: string}>|object} [optionen.ziele]
 *   Abbildung «eigenes Verweis-Ziel → aufgelöster Pfad». Fehlt ein Eintrag,
 *   geht das Ziel wie geschrieben hinaus und wird als Posten gezählt.
 * @returns {{canvas: {nodes: Array<object>, edges: Array<object>},
 *   verluste: Array<{schluessel: string, anzahl: number}>}}
 */
function flaecheNachJsonCanvas(flaeche, optionen = {}) {
  const model = alsModell(flaeche);
  const elemente = Array.isArray(model.elemente) ? model.elemente : [];
  const bericht = neuerBericht();
  const belegt = new Set();
  for (const el of elemente) if (el && el.id) belegt.add(String(el.id));
  const gib = kennungsGeber(belegt);

  const nodes = [];
  const karten = new Map();
  for (const el of elemente) {
    if (el.art === 'linie') continue;
    const id = el.id || gib(el.art);
    if (el.art === 'karte') {
      karten.set(el.id, id);
      nodes.push(...kartenKnoten(el, id, optionen, bericht, belegt));
    } else if (el.art === 'form') nodes.push(formKnoten(el, id, bericht));
    else if (el.art === 'gruppe') nodes.push(gruppenKnoten(el, id));
    // Ein unbekannter Marker (G1) gehört einer anderen Programmfassung; das
    // fremde Format hat für ihn keinen Platz.
    else bericht.zaehle(VERLUST_POSTEN.unbekanntesElement);
  }

  const edges = [];
  for (const el of elemente) {
    if (el.art !== 'linie') continue;
    const kante = kanteAus(el, el.id || gib('linie'), karten);
    if (kante) edges.push(kante);
    else bericht.zaehle(VERLUST_POSTEN.verbindungOhneKarte);
  }

  bericht.zaehle(VERLUST_POSTEN.befundeNichtUebertragen, (model.errors || []).length);
  // Leerzeilen vor dem ersten Marker sind kein Inhalt; gezählt wird allein, was
  // dort wirklich stand.
  bericht.zaehle(
    VERLUST_POSTEN.praeambelNichtUebertragen,
    (model.praeambel || []).filter((zeile) => String(zeile).trim() !== '').length,
  );
  return { canvas: { nodes, edges }, verluste: bericht.liste() };
}

/**
 * Ein JSON-Canvas-Objekt als Text der Datei: UTF-8, mit Tabulator eingerückt,
 * und mit den beiden Listen als einzigem Inhalt.
 *
 * Ohne abschließenden Zeilenumbruch: Ob die Datei einen trägt, entscheidet der
 * Schreib-Weg und nicht der Übersetzer.
 *
 * @param {{nodes?: Array<object>, edges?: Array<object>}} canvas
 * @returns {string}
 */
function serialisiereJsonCanvas(canvas) {
  const quelle = canvas && typeof canvas === 'object' ? canvas : {};
  const inhalt = {
    nodes: Array.isArray(quelle.nodes) ? quelle.nodes : [],
    edges: Array.isArray(quelle.edges) ? quelle.edges : [],
  };
  return JSON.stringify(inhalt, null, '\t');
}

// --- Einlesen: JSON Canvas → Fläche --------------------------------------------

// Die Fabriken des Bestands erzwingen das **Anzeige**-Mindestmaß 40 × 24. Der
// Austausch überträgt Lage und Größe dagegen unverändert (Festlegung des
// Epics) und setzt sie deshalb danach zurück; kleiner gezeichnet wird die Karte
// ohnehin nicht, dafür sorgt die Geometrie beim Anzeigen.
function masseSetzen(el, lage) {
  el.x = lage.x;
  el.y = lage.y;
  el.b = lage.b;
  el.h = lage.h;
}

// Lage und Größe eines fremden Knotens. Fehlt eine der vier Pflicht-Angaben
// oder ist sie keine Zahl, entsteht kein Element; nicht-ganzzahlige Werte
// werden gerundet, weil das fremde Format ganze Pixel führt.
function lageAus(roh) {
  const werte = ['x', 'y', 'width', 'height'].map((name) => Number(roh[name]));
  if (werte.some((wert) => !Number.isFinite(wert))) return null;
  return {
    x: Math.round(werte[0]),
    y: Math.round(werte[1]),
    b: Math.round(werte[2]),
    h: Math.round(werte[3]),
  };
}

function karteMitText(id, lage, text) {
  const el = erzeugeKarte({ id, ...lage });
  masseSetzen(el, lage);
  el.inhalt = text;
  return el;
}

function karteMitZiel(id, lage, felder) {
  const el = erzeugeKarte({ id, ...lage, ...felder });
  masseSetzen(el, lage);
  return el;
}

// Ein Datei-Knoten wird zur Verweis-, zur Bild- oder zur Text-Karte — die
// Unterscheidung läuft über die Endung, weil das eigene Format beide Karten-
// Ausprägungen an ihrer Angabe trennt und `bild=` nur Bild-Endungen zulässt.
function dateiKarte(roh, id, lage, optionen, bericht) {
  const pfad = String(roh.file);
  const ziel = eigenesZiel(pfad, optionen.zielFuerPfad);
  if (istBildDatei(pfad)) return karteMitZiel(id, lage, { bild: ziel });
  const anker = typeof roh.subpath === 'string' && roh.subpath.startsWith('#') ? roh.subpath : '';
  // Ein Ziel ohne Endung ist im eigenen Format ein Dokument-Verweis: Der
  // Auflöser hängt dort `.md` an.
  if (MD_EXT_RE.test(pfad) || !ENDUNG_RE.test(dateiname(pfad))) {
    return karteMitZiel(id, lage, { doc: ziel + anker });
  }
  bericht.zaehle(VERLUST_POSTEN.fremderDateitypAlsTextkarte);
  return karteMitText(id, lage, mdVerweis(dateiname(pfad), ziel));
}

// Der fremde Pfad als eigenes Ziel. Die Übersetzung bringt der Aufrufer mit —
// als Funktion oder als Abbildung; fehlt sie, bleibt der bloße Dateiname, den
// die Namens-Suche des Bestands findet.
function eigenesZiel(pfad, uebersetzung) {
  if (typeof uebersetzung === 'function') {
    const ziel = uebersetzung(pfad);
    if (typeof ziel === 'string' && ziel !== '') return ziel;
    return dateiname(pfad);
  }
  const eintrag = eintragAus(uebersetzung, pfad);
  return typeof eintrag === 'string' && eintrag !== '' ? eintrag : dateiname(pfad);
}

/**
 * Ein fremder Knoten als eigenes Element, oder `null`, wenn er keines wird.
 *
 * @returns {{el: object, istKarte: boolean}|null}
 */
function eigenesElement(roh, id, optionen, bericht) {
  const lage = lageAus(roh);
  if (!lage) return null;
  if (roh.type === 'group') {
    const el = erzeugeGruppe({ id, ...lage, farbe: farbeNachEigen(roh.color, bericht) });
    masseSetzen(el, lage);
    el.inhalt = zeilenVon(roh.label);
    if (roh.background != null || roh.backgroundStyle != null) {
      bericht.zaehle(VERLUST_POSTEN.gruppenhintergrundEntfallen);
    }
    return { el, istKarte: false };
  }
  if (roh.type === 'text') {
    if (typeof roh.text !== 'string') return null;
    // Allein hier: Die Link-Texte der Web- und der Datei-Karte entstehen aus
    // einem Pfad und sind einzeilig, und Beschriftungen von Gruppen und
    // Verbindungen sind kein Markdown.
    return { el: karteMitText(id, lage, mitFestenUmbruechen(zeilenVon(roh.text))), istKarte: true };
  }
  if (roh.type === 'link') {
    if (typeof roh.url !== 'string' || roh.url === '') return null;
    bericht.zaehle(VERLUST_POSTEN.webkarteAlsTextkarte);
    return { el: karteMitText(id, lage, mdVerweis(roh.url, roh.url)), istKarte: true };
  }
  if (roh.type === 'file') {
    if (typeof roh.file !== 'string' || roh.file === '') return null;
    return { el: dateiKarte(roh, id, lage, optionen, bericht), istKarte: true };
  }
  return null;
}

function setzeAttr(el, name, wert) {
  if (!el.attrFolge.includes(name)) el.attrFolge.push(name);
  el.attrs[name] = wert;
}

function eigeneLinie(roh, id, karten, bericht) {
  let von = karten.get(roh.fromNode);
  let nach = karten.get(roh.toNode);
  if (!von || !nach) return null;
  let vonSeite = SEITE_NACH_EIGEN[roh.fromSide];
  let nachSeite = SEITE_NACH_EIGEN[roh.toSide];
  // Voreinstellungen des fremden Formats: kein Pfeil am Anfang, einer am Ende.
  const anfang = roh.fromEnd === 'arrow' ? 'arrow' : 'none';
  const ende = roh.toEnd === 'none' ? 'none' : 'arrow';
  let richtung = 'vor';
  if (anfang === 'arrow' && ende === 'arrow') richtung = 'beide';
  else if (anfang === 'none' && ende === 'none') richtung = 'keine';
  else if (anfang === 'arrow') {
    // Ein Pfeil nur am Anfang: Das eigene Format kennt genau drei Formen, und
    // der Tausch beider Enden samt ihrer Seiten sagt dasselbe — ohne Verlust.
    [von, nach] = [nach, von];
    [vonSeite, nachSeite] = [nachSeite, vonSeite];
  }
  const el = {
    art: 'linie',
    id,
    attrs: {},
    attrFolge: [],
    inhalt: zeilenVon(roh.label),
    roh: { marker: '', inhalt: [] },
    geaendert: true,
    zeile: 0,
    richtung,
    gerichtet: richtung !== 'keine',
    von,
    nach,
    farbe: undefined,
  };
  if (vonSeite) setzeAttr(el, 'von', vonSeite);
  if (nachSeite) setzeAttr(el, 'nach', nachSeite);
  const farbe = farbeNachEigen(roh.color, bericht);
  if (farbe) {
    el.farbe = farbe;
    setzeAttr(el, 'farbe', farbe);
  }
  return el;
}

/**
 * Ein bereits gelesenes JSON-Canvas-Objekt als Rumpf einer eigenen Fence.
 *
 * Wirft nie — auch nicht bei einer unbrauchbaren Eingabe: Trägt das Objekt
 * weder eine Knoten- noch eine Verbindungs-Liste, kommt ein Ergebnis mit
 * Fehler-Kennzeichen zurück und kein Ausnahme-Objekt.
 *
 * Kennungen, die nicht ins eigene Muster passen, und doppelte werden durch
 * erzeugte ersetzt; die Verbindungen folgen der Ersetzung.
 *
 * @param {object} objekt geparstes Objekt des fremden Formats.
 * @param {object} [optionen]
 * @param {function(string): string|Map<string,string>|object} [optionen.zielFuerPfad]
 *   Übersetzung eines fremden Datei-Pfades in das eigene Ziel. Fehlt sie,
 *   bleibt der bloße Dateiname.
 * @returns {{rumpf: string, verluste: Array<{schluessel: string, anzahl: number}>,
 *   fehler: string|null}}
 */
function jsonCanvasNachFlaeche(objekt, optionen = {}) {
  const quelle = objekt && typeof objekt === 'object' ? objekt : {};
  const nodes = Array.isArray(quelle.nodes) ? quelle.nodes : null;
  const edges = Array.isArray(quelle.edges) ? quelle.edges : null;
  if (!nodes && !edges) {
    return { rumpf: '', verluste: [], fehler: AUSTAUSCH_FEHLER.keineListen };
  }

  const bericht = neuerBericht();
  // Vorlauf über **beide** Listen: Jede gültige Kennung der Quelle ist belegt,
  // bevor die erste erzeugte vergeben wird — sonst nähme eine erzeugte einer
  // späteren echten ihren Namen weg.
  const belegt = new Set();
  for (const roh of [...(nodes || []), ...(edges || [])]) {
    const id = roh && typeof roh.id === 'string' ? roh.id.trim() : '';
    if (KENNUNGS_MUSTER.test(id)) belegt.add(id);
  }
  const gib = kennungsGeber(belegt);
  const vergeben = new Set();
  const kennungFuer = (roh, art) => {
    const id = roh && typeof roh.id === 'string' ? roh.id.trim() : '';
    if (KENNUNGS_MUSTER.test(id) && !vergeben.has(id)) {
      vergeben.add(id);
      return id;
    }
    return gib(art);
  };

  const elemente = [];
  // Nur Karten sind zulässige Enden einer Verbindung; die Abbildung führt
  // deshalb allein sie, und eine Kante an einer Gruppe fällt von selbst heraus.
  const karten = new Map();
  for (const roh of nodes || []) {
    if (!roh || typeof roh !== 'object') {
      bericht.zaehle(VERLUST_POSTEN.knotenUebersprungen);
      continue;
    }
    const art = roh.type === 'group' ? 'gruppe' : 'karte';
    const id = kennungFuer(roh, art);
    const ergebnis = eigenesElement(roh, id, optionen, bericht);
    if (!ergebnis) {
      bericht.zaehle(VERLUST_POSTEN.knotenUebersprungen);
      continue;
    }
    // Eine Karte trägt im eigenen Format keine Farbe (Kern-Entscheidung E4).
    if (ergebnis.istKarte && roh.color != null) {
      bericht.zaehle(VERLUST_POSTEN.kartenfarbeEntfallen);
    }
    if (ergebnis.istKarte && typeof roh.id === 'string' && !karten.has(roh.id)) {
      karten.set(roh.id, id);
    }
    elemente.push(ergebnis.el);
  }

  for (const roh of edges || []) {
    const linie =
      roh && typeof roh === 'object'
        ? eigeneLinie(roh, kennungFuer(roh, 'linie'), karten, bericht)
        : null;
    if (linie) elemente.push(linie);
    else bericht.zaehle(VERLUST_POSTEN.verbindungOhneKarte);
  }

  const rumpf = serializeCanvasFence({ elemente, praeambel: [], zeilenende: '\n' });
  return { rumpf, verluste: bericht.liste(), fehler: null };
}

module.exports = {
  VERLUST_POSTEN,
  AUSTAUSCH_FEHLER,
  flaecheNachJsonCanvas,
  jsonCanvasNachFlaeche,
  serialisiereJsonCanvas,
};
