// 4T-001545 (Epic 3E-000251, E3): Das Ablage-Format der Datensätze — Parser und
// Serialisierer des Datensatz-Blocks in der Fence `perspective-records`.
//
// **Warum eine eigene Fence und keine Erweiterung der Perspective Table** (E3):
// Ein Datenspeicher braucht zwei Dinge, die ein Prosa-Konstrukt nicht hat, einen
// Notausgang für zeilenführende Marker und eine Grenze für die Anzeige. Beides
// an der ausgelieferten Perspective Table zu ändern hätte deren Paritäts-Prüfung
// neu aufgerollt. Die Datenbank-Tabelle ist das dritte Mitglied dieser Familie
// und hat denselben Grund wie die Datentabelle vor ihr.
//
// **Warum dieses Modul in `database/` liegt und nicht in `markdown/`**
// (Ausführungs-Entscheidung 4T-001545, im entschiedenen Rahmen von E4): Sein
// Gegenstand ist das Speicherformat der Datenbank und nicht ein Anzeige-Konstrukt.
// E4 zieht genau diese Naht, indem es das FORMAT von T2 prozess-neutral verortet
// und die Anzeige davon trennt; der Renderer entsteht getrennt und lädt von hier.
// Damit liegt das vollständige Ablage-Format der Datenbank in einem Ordner,
// zusammen mit der Definition, gegen die es zuordnet.
//
// Das Format in einem Beispiel (die Definition steht im Frontmatter derselben
// Datei, wenige Zeilen darüber):
//
//   |- r-00042
//   | Anna
//   | Beispielweg 3
//   12345 Musterstadt
//   |- r-00043
//   | Bert
//   | \| beginnt mit einem Marker-Zeichen
//
// Vier Eigenschaften, die alle vier entschieden sind und hier nur umgesetzt
// werden:
//
//   1. KEINE KOPFZEILE (E3.2). Die Spalten stehen in der Definition; eine
//      Kopfzeile wäre eine zweite Heimat für dieselbe Aussage.
//   2. POSITIONSBASIERTE ZUORDNUNG (E3.3). Die Reihenfolge der Felder in der
//      Definition ist der Vertrag. Folge daraus: Umbenennen eines Feldes ist
//      folgenlos, Umsortieren dagegen eine Schema-Änderung.
//   3. MARKER NUR IN SPALTE 0 (E3.4), ohne Ausnahme, mit dem Rückstrich als
//      Notausgang. Das ist der Hauptunterschied zur Perspective Table, deren
//      Parser nach dem Beschneiden der Einrückung prüft.
//   4. ÜBERZÄHLIGE ZELLEN BLEIBEN STEHEN (E3.7). Ein Datenverlust durch stilles
//      Wegschreiben ist der eine Fehler, den ein Datenspeicher nicht machen darf.
//
// **Eine benannte Abweichung vom Vorbild:** Die Perspective Table verfolgt
// Code-Zäune innerhalb einer Zelle, damit deren Zeilen nicht als Marker gelten.
// Hier gibt es das nicht, weil E3.4 «ohne Ausnahme» sagt: Spalte 0 gewinnt
// immer, und der Rückstrich ist der eine Weg daran vorbei. Eine zweite Regel
// wäre für einen Datenspeicher die schlechtere Wahl, weil sie die Bedeutung
// einer Zeile vom Zustand weiter oben abhängig machte.
//
// Nicht hier: das Vergeben einer Kennung beim Anlegen (Schreibweg, Stufe 2) und
// die Anzeige des Blocks (eigener Vorgang). Die Auslegung der Angaben am
// Datensatz-Marker folgt mit 4T-001546; bis dahin reisen sie unangetastet als
// Rohtext mit, damit der Rundlauf schon jetzt zeichengleich ist.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { baueHinweis } = require('./table-hinweise.js');
const { kennungFuer, nummerAus } = require('./record-identity.js');
const { zellWert, CELL_ERRORS } = require('./record-values.js');
// 4T-001931 (Epic 3E-000256): der eine Auswerter der Prüfregeln, prozess-neutral.
const { baueRegelKontext, pruefeFeldRegeln } = require('./record-check-eval.js');
const { DB_DEFAULT_COLUMN_TYPE } = require('./table-columns.js');
// 4T-001833 (Epic 3E-000254): Was als Zaun-Zeile gilt und wann sie einen Block
// schließt, steht EINMAL im Haus, im abhängigkeitsfreien `fence-level.js`
// (CommonMark: bis zu drei Leerzeichen, drei oder mehr Backticks oder Tilden,
// kein Backtick im Infostring eines Backtick-Zauns). Maskierung, Parser-Befund
// und Fence-Länge dieses Moduls nehmen die Regel von dort, damit die
// Maskierung genau die Zeilen trifft, die jeder Leser als Zaun liest. Eine
// eigene Fassung hier ließe eine Lücke zwischen Schreiber und Lesern.
const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');

