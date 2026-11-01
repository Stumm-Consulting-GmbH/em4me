// 4T-002404 (Epic 3E-000266, S1): Die Prüfung eines Datensatzes, aus der
// Konsistenz-Prüfung (`konsistenz-pruefung.js`) geschnitten.
//
// **Eine Prüfung, mehrere Folgen.** Was ein Datensatz gegen die Regeln seiner
// Tabelle verletzt, beantwortet dieses Modul an genau einer Stelle: Zellen-Zahl,
// Pflicht, Typ, Feld-Regeln, Verweise und Datensatz-Regeln je Datensatz
// (`pruefeDatensatz`), dazu die Schlüssel-Dublette über den Bestand
// (`schluesselDubletten`). Es liefert Befunde und nie eine Folge. **Die Folge
// bestimmt der Aufrufer:** Die Konsistenz-Prüfung listet die Befunde, das
// Speichern einer Karteikarte meldet sie (`speicher-pruefung.js`), und die
// Schreib-Schnittstelle weist über ihr eigenes Regel-Werk ab. Wer einen
// einzelnen Datensatz prüft, nennt deshalb seine Herkunft
// (`pruefeKarteikarte`, Parameter `herkunft`), statt sie aus dem Zustand zu
// erraten (Epic 3E-000266, «Offene Punkte / Risiken»).
//
// **Ohne Verhaltensänderung geschnitten.** Die Rümpfe von `spaltenIndex` bis
// `schluesselDubletten` stehen hier zeichengleich wie zuvor in der
// Konsistenz-Prüfung; neu sind allein `stellenDer`, der Bau der Fundstellen,
// den die Konsistenz-Prüfung bis dahin in `pruefeTabelle` führte, und
// `pruefeKarteikarte`, die Anwendung auf eine einzelne Karteikarte.
//
// Electron-frei; Dateizugriff und Sicht kommen über den Lauf der Regel-Hilfen
// herein (`record-regel-hilfen.js`). Das Modul schreibt nichts.
'use strict';

