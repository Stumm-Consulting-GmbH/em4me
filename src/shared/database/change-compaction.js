// 4T-001791 (Epic 3E-000255, E10.9 bis E10.11): Die Verdichtung der
// Änderungsbelege als reine Funktion — die beiden Vorgabewerte, das Auflösen
// der wirksamen Grenzen, die Auswahl der Datensätze, die Bildung der Spannen,
// der Bau des verdichteten Belegs und die neue Fassung der Datei als Text.
//
// **Die Doppelschwelle wirkt zweistufig** (Bauplan V3): Die Datei-Größe ist der
// **Auslöser**, die Beleg-Zahl je Datensatz die **Auswahl**. Erst wenn die
// Beleg-Datei ihre Größen-Schwelle überschreitet, geschieht überhaupt etwas;
// verdichtet werden dann genau die Datensätze, deren eigene Beleg-Zahl über
// ihrer Schwelle liegt. Nur so trifft die Verdichtung die Verursacher und nicht
// die Nachbarn, und nur so bleibt die Geschichte einer selten geänderten
// Tabelle vollständig.
//
// **Verdichtet wird, nicht gelöscht** (E10.10). Kein Beleg verschwindet
// spurlos: Die älteren Belege eines Datensatzes werden zu **einem** Beleg der
// Art `merged` zusammengefasst, der den Zustand am Anfang und am Ende der
// Spanne trägt und die Zahl der ersetzten Änderungen nennt. Tragend ist die
// Verkettung, denn der verdichtete Beleg schließt an beide Seiten lückenlos an;
// ein gelöschter Beleg risse die Kette ab, und danach wäre nicht mehr
// unterscheidbar, ob der älteste vorhandene Beleg der erste war. Eine
// Archiv-Datei entsteht ebenso nicht: Sie verteilt, statt zu begrenzen.
//
// **Die neue Fassung entsteht durch Ersetzen von Zeilen-Bereichen** und nicht
// durch Neu-Serialisieren der Datei (Bauplan V4). Das ist keine Optimierung,
// sondern die Zusage: Beschädigte Belege und alles, was das Lesen nicht deutet,
// reisen zeichengleich mit, und die Verdichtung repariert nichts und verwirft
// nichts. Die Zeilen-Bereiche liefert das Lesen über die Angabe `zeile` je
// Beleg.
//
// **Nicht hier:** der Datei-Zugriff, die Naht der Sperre und das atomare
// Ersetzen. Sie liegen im Haupt-Prozess in `src/main/database/change-log.js`,
// weil allein dort der Bestand bekannt ist. Hier steht keine Auslösung und kein
// Takt; die Timer-Linie ist mit E9.4 ausgeschlossen.
//
// Prozess-neutral (kein Electron, kein DOM, kein Datei-Zugriff).
'use strict';

// Die Byte-Schwelle der technischen Ablage einer Datenbank. Bewusst KEINE
// zweite Zahl (Bauplan V7): Die Dokument-Teilung führt für die technische
// Ablage genau diese Schwelle, gegenüber 1 MB für Dokumente des Anwenders, und
// begründet den Unterschied damit, dass eine Ablage größenunabhängig schnell
// bleiben soll. Die Beleg-Datei ist technische Ablage derselben Datenbank; eine
// eigens gewählte Zahl daneben wäre eine zweite Wahrheit über dieselbe Frage.
const { ABLAGE_SCHWELLE } = require('../document-split-punkte.js');
const {
  ART_DEFINITION,
  ART_EXTERNAL,
  ART_MERGED,
  baueBeleg,
  leseBelege,
  serialisiereBeleg,
} = require('./change-record.js');

// --- Die beiden Vorgabewerte, an genau einer Stelle (AK4) ------------------------------

/**
 * Größe der Beleg-Datei, ab der überhaupt verdichtet wird: 0,7 MB.
 *
 * Der Wert ist nicht neu erfunden, sondern der bereits entschiedene (siehe die
 * Begründung am Import oben).
 */
const VORGABE_MAX_BYTES = ABLAGE_SCHWELLE;

/**
 * Beleg-Zahl je Datensatz, ab der seine älteren Belege verdichtet werden: 200.
 *
 * Nach unten begrenzt der Nutzen: Ein Datensatz, der wöchentlich geändert wird,
 * behält bei 200 Belegen rund vier Jahre seiner Geschichte ungekürzt, und das
 * ist die Spanne, in der jemand eine Änderung tatsächlich zurückverfolgt. Nach
 * oben begrenzt die Lesbarkeit: Eine Beleg-Liste mit mehreren hundert Einträgen
 * liest niemand mehr am Stück, und die Verdichtung verliert dann ihren zweiten
 * Nutzen, nämlich den Überblick. 200 liegt dazwischen und ist bewusst
 * großzügig, weil Verdichten Information kostet und der Preis später nicht
 * zurückzuholen ist.
 */
