// 4T-001926 (Epic 3E-000256, E12.6, E22.3): Das Regel-Werk der
// Schreib-Schnittstelle — die eine Prüf-Naht, an der Schlüssel, Verweise,
// Lösch-Schutz, Prüfregeln und bedingte Bearbeitbarkeit hängen.
//
// **Eine Stelle für alle Regel-Arten** (Bauplan B1). Die Schnittstelle kennt
// genau eine Einhänge-Stelle, `pruefNaht`; welche Regeln dort laufen und in
// welcher Reihenfolge, steht allein hier. Jede Regel als eigener Aufruf in
// `record-auftrag.js` verstreute Reihenfolge und Befund-Form über fünf Stellen
// und ließe das Ablauf-Modul über sein Größen-Budget wachsen. Kein Regel-Modul
// importiert ein anderes; die Reihenfolge ist die der übergebenen Liste, und
// die Verdrahtung legt sie fest.
//
// **Gesammelt werden alle Befunde, nicht nur der erste** (E22.3). Die Härte der
// Regeln macht den Abweis zum Normalfall der Bedienung; wer zehn Positionen
// speichert, soll in einem Zug erfahren, woran es liegt, und nicht zehnmal
// nacheinander je einen Fehler.
//
// **Ein defektes Regel-Modul lässt nie still durch** (B2). Wirft es, liefert es
// keine auslegbare Antwort oder einen Code außerhalb des Katalogs, entsteht
// daraus der Befund `regelUnerwartet` mit dem Grund, und der Auftrag schreibt
// nichts. Ein verschluckter Wurf wäre genau der stille Durchlass, gegen den die
// Regeln antreten (Entwicklungsrichtlinien, Kapitel 3).
//
// **Der zweite Rückgabe-Kanal, die Ersetzungen** (B3). Eine Regel kann einen
// Wert einer Anweisung ersetzen, etwa den genannten Schlüssel-Wert einer
// Verweis-Zelle durch die Kennung des Ziels. Spätere Regeln sehen die
// Ersetzungen der früheren; angewendet werden sie in der Schnittstelle nach der
// Naht und vor dem Schreib-Plan, über `wendeErsetzungenAn` aus diesem Modul.
// Eine Ersetzung ändert nie ein Feld, das der Auftrag nicht nennt, und nie den
// vorgefundenen Stand; der Vergleich der Fremd-Änderung ist zu diesem
// Zeitpunkt bereits gelaufen.
//
// **Die Tabellen-Sicht wird durchgereicht und nicht gewertet** (B4, B5). Ob eine
// Regel die Sicht des Index braucht und was eine noch nicht bereite Sicht für
// sie heißt (`regelKatalogNichtBereit`, fail-closed), entscheidet das Modul,
// das sie braucht.
//
// **Nicht hier:** die Anwender-Texte. Der Befund ist sprachneutral; die Texte
// stehen je Code unter `database.auftrag.<code>` in den fünf Sprach-Fragmenten,
// und der Bedienort fällt auf den allgemeinen Text der Lage `pruefBefund`
// zurück, wenn es zu einem Code keinen gibt.
'use strict';

const fsPromises = require('node:fs/promises');

// --- Der Katalog der Regel-Lagen (B1, B6) ------------------------------------------------