const {
  baueRegelKontext,
  pruefeFeldRegeln,
  pruefeDatensatzRegeln,
} = require('../../shared/database/record-check-eval.js');
const { CELL_ERRORS } = require('../../shared/database/record-values.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { schluesselKey } = require('../../shared/database/record-schluessel.js');
const identitaet = require('../../shared/database/record-identity.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { werteDes, zellText } = require('./record-auftrag-plan.js');
const { kennungVorhanden } = require('./record-auftrag-bestand.js');
const {
  VERWEIS_TYP,
  zielAngabe,
  findeKopfDatei,
  bestandFuer,
} = require('./record-regel-hilfen.js');
const { KONSISTENZ_BEFUNDE, befund } = require('./konsistenz-befunde.js');

// Die Zell-Befunde des Typs, wie `zellWert` sie vergibt. `required` und `check`
// stammen aus der Lese-Seite der Prüfregeln und haben hier eigene Befunde.
const TYP_FEHLER = new Set([
  CELL_ERRORS.number,
  CELL_ERRORS.date,
  CELL_ERRORS.time,
  CELL_ERRORS.boolean,
]);

// Die Teile eines Schlüssels für die Anzeige verbunden, wie in der
// Schlüssel-Regel; der interne Trenner des Vergleichs gehört in keine Meldung.
const ANZEIGE_TRENNER = ' / ';

// Der Index einer Spalte nach Namen, ohne Rücksicht auf die Schreibung.
function spaltenIndex(fields, name) {
  if (typeof name !== 'string') return -1;
  const klein = name.toLowerCase();
  return fields.findIndex((feld) => feld.name.toLowerCase() === klein);
}

// --- Die Datensätze einer Tabelle --------------------------------------------------------

// Jeder Datensatz einmal, in Datei-Reihenfolge, mit Datei und Datei-Zeile.
// Eine Kennung, die in zwei Dateien steht, zählt beim ersten Vorkommen; das
// zweite ist der Befund der Kennungs-Dublette und kein zweiter Datensatz.
function datensaetzeDer(bestand) {
  const liste = [];
  const dateienJeKennung = new Map();
  for (const datei of bestand.dateien) {
    const rumpf = datensatzRumpf(datei.text);
    for (const [id, record] of datei.records) {
      if (!dateienJeKennung.has(id)) {
        dateienJeKennung.set(id, []);
        const zeile =
          rumpf && typeof record.zeile === 'number' ? rumpf.vonZeile + record.zeile + 1 : null;
        liste.push({ id, record, datei: datei.pfad, zeile });
      }
      dateienJeKennung.get(id).push(datei);
    }
  }
  return { liste, dateienJeKennung };
}

// Die Anzeige-Form eines Datensatzes, getrimmt; leer heißt null, und der
// Bedienort fällt auf die Kennung zurück (Muster der Datensatz-Liste).
function anzeigeVon(anzeigeIndex, texte) {
  if (anzeigeIndex < 0) return null;
  const text = zellText(texte, anzeigeIndex).trim();
  return text === '' ? null : text;
}

// --- Verweise ----------------------------------------------------------------------------

// Die Schlüssel-Karte einer Ziel-Tabelle, einmal je Tabelle und Lauf:
// Schlüssel-Wert -> Kennungen. Verglichen wird zeichengenau und ungetrimmt, wie
// in der Verweis-Regel.
function schluesselKarteDes(ziel, karten, kopf) {
  const schluessel = pathCompareKey(kopf);
  if (karten.has(schluessel)) return karten.get(schluessel);
  const index = spaltenIndex(ziel.bestand.fields, ziel.key[0]);
  const karte = new Map();
  for (const { id, record } of datensaetzeDer(ziel.bestand).liste) {
    const wert = zellText(werteDes(record), index);
    if (!karte.has(wert)) karte.set(wert, []);
    karte.get(wert).push(id);
  }
  karten.set(schluessel, karte);
  return karte;
}

// Prüft eine nicht leere Verweis-Zelle; liefert einen Befund oder null.
async function pruefeVerweis({ lauf, sicht, karten, feld, text, stelle }) {
  const zelle = legeVerweisZelleAus(text);
  if (zelle.art === VERWEIS_ARTEN.leer) return null;
  const mit = { ...stelle, feld: feld.name, wert: text };
  const angabe = zielAngabe(feld);
  if (angabe === null)
    return befund(KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt, { ...mit, grund: 'zielAngabeFehlt' });
  const kopf = findeKopfDatei(sicht, angabe);
  const ziel = kopf === null ? null : await bestandFuer(lauf, kopf);
  if (ziel === null || !ziel.ok)
    return befund(KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt, { ...mit, zieltabelle: angabe });
  const mitZiel = { ...mit, zieltabelle: ziel.name };
  if (zelle.art === VERWEIS_ARTEN.kennung) {
    if (kennungVorhanden(ziel.bestand, zelle.wert)) return null;
    return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, mitZiel);
  }
  const key = ziel.key;
  if (key === null || key.length === 0 || spaltenIndex(ziel.bestand.fields, key[0]) < 0)
    return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, { ...mitZiel, grund: 'keinSchluessel' });
  if (key.length > 1) return befund(KONSISTENZ_BEFUNDE.verweisSchluesselMehrteilig, mitZiel);
  const treffer = schluesselKarteDes(ziel, karten, kopf).get(zelle.wert) || [];
  if (treffer.length === 0) return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, mitZiel);
  if (treffer.length > 1)
    return befund(KONSISTENZ_BEFUNDE.verweisMehrdeutig, {
      ...mitZiel,
      anzahl: treffer.length,
      kennungen: [...treffer].sort(identitaet.nachNummer),
    });
  return null;
}

// --- Ein Datensatz -----------------------------------------------------------------------

function meldungVon(verletzung) {
  return verletzung.message === null || verletzung.message === undefined ? '' : verletzung.message;
}

