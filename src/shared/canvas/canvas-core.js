// 4T-001652 (Epic 3E-000287): Kern der Canvas — Leser und Schreiber der
// Fence `perspective-canvas`.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, kein
// Datei-Zugriff; Muster src/shared/mindmap-core.js). Der Kern kennt nur Text
// und ein Modell; wer ihn aufruft, bringt den Dokument-Text mit.
//
// **Grammatik** (Entscheidung E1/E2 des Konzepts «Canvas als räumliche
// Arbeitsfläche», lexikalische Hülle nach E3 des Datenbank-Konzepts vom
// 2026-08-25): Ein Element beginnt mit einer Marker-Zeile, die **in Spalte 0**
// mit `!` anfängt; alle folgenden Zeilen bis zum nächsten Marker sind ihr
// Inhalt. Angaben stehen auf der Marker-Zeile als `name=wert`. Eine
// Inhalts-Zeile, die selbst in Spalte 0 mit `!` beginnen soll, wird mit einem
// vorangestellten Rückstrich geschützt.
//
// **Vier Festlegungen des Product Owners vom 2026-09-09** (G1 bis G4 der
// Plan-Freigabe), weil die Grammatik eine Zusicherung nach außen ist:
//
//   G1 Ein **unbekannter Marker** ist kein Fehler, sondern ein unbekanntes
//      Element: Es wird mit seinem Rohtext mitgeführt und unverändert an
//      derselben Stelle zurückgeschrieben. Ohne diese Regel löschte eine
//      ältere Programmfassung die Formen und Gruppen einer neueren still,
//      sobald sie einmal speichert.
//   G2 **Byte-Gleichheit über Rohtext-Erhalt** statt über eine Normalform:
//      Ein unverändertes Element wird wörtlich zurückgeschrieben, nur ein
//      geändertes oder neues in kanonischer Form. Die Alternative hielte die
//      Zusicherung nur für Dateien, die bereits in Normalform vorliegen, und
//      machte das erste Speichern einer von Hand geschriebenen Fläche zu
//      einem stillen Umbau.
//   G3 Die **Reihenfolge in der Fence ist die Stapel-Reihenfolge**; ein
//      eigenes `z=`-Attribut gibt es nicht, weil ein zweiter Ordnungs-Träger
//      neben der Datei-Reihenfolge auseinanderlaufen könnte.
//   G4 Die **Enden einer Verbindung stehen in Stellung** mit einem Pfeil
//      dazwischen (`k1 -> k2` gerichtet, `k1 <-> k2` in beide Richtungen,
//      `k1 -- k2` ungerichtet); die Anschluss-Seiten bleiben Attribute.
//
// **Zwei Festlegungen der Stufe 2** (G5 und G6, Entscheidungen F1 bis F5 des
// Product Owners vom 2026-09-12), umgesetzt in 4T-001700:
//
//   G5 **Form:** `!form <id> x= y= b= h= art=<name> rand=<farbname>
//      füllung=<farbname|keine>`; die Inhalts-Zeilen sind die optionale
//      Beschriftung. Ohne `art` gilt `rechteck`, ohne `rand` die Standardfarbe,
//      ohne `füllung` bleibt die Form ungefüllt.
//   G6 **Gruppe:** `!gruppe <id> x= y= b= h= farbe=<farbname>`; die
//      Inhalts-Zeilen sind die Beschriftung. **Keine Mitglieder-Liste** —
//      das Rechteck ist die Aussage, und Mitglied ist, was darin liegt.
//
// **Zwei Festlegungen der Stufe 3** (G7 und G8, Entscheidungen F1 bis F5 des
// Product Owners vom 2026-09-12), umgesetzt in 4T-001746 (Epic 3E-000289):
//
//   G7 **Verweis-Angabe der Karte:** `!karte <id> x= y= b= h= doc="<Ziel>"`.
//      Das Ziel nimmt dieselben Formen wie das Ziel einer Einbettung `![[…]]`
//      — Dokumentname oder Pfad relativ zum eigenen Dokument, wahlweise mit
//      `#Überschrift` oder `#^block-id`.
//   G8 **Bild-Angabe der Karte:** `!karte <id> x= y= b= h= bild="<Bild>"`.
//      Zulässig sind die Bild-Endungen der Anlagen-Mechanik.
//
// **Kein neuer Marker und keine neue Element-Art** (Präzisierung des Product
// Owners vom 2026-09-09): Text und Verweis sind zwei Eigenschaften **derselben**
// Karte. Eine Verweis-Karte ist eine Karte, die Inhalts-Zeilen bleiben ihr
// eigener Text (Beschriftung), und `canvasUmfang` bekommt keine neue Zahl.
//
// **Was der Kern hier prüft und was nicht:** allein die **Form** — ein leerer
// Wert, beide Angaben an derselben Karte (`doc=` gewinnt) und eine unzulässige
// Bild-Endung sind Befunde nach 6.3. Ob ein Ziel **existiert**, prüft er nicht:
// Er ist prozessneutral und kennt keine Dateien; das nicht auflösbare Ziel ist
// ein Befund des Renderer-Pfads (4T-001747, 4T-001748).
//
// **G3 gilt seit der Entscheidung vom 2026-09-12 («Weg 2 ist freigegeben,
// umsetzen») über alle Element-Arten gemeinsam:** Karten, Formen und Gruppen
// stehen in **einer** Liste `model.elemente`, und ihre Abfolge darin ist die
// Stapel-Reihenfolge. Verbindungen sind eine eigene Ebene und von ihr nicht
// berührt. Anlegen, Ändern, Löschen und Umordnen der Elemente liegen in
// `canvas-elemente.js` — dieselbe Fachlichkeit, eine Datei weiter.
//
// **Fehler-Semantik** wie bei den Ereignissen (`events-fence.js`): Ein Befund
// landet in `model.errors` und wird nie geworfen; das betroffene Element
// bleibt erhalten. Ein defektes Element darf die Anzeige stören, aber niemals
// beim nächsten Speichern verschwinden.
'use strict';

// 4T-001746: Die einzige Abhängigkeit des Kerns — der geteilte Satz der
// Bild-Endungen für G8. Er ist reine Daten und damit prozess-neutral wie der
// Kern selbst; ein Renderer-Modul lädt er ausdrücklich nicht, und eine vierte
// Kopie des Satzes hätte er sonst selbst eröffnet.
const { istBildDatei } = require('../bild-endungen.js');

