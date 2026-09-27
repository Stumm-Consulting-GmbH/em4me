// 4T-001932 (Epic 3E-000256, E22.7, E12.4): Die bedingte Bearbeitbarkeit im
// Regel-Werk der Schreib-Schnittstelle — die Angabe `editable` der Definition,
// hart angewandt auf den vorgefundenen Datensatz vor dem Ändern und Löschen.
//
// **Geprüft wird der alte Zustand, nicht das Ergebnis** (E22.7, AK3). Die Frage
// ist, ob ein Datensatz so, wie er vorgefunden wurde, noch bearbeitet werden
// darf; der gebuchte Beleg ist gesperrt. Die Werte des Auftrags und die
// Ersetzungen früherer Regeln spielen deshalb keine Rolle: Wer mit demselben
// Auftrag `status` auf «offen» zurücksetzt, wird am gebuchten Zustand gemessen,
// sonst hebelte jede Sperre sich mit ihrer eigenen Änderung aus. Das ist der
// Unterschied zur Prüfregel, die das Ergebnis befragt, und der Grund, warum die
// Bedingung eine eigene Angabe ist und keine Prüfregel mit Sonder-Schlüsselwort.
//
// **Der vorgefundene Zustand** ist der Datensatz, gegen den der Auftrag
// schreibt: der unter der Sperre gelesene, über dieselbe Auslegung wie die
// Fremd-Änderungs-Prüfung (`werteDes` und `datensatzVon` aus
// `record-auftrag-plan.js`). Beim von Hand gelöschten und erzwungen wieder
// angelegten Datensatz gibt es keinen vorgefundenen; an seine Stelle tritt der
// zuletzt gelesene Stand, auf dem die Wiederanlage aufbaut (`erwartet`).
//
// **Ändern und Löschen, nie Anlegen** (Entscheidung des Product Owners vom
// 2026-09-24). Ein gebuchter Beleg soll auch nicht verschwinden; ein neuer
// Datensatz hat keinen alten Zustand, der ihn sperren könnte.
//
// **Fail-closed** (AK5). Eine Bedingung, die sich nicht auswerten lässt, gilt
// als nicht erfüllt und nennt das als Grund; ein stilles Durchlassen bräche die
// Sperre, für die sie dasteht. Ein leeres Feld ist kein Sonderfall: Es steht als
// `null` im Kontext, und der Ausdruck entscheidet. Eine unbrauchbare Angabe
// dagegen hat die Definition bereits verworfen (weiche Linie beim Lesen,
// `table-checks.js`); die Tabelle ist dann ohne Bedingung und bearbeitbar.
//
// **Keine Ersetzung, kein Datei-Zugriff.** Die Definition steht im Text der
// Kopf-Datei, den der Bestand bereits hält; die Auswertung selbst steht im
// prozess-neutralen `record-check-eval.js`, das die Maske beim Öffnen ebenso
// nutzen kann (E12.4, Übergabe an das vierte Mitglied des Zuges). Das Modul
// läuft als letztes im Regel-Werk; die Reihenfolge legt die Verdrahtung fest.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { anzeigeSpalte } = require('../../shared/database/record-identity.js');
const { baueRegelKontext, wertePruefregel } = require('../../shared/database/record-check-eval.js');
const { ART_AENDERN, ART_LOESCHEN } = require('./record-auftrag-pruefung.js');
const { werteDes, datensatzVon, erwarteteTexte } = require('./record-auftrag-plan.js');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');

const REGEL_NAME = 'bearbeitbar';

// --- Der vorgefundene Datensatz ------------------------------------------------------

// Die Zell-Texte des vorgefundenen Datensatzes in Feld-Reihenfolge; eine
// fehlende Zelle ist leer.
function vorgefundeneTexte(schritt) {
  const { anweisung, bestand } = schritt;
  const texte = schritt.fehlt
    ? erwarteteTexte(anweisung.erwartet, bestand.karte)
    : werteDes(datensatzVon(schritt));
  return bestand.fields.map((_feld, i) => (typeof texte[i] === 'string' ? texte[i] : ''));
}