const VORGABE_MAX_JE_DATENSATZ = 200;

// Das Wort, mit dem die Definition eine Schwelle abschaltet (E10.11), steht im
// Blatt-Modul der Frontmatter-Notation und wird von hier unverändert
// weitergereicht, damit sich für die Verbraucher dieses Moduls nichts ändert.
const { UNBEGRENZT } = require('./behaelter.js');

// --- Die wirksamen Grenzen ------------------------------------------------------------

// Eine Angabe ist entweder das Wort «unbegrenzt» oder eine ganze Zahl über
// null. Alles andere ist keine Angabe; die Übersteuerung wird in
// `table-definition.js` geprüft und gemeldet, hier gilt dann die Vorgabe.
function grenzwert(roh, vorgabe) {
  if (roh === UNBEGRENZT) return UNBEGRENZT;
  if (typeof roh === 'number' && Number.isSafeInteger(roh) && roh > 0) return roh;
  return vorgabe;
}

/**
 * Die wirksamen Grenzen aus Vorgabe und Übersteuerung.
 *
 * Idempotent: Ein bereits aufgelöstes Ergebnis kommt unverändert zurück, sodass
 * die Funktion am Einstieg und in der Verdichtung selbst stehen darf.
 *
 * @param {{maxBytes?: number|string, maxPerRecord?: number|string}} [uebersteuerung]
 * @returns {{maxBytes: number|string, maxPerRecord: number|string}}
 */
function loeseGrenzen(uebersteuerung) {
  const u = uebersteuerung && typeof uebersteuerung === 'object' ? uebersteuerung : {};
  return {
    maxBytes: grenzwert(u.maxBytes, VORGABE_MAX_BYTES),
    maxPerRecord: grenzwert(u.maxPerRecord, VORGABE_MAX_JE_DATENSATZ),
  };
}

/**
 * Überschreitet die Beleg-Datei ihre Größen-Schwelle?
 *
 * @param {number} bytes Größe der Beleg-Datei.
 * @param {object} [grenzen] Wirksame oder rohe Grenzen.
 * @returns {boolean}
 */
function istUeberGroesse(bytes, grenzen) {
  const g = loeseGrenzen(grenzen);
  if (g.maxBytes === UNBEGRENZT) return false;
  return typeof bytes === 'number' && bytes > g.maxBytes;
}

/**
 * Wie viele der jüngsten Belege eines Datensatzes einzeln stehen bleiben.
 *
 * **Die Hälfte ist die Hysterese** (Bauplan V3): Verdichtete man nur bis knapp
 * unter die Schwelle, löste der nächste Schreibvorgang die nächste Verdichtung
 * aus, und jede schriebe die ganze Datei um. Abgerundet, mindestens einer.
 *
 * @param {number|string} maxJeDatensatz
 * @returns {number}
 */
function behalteAnzahl(maxJeDatensatz) {
  if (maxJeDatensatz === UNBEGRENZT) return Infinity;
  return Math.max(1, Math.floor(maxJeDatensatz / 2));
}

// --- Die Spannen ----------------------------------------------------------------------

// Ein Beleg, über den eine Spanne nie hinweggeht. Er bleibt unverändert stehen,
// und davor und danach entsteht je eine eigene Spanne.
//
// Drei Fälle, jeder mit eigenem Grund: Ein Beleg der Art `external` hält eine
// Änderung von Hand fest, die eine Verdichtung über ihn hinweg verschwinden
// ließe. Bei einem beschädigten Beleg ist unbekannt, was er geändert hat. Und
// ein Beleg mit ungedeutetem Vorspann trägt Text, den nur seine Zeilen tragen;
// ihn in eine Spanne zu ziehen hieße, ihn zu verwerfen, und die Verdichtung
// verwirft nichts (Bauplan V4).
function istNaht(beleg) {
  return (
    beleg.beschaedigt === true ||
    beleg.art === ART_EXTERNAL ||
    (Array.isArray(beleg.vorspann) && beleg.vorspann.length > 0)
  );
}

// Zerlegt die zu verdichtenden Belege eines Datensatzes in Spannen. Eine Spanne
// aus einem einzigen Beleg bleibt, wie sie ist, und erscheint deshalb nicht im
// Ergebnis: Zusammenzufassen wäre dort nichts, und der verdichtete Beleg trüge
// die Zahl eins statt einer Auskunft.
function spannenAus(kandidaten) {
  const spannen = [];
  let laufend = [];
  for (const eintrag of kandidaten) {
    if (istNaht(eintrag.beleg)) {
      if (laufend.length > 1) spannen.push(laufend);
      laufend = [];
      continue;
    }
    laufend.push(eintrag);
  }
  if (laufend.length > 1) spannen.push(laufend);
  return spannen;
}

