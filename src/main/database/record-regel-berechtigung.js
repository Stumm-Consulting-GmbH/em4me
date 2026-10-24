// 4T-002309 (Epic 3E-000263, E12.6, S1, S6, S12): Die Berechtigung im Regel-Werk
// der Schreib-Schnittstelle — je Anweisung Tabelle und Operation gegen die
// Erlaubnis-Menge der eigenen Rolle.
//
// **Geprüft wird an der Schnittstelle, nicht in der Maske** (E12.6). Eine Prüfung
// in der Maske wäre über jeden anderen Schreibweg zu umgehen; die Prüf-Naht ist
// die eine Stelle, durch die jede Änderung an Datensätzen läuft.
//
// **Die erste Regel der Naht** (S12). Eine verbotene Operation braucht keine
// weitere Prüfung, und sie soll den Befund melden, der sie tatsächlich
// verhindert, nicht den einer späteren Regel. Die Berechtigung braucht allein
// Tabelle und Operation der Anweisung, keine Ersetzung der Verweis-Regel; die
// Reihenfolge legt die Verdrahtung fest.
//
// **Die Erlaubnis-Menge bestimmt die Naht, einmal je Auftrag** (Festlegung 2 der
// Sitzung): Sie reicht `rechte` (je Tabellen-Name die vier Operationen) und
// `rolle` im Kontext herein, gebildet über dieselbe Auflösung wie Übersicht und
// Lese-Kanäle (`rechteDerSicht` in `table-catalog.js`, `loeseRechte` in
// `rechte.js`). Dieses Modul liest selbst nichts.
//
// **Ohne Angaben ist alles erlaubt** (E12.5): Führt die Sicht keinen Steckbrief
// oder trägt der gelesene Steckbrief keine Rollen, gibt es keine geltende Rolle
// und keinen Befund; ebenso bei einer Rolle mit `all`.
//
// **Nicht bestimmbar heißt abweisen** (Entscheidung der Sitzung vom 2026-10-18,
// nach Rückfrage; berichtigt die zuerst festgelegte Lesart «nicht bestimmbar
// heißt keine Rollen»). Ist die Sicht des Index nicht bereit (Einlesen läuft,
// Bereich zu groß) oder der Steckbrief nicht lesbar oder fehlerhaft, ist offen,
// ob Rollen gelten; dann wird nach E12.6 gemeldet und nichts geschrieben, wie
// beim Lösch-Schutz ohne Sicht. Die Naht reicht den Grund als
// `rechteNichtBestimmbar` herein, und dieses Modul meldet einmal je Auftrag
// `regelRechteNichtBestimmbar`. **Ein Fehler beim Bestimmen** (eine Ausnahme)
// führt wie bei jeder Regel zu `regelUnerwartet` (`rechteFehler`). Fehlt der
// Kanal ganz (`rechte` undefiniert), ist die Naht ohne `rechteFuer` gebaut,
// obwohl diese Regel in ihrer Liste steht; das ist ein gebrochener Vertrag der
// Verdrahtung und meldet sich ebenso, statt still durchzulassen.
//
// **Eine Tabelle, die die Rolle nicht nennt, hat keine Operation** (`rechte.js`).
// Eine Tabelle, die in der Erlaubnis-Menge gar nicht vorkommt (nicht im Index),
// gilt bei geltender Rolle ebenso als verboten: Erlaubt ist, was die Rolle
// ausdrücklich nennt. Den Tabellen-Namen sucht die Prüfung ohne Rücksicht auf die
// Schreibung, wie der Katalog eine Tabelle über ihren Namen findet.
'use strict';

const path = require('node:path');
const { REGEL_LAGEN, regelBefund } = require('./record-regeln.js');
const { tabellenName, rechteZumSchreiben } = require('./table-catalog.js');

const REGEL_NAME = 'berechtigung';

/**
 * Darf die geltende Rolle die Operation an der Tabelle ausführen?
 *
 * Gemeinsame Stelle für die Regel und die Prüfung der Neuanlage
 * (`record-auftrag.js`), damit beide auf dieselbe Frage dieselbe Antwort geben.
 *
 * @param {{rolle: string|null, rechte: Object<string, object>|null}} berechtigung
 *   Geltende Rolle und Erlaubnis-Menge je Tabellen-Name.
 * @param {string} name Der Name der Tabelle (Dateiname ohne Endung).
 * @param {'create'|'update'|'delete'} operation Die Operation.
 * @returns {boolean} Ohne geltende Rolle immer wahr (E12.5).
 */
function istErlaubt({ rolle, rechte }, name, operation) {
  if (typeof rolle !== 'string') return true;
  // Eine geltende Rolle ohne Menge erlaubt nichts (fail-closed).
  if (!rechte || typeof rechte !== 'object') return false;
  const klein = String(name).toLowerCase();
  const treffer = Object.keys(rechte).find((n) => n.toLowerCase() === klein);
  if (treffer === undefined) return false;
  const satz = rechte[treffer];
  return !!satz && satz[operation] === true;
}