// Name der Fence (E3.1, mit E18.3 bestätigt). Nicht `perspective-dbtable`, weil
// es sich von `perspective-datatable` um einen einzigen Buchstaben an nicht
// hervorgehobener Stelle unterschiede.
const RECORD_FENCE = 'perspective-records';

// Die beiden Marker. `|-` eröffnet einen Datensatz, `|` eine Zelle; geprüft wird
// in dieser Reihenfolge, weil `|-` mit `|` beginnt.
const RECORD_MARKER = '|-';
const CELL_MARKER = '|';

// Zeichen, die am Zeilenanfang maskiert werden können. Der Satz ist bewusst die
// Vereinigung der Marker-Zeichen der Perspective Table und nicht nur der hier
// wirksamen (E3.4 nennt `\|` und `\!`): Ein Text, der aus einer Perspective
// Table in einen Datensatz wandert, behält damit seine Maskierung, und der Satz
// muss nicht geändert werden, falls je ein Marker hinzukommt.
const MASKIERBAR = ['|', '!'];

// --- Angaben am Datensatz-Marker (4T-001546, E3.5) -----------------------------------

// **Die Kennung steht als Angabe am Zeilen-Marker und nicht als führende Zelle**
// (E3.5). Als Zelle verschöbe sie den positionsbasierten Raum der fachlichen
// Felder um eins, und jede Fehlzählung wäre still — genau der Fehler, den ein
// Datenspeicher nicht machen darf.
//
// **Die Schreibweise ist die Attribut-Grammatik des Hauses**, also
// `name="wert"`, wie sie die Perspective Table an ihren Markern führt:
//
//   |- id="r-00042"
//
// Nicht gewählt wurde die knappere Form `|- r-00042` als bloßes Merkmal ohne
// Namen. Sie spart sechs Zeichen je Datensatz, und das Argument ist gemessen
// statt geschätzt: Bei den rund 340 Byte, die ein Datensatz der Notations-Messung
// wiegt, sind das **1,8 Prozent** — zu wenig, um dafür eine zweite Grammatik
// neben der des Hauses zu führen, und die Segment-Schwelle rührt es nicht an.
// Ein namenloses Merkmal wäre zudem nicht erweiterbar: Der Versionsstempel aus
// E3.5 und alles Weitere brauchen ohnehin einen Namen.
//
// **Gelesen werden beide Schreibweisen der Kennung** (E5.1), also `r-00042` und
// `r-42`; geschrieben wird immer die aufgefüllte. Was hier nicht als Angabe
// erkennbar ist, reist unangetastet als Rest mit und geht nicht verloren.
const ATTR_RE = /(\w+)="([^"]*)"/g;
const ID_ATTR = 'id';

