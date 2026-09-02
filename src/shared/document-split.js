// 4T-1291 (Epic 3E-0224): Zerlegen eines großen Dokuments beim Speichern.
// Gegenstück zu src/shared/document-assembly.js: Jenes fügt die Teile zu
// einem Dokument zusammen, dieses schneidet ein Dokument in Teile.
//
// Beide Richtungen müssen exakt zueinander passen. Die Umkehr-Eigenschaft
// steht in document-assembly.js: Die Rümpfe werden beim Lesen OHNE
// Trennzeichen aneinandergehängt. Hier wird deshalb vor der Überschriftszeile
// geschnitten und nichts angefügt; das schlichte Aneinanderhängen ergibt den
// Ausgangstext zeichengleich zurück.
//
// Prozessneutral und ohne Datei-Zugriff: Es bekommt den Puffer-Text und die
// vorhandenen Teile und gibt fertige Datei-Inhalte zurück; das Schreiben
// übernimmt der Haupt-Prozess (src/main/documents/document-parts-io.js).
// Electron-frei (CommonJS, Vorbild src/shared/subpages.js).
'use strict';

const { extractFrontmatter } = require('./markdown/frontmatter.js');
const { FENCE_RE } = require('./markdown/link-scan.js');
const { assembleParts } = require('./document-assembly.js');
const {
  buildPartBasename,
  baseBasenameOf,
  writePartLine,
  FIRST_PART_INDEX,
} = require('./document-parts.js');

// Schwellen in Byte (O1/O2, Entscheidung des Product Owners vom 2026-08-29;
// die Auslegung von «MB» als 2^20 am 2026-08-31 bestätigt). Gemessen wird die
// Byte-Größe, nicht die Zeilenzahl: Sie steht beim Lesen kostenlos im
// Verzeichnis-Eintrag, und beim Schreiben ist der Text ohnehin zur Hand.
const DOKUMENT_SCHWELLE = 1024 * 1024; // 1 MB für Dokumente des Anwenders
const ABLAGE_SCHWELLE = Math.round(0.7 * 1024 * 1024); // 0,7 MB für die technische Ablage

// Zulässiger Schnittpunkt (O3): eine Überschrift der obersten ZWEI Ebenen an
// Spalte 0, gefolgt von Leerraum oder Zeilenende.
//
// Die Bedingung «Spalte 0» erledigt die Unteilbarkeits-Regel O4 ohne eigene
// Konstrukt-Erkennung: Eine Überschrift ganz links beendet in Markdown jeden
// Absatz, jede Liste, jede Tabelle und jeden Callout, die davor offen waren.
// Was eingerückt ist (Listen-Unterpunkte) oder mit '>' beginnt (Callouts,
// Zitate), trifft das Muster gar nicht erst. Das ist strenger als CommonMark,
// das bis zu drei führende Leerzeichen erlaubt — und die Strenge ist der Zweck:
// ein Schnitt an einer eingerückten Überschrift läge mitten in einem Konstrukt.
const SCHNITT_RE = /^#{1,2}([ \t]|$)/;

// Byte-Länge eines Textes in UTF-8, ohne Zwischen-Puffer.
//
// Bewusst ohne Buffer und TextEncoder: src/shared/ ist prozessneutral und
// nutzt beides an keiner Stelle; TextEncoder allozierte zudem bei jedem Aufruf
// ein Array in Dokument-Größe — bei genau den Dateien, um die es hier geht.
function byteLength(text) {
  const s = String(text == null ? '' : text);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4; // Surrogat-Paar: zwei Code-Units, vier Byte
      i++;
    } else n += 3;
  }
  return n;
}

// Liegt der Text über der Schwelle?
//
// Der Schnellweg vorn ist der Regelfall und kostet eine Multiplikation: Kein
// Zeichen wird in UTF-8 zu mehr als drei Byte je Code-Unit, ein Text unter
// einem Drittel der Schwelle kann sie also nicht reißen. Erst darüber wird
// wirklich gezählt.
function ueberSchwelle(text, schwelle) {
  const s = String(text == null ? '' : text);
  if (s.length * 3 <= schwelle) return false;
  return byteLength(s) > schwelle;
}

