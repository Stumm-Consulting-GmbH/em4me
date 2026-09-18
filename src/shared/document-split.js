// 4T-001291 (Epic 3E-000224): Zerlegen eines großen Dokuments beim Speichern.
// Gegenstück zu src/shared/document-assembly.js: Jenes fügt die Teile zu
// einem Dokument zusammen, dieses schneidet ein Dokument in Teile.
//
// Beide Richtungen müssen exakt zueinander passen. Die Umkehr-Eigenschaft
// steht in document-assembly.js: Die Rümpfe werden beim Lesen OHNE
// Trennzeichen aneinandergehängt. Hier wird deshalb vor der Schnittzeile
// geschnitten und nichts angefügt; das schlichte Aneinanderhängen ergibt den
// Ausgangstext zeichengleich zurück.
//
// **Wo geschnitten werden darf, steht seit 4T-001550 nebenan** in
// document-split-punkte.js: Schwellen, Byte-Maß und die beiden
// Schnittpunkt-Arten. Dieses Modul beantwortet die andere Hälfte — wie aus
// Schnittpunkten Grenzen werden und welche Datei-Inhalte daraus entstehen. Es
// reicht die Nachbar-Schnittstelle unverändert weiter, damit kein Aufrufer
// beide Module kennen muss (Muster property-profiles.js).
//
// Prozessneutral und ohne Datei-Zugriff: Es bekommt den Puffer-Text und die
// vorhandenen Teile und gibt fertige Datei-Inhalte zurück; das Schreiben
// übernimmt der Haupt-Prozess (src/main/documents/document-parts-io.js).
// Electron-frei (CommonJS, Vorbild src/shared/subpages.js).
'use strict';

const { extractFrontmatter, writeFrontmatter } = require('./markdown/frontmatter.js');
// 4T-001550 (E26.3): Der Schlüssel der Lese-Hilfe und ihre Form; ausgelegt wird
// die Definition hier nicht, die Namen reicht der Aufrufer herein.
const { formatSegmentFelder, DB_SEGMENT_FIELDS_KEY } = require('./database/behaelter.js');
const { assembleParts } = require('./document-assembly.js');
const {
  buildPartBasename,
  baseBasenameOf,
  writePartLine,
  FIRST_PART_INDEX,
} = require('./document-parts.js');
const {
  DOKUMENT_SCHWELLE,
  ABLAGE_SCHWELLE,
  SCHNITT_RE,
  byteLength,
  ueberSchwelle,
  istTabellenDatei,
  schwelleFuer,
  findSplitPoints,
} = require('./document-split-punkte.js');

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
//
// 4T-001550 (E26.3): Bei einer Tabellen-Datei kommt in jedem **Folge**-Segment
// die Namensliste hinzu. Die Kopf-Datei bekommt sie nicht — sie trägt die
// Definition selbst, und eine zweite Liste daneben wäre eine zweite Heimat für
// dieselbe Aussage. Die Namen reicht der Aufrufer herein, statt dass dieses
// Modul die Definition auslegt: Das Auslege-Modul zieht die ganze
// Profil-Maschinerie nach sich, und die allgemeine Teilung soll nicht an ihr
// hängen.
function baueTeilInhalt(rumpf, index, base, segmentFelder) {
  const geschrieben = writePartLine(rumpf, { index, base });
  if (!geschrieben.ok) return null;
  if (index === FIRST_PART_INDEX || !segmentFelder) return geschrieben.text;
  const ergaenzt = writeSegmentFelder(geschrieben.text, segmentFelder);
  return ergaenzt.ok ? ergaenzt.text : null;
}

// Schreibt die Namensliste in den Frontmatter eines Folge-Segments.
//
// **Die Liste wird immer neu geschrieben, nie fortgeschrieben.** Das ist die
// Reparatur aus E26.3: Wird ein Feld umbenannt, veraltet die Liste eines alten
// Segments, und der nächste Schreibvorgang setzt sie richtig — dasselbe Muster,
// mit dem E3.6 die Fence-Länge behandelt. Eine leere Liste entfernt den
// Schlüssel, statt ihn leer stehen zu lassen.
function writeSegmentFelder(text, namen) {
  const wert = formatSegmentFelder(namen);
  const fm = extractFrontmatter(text);
  if (fm.parseError) return { ok: false, error: fm.parseError };
  const data = {
    ...(fm.data && typeof fm.data === 'object' && !Array.isArray(fm.data) ? fm.data : {}),
  };
  if (wert === null) delete data[DB_SEGMENT_FIELDS_KEY];
  else data[DB_SEGMENT_FIELDS_KEY] = wert;
  return writeFrontmatter(text, data);
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
 * @param {string[]} [opts.segmentFelder] Feld-Namen in ihrer Reihenfolge; nur bei
 *                                einer Tabellen-Datei gesetzt. Jedes Folge-Segment
 *                                bekommt sie als Lese-Hilfe in seinen Frontmatter
 *                                (4T-001550, E26.3).
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
function planeZerlegung({ text, base, schwelle = DOKUMENT_SCHWELLE, bestand, segmentFelder }) {
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
    // 4T-001550 (E26.2, Weg A, Entscheidung des Product Owners vom 2026-09-07):
    // **Die Rotation greift nur, wenn die Änderung den letzten Teil wirklich
    // berührt.** Ohne diese Bedingung schnitt sie ihn allein deshalb neu, weil
    // die Schwelle inzwischen gesunken war — gemessen an einem Bestand aus zwei
    // Segmenten zerfiel das unberührte zweite, während der Anwender vorn eine
    // Zelle änderte. Genau das schließt die Zusicherung aus, nach der ein
    // vorhandenes Segment nicht neu geschnitten wird, nur weil die Schwelle
    // gesunken ist.
    //
    // Ein LEERER geänderter Bereich zählt nicht als Berührung: Bei
    // unverändertem Text und beim Löschen am Ende fallen `von` und `bis`
    // zusammen. Im ersten Fall gibt es nichts zu tun, im zweiten ist der letzte
    // Teil kleiner geworden und kann die Schwelle nicht neu reißen.
    //
    // Für gewöhnliche Dokumente ändert sich dadurch nichts: Wächst der letzte
    // Teil, liegt der geänderte Bereich in ihm, und er rotiert wie bisher.
    const letzterBeruehrt = nach.bis > nach.von && nach.bis > letzterStart;
    if (letzterBeruehrt) {
      // Über den Rest gezählt statt über den Anfang: Der letzte Teil ist klein,
      // der Text vor ihm kann das ganze Dokument sein.
      const letzterStartByte = gesamtByte - byteLength(neu.slice(letzterStart));
      grenzen = grenzen.concat(
        greedyGrenzen(punkte, letzterStart, letzterStartByte, gesamtByte, schwelle),
      );
    }
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
    const inhalt = baueTeilInhalt(stuecke[i], index, grundname, segmentFelder);
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
  istTabellenDatei,
  schwelleFuer,
  findSplitPoints,
  greedyGrenzen,
  fuehreGrenzenNach,
  planeZerlegung,
};
