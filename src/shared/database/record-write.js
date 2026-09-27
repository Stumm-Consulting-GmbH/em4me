// 4T-001819 (Epic 3E-000254, E3, E5.1): Datensatz-Zeilen in die Tabellen-Datei
// zurückschreiben — Anlegen, Ändern und Löschen als reine Text-Operation, dazu
// das Fortschreiben des Hochwasserstands im Frontmatter.
//
// **Der Gegenstand ist ausdrücklich nur der Text.** Dieses Modul öffnet keine
// Datei, nimmt keine Sperre, schreibt keinen Beleg und kennt keinen Vorgang; es
// bekommt den Inhalt einer Tabellen-Datei und liefert einen neuen Inhalt
// zurück. Alles Weitere — Sperren, Belege, Vorgangs-Kennung und das Wirken über
// mehrere Dateien — setzt darauf auf und entsteht in den folgenden Vorgängen
// des Epics.
//
// **Die tragende Zusage ist die Zeichengleichheit alles Unberührten.** Eine
// Tabellen-Datei ist eine Datei des Anwenders: Sie trägt Prosa vor und nach dem
// Datensatz-Block, sie darf von Hand geschrieben sein, sie trägt Leerzeilen,
// Einrückungen und Maskierungen, die jemand bewusst gesetzt hat. Ein Schreibweg,
// der den Block als Ganzes neu serialisiert, formatierte diese Datei bei jeder
// Änderung eines einzigen Feldes um, denn der Serialisierer aus `record-block.js`
// ist ausdrücklich kanonisch und nicht spuren-treu (E3.6). Ersetzt werden
// deshalb **Zeilen-Bereiche**, und neu serialisiert wird ausschließlich der
// berührte Datensatz. Das ist Zeile für Zeile das Verfahren, das
// `change-compaction.js` für die Beleg-Datei fährt; dieses Modul ist sein
// zweiter Anwendungsfall und erfindet es nicht neu.
//
// **Drei Ausführungs-Entscheidungen des Vorgangs** (Bauplan vom 2026-09-20):
//
//   B1 EIN Einstieg für eine LISTE von Operationen. Ein Auftrag je Datei ist
//      eine Menge von Änderungen, und die Zeilen-Bereiche lassen sich nur in
//      einem Durchgang widerspruchsfrei berechnen: Zwei nacheinander angewandte
//      Einzel-Funktionen parsten den Text zweimal, und die zweite arbeitete auf
//      Zeilen-Nummern, die die erste verschoben hat.
//   B2 Fehlt der Datensatz-Block, legt dieses Modul ihn an, samt Zaun am Ende
//      des Dokuments und abgesetzt durch eine Leerzeile. Ändern und Löschen
//      ohne Block sind dagegen ein Fehlschlag, weil ihr Ziel nicht existiert.
//   B3 Ein Befund des Parsers an FREMDEN Zeilen hält den Schreibvorgang nicht
//      auf; eine von Hand beschädigte Zeile machte die Tabelle sonst für alle
//      übrigen Datensätze unbearbeitbar. Abgewiesen wird allein das nicht
//      eindeutige Ziel.
//
// **Alles oder nichts.** Jede Operation wird gegen den vorgefundenen Text
// geprüft, BEVOR eine einzige Zeile ersetzt wird; ein Befund liefert den
// Ursprungs-Text unverändert zurück. Ein halb ausgeführter Auftrag wäre in
// einem Datenspeicher der teurere Ausgang, weil niemand ihm ansieht, wo er
// abgebrochen ist.
//
// Prozess-neutral (kein Electron, kein DOM, kein Datei-Zugriff).
'use strict';

const { extractFrontmatter } = require('../markdown/frontmatter.js');
// 4T-001833 (Epic 3E-000254): Die Zaun-Regel kommt aus dem Format-Modul; der
// eigene `FENCE_RE`-Vergleich in `zaunZeile` ist damit entfallen.
const {
  RECORD_FENCE,
  baueRecordFence,
  fenceLaengeFuer,
  parseRecordBlock,
  serializeRecordBlock,
  zaunOeffnung,
  schliesstZaun,
} = require('./record-block.js');
const { ROLLE_KOPF, datensatzRumpf, rolleVon } = require('./record-segment.js');
const { kennungFuer, normalisiereHochwasserstand, nummerAus } = require('./record-identity.js');
const { DB_TABLE_KEY, datenbankMarken } = require('./behaelter.js');

// --- Die drei Operationen und der Fehler-Katalog ---------------------------------------