/**
 * Sucht die zulässigen Schnittpunkte eines Dokument-Textes.
 *
 * Liefert eine aufsteigende Liste von { offset, byteOffset }; `offset` ist die
 * Position der Überschriftszeile im Text, an der ein neuer Teil BEGINNT.
 *
 * Ausgeschlossen sind der Frontmatter (er gehört unteilbar zur Kopf-Datei),
 * alles innerhalb eines Code-Zauns (Maske über FENCE_RE aus link-scan.js, also
 * dieselbe Quelle wie Backlinks-Index, Block-Anker und Rewrite-Kern) und der
 * Beginn des Rumpfes selbst — ein Schnitt dort ergäbe einen ersten Teil, der
 * nur aus Frontmatter besteht.
 *
 * Erwartet auf LF normalisierten Text, wie ihn der Schreib-Weg herstellt;
 * jeder Zeilentrenner zählt deshalb genau ein Byte.
 */
function findSplitPoints(text) {
  const s = String(text == null ? '' : text);
  const bodyStart = extractFrontmatter(s).endOffset || 0;
  const zeilen = s.split('\n');
  const punkte = [];
  let offset = 0;
  let byteOffset = 0;
  let imZaun = false;
  let zaunZeichen = null;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    const zaun = zeile.match(FENCE_RE);
    if (zaun) {
      const ch = zaun[1].charAt(0);
      if (!imZaun) {
        imZaun = true;
        zaunZeichen = ch;
      } else if (ch === zaunZeichen) {
        imZaun = false;
        zaunZeichen = null;
      }
    } else if (!imZaun && offset > bodyStart && SCHNITT_RE.test(zeile)) {
      punkte.push({ offset, byteOffset });
    }
    offset += zeile.length + 1; // +1 für das LF
    byteOffset += byteLength(zeile) + 1;
  }
  return punkte;
}

// Greedy-Füllung eines Bereichs: liefert die Grenzen (Offsets) zwischen `von`
// und `bis`, so dass jeder entstehende Abschnitt möglichst dicht unter der
// Schwelle liegt.
//
// Ein Abschnitt nimmt den LETZTEN Schnittpunkt, der noch unter der Schwelle
// liegt. Gibt es unterhalb der Schwelle keinen, nimmt er den ersten überhaupt
// und überschreitet die Schwelle — das ist die weiche Schwelle aus O4, nicht
// ihre Verletzung. Sind gar keine Schnittpunkte mehr da, endet die Füllung.
//
// `maxAnzahl` deckelt die Zahl der Grenzen; das braucht die Nachführung, wenn
// sie einen Bereich auf eine feste Zahl von Teilen verteilen muss.
function greedyGrenzen(punkte, von, vonByte, bisByte, schwelle, maxAnzahl = Infinity) {
  const grenzen = [];
  let startByte = vonByte;
  let i = 0;
  while (i < punkte.length && punkte[i].offset <= von) i++;
  while (bisByte - startByte > schwelle && grenzen.length < maxAnzahl) {
    let gewaehlt = -1;
    for (let k = i; k < punkte.length; k++) {
      if (punkte[k].byteOffset - startByte <= schwelle) gewaehlt = k;
      else break;
    }
    if (gewaehlt < 0) {
      if (i >= punkte.length) break; // kein Schnittpunkt mehr: der Rest bleibt ein Teil
      gewaehlt = i; // weiche Schwelle: der erste Punkt dahinter
    }
    grenzen.push(punkte[gewaehlt].offset);
    startByte = punkte[gewaehlt].byteOffset;
    i = gewaehlt + 1;
  }
  return grenzen;
}

