// 4T-001927 (Epic 3E-000256, E5.3, E22.3, E22.5): Die Schlüssel-Regel des
// Regel-Werks — der fachliche Schlüssel einer Tabelle ist nach jedem Auftrag
// eindeutig, oder der Auftrag schreibt nichts.
//
// **Geprüft wird gegen den Stand unter der Sperre, nicht gegen den Index.** Die
// Schnittstelle hat die Tabellen des Auftrags frisch gelesen, mit allen
// Segmenten; genau gegen diesen Text schreibt sie, und nur gegen ihn darf auch
// geprüft werden. Der Index kennt den Stand vor der Sperre und den Puffer
// offener Dokumente, aber nicht die Anlagen und Löschungen desselben Auftrags.
// Das Modul liest deshalb keine Datei; alles kommt aus den Schritten und ihren
// Beständen. Geprüft werden allein die Tabellen des Auftrags: Nur dort kann
// ein Auftrag einen Schlüssel vergeben.
//
// **Ein Vergleich, nicht zwei** (AK7). Der Vergleichs-Schlüssel entsteht über
// `schluesselKey` aus dem geteilten Blatt `record-schluessel.js`, über das auch
// der Index-Zugriff den Schlüssel bildet: zeichengenau, ungetrimmt, die Teile in
// der Reihenfolge der Definition. Regel und Zugriff geben damit auf dieselbe
// Frage dieselbe Antwort.
//
// **Ein leerer Teil nimmt den Schlüssel aus der Prüfung** (AK5), nach dem Muster
// der Eindeutigkeit in SQL-Datenbanken, bei der ein fehlender Wert nicht mit
// sich selbst kollidiert. Ob der Teil gefüllt sein muss, sagt die
// Pflicht-Angabe und nicht diese Regel. Eine Tabelle ohne Schlüssel, oder mit
// einem, dessen Felder die Definition nicht kennt, hat nichts zu prüfen.
//
// **Geprüft wird der resultierende Datensatz**, wie bei der Pflicht-Angabe am
// Ergebnis (`record-auftrag-plan.js`): vorgefundene Texte plus die Werte der
// Anweisung, beim von Hand gelöschten Datensatz der zuletzt gelesene Stand an
// Stelle des vorgefundenen, beim Anlegen allein die Werte. Dazu kommen die
// Ersetzungen der früheren Regeln. Die Regel läuft deshalb im Regel-Werk NACH
// der Verweis-Regel: Ein Schlüssel-Teil vom Typ Datensatz-Verweis zählt mit der
// Kennung, die jene zurücklässt, und nicht mit dem Schlüssel-Wert, den der
// Anwender geschrieben hat.
//
// **Ein Ändern, das den Schlüssel unverändert lässt, löst keine Prüfung aus**,
// auch wenn dieser Schlüssel im Bestand mehrfach vorkommt. Sonst wäre ein
// Datensatz, der Teil einer Alt-Dublette ist, in keinem Feld mehr änderbar, und
// wer ein Telefonfeld nachträgt, erführe von einem Mangel, den er nicht
// verursacht hat und an dieser Stelle nicht beheben kann. Die Alt-Dublette
// gehört der Konsistenz-Prüfung (E22.5). Geprüft wird ein Schritt deshalb nur,
// wenn der Datensatz neu ist (Anlegen oder von Hand gelöscht) oder sein
// resultierender Schlüssel vom vorgefundenen abweicht. Ein solcher Datensatz
// zählt in der Karte weiter als Teil des Bestands, denn sein Schlüssel ist
// derselbe wie vor dem Auftrag.
//
// **Die Karte bildet den Bestand nach dem Auftrag.** Aus dem Bestand kommen alle
// Datensätze aller Segmente, ohne die, deren Schlüssel der Auftrag berührt:
// gelöschte, neu angelegte und solche mit geändertem Schlüssel. Die geprüften
// Schritte werden danach der Reihe nach eingefügt und dabei gegen die Karte
// gehalten. So gelten Löschen und Neuanlegen im selben Auftrag (AK4) und zwei
// gleiche Schlüssel in einem Auftrag (AK3) ohne Sonderweg, und der eigene
// Datensatz zählt nie als seine eigene Dublette (AK2).
//
// **Je Schritt höchstens ein Befund**, geprüft in dieser Reihenfolge: erst gegen
// den Bestand, dann gegen die früheren Schritte. Liegt der Schlüssel im Bestand
// bereits mehrfach vor, ist das eine eigene Lage (E22.5): Der Abweis trifft dann
// nicht den Verursacher, und die Meldung sagt das.
//
// **Keine Ersetzungen.** Die Regel prüft und verändert keinen Wert.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { anzeigeSpalte, nummerAus } = require('../../shared/database/record-identity.js');
const { zellTexte } = require('../../shared/database/record-write.js');
const { schluesselKey } = require('../../shared/database/record-schluessel.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { ART_ANLEGEN, ART_AENDERN, ART_LOESCHEN } = require('./record-auftrag-pruefung.js');
const { datensatzVon } = require('./record-auftrag-plan.js');
const { wertIn } = require('./record-regel-hilfen.js');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');

const REGEL_NAME = 'schluessel';

// Die Teile eines Schlüssels für die Anzeige verbunden; der interne Trenner des
// Vergleichs-Schlüssels ist unsichtbar und gehört nicht in eine Meldung.
const ANZEIGE_TRENNER = ' / ';

// --- Der Schlüssel einer Tabelle ----------------------------------------------------------

/**
 * Die Schlüssel-Form einer Tabelle: welche Felder den Schlüssel bilden und
 * welche Spalte einen Datensatz benennt. Die Definition trägt der Bestand nur in
 * Teilen (Felder und Stand); Schlüssel und Anzeige-Form stehen im Text der
 * Kopf-Datei, den er bereits hält.
 *
 * @param {object} bestand Der Bestand einer Tabelle des Auftrags.
 * @returns {{namen: Array<string>, indizes: Array<number>, anzeigeIndex: number|null}|null}
 *   `null`, wenn die Tabelle keinen prüfbaren Schlüssel hat.
 */
function schluesselForm(bestand) {
  const definition = parseTableDefinition(extractFrontmatter(bestand.dateien[0].text).data);
  const key = Array.isArray(definition.key) ? definition.key : null;
  if (key === null || key.length === 0) return null;
  const teile = key.map((name) => bestand.karte.get(String(name).toLowerCase()));
  if (teile.some((treffer) => treffer === undefined)) return null;
  const anzeigeName = anzeigeSpalte(definition);
  const anzeige = anzeigeName === null ? undefined : bestand.karte.get(anzeigeName.toLowerCase());
  return {
    // In der Schreibweise der Definition, wie die Meldung sie nennt.
    namen: teile.map((treffer) => treffer.feld.name),
    indizes: teile.map((treffer) => treffer.index),
    anzeigeIndex: anzeige === undefined ? null : anzeige.index,
  };
}

function textAn(texte, index) {
  return texte[index] === undefined ? '' : texte[index];
}

// Der Vergleichs-Schlüssel aus den Teilen; ein leerer Teil nimmt ihn aus der
// Prüfung (AK5).
function vergleichsSchluessel(teile) {
  return teile.some((teil) => teil === '') ? null : schluesselKey(teile);
}

// Die Anzeige eines gelesenen Datensatzes für den Anwender-Text: immer seine
// Kennung, dazu in Klammern der Text seiner Anzeige-Spalte, wenn es einen gibt.
// Eine Spalte aus Leerraum benennt nichts. Die Kennung bleibt sichtbar, weil sie
// das ist, wonach der Anwender suchen kann; die Anzeige-Form allein wäre bei zwei
// gleichnamigen Datensätzen nicht mehr zuzuordnen (dieselbe Konvention wie im
// Lösch-Schutz).
function anzeigeVon(form, texte, id) {
  if (form.anzeigeIndex === null) return id;
  const text = textAn(texte, form.anzeigeIndex);
  return text.trim() === '' ? id : `${id} (${text})`;
}

// --- Der resultierende Datensatz eines Schritts --------------------------------------------

// Die Ersetzung einer früheren Regel für ein Feld dieser Position; bei mehreren
// gilt die letzte, wie beim Anwenden in der Reihenfolge der Liste.
function ersetzungFuer(ersetzungen, position, feldName) {
  const klein = feldName.toLowerCase();
  let wert;
  for (const ersetzung of ersetzungen) {
    if (ersetzung.position === position && ersetzung.feld.toLowerCase() === klein)
      wert = ersetzung.wert;
  }
  return wert;
}

// Die vorgefundenen Zell-Texte eines geänderten Datensatzes. Ein Schritt ohne
// gelesenen Datensatz ist ein gebrochener Vertrag des Plans und wird nicht als
// leerer Datensatz gedeutet: Die Naht macht aus dem Wurf den Befund
// `regelUnerwartet`, und der Auftrag schreibt nichts.
function vorgefundeneTexte(schritt) {
  const record = datensatzVon(schritt);
  if (record === null)
    throw new TypeError(`schluesselRegel: Datensatz ${schritt.id} im Bestand nicht gefunden`);
  return zellTexte(record);
}

/**
 * Bewertet einen Schritt: seine resultierenden Schlüssel-Teile, ob er den
 * Schlüssel seines Datensatzes berührt und ob er geprüft wird.
 *
 * @returns {{schritt: object, beruehrt: boolean, pruefen: boolean,
 *   teile: Array<string>|null, key: string|null}}
 */
function bewerteSchritt(schritt, form, ersetzungen) {
  const { anweisung } = schritt;
  if (anweisung.art === ART_LOESCHEN)
    return { schritt, beruehrt: true, pruefen: false, teile: null, key: null };
  if (anweisung.art !== ART_ANLEGEN && anweisung.art !== ART_AENDERN)
    throw new TypeError(`schluesselRegel: unbekannte Art ${String(anweisung.art)}`);

  const neu = anweisung.art === ART_ANLEGEN || schritt.fehlt === true;
  const texte = neu ? null : vorgefundeneTexte(schritt);
  const teile = form.namen.map((name, k) => {
    const ersetzt = ersetzungFuer(ersetzungen, anweisung.position, name);
    if (ersetzt !== undefined) return ersetzt;
    const genannt = wertIn(anweisung.werte, name);
    if (genannt !== undefined) return genannt;
    if (anweisung.art === ART_ANLEGEN) return '';
    if (schritt.fehlt === true) {
      const erwartet = wertIn(anweisung.erwartet, name);
      return erwartet === undefined ? '' : erwartet;
    }
    return textAn(texte, form.indizes[k]);
  });
  const key = vergleichsSchluessel(teile);

  if (!neu) {
    const vorher = form.indizes.map((index) => textAn(texte, index));
    // Zeichengleich über alle Teile, auch die leeren: Dann bleibt der Schlüssel,
    // wie er war, und der Datensatz zählt weiter als Teil des Bestands.
    if (schluesselKey(vorher) === schluesselKey(teile))
      return { schritt, beruehrt: false, pruefen: false, teile, key };
  }
  return { schritt, beruehrt: true, pruefen: key !== null, teile, key };
}

// --- Die Karte des Bestands -----------------------------------------------------------------

// Vergleichs-Schlüssel -> (Kennung -> Anzeige-Form), über alle Segmente. Eine
// Map je Schlüssel statt einer Liste, damit eine Kennung, die in zwei Dateien
// steht, nicht als zwei Datensätze zählt.
function bestandsKarte(bestand, form, beruehrt) {
  const karte = new Map();
  for (const datei of bestand.dateien) {
    for (const [id, record] of datei.records) {
      if (beruehrt.has(id)) continue;
      const texte = zellTexte(record);
      const key = vergleichsSchluessel(form.indizes.map((index) => textAn(texte, index)));
      if (key === null) continue;
      if (!karte.has(key)) karte.set(key, new Map());
      const eintrag = karte.get(key);
      if (!eintrag.has(id)) eintrag.set(id, anzeigeVon(form, texte, id));
    }
  }
  return karte;
}

// Kennungen nach ihrer Nummer, sonst nach dem Text; `r-100000` steht damit
// hinter `r-99999`.
function vergleicheKennungen(a, b) {
  const na = nummerAus(a);
  const nb = nummerAus(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// --- Die Prüfung ------------------------------------------------------------------------------

function befundFuer(bewertet, form, imBestand, imAuftrag) {
  const { schritt, teile, key } = bewertet;
  const { anweisung } = schritt;
  const stelle = {
    position: anweisung.position,
    tabelle: anweisung.tabelle,
    id: schritt.id,
    felder: [...form.namen],
    wert: teile.join(ANZEIGE_TRENNER),
  };

  const andere = [...(imBestand.get(key) || new Map())].filter(([id]) => id !== schritt.id);
  if (andere.length > 1) {
    andere.sort(([a], [b]) => vergleicheKennungen(a, b));
    return regelBefund(REGEL_LAGEN.schluesselBestandUneindeutig, {
      ...stelle,
      kennungen: andere.map(([id]) => id),
      anzahl: andere.length,
      anzeige: andere.map(([, anzeige]) => anzeige).join(', '),
    });
  }
  if (andere.length === 1) {
    const [[vorhanden, anzeige]] = andere;
    return regelBefund(REGEL_LAGEN.schluesselDoppeltImBestand, { ...stelle, vorhanden, anzeige });
  }

  const frueher = imAuftrag.get(key);
  if (frueher !== undefined && frueher.id !== schritt.id)
    return regelBefund(REGEL_LAGEN.schluesselDoppelt, {
      ...stelle,
      positionen: [frueher.position, anweisung.position],
    });
  return null;
}

// Prüft die Schritte einer Tabelle des Auftrags.
function pruefeTabelle(bestand, schritte, ersetzungen) {
  const form = schluesselForm(bestand);
  if (form === null) return [];
  const bewertet = schritte.map((schritt) => bewerteSchritt(schritt, form, ersetzungen));
  const beruehrt = new Set(bewertet.filter((b) => b.beruehrt).map((b) => b.schritt.id));
  const imBestand = bestandsKarte(bestand, form, beruehrt);
  // Vergleichs-Schlüssel -> der früheste Schritt, der ihn vergibt.
  const imAuftrag = new Map();
  const befunde = [];
  for (const eintrag of bewertet) {
    if (!eintrag.pruefen) continue;
    const befund = befundFuer(eintrag, form, imBestand, imAuftrag);
    if (befund !== null) befunde.push(befund);
    if (!imAuftrag.has(eintrag.key))
      imAuftrag.set(eintrag.key, {
        position: eintrag.schritt.anweisung.position,
        id: eintrag.schritt.id,
      });
  }
  return befunde;
}

/**
 * Prüft die Eindeutigkeit des fachlichen Schlüssels (Vertrag des Regel-Werks).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht (`record-regeln.js`); die
 *   Regel liest allein `schritte` und `ersetzungen`.
 * @returns {{befunde: Array<object>, ersetzungen: Array<object>}} Die Befunde in
 *   der Reihenfolge der Positionen; nie eine Ersetzung.
 */
function pruefe({ schritte, ersetzungen }) {
  if (!Array.isArray(schritte))
    throw new TypeError('schluesselRegel: schritte muss eine Liste sein');
  const fruehere = Array.isArray(ersetzungen) ? ersetzungen : [];

  // Je Tabelle, erkannt an ihrer Kopf-Datei: Zwei Tabellen-Angaben derselben
  // Datei sind eine Tabelle und haben einen gemeinsamen Schlüssel-Raum.
  const tabellen = new Map();
  for (const schritt of schritte) {
    const schluessel = pathCompareKey(schritt.bestand.pfad);
    if (!tabellen.has(schluessel))
      tabellen.set(schluessel, { bestand: schritt.bestand, schritte: [] });
    tabellen.get(schluessel).schritte.push(schritt);
  }

  const befunde = [];
  for (const { bestand, schritte: eigene } of tabellen.values())
    befunde.push(...pruefeTabelle(bestand, eigene, fruehere));
  befunde.sort((a, b) => a.position - b.position);
  return { befunde, ersetzungen: [] };
}

const schluesselRegel = Object.freeze({ name: REGEL_NAME, pruefe });

module.exports = { schluesselRegel };