// Geschlossen: Ein Regel-Modul meldet nur Codes aus dieser Liste, und jeder hat
// in allen fünf Sprachfassungen einen Anwender-Text. Die Namen tragen das Präfix
// `regel`, weil sie unter der Lage `auftragPruefBefund` der Schnittstelle reisen
// und ein Aufrufer die beiden Ebenen ohne Nachschlagen auseinanderhalten soll.
const REGEL_LAGEN = Object.freeze({
  // Derselbe fachliche Schlüssel steht in zwei Anweisungen desselben Auftrags.
  schluesselDoppelt: 'regelSchluesselDoppelt',
  // Der fachliche Schlüssel ist im Bestand der Tabelle bereits vergeben.
  schluesselDoppeltImBestand: 'regelSchluesselDoppeltImBestand',
  // Der fachliche Schlüssel liegt im Bestand bereits mehrfach vor, bevor der
  // Auftrag ihn nennt; der Abweis trifft dann nicht den Verursacher (E22.5).
  schluesselBestandUneindeutig: 'regelSchluesselBestandUneindeutig',
  // Ein Verweis nennt einen Wert, zu dem die Ziel-Tabelle keinen Datensatz hat.
  verweisZielFehlt: 'regelVerweisZielFehlt',
  // Ein Verweis nennt einen Schlüssel-Wert, der mehrere Datensätze trifft.
  verweisMehrdeutig: 'regelVerweisMehrdeutig',
  // Die Ziel-Tabelle eines Verweises ist im Bereich nicht zu finden.
  verweisTabelleUnbekannt: 'regelVerweisTabelleUnbekannt',
  // Die Ziel-Tabelle hat einen mehrteiligen Schlüssel; ein Verweis über den
  // Schlüssel-Wert ist dann nicht eindeutig auflösbar.
  verweisSchluesselMehrteilig: 'regelVerweisSchluesselMehrteilig',
  // Auf den zu löschenden Datensatz verweisen noch andere.
  loeschenAbhaengige: 'regelLoeschenAbhaengige',
  // Ein Wert verletzt die Prüfregel seines Feldes.
  pruefregelVerletzt: 'regelPruefregelVerletzt',
  // Der Datensatz verletzt eine Regel über mehrere Felder.
  datensatzregelVerletzt: 'regelDatensatzregelVerletzt',
  // Der Datensatz ist nach seiner Bearbeitbarkeits-Bedingung gesperrt.
  nichtBearbeitbar: 'regelNichtBearbeitbar',
  // Die Sicht auf die Tabellen des Bereichs ist noch nicht bereit (B5).
  katalogNichtBereit: 'regelKatalogNichtBereit',
  // Ein Regel-Modul ist gescheitert oder hat eine unbrauchbare Antwort geliefert.
  unerwartet: 'regelUnerwartet',
});

const BEKANNTE_CODES = new Set(Object.values(REGEL_LAGEN));

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

function istEinfachesObjekt(wert) {
  return !!wert && typeof wert === 'object' && !Array.isArray(wert);
}

/**
 * Baut einen Regel-Befund (AK2).
 *
 * @param {string} code Ein Code aus `REGEL_LAGEN`.
 * @param {object} [angaben] Position, Tabelle, Kennung und die Angaben des
 *   Anwender-Texts (`feld`, `felder`, `wert`, `regel`, `meldung`, `anzeige`,
 *   `zieltabelle`, `anzahl`, `grund`).
 * @returns {object} `{code, position, tabelle, id, …angaben}`; fehlende
 *   Stellen-Angaben stehen als `null` da, damit jeder Befund dieselbe Gestalt hat.
 */
function regelBefund(code, angaben) {
  // Ein Code außerhalb des Katalogs ist ein Fehler im Regel-Modul und kein
  // Befund über den Auftrag; er bricht laut, statt ohne Anwender-Text zu reisen.
  if (!BEKANNTE_CODES.has(code))
    throw new TypeError(`regelBefund: unbekannter Code ${String(code)}`);
  return { code, position: null, tabelle: null, id: null, ...(angaben || {}) };
}

// --- Die Antwort eines Regel-Moduls lesen (B2) -------------------------------------------

// Eine Ersetzung ist `{ position, feld, wert }`: eine Position des Auftrags, ein
// Feld-Name und ein Zell-Text. Alles andere wäre eine stille Umwandlung an der
// Stelle, an der ein Wert in die Datei geht.
function istErsetzung(eintrag) {
  return (
    istEinfachesObjekt(eintrag) &&
    Number.isInteger(eintrag.position) &&
    typeof eintrag.feld === 'string' &&
    eintrag.feld !== '' &&
    typeof eintrag.wert === 'string'
  );
}