// --- Die Definition einer Tabelle ----------------------------------------------------

// Bedingung und Stelle der Anzeige-Spalte, einmal je Tabelle und Prüfung. Der
// Bestand trägt die Definition nur in Teilen (Felder, Stand); Bedingung und
// Anzeige-Form stehen im Text der Kopf-Datei, den er bereits hält.
function tabellenAngaben(bestand, zwischenspeicher) {
  if (!zwischenspeicher.has(bestand)) {
    const definition = parseTableDefinition(extractFrontmatter(bestand.dateien[0].text).data);
    const anzeigeName = anzeigeSpalte(definition);
    const anzeige = anzeigeName === null ? undefined : bestand.karte.get(anzeigeName.toLowerCase());
    zwischenspeicher.set(bestand, {
      editable: definition.editable || null,
      anzeigeIndex: anzeige === undefined ? null : anzeige.index,
    });
  }
  return zwischenspeicher.get(bestand);
}

// Die Anzeige des Datensatzes für den Anwender-Text: immer seine Kennung, dazu
// in Klammern der Text seiner Anzeige-Spalte, wenn es einen gibt; eine Spalte
// aus Leerraum benennt nichts (dieselbe Konvention wie im Lösch-Schutz und in
// der Schlüssel-Regel).
function anzeigeVon(angaben, texte, id) {
  if (angaben.anzeigeIndex === null) return id;
  const text = texte[angaben.anzeigeIndex];
  return text.trim() === '' ? id : `${id} (${text})`;
}

// Ohne eigenen Meldungstext bleibt die Meldung leer; der Anwender-Text nennt die
// Bedingung bereits über `{regel}`. Eine Meldung in mehreren Sprachen reist
// unaufgelöst als Zuordnung; die Sprache kennt erst der Bedienort.
function meldungVon(geprueft) {
  return geprueft.message === null || geprueft.message === undefined ? '' : geprueft.message;
}

// --- Die Regel -----------------------------------------------------------------------

/**
 * Prüft die Änderungen und Löschungen eines Auftrags gegen die
 * Bearbeitbarkeits-Bedingung ihrer Tabellen (Vertrag des Regel-Werks,
 * `record-regeln.js`).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht.
 * @returns {{befunde: Array<object>, ersetzungen: Array<object>}} Ein Befund je
 *   nicht bearbeitbarem Schritt; Ersetzungen gibt es keine.
 */
function pruefe({ schritte }) {
  if (!Array.isArray(schritte))
    throw new TypeError('bearbeitbar: schritte muss eine Liste von Schritten sein');
  const befunde = [];
  const angabenJeTabelle = new Map();

  for (const schritt of schritte) {
    const { anweisung, bestand } = schritt;
    if (anweisung.art !== ART_AENDERN && anweisung.art !== ART_LOESCHEN) continue;
    const angaben = tabellenAngaben(bestand, angabenJeTabelle);
    if (angaben.editable === null) continue;

    const texte = vorgefundeneTexte(schritt);
    const kontext = baueRegelKontext(bestand.fields, texte);
    const geprueft = wertePruefregel(angaben.editable, { kontext });
    if (geprueft.erfuellt) continue;
    befunde.push(
      regelBefund(REGEL_LAGEN.nichtBearbeitbar, {
        position: anweisung.position,
        tabelle: anweisung.tabelle,
        id: schritt.id,
        anzeige: anzeigeVon(angaben, texte, schritt.id),
        regel: geprueft.quelle,
        meldung: meldungVon(geprueft),
        grund: geprueft.grund,
      }),
    );
  }

  return { befunde, ersetzungen: [] };
}

const bearbeitbarRegel = Object.freeze({ name: REGEL_NAME, pruefe });

module.exports = { bearbeitbarRegel };
