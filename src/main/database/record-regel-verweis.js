// 4T-001928 (Epic 3E-000256, E5.4, E22.3): Die Verweis-Regel des Regel-Werks —
// Datensatz-Verweise auflösen, ihr Ziel prüfen und die Kennung schreiben.
//
// **Was geprüft wird.** Je Anweisung zum Anlegen oder Ändern und je Feld vom Typ
// `record`, das die Anweisung nennt und dessen Zelle nicht leer ist: Die
// Ziel-Tabelle aus der Angabe `table` des Feldes muss es im Bereich geben, und
// der Zell-Inhalt muss genau einen Datensatz dort treffen. Löschen prüft diese
// Regel nicht; die Gegenseite, der Schutz der Datensätze, auf die noch verwiesen
// wird, ist eine eigene Regel.
//
// **Die Anwendung schreibt immer die Kennung** (E5.4). Ein Schlüssel-Wert, der
// genau einen Datensatz trifft, und eine Kennung in Kurzform werden deshalb über
// eine Ersetzung auf die aufgefüllte Kennung des Ziels gebracht. Eine Ersetzung
// durchläuft Typ- und Pflicht-Prüfung nicht erneut; ersetzt wird deshalb
// ausschließlich durch die aufgefüllte, nicht leere Kennung eines gefundenen
// Ziels und durch nichts anderes.
//
// **Die Menge aus dem Index, die Wahrheit aus der Datei** (Helfer-Blatt
// `record-regel-hilfen.js`, geteilt mit dem Lösch-Schutz): Welche Tabellen es
// gibt, sagt die Tabellen-Sicht des Bereichs; den INHALT der Ziel-Tabelle liest
// die Regel frisch aus der Datei, mit allen Segmenten, und geprüft wird gegen
// das, was nach dem Auftrag in den Dateien steht. Eine Kennung, die allein im Puffer eines offenen
// Ziel-Dokuments existiert, zählt deshalb nicht (Entscheidung beim Start des
// Vorgangs), aus demselben Grund, aus dem der Prosa-Verweis gegen den
// gespeicherten Stand prüft.
//
// **Ohne bereite Sicht wird abgewiesen, nicht durchgelassen** (B5, fail-closed).
// Ein Verweis, dessen Ziel-Tabelle sich nicht bestimmen lässt, ist ungeprüft,
// und ein ungeprüfter Verweis ins Leere ist genau der Fall, gegen den die Regel
// antritt. Gefragt wird die Sicht erst an der ersten nicht leeren Verweis-Zelle;
// ein Auftrag ohne solche Zelle läuft auch bei nicht bereitem Index.
//
// **Der Selbstbezug braucht keinen Sonderweg.** Ist die Ziel-Tabelle zugleich
// eine Tabelle des Auftrags, gilt ihr bereits unter der Sperre gelesener Bestand;
// ein Verweis eines Datensatzes auf sich selbst wird nicht abgewiesen, weil das
// Konzept ihn nicht ausschließt und die Hierarchie-Abfragen einen Zyklus als
// Hinweis behandeln (E6.3).
'use strict';