/**
 * Der Name einer Tabelle aus der Angabe einer Anweisung (Pfad relativ zur
 * Bereichs-Wurzel), über dieselbe Bildung wie der Katalog.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {string} angabe Die Tabellen-Angabe der Anweisung.
 * @returns {string}
 */
function nameDerAngabe(bereichsWurzel, angabe) {
  return tabellenName(path.resolve(bereichsWurzel, angabe));
}

/**
 * Prüft die Anweisungen eines Auftrags gegen die Erlaubnis-Menge der eigenen
 * Rolle (Vertrag des Regel-Werks, `record-regeln.js`).
 *
 * @param {object} kontext Der Kontext der Prüf-Naht.
 * @returns {{befunde: Array<object>, ersetzungen: Array<object>}} Ein Befund je
 *   nicht erlaubter Anweisung; Ersetzungen gibt es keine.
 */
function pruefe({
  bereichsWurzel,
  anweisungen,
  rechte,
  rolle,
  rechteFehler,
  rechteNichtBestimmbar,
}) {
  if (!Array.isArray(anweisungen))
    throw new TypeError('berechtigung: anweisungen muss eine Liste von Anweisungen sein');
  if (typeof rechteFehler === 'string')
    return {
      befunde: [regelBefund(REGEL_LAGEN.unerwartet, { regel: REGEL_NAME, grund: rechteFehler })],
      ersetzungen: [],
    };
  if (typeof rechteNichtBestimmbar === 'string') {
    // Einmal je Auftrag, an der ersten Anweisung, wie der Lösch-Schutz ohne Sicht.
    const erste = anweisungen[0] || {};
    const befund = regelBefund(REGEL_LAGEN.rechteNichtBestimmbar, {
      position: Number.isInteger(erste.position) ? erste.position : null,
      tabelle: typeof erste.tabelle === 'string' ? erste.tabelle : null,
      id: typeof erste.id === 'string' ? erste.id : null,
      grund: rechteNichtBestimmbar,
    });
    return { befunde: [befund], ersetzungen: [] };
  }
  if (rechte === undefined)
    throw new TypeError('berechtigung: die Naht reicht keine Erlaubnis-Menge herein (rechteFuer)');

  const befunde = [];
  const berechtigung = { rolle: typeof rolle === 'string' ? rolle : null, rechte };
  if (berechtigung.rolle === null) return { befunde, ersetzungen: [] };
  for (const anweisung of anweisungen) {
    const name = nameDerAngabe(bereichsWurzel, anweisung.tabelle);
    if (istErlaubt(berechtigung, name, anweisung.art)) continue;
    befunde.push(
      regelBefund(REGEL_LAGEN.nichtErlaubt, {
        position: anweisung.position,
        tabelle: anweisung.tabelle,
        id: anweisung.id === undefined ? null : anweisung.id,
        operation: anweisung.art,
        rolle: berechtigung.rolle,
      }),
    );
  }
  return { befunde, ersetzungen: [] };
}

const berechtigungRegel = Object.freeze({ name: REGEL_NAME, pruefe });

/**
 * Baut die Rechte-Funktion der Verdrahtung (4T-002309): zur Bereichs-Wurzel die
 * Sicht des Index und daraus `rechteZumSchreiben` aus dem Katalog. Ohne bereite
 * Sicht kommt deren Status als Grund zurück, und Naht und Neuanlage weisen ab.
 *
 * @param {object} deps Nähte.
 * @param {(bereichsWurzel: string) => {status: string, sicht: object|null}}
 *   deps.tabellenSicht Die Sicht des Index nach Bereichs-Wurzel.
 * @param {object} deps.fsp Dateizugriff für den Steckbrief.
 * @param {Function} [deps.herkunft] Naht für den Anmeldenamen.
 * @returns {(bereichsWurzel: string, optionen?: {zusatzNamen?: string[]}) =>
 *   Promise<object>} `{ status: 'ready', rolle, rechte }` oder `{ status: <Grund> }`;
 *   `zusatzNamen` (4T-002310) löst weitere Tabellen-Namen mit auf.
 */
function erzeugeRechteFuer({ tabellenSicht, fsp, herkunft = null }) {
  if (typeof tabellenSicht !== 'function')
    throw new TypeError('erzeugeRechteFuer: tabellenSicht muss eine Funktion sein');
  return async function rechteFuer(bereichsWurzel, { zusatzNamen = [] } = {}) {
    const antwort = tabellenSicht(bereichsWurzel);
    const status = antwort && typeof antwort.status === 'string' ? antwort.status : 'unavailable';
    if (status !== 'ready') return { status };
    if (!antwort.sicht) return { status: 'sichtFehlt' };
    return rechteZumSchreiben({ sicht: antwort.sicht, fsp, herkunft, zusatzNamen });
  };
}

module.exports = { berechtigungRegel, istErlaubt, nameDerAngabe, erzeugeRechteFuer };
