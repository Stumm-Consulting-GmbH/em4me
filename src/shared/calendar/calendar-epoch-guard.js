// 4T-002003 (Epic 3E-000307): Schutz gespeicherter Werte beim Nachtragen einer
// Epoche.
//
// **Die Ursache, an der dieses Modul ansetzt.** Ein Wert der jüngsten Epoche
// steht ohne ihr Kürzel im Dokument (`writesEpochLabel` in calendar-core.js),
// und gelesen wird ein Wert ohne Kürzel als Wert der LETZTEN Epoche
// (`parseCanonical`). Bekommt eine Zeitrechnung eine neue jüngste Epoche, liest
// das Programm deshalb jeden so gespeicherten Wert als Jahr der neuen — er
// sieht aus wie zuvor und bezeichnet einen anderen Tag. Ein Wert ab dem Beginn
// der neuen Epoche wird zudem auch mit dem Kürzel der bisherigen ungültig.
// Dieses Modul erkennt den Nachtrag, findet die betroffenen Textstellen und
// sagt, wie der Wert in der neuen Definition für denselben Tag lautet
// (Plan-Änderung vom 2026-10-01: alle umschreiben, nicht nur Kürzel ergänzen).
//
// Rein rechnend, ohne Datei- und ohne Oberflächen-Zugriff: Der Hauptprozess
// zählt damit über den Bereich (main/area/calendar-epoch-scan.js), der
// Anzeige-Prozess schreibt damit die Dokument-Notizen fort
// (settings-calendar-epoch-guard.js), und geschrieben wird über die
// Ersetzen-Strecke aus 3E-000169 mit den Lauf-Optionen von hier.
//
// Import-Richtung im Ordner: Dieses Modul lädt calendar-core.js und wird von
// keinem Modul des Ordners geladen. Der Ordner bleibt zyklenfrei.
'use strict';

// `compileSafe` und `timeStartSegs` sind ordner-interne Bausteine des Kerns;
// dieses Modul liegt im selben Ordner und darf sie laden.
const {
  epochLabel,
  formatTuple,
  parseCanonical,
  findCalendarValues,
  findCalendarByName,
  compileSafe,
  timeStartSegs,
} = require('./calendar-core.js');

function gleicheSegmente(a, b) {
  return (
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, k) => v === b[k])
  );
}

// Index, unter dem die bisher jüngste Epoche in der neuen Definition steht,
// oder -1, wenn kein Nachtrag vorliegt. Erkannt wird die Epoche an ihrem
// Beginn und nicht an Name oder Kürzel: Beides darf der Anwender im selben Zug
// ändern, ohne dass sich an der Bedeutung eines Werts etwas ändert. Steht sie
// nicht mehr in der neuen Definition oder ist sie dort weiter die jüngste, ist
// das kein Nachtrag — eine entfernte oder verschobene jüngste Epoche ist
// ausdrücklich nicht Gegenstand (Plan des Vorgangs).
function nachgetragenBei(alt, neu) {
  const altEpochen = alt.epochs;
  const neuEpochen = neu.epochs;
  if (!Array.isArray(altEpochen) || !Array.isArray(neuEpochen) || altEpochen.length < 2) return -1;
  const beginn = altEpochen[altEpochen.length - 1].start;
  if (!Array.isArray(beginn)) return -1;
  const index = neuEpochen.findIndex((e) => e && gleicheSegmente(e.start, beginn));
  return index >= 0 && index < neuEpochen.length - 1 ? index : -1;
}

/**
 * Die Zeitrechnungen, die zwischen zwei Definitionen eine neue jüngste Epoche
 * bekommen haben.
 *
 * Ein Nachtrag liegt vor, wenn die bisher jüngste Epoche mit unverändertem
 * Beginn auch in der neuen Definition steht, dort aber nicht mehr die jüngste
 * ist. Zugeordnet wird über Block- und Kalender-Kennung; abgeleitete und neu
 * angelegte Zeitrechnungen entfallen.
 *
 * @param {object|null} altKonfig Normalisierte gespeicherte Definition ({ blocks }).
 * @param {object|null} neuKonfig Normalisierte anzuwendende Definition.
 * @returns {Array<{blockId: string, calId: string, name: string, alt: object,
 *   neu: object, label: string}>} `alt` und `neu` sind die normalisierten
 *   Kalender, `name` der Anzeige-Name der neuen Definition, `label` das Kürzel
 *   der bisher jüngsten Epoche IN DER NEUEN Definition (Kürzel, ersatzweise
 *   Name, ersatzweise `#N`).
 */
