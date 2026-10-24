// 4T-002331 (Epic 3E-000264): Die Datensätze der Datenbank-Tabellen als eigene
// Treffer-Art der Bereichs-Suche.
//
// **Die Entscheidung dahinter** (Konzept «Datenbank-Anwendungen als Markdown»,
// E16.1 und E16.3; Sitzungs-Entscheidungen S2 und S3 des Epics): Ein Datensatz
// ist ein Treffer neben dem Dokument-Treffer und nennt den Datensatz mit seiner
// Anzeige-Form, seine Tabelle und das gefundene Feld. Der Datensatz-Block bleibt
// dabei aus dem Volltext-Suchraum (E16.2, `area-search-datensaetze.js`); was dort
// geleert wird, kommt hier als Feld-Wert zurück, mit einem Treffer, der auf den
// Datensatz zeigt statt auf eine Datei mit tausenden davon.
//
// **Kein zweiter Index und keine eigene Lese-Strecke.** Die Feld-Texte liefert
// der Tabellen-Leser (`readRecordTable`), der je Tabelle ein ausgelegtes Ergebnis
// in seinem Zwischenspeicher hält und es an Basis, Index-Stand und Overlay-Stand
// bindet; der ungespeicherte Stand einer Tabelle kommt über ihn ebenso an wie
// ihre Folge-Dateien. Ein invertierter Index deckte die Muster-Suche über
// Teilzeichenketten nicht ab und wäre eine zweite Scan-Infrastruktur.
//
// **Vorrat und Entwertung.** Je Tabelle entsteht eine vorbereitete Liste aus
// Kennung, Anzeige-Form und den nicht-leeren Feld-Texten. Sie hängt in einer
// WeakMap am Ergebnis-Objekt des Lesers: Liefert er dasselbe Objekt, ist der
// Vorrat gültig; liefert er ein neues, weil sich Datei, Index-Stand oder
// Overlay-Stand geändert haben, entsteht die Liste neu. Die Entwertung folgt
// damit den Stempeln des Lesers, ohne eine eigene Stempel-Logik zu führen, und
// fällt ein Ergebnis aus dem Zwischenspeicher des Lesers, gibt die WeakMap seine
// Liste mit frei. Ihr Umfang zählt gegen den Deckel des Text-Vorrats; oberhalb
// davon wird gesucht, aber nichts gehalten.
//
// Eigenes Modul aus demselben Grund wie die übrigen Beistell-Module der
// Bereichs-Suche: Der Suchlauf bleibt in `area-search.js`, die Fachlichkeit
// steht daneben.
'use strict';

const { trefferAnStellen } = require('../../shared/search-scope.js');
const { datensatzErfassungAktiv } = require('../index/index-schalter.js');
const { datenbankSicht } = require('../index/datenbank-bestand.js');
const { readRecordTable } = require('../index/record-table-read.js');
const { markierteDateien } = require('../database/table-catalog.js');
const { relPfad } = require('./area-search-vorrat.js');

// Vorbereitete Listen je Ergebnis-Objekt des Tabellen-Lesers.
const vorraete = new WeakMap();

// Zählt, wie oft eine Liste tatsächlich aufgebaut wurde. Der Nachweis der
// Wiederverwendung zählt Aufbauten und nicht Laufzeit.
let aufbauten = 0;

// Zwei Byte je Zeichen: Die Texte liegen als JavaScript-Zeichenketten im
// Speicher, nicht als UTF-8 auf der Platte.
const BYTES_JE_ZEICHEN = 2;

// Die Gruppen-Kennung der Datensatz-Treffer einer Tabelle: der wurzel-relative
// Pfad der Kopf-Datei mit diesem Suffix. Dieselbe Datei ergibt zwei Gruppen, die
// Prosa als Dokument-Gruppe und die Datensätze als eigene; die Trefferliste
// klappt Gruppen über ihre Kennung ein und aus und bildet daraus die
// Zeilen-Schlüssel, ohne das Suffix fielen beide zusammen. Der Anzeige-Prozess
// unterscheidet am Suffix und zeigt den Tabellen-Namen aus `gruppeTitel`. Die
// Konstante liegt im geteilten Suchkern, weil beide Prozesse sie brauchen; hier
// wird sie für die Aufrufer dieses Moduls weitergereicht.
const { DATENSATZ_GRUPPEN_SUFFIX } = require('../../shared/search-scope.js');