// Länge des gemeinsamen Präfix zweier Texte, auf eine Code-Point-Grenze
// zurückgezogen (nie mitten in ein Surrogat-Paar).
function gemeinsamesPraefix(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i > 0) {
    const c = a.charCodeAt(i - 1);
    if (c >= 0xd800 && c <= 0xdbff) i--;
  }
  return i;
}

// Länge des gemeinsamen Suffix, ebenfalls auf eine Code-Point-Grenze gezogen.
function gemeinsamesSuffix(a, b, deckel) {
  const max = Math.min(a.length, b.length, deckel);
  let i = 0;
  while (i < max && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  if (i > 0) {
    const c = a.charCodeAt(a.length - i);
    if (c >= 0xdc00 && c <= 0xdfff) i--;
  }
  return i;
}

/**
 * Führt die bestehenden Teil-Grenzen vom alten in den neuen Text nach.
 *
 * Aus dem längsten gemeinsamen Präfix und Suffix ergibt sich der geänderte
 * Bereich. Jede Grenze davor bleibt, wo sie ist; jede Grenze dahinter
 * verschiebt sich um die Längen-Differenz. Im Regelfall — der Anwender
 * arbeitet an einer Stelle — liegt keine Grenze im geänderten Bereich: Dann
 * ändert sich genau ein Teil, und alle übrigen bleiben Byte für Byte
 * unberührt. Das ist der Grund, warum ein gewöhnliches Speichern eine einzige
 * Datei anfasst statt aller.
 *
 * Liefert { erhalten, verschluckt, von, bis }: die nachgeführten Grenzen, die
 * Zahl der Grenzen im geänderten Bereich und dessen Lage im NEUEN Text.
 */
function fuehreGrenzenNach(altText, neuText, alteGrenzen) {
  const alt = String(altText == null ? '' : altText);
  const neu = String(neuText == null ? '' : neuText);
  const p = gemeinsamesPraefix(alt, neu);
  const s = gemeinsamesSuffix(alt, neu, Math.min(alt.length, neu.length) - p);
  const delta = neu.length - alt.length;
  const altEnde = alt.length - s;
  const erhalten = [];
  let verschluckt = 0;
  for (const g of alteGrenzen || []) {
    if (g <= p) erhalten.push(g);
    else if (g >= altEnde) erhalten.push(g + delta);
    else verschluckt++;
  }
  return { erhalten, verschluckt, von: p, bis: neu.length - s };
}

// Baut den fertigen Datei-Inhalt eines Teils.
// Teil 1 behält seinen Frontmatter und bekommt die Zuordnungs-Zeile ergänzt;
// jeder Folgeteil bekommt einen frischen Frontmatter, der ausschließlich die
// Zuordnung trägt. Genau diesen entfernt das Zusammensetzen wieder.
function baueTeilInhalt(rumpf, index, base) {
  const geschrieben = writePartLine(rumpf, { index, base });
  return geschrieben.ok ? geschrieben.text : null;
}

// Schneidet einen Text an den gegebenen Grenzen in Abschnitte.
function schneide(text, grenzen) {
  const stuecke = [];
  let von = 0;
  for (const g of grenzen) {
    stuecke.push(text.slice(von, g));
    von = g;
  }
  stuecke.push(text.slice(von));
  return stuecke;
}

/**
 * Plant die Zerlegung eines Dokuments beim Speichern.
 *
 * @param {object} opts
 * @param {string} opts.text     Der zu schreibende Gesamt-Text (LF-normalisiert).
 * @param {string} opts.base     Grundname der Kopf-Datei (ohne Endung).
 * @param {number} opts.schwelle Schwelle in Byte.
 * @param {Array}  [opts.bestand] Vorhandene Teile als [{index, basename, content}],
 *                                nach Position geordnet; leer oder fehlend bei
 *                                einem bisher ungeteilten Dokument.
 *
 * Liefert bei einem Dokument, das ungeteilt bleibt:
 *   { geteilt: false, grund: 'unter-schwelle' | 'kein-schnittpunkt' }
 * und sonst:
 *   { geteilt: true, neuGeteilt, teile: [{ index, basename, text, geaendert, neu }] }
 *
 * `geaendert` sagt, ob der Teil vom Platten-Stand abweicht und geschrieben
 * werden muss; `neu` kennzeichnet eine noch nicht existierende Datei. Ein
 * Fehler beim Schreiben des Frontmatters ergibt { ok: false, error }.
 */
function planeZerlegung({ text, base, schwelle = DOKUMENT_SCHWELLE, bestand }) {
  const neu = String(text == null ? '' : text);
  const grundname = baseBasenameOf(base);
  const vorhanden = Array.isArray(bestand) ? bestand : [];
  // Geteilt ist ein Dokument, wenn der Aufrufer Teile mitgibt — er entscheidet
  // das an der Zuordnungs-Zeile, nicht an der Zahl der gefundenen Dateien. Ein
  // Dokument mit Zuordnungs-Zeile und nur einer Datei bleibt damit geteilt und
  // bekommt seine Folgeteile hier, statt als ungeteilt neu aufgeteilt zu werden.
  const warGeteilt = vorhanden.length > 0;

  // Ein bisher ungeteiltes Dokument unter der Schwelle bleibt, wie es ist.
  // Ein bereits geteiltes wird NICHT wieder vereint: Das ist eine ausdrückliche
  // Aktion des Anwenders (O9) und nie eine Nebenwirkung des Speicherns.
  if (!warGeteilt && !ueberSchwelle(neu, schwelle)) {
    return { ok: true, geteilt: false, grund: 'unter-schwelle' };
  }

  const punkte = findSplitPoints(neu);
  const gesamtByte = byteLength(neu);
  let grenzen;

  if (!warGeteilt) {
    grenzen = greedyGrenzen(punkte, -1, 0, gesamtByte, schwelle);
    if (grenzen.length === 0) {
      return { ok: true, geteilt: false, grund: 'kein-schnittpunkt' };
    }
  } else {
    const alt = assembleParts(vorhanden);
    const nach = fuehreGrenzenNach(alt.text, neu, alt.grenzen);
    grenzen = nach.erhalten.slice();
    // Grenzen, die im geänderten Bereich lagen, werden dort neu gesetzt — nach
    // derselben Greedy-Regel wie bei der Erstzerlegung. Findet sich für sie
    // kein Schnittpunkt, fallen sie ans Ende des geänderten Bereichs; der
    // betroffene Teil wird dann leer. Eine leere Teil-Datei bleibt liegen,
    // statt gelöscht zu werden: Ihr Wegfall erzeugte entweder eine Lücke in
    // der Folge oder gäbe eine Nummer zur Wiederverwendung frei, und beides
    // schließen die Ablage-Regeln aus.
    if (nach.verschluckt > 0) {
      const innen = punkte.filter((p) => p.offset > nach.von && p.offset < nach.bis);
      const vonByte = byteLength(neu.slice(0, nach.von));
      const bisByte = vonByte + byteLength(neu.slice(nach.von, nach.bis));
      const ersatz = greedyGrenzen(innen, nach.von, vonByte, bisByte, schwelle, nach.verschluckt);
      while (ersatz.length < nach.verschluckt) ersatz.push(nach.bis);
      grenzen = grenzen.concat(ersatz).sort((a, b) => a - b);
    }
    // Rotation (Ablage-Regel «Append-only mit Rotation»): Nur der LETZTE Teil
    // wird geteilt, wenn er die Schwelle reißt, und der neue Teil kommt hinten
    // an. Ein mittlerer Teil, der durch Einfügen über die Schwelle wächst,
    // bleibt groß — der Preis dieser Regel, vom Product Owner am 2026-08-31
    // ausdrücklich angenommen.
    const letzterStart = grenzen.length > 0 ? grenzen[grenzen.length - 1] : 0;
    // Über den Rest gezählt statt über den Anfang: Der letzte Teil ist klein,
    // der Text vor ihm kann das ganze Dokument sein.
    const letzterStartByte = gesamtByte - byteLength(neu.slice(letzterStart));
    grenzen = grenzen.concat(
      greedyGrenzen(punkte, letzterStart, letzterStartByte, gesamtByte, schwelle),
    );
  }

  // Nummern: die bestehenden Teile behalten ihre, neue zählen ab der höchsten
  // je vergebenen weiter. Nummern werden nie wiederverwendet (Ablage-Regel).
  const stuecke = schneide(neu, grenzen);
  let hoechste = FIRST_PART_INDEX - 1;
  for (const t of vorhanden) if (t.index > hoechste) hoechste = t.index;
  const teile = [];
  for (let i = 0; i < stuecke.length; i++) {
    const bisher = vorhanden[i];
    const index = bisher ? bisher.index : ++hoechste;
    const inhalt = baueTeilInhalt(stuecke[i], index, grundname);
    if (inhalt === null) {
      return { ok: false, error: 'Zuordnungs-Zeile nicht schreibbar', teilIndex: index };
    }
    const basename =
      bisher && bisher.basename
        ? bisher.basename
        : index === FIRST_PART_INDEX
          ? grundname
          : buildPartBasename(grundname, index);
    teile.push({
      index,
      basename,
      // Die Kopf-Datei ist nie neu: In sie wird gespeichert, sie existiert
      // also bereits — auch bei der Erstzerlegung, wo der Bestand leer ist.
      neu: !bisher && index !== FIRST_PART_INDEX,
      text: inhalt,
      geaendert: !bisher || bisher.content !== inhalt,
      // Wächst der Teil oder schrumpft er? Das bestimmt die Schreib-Reihenfolge
      // (siehe schreibReihenfolge unten): Wer zuerst schreibt, was länger wird,
      // hinterlässt bei einem Abbruch schlimmstenfalls doppelten Text, nie
      // fehlenden. Die Kopf-Datei schrumpft bei der Erstzerlegung vom
      // Gesamt-Text auf ihren ersten Abschnitt und kommt damit von selbst ans
      // Ende der Reihe.
      waechst: bisher ? inhalt.length >= bisher.content.length : true,
    });
  }
  return { ok: true, geteilt: true, neuGeteilt: !warGeteilt, teile };
}

/**
 * Ordnet die Teile für das Schreiben.
 *
 * Es gibt keine Reihenfolge, die zwei Dateien atomar schreibt; beide
 * naheliegenden verlieren im Gegenbeispiel Text. Wandert eine Grenze nach
 * rechts und wird der Folgeteil zuerst geschrieben, fehlt das Stück dazwischen;
 * wandert sie nach links und wird die Kopf-Datei zuerst geschrieben, ebenso.
 *
 * Diese Ordnung vermeidet beides: Erst kommen die Teile, die WACHSEN oder neu
 * sind, danach die, die SCHRUMPFEN. Damit steht jeder Textabschnitt zu jedem
 * Zwischenzeitpunkt mindestens einmal auf der Platte — ein Abbruch hinterlässt
 * schlimmstenfalls doppelten Text, nie fehlenden (AK6). Die Kopf-Datei landet
 * bei der Erstzerlegung von selbst zuletzt, weil sie dabei schrumpft; und
 * solange sie ihre Zuordnungs-Zeile noch nicht trägt, gilt das Dokument als
 * ungeteilt und der Anwender sieht schlicht seinen alten vollständigen Text.
 */
function schreibReihenfolge(teile) {
  const klasse = (t) => (t.neu ? 0 : t.waechst ? 1 : 2);
  return [...(teile || [])].sort((a, b) => klasse(a) - klasse(b) || a.index - b.index);
}

module.exports = {
  DOKUMENT_SCHWELLE,
  ABLAGE_SCHWELLE,
  SCHNITT_RE,
  schreibReihenfolge,
  byteLength,
  ueberSchwelle,
  findSplitPoints,
  greedyGrenzen,
  fuehreGrenzenNach,
  planeZerlegung,
};
