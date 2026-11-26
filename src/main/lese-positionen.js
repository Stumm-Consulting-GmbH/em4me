// 4T-002641 (Epic 3E-000397, Entscheidungen V4 und V5): Ablage der
// Lese-Positionen im Hauptprozess.
//
// **Zweck.** Der Hauptprozess hält für alle Fenster und Applikationen eine
// Tabelle der zuletzt gesehenen Stelle je Dokument (oberste sichtbare Zeile
// und Schreibmarke) und legt sie in der Datei `lese-positionen.json` im
// Nutzerdaten-Verzeichnis neben `config.json` ab. Prüfung, Verdrängung und
// Umbenennen gehören dem prozessneutralen Kern `src/shared/lese-stelle.js`;
// dieses Modul trägt allein Lesen, Sammeln und Schreiben der Datei.
//
// **Form der Datei.** `{ "version": 1, "eintraege": { <Pfad>: { zeileOben,
// schreibmarke, zuletzt } } }`. Der Bestand ist eine Angabe über den Blick und
// keine Nutzdaten: Eine fehlende Datei, ein defekter Inhalt, eine fremde Form
// oder eine andere Version führen zum leeren Start statt zu einer Reparatur
// (Muster `ladeMemoryStats` in `src/main/memory/memory-stats.js`); das
// Dokument beginnt dann oben wie vor dieser Funktion. Eine Datei mit höherer
// Versions-Zahl stammt aus einer neueren Programm-Fassung: Sie wird nicht
// überschrieben, dieser Lauf merkt die Stellen dann nur im Speicher.
//
// **Naht statt Electron.** Das Verzeichnis setzt der Programmstart über
// `konfiguriere`; ohne Konfiguration arbeitet die Tabelle nur im Speicher und
// schreibt nichts, damit die Prüfdateien ohne Electron laufen (Muster
// `konfiguriereMemoryStats`).
//
// **Schreiben.** Gesammelt höchstens alle zwei Sekunden über
// `ersetzeDateiOderWirf` (atomar über eine Schattenkopie) und beim Beenden
// über `schreibeJetzt` auf demselben Weg. Jenes wartet einen gerade laufenden
// gesammelten Schreibvorgang ab, damit der neueste Stand zuletzt geschrieben
// wird. Der Beenden-Punkt des Programms hält dafür an und wartet höchstens
// zwei Sekunden (`erzeugeBeendenHalt`, verdrahtet in `main.js`); danach wird
// in jedem Fall beendet. Ein Schreibfehler hält das Programm nie an: Er wird
// protokolliert, und der nächste Anlass versucht es erneut.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ersetzeDateiOderWirf } = require('./documents/atomic-write');
const { pathCompareKey } = require('../shared/platform');
const kern = require('../shared/lese-stelle');

/** Version der Datei; eine andere führt zum leeren Start. */
const VERSION = 1;
const DATEI_NAME = 'lese-positionen.json';
/** Abstand des gesammelten Schreibens in Millisekunden. */
const SAMMEL_MS = 2000;
/** Längste Wartezeit des Beenden-Punkts auf das Schreiben in Millisekunden. */
const BEENDEN_FRIST_MS = 2000;
/** Ein Pfad muss kürzer sein als diese Zahl von Zeichen. */
const MAX_PFAD_LAENGE = 4096;

let verzeichnis = null;
// `null` heißt: noch nicht gelesen. Gelesen wird beim ersten Zugriff.
let tabelle = null;
let geaendert = false;
// Die vorgefundene Datei stammt aus einer neueren Programm-Fassung: Dieser
// Lauf arbeitet nur im Speicher und schreibt nicht zurück.
let nurSpeicher = false;
let timer = null;
let laufend = null;
let zeitQuelle = Date.now;

/**
 * Setzt das Verzeichnis der Ablage und verwirft den Zustand im Speicher; der
 * nächste Zugriff liest die Datei neu. Ohne gültiges Verzeichnis keine
 * Persistenz.
 *
 * @param {string|null} dir Nutzerdaten-Verzeichnis.
 * @param {object} [optionen]
 * @param {() => number} [optionen.jetzt] Zeitquelle, für Prüffälle.
 */
function konfiguriere(dir, optionen = {}) {
  if (timer) clearTimeout(timer);
  timer = null;
  laufend = null;
  verzeichnis = typeof dir === 'string' && dir !== '' ? dir : null;
  tabelle = null;
  geaendert = false;
  nurSpeicher = false;
  zeitQuelle = optionen && typeof optionen.jetzt === 'function' ? optionen.jetzt : Date.now;
}

/** Pfad der Ablage-Datei oder `null` ohne Konfiguration. */
function ablagePfad() {
  return verzeichnis ? path.join(verzeichnis, DATEI_NAME) : null;
}

/** Nicht-leere Zeichenkette unter 4096 Zeichen; sonst stille Abweisung. */
function istGueltigerPfad(wert) {
  return (
    typeof wert === 'string' &&
    wert.length > 0 &&
    wert.length < MAX_PFAD_LAENGE &&
    wert !== '__proto__'
  );
}