function leeresErgebnis() {
  return { treffer: [], gruppen: [], abgeschnitten: false, bytes: 0 };
}

// Die vorbereitete Liste einer Tabelle aus dem Ergebnis des Lesers. Nur Felder
// mit Text gehen ein, weil ein leerer Wert nichts treffen kann.
function baueListe(tabelle) {
  aufbauten += 1;
  const felder = tabelle.definition.fields;
  const datensaetze = [];
  let zeichen = 0;
  for (const record of tabelle.records) {
    const texts = Array.isArray(record.texts) ? record.texts : [];
    const eigene = [];
    for (let j = 0; j < felder.length && j < texts.length; j++) {
      const text = texts[j];
      if (typeof text !== 'string' || text === '') continue;
      eigene.push({ name: felder[j].name, text });
      zeichen += text.length;
    }
    if (eigene.length === 0) continue;
    datensaetze.push({ kennung: record.id, anzeige: record.display || record.id, felder: eigene });
  }
  return { datensaetze, bytes: zeichen * BYTES_JE_ZEICHEN };
}

// Die Fundstellen eines Feld-Textes, mit derselben Schleife wie der Suchkern
// (`trefferImText` in `search-scope.js`): lastIndex zurücksetzen und
// Null-Breiten-Treffer überspringen, sonst endet die Schleife bei `^` oder `$`
// nie.
function stellenIm(text, regex, grenze, zusatz) {
  const stellen = [];
  regex.lastIndex = 0;
  let m;
  while (stellen.length < grenze && (m = regex.exec(text)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    stellen.push({ offset: m.index, laenge: m[0].length, ...zusatz });
    // Ohne g-Flag liefert exec immer dieselbe erste Fundstelle.
    if (!regex.global) break;
  }
  return stellen;
}

// Ein Treffer des Suchkerns, ergänzt um die flachen Felder der Datensatz-Zeile,
// damit der Anzeige-Prozess nicht in `zusatz` greifen muss.
function mitFlachenFeldern(treffer) {
  const zusatz = treffer.zusatz || {};
  return {
    ...treffer,
    anzeige: zusatz.anzeige,
    feld: zusatz.feld,
    sprung: { ...treffer.sprung, tabelle: zusatz.tabelle },
  };
}

// Sucht in der Liste einer Tabelle. Liefert die Treffer der Tabelle und ob ein
// Deckel gegriffen hat.
function sucheInListe(liste, tabelle, gruppe, regex, grenze) {
  const treffer = [];
  for (const datensatz of liste.datensaetze) {
    for (const feld of datensatz.felder) {
      const rest = grenze - treffer.length;
      const zusatz = { anzeige: datensatz.anzeige, feld: feld.name, tabelle: tabelle.path };
      const stellen = stellenIm(feld.text, regex, rest, zusatz);
      if (stellen.length === 0) continue;
      const eintrag = {
        gruppe,
        titel: tabelle.table,
        text: feld.text,
        quelle: 'record',
        kennung: datensatz.kennung,
      };
      for (const t of trefferAnStellen(eintrag, stellen)) treffer.push(mitFlachenFeldern(t));
      if (treffer.length >= grenze) return { treffer, voll: true };
    }
  }
  return { treffer, voll: false };
}

/**
 * Die Datensatz-Treffer eines Bereichs.
 *
 * Synchron wie der Tabellen-Leser, auf dem die Suche steht.
 *
 * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
 * @param {string} muster Regex-Quelltext, derselbe wie für die Texte.
 * @param {string} flags Flags desselben Ausdrucks.
 * @param {object} [optionen] `restBudget` (Treffer, die nach den
 *   Dokument-Treffern noch frei sind), `jeGruppe` (Deckel je Tabelle),
 *   `istUeberholt` (Abbruch-Frage), `deckelBytes` (Obergrenze des Vorrats) und
 *   `vorratBytes` (bereits vom Text-Vorrat belegt).
 * @returns {{treffer: Array, gruppen: Array, abgeschnitten: boolean, bytes: number}|null}
 *   `null`, wenn eine jüngere Anfrage den Lauf überholt hat.
 */
function datensatzTreffer(wurzel, muster, flags, optionen = {}) {
  // Tor der Erweiterung «Datenbank» (F6 A): Im Aus-Zustand entsteht weder ein
  // Treffer noch ein Vorrat.
  if (!datensatzErfassungAktiv()) return leeresErgebnis();
  if (typeof wurzel !== 'string' || !wurzel || typeof muster !== 'string' || !muster) {
    return leeresErgebnis();
  }
  const { status, sicht, meta } = datenbankSicht(null, wurzel);
  if (status !== 'ready' || !sicht) return leeresErgebnis();
  const tabellen = markierteDateien(sicht).tabellen;
  if (tabellen.length === 0) return leeresErgebnis();

  // Ein eigener Ausdruck, nie das Objekt des Aufrufers: Sein lastIndex gehört
  // dessen Lauf.
  let regex;
  try {
    regex = new RegExp(muster, typeof flags === 'string' && flags ? flags : 'gm');
  } catch {
    return leeresErgebnis();
  }

  const istUeberholt = typeof optionen.istUeberholt === 'function' ? optionen.istUeberholt : null;
  const restBudget = Number.isInteger(optionen.restBudget) ? optionen.restBudget : Infinity;
  const jeGruppe =
    Number.isInteger(optionen.jeGruppe) && optionen.jeGruppe > 0 ? optionen.jeGruppe : 200;
  const deckelBytes = typeof optionen.deckelBytes === 'number' ? optionen.deckelBytes : Infinity;
  const vorratBytes = typeof optionen.vorratBytes === 'number' ? optionen.vorratBytes : 0;
  // Der Index-Schlüssel ist die aufgelöste Wurzel; die Gruppen-Kennung bleibt
  // relativ zur Wurzel des Suchlaufs, wie die der Dokument-Gruppen.
  const indexWurzel = (meta && meta.wurzel) || wurzel;

  const ergebnis = leeresErgebnis();
  for (const kopf of tabellen) {
    if (istUeberholt && istUeberholt()) return null;
    const frei = restBudget - ergebnis.treffer.length;
    if (frei <= 0) {
      ergebnis.abgeschnitten = true;
      break;
    }
    const tabelle = readRecordTable(indexWurzel, kopf);
    if (tabelle === null) continue;

    let liste = vorraete.get(tabelle);
    if (!liste) liste = baueListe(tabelle);
    ergebnis.bytes += liste.bytes;
    // Oberhalb des Deckels wird gesucht, aber nichts gehalten.
    if (vorratBytes + ergebnis.bytes > deckelBytes) vorraete.delete(tabelle);
    else vorraete.set(tabelle, liste);

    const gruppe = relPfad(kopf, wurzel) + DATENSATZ_GRUPPEN_SUFFIX;
    const grenze = Math.min(jeGruppe, frei);
    const { treffer, voll } = sucheInListe(liste, tabelle, gruppe, regex, grenze);
    if (voll) ergebnis.abgeschnitten = true;
    if (treffer.length === 0) continue;
    ergebnis.gruppen.push({ gruppe, titel: tabelle.table, anzahl: treffer.length });
    ergebnis.treffer.push(...treffer);
  }
  // Eine Antwort, die eine jüngere Anfrage überholt hat, geht nicht hinaus.
  if (istUeberholt && istUeberholt()) return null;
  return ergebnis;
}

// Gibt den eigenen Zustand frei. Die Listen selbst hängen an den Objekten des
// Tabellen-Lesers und fallen mit ihnen; hier bleibt allein der Zähler.
function gibDatensatzVorratFrei() {
  aufbauten = 0;
}

module.exports = {
  DATENSATZ_GRUPPEN_SUFFIX,
  datensatzTreffer,
  gibDatensatzVorratFrei,
  // Nur für Tests: Trägt ein Ergebnis-Objekt des Lesers einen vorbereiteten
  // Vorrat, und wie oft wurde eine Liste aufgebaut?
  _nurFuerTests: {
    hatVorrat: (leserObjekt) => vorraete.has(leserObjekt),
    aufbauten: () => aufbauten,
  },
};