// Zerlegt den Rohtext hinter dem Datensatz-Marker.
//
// Liefert `{ id, rest, code }`: `id` die aufgefüllte Kennung oder null, `rest`
// alles Übrige unverändert, `code` ein Hinweis-Code, wenn eine Kennung gemeint,
// aber nicht brauchbar war. Bei einem Befund bleibt der Rohtext vollständig im
// Rest; gemeldet wird, nichts wird verworfen.
function leseAngaben(roh) {
  const text = typeof roh === 'string' ? roh.trim() : '';
  if (text === '') return { id: null, rest: null, code: null };

  let idRoh = null;
  let idTreffer = null;
  ATTR_RE.lastIndex = 0;
  let treffer;
  while ((treffer = ATTR_RE.exec(text)) !== null) {
    if (treffer[1].toLowerCase() !== ID_ATTR || idRoh !== null) continue;
    idRoh = treffer[2];
    idTreffer = treffer[0];
  }

  // Kein Attribut, aber der Rohtext sieht selbst wie eine Kennung aus: Das ist
  // die knappe Schreibweise, die es nicht gibt. Sie wird gemeldet statt still
  // übergangen, weil sie sonst als «Datensatz ohne Kennung» durchginge.
  if (idRoh === null) {
    const code = nummerAus(text) === null ? null : 'recordIdInvalid';
    return { id: null, rest: text, code };
  }

  const nummer = nummerAus(idRoh);
  if (nummer === null) return { id: null, rest: text, code: 'recordIdInvalid' };
  return { id: kennungFuer(nummer), rest: ohneTeil(text, idTreffer), code: null };
}

// Entfernt genau einen Teil aus dem Text und lässt den Rest in seiner Form.
function ohneTeil(text, teil) {
  const rest = text.replace(teil, ' ').replace(/\s+/g, ' ').trim();
  return rest === '' ? null : rest;
}

// Setzt die Angaben wieder zusammen: die Kennung in aufgefüllter Form voran,
// danach unverändert, was das Modul nicht deutet.
function schreibeAngaben(record) {
  const teile = [];
  if (record && record.id) teile.push(`${ID_ATTR}="${record.id}"`);
  if (record && record.attrsRest) teile.push(record.attrsRest);
  return teile.length === 0 ? null : teile.join(' ');
}

// --- Maskierung am Zeilenanfang ------------------------------------------------------

// Ein Rückstrich vor einem Marker-Zeichen ist die Maskierung; ein Rückstrich vor
// irgendetwas anderem ist Inhalt und bleibt unangetastet. Ohne diese Einschränkung
// verlöre eine Zeile wie `\frac{1}{2}` ihren Rückstrich.
//
// Mehrere Rückstriche zählen als Kette: Entfernt wird genau EINER, damit auch
// eine Zeile schreibbar bleibt, die selbst mit `\|` beginnen soll.
//
// 4T-001833 (Epic 3E-000254, Entscheidung des Product Owners vom 2026-09-20):
// Maskiert wird seither auch eine ZAUN-ARTIGE Zeile, also jede, die
// `zaunOeffnung` als Zaun erkennt. Vorher schützte allein ein mit dem Inhalt wachsender Zaun (E3.6 alt)
// solche Zeilen, und das trug nicht: Vier Leser beendeten den Block an der
// ersten Zaun-Zeile mit demselben Zeichen, und in einer geteilten Tabelle
// liegen öffnender und schließender Zaun in verschiedenen Dateien. Mit der
// Maskierung enthält ein von der Anwendung geschriebener Block nie eine Zeile,
// die ihn beenden könnte. Die Zaun-Erkennung kommt aus `fence-level.js` und
// wird mit den Marker-Zeichen in `MASKIERBAR` bewusst nicht vermischt.
//
// **Eine Hand-Datei mit `\```` am Zeilenanfang** wird damit als maskiert
// gelesen und liefert drei Backticks; das ist die Notausgang-Regel der
// Notation, auf Zaun-Zeilen ausgedehnt, und beabsichtigt.
const STRICHE_RE = /^\\+/;

// Beginnt der Rest hinter der Rückstrich-Kette mit etwas, das maskiert sein
// kann: einem Marker-Zeichen oder einer Zaun-Sequenz?
function istMaskierbar(rest) {
  return MASKIERBAR.some((c) => rest.startsWith(c)) || zaunOeffnung(rest) !== null;
}

function istMaskiert(zeile) {
  const striche = zeile.match(STRICHE_RE);
  return striche !== null && istMaskierbar(zeile.slice(striche[0].length));
}