// Die berührten Felder der Spanne: je Feld der Wert VOR der Spanne (der alte
// Wert des ersten Belegs, der das Feld berührt) und der Wert AN IHREM ENDE (der
// neue Wert des letzten). Die Reihenfolge ist die des ersten Auftretens.
//
// `noOld` und `noNew` gelten unverändert, weil sie sich aus dem fehlenden Wert
// ergeben: Eine Spanne, die mit dem Anlegen beginnt, bleibt damit am fehlenden
// alten Wert als Anfang der Kette erkennbar (Bauplan V2).
function felderDerSpanne(spanne) {
  const reihenfolge = [];
  const stand = new Map();
  for (const { beleg } of spanne) {
    for (const feld of beleg.felder || []) {
      if (stand.has(feld.name)) stand.get(feld.name).neu = feld.neu;
      else {
        stand.set(feld.name, { name: feld.name, alt: feld.alt, neu: feld.neu });
        reihenfolge.push(feld.name);
      }
    }
  }
  return reihenfolge.map((name) => stand.get(name));
}

// Zahl der ersetzten Änderungen, Anfang der Spanne und die ersetzten Arten.
//
// **Ein bereits verdichteter Beleg geht mit seinem eigenen `count` in die Summe
// ein** (AK10), mit seinem eigenen `since` in den Anfang und mit seinen eigenen
// Arten in die Vereinigung. Ohne das verlöre eine zweite Verdichtung die Zahl
// der ersetzten Änderungen, und der Beleg behauptete, er ersetze zwei, wo er
// zweihundert ersetzt.
function verdichtungDerSpanne(spanne) {
  let anzahl = 0;
  let seit = null;
  const arten = [];
  for (const { beleg } of spanne) {
    const eigene = beleg.verdichtung;
    anzahl += eigene ? eigene.anzahl : 1;
    const anfang = eigene ? eigene.seit : beleg.zeitpunkt;
    if (seit === null || anfang < seit) seit = anfang;
    for (const art of eigene ? eigene.arten : [beleg.art])
      if (!arten.includes(art)) arten.push(art);
  }
  return { anzahl, seit, arten };
}

// Der verdichtete Beleg einer Spanne. Sein Zeitpunkt ist der des jüngsten
// ersetzten Belegs, also des letzten in Datei-Reihenfolge; eine Vorgangs-Kennung
// trägt er nicht, weil die Spanne viele Vorgänge umfasst.
function baueVerdichteten(id, spanne) {
  const juengster = spanne[spanne.length - 1].beleg;
  return baueBeleg({
    art: ART_MERGED,
    id,
    zeitpunkt: juengster.zeitpunkt,
    vorgang: null,
    felder: felderDerSpanne(spanne),
    verdichtung: verdichtungDerSpanne(spanne),
  });
}

// --- Die neue Fassung als Text --------------------------------------------------------

// Der Zeilen-Bereich eines Belegs im Ursprungs-Text, beide Grenzen
// einschließlich. Er reicht bis zur Zeile vor dem nächsten Beleg der DATEI,
// nicht des Datensatzes; die trennende Leerzeile gehört damit an sein Ende.
function zeilenBereich(belege, index, zeilenZahl) {
  const von = belege[index].zeile;
  const naechster = belege[index + 1];
  return { von, bis: naechster ? naechster.zeile - 1 : zeilenZahl - 1 };
}

// Die abschließenden Leerzeilen eines Bereichs. Sie trennen die Belege
// voneinander und gehören keinem Wert: Die letzten beiden Zellen eines Belegs
// sind Benutzer und Rechner, beide einzeilig, und ein Beleg endet deshalb nie
// mit einer leeren Zeile. Die Marker-Zeile bleibt in jedem Fall außen vor.
function leerSuffix(zeilen, von, bis) {
  let i = bis;
  while (i > von && zeilen[i] === '') i -= 1;
  return zeilen.slice(i + 1, bis + 1);
}