// Kennung der Erweiterung. Sie steht hier und nicht im Renderer, weil sie seit
// 4T-001668 auf **beiden** Prozess-Seiten gebraucht wird: `canvas-modus.js`
// fragt sie für die Verfügbarkeit des Ansichts-Modus, die Markdown-Pipeline im
// Preload für die Fence-Regel des Blocks. Zwei Schreibweisen desselben Wortes
// könnten auseinanderlaufen; hier gibt es nur eine.
const CANVAS_EXTENSION_ID = 'canvas';

// Marker der Stufen 1 bis 3. Die Stufe 3 hat **keinen** Marker hinzugefügt: Ihre
// beiden Neuerungen sind Angaben an der Karte (G7, G8). Was später hinzukommt,
// fängt bis dahin G1 auf.
const MARKER_ARTEN = new Set(['karte', 'linie', 'form', 'gruppe']);

// Die Element-Arten, die eine Lage auf der Fläche haben und damit im Stapel
// liegen. Verbindungen fehlen mit Absicht: Sie hängen an ihren Enden statt an
// eigenen Koordinaten und bleiben nach der Entscheidung vom 2026-09-12 eine
// eigene Ebene unter den Elementen.
const STAPEL_ARTEN = new Set(['karte', 'form', 'gruppe']);

// 4T-001700 (Entscheidung F2 des Product Owners vom 2026-09-12): genau sechs
// Arten. Weitere bleiben später ohne Grammatik-Änderung möglich, weil G1 einen
// unbekannten Wert auffängt und die Rückfall-Regel ihn als Rechteck zeichnet.
//
// Die Werte sind deutsche Einzelwörter wie die Farbnamen und die
// Anschluss-Seiten — sie stehen im Dokument und werden dort gelesen und
// getippt. `abgerundet` benennt dabei genau das, was die Art vom `rechteck`
// unterscheidet; ein zusammengesetzter Wert («abgerundetes rechteck») bräuchte
// Anführungszeichen und wäre in der Marker-Zeile die Ausnahme statt der Regel.
const FORM_ARTEN = ['rechteck', 'abgerundet', 'oval', 'dreieck', 'raute', 'stern'];

// Die Vorgabe ohne Angabe **und** die Rückfall-Art einer unbekannten Angabe.
// Beides ist derselbe Wert und steht deshalb an einer Stelle.
const FORM_ART_VORGABE = 'rechteck';

// Der eine Wert von `füllung=`, der keine Farbe ist. Er sagt dasselbe wie eine
// fehlende Angabe und steht in der Grammatik, weil eine ausdrücklich
// ungefüllte Form sich lesen soll wie eine Entscheidung und nicht wie ein
// Versehen.
const FUELLUNG_KEINE = 'keine';

// Kennungen sind bewusst schmal gehalten: Sie stehen unquotiert auf der
// Marker-Zeile und dürfen deshalb kein Leerzeichen und kein Sonderzeichen der
// Attribut-Grammatik tragen.
const ID_RE = /^[A-Za-z0-9_-]+$/;

// Lage und Größe eines Elements in geräteunabhängigen Einheiten (CSS-Pixel bei
// Zoom 1), Ursprung in der Mitte der Fläche. Ganze Zahlen, Lage auch negativ.
// Seit 4T-001700 für Karte, Form und Gruppe gleichermaßen — ein zweiter Satz
// derselben vier Namen liefe bei der nächsten Ergänzung auseinander.
const LAGE_ZAHLEN = ['x', 'y', 'b', 'h'];

// 4T-001746: Die beiden Verweis-Angaben der Karte (G7 und G8), in der
// Reihenfolge ihrer Zählung. Sie werden wie Lage und Größe in **benannte
// Felder** gelesen (`el.doc`, `el.bild`) und beim kanonischen Schreiben aus
// diesen Feldern geholt, damit die Bedienung sie setzen, ändern und entfernen
// kann; Angaben-Name und Feld-Name sind dabei mit Absicht dasselbe Wort.
//
// **Warum sie hinter der Lage stehen:** Die Marker-Zeile liest sich damit immer
// gleich — erst wo das Element liegt, dann worauf es zeigt —, und das Beispiel
// des Konzept-Dokuments zeigt sie seit dem 2026-09-09 genau so.
const KARTEN_VERWEISE = ['doc', 'bild'];

// Anschluss-Seiten einer Verbindung; `auto` überlässt die Wahl der Zeichnung.
const SEITEN = new Set(['links', 'rechts', 'oben', 'unten', 'auto']);

// 4T-001655 (Entscheidung V1 des Product Owners vom 2026-09-10): Die Farbe
// einer Verbindung steht als **Name** an der Marker-Zeile (`farbe=blau`), nie
// als Farbwert. Zugelassen sind genau die acht Farben, die das Programm bei
// den Reiter-Gruppen und Arbeitsbereichen schon führt; jeder Name zeigt auf
// deren stabilen Schlüssel und damit auf ein Paar aus hellem und dunklem Wert
// (CSS-Variablen `--tab-group-<schluessel>`). Ein von Hand gewählter Farbwert
// wäre im jeweils anderen Erscheinungsbild oft unlesbar und ist deshalb
// ausgeschlossen (Konzept, Entscheidung E4).
//
// Die Namen sind deutsch, weil sie im Dokument stehen und dort gelesen und
// getippt werden — wie die Anschluss-Seiten darüber. Die Abbildung auf den
// Theme-Schlüssel gehört hierher und nicht in die Zeichnung, damit Ansicht und
// Bedienung denselben Satz lesen statt ihn zu verdoppeln.
//
// 4T-001700: Seit der Entscheidung F1 vom 2026-09-12 lesen auch `rand` und
// `füllung` einer Form sowie `farbe` einer Gruppe aus **diesem** Satz. Der Name
// der Konstanten bleibt, weil er ihre Herkunft trägt und an ihm die
// Zeichnung, die Leiste und ein Wächter hängen; ein zweiter Farb-Satz wäre der
// Fehler, den G3 bei der Stapel-Reihenfolge aus demselben Grund vermeidet.
const LINIEN_FARBEN = {
  blau: 'blue',
  rot: 'red',
  grün: 'green',
  gelb: 'yellow',
  lila: 'purple',
  orange: 'orange',
  türkis: 'cyan',
  pink: 'pink',
};