// `\|foo` -> `|foo`, `\\|foo` -> `\|foo`, `\frac` -> `\frac`, `\```x` -> ```` ```x ````.
// Genau ein Rückstrich fällt, und er steht immer in Spalte 0.
function demaskiereZeile(zeile) {
  return istMaskiert(zeile) ? zeile.slice(1) : zeile;
}

// Die Umkehrung: Eine Inhalts-Zeile, die am Zeilenanfang wie ein Marker oder
// wie ein Zaun aussähe, bekommt einen Rückstrich davor. Alles andere bleibt
// unberührt.
function maskiereZeile(zeile) {
  const s = String(zeile == null ? '' : zeile);
  if (istMaskiert(s)) return '\\' + s;
  return istMaskierbar(s) ? '\\' + s : s;
}

// --- Zaun-Regeln (4T-001833) ---------------------------------------------------------

// **Die Regel, wann eine Zaun-Zeile einen Block öffnet und schließt**
// (4T-001833, Bauplan B4), steht in `fence-level.js` und wird hier nur
// weitergereicht (Export unten). Die Leser des Datensatz-Blocks nehmen sie von
// hier, weil das Segment-Modul das Teil-Modul `document-split-punkte.js` lädt
// und dieses umgekehrt die Regel braucht; beide laden dieses Modul ohnehin,
// und so bleibt ihr Import an einer Stelle.

// --- Parser ---------------------------------------------------------------------------

