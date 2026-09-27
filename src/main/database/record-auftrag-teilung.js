// 4T-001924 (Epic 3E-000254, Story 4S-000997, Bauplan B2): Die Schreib-Schnittstelle
// teilt eine Tabelle, die durch einen Auftrag über die Byte-Schwelle wächst, im
// selben Auftrag.
//
// **Warum hier.** Die Stufe 1 hat ausgeliefert, dass ein Datensatz-Bestand beim
// Speichern ab rund 0,7 MB auf mehrere Dateien verteilt wird. Geteilt hat bis
// hierher allein der Speichern-Kanal des Editors; eine Tabelle, die nur über
// Aufträge dieser Schnittstelle wächst, erreichte den Teiler nie und würde
// beliebig groß. Der Product Owner hat am 2026-09-23 entschieden, diese Lücke
// der ausgelieferten Zusage im Schreibweg selbst zu schließen, unter der
// Klammer des Absichts-Protokolls, weil das Teilen mehrere Dateien in einem Zug
// schreibt.
//
// **Kein zweiter Teiler, keine zweite Schwelle.** Schwelle und Lese-Hilfe kommen
// aus `teilungsOptionen`, Schnittpunkte, Grenzen, Rotation und Teil-Inhalte aus
// `planeZerlegung`, die Schreib-Reihenfolge aus `schreibReihenfolge`, genau wie
// im Speichern-Kanal. Dieses Modul übersetzt nur den Bestand der Schnittstelle in
// die Teile-Form des Teilers und dessen Ergebnis zurück in Einträge des
// Schreib-Plans. Ein eigener Wert oder Schnitt hier liefe früher oder später
// vom Speichern-Kanal weg; ein Quelltext-Wächter hält das fest.
//
// **Warum nur das letzte Segment mit seinem gelesenen Text an den Teiler geht.**
// Der Teiler führt die bestehenden Grenzen über den geänderten Bereich zwischen
// altem und neuem Gesamt-Text nach; jede Grenze INNERHALB dieses Bereichs setzt
// er per Greedy neu. Ein Anlegen in einer geteilten Tabelle ändert aber immer
// zwei Dateien, die Kopf-Datei (Hochwasserstand im Frontmatter) und das letzte
// Segment. Hätte der Teiler alle Teile mit ihren gelesenen Texten bekommen,
// reichte der geänderte Bereich vom Frontmatter bis ans Ende, und alle Grenzen
// würden neu gesetzt. Gemessen am echten Teiler (2026-09-23, Schwelle 0,7 MB):
// nach 50 gelöschten Datensätzen in der Kopf-Datei wechselten bei einem
// einzigen Anlegen 99 vorhandene Datensätze die Datei, und ein großes mittleres
// Segment verlor 525 Datensätze an das letzte. Beides schließt die Ablage-Regel
// «Append-only mit Rotation und nie Rebalancing» aus. Deshalb bekommt der Teiler
// alle Teile vor dem letzten mit ihrem **neuen** Text als Bestand: Für ihn sind
// sie unverändert, der geänderte Bereich liegt allein im letzten Segment, und
// allein dort greift die Rotation. Ob eine Datei geschrieben wird, entscheidet
// deshalb nicht `geaendert` des Teilers, sondern der Vergleich seiner Ausgabe
// mit dem **gelesenen** Text der Datei.
//
// **Warum die Kopf-Datei mit im Plan steht.** Der Teiler setzt in jedem Teil die
// Zuordnungs-Zeile, auch in der Kopf-Datei (`writePartLine` in
// `document-split.js`). Beim ersten Teilen bekommt die Kopf-Datei sie erst, und
// ohne sie fände kein Leser die neuen Segmente.
//
// **Warum der Katalog der Teile nicht geschrieben wird.** Er ist ein
// Beschleuniger in der Begleitdatei der Kopf-Datei, wird nur geschrieben, wo eine
// Begleitdatei besteht, und beim nächsten Lesen neu gebaut, sobald er den
// Dateien widerspricht. Ein Schreibvorgang außerhalb der Klammer stünde gegen die
// Zusicherung «ganz oder gar nicht», und ein Schreiben darin für einen Cache
// wäre Aufwand ohne Zusage.
//
// **Kein Dialog.** Die Ankündigung des ersten Teilens gilt dem Dokument des
// Anwenders; für eine Tabellen-Datei entfällt sie schon im Speichern-Kanal.
'use strict';

const path = require('node:path');

const {
  planeZerlegung,
  schreibReihenfolge,
  ueberSchwelle,
} = require('../../shared/document-split.js');
const { assembleParts } = require('../../shared/document-assembly.js');
const {
  FIRST_PART_INDEX,
  parsePartBasename,
  readPartLine,
} = require('../../shared/document-parts.js');
const { teilungsOptionen } = require('../documents/teilungs-optionen.js');
const { LAGEN, befund } = require('./record-auftrag-pruefung.js');

function fehlschlag(bestand, grund) {
  return {
    ok: false,
    lage: befund(LAGEN.schreibenFehlgeschlagen, {
      tabelle: bestand.tabelle,
      datei: bestand.pfad,
      grund,
    }),
  };
}