// Wendet die Ersetzungen auf den Ursprungs-Text an.
//
// Gearbeitet wird von hinten nach vorn, damit die im Voraus berechneten
// Zeilen-Bereiche gültig bleiben: Jede Ersetzung liegt vollständig hinter der
// nächsten, und Zeilen vor ihr verschieben sich nicht. Alles, was kein Bereich
// trifft, wandert zeichengleich mit.
function neueFassung(text, belege, ersetzungen) {
  const zeilen = text.split('\n');
  const zeilenZahl = zeilen.length;
  const plan = ersetzungen
    .map(({ index, zeilen: neue }) => ({ ...zeilenBereich(belege, index, zeilenZahl), neue }))
    .sort((a, b) => b.von - a.von);
  for (const { von, bis, neue } of plan) {
    const suffix = leerSuffix(zeilen, von, bis);
    // Ein entfallender Beleg nimmt seine trennende Leerzeile mit, damit keine
    // doppelte zurückbleibt. Am Datei-Ende bleibt sie stehen, weil sie dort das
    // abschließende Zeilenende der Datei ist.
    const entfaellt = neue.length === 0 && bis < zeilenZahl - 1;
    zeilen.splice(von, bis - von + 1, ...(entfaellt ? [] : [...neue, ...suffix]));
  }
  return zeilen.join('\n');
}

// --- Die Verdichtung ------------------------------------------------------------------

const LEERE_AUSKUNFT = Object.freeze({ datensaetze: [], spannen: 0, ersetzt: 0 });

// Die Belege je Datensatz, in Datei-Reihenfolge und mit ihrer Stelle in der
// Datei. Belege der Art `definition` hängen an keinem Datensatz und werden
// nicht berührt.
//
// **Gezählt wird in Belegen der Datei und nicht in Änderungen** (Bauplan V3):
// Ein verdichteter Beleg zählt als einer, ein beschädigter ebenso, denn beide
// stehen als Zeile in der Datei und wiegen dort.
function jeDatensatz(belege) {
  const karte = new Map();
  belege.forEach((beleg, index) => {
    if (!beleg || beleg.id === null || beleg.art === ART_DEFINITION) return;
    if (!karte.has(beleg.id)) karte.set(beleg.id, []);
    karte.get(beleg.id).push({ index, beleg });
  });
  return karte;
}

/**
 * Verdichtet den Text einer Beleg-Datei.
 *
 * Die Größen-Schwelle prüft der Aufrufer über `istUeberGroesse`, bevor er die
 * Datei überhaupt liest; hier wirkt allein die Beleg-Zahl je Datensatz.
 *
 * @param {string} inhalt Der Text der Beleg-Datei.
 * @param {object} [grenzen] Wirksame oder rohe Grenzen.
 * @returns {{veraendert: boolean, text: string,
 *   auskunft: {datensaetze: Array<{id: string, spannen: number, ersetzt: number}>,
 *   spannen: number, ersetzt: number}}} `text` ist bei `veraendert: false` der
 *   Ursprungs-Text, unverändert.
 */
function verdichte(inhalt, grenzen) {
  const text = String(inhalt == null ? '' : inhalt);
  const g = loeseGrenzen(grenzen);
  const { belege } = leseBelege(text);

  const ersetzungen = [];
  const datensaetze = [];
  let spannenZahl = 0;
  let ersetztZahl = 0;

  for (const [id, eintraege] of jeDatensatz(belege)) {
    if (g.maxPerRecord === UNBEGRENZT || eintraege.length <= g.maxPerRecord) continue;
    const behalten = behalteAnzahl(g.maxPerRecord);
    const spannen = spannenAus(eintraege.slice(0, eintraege.length - behalten));
    if (spannen.length === 0) continue;

    let ersetzt = 0;
    for (const spanne of spannen) {
      const verdichteter = baueVerdichteten(id, spanne);
      // Die älteren Belege der Spanne entfallen an ihrer Stelle; der verdichtete
      // tritt an die Stelle des jüngsten. Die Datei-Reihenfolge bleibt damit die
      // zeitliche, für den betroffenen Datensatz wie für alle anderen (V4).
      for (let k = 0; k < spanne.length - 1; k += 1)
        ersetzungen.push({ index: spanne[k].index, zeilen: [] });
      ersetzungen.push({
        index: spanne[spanne.length - 1].index,
        zeilen: serialisiereBeleg(verdichteter).split('\n'),
      });
      ersetzt += spanne.length;
    }
    datensaetze.push({ id, spannen: spannen.length, ersetzt });
    spannenZahl += spannen.length;
    ersetztZahl += ersetzt;
  }

  if (ersetzungen.length === 0) return { veraendert: false, text, auskunft: LEERE_AUSKUNFT };
  return {
    veraendert: true,
    text: neueFassung(text, belege, ersetzungen),
    auskunft: { datensaetze, spannen: spannenZahl, ersetzt: ersetztZahl },
  };
}

module.exports = {
  VORGABE_MAX_BYTES,
  VORGABE_MAX_JE_DATENSATZ,
  UNBEGRENZT,
  LEERE_AUSKUNFT,
  loeseGrenzen,
  istUeberGroesse,
  behalteAnzahl,
  verdichte,
};