// Die Arten tragen dieselben drei Wörter wie das Beleg-Format, weil sie dieselben
// drei Vorgänge benennen; ein zweites Vokabular für dieselbe Sache wäre eine
// Übersetzungs-Schicht ohne Gegenwert. **Importiert werden sie trotzdem nicht:**
// Dieses Modul weiß von Belegen nichts und zöge sonst die ganze Beleg-Maschinerie
// nach — und eine spätere Erweiterung des Beleg-Formats änderte still die
// Schnittstelle dieses Moduls.
const ART_ANLEGEN = 'create';
const ART_AENDERN = 'update';
const ART_LOESCHEN = 'delete';
const ARTEN = Object.freeze([ART_ANLEGEN, ART_AENDERN, ART_LOESCHEN]);

// Der Fehler-Katalog ist geschlossen. Jeder Fehlschlag kommt als
// `{ ok: false, code, error }` zurück und nie als geworfene Ausnahme; das ist
// das Ergebnis-Muster, das die Entwicklungsrichtlinien für fehlbare Operationen
// festlegen. Der Text ist **Entwickler-Text**: Was der Anwender zu sehen
// bekommt, entscheidet die Schnittstelle über diesem Modul und zieht es über
// einen i18n-Schlüssel.
const FEHLER = Object.freeze({
  operationen: 'Die Operationen sind keine Liste.',
  operation: 'Eine Operation ist kein Objekt.',
  art: `Die Art einer Operation ist keine der drei (${ARTEN.join(', ')}).`,
  kennung: 'Die Operation nennt keine brauchbare Datensatz-Kennung.',
  keineTabelle: 'Der Text ist weder Kopf-Datei noch Folge-Segment einer Tabelle.',
  keinBlock: 'Die Datei trägt keinen Datensatz-Block; Ändern und Löschen haben kein Ziel.',
  nichtGefunden: 'Die Datei trägt keinen Datensatz mit dieser Kennung.',
  mehrdeutig: 'Die Kennung kommt in der Datei mehrfach vor.',
  zielBeschaedigt: 'Die Zeile des Ziel-Datensatzes trägt einen Befund des Parsers.',
  bereitsVorhanden: 'Die Kennung kommt in der Datei bereits vor.',
  keinFrontmatter: 'Die Datei trägt kein Frontmatter.',
  keinBehaelter: 'Das Frontmatter trägt den Behälter der Tabellen-Definition nicht.',
  behaelterZeile: 'Die Zeile des Definitions-Behälters ist nicht auffindbar.',
  behaelterInline: 'Der Definitions-Behälter steht in einer Zeile und nicht als Block.',
  stand: 'Der Hochwasserstand ist keine nicht-negative ganze Zahl.',
});

function fehler(code, mehr) {
  return { ok: false, code, error: FEHLER[code], ...mehr };
}

// Befunde, die ein Ziel unbrauchbar machen (B3). Ausdrücklich NICHT dabei sind
// die weichen Befunde: überzählige und fehlende Zellen bleiben nach E3.7, wie
// sie sind, und loser Text vor der ersten Zelle reist als Vorspann mit seinem
// Datensatz mit. Wer sie abwiese, verschärfte hier eine Regel, die das Format
// bewusst weich hält.
const ZIEL_BEFUNDE = Object.freeze(['recordIdInvalid']);

// --- Der Einstieg ----------------------------------------------------------------------

/**
 * Wendet eine Liste von Operationen auf den Text einer Tabellen-Datei an (B1).
 *
 * @param {string} inhalt Der Text der Datei, Kopf-Datei oder Folge-Segment.
 * @param {Array<{name: string, type?: string}>} fields Die normalisierten Felder
 *   der Definition in ihrer Reihenfolge; sie IST der Vertrag (E3.3).
 * @param {Array<{art: string, id: string, zellen?: Array<string>}>} operationen
 *   Die Operationen in ihrer Reihenfolge; `zellen` stehen in der Reihenfolge der
 *   Felder.
 * @param {{lastId?: number}} [optionen] Der neue Hochwasserstand, wenn er im
 *   selben Zug fortgeschrieben werden soll.
 * @returns {{ok: true, text: string, ergebnisse: Array<{art: string, id: string,
 *   zeile: number|null}>, zaun: {vorher: number|null, nachher: number,
 *   angepasst: boolean}|null}|{ok: false, code: string, error: string}}
 *   `zeile` ist der 0-basierte Zeilen-Index des Datensatz-Markers im NEUEN Text,
 *   beim Löschen null. `zaun` steht nur da, wo die Fence-Länge wachsen musste;
 *   seit 4T-001833 maskiert der Serialisierer jede zaun-artige Zeile, und der
 *   Fall bleibt auf unmaskiert vorgefundenen Text beschränkt.
 */