// Zellen-Zahl, Pflicht, Typ, Feld-Regeln und Verweise je Feld, danach die
// Datensatz-Regeln. Die Zell-Texte folgen der Auslegung des Schreibwegs
// (`werteDes`): Der Trennabstand vor dem Zaun gehört nicht zum Wert.
async function pruefeDatensatz(kontext, eintrag, stelle) {
  const { bestand, definition, lauf, sicht, karten } = kontext;
  const { fields } = bestand;
  const { record } = eintrag;
  const befunde = [];
  const texte = werteDes(record);
  if (record.cells.length !== fields.length)
    befunde.push(
      befund(KONSISTENZ_BEFUNDE.zellenZahl, {
        ...stelle,
        wert: String(record.cells.length),
        anzahl: fields.length,
      }),
    );
  const regelKontext = baueRegelKontext(fields, texte);
  for (let i = 0; i < fields.length; i++) {
    const feld = fields[i];
    const zelle = record.cells[i];
    const text = zellText(texte, i);
    // Die leere Zelle des Wahrheitswerts ist der Wert «nein» und kein fehlender
    // (dieselbe Regel wie beim Lesen und Schreiben).
    const leer = zelle === undefined || text.trim() === '';
    if (feld.required === true && feld.type !== 'boolean' && leer) {
      befunde.push(befund(KONSISTENZ_BEFUNDE.pflichtFehlt, { ...stelle, feld: feld.name }));
      continue;
    }
    if (zelle === undefined) continue;
    if (TYP_FEHLER.has(zelle.error)) {
      befunde.push(
        befund(KONSISTENZ_BEFUNDE.typVerletzt, { ...stelle, feld: feld.name, wert: text.trim() }),
      );
      continue;
    }
    for (const v of pruefeFeldRegeln(feld, text, regelKontext))
      befunde.push(
        befund(KONSISTENZ_BEFUNDE.pruefregelVerletzt, {
          ...stelle,
          feld: v.feld,
          wert: v.wert,
          regel: v.quelle,
          meldung: meldungVon(v),
          grund: v.grund,
        }),
      );
    if (feld.type === VERWEIS_TYP) {
      const gefunden = await pruefeVerweis({ lauf, sicht, karten, feld, text, stelle });
      if (gefunden !== null) befunde.push(gefunden);
    }
  }
  for (const v of pruefeDatensatzRegeln(definition.checks, regelKontext, fields))
    befunde.push(
      befund(KONSISTENZ_BEFUNDE.datensatzregelVerletzt, {
        ...stelle,
        felder: v.felder,
        regel: v.quelle,
        meldung: meldungVon(v),
        grund: v.grund,
      }),
    );
  return befunde;
}

// --- Eindeutigkeit -------------------------------------------------------------------------

// Die Alt-Dublette des fachlichen Schlüssels (E22.5): je beteiligtem Datensatz
// ein Befund mit allen Kennungen. Ein leerer Teil nimmt den Schlüssel aus der
// Prüfung, wie in der Schlüssel-Regel; ein Schlüssel, dessen Felder die
// Definition nicht kennt, hat nichts zu prüfen.
function schluesselDubletten(bestand, key, eintraege, stellen) {
  const befunde = new Map();
  if (!Array.isArray(key) || key.length === 0) return befunde;
  const indizes = key.map((name) => spaltenIndex(bestand.fields, name));
  if (indizes.some((i) => i < 0)) return befunde;
  const felder = indizes.map((i) => bestand.fields[i].name);
  const gruppen = new Map();
  eintraege.forEach((eintrag, n) => {
    const teile = indizes.map((i) => zellText(werteDes(eintrag.record), i));
    if (teile.some((teil) => teil === '')) return;
    const vergleich = schluesselKey(teile);
    if (!gruppen.has(vergleich)) gruppen.set(vergleich, { teile, positionen: [] });
    gruppen.get(vergleich).positionen.push(n);
  });
  for (const { teile, positionen } of gruppen.values()) {
    if (positionen.length < 2) continue;
    const kennungen = positionen.map((n) => eintraege[n].id).sort(identitaet.nachNummer);
    for (const n of positionen)
      befunde.set(
        n,
        befund(KONSISTENZ_BEFUNDE.schluesselDoppelt, {
          ...stellen[n],
          felder,
          wert: teile.join(ANZEIGE_TRENNER),
          kennungen,
        }),
      );
  }
  return befunde;
}