// Liest den Rumpf einer `perspective-records`-Fence.
//
// `fields` sind die normalisierten Feld-Definitionen aus `parseTableDefinition`;
// sie werden ausschließlich für die Zuordnungs-Hinweise gebraucht. Ohne sie
// entsteht die Struktur trotzdem, denn der Block ist auch für sich lesbar.
//
// Liefert `{ records, vorspann, hints }`:
//   records   je Datensatz `{ id, attrsRest, vorspann, cells, zeile }`; `id` die
//             aufgefüllte Kennung oder null, `attrsRest` alles Weitere hinter
//             dem Datensatz-Marker unverändert, `vorspann` die Zeilen zwischen
//             Marker und erster Zelle, `cells` die Zellen in ihrer Reihenfolge,
//             je `{ text, value, error }` mit dem un-maskierten Inhalt, dem
//             nach dem Feld-Typ ausgelegten Wert und dem Befund, wenn der Text
//             zum Typ nicht passt, und `zeile` der 0-basierte Zeilen-Index des
//             Datensatzes IM ÜBERGEBENEN RUMPF
//
// **Warum die Zeile mitläuft** (4T-001610): Wer einen Datensatz anspringen
// will, braucht seine Stelle in der Datei, und nur der Parser kennt sie ohne
// zweiten Durchlauf. Sie zählt bewusst im Rumpf und nicht in der Datei, denn
// der Parser sieht die Datei nicht; wer den Rumpf herausschneidet, kennt seine
// Anfangs-Zeile und addiert sie. Beim markerlosen Datensatz — loser Zell-Text
// ohne vorangehenden Marker — ist es die Zeile seiner ersten Zelle.
//   vorspann  Zeilen vor dem ersten Datensatz-Marker, unangetastet erhalten
//   hints     Zuordnungs-Befunde in der Gestalt des Definitions-Katalogs, um
//             die Position des Datensatzes ergänzt
//
// Der Parser wirft nie und verwirft nie: Was er nicht deuten kann, bleibt als
// Text erhalten und wird gemeldet. **Beide Vorspann-Listen sind genau dafür da**
// und keine Kür: Ohne sie wanderte loser Text beim nächsten Schreibvorgang an
// eine andere Stelle des Blocks oder verschwände, und ein Datenspeicher darf
// beides nicht. Leerzeilen am Rand des Rumpfes sind davon ausgenommen, weil sie
// Layout tragen und keinen Wert.
function parseRecordBlock(content, fields) {
  const zeilen = String(content == null ? '' : content).split('\n');
  const records = [];
  const vorspann = [];
  const hints = [];
  // Befunde an den Angaben sammeln sich beim Lesen, gemeldet wird am Ende in
  // einer Reihenfolge: erst der lose Text, dann die Kennungen, dann die
  // Zuordnung. Eine gemischte Reihenfolge wäre für einen Leser schwerer zu
  // deuten als eine feste.
  const idBefunde = [];
  // 4T-001833 (Epic 3E-000254, B5): Positionen der unmaskierten Zaun-Zeilen,
  // die als Inhalt gelesen werden (null ohne Datensatz).
  const zaunBefunde = [];

  let record = null;
  let cell = null;

  const zelleSchliessen = () => {
    if (cell) {
      record.cells.push(cell);
      cell = null;
    }
  };
  const datensatzSchliessen = () => {
    zelleSchliessen();
    if (record) records.push(record);
    record = null;
  };

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    // Spalte 0 entscheidet, und zwar zuerst: Eine maskierte Zeile ist immer
    // Inhalt, auch wenn sie danach wie ein Marker aussieht.
    if (!istMaskiert(zeile)) {
      if (zeile.startsWith(RECORD_MARKER)) {
        datensatzSchliessen();
        const angaben = leseAngaben(zeile.slice(RECORD_MARKER.length));
        record = { id: angaben.id, attrsRest: angaben.rest, vorspann: [], cells: [], zeile: i };
        if (angaben.code) idBefunde.push({ code: angaben.code, position: records.length });
        continue;
      }
      if (zeile.startsWith(CELL_MARKER)) {
        if (!record) record = { id: null, attrsRest: null, vorspann: [], cells: [], zeile: i };
        zelleSchliessen();
        cell = { text: ersteZellenZeile(zeile) };
        continue;
      }
      // 4T-001833 (Epic 3E-000254): Eine unmaskierte Zaun-Zeile bleibt Inhalt
      // und wird gemeldet. Der Parser sieht sie in zwei Lagen: in der
      // Kopf-Datei als kürzere Zeile, die den Block nach der Standard-Regel
      // nicht schließt, und im Folge-Segment als jede Zaun-Zeile außer der
      // letzten. Beides sind Hand-Schreibungen, die der nächste Schreibvorgang
      // maskiert; verworfen wird nichts.
      if (zaunOeffnung(zeile) !== null) zaunBefunde.push(record ? records.length : null);
    }

    const inhalt = demaskiereZeile(zeile);
    if (cell) cell.text += '\n' + inhalt;
    else if (record) record.vorspann.push(inhalt);
    else vorspann.push(inhalt);
  }
  datensatzSchliessen();

  // Ein leerer Block ist kein Fehler, sondern eine Tabelle ohne Datensätze.
  // Leerzeilen am Rand sind Layout und kein Vorspann.
  const vorspannRest = ohneRandLeerzeilen(vorspann);
  if (vorspannRest.length > 0) hints.push(baueDatensatzHinweis('recordStrayContent', null));
  records.forEach((record, position) => {
    record.vorspann = ohneRandLeerzeilen(record.vorspann);
    if (record.vorspann.length > 0)
      hints.push(baueDatensatzHinweis('recordStrayContent', position));
  });
  for (const befund of idBefunde) hints.push(baueDatensatzHinweis(befund.code, befund.position));
  // 4T-001833: Die Zaun-Zeilen folgen den Kennungen und stehen vor der
  // Zuordnung; die feste Reihenfolge der Befund-Arten bleibt damit erhalten.
  for (const position of zaunBefunde) hints.push(baueDatensatzHinweis('recordFenceLine', position));

  pruefeZuordnung(records, fields, hints);
  legeWerteAus(records, fields);
  return { records, vorspann: vorspannRest, hints };
}