function schreibeDatensaetze(inhalt, fields, operationen, optionen) {
  const text = String(inhalt == null ? '' : inhalt);
  const felder = Array.isArray(fields) ? fields : [];
  if (!Array.isArray(operationen)) return fehler('operationen');

  const auftraege = [];
  for (const roh of operationen) {
    const gelesen = leseOperation(roh);
    if (!gelesen.ok) return gelesen;
    auftraege.push(gelesen.operation);
  }

  const zeilen = text.split('\n');
  // Die Zeilenenden-Konvention der Quelle, nach derselben Lesart wie
  // `writeFrontmatter` im Frontmatter-Modul. Gearbeitet wird auf einer Zerlegung
  // an `\n`; der Wagenrücklauf bleibt damit an jeder unberührten Zeile stehen,
  // und jede NEU erzeugte Zeile bekommt ihn nach der Konvention der Datei.
  const wagen = text.includes('\r\n') ? '\r' : '';
  const lage = leseLage(text, felder, zeilen);
  const geplant = lage
    ? planeImBlock(lage, zeilen, wagen, auftraege, felder)
    : planeOhneBlock(text, zeilen, wagen, auftraege, felder);
  if (!geplant.ok) return geplant;

  const neu = wendeAn(zeilen, geplant.plan);
  const stand = optionen && optionen.lastId !== undefined ? optionen.lastId : null;
  if (stand === null)
    return { ok: true, text: neu.join('\n'), ergebnisse: geplant.ergebnisse, zaun: geplant.zaun };

  const gesetzt = schreibeHochwasserstand(neu.join('\n'), stand);
  if (!gesetzt.ok) return gesetzt;
  // Eine eingefügte Angabe steht im Frontmatter und damit vor jedem Datensatz;
  // die gemeldeten Zeilen wandern um genau diese eine Zeile weiter.
  if (gesetzt.eingefuegt)
    for (const ergebnis of geplant.ergebnisse) if (ergebnis.zeile !== null) ergebnis.zeile += 1;
  return { ok: true, text: gesetzt.text, ergebnisse: geplant.ergebnisse, zaun: geplant.zaun };
}

// Eine Operation wird vollständig gelesen, bevor irgendetwas geschieht. Die
// Kennung wird dabei auf die aufgefüllte Form gebracht, weil der Parser das
// ebenso tut (E5.1) und ein Aufrufer sonst mit `r-42` ein `r-00042` nicht
// fände.
function leseOperation(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return fehler('operation');
  if (!ARTEN.includes(roh.art)) return fehler('art', { art: roh.art });
  const id = kennungFuer(nummerAus(roh.id));
  if (id === null) return fehler('kennung', { id: roh.id });
  const zellen = Array.isArray(roh.zellen) ? roh.zellen : [];
  return { ok: true, operation: { art: roh.art, id, zellen } };
}

// --- Die Lage der Datensätze in der Datei ----------------------------------------------

// Rolle, Rumpf-Grenzen und gelesener Block. `null` nur, wenn die Datei gar
// keinen Datensatz-Block trägt.
//
// **Der Rumpf wird ohne Wagenrücklauf gelesen.** Sonst trüge jeder Zell-Text
// einer CRLF-Datei ein `\r` am Zeilenende, das beim nächsten Serialisieren
// mitten in den Wert wanderte. Die Zahl der Zeilen ändert sich dadurch nicht,
// und die Zeilen-Angabe des Parsers bleibt gültig.
function leseLage(text, felder, zeilen) {
  const rumpf = datensatzRumpf(text);
  if (rumpf) {
    const rumpfZeilen = rumpf.rumpf.split('\n').map(ohneWagen);
    const gelesen = parseRecordBlock(rumpfZeilen.join('\n'), felder);
    return {
      rolle: rumpf.rolle,
      von: rumpf.vonZeile,
      bis: rumpf.vonZeile + rumpfZeilen.length - 1,
      records: gelesen.records,
      hints: gelesen.hints,
    };
  }
  // Ein vorhandener, aber leerer Block: Der Zaun steht, nur der Rumpf hat keine
  // Zeile mehr — der Zustand, in dem eine Tabelle nach dem Löschen ihres letzten
  // Datensatzes steht. `datensatzRumpf` meldet ihn nicht, und ohne diesen Zweig
  // legte B2 einen ZWEITEN Zaun in dieselbe Datei.
  const zaun = zaunZeile(zeilen);
  if (zaun < 0) return null;
  return { rolle: ROLLE_KOPF, von: zaun + 1, bis: zaun, records: [], hints: [] };
}

// Der Zeilen-Index des öffnenden Zauns der Datensatz-Fence, oder -1. Gelesen
// wird die Sprache des Infostrings wie in `record-segment.js`, also das erste
// Wort hinter dem Zaun.
//
// 4T-001833 (Epic 3E-000254): Fremde Code-Blöcke davor werden nach der
// Standard-Regel verfolgt (`zaunOeffnung`/`schliesstZaun`), wie `kopfRumpf` es
// tut. Eine Zeile ```` ```perspective-records ```` INNERHALB eines fremden
// Blocks ist dessen Inhalt und keine Öffnung; bis dahin wurde sie als solche
// genommen, und das Anlegen schrieb in den fremden Block.
function zaunZeile(zeilen) {
  let offen = null;
  for (let i = 0; i < zeilen.length; i++) {
    if (offen !== null) {
      if (schliesstZaun(zeilen[i], offen)) offen = null;
      continue;
    }
    offen = zaunOeffnung(zeilen[i]);
    if (offen !== null && offen.sprache === RECORD_FENCE) return i;
  }
  return -1;
}