function istEinfachesObjekt(wert) {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false;
  const proto = Object.getPrototypeOf(wert);
  return proto === Object.prototype || proto === null;
}

// Liest die Datei streng: jeder Eintrag durch den Kern, ein endliches
// `zuletzt`, ein gültiger Pfad; bei gleichem Vergleichs-Schlüssel und über
// `MAX_EINTRAEGE` hinaus bleiben die jüngsten.
function deuteInhalt(roh) {
  let container;
  try {
    container = JSON.parse(roh);
  } catch {
    return null;
  }
  if (!istEinfachesObjekt(container) || container.version !== VERSION) return null;
  if (!istEinfachesObjekt(container.eintraege)) return null;
  const kandidaten = [];
  for (const [pfad, wert] of Object.entries(container.eintraege)) {
    if (!istGueltigerPfad(pfad) || !istEinfachesObjekt(wert)) continue;
    const stelle = kern.normalisiereStelle(wert);
    if (!stelle || typeof wert.zuletzt !== 'number' || !Number.isFinite(wert.zuletzt)) continue;
    kandidaten.push({ pfad, eintrag: { ...stelle, zuletzt: wert.zuletzt } });
  }
  kandidaten.sort((a, b) => b.eintrag.zuletzt - a.eintrag.zuletzt);
  const gesehen = new Set();
  const out = {};
  for (const { pfad, eintrag } of kandidaten) {
    if (gesehen.size >= kern.MAX_EINTRAEGE) break;
    const schluessel = pathCompareKey(pfad);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    out[pfad] = eintrag;
  }
  return out;
}

// Eine höhere Versions-Zahl als die eigene: Die Datei hat eine neuere
// Programm-Fassung geschrieben.
function istNeueresFormat(roh) {
  try {
    const container = JSON.parse(roh);
    return (
      istEinfachesObjekt(container) &&
      typeof container.version === 'number' &&
      container.version > VERSION
    );
  } catch {
    return false;
  }
}

function ladeTabelle() {
  if (tabelle !== null) return;
  tabelle = {};
  const pfad = ablagePfad();
  if (!pfad) return;
  let roh;
  try {
    roh = fs.readFileSync(pfad, 'utf8');
  } catch (err) {
    // Fehlt die Datei, ist das der Regelfall vor dem ersten Merken.
    if (!err || err.code !== 'ENOENT') {
      console.warn('Lese-Positionen: Ablage nicht lesbar, leerer Start:', pfad, err && err.message);
    }
    return;
  }
  if (istNeueresFormat(roh)) {
    // Entwicklungsrichtlinien, Kapitel 12: nie still in ein Format
    // zurückschreiben, das diese Fassung nicht vollständig kennt.
    nurSpeicher = true;
    console.warn('Lese-Positionen: Ablage aus neuerer Fassung, bleibt unberührt:', pfad);
    return;
  }
  const gedeutet = deuteInhalt(roh);
  if (gedeutet === null) {
    console.warn('Lese-Positionen: Ablage nicht deutbar, leerer Start:', pfad);
    return;
  }
  tabelle = gedeutet;
}

function serialisiere() {
  return JSON.stringify({ version: VERSION, eintraege: tabelle || {} }, null, 2);
}

