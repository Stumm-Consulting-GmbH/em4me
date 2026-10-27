// 4T-002364 (Epic 3E-000184): Die Belegungen eines Workflows folgen seiner
// Kommando-Kennung, wenn er in der Anwendung umbenannt oder verschoben wird.
//
// Ein Workflow des Workflow-Ordners ist unter `workflow.<Pfad-Kennung>`
// angemeldet (`workflow-command-id.js`); eine Bewegung ändert die Kennung. Fünf
// Belegungs-Orte speichern sie, an drei Einstellungs-Schlüsseln: das
// Tastenkürzel (`hotkeys`, Kennung als Schlüssel), Statusleisten-Knopf,
// Kontextmenü-Eintrag und Makro-Schritt (`commandPlacement`, je `commandId`)
// und der Eintrag der Format-Toolbar (`formatToolbar`, ebenso `commandId`).
// Dieses Modul schreibt sie für eine Abbildung alt -> neu um; wer die
// Abbildung bildet und wohin geschrieben wird, entscheidet der Hauptprozess
// (`src/main/workflows/workflow-binding-follow.js`).
//
// **Vorbild** ist der Verweis-Nachzug beim Einlesen von Einstellungen
// (`ziehVerweiseNach` in `src/shared/exchange-merge.js`). Er tauscht jeden
// gleichen Text an jeder Stelle; hier werden allein die Kennungs-Felder
// getauscht, damit eine eigene Beschriftung, die zufällig wie eine Kennung
// lautet, unberührt bleibt.
//
// **Form bleibt Form.** Umgeschrieben wird der gespeicherte Wert, nicht seine
// Normalisierung: Symbol, Beschriftung, Reihenfolge und unbekannte Anteile
// bleiben, wie sie sind; die Normalisierung bleibt Sache der Leser.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { COMMAND_PLACEMENT_KEY } = require('../commands/command-placement.js');
const { FORMAT_TOOLBAR_KEY } = require('../format-toolbar.js');

const HOTKEYS_KEY = 'hotkeys';
const BELEGUNGS_SCHLUESSEL = [HOTKEYS_KEY, COMMAND_PLACEMENT_KEY, FORMAT_TOOLBAR_KEY];

const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Ein Eintrag mit `commandId` unter der Abbildung, sonst derselbe Eintrag.
function eintragUm(eintrag, abbildung) {
  if (!istObjekt(eintrag) || !abbildung.has(eintrag.commandId)) return eintrag;
  return { ...eintrag, commandId: abbildung.get(eintrag.commandId) };
}

function listeUm(liste, abbildung) {
  return Array.isArray(liste) ? liste.map((e) => eintragUm(e, abbildung)) : liste;
}

// Tastenkürzel: Der Eintrag unter der alten Kennung wandert mit seinem Wert
// (auch `''`, entbunden) unter die neue; ein Eintrag unter der neuen wird
// dabei ersetzt. Ohne Eintrag unter einer alten Kennung bleibt alles, wie es ist.
function hotkeysUm(wert, abbildung) {
  if (!istObjekt(wert)) return wert;
  const quellen = Object.keys(wert).filter((k) => abbildung.has(k));
  if (quellen.length === 0) return wert;
  const ziele = new Set(quellen.map((k) => abbildung.get(k)));
  const aus = {};
  for (const [kennung, kombination] of Object.entries(wert)) {
    if (abbildung.has(kennung)) aus[abbildung.get(kennung)] = kombination;
    else if (!ziele.has(kennung)) aus[kennung] = kombination;
  }
  return aus;
}

// Kommando-Platzierung: Statusleiste, Kontextmenü und die Schritte aller Makros.
function platzierungUm(wert, abbildung) {
  if (!istObjekt(wert)) return wert;
  const aus = { ...wert };
  if (Array.isArray(wert.statusbar)) aus.statusbar = listeUm(wert.statusbar, abbildung);
  if (Array.isArray(wert.contextMenu)) aus.contextMenu = listeUm(wert.contextMenu, abbildung);
  if (Array.isArray(wert.macros)) {
    aus.macros = wert.macros.map((makro) =>
      istObjekt(makro) && Array.isArray(makro.steps)
        ? { ...makro, steps: listeUm(makro.steps, abbildung) }
        : makro,
    );
  }
  return aus;
}

function toolbarUm(wert, abbildung) {
  if (!istObjekt(wert) || !Array.isArray(wert.entries)) return wert;
  return { ...wert, entries: listeUm(wert.entries, abbildung) };
}

const UMSCHREIBER = {
  [HOTKEYS_KEY]: hotkeysUm,
  [COMMAND_PLACEMENT_KEY]: platzierungUm,
  [FORMAT_TOOLBAR_KEY]: toolbarUm,
};

/**
 * Die Abbildung alter auf neue Kennungen aus Paaren; ein Paar ohne Wirkung
 * (leer oder alt gleich neu) entfällt.
 *
 * @param {Array<[string, string]>} paare Kennungs-Paare alt -> neu.
 * @returns {Map<string, string>}
 */
function belegungsAbbildung(paare) {
  const abbildung = new Map();
  for (const paar of Array.isArray(paare) ? paare : []) {
    const [alt, neu] = Array.isArray(paar) ? paar : [];
    if (typeof alt === 'string' && typeof neu === 'string' && alt && neu && alt !== neu) {
      abbildung.set(alt, neu);
    }
  }
  return abbildung;
}

/**
 * Schreibt die Belegungen für eine Abbildung um.
 *
 * @param {Object<string, *>} werte Gespeicherte Werte je Schlüssel aus
 *   `BELEGUNGS_SCHLUESSEL`; ein fehlender Schlüssel ist «nicht gespeichert».
 * @param {Map<string, string>} abbildung Kennungen alt -> neu.
 * @returns {Object<string, *>} Allein die Schlüssel, deren Wert sich geändert
 *   hat, mit dem neuen Wert; ein leeres Objekt heißt «keine Änderung».
 */
function schreibeBelegungenUm(werte, abbildung) {
  const geaendert = {};
  if (!(abbildung instanceof Map) || abbildung.size === 0 || !istObjekt(werte)) return geaendert;
  for (const schluessel of BELEGUNGS_SCHLUESSEL) {
    const vorher = werte[schluessel];
    const nachher = UMSCHREIBER[schluessel](vorher, abbildung);
    if (JSON.stringify(nachher) !== JSON.stringify(vorher)) geaendert[schluessel] = nachher;
  }
  return geaendert;
}

module.exports = {
  BELEGUNGS_SCHLUESSEL,
  HOTKEYS_KEY,
  belegungsAbbildung,
  schreibeBelegungenUm,
};