function ohneWagen(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

function istLeer(zeile) {
  return zeile === undefined || ohneWagen(zeile).trim() === '';
}

// --- Der Plan: Zeilen-Bereiche statt Neu-Serialisierung ---------------------------------

// Die Operationen auf einen vorhandenen Block. Geprüft wird alles zuerst,
// geplant danach; erst `wendeAn` rührt eine Zeile an.
function planeImBlock(lage, zeilen, wagen, auftraege, felder) {
  const karte = kennungsKarte(lage.records);
  // Position im Block -> `{ zellen, ergebnisse }`, wobei `zellen: null` den
  // Entfall meint. Daneben die in DIESEM Lauf angelegten Datensätze, damit
  // Anlegen und Ändern derselben Kennung in einem Durchgang zusammenfinden (B1).
  const beruehrt = new Map();
  const neue = [];
  // Ein Ergebnis je Operation, in ihrer Reihenfolge. Die Zeile trägt es erst,
  // wenn es an einem Plan-Eintrag hängt; ein Datensatz, der im selben Lauf
  // angelegt und wieder gelöscht wird, behält deshalb `null`.
  const ergebnisse = [];

  for (const auftrag of auftraege) {
    const ergebnis = { art: auftrag.art, id: auftrag.id, zeile: null };
    ergebnisse.push(ergebnis);
    const gefunden = karte.get(auftrag.id) || [];
    const wartend = neue.find((record) => record.id === auftrag.id);

    if (auftrag.art === ART_ANLEGEN) {
      if (gefunden.length > 0 || wartend) return fehler('bereitsVorhanden', { id: auftrag.id });
      neue.push({
        id: auftrag.id,
        cells: zellenNach(leereZellen(felder), auftrag.zellen),
        ergebnisse: [ergebnis],
      });
      continue;
    }
    if (gefunden.length > 1) return fehler('mehrdeutig', { id: auftrag.id });
    if (gefunden.length === 0) {
      if (!wartend) return fehler('nichtGefunden', { id: auftrag.id });
      if (auftrag.art === ART_LOESCHEN) neue.splice(neue.indexOf(wartend), 1);
      else {
        wartend.cells = zellenNach(wartend.cells, auftrag.zellen);
        wartend.ergebnisse.push(ergebnis);
      }
      continue;
    }

    const position = gefunden[0];
    if (befundAn(lage.hints, position)) return fehler('zielBeschaedigt', { id: auftrag.id });
    const stand = beruehrt.get(position);
    if (stand && stand.zellen === null) return fehler('nichtGefunden', { id: auftrag.id });
    const zellen =
      auftrag.art === ART_LOESCHEN
        ? null
        : zellenNach((stand && stand.zellen) || zellTexte(lage.records[position]), auftrag.zellen);
    beruehrt.set(position, {
      zellen,
      ergebnisse: [...((stand && stand.ergebnisse) || []), ergebnis],
    });
  }

  const plan = [];
  const frisch = [];
  for (const [position, stand] of beruehrt) {
    const bereich = zeilenBereich(lage, position);
    if (stand.zellen === null) {
      plan.push(loeschEintrag(lage, zeilen, bereich, stand.ergebnisse));
      continue;
    }
    const gebaut = datensatzZeilen(lage.records[position], stand.zellen);
    frisch.push(...gebaut);
    for (const ergebnis of stand.ergebnisse) ergebnis.zeile = 0;
    plan.push({
      von: bereich.von,
      entfernt: bereich.bis - bereich.von + 1,
      // Die abschließenden Leerzeilen des Bereichs trennen die Datensätze und
      // gehören keinem Wert; sie wandern als Original-Zeilen mit.
      neue: [...mitWagen(gebaut, wagen), ...zeilen.slice(leerAb(zeilen, bereich), bereich.bis + 1)],
      ergebnisse: stand.ergebnisse,
    });
  }

  if (neue.length > 0) {
    const gebaut = [];
    const eigene = [];
    for (const record of neue) {
      for (const ergebnis of record.ergebnisse) ergebnis.zeile = gebaut.length;
      eigene.push(...record.ergebnisse);
      gebaut.push(...datensatzZeilen({ id: record.id }, record.cells));
    }
    frisch.push(...gebaut);
    // Angefügt wird an das Ende des vorhandenen Rumpfes, hinter seine letzte
    // nicht-leere Zeile: Eine Leerzeile am Blockende trägt Layout und bleibt
    // deshalb, wo sie ist. Ein zusätzlicher Trennabstand entsteht nicht, weil
    // die Datei ihren eigenen führt und ihn niemand erfunden hat.
    const ende = letzteVolleZeile(zeilen, lage);
    plan.push({ von: ende + 1, entfernt: 0, neue: mitWagen(gebaut, wagen), ergebnisse: eigene });
  }

  const zaun = zaunPlan(lage, zeilen, frisch);
  return { ok: true, plan: [...plan, ...zaun.plan], ergebnisse, zaun: zaun.zaun };
}

// Die Kennungen des Blocks auf ihre Positionen. Ein Datensatz ohne brauchbare
// Kennung erscheint nicht; er ist über eine Kennung nicht ansprechbar.
function kennungsKarte(records) {
  const karte = new Map();
  records.forEach((record, position) => {
    if (!record.id) return;
    if (!karte.has(record.id)) karte.set(record.id, []);
    karte.get(record.id).push(position);
  });
  return karte;
}

function befundAn(hints, position) {
  return hints.some(
    (hinweis) => hinweis.record === position && ZIEL_BEFUNDE.includes(hinweis.code),
  );
}

// Der Zeilen-Bereich eines Datensatzes in der DATEI, beide Grenzen einschließlich.
// Er reicht bis zur Zeile vor dem nächsten Datensatz, am Ende bis zur letzten
// Rumpf-Zeile; die trennende Leerzeile gehört damit an sein Ende (Vorbild
// `zeilenBereich` in change-compaction.js).
function zeilenBereich(lage, position) {
  const naechster = lage.records[position + 1];
  return {
    von: lage.von + lage.records[position].zeile,
    bis: naechster ? lage.von + naechster.zeile - 1 : lage.bis,
  };
}

// Ab welcher Zeile ein Bereich nur noch Leerzeilen trägt.
function leerAb(zeilen, bereich) {
  let i = bereich.bis;
  while (i > bereich.von && istLeer(zeilen[i])) i -= 1;
  return i + 1;
}

// Ein entfallender Datensatz nimmt seine trennende Leerzeile mit, damit keine
// doppelte zurückbleibt. Am Ende des Rumpfes bleibt sie stehen, weil sie dort
// nicht trennt, sondern das Layout des Blocks ist.
function loeschEintrag(lage, zeilen, bereich, ergebnisse) {
  const amEnde = bereich.bis === lage.bis;
  return {
    von: bereich.von,
    entfernt: bereich.bis - bereich.von + 1,
    neue: amEnde ? zeilen.slice(leerAb(zeilen, bereich), bereich.bis + 1) : [],
    ergebnisse,
  };
}

function letzteVolleZeile(zeilen, lage) {
  let i = lage.bis;
  while (i >= lage.von && istLeer(zeilen[i])) i -= 1;
  return i;
}

// --- Die Zellen eines Datensatzes -------------------------------------------------------

// 4T-001821: Der Trennabstand hinter einem Datensatz steht im Text seiner
// LETZTEN Zelle — und er gehört nicht zu ihrem Wert.
//
// **Warum er dort landet.** Der Parser kennt kein Datensatz-Ende: Alles zwischen
// der letzten Zelle und dem nächsten Marker ist Fortsetzung dieser Zelle. Eine
// trennende Leerzeile erscheint damit als abschließender Zeilenumbruch im
// Zell-Text (`"3"` wird zu `"3\n"`). Wer ihn als Wert zurückschreibt, schreibt
// ihn ein ZWEITES Mal, denn die Leerzeile wandert ohnehin als Original-Zeile am
// Ende des Zeilen-Bereichs mit. Das Ergebnis war eine zusätzliche Leerzeile je
// berührtem Datensatz, bei jedem Schreibvorgang erneut.
//
// **Die benannte Grenze:** Das Format kann einen ECHTEN mehrzeiligen Wert, der
// auf eine Leerzeile endet, nicht vom Trennabstand unterscheiden — beide werden
// als leere Fortsetzungs-Zeile geschrieben und als leere Fortsetzungs-Zeile
// gelesen. Der Umbruch gilt deshalb als Trennabstand. **Die Datei bleibt dabei
// zeichengleich**, weil die abschließenden Leerzeilen als Original-Zeilen
// erhalten bleiben; was sich ändert, ist allein ihre Zuordnung. Erst ein
// ÜBERSCHRIEBENER letzter Wert verliert sie, und dann ist es der Aufrufer, der
// den Wert ersetzt hat.
function ohneTrennabstand(text) {
  return text.replace(/\n+$/, '');
}

/**
 * Die Zell-Texte eines gelesenen Datensatzes, so wie sie zum WERT gehören.
 *
 * Exportiert, damit jeder, der einen gelesenen Wert mit einem neuen vergleicht
 * oder ihn in einen Änderungsbeleg schreibt, dieselbe Auslegung benutzt; eine
 * zweite wäre die Stelle, an der ein unveränderter Wert als geändert gälte.
 *
 * @param {{cells: Array<{text?: string}>}} record Ein Datensatz aus `parseRecordBlock`.
 * @returns {Array<string>}
 */
function zellTexte(record) {
  const texte = (record && Array.isArray(record.cells) ? record.cells : []).map((zelle) =>
    String(zelle && zelle.text != null ? zelle.text : ''),
  );
  if (texte.length > 0) texte[texte.length - 1] = ohneTrennabstand(texte[texte.length - 1]);
  return texte;
}

function leereZellen(felder) {
  return felder.map(() => '');
}

// Die übergebenen Werte stehen in der Reihenfolge der Felder (E3.3) und ersetzen
// die vorhandenen Zellen von vorn. **Was darüber hinaus in der Datei steht,
// bleibt stehen** (E3.7): Eine überzählige Zelle gehört zu keinem Feld, und ein
// stilles Wegschreiben wäre der eine Fehler, den ein Datenspeicher nicht machen
// darf. Ein neuer Datensatz bekommt eine Zelle je Feld, damit die
// positionsbasierte Zuordnung auch dann noch trägt, wenn die letzten Werte leer
// sind.
function zellenNach(vorhanden, werte) {
  const zellen = vorhanden.slice();
  werte.forEach((wert, i) => {
    zellen[i] = String(wert == null ? '' : wert);
  });
  return zellen;
}

// Die Zeilen EINES Datensatzes, über den Serialisierer des Formats und nicht über
// einen zweiten, eigenen (AK10). Kennung, nicht gedeutete Angaben und Vorspann
// des vorhandenen Datensatzes reisen unverändert mit.
function datensatzZeilen(record, zellen) {
  const gebaut = {
    id: record.id,
    attrsRest: record.attrsRest || null,
    vorspann: record.vorspann || [],
    cells: zellen.map((text) => ({ text })),
  };
  return serializeRecordBlock([gebaut], []).split('\n');
}

function mitWagen(neue, wagen) {
  return wagen === '' ? neue : neue.map((zeile) => zeile + wagen);
}

// --- Die Fence-Länge (E3.6) -------------------------------------------------------------

// Der eine benannte Fall, in dem sich eine Zeile AUSSERHALB des berührten
// Datensatzes ändert: Enthält ein neuer Wert am Zeilenanfang eine
// Backtick-Sequenz, die den vorhandenen Zaun schlösse, muss der Zaun wachsen.
// Gemessen wird allein an den neu erzeugten Zeilen, denn der vorhandene Bestand
// passt unter seinen Zaun, sonst wäre der Block gar nicht als Block gelesen
// worden.
//
// **Im Folge-Segment steht der Zaun nicht**, er gehört der Kopf-Datei. Der Fall
// wird dann im Ergebnis ausgewiesen und nicht heimlich übergangen.
//
// 4T-001833 (Epic 3E-000254, B3): **Der Fall tritt beim Schreiben der Anwendung
// nicht mehr ein.** Der Serialisierer maskiert jede zaun-artige Zeile eines
// Wertes, die neuen Zeilen verlangen deshalb den kürzesten Zaun, und der Plan
// bleibt leer. Die Anpassung bleibt als Reparatur stehen und verkürzt nie: Einen vorgefundenen längeren Zaun einer Hand-Datei lässt sie
// unverändert, weil er gültig bleibt und jede unnötige Änderung an einer
// Hand-Datei eine zu viel ist. Die Gestalt der Rückgabe bleibt, damit die
// Schreib-Schnittstelle unberührt bleibt.
const ZAUN_RE = /^([ \t]*)(`+)(.*)$/;

// Die kürzeste Zaun-Länge, die das Format kennt — nicht als eigene Zahl, sondern
// beim Format erfragt, damit es hier keine zweite Wahrheit darüber gibt.
const MINDEST_ZAUN = fenceLaengeFuer('');

function zaunPlan(lage, zeilen, frisch) {
  const noetig = frisch.length === 0 ? MINDEST_ZAUN : fenceLaengeFuer(frisch.join('\n'));
  const offen = lage.von > 0 ? zeilen[lage.von - 1] : undefined;
  const treffer = lage.rolle === ROLLE_KOPF && offen !== undefined ? offen.match(ZAUN_RE) : null;
  if (!treffer)
    return {
      plan: [],
      // Ohne sichtbaren Zaun — im Folge-Segment — lässt sich nichts anpassen.
      // Gemeldet wird deshalb der Bedarf, und nur er: Solange die neuen Werte
      // ohne Backtick-Sequenz am Zeilenanfang auskommen, gibt es keinen.
      zaun: noetig > MINDEST_ZAUN ? { vorher: null, nachher: noetig, angepasst: false } : null,
    };
  if (treffer[2].length >= noetig) return { plan: [], zaun: null };

  const plan = [zaunEintrag(lage.von - 1, treffer[1], noetig, treffer[3])];
  const schluss = zeilen[lage.bis + 1];
  const ende = schluss === undefined ? null : schluss.match(ZAUN_RE);
  if (ende) plan.push(zaunEintrag(lage.bis + 1, ende[1], noetig, ende[3]));
  return { plan, zaun: { vorher: treffer[2].length, nachher: noetig, angepasst: true } };
}

function zaunEintrag(von, einrueckung, laenge, rest) {
  return {
    von,
    entfernt: 1,
    neue: [einrueckung + '`'.repeat(laenge) + rest],
    ergebnisse: [],
  };
}