const LINIEN_FARB_NAMEN = Object.keys(LINIEN_FARBEN);

// 4T-001655 (Befund 2 des Product Owners vom 2026-09-10, «Es soll auch die
// Möglichkeit geben, einen Pfeil in beide Richtungen zu zeichnen»): Die
// Richtung einer Verbindung kennt seither **drei** Formen statt zwei.
//
// **Warum ein eigenes Feld `richtung` und nicht ein zweiter Wahrheitswert.**
// Zwei Wahrheitswerte nebeneinander (`gerichtet`, `rueckwaerts`) hätten vier
// Zustände beschrieben, von denen die Grammatik nur drei kennt; der vierte
// wäre stumm geblieben und irgendwann doch geschrieben worden. Der
// abgeleitete `gerichtet` bleibt daneben stehen, weil Zeichnung und Bedienung
// ihn führen und ein Element ohne `richtung` — etwa aus einem älteren
// Programmstand im Speicher — weiterhin richtig geschrieben werden muss.
const RICHTUNG_ZU_PFEIL = { vor: '->', beide: '<->', keine: '--' };
const PFEIL_ZU_RICHTUNG = { '->': 'vor', '<->': 'beide', '--': 'keine' };

// Reihenfolge des Umschalters an der Leiste und im Kontextmenü: vor, beide,
// keine, wieder vor. Sie steht hier und nicht in der Bedienung, damit der
// Kreis dieselbe Folge nimmt wie die Grammatik sie aufzählt.
const LINIEN_RICHTUNGEN = ['vor', 'beide', 'keine'];

// Eine Marker-Zeile beginnt in Spalte 0 mit `!`, gefolgt von einem Wort.
const MARKER_ZEILE_RE = /^!([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*))?$/;

// --- Zeilen-Werkzeug ----------------------------------------------------------
//
// Zeilen werden ausschließlich an `\n` getrennt und ein etwaiges `\r` bleibt
// **am Zeilenende stehen**. Der bequeme Weg über /\r?\n/ mit späterem Join
// auf '\n' würde eine Datei mit CRLF beim ersten Speichern vollständig
// umschreiben — und genau das verbietet AK3.
function trenneZeilen(text) {
  return String(text == null ? '' : text).split('\n');
}

// Zeilen-Inhalt ohne das Trenn-Artefakt, für alles Parsende.
function ohneCr(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

// Vorherrschendes Zeilenende, damit neu erzeugte Zeilen zum Bestand passen.
function ermittleZeilenende(zeilen) {
  const mitCr = zeilen.filter((z) => z.endsWith('\r')).length;
  return mitCr > 0 && mitCr * 2 >= zeilen.length ? '\r\n' : '\n';
}

// --- Notausgang für zeilenführende Marker -------------------------------------
//
// Gelesen: `\!…` wird zu `!…`, `\\!…` zu `\!…`. Geschrieben: eine
// Inhalts-Zeile, die auf `\`* + `!` passt, bekommt genau einen Rückstrich
// davor. Der Entwurf des Konzepts nannte allein `\!`; damit wäre eine
// Inhalts-Zeile, die literal `\!` lauten soll, nicht ablegbar gewesen. Die
// Verallgemeinerung schließt die Lücke und bleibt umkehrbar.
const ESCAPE_RE = /^\\+!/;

function entschuetze(zeile) {
  return ESCAPE_RE.test(zeile) ? zeile.slice(1) : zeile;
}

function schuetze(zeile) {
  return /^\\*!/.test(zeile) ? '\\' + zeile : zeile;
}

// --- Attribut-Grammatik --------------------------------------------------------
//
// Ein Wert ist entweder ein Wort ohne Leerraum oder eine Zeichenkette in
// doppelten Anführungszeichen mit `\"` und `\\` als Escapes.
function tokenisiere(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    let tok = '';
    let inQuote = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQuote) {
        if (ch === '\\' && i + 1 < text.length) {
          tok += ch + text[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inQuote = false;
        tok += ch;
        i++;
        continue;
      }
      if (/\s/.test(ch)) break;
      if (ch === '"') inQuote = true;
      tok += ch;
      i++;
    }
    tokens.push(tok);
  }
  return tokens;
}