function planeSchreiben() {
  if (!verzeichnis || nurSpeicher || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void schreibeGesammelt();
  }, SAMMEL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function markiereGeaendert() {
  geaendert = true;
  planeSchreiben();
}

// Ein Schreibvorgang über den gemeinsamen Weg. Er trägt sich als `laufend`
// ein, damit ein weiterer Anlass ihn abwartet, statt neben ihm zu schreiben;
// ein Fehlschlag lässt den Stand offen für den nächsten Anlass. Wirft nie.
async function schreibeVorgang() {
  const pfad = ablagePfad();
  if (!pfad || nurSpeicher || !geaendert) return false;
  const inhalt = serialisiere();
  geaendert = false;
  const dieser = (async () => {
    try {
      await fs.promises.mkdir(verzeichnis, { recursive: true });
      await ersetzeDateiOderWirf(pfad, inhalt);
      return true;
    } catch (err) {
      geaendert = true;
      console.warn('Lese-Positionen: Ablage schreiben fehlgeschlagen:', pfad, err && err.message);
      return false;
    }
  })();
  laufend = dieser;
  try {
    return await dieser;
  } finally {
    if (laufend === dieser) laufend = null;
  }
}

// Gesammeltes Schreiben. Läuft gerade ein Schreibvorgang, wird neu geplant;
// ein Fehlschlag plant nicht neu, sondern wartet auf den nächsten Anlass.
async function schreibeGesammelt() {
  if (!ablagePfad() || nurSpeicher || !geaendert) return;
  if (laufend) {
    planeSchreiben();
    return;
  }
  await schreibeVorgang();
}

function hebeSammelnAuf() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Ist etwas zu schreiben, oder läuft gerade ein Schreibvorgang? Der
 * Beenden-Punkt wartet nur dann.
 *
 * @returns {boolean}
 */
function hatOffenes() {
  return !!laufend || (geaendert && !nurSpeicher && ablagePfad() !== null);
}

/**
 * Schreibt einen offenen Stand sofort; für den Beenden-Punkt des Programms.
 * Hebt das gesammelte Schreiben auf, wartet einen gerade laufenden
 * Schreibvorgang ab und schreibt danach, was noch offen ist. Wirft nie.
 *
 * @returns {Promise<boolean>} true, wenn geschrieben wurde.
 */
async function schreibeJetzt() {
  try {
    hebeSammelnAuf();
    while (laufend) await laufend;
    hebeSammelnAuf();
    return await schreibeVorgang();
  } catch (err) {
    console.warn('Lese-Positionen: Ablage beim Beenden nicht geschrieben:', err && err.message);
    return false;
  }
}

/**
 * Halt am Beenden-Punkt (`will-quit`) nach dem Electron-Muster für
 * asynchrones Aufräumen: Beim ersten Beenden mit offenem Stand wird das
 * Beenden angehalten, geschrieben und danach erneut beendet; nach Ablauf der
 * Frist in jedem Fall, damit ein hängender Datenträger das Beenden nie
 * blockiert. Gewartet wird höchstens einmal je Programmlauf; ohne offenen
 * Stand läuft das Beenden unverändert durch. Ohne Electron prüfbar.
 *
 * @param {object} deps
 * @param {() => boolean} deps.hatOffenes Ist etwas zu schreiben?
 * @param {() => Promise<unknown>} deps.schreibe Schreiben beim Beenden.
 * @param {() => void} deps.beende Erneutes Beenden (`app.quit`).
 * @param {number} [deps.fristMs] Längste Wartezeit, Vorgabe zwei Sekunden.
 * @returns {(event: {preventDefault: () => void}) => boolean} Rückruf für
 *   `will-quit`; true, wenn er das Beenden angehalten hat.
 */
function erzeugeBeendenHalt(deps) {
  const { schreibe, beende } = deps;
  const offen = deps.hatOffenes;
  const fristMs = deps.fristMs === undefined ? BEENDEN_FRIST_MS : deps.fristMs;
  let angehalten = false;
  return function beimBeenden(event) {
    if (angehalten || !offen()) return false;
    angehalten = true;
    event.preventDefault();
    let fortgesetzt = false;
    let frist = null;
    const fahreFort = () => {
      if (fortgesetzt) return;
      fortgesetzt = true;
      clearTimeout(frist);
      beende();
    };
    frist = setTimeout(fahreFort, fristMs);
    Promise.resolve()
      .then(schreibe)
      .then(fahreFort, (err) => {
        console.warn('Lese-Positionen: Schreiben beim Beenden gescheitert:', err && err.message);
        fahreFort();
      });
    return true;
  };
}

// Eine Schreibweise je Datei: Trenner der Plattform, keine `..`-Glieder. Die
// Öffnen-Wege des Programms liefern denselben Ort nicht alle gleich geschrieben
// (belegt am 2026-11-13 an den Bereichs-Lesezeichen mit Vorwärts-Schrägstrichen
// unter Windows); ohne das fände ein Weg die Stelle des anderen nicht.
function einheitlich(pfad) {
  return path.normalize(pfad);
}

/** Gemerkte Stelle zu `pfad` oder `null`. */
function lies(pfad) {
  if (!istGueltigerPfad(pfad)) return null;
  ladeTabelle();
  return kern.findeStelle(tabelle, einheitlich(pfad));
}

/**
 * Merkt die Stelle zu `pfad`. Ungültige Werte werden still abgewiesen.
 *
 * @returns {boolean} true, wenn die Tabelle sich geändert hat.
 */
function merke(pfad, stelle) {
  if (!istGueltigerPfad(pfad)) return false;
  ladeTabelle();
  const neu = kern.vermerkeStelle(tabelle, einheitlich(pfad), stelle, zeitQuelle());
  if (neu === tabelle) return false;
  tabelle = neu;
  markiereGeaendert();
  return true;
}

/**
 * Führt den Eintrag von `alt` unter `neu` weiter (V5); ohne Eintrag nichts.
 *
 * @returns {boolean} true, wenn die Tabelle sich geändert hat.
 */
function benenneUm(alt, neu) {
  if (!istGueltigerPfad(alt) || !istGueltigerPfad(neu)) return false;
  ladeTabelle();
  const ergebnis = kern.benenneUm(tabelle, einheitlich(alt), einheitlich(neu));
  if (ergebnis === tabelle) return false;
  tabelle = ergebnis;
  markiereGeaendert();
  return true;
}

module.exports = {
  VERSION,
  DATEI_NAME,
  SAMMEL_MS,
  BEENDEN_FRIST_MS,
  MAX_PFAD_LAENGE,
  konfiguriere,
  ablagePfad,
  istGueltigerPfad,
  lies,
  merke,
  benenneUm,
  schreibeJetzt,
  hatOffenes,
  erzeugeBeendenHalt,
};