// --- Die Datei ohne Datensatz-Block (B2) ------------------------------------------------

function planeOhneBlock(text, zeilen, wagen, auftraege, felder) {
  if (rolleVon(text) !== ROLLE_KOPF) return fehler('keineTabelle');
  if (auftraege.some((auftrag) => auftrag.art !== ART_ANLEGEN)) return fehler('keinBlock');

  const records = [];
  const ergebnisse = [];
  // Der Marker des ersten Datensatzes steht zwei Zeilen hinter dem Anfang des
  // eingefügten Stücks: erst die trennende Leerzeile, dann der öffnende Zaun.
  let versatz = 2;
  for (const auftrag of auftraege) {
    if (records.some((record) => record.id === auftrag.id))
      return fehler('bereitsVorhanden', { id: auftrag.id });
    const cells = zellenNach(leereZellen(felder), auftrag.zellen);
    records.push({ id: auftrag.id, cells });
    ergebnisse.push({ art: ART_ANLEGEN, id: auftrag.id, zeile: versatz });
    versatz += datensatzZeilen({ id: auftrag.id }, cells).length;
  }

  // `baueRecordFence` wählt die Zaun-Länge selbst; ein Wachstum gibt es hier
  // nicht, weil der Zaun zusammen mit seinem Inhalt entsteht.
  const block = baueRecordFence(
    records.map((record) => ({ id: record.id, cells: record.cells.map((text) => ({ text })) })),
    [],
  ).split('\n');
  let ende = zeilen.length - 1;
  while (ende >= 0 && istLeer(zeilen[ende])) ende -= 1;
  return {
    ok: true,
    plan: [{ von: ende + 1, entfernt: 0, neue: mitWagen(['', ...block], wagen), ergebnisse }],
    ergebnisse,
    zaun: null,
  };
}