// --- Fundstellen ---------------------------------------------------------------------------

/**
 * Die Fundstelle jedes Datensatzes einer Tabelle, in der Reihenfolge von `liste`.
 *
 * @param {{tabelle: string, pfad: string}} kopfStelle Tabelle und Kopf-Datei.
 * @param {Array<object>} liste Ergebnis `liste` von `datensaetzeDer`.
 * @param {object} bestand Der Bestand der Tabelle.
 * @param {object} definition Die Definition der Tabelle.
 * @returns {Array<object>} Je Datensatz Tabelle, Kopf-Datei, Datei, Zeile,
 *   Kennung und Anzeige-Form.
 */
function stellenDer(kopfStelle, liste, bestand, definition) {
  const anzeigeIndex = spaltenIndex(bestand.fields, identitaet.anzeigeSpalte(definition));
  return liste.map((eintrag) => ({
    ...kopfStelle,
    datei: eintrag.datei,
    zeile: eintrag.zeile,
    id: eintrag.id,
    anzeige: anzeigeVon(anzeigeIndex, werteDes(eintrag.record)),
  }));
}

// --- Eine Karteikarte ------------------------------------------------------------------------

// Die Herkunft eines Aufrufs, der einen einzelnen Datensatz prüft. Sie sagt dem
// Leser des Ergebnisses, welche Folge gilt; die Prüfung selbst ist dieselbe.
const HERKUNFT = Object.freeze({ speichern: 'speichern' });

/**
 * Prüft eine Karteikarte einer Kartei-Tabelle mit denselben Funktionen wie die
 * Konsistenz-Prüfung: die Befunde des Datensatzes und, falls ihr Schlüssel
 * mehrfach vergeben ist, die Schlüssel-Dublette an ihr.
 *
 * @param {object} p Parameter.
 * @param {object} p.lauf Lauf der Regel-Hilfen (`neuerLauf`) mit Dateizugriff.
 * @param {object} p.sicht Die Tabellen-Sicht des Bereichs-Index.
 * @param {string} p.kopf Pfad der Kartei-Tabelle.
 * @param {string} p.pfad Pfad der Karteikarte.
 * @param {string} p.herkunft Ein Wert aus `HERKUNFT`; Pflicht.
 * @returns {Promise<{herkunft: string, befunde: Array<object>}|null>} null, wenn
 *   die Tabelle sich nicht lesen lässt oder ihr Bestand die Datei nicht als
 *   Karteikarte führt.
 */
async function pruefeKarteikarte({ lauf, sicht, kopf, pfad, herkunft }) {
  if (!Object.values(HERKUNFT).includes(herkunft))
    throw new TypeError(`pruefeKarteikarte: unbekannte Herkunft ${String(herkunft)}`);
  const ziel = await bestandFuer(lauf, kopf);
  if (!ziel || !ziel.ok) return null;
  const { bestand, definition } = ziel;
  const { liste } = datensaetzeDer(bestand);
  const gesucht = pathCompareKey(pfad);
  const n = liste.findIndex((eintrag) => pathCompareKey(eintrag.datei) === gesucht);
  if (n < 0) return null;
  const stellen = stellenDer({ tabelle: ziel.name, pfad: kopf }, liste, bestand, definition);
  const kontext = { bestand, definition, lauf, sicht, karten: new Map() };
  const befunde = await pruefeDatensatz(kontext, liste[n], stellen[n]);
  const dubletten = schluesselDubletten(bestand, ziel.key, liste, stellen);
  if (dubletten.has(n)) befunde.push(dubletten.get(n));
  return { herkunft, befunde };
}

module.exports = {
  HERKUNFT,
  datensaetzeDer,
  stellenDer,
  pruefeDatensatz,
  schluesselDubletten,
  pruefeKarteikarte,
};
