// 4T-001929 (Epic 3E-000256, E22.3, E5.4): Der Lösch-Schutz des Regel-Werks —
// ein Datensatz, auf den noch ein anderer in einer Verweis-Spalte zeigt, wird
// nicht gelöscht.
//
// **Warum abweisen und nicht kaskadieren** (E22.3). Ein gelöschtes Ziel ließe
// gebrochene Datensätze bei Dritten zurück, und der Schaden läge nicht bei dem,
// der löscht. Kaskaden-Löschen oder das Leeren der Verweise wäre der andere
// Ausweg; beides löschte oder änderte stillschweigend mehr, als der Auftrag
// nennt. Die Regel ändert deshalb nichts und liefert keine Ersetzungen: Ein Kopf
// mit seinen Positionen wird gelöscht, indem der Auftrag alle nennt.
//
// **Es zählt allein die Verweis-Spalte.** Ein Prosa-Verweis in einer Text-Spalte
// oder in einem Dokument schützt nicht (Präzisierung zu E22.3): Er wird gegen
// den gespeicherten Stand geprüft und darf brechen, wie ein Wiki-Link auf eine
// gelöschte Datei.
//
// **Die Menge aus dem Index, die Wahrheit aus der Datei** (Helfer-Blatt
// `record-regel-hilfen.js`, geteilt mit der Verweis-Regel). Welche Tabellen es
// gibt, sagt die Tabellen-Sicht des Bereichs; welche davon auf die Tabelle des
// gelöschten Datensatzes zeigen, sagen ihre Definitionen, und wer tatsächlich
// verweist, sagen die frisch gelesenen Dateien mit allen Segmenten. Ein
// Rückwärts-Index der Verweise wäre billiger, brächte aber Zellwerte in den Index,
// was die Entscheidung «die Zellwerte bleiben in der Datei» ausschließt.
//
// **Ohne bereite Sicht wird abgewiesen, nicht durchgelassen** (fail-closed).
// Ohne die Menge der Tabellen lässt sich nicht sagen, dass niemand abhängt. Ein
// Auftrag ohne Löschung fragt die Sicht gar nicht und läuft auch bei nicht
// bereitem Index.
//
// **Eine fremde kaputte Kopf-Datei blockiert nichts.** Lässt sich eine Tabelle
// nicht lesen oder nicht auslegen, wird sie übergangen: Sonst scheiterte jeder
// Lösch-Auftrag des Bereichs an einer Datei, die mit ihm nichts zu tun hat. Eine
// Tabelle dagegen, die nachweislich auf das Ziel zeigt und deren Datensätze sich
// nicht lesen lassen, weist ab; dort ist die Abhängigkeit belegt und nur ihr
// Umfang unbekannt.
//
// **Der selbe Auftrag zählt mit** (AK3). Ein abhängiger Datensatz, den der
// Auftrag ebenfalls löscht oder dessen Verweis-Zelle er auf ein anderes Ziel
// oder auf leer setzt, hält das Löschen nicht auf; ein im Auftrag angelegter,
// der auf den gelöschten zeigt, hält es auf.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { zellTexte } = require('../../shared/database/record-write.js');
const { anzeigeSpalte } = require('../../shared/database/record-identity.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { ART_LOESCHEN } = require('./record-auftrag-pruefung.js');
const { datensatzVon } = require('./record-auftrag-plan.js');
const { tabellenName } = require('./table-catalog.js');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');
const {
  VERWEIS_TYP,
  wertIn,
  zielAngabe,
  kopfDateien,
  findeKopfDatei,
  neuerLauf,
  holeSicht,
  bestandFuer,
} = require('./record-regel-hilfen.js');

const REGEL_NAME = 'loeschschutz';

// --- Die abhängigen Tabellen ---------------------------------------------------------------

// Der Text einer Kopf-Datei. Ist die Tabelle eine des Auftrags, gilt ihr unter
// der Sperre gelesener Text; ein zweites Lesen könnte einen anderen Stand sehen.
async function kopfText(lauf, kopf) {
  const schluessel = pathCompareKey(kopf);
  for (const bestand of lauf.bestaende.values()) {
    if (pathCompareKey(bestand.pfad) === schluessel) return bestand.dateien[0].text;
  }
  return lauf.fsp.readFile(kopf, 'utf8');
}

// Die Definition einer Kopf-Datei, oder `null`, wenn sie sich nicht lesen oder
// nicht als Tabelle auslegen lässt. Übergangen wird still und ohne Spur im
// Befund: Die Datei betrifft den Auftrag nicht, solange sie nicht nachweislich
// auf sein Ziel zeigt.
async function leseKopfDefinition(lauf, kopf) {
  try {
    const definition = parseTableDefinition(extractFrontmatter(await kopfText(lauf, kopf)).data);
    return definition.istTabelle ? definition : null;
  } catch {
    return null;
  }
}

/**
 * Die abhängigen Tabellen je Ziel-Tabelle, einmal je Prüfung ermittelt.
 *
 * @param {object} lauf Der Lauf der Prüfung.
 * @param {object} sicht Die bereite Sicht des Bereichs.
 * @param {Set<string>} ziele `pathCompareKey` der Kopf-Dateien, aus denen der
 *   Auftrag löscht; nur für sie wird gesammelt.
 * @returns {Promise<Map<string, Array<{kopf: string, felder: Array<string>}>>>}
 *   Ziel-Kopf auf die abhängigen Tabellen, diese nach Pfad sortiert, je mit den
 *   Namen ihrer Verweis-Felder auf dieses Ziel in Definitions-Reihenfolge.
 */
async function abhaengigeTabellen(lauf, sicht, ziele) {
  const karte = new Map();
  for (const kopf of kopfDateien(sicht)) {
    const definition = await leseKopfDefinition(lauf, kopf);
    if (definition === null) continue;
    // Ziel-Kopf -> Felder dieser Tabelle, die darauf zeigen.
    const jeZiel = new Map();
    for (const feld of definition.fields) {
      if (feld.type !== VERWEIS_TYP) continue;
      const angabe = zielAngabe(feld);
      const zielKopf = angabe === null ? null : findeKopfDatei(sicht, angabe);
      if (zielKopf === null) continue;
      const schluessel = pathCompareKey(zielKopf);
      if (!ziele.has(schluessel)) continue;
      if (!jeZiel.has(schluessel)) jeZiel.set(schluessel, []);
      jeZiel.get(schluessel).push(feld.name);
    }
    for (const [schluessel, felder] of jeZiel) {
      if (!karte.has(schluessel)) karte.set(schluessel, []);
      karte.get(schluessel).push({ kopf, felder });
    }
  }
  return karte;
}

// --- Der gelöschte Datensatz ---------------------------------------------------------------

// Kennung und, bei einteiligem Schlüssel, Schlüssel-Wert des gelöschten
// Datensatzes. Den Wert trägt der vorgefundene Datensatz; fehlt er, weil ihn
// jemand von Hand entfernt hat, tritt der zuletzt gelesene Stand an seine Stelle,
// wie bei der Pflicht-Prüfung am Ergebnis. Leerraum allein ist kein
// Schlüssel-Wert, weil eine leere Verweis-Zelle nie als Schlüssel ausgelegt wird.
function geloeschterDatensatz(schritt, eigene) {
  const ergebnis = { kennung: schritt.id, schluesselWert: null };
  const key = eigene.key;
  if (key === null || key.length !== 1) return ergebnis;
  const eintrag = schritt.bestand.karte.get(key[0].toLowerCase());
  if (!eintrag) return ergebnis;
  const record = datensatzVon(schritt);
  const text = record
    ? zellTexte(record)[eintrag.index]
    : wertIn(schritt.anweisung.erwartet, eintrag.feld.name);
  if (typeof text === 'string' && text.trim() !== '') ergebnis.schluesselWert = text;
  return ergebnis;
}

// Zeigt der Text einer Verweis-Zelle auf den gelöschten Datensatz? Die Kennung
// wie überall aufgefüllt verglichen, der Schlüssel-Wert zeichengenau und
// ungetrimmt, wie die Verweis-Regel ihn auflöst.
function zeigtAuf(text, geloescht) {
  if (typeof text !== 'string') return false;
  const zelle = legeVerweisZelleAus(text);
  if (zelle.art === VERWEIS_ARTEN.kennung) return zelle.wert === geloescht.kennung;
  if (zelle.art === VERWEIS_ARTEN.schluessel)
    return geloescht.schluesselWert !== null && zelle.wert === geloescht.schluesselWert;
  return false;
}

// --- Die abhängigen Datensätze -------------------------------------------------------------

// Der Text eines Feldes nach dem Auftrag: der geänderte Wert, sonst der
// vorgefundene.
function textNach(texte, geaendert, eintrag) {
  const neu = wertIn(geaendert, eintrag.feld.name);
  if (neu !== undefined) return neu;
  return texte[eintrag.index] === undefined ? '' : texte[eintrag.index];
}

/**
 * Die Datensätze einer abhängigen Tabelle, die nach dem Auftrag noch auf den
 * gelöschten zeigen, in Datei-Reihenfolge; die im Auftrag angelegten danach.
 *
 * @param {object} tabelle Ergebnis von `bestandFuer`.
 * @param {Array<string>} felder Die Verweis-Felder auf die Ziel-Tabelle.
 * @param {object} geloescht Kennung und Schlüssel-Wert des gelöschten.
 * @returns {{kennungen: Array<string>, felder: Array<string>, anzeigen: Array<string>}}
 */
function abhaengigeDatensaetze(tabelle, felder, geloescht) {
  const { bestand, auftrag } = tabelle;
  const eintraege = felder.map((name) => bestand.karte.get(name.toLowerCase())).filter(Boolean);
  const anzeigeName = anzeigeSpalte(tabelle.definition);
  const anzeigeEintrag = anzeigeName === null ? null : bestand.karte.get(anzeigeName.toLowerCase());
  const kennungen = [];
  const anzeigen = [];
  const getroffen = new Set();

  // Ein Datensatz zählt einmal, auch wenn er in mehreren Spalten verweist; die
  // Spalten sammelt die Meldung als Liste.
  const pruefeDatensatz = (id, feldText) => {
    let trifft = false;
    for (const eintrag of eintraege) {
      if (!zeigtAuf(feldText(eintrag), geloescht)) continue;
      trifft = true;
      getroffen.add(eintrag.feld.name);
    }
    if (!trifft) return;
    kennungen.push(id);
    anzeigen.push(anzeigeEintrag ? feldText(anzeigeEintrag) : '');
  };

  const gesehen = new Set();
  for (const datei of bestand.dateien) {
    for (const [id, record] of datei.records) {
      if (gesehen.has(id) || auftrag.geloescht.has(id) || auftrag.angelegt.has(id)) continue;
      gesehen.add(id);
      const texte = zellTexte(record);
      const geaendert = auftrag.geaendert.get(id);
      pruefeDatensatz(id, (eintrag) => textNach(texte, geaendert, eintrag));
    }
  }
  for (const [id, werte] of auftrag.angelegt) {
    if (gesehen.has(id)) continue;
    pruefeDatensatz(id, (eintrag) => {
      const text = wertIn(werte, eintrag.feld.name);
      return text === undefined ? '' : text;
    });
  }
  return {
    kennungen,
    felder: eintraege.map((e) => e.feld.name).filter((name) => getroffen.has(name)),
    anzeigen,
  };
}

// Die Anzeige des ersten Abhängigen für den Anwender-Text: immer seine Kennung,
// dazu in Klammern der Text seiner Anzeige-Spalte, wenn es einen gibt. Die
// Kennung bleibt sichtbar, weil sie das ist, was in der Verweis-Zelle steht und
// wonach der Anwender suchen kann; die Anzeige-Form allein wäre bei zwei
// gleichnamigen Datensätzen nicht mehr zuzuordnen (AK1: Kennung UND Anzeige-Form).
function anzeigeForm(kennung, text) {
  return typeof text === 'string' && text.trim() !== '' ? `${kennung} (${text})` : kennung;
}

// --- Die Regel -----------------------------------------------------------------------------

/**
 * Prüft die Löschungen eines Auftrags auf abhängige Datensätze (Vertrag des
 * Regel-Werks).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht (`record-regeln.js`).
 * @returns {Promise<{befunde: Array<object>, ersetzungen: Array<object>}>} Ein
 *   Befund je gelöschtem Datensatz und je abhängiger Tabelle; nie Ersetzungen.
 */
async function pruefe({ bereichsWurzel, schritte, bestaende, tabellenSicht, fsp }) {
  const befunde = [];
  const loeschungen = schritte.filter((schritt) => schritt.anweisung.art === ART_LOESCHEN);
  if (loeschungen.length === 0) return { befunde, ersetzungen: [] };

  const lauf = neuerLauf({ bereichsWurzel, schritte, bestaende, tabellenSicht, fsp });
  const sicht = holeSicht(lauf);
  if (!sicht.ok) {
    const erster = loeschungen[0];
    befunde.push(
      regelBefund(REGEL_LAGEN.katalogNichtBereit, {
        position: erster.anweisung.position,
        tabelle: erster.anweisung.tabelle,
        id: erster.id,
        grund: sicht.status,
      }),
    );
    return { befunde, ersetzungen: [] };
  }

  const ziele = new Set(loeschungen.map((schritt) => pathCompareKey(schritt.bestand.pfad)));
  const abhaengige = await abhaengigeTabellen(lauf, sicht.sicht, ziele);

  for (const schritt of loeschungen) {
    const liste = abhaengige.get(pathCompareKey(schritt.bestand.pfad)) || [];
    if (liste.length === 0) continue;
    const stelle = {
      position: schritt.anweisung.position,
      tabelle: schritt.anweisung.tabelle,
      id: schritt.id,
    };
    // Die eigene Tabelle steht in `bestaende`; `bestandFuer` nimmt sie von dort
    // und liefert ihren fachlichen Schlüssel aus dem Text der Kopf-Datei.
    const eigene = await bestandFuer(lauf, schritt.bestand.pfad);
    if (!eigene.ok) {
      befunde.push(
        regelBefund(REGEL_LAGEN.unerwartet, { ...stelle, regel: REGEL_NAME, grund: eigene.grund }),
      );
      continue;
    }
    const geloescht = geloeschterDatensatz(schritt, eigene);

    for (const { kopf, felder } of liste) {
      const tabelle = await bestandFuer(lauf, kopf);
      // Die Tabelle zeigt nachweislich auf das Ziel, ihre Datensätze lassen sich
      // aber nicht lesen: Ob jemand abhängt, ist offen, und offen heißt abweisen.
      if (!tabelle.ok) {
        befunde.push(
          regelBefund(REGEL_LAGEN.unerwartet, {
            ...stelle,
            regel: REGEL_NAME,
            zieltabelle: tabellenName(kopf),
            grund: tabelle.grund,
          }),
        );
        continue;
      }
      const treffer = abhaengigeDatensaetze(tabelle, felder, geloescht);
      if (treffer.kennungen.length === 0) continue;
      befunde.push(
        regelBefund(REGEL_LAGEN.loeschenAbhaengige, {
          ...stelle,
          zieltabelle: tabelle.name,
          felder: treffer.felder,
          anzahl: treffer.kennungen.length,
          erster: treffer.kennungen[0],
          anzeige: anzeigeForm(treffer.kennungen[0], treffer.anzeigen[0]),
        }),
      );
    }
  }

  return { befunde, ersetzungen: [] };
}

const loeschschutzRegel = Object.freeze({ name: REGEL_NAME, pruefe });

// 4T-001945 (Epic 3E-000257, Bauplan B1): Die beiden Suchen sind für den
// Verwendungsnachweis exportiert (`verwendungsnachweis.js`), damit Vorschau und
// Verweigerung dieselbe Menge liefern; die Regel selbst bleibt unverändert.
module.exports = { loeschschutzRegel, abhaengigeTabellen, abhaengigeDatensaetze };
