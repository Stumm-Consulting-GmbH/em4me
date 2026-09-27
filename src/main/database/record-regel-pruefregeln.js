// 4T-001931 (Epic 3E-000256, E22.3): Die Prüfregeln im Regel-Werk der
// Schreib-Schnittstelle — Feld-Regeln und Datensatz-Regeln der Definition,
// hart angewandt auf den resultierenden Datensatz.
//
// **Geprüft wird das Ergebnis, nicht die Anweisung** (AK2). Je Anlegen und
// Ändern entsteht der Datensatz, wie er nach dem Auftrag in der Datei stünde:
// die vorgefundenen Zell-Texte, darüber die Werte der Anweisung, darüber die
// Ersetzungen der früheren Regeln (etwa die Kennung, die die Verweis-Regel an
// die Stelle eines Schlüssel-Werts setzt). Das Muster ist das von
// `pruefePflichtAmErgebnis` in `record-auftrag-plan.js`. Gegen diesen Datensatz
// laufen alle Feld-Regeln aller Felder, nicht nur der geänderten: Ein
// geänderter Datensatz muss als Ganzes den Regeln genügen, und eine
// Datensatz-Regel kann ein Feld betreffen, das der Auftrag nicht anfasst.
//
// **Erzwingen übergeht keine Regel** (AK4). Die Naht läuft nach der Prüfung
// der Fremd-Änderung für jeden Schritt; ein erzwungener Schritt bildet sein
// Ergebnis aus dem vorgefundenen Stand, der von Hand gelöschte aus dem zuletzt
// gelesenen, und beide Male gelten dieselben Regeln.
//
// **Alle Verletzungen, keine Ersetzung, kein Datei-Zugriff.** Je Schritt
// kommen die Feld-Regeln in Feld-Reihenfolge, danach die Datensatz-Regeln in
// Definitions-Reihenfolge. Löschen prüft nichts, weil es kein Ergebnis gibt.
// Die Auswertung selbst steht im prozess-neutralen `record-check-eval.js`, das
// auch der Datensatz-Block beim Lesen benutzt.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const {
  baueRegelKontext,
  pruefeFeldRegeln,
  pruefeDatensatzRegeln,
} = require('../../shared/database/record-check-eval.js');
const { ART_ANLEGEN, ART_AENDERN } = require('./record-auftrag-pruefung.js');
const { werteDes, datensatzVon } = require('./record-auftrag-plan.js');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');

const REGEL_NAME = 'pruefregeln';

// --- Der resultierende Datensatz -------------------------------------------------------

// Legt Werte nach Feld-Namen über eine Zell-Liste in Feld-Reihenfolge. Der Name
// wird ohne Groß- und Kleinschreibung verglichen, wie in der Feld-Karte; ein
// unbekannter Name hat die Typ-Prüfung vor den Sperren nicht passiert und
// kommt hier nicht an.
function ueberlege(texte, werte, karte) {
  for (const [name, text] of Object.entries(werte || {})) {
    const treffer = karte.get(name.toLowerCase());
    if (treffer) texte[treffer.index] = text;
  }
  return texte;
}

// Die Zell-Texte nach dem Auftrag, in Feld-Reihenfolge; eine nicht genannte
// Zelle ist leer.
function resultierendeTexte(schritt, ersetzungen) {
  const { anweisung, bestand } = schritt;
  const { karte } = bestand;
  let texte;
  if (anweisung.art === ART_ANLEGEN) texte = [];
  // Der von Hand gelöschte Datensatz, erzwungen: Grundlage ist der zuletzt
  // gelesene Stand, auf dem die Wiederanlage aufbaut.
  else if (schritt.fehlt) texte = ueberlege([], anweisung.erwartet, karte);
  else texte = werteDes(datensatzVon(schritt));
  ueberlege(texte, anweisung.werte, karte);
  for (const ersetzung of ersetzungen) {
    if (ersetzung.position !== anweisung.position) continue;
    const treffer = karte.get(String(ersetzung.feld).toLowerCase());
    if (treffer) texte[treffer.index] = ersetzung.wert;
  }
  return bestand.fields.map((_feld, i) => (typeof texte[i] === 'string' ? texte[i] : ''));
}

// Die Datensatz-Regeln einer Tabelle, einmal je Tabelle und Prüfung gelesen.
// Der Bestand trägt die Definition nur in Teilen (Felder, Stand); die Regeln am
// Behälter stehen im Text der Kopf-Datei, den er bereits hält.
function datensatzRegeln(bestand, zwischenspeicher) {
  if (!zwischenspeicher.has(bestand)) {
    const definition = parseTableDefinition(extractFrontmatter(bestand.dateien[0].text).data);
    zwischenspeicher.set(bestand, Array.isArray(definition.checks) ? definition.checks : []);
  }
  return zwischenspeicher.get(bestand);
}

// Der Anwender-Text nennt die Quelle der Regel bereits über `{regel}` und hängt
// `{meldung}` an. Ohne eigenen Meldungstext der Definition bleibt die Meldung
// deshalb leer, statt die Quelle ein zweites Mal zu wiederholen. Eine Meldung in
// mehreren Sprachen reist unaufgelöst als Zuordnung; die Sprache kennt erst der
// Bedienort (Übergabe an das vierte Mitglied des Zuges).
function meldungVon(verletzung) {
  return verletzung.message === null || verletzung.message === undefined ? '' : verletzung.message;
}

// --- Die Regel -----------------------------------------------------------------------

/**
 * Prüft die Ergebnisse eines Auftrags gegen die Prüfregeln ihrer Tabellen
 * (Vertrag des Regel-Werks, `record-regeln.js`).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht.
 * @returns {{befunde: Array<object>, ersetzungen: Array<object>}} Alle
 *   Verletzungen; Ersetzungen gibt es keine.
 */
function pruefe({ schritte, ersetzungen }) {
  if (!Array.isArray(schritte))
    throw new TypeError('pruefregeln: schritte muss eine Liste von Schritten sein');
  const frueher = Array.isArray(ersetzungen) ? ersetzungen : [];
  const befunde = [];
  const regelnJeTabelle = new Map();

  for (const schritt of schritte) {
    const { anweisung, bestand } = schritt;
    if (anweisung.art !== ART_ANLEGEN && anweisung.art !== ART_AENDERN) continue;
    const texte = resultierendeTexte(schritt, frueher);
    const kontext = baueRegelKontext(bestand.fields, texte);
    const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: schritt.id };

    bestand.fields.forEach((feld, i) => {
      for (const verletzung of pruefeFeldRegeln(feld, texte[i], kontext)) {
        befunde.push(
          regelBefund(REGEL_LAGEN.pruefregelVerletzt, {
            ...stelle,
            feld: verletzung.feld,
            wert: verletzung.wert,
            regel: verletzung.quelle,
            meldung: meldungVon(verletzung),
            grund: verletzung.grund,
          }),
        );
      }
    });

    const checks = datensatzRegeln(bestand, regelnJeTabelle);
    for (const verletzung of pruefeDatensatzRegeln(checks, kontext, bestand.fields)) {
      befunde.push(
        regelBefund(REGEL_LAGEN.datensatzregelVerletzt, {
          ...stelle,
          felder: verletzung.felder,
          regel: verletzung.quelle,
          meldung: meldungVon(verletzung),
          grund: verletzung.grund,
        }),
      );
    }
  }

  return { befunde, ersetzungen: [] };
}

const pruefregelnRegel = Object.freeze({ name: REGEL_NAME, pruefe });

module.exports = { pruefregelnRegel };
