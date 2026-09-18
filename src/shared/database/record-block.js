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
const { zellWert } = require('./record-values.js');
const { DB_DEFAULT_COLUMN_TYPE } = require('./table-columns.js');

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
const MASKE_RE = new RegExp(`^(\\\\+)([${MASKIERBAR.map((c) => `\\${c}`).join('')}])`);

function istMaskiert(zeile) {
  return MASKE_RE.test(zeile);
}

// `\|foo` -> `|foo`, `\\|foo` -> `\|foo`, `\frac` -> `\frac`.
function demaskiereZeile(zeile) {
  return zeile.replace(MASKE_RE, (_, striche, zeichen) => striche.slice(1) + zeichen);
}

// Die Umkehrung: Eine Inhalts-Zeile, die am Zeilenanfang wie ein Marker aussähe,
// bekommt einen Rückstrich davor. Alles andere bleibt unberührt.
function maskiereZeile(zeile) {
  const s = String(zeile == null ? '' : zeile);
  if (istMaskiert(s)) return '\\' + s;
  return MASKIERBAR.some((c) => s.startsWith(c)) ? '\\' + s : s;
}

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
function legeWerteAus(records, fields) {
  const felder = Array.isArray(fields) ? fields : [];
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
  }
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
const INNERE_FENCE_RE = /^[ \t]*(`+)/;

// Die Fence-Länge ermittelt der Schreibweg (E3.6): die längste
// Backtick-Sequenz über alle Zellen plus eins, mindestens drei. Eine
// Hand-Änderung mit längerer innerer Fence repariert der nächste Schreibvorgang.
//
// Gezählt werden nur Sequenzen am Zeilenanfang, weil allein sie einen Code-Zaun
// schließen können; Backticks mitten in einer Zeile sind Inline-Code.
function fenceLaengeFuer(rumpf) {
  let laengste = 0;
  for (const zeile of String(rumpf == null ? '' : rumpf).split('\n')) {
    const treffer = zeile.match(INNERE_FENCE_RE);
    if (treffer && treffer[1].length > laengste) laengste = treffer[1].length;
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
  MASKIERBAR,
  leseAngaben,
  schreibeAngaben,
  maskiereZeile,
  demaskiereZeile,
  parseRecordBlock,
  zellenNachFeldern,
  serializeRecordBlock,
  fenceLaengeFuer,
  baueRecordFence,
};