// Liest die Antwort eines Moduls. `befunde` und `ersetzungen` dürfen fehlen
// (kein Befund, keine Ersetzung); eine Antwort, die kein Objekt ist, ein Feld,
// das keine Liste ist, oder ein Eintrag außerhalb des Vertrags wird dagegen
// zum Befund `regelUnerwartet`. Ein Modul, das sein `return` vergessen hat,
// ließe sonst jeden Auftrag durch.
function leseAntwort(name, antwort) {
  const unerwartet = (grund) => ({
    befunde: [regelBefund(REGEL_LAGEN.unerwartet, { regel: name, grund })],
    ersetzungen: [],
  });
  if (!istEinfachesObjekt(antwort)) return unerwartet('antwortUngueltig');
  const befunde = antwort.befunde === undefined ? [] : antwort.befunde;
  const ersetzungen = antwort.ersetzungen === undefined ? [] : antwort.ersetzungen;
  if (!Array.isArray(befunde) || !Array.isArray(ersetzungen)) return unerwartet('antwortUngueltig');
  if (!befunde.every((b) => istEinfachesObjekt(b) && BEKANNTE_CODES.has(b.code)))
    return unerwartet('codeUnbekannt');
  if (!ersetzungen.every(istErsetzung)) return unerwartet('ersetzungUngueltig');
  return {
    // Die Befunde reisen unverändert, als dieselben Objekte (AK2).
    befunde,
    // Die Ersetzung nennt das Modul, von dem sie stammt; bei einer später
    // abgewiesenen Ersetzung ist das die einzige Spur zu ihrem Urheber.
    ersetzungen: ersetzungen.map((e) => ({
      position: e.position,
      feld: e.feld,
      wert: e.wert,
      regel: name,
    })),
  };
}

// --- Die Fabrik (B1, B2, B4) ---------------------------------------------------------------

/**
 * Erzeugt die Prüf-Naht der Schreib-Schnittstelle.
 *
 * @param {object} [deps] Nähte.
 * @param {Array<{name: string, pruefe: Function}>} [deps.regeln] Die Regel-Module
 *   in der Reihenfolge, in der sie laufen. `pruefe({ bereichsWurzel,
 *   anweisungen, schritte, bestaende, ersetzungen, tabellenSicht, fsp })` liefert
 *   `{ befunde, ersetzungen }`, synchron oder als Promise.
 * @param {(bereichsWurzel: string) => {status: string, sicht: object|null}}
 *   [deps.tabellenSicht] Die Sicht des Index auf die Tabellen des Bereichs;
 *   ohne sie bekommen die Module `null`.
 * @param {object} [deps.fsp] Dateizugriff der Regel-Module.
 * @returns {(kontext: object) => Promise<{befunde: Array<object>,
 *   ersetzungen: Array<object>}>} Die Naht, die die Schnittstelle als
 *   `pruefNaht` ruft.
 */
function erzeugePruefNaht({ regeln = [], tabellenSicht, fsp } = {}) {
  // Einmal geprüfte Verträge, die laut brechen: Ein Regel-Modul ohne `pruefe`
  // wird nicht geladen, statt bei jedem Auftrag still zu schweigen.
  if (!Array.isArray(regeln))
    throw new TypeError('erzeugePruefNaht: regeln muss eine Liste von Regel-Modulen sein');
  regeln.forEach((regel, i) => {
    if (!istEinfachesObjekt(regel) || typeof regel.pruefe !== 'function')
      throw new TypeError(`erzeugePruefNaht: Regel-Modul ${i} trägt keine Funktion pruefe`);
    if (typeof regel.name !== 'string' || regel.name === '')
      throw new TypeError(`erzeugePruefNaht: Regel-Modul ${i} trägt keinen Namen`);
  });
  if (tabellenSicht !== undefined && typeof tabellenSicht !== 'function')
    throw new TypeError('erzeugePruefNaht: tabellenSicht muss eine Funktion sein');
  const reihe = [...regeln];
  const sicht = tabellenSicht || null;
  const dateizugriff = fsp || fsPromises;

  return async function pruefNaht({ bereichsWurzel, anweisungen, schritte, bestaende }) {
    const befunde = [];
    const ersetzungen = [];
    for (const modul of reihe) {
      let antwort;
      try {
        antwort = await modul.pruefe({
          bereichsWurzel,
          anweisungen,
          schritte,
          bestaende,
          // Eine Kopie: Ein Modul darf die Ersetzungen der früheren lesen,
          // aber nicht an der Sammlung vorbei ändern.
          ersetzungen: [...ersetzungen],
          tabellenSicht: sicht,
          fsp: dateizugriff,
        });
      } catch (err) {
        befunde.push(
          regelBefund(REGEL_LAGEN.unerwartet, { regel: modul.name, grund: alsText(err) }),
        );
        continue;
      }
      const gelesen = leseAntwort(modul.name, antwort);
      befunde.push(...gelesen.befunde);
      ersetzungen.push(...gelesen.ersetzungen);
    }
    return { befunde, ersetzungen };
  };
}