// --- Anwenden ---------------------------------------------------------------------------

// Wendet den Plan an und trägt dabei die Zeile jedes Ergebnisses im NEUEN Text
// nach. Gearbeitet wird von hinten nach vorn, damit die im Voraus berechneten
// Bereiche gültig bleiben: Jede Ersetzung liegt vollständig hinter der nächsten,
// und Zeilen vor ihr verschieben sich nicht. Alles, was kein Bereich trifft,
// wandert zeichengleich mit.
function wendeAn(zeilen, plan) {
  const geordnet = plan.slice().sort((a, b) => a.von - b.von);
  let versatz = 0;
  for (const eintrag of geordnet) {
    for (const ergebnis of eintrag.ergebnisse)
      if (ergebnis.zeile !== null) ergebnis.zeile += eintrag.von + versatz;
    versatz += eintrag.neue.length - eintrag.entfernt;
  }
  const neu = zeilen.slice();
  for (let i = geordnet.length - 1; i >= 0; i--)
    neu.splice(geordnet[i].von, geordnet[i].entfernt, ...geordnet[i].neue);
  return neu;
}

// --- Der Hochwasserstand im Frontmatter (E5.1) ------------------------------------------

const LAST_ID = 'lastId';
const BEHAELTER_RE = new RegExp(`^${DB_TABLE_KEY}[ \\t]*:(.*)$`);
const LAST_ID_RE = new RegExp(`^([ \\t]*)${LAST_ID}[ \\t]*:([ \\t]*)(\\S*)(.*)$`);