function entpackeWert(roh) {
  if (roh.length >= 2 && roh.startsWith('"') && roh.endsWith('"')) {
    return roh.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return roh;
}

// 4T-001746: `immerQuoten` erzwingt die Anführungszeichen auch dort, wo der
// Wert sie technisch nicht bräuchte. Die beiden Verweis-Angaben der Karte (G7,
// G8) stehen **immer** in doppelten Anführungszeichen — so schreibt sie das
// Konzept-Dokument, so liest sich ein Ziel als Ziel und nicht als Wort, und ein
// Ziel mit Leerzeichen sieht in der Datei nicht anders aus als eines ohne.
// Gelesen wird beides unverändert; die Zusage berührt allein die kanonische
// Form und damit nur geänderte und neue Elemente (G2).
function packeWert(wert, { immerQuoten = false } = {}) {
  const text = String(wert == null ? '' : wert);
  if (!immerQuoten && text !== '' && !/[\s"\\=]/.test(text)) return text;
  return '"' + text.replace(/([\\"])/g, '\\$1') + '"';
}

// Ganze Zahl mit optionalem Vorzeichen; alles andere ist ein Befund.
function alsGanzzahl(text) {
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

// --- Lesen ---------------------------------------------------------------------

function neuesElement(art, zeile) {
  return {
    art,
    id: null,
    attrs: {},
    attrFolge: [],
    inhalt: '',
    roh: { marker: '', inhalt: [] },
    geaendert: false,
    zeile,
  };
}

// Zerlegt die Marker-Zeile eines bekannten Elements in Stellungs-Operanden und
// Attribute. Unbekannte Attribute landen mit in `attrs` — das ist AK4.
function lesMarkerAngaben(el, rest, zeilenNr, errors) {
  const operanden = [];
  for (const tok of tokenisiere(rest || '')) {
    const gleich = tok.indexOf('=');
    if (gleich > 0 && !tok.slice(0, gleich).includes('"')) {
      const name = tok.slice(0, gleich);
      if (!el.attrFolge.includes(name)) el.attrFolge.push(name);
      el.attrs[name] = entpackeWert(tok.slice(gleich + 1));
      continue;
    }
    operanden.push(tok);
  }
  el.id = operanden.shift() || null;
  if (!el.id || !ID_RE.test(el.id)) {
    errors.push({ code: 'fehlendeKennung', zeile: zeilenNr, detail: el.art });
  }
  return operanden;
}

// Lage und Größe eines Elements auf der Fläche — für Karte, Form und Gruppe
// dieselbe Rechnung und dieselben Befunde.
function lesLage(el, zeilenNr, errors) {
  for (const name of LAGE_ZAHLEN) {
    const wert = alsGanzzahl(el.attrs[name] == null ? '' : el.attrs[name]);
    if (wert === null) {
      errors.push({ code: 'ungueltigeZahl', zeile: zeilenNr, detail: name });
      el[name] = 0;
      continue;
    }
    el[name] = wert;
  }
}

/**
 * Farb-Angabe eines Elements: gültiger Name oder Befund.
 *
 * Ein Name außerhalb des Satzes ist **kein** Grund zum Verwerfen (6.3): Das
 * Element bleibt stehen, wird in der Standardfarbe gezeichnet, und sein Rohtext
 * kommt beim nächsten Speichern zeichengenau zurück (G1/G2). Nur eine gültige
 * Angabe wird durchgereicht — die Zeichnung soll nicht ein zweites Mal prüfen
 * müssen, was hier schon geprüft ist.
 *
 * @returns {string|undefined} der Name, wenn er im Satz steht, sonst nichts.
 */
function lesFarbAngabe(el, name, zeilenNr, errors) {
  const wert = el.attrs[name];
  if (wert == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(LINIEN_FARBEN, wert)) return wert;
  errors.push({ code: 'ungueltigeFarbe', zeile: zeilenNr, detail: wert });
  return undefined;
}

/**
 * Verweis-Angabe einer Karte: nicht-leerer Wert oder Befund (4T-001746).
 *
 * Ein **leerer** Wert (`doc=""`, `bild=""` oder nur Leerraum) ist ein Befund
 * nach 6.3 und **kein** Grund zum Verwerfen: Die Karte bleibt stehen und
 * verhält sich wie eine Karte ohne diese Angabe — sie zeigt ihren eigenen Text.
 * Ihr Rohtext kommt beim nächsten Speichern zeichengenau zurück (G1/G2).
 *
 * Getrimmt wird nur für die **Prüfung**, nie für den Wert: Ob ein Ziel mit
 * Leerraum am Rand auflösbar ist, entscheidet der Auflöser und nicht der Kern,
 * und ein stillschweigend geänderter Wert wäre eine Änderung am Dokument.
 *
 * @returns {string|undefined} der Wert, wenn einer dasteht, sonst nichts.
 */
function lesVerweisAngabe(el, name, zeilenNr, errors) {
  const wert = el.attrs[name];
  if (wert == null) return undefined;
  if (String(wert).trim() === '') {
    errors.push({ code: 'leererVerweis', zeile: zeilenNr, detail: name });
    return undefined;
  }
  return wert;
}

/**
 * G7 und G8: Lage, Größe und die beiden Verweis-Angaben der Karte.
 *
 * **Die Existenz eines Ziels prüft der Kern nicht.** Er ist prozessneutral und
 * kennt keine Dateien; ein nicht auflösbares Ziel ist ein Befund des
 * Renderer-Pfads (4T-001747, 4T-001748). Hier fällt allein die Form auf.
 *
 * **Genau ein Befund je Karte, und in dieser Reihenfolge.** Stehen beide
 * Angaben da, gewinnt `doc=`, und das Bild ist damit vollständig unbeachtet —
 * seine Endung ist dann keine Frage mehr, die noch jemanden beträfe. Die
 * Angaben selbst bleiben in `attrs` und in der Datei stehen (G1/G2).
 */
function lesKarte(el, zeilenNr, errors) {
  lesLage(el, zeilenNr, errors);
  const doc = lesVerweisAngabe(el, 'doc', zeilenNr, errors);
  let bild = lesVerweisAngabe(el, 'bild', zeilenNr, errors);
  if (doc !== undefined && bild !== undefined) {
    errors.push({ code: 'doppelterVerweis', zeile: zeilenNr, detail: 'bild' });
    bild = undefined;
  } else if (bild !== undefined && !istBildDatei(bild)) {
    errors.push({ code: 'ungueltigeBildEndung', zeile: zeilenNr, detail: bild });
    bild = undefined;
  }
  el.doc = doc;
  el.bild = bild;
}

// G5: Art, Randfarbe und Füllfarbe der Form. Die Beschriftung sind die
// Inhalts-Zeilen und braucht hier nichts.
function lesForm(el, zeilenNr, errors) {
  lesLage(el, zeilenNr, errors);
  const art = el.attrs.art;
  // **Warum `formArt` und nicht `art`:** `el.art` trägt bereits die
  // Element-Art ('form'). Und warum das Merkmal `artUnbekannt` daneben steht:
  // Der Rohtext der Angabe bleibt in `attrs.art` erhalten und wird auch bei
  // einer Änderung des Elements unverändert zurückgeschrieben (G1); die
  // Zeichnung braucht daneben eine Art, die sie kennt.
  el.artUnbekannt = art != null && !FORM_ARTEN.includes(art);
  if (el.artUnbekannt) {
    errors.push({ code: 'ungueltigeArt', zeile: zeilenNr, detail: art });
  }
  el.formArt = el.artUnbekannt || art == null ? FORM_ART_VORGABE : art;
  el.rand = lesFarbAngabe(el, 'rand', zeilenNr, errors);
  // `füllung=keine` und eine fehlende Angabe sind dieselbe Aussage und werden
  // deshalb auf dieselbe Abwesenheit abgebildet; erfunden wird kein Wert.
  el.fuellung =
    el.attrs['füllung'] === FUELLUNG_KEINE
      ? undefined
      : lesFarbAngabe(el, 'füllung', zeilenNr, errors);
}

// G6: Die Gruppe ist ein beschriftetes Rechteck mit optionaler Farbe. Eine
// Mitglieder-Liste gibt es bewusst nicht — Mitglied ist, was geometrisch darin
// liegt; eine zweite Quelle derselben Aussage könnte auseinanderlaufen.
function lesGruppe(el, zeilenNr, errors) {
  lesLage(el, zeilenNr, errors);
  el.farbe = lesFarbAngabe(el, 'farbe', zeilenNr, errors);
}

/**
 * Richtung eines Linien-Elements, auch wenn es das Feld nicht trägt.
 *
 * Der Rückfall auf `gerichtet` ist kein Zierrat: Ein Element kann aus einem
 * Programmteil stammen, der vor Befund 2 geschrieben wurde und nur den
 * Wahrheitswert setzt. Es wäre dann `keine` statt `vor` geschrieben worden —
 * eine stille Änderung am Dokument des Anwenders.
 */
function linienRichtung(el) {
  if (el && Object.prototype.hasOwnProperty.call(RICHTUNG_ZU_PFEIL, el.richtung)) {
    return el.richtung;
  }
  return el && el.gerichtet === false ? 'keine' : 'vor';
}

function lesLinie(el, operanden, zeilenNr, errors) {
  const [von, pfeil, nach] = operanden;
  const richtung = PFEIL_ZU_RICHTUNG[pfeil];
  if (!richtung) {
    errors.push({ code: 'ungueltigerPfeil', zeile: zeilenNr, detail: pfeil || '' });
  }
  // Ein unbekannter Pfeil bleibt ein Befund und wird als `vor` gelesen — wie
  // vor Befund 2, damit sich an einer defekten Zeile nichts ändert.
  el.richtung = richtung || 'vor';
  // Abgeleitet und nicht selbst geführt: `gerichtet` sagt, ob überhaupt eine
  // Spitze steht, und beantwortet damit genau die Frage, die die Zeichnung
  // seit jeher stellt.
  el.gerichtet = el.richtung !== 'keine';
  el.von = von || null;
  el.nach = nach || null;
  if (!el.von || !el.nach) {
    errors.push({ code: 'fehlendesEnde', zeile: zeilenNr, detail: el.id || '' });
  }
  for (const seite of ['von', 'nach']) {
    const wert = el.attrs[seite];
    if (wert != null && !SEITEN.has(wert)) {
      errors.push({ code: 'ungueltigeSeite', zeile: zeilenNr, detail: wert });
    }
  }
  // 4T-001655: Die Farbe ist eine bekannte Angabe der Verbindung; die Prüfung
  // teilt sie sich seit 4T-001700 mit Form und Gruppe (siehe `lesFarbAngabe`).
  el.farbe = lesFarbAngabe(el, 'farbe', zeilenNr, errors);
}

/**
 * Liest den Rumpf einer Fence in ein Modell. Wirft nie.
 *
 * @param {string} inhalt Rumpf der Fence ohne die Zaun-Zeilen.
 * @param {object} [optionen]
 * @param {Set<string>} [optionen.bekannteMarker] Die Marker, die dieser Leser
 *   kennt; alles andere fällt unter G1. Der Vorgabewert ist der volle Satz.
 *
 *   **Warum das überhaupt wählbar ist** (4T-001700): G1 ist eine Zusage über
 *   **ältere** Programmfassungen — sie sollen Formen und Gruppen mitführen,
 *   statt sie beim Speichern zu verlieren. Ohne einen Weg, einen solchen Leser
 *   herzustellen, ließe sich die Zusage nur behaupten und nie prüfen. Der
 *   Prüffall setzt hier den Satz der Stufe 1 ein und bekommt damit **denselben
 *   Code** mit dem Wissensstand von damals.
 * @returns {object} Modell mit `elemente`, `errors`, `praeambel`, `zeilenende`.
 */
function parseCanvasFence(inhalt, optionen = {}) {
  const bekannte = optionen.bekannteMarker instanceof Set ? optionen.bekannteMarker : MARKER_ARTEN;
  const zeilen = trenneZeilen(inhalt);
  const model = {
    elemente: [],
    errors: [],
    praeambel: [],
    zeilenende: ermittleZeilenende(zeilen),
  };
  let aktuell = null;

  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i];
    const text = ohneCr(roh);
    const zeilenNr = i + 1;

    if (!text.startsWith('!')) {
      if (aktuell) aktuell.roh.inhalt.push(roh);
      else if (text.trim() === '') model.praeambel.push(roh);
      else {
        model.errors.push({ code: 'inhaltVorMarker', zeile: zeilenNr, detail: text });
        model.praeambel.push(roh);
      }
      continue;
    }

    const treffer = MARKER_ZEILE_RE.exec(text);
    const art = treffer && bekannte.has(treffer[1]) ? treffer[1] : 'unbekannt';
    aktuell = neuesElement(art, zeilenNr);
    aktuell.roh.marker = roh;
    model.elemente.push(aktuell);

    if (!treffer) {
      model.errors.push({ code: 'defekteMarkerZeile', zeile: zeilenNr, detail: text });
      continue;
    }
    if (art === 'unbekannt') {
      aktuell.marker = treffer[1];
      model.errors.push({ code: 'unbekannterMarker', zeile: zeilenNr, detail: treffer[1] });
      continue;
    }

    const operanden = lesMarkerAngaben(aktuell, treffer[2], zeilenNr, model.errors);
    if (art === 'karte') lesKarte(aktuell, zeilenNr, model.errors);
    else if (art === 'form') lesForm(aktuell, zeilenNr, model.errors);
    else if (art === 'gruppe') lesGruppe(aktuell, zeilenNr, model.errors);
    else lesLinie(aktuell, operanden, zeilenNr, model.errors);
  }

  for (const el of model.elemente) {
    el.inhalt = el.roh.inhalt.map((z) => entschuetze(ohneCr(z))).join('\n');
  }
  pruefeBezuege(model);
  return model;
}

// Doppelte Kennungen und ins Leere zeigende Verbindungen sind Befunde, nie
// ein Grund zum Verwerfen: Eine Verbindung auf eine soeben gelöschte Karte
// muss die Datei überleben, sonst verlöre ein Rückgängig seine Grundlage.
function pruefeBezuege(model) {
  const gesehen = new Set();
  const karten = new Set();
  for (const el of model.elemente) {
    if (!el.id) continue;
    if (gesehen.has(el.id)) {
      model.errors.push({ code: 'doppelteKennung', zeile: el.zeile, detail: el.id });
    }
    gesehen.add(el.id);
    if (el.art === 'karte') karten.add(el.id);
  }
  for (const el of model.elemente) {
    if (el.art !== 'linie') continue;
    for (const ende of [el.von, el.nach]) {
      if (ende && !karten.has(ende)) {
        model.errors.push({ code: 'unbekanntesEnde', zeile: el.zeile, detail: ende });
      }
    }
  }
}

// --- Schreiben -----------------------------------------------------------------

function baueMarkerZeile(el) {
  const teile = ['!' + (el.art === 'unbekannt' ? el.marker || 'unbekannt' : el.art)];
  if (el.id) teile.push(el.id);
  if (el.art === 'linie') {
    teile.push(el.von || '', RICHTUNG_ZU_PFEIL[linienRichtung(el)], el.nach || '');
  }
  // Lage, Größe und — seit 4T-001746 — die beiden Verweis-Angaben der Karte
  // kommen aus dem Element und nicht aus `attrs`, weil eine Bedien-Handlung sie
  // dort ändert; alles Übrige — auch jede unbekannte Angabe — steht in `attrs`
  // und behält seine Reihenfolge (G1).
  //
  // Eine Angabe, die das Element **nicht** trägt, fällt über `wert == null`
  // heraus: So verschwindet ein entfernter Verweis aus der geschriebenen Zeile,
  // ohne dass der Schreiber eine zweite Regel dafür bräuchte.
  const mitLage = STAPEL_ARTEN.has(el.art);
  const gefuehrt = mitLage
    ? el.art === 'karte'
      ? [...LAGE_ZAHLEN, ...KARTEN_VERWEISE]
      : LAGE_ZAHLEN
    : [];
  const genannt = new Set(el.attrFolge);
  const namen = gefuehrt.filter((n) => !genannt.has(n));
  for (const name of [...el.attrFolge, ...namen]) {
    const ausElement = gefuehrt.includes(name);
    // Der geführte Wert gewinnt; fehlt er, steht der **Rohtext** der Angabe
    // weiterhin in `attrs` und geht unverändert hinaus. Das ist derselbe Weg,
    // auf dem eine unbekannte Form-Art und ein unbekannter Farbname das
    // kanonische Schreiben überleben: Ein defekter Wert — `doc=""`, eine
    // unzulässige Bild-Endung — darf nicht dadurch verschwinden, dass jemand
    // die Karte verschiebt.
    const wert = ausElement && el[name] !== undefined ? el[name] : el.attrs[name];
    if (wert == null) continue;
    const quoten = ausElement && KARTEN_VERWEISE.includes(name);
    teile.push(name + '=' + packeWert(wert, { immerQuoten: quoten }));
  }
  return teile.filter((t) => t !== '').join(' ');
}

// Schreibt ein Modell zurück. Unveränderte Elemente wörtlich (G2), geänderte
// und neue in kanonischer Form.
function serializeCanvasFence(model) {
  const ende = model.zeilenende || '\n';
  const zeilen = [...(model.praeambel || [])];
  for (const el of model.elemente || []) {
    if (!el.geaendert && el.roh && el.roh.marker) {
      zeilen.push(el.roh.marker, ...el.roh.inhalt);
      continue;
    }
    zeilen.push(baueMarkerZeile(el) + (ende === '\r\n' ? '\r' : ''));
    if (el.inhalt !== '') {
      for (const z of String(el.inhalt).split('\n')) {
        zeilen.push(schuetze(z) + (ende === '\r\n' ? '\r' : ''));
      }
    }
  }
  return zeilen.join('\n');
}

// --- Fences im Dokument ---------------------------------------------------------

// Muster findPerspectiveEventsFences: tolerant gegenüber Zaun-Länge und
// Zaun-Zeichen, und eine nicht geschlossene Fence reicht bis zum Datei-Ende.
function findCanvasFences(text) {
  const zeilen = trenneZeilen(text).map(ohneCr);
  const treffer = [];
  let offen = null;
  for (let i = 0; i < zeilen.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(zeilen[i]);
    if (!m) continue;
    const zeichen = m[1][0];
    const laenge = m[1].length;
    const info = m[2].trim();
    if (offen) {
      if (zeichen === offen.zeichen && laenge >= offen.laenge && info === '') {
        if (offen.sprache === 'perspective-canvas') {
          treffer.push({
            startZeile: offen.startZeile,
            endeZeile: i + 1,
            rumpf: zeilen.slice(offen.startZeile, i).join('\n'),
          });
        }
        offen = null;
      }
      continue;
    }
    if (zeichen === '`' && info.includes('`')) continue;
    offen = { zeichen, laenge, sprache: info.split(/\s+/)[0], startZeile: i + 1 };
  }
  if (offen && offen.sprache === 'perspective-canvas') {
    treffer.push({
      startZeile: offen.startZeile,
      endeZeile: zeilen.length + 1,
      rumpf: zeilen.slice(offen.startZeile).join('\n'),
    });
  }
  return treffer;
}

// E2: Ein Dokument ist eine Canvas, wenn es eine solche Fence enthält — kein
// zusätzliches Merkmal im Frontmatter.
//
// 4T-001653: Der Vorfilter ist keine Optimierung auf Verdacht. Seit der
// Anordnung des Product Owners vom 2026-09-09, dass der Ansichts-Modus nur
// bei vorhandener Fläche auswählbar ist, läuft diese Frage bei **jedem**
// Reiter- und Modus-Wechsel — und in aller Regel über ein Dokument ohne
// Fence. Gemessen an 920 kB kostet der volle Zeilen-Scan 1,3 ms, der
// Vorfilter rund ein Zehntel davon; wo die Zeichenkette gar nicht vorkommt,
// kann es auch keine solche Fence geben.
function istCanvasDokument(text) {
  if (typeof text !== 'string' || !text.includes('perspective-canvas')) return false;
  return findCanvasFences(text).length > 0;
}

// 4T-001677 (Epic 3E-000287): Beschriftung einer Fläche, abgeleitet statt
// angegeben.
//
// **Warum abgeleitet.** Ein Dokument kann mehrere Flächen tragen, und die
// Reiter, die sie erreichbar machen, brauchen einen Namen. Eine ausdrückliche
// Angabe an der Fence wäre eine Erweiterung des Speicherformats und damit eine
// Entscheidung des Product Owners; die Ableitung kommt ohne sie aus. Sie
// nimmt die erste sinnvolle Zeile der ersten Karte — meist deren Überschrift,
// und damit genau das, was der Anwender als Titel der Fläche liest.
//
// Der Rückfall ist bewusst leer statt erfunden: Wer keinen Text hat, bekommt
// keinen ausgedachten. Die Zählung («Fläche 2») ist Sache der Anzeige, weil
// sie lokalisiert werden muss und der Kern keine Sprache kennt.
function canvasFlaechenTitel(model) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  const erste = elemente.find((el) => el.art === 'karte');
  if (!erste) return '';
  const zeile = ersteInhaltsZeile(erste);
  if (zeile !== '') return zeile;
  // 4T-001746: Eine Verweis- oder Bild-Karte ohne Beschriftung hat trotzdem
  // etwas zu sagen — ihr Ziel. Der Rückfall bleibt darunter leer, weil eine
  // erfundene Bezeichnung nichts benennt.
  return kartenVerweisText(erste);
}

/**
 * Die erste sinnvolle Zeile der Inhalts-Zeilen eines Elements (4T-001769).
 *
 * Eigene Funktion, seit die Karten-Liste dieselbe Frage für **jede**
 * Element-Art stellt: Beim Karten-Text ist es die Beschriftung, bei Form und
 * Gruppe die Beschriftung nach G5 und G6, bei der Verbindung ihre Beschriftung.
 * Die Flächen-Beschriftung stellte sie zuvor als eigene Schleife; eine zweite
 * Kopie derselben Regel liefe bei der nächsten Ergänzung auseinander.
 *
 * @param {object} el beliebiges Element des Modells.
 * @returns {string} leer, wenn das Element keine sinnvolle Zeile trägt.
 */
function ersteInhaltsZeile(el) {
  for (const zeile of String((el && el.inhalt) || '').split('\n')) {
    const text = bereinigeZeile(zeile);
    if (text !== '') return text;
  }
  return '';
}

/**
 * Der Text, mit dem eine Karte ohne eigene Beschriftung benennbar bleibt
 * (4T-001746): bei einer Verweis-Karte ihr Ziel, bei einer Bild-Karte der Name
 * des Bildes.
 *
 * **Warum das Ziel ganz und das Bild nur mit seinem Namen erscheint:** Beim
 * Dokument-Ziel trägt der Anker die Aussage — «Import.md#Zielbild» sagt etwas
 * anderes als «Import.md» —, und der Pfad unterscheidet gleichnamige
 * Dokumente. Ein Bild wird dagegen im Bereich über seinen **Namen** gefunden
 * (Namens-Suche wie bei `![[bild.png]]`); sein Ordner ist Ablage und keine
 * Aussage. Was eine Anzeige daraus macht, bleibt ihre Sache — gekürzt wird
 * hier nichts.
 *
 * @param {object} el Element der Art `karte`.
 * @returns {string} leer, wenn die Karte auf nichts zeigt.
 */
function kartenVerweisText(el) {
  if (!el) return '';
  if (el.doc) return String(el.doc);
  if (el.bild) return String(el.bild).split(/[/\\]/).pop();
  return '';
}

// Überschrift-Zeichen und Aufzählungs-Striche gehören zur Markdown-Syntax und
// nicht zum Titel. Eigene Funktion seit 4T-001668, weil die Karten-Vorschau
// des Blocks dieselbe Bereinigung braucht — und eine zweite Kopie der Regel
// bei der nächsten Ergänzung auseinanderliefe.
function bereinigeZeile(zeile) {
  return String(zeile == null ? '' : zeile)
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .trim();
}

// 4T-001668 (Epic 3E-000287): Die zwei Zeilen, mit denen eine Karte in der
// gedeckelten Vorschau des Blocks außerhalb der Canvas-Ansicht erscheint.
//
// **Die Titel-Regel ist eine andere als die der Flächen-Beschriftung** und
// deshalb eine eigene Funktion: Dort zählt die erste sinnvolle Zeile, hier hat
// eine **Überschrift** Vorrang vor ihr. Grund ist der Zweck: Die Beschriftung
// eines Reiters braucht irgendeinen Namen, die Vorschau will die Gliederung
// der Karte zeigen — und wer seine Karte mit einer Überschrift beginnt, hat
// den Titel bereits ausgewiesen, auch wenn Fließtext davorsteht.
//
// Die zweite Zeile ist die erste nicht-leere **nach** der Titel-Zeile. Gekürzt
// wird hier nichts: Wie lang eine Zeile in der Anzeige sein darf, weiß die
// Anzeige und nicht der Kern.
//
// @param {object} el Element der Art `karte`.
// @returns {{titel: string, zeile: string}}
function canvasKartenVorschau(el) {
  const zeilen = String((el && el.inhalt) || '').split('\n');
  let titelIndex = -1;
  let titel = '';
  for (let i = 0; i < zeilen.length; i++) {
    if (!/^\s*#{1,6}\s+\S/.test(zeilen[i])) continue;
    titelIndex = i;
    titel = bereinigeZeile(zeilen[i]);
    break;
  }
  if (titelIndex < 0) {
    for (let i = 0; i < zeilen.length; i++) {
      const text = bereinigeZeile(zeilen[i]);
      if (text === '') continue;
      titelIndex = i;
      titel = text;
      break;
    }
  }
  let zeile = '';
  for (let i = titelIndex + 1; titelIndex >= 0 && i < zeilen.length; i++) {
    const text = bereinigeZeile(zeilen[i]);
    if (text === '') continue;
    zeile = text;
    break;
  }
  // 4T-001746: Eine Verweis- oder Bild-Karte ohne Beschriftung fiele sonst als
  // leere Zeile in die Vorschau. Ihr Ziel tritt an die Stelle des Titels — und
  // nur dorthin: Wo eine Beschriftung dasteht, ist sie der Titel, weil der
  // Anwender sie genau dafür geschrieben hat.
  if (titel === '') titel = kartenVerweisText(el);
  return { titel, zeile };
}

// 4T-001668: Umfang einer Fläche in Karten, Verbindungen und Befunden — die
// Zahlen der Kopfzeile des Blocks. Sie stehen hier, damit weder die Pipeline
// noch die Mindmap die Element-Arten selbst abzählt.
//
// 4T-001700: Formen und Gruppen kommen hinzu (Entscheidung E8, fortgeschrieben
// am 2026-09-12). Wer sie anzeigt, entscheidet die Anzeige — der Kern zählt.
//
// 4T-001746: Die Stufe 3 bringt **keine** neue Zahl. Eine Verweis-Karte und
// eine Bild-Karte sind Karten und gehen in dieselbe Karten-Zahl ein; der
// Verweis ist eine Eigenschaft der Karte und keine Art neben ihr. Der Ausbau
// nach dem Muster von Formen und Gruppen wäre hier der Fehler, weil er eine
// Unterscheidung behauptete, die es im Modell nicht gibt.
function canvasUmfang(model) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  const zaehle = (art) => elemente.filter((el) => el.art === art).length;
  return {
    karten: zaehle('karte'),
    linien: zaehle('linie'),
    formen: zaehle('form'),
    gruppen: zaehle('gruppe'),
    befunde: model && Array.isArray(model.errors) ? model.errors.length : 0,
  };
}

/**
 * Die Verbindungen an einer Karte, mit Gegenstelle und Richtung (4T-001769).
 *
 * **Ein Filter über die Element-Liste und keine Abfrage des Modells:** Eine
 * Zuordnung «Verbindungen dieser Karte» gibt es im Kern nicht, und sie soll es
 * auch nicht geben — sie wäre eine zweite Quelle derselben Aussage, die bei
 * jedem Anlegen und Löschen nachgeführt werden müsste (dieselbe Begründung, mit
 * der G6 der Gruppe ihre Mitglieder-Liste verweigert).
 *
 * Eine Verbindung auf sich selbst erscheint **einmal** und gilt als ausgehend;
 * zwei Zeilen für dieselbe Linie wären in der Liste eine Dublette.
 *
 * @param {object} karte Element der Art `karte`.
 * @param {Array<object>} linien die Linien-Elemente der Fläche.
 * @returns {Array<object>} je Verbindung `{id, richtung, ausgehend, gegenstelle, text}`.
 */
function verbindungenAn(karte, linien) {
  const treffer = [];
  for (const linie of linien) {
    const ausgehend = !!karte.id && linie.von === karte.id;
    const eingehend = !!karte.id && linie.nach === karte.id;
    if (!ausgehend && !eingehend) continue;
    treffer.push({
      id: linie.id || '',
      richtung: linienRichtung(linie),
      ausgehend,
      gegenstelle: (ausgehend ? linie.nach : linie.von) || '',
      text: ersteInhaltsZeile(linie),
    });
  }
  return treffer;
}

/**
 * Die Fläche als Liste — die zweite Ansicht desselben Modells (4T-001769).
 *
 * Geliefert werden **alle** Elemente der Stapel-Ebene in der Reihenfolge der
 * Fence (Entscheidung F2 des Product Owners vom 2026-09-15): Karten, Formen und
 * Gruppen. Diese Reihenfolge **ist** die Stapel-Reihenfolge (G3) — wer die
 * Liste liest, sieht damit zugleich, was vorn und was hinten liegt; eine zweite
 * Anzeige der Reihenfolge braucht es nicht.
 *
 * **Verbindungen stehen nicht in der Liste, sondern an ihren Karten.** Sie sind
 * eine eigene Ebene ohne eigene Lage (E4) und hätten in einer Stapel-Liste
 * keinen Platz; unter der Karte dagegen beantworten sie genau die Frage, die
 * der Anwender an ihr stellt.
 *
 * Prozessneutral wie der übrige Kern: kein DOM, keine Datei, keine Sprache. Was
 * eine Anzeige aus den Feldern macht — Symbol der Art, Kürzung eines langen
 * Textes, Übersetzung eines Richtungs-Namens —, bleibt ihre Sache.
 *
 * @param {object} model Modell einer Fläche aus `parseCanvasFence`.
 * @returns {Array<object>} je Element `{art, id, text, ziel, formArt, verbindungen}`.
 */
function canvasListe(model) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  const linien = elemente.filter((el) => el.art === 'linie');
  return elemente
    .filter((el) => STAPEL_ARTEN.has(el.art))
    .map((el) => ({
      art: el.art,
      id: el.id || '',
      // Die Karte hat ihre eigene Titel-Regel (Überschrift vor Fließzeile), und
      // sie steht bereits in der Vorschau des Blocks; Form und Gruppe tragen
      // ihre Beschriftung als Inhalts-Zeilen.
      text: el.art === 'karte' ? canvasKartenVorschau(el).titel : ersteInhaltsZeile(el),
      // 4T-001746: Worauf eine Karte zeigt, gehört in ihre Zeile — auch dann,
      // wenn sie zusätzlich eine eigene Beschriftung trägt.
      ziel: el.art === 'karte' ? kartenVerweisText(el) : '',
      // Eine Form ohne Beschriftung ist sonst eine leere Zeile; ihre Art ist
      // das, was sie benennbar macht.
      formArt: el.art === 'form' ? el.formArt || FORM_ART_VORGABE : '',
      verbindungen: el.art === 'karte' ? verbindungenAn(el, linien) : [],
    }));
}

// Die Zaun-Länge bestimmt der Schreibweg, weil der Karten-Inhalt beliebiges
// Markdown ist und selbst Code-Blöcke tragen darf. Drei Rückstriche genügen
// nur, solange der Rumpf keine längere Folge enthält.
function canvasFenceBlock(rumpf) {
  let laengste = 0;
  for (const m of String(rumpf == null ? '' : rumpf).matchAll(/`{3,}/g)) {
    laengste = Math.max(laengste, m[0].length);
  }
  const zaun = '`'.repeat(Math.max(3, laengste + 1));
  return zaun + 'perspective-canvas\n' + rumpf + '\n' + zaun;
}

module.exports = {
  CANVAS_EXTENSION_ID,
  ID_RE,
  MARKER_ARTEN,
  STAPEL_ARTEN,
  LAGE_ZAHLEN,
  KARTEN_VERWEISE,
  FORM_ARTEN,
  FORM_ART_VORGABE,
  FUELLUNG_KEINE,
  SEITEN,
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
  LINIEN_RICHTUNGEN,
  linienRichtung,
  parseCanvasFence,
  serializeCanvasFence,
  findCanvasFences,
  istCanvasDokument,
  canvasFenceBlock,
  canvasFlaechenTitel,
  canvasKartenVorschau,
  kartenVerweisText,
  canvasUmfang,
  canvasListe,
};