// Die Dateien des Bestands als Teile, wie der Teiler sie kennt. Position und
// Name kommen aus dem Dateinamen, genau wie beim Ordnen der Teile
// (`orderPartFiles`); die Kopf-Datei ist Teil 1.
function teileAus(bestand, jePfad) {
  const teile = [];
  for (const datei of bestand.dateien) {
    const basename = path.parse(datei.pfad).name;
    const zerlegt = datei.kopf ? null : parsePartBasename(basename);
    if (!datei.kopf && zerlegt === null) return null;
    const eintrag = jePfad.get(datei.pfad);
    teile.push({
      index: datei.kopf ? FIRST_PART_INDEX : zerlegt.index,
      basename,
      pfad: datei.pfad,
      gelesen: datei.text,
      neu: eintrag ? eintrag.neu : datei.text,
    });
  }
  return teile;
}

/**
 * Prüft eine Tabelle des Plans und teilt sie bei Bedarf.
 *
 * @returns {{ok: true, eintraege: Array<object>|null}|{ok: false, lage: object}}
 *   `eintraege` ist `null`, wenn die Tabelle bleibt, wie der Plan sie schreibt.
 */
function teileTabelle(bestand, jePfad) {
  const ziel = jePfad.get(bestand.ziel);
  if (!ziel) return { ok: true, eintraege: null };
  const kopf = jePfad.get(bestand.pfad);
  const optionen = teilungsOptionen(kopf ? kopf.neu : bestand.dateien[0].text);
  if (!ueberSchwelle(ziel.neu, optionen.schwelle)) return { ok: true, eintraege: null };

  const teile = teileAus(bestand, jePfad);
  if (teile === null) return fehlschlag(bestand, 'teil-unbenannt');
  const letzter = teile.length - 1;
  // Geteilt ist die Tabelle, wenn ihre Kopf-Datei die Zuordnungs-Zeile trägt;
  // an derselben Frage entscheidet der Bestands-Leser, ob er Segmente sucht.
  const warGeteilt = readPartLine(bestand.dateien[0].text) !== null;
  const geplant = planeZerlegung({
    text: assembleParts(teile.map((t) => ({ index: t.index, content: t.neu }))).text,
    base: teile[0].basename,
    schwelle: optionen.schwelle,
    bestand: warGeteilt
      ? teile.map((t, i) => ({
          index: t.index,
          basename: t.basename,
          content: i === letzter ? t.gelesen : t.neu,
        }))
      : [],
    segmentFelder: optionen.segmentFelder,
  });
  if (geplant.ok === false) return fehlschlag(bestand, geplant.error);
  if (!geplant.geteilt) return { ok: true, eintraege: null };
  // Der Teiler führt jeden vorhandenen Teil an seiner Stelle weiter und hängt
  // neue hinten an; weniger Teile als vorher wären ein gebrochener Vertrag.
  if (geplant.teile.length < teile.length) return fehlschlag(bestand, 'teile-verloren');

  const verzeichnis = path.dirname(bestand.pfad);
  const endung = path.extname(bestand.pfad);
  const eintraege = [];
  for (const teil of schreibReihenfolge(geplant.teile)) {
    const position = geplant.teile.indexOf(teil);
    const vorhanden = position < teile.length ? teile[position] : null;
    if (vorhanden === null) {
      eintraege.push({
        pfad: path.join(verzeichnis, `${teil.basename}${endung}`),
        tabelle: bestand.tabelle,
        gelesen: null,
        neu: teil.text,
        anlegen: true,
      });
    } else if (teil.text !== vorhanden.gelesen) {
      eintraege.push({
        pfad: vorhanden.pfad,
        tabelle: bestand.tabelle,
        gelesen: vorhanden.gelesen,
        neu: teil.text,
      });
    }
  }
  return { ok: true, eintraege };
}

/**
 * Prüft den fertigen Schreib-Plan je Tabelle und ergänzt ihn um die Teilung.
 *
 * Für jede Tabelle, deren letztes Segment (beziehungsweise ungeteilte
 * Kopf-Datei) der Plan schreibt und deren neuer Text die Schwelle aus
 * `teilungsOptionen` reißt, ersetzt die Teilung die Einträge dieser Tabelle
 * durch die Einträge aller Dateien, die der Teiler ändert oder neu anlegt; ein
 * neues Segment trägt `anlegen: true` und `gelesen: null` (Bauplan B1). Die
 * Einträge stehen in der Ordnung von `schreibReihenfolge` an der Stelle der
 * ersten bisherigen Datei dieser Tabelle. Belege und Ergebnisse bleiben
 * unberührt.
 *
 * @param {{dateien: Array<object>, belege: Array<object>, ergebnisse: Array<object>}} plan
 *   Ergebnis von `baueSchreibPlan`.
 * @param {Map<string, object>} bestaende Gelesener Bestand je Tabellen-Angabe
 *   (`leseTabellenBestand`).
 * @returns {{ok: true, plan: object}|{ok: false, lagen: Array<object>}}
 */
function teileWachsendeTabellen(plan, bestaende) {
  let dateien = plan.dateien;
  for (const bestand of bestaende.values()) {
    const eigene = new Set(bestand.dateien.map((d) => d.pfad));
    const jePfad = new Map(dateien.filter((e) => eigene.has(e.pfad)).map((e) => [e.pfad, e]));
    const geteilt = teileTabelle(bestand, jePfad);
    if (!geteilt.ok) return { ok: false, lagen: [geteilt.lage] };
    if (geteilt.eintraege === null) continue;
    const stelle = dateien.findIndex((e) => eigene.has(e.pfad));
    const uebrige = dateien.filter((e) => !eigene.has(e.pfad));
    dateien = [...uebrige.slice(0, stelle), ...geteilt.eintraege, ...uebrige.slice(stelle)];
  }
  return { ok: true, plan: { ...plan, dateien } };
}

module.exports = { teileWachsendeTabellen };