const { zellTexte } = require('../../shared/database/record-write.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { ART_ANLEGEN, ART_AENDERN } = require('./record-auftrag-pruefung.js');
const { kennungVorhanden } = require('./record-auftrag-bestand.js');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');
const {
  VERWEIS_TYP,
  wertIn,
  zielAngabe,
  findeKopfDatei,
  neuerLauf,
  holeSicht,
  bestandFuer,
} = require('./record-regel-hilfen.js');

const REGEL_NAME = 'verweis';

// --- Auflösen ------------------------------------------------------------------------------

// Eine Kennung gilt, wenn der Datensatz nach dem Auftrag besteht: im Bestand
// oder im Auftrag angelegt, und nicht im Auftrag gelöscht.
function loeseKennung(ziel, kennung) {
  const { angelegt, geloescht } = ziel.auftrag;
  if (geloescht.has(kennung)) return { ok: false, grund: 'imAuftragGeloescht' };
  if (angelegt.has(kennung) || kennungVorhanden(ziel.bestand, kennung)) return { ok: true };
  return { ok: false, grund: null };
}

// Ein Schlüssel-Wert trifft die Datensätze, deren Schlüssel-Zelle nach dem
// Auftrag zeichengleich mit ihm ist; verglichen wird ungetrimmt, wie der Index
// Schlüssel vergleicht. Datensätze ohne Kennung werden übergangen: Auf sie ließe
// sich keine Kennung schreiben.
function schluesselTreffer(ziel, feld, wert) {
  const { bestand, auftrag } = ziel;
  const eintrag = bestand.karte.get(feld.toLowerCase());
  const treffer = new Set();
  for (const datei of bestand.dateien) {
    for (const [id, record] of datei.records) {
      if (auftrag.geloescht.has(id) || auftrag.angelegt.has(id)) continue;
      const neu = wertIn(auftrag.geaendert.get(id), feld);
      const texte = zellTexte(record);
      const text = neu !== undefined ? neu : texte[eintrag.index];
      if ((text === undefined ? '' : text) === wert) treffer.add(id);
    }
  }
  for (const [id, werte] of auftrag.angelegt) {
    const text = wertIn(werte, feld);
    if ((text === undefined ? '' : text) === wert) treffer.add(id);
  }
  return [...treffer];
}

// Prüft eine Verweis-Zelle gegen ihre aufgelöste Ziel-Tabelle. Liefert
// `{befund}` oder `{kennung}`, die Kennung des Ziels in aufgefüllter Form.
function loeseZelle(ziel, zelle, stelle) {
  const mitZiel = { ...stelle, zieltabelle: ziel.name };
  if (zelle.art === VERWEIS_ARTEN.kennung) {
    const gefunden = loeseKennung(ziel, zelle.wert);
    if (gefunden.ok) return { kennung: zelle.wert };
    const grund = gefunden.grund === null ? {} : { grund: gefunden.grund };
    return { befund: regelBefund(REGEL_LAGEN.verweisZielFehlt, { ...mitZiel, ...grund }) };
  }
  // Ohne fachlichen Schlüssel gibt es nichts, worüber ein Schlüssel-Wert
  // aufgelöst werden könnte; der Wert trifft damit keinen Datensatz.
  const key = ziel.key;
  if (key === null || key.length === 0 || !ziel.bestand.karte.has(key[0].toLowerCase()))
    return {
      befund: regelBefund(REGEL_LAGEN.verweisZielFehlt, { ...mitZiel, grund: 'keinSchluessel' }),
    };
  if (key.length > 1)
    return { befund: regelBefund(REGEL_LAGEN.verweisSchluesselMehrteilig, mitZiel) };
  const treffer = schluesselTreffer(ziel, key[0], zelle.wert);
  if (treffer.length === 0) return { befund: regelBefund(REGEL_LAGEN.verweisZielFehlt, mitZiel) };
  if (treffer.length > 1)
    return {
      befund: regelBefund(REGEL_LAGEN.verweisMehrdeutig, {
        ...mitZiel,
        anzahl: treffer.length,
        kennungen: treffer,
      }),
    };
  return { kennung: treffer[0] };
}

// --- Die Regel -----------------------------------------------------------------------------

/**
 * Prüft die Verweis-Zellen eines Auftrags (Vertrag des Regel-Werks).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht (`record-regeln.js`).
 * @returns {Promise<{befunde: Array<object>, ersetzungen: Array<object>}>}
 *   Alle Befunde des Auftrags; je aufgelöstem Schlüssel-Wert und je Kurzform
 *   einer Kennung eine Ersetzung auf die aufgefüllte Kennung.
 */
async function pruefe({ bereichsWurzel, schritte, bestaende, tabellenSicht, fsp }) {
  const befunde = [];
  const ersetzungen = [];
  const lauf = neuerLauf({ bereichsWurzel, schritte, bestaende, tabellenSicht, fsp });

  for (const schritt of schritte) {
    const { anweisung } = schritt;
    if (anweisung.art !== ART_ANLEGEN && anweisung.art !== ART_AENDERN) continue;
    for (const [name, text] of Object.entries(anweisung.werte)) {
      const treffer = schritt.bestand.karte.get(name.toLowerCase());
      if (!treffer || treffer.feld.type !== VERWEIS_TYP) continue;
      const zelle = legeVerweisZelleAus(text);
      if (zelle.art === VERWEIS_ARTEN.leer) continue;
      const stelle = {
        position: anweisung.position,
        tabelle: anweisung.tabelle,
        id: schritt.id,
        feld: treffer.feld.name,
        wert: text,
      };

      const angabe = zielAngabe(treffer.feld);
      if (angabe === null) {
        befunde.push(
          regelBefund(REGEL_LAGEN.verweisTabelleUnbekannt, {
            ...stelle,
            zieltabelle: null,
            grund: 'zielAngabeFehlt',
          }),
        );
        continue;
      }
      const sicht = holeSicht(lauf);
      // Einmal je Auftrag: Ohne Sicht lässt sich keine Verweis-Zelle prüfen, und
      // dieselbe Meldung je Zelle sagte nichts Neues.
      if (!sicht.ok) {
        befunde.push(
          regelBefund(REGEL_LAGEN.katalogNichtBereit, {
            position: stelle.position,
            tabelle: stelle.tabelle,
            id: stelle.id,
            grund: sicht.status,
          }),
        );
        return { befunde, ersetzungen };
      }
      const kopf = findeKopfDatei(sicht.sicht, angabe);
      const ziel = kopf === null ? null : await bestandFuer(lauf, kopf);
      if (ziel === null || !ziel.ok) {
        const grund = ziel === null ? {} : { grund: ziel.grund };
        befunde.push(
          regelBefund(REGEL_LAGEN.verweisTabelleUnbekannt, {
            ...stelle,
            zieltabelle: angabe,
            ...grund,
          }),
        );
        continue;
      }

      const geloest = loeseZelle(ziel, zelle, stelle);
      if (geloest.befund) {
        befunde.push(geloest.befund);
        continue;
      }
      // Ersetzt wird nur, was sich ändert; die aufgefüllte Kennung steht dann
      // bereits so da, wie die Anwendung sie schreibt.
      if (geloest.kennung !== text)
        ersetzungen.push({ position: anweisung.position, feld: name, wert: geloest.kennung });
    }
  }

  // Die Ersetzungen reisen auch neben einem Befund: Angewendet werden sie von der
  // Schnittstelle ohnehin nur bei einem Auftrag ohne Befund, und die folgenden
  // Regeln sehen so die Kennungen statt der Schlüssel-Werte und melden keine
  // Folge-Befunde der bereits gemeldeten Stelle.
  return { befunde, ersetzungen };
}

const verweisRegel = Object.freeze({ name: REGEL_NAME, pruefe });

module.exports = { verweisRegel };