// Hinter dem Zell-Marker steht genau EIN trennendes Leerzeichen, wenn eines da
// ist; alles Weitere gehört zum Wert. Ein Datenspeicher darf einen Wert nicht
// beschneiden, und ein Wert mit führenden Leerzeichen ist ein zulässiger Wert.
function ersteZellenZeile(zeile) {
  const rest = zeile.slice(CELL_MARKER.length);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

function ohneRandLeerzeilen(zeilen) {
  let von = 0;
  let bis = zeilen.length;
  while (von < bis && zeilen[von].trim() === '') von++;
  while (bis > von && zeilen[bis - 1].trim() === '') bis--;
  return zeilen.slice(von, bis);
}

// --- Zuordnung gegen die Definition ---------------------------------------------------

// Meldet, wo Zell-Zahl und Feld-Zahl auseinandergehen. Beide Fälle sind weich:
// Fehlende Zellen sind leer, überzählige bleiben stehen (E3.7). Gemeldet wird
// je Datensatz, weil die Auskunft «Datensatz 7 hat eine Zelle zu viel» der
// Sache nach die brauchbare ist.
function pruefeZuordnung(records, fields, hints) {
  if (!Array.isArray(fields) || fields.length === 0) {
    if (records.length > 0) hints.push(baueDatensatzHinweis('recordNoDefinition', null));
    return;
  }
  records.forEach((record, position) => {
    if (record.cells.length < fields.length)
      hints.push(baueDatensatzHinweis('recordCellsMissing', position, fields.length));
    else if (record.cells.length > fields.length)
      hints.push(baueDatensatzHinweis('recordCellsExtra', position, fields.length));
  });
}

// 4T-001559: Der Wert einer Zelle entsteht aus ihrem Text und dem Typ ihres
// Feldes. Er wird beim Parsen gebildet, weil er dabei ohnehin anfällt und weil
// eine Zelle, die eine Regel verletzt und trotzdem stumm in eine Summe fließt,
// eine falsche Zahl ohne Warnung erzeugt (E22.2).
//
// **Eine überzählige Zelle bekommt keinen Wert**, denn sie gehört zu keinem
// Feld und damit zu keinem Typ; ihr Text bleibt unangetastet erhalten (E3.7).
// Dasselbe gilt für jede Zelle eines Blocks ohne Definition: Ohne Feld-Typ gibt
// es nichts auszulegen, und ein geratener Typ wäre schlechter als kein Wert.
//
// 4T-001931 (Epic 3E-000256, E22.2): **Beim Lesen wirken Pflicht-Angabe und
// Feld-Regeln weich.** Eine leere Zelle eines Pflicht-Feldes und ein Wert, der
// eine Feld-Regel verletzt, bekommen einen Befund und den Wert `null`, genau
// wie ein Typ-Fehler: Sie fließen nicht in eine Summe, und die Anzeige markiert
// sie über denselben Weg. Der Text bleibt unverändert, geschrieben wird nie.
// Datensatz-Regeln wirken beim Lesen nicht, weil sie keinen Zell-Ort für eine
// Markierung haben.
function legeWerteAus(records, fields) {
  const felder = Array.isArray(fields) ? fields : [];
  // Kosten nur bei Bedarf: Ohne eine Feld-Regel entsteht kein Kontext, und die
  // regelfreie Tabelle bleibt auf dem bisherigen Weg.
  const mitRegeln = felder.some((feld) => Array.isArray(feld.checks) && feld.checks.length > 0);
  for (const record of records) {
    record.cells.forEach((cell, i) => {
      if (i >= felder.length) {
        cell.value = null;
        cell.error = null;
        return;
      }
      const { value, error } = zellWert(felder[i].type || DB_DEFAULT_COLUMN_TYPE, cell.text);
      cell.value = value;
      cell.error = error;
    });
    markierePflicht(record, felder);
    if (mitRegeln) markiereRegeln(record, felder);
  }
}

// 4T-001931: Der Trennabstand hinter einem Datensatz steht im Text seiner
// letzten Zelle und gehört nicht zu ihrem Wert. Dieselbe Regel wie
// `ohneTrennabstand` in `record-write.js`; sie ist dort nicht exportiert, und
// `record-write.js` lädt dieses Modul, ein Import in Gegenrichtung wäre ein
// Kreis.
function ohneTrennabstand(text) {
  return text.replace(/\n+$/, '');
}

// 4T-001931: Die Zell-Texte eines Datensatzes, wie sie zum Wert gehören — die
// Auslegung von `zellTexte` in `record-write.js`, aus demselben Grund hier
// nachgebildet.
function wertTexte(record) {
  const texte = record.cells.map((cell) => String(cell.text == null ? '' : cell.text));
  if (texte.length > 0) texte[texte.length - 1] = ohneTrennabstand(texte[texte.length - 1]);
  return texte;
}

// 4T-001931: Eine leere Zelle eines Pflicht-Feldes. «Leer» heißt dasselbe wie
// beim Schreiben (`istNichtGesetzt` in `record-auftrag-pruefung.js`): leerer
// getrimmter Text, und nie beim Wahrheitswert, dessen leere Zelle der
// geschriebene Wert «nein» ist. Eine fehlende Zelle ist kein Teil von `cells`
// und wird hier nicht markiert; sie meldet der Zuordnungs-Hinweis.
function markierePflicht(record, felder) {
  record.cells.forEach((cell, i) => {
    if (i >= felder.length || felder[i].required !== true) return;
    if (felder[i].type === 'boolean' || String(cell.text).trim() !== '') return;
    cell.error = CELL_ERRORS.required;
    cell.value = null;
  });
}

// 4T-001931: Die Feld-Regeln einer Zelle, über den Auswerter, den auch die
// Schreib-Schnittstelle benutzt. Geprüft wird nur ein Wert ohne Befund; einen
// Typ-Fehler und eine fehlende Pflicht-Angabe meldet die Zelle bereits.
function markiereRegeln(record, felder) {
  const texte = wertTexte(record);
  const kontext = baueRegelKontext(felder, texte);
  record.cells.forEach((cell, i) => {
    if (i >= felder.length || cell.error !== null || cell.value === null) return;
    if (pruefeFeldRegeln(felder[i], texte[i], kontext).length === 0) return;
    cell.error = CELL_ERRORS.check;
    cell.value = null;
  });
}

// Die Hinweis-Gestalt des Definitions-Katalogs, um die Position des Datensatzes
// ergänzt. Die vier Grundfelder bleiben unverändert, damit eine Anzeige beide
// Hinweis-Arten gleich behandeln kann; `record` ist null, wo der Befund den
// ganzen Block betrifft und nicht einen einzelnen Datensatz.
function baueDatensatzHinweis(code, record, expected) {
  return { ...baueHinweis(code, -1, null, expected), record };
}

// Ordnet die Zellen eines Datensatzes seinen Feldern zu — die eine Stelle, an
// der die positionsbasierte Zuordnung aus E3.3 stattfindet. Eine fehlende Zelle
// ergibt einen leeren Wert, eine überzählige erscheint nicht im Ergebnis und
// bleibt allein im Text stehen; wer sie braucht, liest `record.cells`.
function zellenNachFeldern(record, fields) {
  const cells = record && Array.isArray(record.cells) ? record.cells : [];
  return (Array.isArray(fields) ? fields : []).map((feld, i) => {
    if (i >= cells.length) {
      // Eine fehlende Zelle ist der leere Wert ihres Typs, nicht ein Fehler.
      const { value, error } = zellWert(feld.type || DB_DEFAULT_COLUMN_TYPE, '');
      return { name: feld.name, text: '', value, error, fehlt: true };
    }
    const cell = cells[i];
    return {
      name: feld.name,
      text: cell.text,
      value: cell.value === undefined ? null : cell.value,
      error: cell.error === undefined ? null : cell.error,
      fehlt: false,
    };
  });
}

// --- Serialisierer ---------------------------------------------------------------------

// Schreibt den Rumpf der Fence in kanonischer Form.
//
// **Kanonisch heißt idempotent, nicht spuren-treu:** Ein Block in kanonischer
// Form kommt zeichengleich zurück; ein von Hand geschriebener mit abweichendem
// Trennabstand wird beim nächsten Schreiben normalisiert. Das ist dasselbe
// Muster, mit dem E3.6 die Fence-Länge und E26.3 die Feld-Namen eines Segments
// behandeln: Der nächste Schreibvorgang repariert die Datei.
function serializeRecordBlock(records, vorspann) {
  const zeilen = [];
  for (const zeile of Array.isArray(vorspann) ? vorspann : []) zeilen.push(maskiereZeile(zeile));
  for (const record of Array.isArray(records) ? records : []) {
    const angaben = schreibeAngaben(record);
    zeilen.push(angaben ? `${RECORD_MARKER} ${angaben}` : RECORD_MARKER);
    for (const zeile of (record && record.vorspann) || []) zeilen.push(maskiereZeile(zeile));
    for (const cell of (record && record.cells) || []) {
      const text = String(cell && cell.text != null ? cell.text : '');
      const [erste, ...weitere] = text.split('\n');
      zeilen.push(erste === '' ? CELL_MARKER : `${CELL_MARKER} ${erste}`);
      for (const w of weitere) zeilen.push(maskiereZeile(w));
    }
  }
  return zeilen.join('\n');
}

// --- Fence-Länge -----------------------------------------------------------------------

const MINDEST_FENCE = 3;

// Die Fence-Länge ermittelt der Schreibweg (E3.6): die längste
// Backtick-Sequenz über alle Zellen plus eins, mindestens drei.
//
// 4T-001833 (Epic 3E-000254): **Die Länge wächst nicht mehr mit dem Inhalt.**
// Der Serialisierer maskiert jede zaun-artige Zeile, und eine maskierte Zeile
// beginnt mit einem Rückstrich; über serialisiertem Text liefert die Funktion
// deshalb das Minimum. Sie bleibt als Sicherung für unmaskiert vorgefundenen
// Text bestehen (etwa den Rumpf einer Hand-Datei).
//
// 4T-001833: **Gezählt werden allein echte Zaun-Zeilen aus Backticks**, also
// Zeilen, die `zaunOeffnung` erkennt, mit dem Backtick als Zeichen. Eine
// Zeile mit vier oder mehr führenden Leerzeichen ist keine Zaun-Zeile und kann
// den Block nicht schließen; eine Tilden-Zeile schließt einen Backtick-Zaun
// nie; Backticks mitten in einer Zeile sind Inline-Code. Bis dahin zählte ein
// eigener Ausdruck jede Einrückung mit und ließ den Zaun ohne Not wachsen.
function fenceLaengeFuer(rumpf) {
  let laengste = 0;
  for (const zeile of String(rumpf == null ? '' : rumpf).split('\n')) {
    const zaun = zaunOeffnung(zeile);
    if (zaun && zaun.zeichen === '`' && zaun.laenge > laengste) laengste = zaun.laenge;
  }
  return Math.max(MINDEST_FENCE, laengste + 1);
}

// Der vollständige Block samt Zaun, wie er in das Dokument geschrieben wird.
function baueRecordFence(records, vorspann) {
  const rumpf = serializeRecordBlock(records, vorspann);
  const zaun = '`'.repeat(fenceLaengeFuer(rumpf));
  return `${zaun}${RECORD_FENCE}\n${rumpf}\n${zaun}`;
}

module.exports = {
  RECORD_FENCE,
  RECORD_MARKER,
  CELL_MARKER,
  ID_ATTR,
  // 4T-001790 (Epic 3E-000255): Die Attribut-Grammatik des Hauses gibt es einmal.
  // Das Beleg-Format deutet damit den Rest hinter der Kennung und führt keinen
  // zweiten Ausdruck. Der Ausdruck trägt das Merkmal `g`; wer ihn benutzt, setzt
  // `lastIndex` vor der Schleife zurück, wie `leseAngaben` es tut.
  ATTR_RE,
  MASKIERBAR,
  leseAngaben,
  schreibeAngaben,
  maskiereZeile,
  demaskiereZeile,
  // 4T-001833 (Epic 3E-000254, B4): die eine Zaun-Regel aller Leser, aus
  // `fence-level.js` weitergereicht.
  zaunOeffnung,
  schliesstZaun,
  parseRecordBlock,
  zellenNachFeldern,
  serializeRecordBlock,
  fenceLaengeFuer,
  baueRecordFence,
};