/**
 * Schreibt den Hochwasserstand in das Frontmatter fort — durch **gezielten
 * Zeilen-Eingriff**, nicht durch Auslegen und Neu-Schreiben des Blocks.
 *
 * Ein Auslegen und Neu-Schreiben formatierte Reihenfolge, Kommentare,
 * Anführungszeichen und Einrückung des Anwenders um und wäre derselbe Fehler wie
 * ein neu serialisierter Datensatz-Block. Ein vorhandener Kommentar hinter der
 * Angabe bleibt deshalb ebenso stehen wie jede andere Zeile.
 *
 * @param {string} inhalt Der Text der Kopf-Datei; allein sie trägt den Stand.
 * @param {number} stand Die höchste je vergebene Nummer der Tabelle.
 * @returns {{ok: true, text: string, eingefuegt: boolean}|{ok: false, code: string,
 *   error: string}} `eingefuegt` sagt, ob die Angabe neu hinzugekommen ist und
 *   die Datei damit eine Zeile länger wurde.
 */
function schreibeHochwasserstand(inhalt, stand) {
  const text = String(inhalt == null ? '' : inhalt);
  if (normalisiereHochwasserstand(stand) === null) return fehler('stand', { stand });
  const kopf = extractFrontmatter(text);
  if (kopf.raw === null) return fehler('keinFrontmatter');
  if (!datenbankMarken(kopf.data).includes('table')) return fehler('keinBehaelter');

  const zeilen = text.split('\n');
  const wagen = text.includes('\r\n') ? '\r' : '';
  const kopfEnde = zeilenBis(text, kopf.endOffset);
  const behaelter = zeilen.findIndex(
    (zeile, i) => i < kopfEnde && BEHAELTER_RE.test(ohneWagen(zeile)),
  );
  if (behaelter < 0) return fehler('behaelterZeile');
  const rest = ohneWagen(zeilen[behaelter]).match(BEHAELTER_RE)[1].trim();
  // Ein Behälter in Fluss-Schreibweise (`db-table: { … }`) trägt seine Angaben
  // in derselben Zeile; ein Zeilen-Eingriff hat dort keinen Angriffspunkt.
  if (rest !== '' && !rest.startsWith('#')) return fehler('behaelterInline');

  const block = behaelterBlock(zeilen, behaelter, kopfEnde);
  // Gelesen wird allein eine Angabe auf der unmittelbaren Ebene des Behälters.
  // Tiefer eingerückt stünde sie in einem Feld der Definition und meinte etwas
  // anderes.
  const vorhanden = block.zeilen.find(
    (i) => einrueckung(zeilen[i]).length === block.tiefe && LAST_ID_RE.test(ohneWagen(zeilen[i])),
  );
  if (vorhanden !== undefined) {
    // 4T-001924 (Nachzügler zu 4T-001819): Das Muster endet mit `(.*)$`, und `.`
    // nimmt keinen Wagenrücklauf; auf der rohen CRLF-Zeile fand es deshalb
    // nichts, und jede Neuanlage in einer CRLF-Tabelle endete mit einem Wurf.
    // Gesucht wird wie beim Finden ohne Wagen, der Wagen kommt danach zurück.
    const roh = zeilen[vorhanden];
    const treffer = ohneWagen(roh).match(LAST_ID_RE);
    const ende = roh.endsWith('\r') ? '\r' : '';
    zeilen[vorhanden] = `${treffer[1]}${LAST_ID}:${treffer[2] || ' '}${stand}${treffer[4]}${ende}`;
    return { ok: true, text: zeilen.join('\n'), eingefuegt: false };
  }
  const hinter = block.zeilen.length > 0 ? block.zeilen[block.zeilen.length - 1] : behaelter;
  zeilen.splice(hinter + 1, 0, `${block.einrueckung}${LAST_ID}: ${stand}${wagen}`);
  return { ok: true, text: zeilen.join('\n'), eingefuegt: true };
}