function epochenNachtraege(altKonfig, neuKonfig) {
  const nachtraege = [];
  if (!altKonfig || !neuKonfig) return nachtraege;
  for (const neuBlock of neuKonfig.blocks) {
    const altBlock = altKonfig.blocks.find((b) => b.id === neuBlock.id);
    if (!altBlock) continue;
    for (const neu of neuBlock.calendars) {
      // Eine abgeleitete Zeitrechnung hat keine eigenen Epochen, sondern die
      // beiden Richtungen um ihren Nullpunkt; ein Nachtrag ist dort nicht
      // möglich.
      if (neu.derived) continue;
      const alt = altBlock.calendars.find((c) => c.id === neu.id);
      if (!alt || alt.derived) continue;
      const index = nachgetragenBei(alt, neu);
      if (index < 0) continue;
      nachtraege.push({
        blockId: neuBlock.id,
        calId: neu.id,
        name: neu.name,
        alt,
        neu,
        // Dieselbe Regel, nach der das Programm den Wert dieser Epoche selbst
        // schriebe — ein zweiter Ort für die Kürzel-Bildung entstünde sonst
        // genau dort, wo beide Lesarten übereinstimmen müssen.
        label: epochLabel(neu, index),
      });
    }
  }
  return nachtraege;
}

/**
 * Der Wert-Teil in der Schreibweise der neuen Definition, oder null, wenn die
 * Stelle kein betroffener Wert ist.
 *
 * Betroffen ist jeder Wert, der in der alten Definition gültig ist und in der
 * neuen nicht mehr denselben Tag bezeichnet — weil er anders gelesen wird
 * (ohne Kürzel) oder ungültig würde (mit dem Kürzel der bisherigen Epoche, aber
 * ab dem Beginn der neuen). Form: Datums-Teil und Kürzel, wie die neue
 * Definition denselben Tag schriebe, dahinter der Zeit-Teil, wie er im Wert
 * steht. Angeboten wird nur, was die neue Definition als dasselbe Tupel liest.
 *
 * @param {object} nachtrag Ein Eintrag aus `epochenNachtraege`.
 * @param {string} wertText Der Wert-Teil hinter dem ersten Doppelpunkt.
 * @returns {string|null}
 */
function sichereWert(nachtrag, wertText) {
  const vorher = parseCanonical(nachtrag.alt, wertText, { reportLabel: true });
  if (!vorher.ok) return null;
  // 4T-002003, Plan-Änderung vom 2026-10-01: Maßstab ist allein, ob die neue
  // Definition denselben Tag liest. Ein Kürzel im Wert schützt nicht von
  // selbst — ab dem Beginn der neuen Epoche wird ein Wert mit dem Kürzel der
  // bisherigen ungültig.
  const unveraendert = parseCanonical(nachtrag.neu, wertText);
  if (unveraendert.ok && gleicheSegmente(unveraendert.tuple, vorher.tuple)) return null;
  // Datums-Teil und Kürzel bildet die kanonische Form der neuen Definition
  // selbst (Jahreszählung der Epoche, Kürzel nach `writesEpochLabel`). Ihren
  // Zeit-Teil in Normalform übernimmt der Wert nicht: Der Anwender hat ihn so
  // geschrieben, und der Kern meldet ihn so (`timeText`). Ohne `named` trägt
  // der Datums-Teil kein Leerzeichen, und der Zeit-Teil steht nur in
  // Nicht-Minimal-Stellung dahinter — das Tupel mit Minimal-Zeit ergibt
  // deshalb genau Datum und Kürzel.
  const c = compileSafe(nachtrag.neu);
  if (!c) return null;
  const nurDatum = vorher.tuple.slice(0, c.dateCount).concat(timeStartSegs(c));
  const kanonisch = formatTuple(nachtrag.neu, nurDatum);
  if (kanonisch === null) return null;
  const neuerWert = vorher.timeText ? `${kanonisch} ${vorher.timeText}` : kanonisch;
  // Die eigentliche Zusicherung: Nur ein Wert, der danach denselben Tag
  // bezeichnet wie zuvor, wird angeboten. Eine Schreibweise, die die neue
  // Definition anders liest (gleich lautendes Kürzel einer anderen Epoche),
  // schriebe sonst eine zweite, nun sichtbare Verfälschung.
  const nachher = parseCanonical(nachtrag.neu, neuerWert);
  if (!nachher.ok || !gleicheSegmente(nachher.tuple, vorher.tuple)) return null;
  return neuerWert;
}

