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
// **Fehler-Semantik** wie bei den Ereignissen (`events-fence.js`): Ein Befund
// landet in `model.errors` und wird nie geworfen; das betroffene Element
// bleibt erhalten. Ein defektes Element darf die Anzeige stören, aber niemals
// beim nächsten Speichern verschwinden.
'use strict';

// Kennung der Erweiterung. Sie steht hier und nicht im Renderer, weil sie seit
// 4T-001668 auf **beiden** Prozess-Seiten gebraucht wird: `canvas-modus.js`
// fragt sie für die Verfügbarkeit des Ansichts-Modus, die Markdown-Pipeline im
// Preload für die Fence-Regel des Blocks. Zwei Schreibweisen desselben Wortes
// könnten auseinanderlaufen; hier gibt es nur eine.
const CANVAS_EXTENSION_ID = 'canvas';

// Marker der Stufe 1. Die Stufen 2 und 3 ergänzen `gruppe`, `form` und die
// Verweis- und Bild-Angaben der Karte; bis dahin fängt G1 sie auf.
const MARKER_ARTEN = new Set(['karte', 'linie']);

// Kennungen sind bewusst schmal gehalten: Sie stehen unquotiert auf der
// Marker-Zeile und dürfen deshalb kein Leerzeichen und kein Sonderzeichen der
// Attribut-Grammatik tragen.
const ID_RE = /^[A-Za-z0-9_-]+$/;

// Lage und Größe einer Karte in geräteunabhängigen Einheiten (CSS-Pixel bei
// Zoom 1), Ursprung in der Mitte der Fläche. Ganze Zahlen, Lage auch negativ.
const KARTEN_ZAHLEN = ['x', 'y', 'b', 'h'];

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

function packeWert(wert) {
  const text = String(wert == null ? '' : wert);
  if (text !== '' && !/[\s"\\=]/.test(text)) return text;
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

function lesKarte(el, zeilenNr, errors) {
  for (const name of KARTEN_ZAHLEN) {
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
  // 4T-001655: Die Farbe ist eine bekannte Angabe der Verbindung. Ein Name
  // außerhalb des Satzes ist ein Befund und **kein** Grund zum Verwerfen: Die
  // Linie bleibt stehen, wird in der gewohnten Farbe gezeichnet, und ihr
  // Rohtext kommt beim nächsten Speichern zeichengenau zurück (G1/G2). Nur
  // eine gültige Angabe wird als `farbe` durchgereicht — die Zeichnung soll
  // nicht ein zweites Mal prüfen müssen, was hier schon geprüft ist.
  const farbe = el.attrs.farbe;
  if (farbe != null && !Object.prototype.hasOwnProperty.call(LINIEN_FARBEN, farbe)) {
    errors.push({ code: 'ungueltigeFarbe', zeile: zeilenNr, detail: farbe });
    el.farbe = undefined;
    return;
  }
  el.farbe = farbe == null ? undefined : farbe;
}

// Liest den Rumpf einer Fence in ein Modell. Wirft nie.
function parseCanvasFence(inhalt) {
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
    const art = treffer && MARKER_ARTEN.has(treffer[1]) ? treffer[1] : 'unbekannt';
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
  const genannt = new Set(el.attrFolge);
  const namen = el.art === 'karte' ? KARTEN_ZAHLEN.filter((n) => !genannt.has(n)) : [];
  for (const name of [...el.attrFolge, ...namen]) {
    const wert = el.art === 'karte' && KARTEN_ZAHLEN.includes(name) ? el[name] : el.attrs[name];
    if (wert == null) continue;
    teile.push(name + '=' + packeWert(wert));
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
  for (const zeile of String(erste.inhalt || '').split('\n')) {
    const text = bereinigeZeile(zeile);
    if (text !== '') return text;
  }
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
  return { titel, zeile };
}

// 4T-001668: Umfang einer Fläche in Karten, Verbindungen und Befunden — die
// drei Zahlen der Kopfzeile des Blocks. Sie stehen hier, damit weder die
// Pipeline noch die Mindmap die Element-Arten selbst abzählt.
function canvasUmfang(model) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  return {
    karten: elemente.filter((el) => el.art === 'karte').length,
    linien: elemente.filter((el) => el.art === 'linie').length,
    befunde: model && Array.isArray(model.errors) ? model.errors.length : 0,
  };
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
  MARKER_ARTEN,
  KARTEN_ZAHLEN,
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
  canvasUmfang,
};