// Die Zeilen des Behälter-Blocks samt der Einrückung seiner unmittelbaren
// Angaben. Zum Block gehört jede eingerückte Zeile hinter der Behälter-Zeile;
// abschließende Leerzeilen gehören nicht dazu, weil eine neue Angabe vor ihnen
// stehen soll.
function behaelterBlock(zeilen, behaelter, kopfEnde) {
  const gehoert = [];
  for (let i = behaelter + 1; i < kopfEnde; i++) {
    const zeile = ohneWagen(zeilen[i]);
    if (zeile.trim() === '') continue;
    if (!/^[ \t]/.test(zeile)) break;
    gehoert.push(i);
  }
  const tiefen = gehoert.map((i) => einrueckung(zeilen[i]).length);
  const tiefe = tiefen.length > 0 ? Math.min(...tiefen) : 2;
  const erste = gehoert.find((i) => einrueckung(zeilen[i]).length === tiefe);
  // Eingerückt wird wie die vorhandenen Angaben, samt ihrem Zeichen; ein
  // Behälter ohne jede Angabe bekommt die zwei Leerzeichen des Hauses.
  return {
    zeilen: gehoert,
    tiefe,
    einrueckung: erste === undefined ? '  ' : einrueckung(zeilen[erste]),
  };
}

function einrueckung(zeile) {
  return ohneWagen(zeile).match(/^[ \t]*/)[0];
}

// Zeilen-Index, an dem der Rumpf hinter dem Frontmatter beginnt.
function zeilenBis(text, endOffset) {
  let zeile = 0;
  for (let i = 0; i < endOffset && i < text.length; i++) if (text[i] === '\n') zeile++;
  return zeile;
}

module.exports = {
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
  ARTEN,
  FEHLER,
  // 4T-001821: Die eine Auslegung, welcher Teil des Zell-Textes zum Wert gehört.
  zellTexte,
  schreibeDatensaetze,
  schreibeHochwasserstand,
};