/**
 * Die betroffenen Textstellen eines Textes.
 *
 * Der Name wird wie beim Darstellen aufgelöst (`findCalendarByName` auf der
 * ALTEN Definition). Der Zusammenhang der Stelle spielt keine Rolle: Code,
 * Kopf-Eigenschaften, Tafeln und Canvas-Karten zählen mit.
 *
 * @param {string} text
 * @param {object|null} altKonfig Normalisierte gespeicherte Definition.
 * @param {Array} nachtraege Ergebnis von `epochenNachtraege`.
 * @returns {Array<{offset: number, laenge: number, calId: string, blockId: string,
 *   wert: string, neu: string, ersatz: string}>} `offset` zeigt auf das `@` des
 *   Werts, `laenge` ist die Länge von `@{…}`, `neu` der gesicherte Wert-Teil,
 *   `ersatz` der vollständige neue Text der Stelle `@{…}`.
 */
function findeUngesicherte(text, altKonfig, nachtraege) {
  const stellen = [];
  if (!altKonfig || !Array.isArray(nachtraege) || nachtraege.length === 0) return stellen;
  for (const fund of findCalendarValues(text)) {
    const gefunden = findCalendarByName(altKonfig, fund.name);
    if (!gefunden) continue;
    const nachtrag = nachtraege.find(
      (n) => n.blockId === gefunden.block.id && n.calId === gefunden.calendar.id,
    );
    if (!nachtrag) continue;
    const neu = sichereWert(nachtrag, fund.value);
    if (neu === null) continue;
    // Der Kopf bleibt, wie der Anwender ihn geschrieben hat: Name in seiner
    // Schreibweise, Doppelpunkt und der Leerraum dahinter.
    const doppelpunkt = fund.raw.indexOf(':');
    const leerraum = fund.raw.slice(doppelpunkt + 1).match(/^\s*/)[0];
    stellen.push({
      offset: fund.from,
      laenge: fund.to - fund.from,
      calId: nachtrag.calId,
      blockId: nachtrag.blockId,
      wert: fund.value,
      neu,
      ersatz: `${fund.raw.slice(0, doppelpunkt + 1)}${leerraum}${neu}}`,
    });
  }
  return stellen;
}

/**
 * Muster eines Laufs über die Ersetzen-Strecke.
 *
 * Der Ausdruck fasst den ganzen Wert `@{…}`, ein Fund beginnt am `@`. Er dient
 * allein dem Nachweis, dass am Offset ein Wert steht; der Ersetzungs-Text kommt
 * je Fundstelle (`ersetzungen` der Ziele, aus `ersatz` von `findeUngesicherte`),
 * weil jeder Wert seine eigene neue Schreibweise hat.
 *
 * @returns {{muster: string, flags: string, ersetzung: string, regexModus: false}}
 */
function laufOptionen() {
  // Keine zweite Erkennung der Wert-Syntax: Welche Stellen betroffen sind,
  // entscheidet `findeUngesicherte` über `findCalendarValues`. Der Ausdruck ist
  // deshalb Zeichen für Zeichen `CALENDAR_VALUE_SCAN_RE` des Kerns, samt der
  // Sperre gegen ein vorangestelltes `@` (4T-001902).
  return { muster: '(?<!@)@\\{[^{}\\n]*\\}', flags: 'g', ersetzung: '', regexModus: false };
}

module.exports = { epochenNachtraege, sichereWert, findeUngesicherte, laufOptionen };