// --- Die Anwendung der Ersetzungen (B3, AK4) -------------------------------------------------

/**
 * Wendet die Ersetzungen der Naht auf die Werte der Anweisungen an.
 *
 * **Erst prüfen, dann anwenden:** Ist eine Ersetzung unzulässig, wird keine
 * angewendet, und die Liste der Befunde kommt zurück. Unzulässig ist eine
 * Ersetzung, deren Position im Auftrag nicht vorkommt, und eine, deren Feld
 * die Anweisung nicht nennt; eine Regel darf einen Wert verändern, den der
 * Anwender gesetzt hat, aber nie ein Feld hinzufügen, das er nicht angefasst
 * hat. Der Feld-Name wird ohne Groß-Kleinschreibung verglichen, wie in der
 * Feld-Karte der Definition, und die Schreibweise der Anweisung bleibt stehen.
 *
 * Geändert werden die Werte der normalisierten Anweisungen selbst; die Schritte
 * zeigen auf dieselben Objekte, und der Schreib-Plan liest die Werte von dort.
 * Der zuletzt gelesene Stand (`erwartet`) bleibt unberührt.
 *
 * @param {Array<object>} anweisungen Die normalisierten Anweisungen.
 * @param {Array<object>|undefined} ersetzungen Die Ersetzungen der Naht; fehlt
 *   der Kanal, gibt es nichts anzuwenden.
 * @returns {Array<object>} Befunde `regelUnerwartet`; leer heißt «angewendet».
 */
function wendeErsetzungenAn(anweisungen, ersetzungen) {
  if (ersetzungen === undefined) return [];
  if (!Array.isArray(ersetzungen))
    return [regelBefund(REGEL_LAGEN.unerwartet, { grund: 'ersetzungUngueltig' })];
  const befunde = [];
  const geplant = [];
  for (const ersetzung of ersetzungen) {
    if (!istErsetzung(ersetzung)) {
      befunde.push(regelBefund(REGEL_LAGEN.unerwartet, { grund: 'ersetzungUngueltig' }));
      continue;
    }
    const { position, feld, regel } = ersetzung;
    const anweisung = anweisungen.find((a) => a.position === position);
    const stelle = { position, feld, regel: regel || null };
    if (!anweisung) {
      befunde.push(
        regelBefund(REGEL_LAGEN.unerwartet, { ...stelle, grund: 'ersetzungPositionUnbekannt' }),
      );
      continue;
    }
    const name = Object.keys(anweisung.werte).find((n) => n.toLowerCase() === feld.toLowerCase());
    if (name === undefined) {
      befunde.push(
        regelBefund(REGEL_LAGEN.unerwartet, {
          ...stelle,
          tabelle: anweisung.tabelle,
          id: anweisung.id,
          grund: 'ersetzungFeldNichtGenannt',
        }),
      );
      continue;
    }
    geplant.push({ anweisung, name, wert: ersetzung.wert });
  }
  if (befunde.length > 0) return befunde;
  for (const { anweisung, name, wert } of geplant) anweisung.werte[name] = wert;
  return [];
}

module.exports = { REGEL_LAGEN, regelBefund, erzeugePruefNaht, wendeErsetzungenAn };
