// 4T-000947 (Story 4S-000005, AK6): Eigene Schreibvorgaenge von fremden trennen.
//
// Die Anwendung schreibt Dateien selbst und beobachtet dieselben Dateien. Ohne
// Unterscheidung meldete jeder eigene Schreibvorgang eine «externe Aenderung»
// und loeste einen Reload aus.
//
// Zugesagt ist (AK6 von 4S-000005), dass diese Unterscheidung ueber einen
// Vergleich des geschriebenen Inhalts laeuft und NICHT ueber eine pauschale
// Zeitsperre — damit eine echte fremde Aenderung unmittelbar nach einem
// eigenen Schreibvorgang den Konflikt-Dialog erreicht. Der Vergleich war
// vorhanden, sein Eintrag verfiel aber nach 1500 ms: Traf die Meldung des
// eigenen Schreibvorgangs spaeter ein, gab es nichts mehr zu vergleichen, sie
// galt als fremd, und bei geaendertem Puffer erschien ein Konflikt-Dialog ohne
// Konflikt. Unter Last ist das eingetreten; im Abfrage-Betrieb auf Netz-
// Freigaben (rund 1400 ms statt 300 ms lokal) ruecken die Meldungen zusaetzlich
// an die Grenze.
//
// Deshalb verfaellt hier nichts mehr nach Zeit: Ein Eintrag bleibt, bis ein
// juengerer eigener Schreibvorgang ihn abloest oder die Beobachtung der Datei
// endet. Ueber die Zugehoerigkeit entscheidet allein der Inhalt.
//
// 4T-001923 (Story 4S-000005, AK6): mehrere eigene Staende je Pfad. Die
// Beobachtung meldet einen eigenen Schreibvorgang erst rund 150 ms danach
// (awaitWriteFinish in file-watching.js). Lief dann schon das naechste eigene
// Speichern, trug der Merker bereits dessen Stand (gesetzt vor dem Umbenennen),
// die Datei aber noch den vorigen: Die Meldung galt als fremd, und ein noch
// geaenderter Reiter stellte die Konflikt-Frage ohne fremde Aenderung.
// Deshalb fuehrt der Merker je Pfad eine Liste eigener Staende, aelteste
// zuerst: den zuletzt fertig geschriebenen und die laufenden.
//
// Verfalls-Regel: Ein aelterer Stand gilt nur, bis ein juengerer fertig
// geschrieben ist. Den Abschluss meldet atomic-write.js nach dem Umbenennen
// (abgeschlossen unten), zentral fuer alle Schreibwege mit Merker. Bliebe der
// aeltere Stand dauerhaft, gaelte eine fremde Aenderung, die genau einen
// aelteren eigenen Inhalt wiederherstellt (Synchronisation, Versionsverwaltung),
// als eigene, und ein ungeaenderter Reiter wuerde nicht neu geladen.
//
// 4T-002461 (Epic 3E-000367, Story 4S-001144): die Lauf-Marke der Workflows,
// ein EIGENES Register neben dem obigen, im selben Modul, weil sie dieselbe
// Mechanik nutzt (Vergleich des Inhalts, keine Zeitsperre). Abschnitt
// «Lauf-Marke» unten; das Verhalten der Selbst-Schreib-Marke bleibt unberührt.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { pathCompareKey } = require('../../shared/platform');

// Obergrenze gegen unbegrenztes Wachsen. Sie greift nur fuer Pfade, deren
// Beobachtung nie endet, weil sie nie begonnen hat — etwa die Begleitdateien
// der Historie, die geschrieben, aber nicht beobachtet werden. Ueberzaehlige
// Eintraege fallen in Einfuege-Reihenfolge weg (Map haelt sie).
const MAX_EINTRAEGE = 500;

// 4T-001923: Obergrenze der Staende je Pfad. Sie greift nur fuer Schreibwege,
// die nie einen Abschluss melden (etwa das Umbenennen der alten Bereichs-
// Datei in area-migration.js); dort faellt der aelteste Stand weg.
const MAX_STAENDE_JE_PFAD = 8;

// filePath -> Hashes der eigenen Staende, aeltester zuerst (4T-001923).
const eintraege = new Map();

function hashContent(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

// Haelt fest, was gerade selbst geschrieben wird. Der Stand kommt als
// juengster ans Ende der Liste des Pfads; ein gleicher Inhalt steht nur
// einmal darin.
function merke(filePath, content) {
  if (!filePath) return;
  // 4T-002461: Im Lauf eines Workflows zusätzlich die Lauf-Marke (Abschnitt
  // «Lauf-Marke» unten); das Register dieses Merkers bleibt davon unberührt.
  if (istImWorkflowLauf()) merkeLaufStand(filePath, content);
  const hash = hashContent(content);
  const staende = (eintraege.get(filePath) || []).filter((h) => h !== hash);
  staende.push(hash);
  while (staende.length > MAX_STAENDE_JE_PFAD) staende.shift();
  // Neu einfuegen statt aktualisieren, damit ein erneut geschriebener Pfad in
  // der Verfalls-Reihenfolge nach hinten rueckt und nicht als aeltester gilt.
  eintraege.delete(filePath);
  eintraege.set(filePath, staende);
  while (eintraege.size > MAX_EINTRAEGE) {
    const aeltester = eintraege.keys().next().value;
    if (aeltester === undefined) break;
    eintraege.delete(aeltester);
  }
}

// 4T-001923: Der Schreibvorgang mit diesem Inhalt ist fertig (die Datei traegt
// ihn). Alle aelteren Staende des Pfads verfallen; juengere, noch laufende
// bleiben. Ohne gemerkten Stand ist der Aufruf wirkungslos.
function abgeschlossen(filePath, content) {
  const staende = eintraege.get(filePath);
  if (!staende) return;
  const stelle = staende.lastIndexOf(hashContent(content));
  if (stelle > 0) staende.splice(0, stelle);
}

// Wird gerufen, wenn die Beobachtung einer Datei endet.
function vergiss(filePath) {
  eintraege.delete(filePath);
}

/**
 * Entspricht der aktuelle Datei-Stand einem eigenen Stand (dem zuletzt fertig
 * geschriebenen oder einem laufenden)?
 *
 * true unterdrueckt die Meldung, false laesst sie durch. Ein Lesefehler gilt
 * als fremd: Dann greift der Weg fuer geloeschte oder unlesbare Dateien.
 */
async function istEigenerStand(filePath) {
  const staende = eintraege.get(filePath);
  if (!staende || staende.length === 0) return false;
  try {
    const aktuell = await fs.readFile(filePath, 'utf8');
    return staende.includes(hashContent(aktuell));
  } catch {
    return false;
  }
}

// Nur fuer Tests: Fuellstand, Vorhandensein und Ruecksetzen.
function _anzahl() {
  return eintraege.size;
}

function _hat(filePath) {
  return eintraege.has(filePath);
}

function _leeren() {
  eintraege.clear();
}

// --- Lauf-Marke der Workflows (4T-002461) -------------------------------------
//
// Was ein Workflow-Lauf schreibt, löst nie ein Ereignis aus (Entscheidung 3d der
// Konzept-Runde 4T-002458, Tiefe 0 nach dem Vorbild von GitHub Actions). Der
// Ereignis-Prüfer (checks/workflow-event-check.js) fragt deshalb jede Meldung
// zuerst hier (`istLaufSchreibvorgang`). Ein eigenes Register und nicht das
// obige: Ein Schreibvorgang eines Workflows ist für die geöffneten Dokumente
// gerade KEIN eigener, ein ungeändert geöffnetes Dokument soll ihn als fremde
// Änderung sehen und neu laden (workflows/workflow-content-steps.js). Drei
// Formen, alle ohne Zeitsperre außer der dritten:
//
// 1. **Lauf-Stand je Pfad.** Gemerkt VOR dem Schreiben, mit dem Inhalt, den die
//    Datei danach trägt (Anlegen, Kopieren, Inhalts-Schritte auf der Platte,
//    über `merke` oben jeder Schreibweg mit Selbst-Schreib-Marke im Lauf, etwa
//    der Verweis-Nachzug und die Teile eines geteilten Dokuments), beim
//    Bewegen mit Größe und Änderungszeit der Quelle, die das Umbenennen
//    mitnimmt. Eine Datei-Meldung gilt als Schreibvorgang des Laufs, wenn die
//    Datei einem gemerkten Stand gleicht; verglichen werden Bytes, damit auch
//    Bilder und andere Dateien gelten. Zeigt eine Meldung einen fremden
//    Inhalt, verfallen alle Stände des Pfads, damit ein späteres Herstellen
//    desselben Inhalts durch den Anwender wieder auslöst.
// 2. **Lauf-Kennzeichen an der Meldung** (`lauf: true`). Eine Meldung, die im
//    Aufruf-Zusammenhang eines Schritts entsteht (die Bewegung über
//    `renameSingleFile` in documents/link-update.js), trägt es unmittelbar.
//    Der Zusammenhang reist über `AsyncLocalStorage`; der Schritt-Kanal
//    `workflow:step` legt ihn mit `imWorkflowLauf` um jeden Schritt.
// 3. **Einmal-Marke für `complete-task`.** Abgehakt wird im Fenster
//    (Erledigt-Datum, Wiederholung), der Hauptprozess kennt den Inhalt danach
//    nicht. Gemerkt werden der Inhalt davor und der Aufgaben-Text: Die erste
//    Datei-Meldung des Pfads mit einem anderen Inhalt gilt als die des Laufs
//    (ihr Inhalt wird Lauf-Stand), ebenso die erste `task-done`-Meldung, deren
//    Aufgaben-Text die Beschreibung enthält. Diese Form allein hat eine Frist
//    (`LAUF_EINMAL_MS`), weil sie nicht am Inhalt hängt: Bliebe sie nach einem
//    gescheiterten Abhaken stehen, schluckte sie sonst eine spätere Handlung
//    des Anwenders.

/** Obergrenze der Pfade im Register der Lauf-Stände (wie `MAX_EINTRAEGE`). */
const MAX_LAUF_EINTRAEGE = 500;
/** Frist der Einmal-Marke von `complete-task` (Form 3). */
const LAUF_EINMAL_MS = 5 * 60 * 1000;
const DATEI_MELDUNGEN = new Set(['file-created', 'file-changed', 'file-moved']);

const laufKontext = new AsyncLocalStorage();
// Pfad-Schlüssel -> Kennungen der Stände (`b:` Bytes, `s:` Größe und Zeit), ältester zuerst.
const laufStaende = new Map();
// Pfad-Schlüssel -> { vorher, beschreibung, dateiOffen, aufgabeOffen, bis }.
const laufEinmal = new Map();

// Auf Dateisystemen ohne Rücksicht auf Groß- und Kleinschreibung gefaltet: Der
// Beobachter meldet einen Pfad nicht zwingend in der Schreibweise des Schritts.
// Die Faltung entscheidet die zentrale Plattform-Auskunft (`pathCompareKey`).
function laufSchluessel(pfad) {
  return pathCompareKey(path.resolve(String(pfad)));
}

function bytesKennung(inhalt) {
  const daten = Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(String(inhalt), 'utf8');
  return `b:${crypto.createHash('sha256').update(daten).digest('hex')}`;
}

function statKennung(stat) {
  return `s:${stat.size}:${stat.mtimeMs}`;
}

function merkeKennung(schluessel, kennung) {
  const staende = (laufStaende.get(schluessel) || []).filter((k) => k !== kennung);
  staende.push(kennung);
  while (staende.length > MAX_STAENDE_JE_PFAD) staende.shift();
  laufStaende.delete(schluessel);
  laufStaende.set(schluessel, staende);
  while (laufStaende.size > MAX_LAUF_EINTRAEGE) {
    const aeltester = laufStaende.keys().next().value;
    if (aeltester === undefined) break;
    laufStaende.delete(aeltester);
  }
}

/**
 * Führt `fn` im Zusammenhang eines Workflow-Laufs aus (Form 2): Jede Meldung
 * und jeder Schreibweg mit Selbst-Schreib-Marke darin gilt als Teil des Laufs.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function imWorkflowLauf(fn) {
  return laufKontext.run({ lauf: true }, fn);
}

/** @returns {boolean} Läuft der Aufruf im Zusammenhang eines Workflow-Laufs? */
function istImWorkflowLauf() {
  return laufKontext.getStore() !== undefined;
}

/**
 * Merkt den Inhalt, den ein Workflow-Lauf gleich an `pfad` schreibt (Form 1).
 *
 * @param {string} pfad absoluter Pfad.
 * @param {string|Buffer} inhalt
 */
function merkeLaufStand(pfad, inhalt) {
  if (!pfad) return;
  merkeKennung(laufSchluessel(pfad), bytesKennung(inhalt));
}

/**
 * Merkt vor einer Bewegung des Laufs den Ziel-Pfad mit Größe und Änderungszeit
 * der Quelle (Form 1). Eine fehlende Quelle merkt nichts; die Bewegung scheitert
 * dann ohnehin.
 *
 * @param {string} von bisheriger Pfad.
 * @param {string} nach neuer Pfad.
 * @returns {Promise<void>}
 */
async function merkeLaufBewegung(von, nach) {
  try {
    const stat = await fs.stat(von);
    if (stat.isFile()) merkeKennung(laufSchluessel(nach), statKennung(stat));
  } catch {
    /* Quelle fehlt: nichts zu merken */
  }
}

/**
 * Merkt vor dem Abhaken durch `complete-task` den Inhalt davor und die
 * Beschreibung der Aufgabe (Form 3).
 *
 * @param {string} pfad absoluter Pfad der Datei mit der Aufgabe.
 * @param {string} beschreibung Beschreibung der Aufgabe (ohne Status und Daten).
 * @param {{jetzt?: number}} [opts] Uhr (Prüffälle).
 * @returns {Promise<void>}
 */
async function merkeLaufAufgabe(pfad, beschreibung, opts = {}) {
  let vorher = null;
  try {
    vorher = bytesKennung(await fs.readFile(pfad));
  } catch {
    /* nicht lesbar: jeder Inhalt danach gilt als anders */
  }
  const jetzt = Number.isFinite(opts.jetzt) ? opts.jetzt : Date.now();
  laufEinmal.set(laufSchluessel(pfad), {
    vorher,
    beschreibung: String(beschreibung || ''),
    dateiOffen: true,
    aufgabeOffen: true,
    bis: jetzt + LAUF_EINMAL_MS,
  });
}

// Die gültige Einmal-Marke eines Pfads; eine abgelaufene fällt weg.
function einmalMarke(schluessel) {
  const marke = laufEinmal.get(schluessel);
  if (!marke) return null;
  if (marke.bis <= Date.now() || (!marke.dateiOffen && !marke.aufgabeOffen)) {
    laufEinmal.delete(schluessel);
    return null;
  }
  return marke;
}

/**
 * Trägt der Pfad eine Lauf-Marke (Stand oder gültige Einmal-Marke)? Ohne Marke
 * entscheidet `istLaufSchreibvorgang` ohne Lesen der Datei.
 *
 * @param {string} pfad
 * @returns {boolean}
 */
function hatLaufMarke(pfad) {
  const schluessel = laufSchluessel(pfad);
  return laufStaende.has(schluessel) || einmalMarke(schluessel) !== null;
}

async function inhaltVomLauf(schluessel, pfad) {
  const staende = laufStaende.get(schluessel) || [];
  let stat;
  try {
    stat = await fs.stat(pfad);
    if (!stat.isFile()) return false;
    if (staende.includes(statKennung(stat))) return true;
  } catch {
    return false;
  }
  let kennung;
  try {
    kennung = bytesKennung(await fs.readFile(pfad));
  } catch {
    return false;
  }
  if (staende.includes(kennung)) return true;
  const marke = einmalMarke(schluessel);
  if (marke && marke.dateiOffen && kennung !== marke.vorher) {
    marke.dateiOffen = false;
    merkeKennung(schluessel, kennung);
    return true;
  }
  // Fremder Inhalt: Die Stände des Pfads verfallen.
  laufStaende.delete(schluessel);
  return false;
}

function aufgabeVomLauf(schluessel, aufgabe) {
  const marke = einmalMarke(schluessel);
  if (!marke || !marke.aufgabeOffen || typeof aufgabe !== 'string') return false;
  if (marke.beschreibung === '' || !aufgabe.includes(marke.beschreibung)) return false;
  marke.aufgabeOffen = false;
  return true;
}

/**
 * Ist die Meldung ein Schreibvorgang eines Workflow-Laufs? Die Eintritts-Stelle
 * `istLaufSchreibvorgang` des Ereignis-Prüfers.
 *
 * Synchron, solange nichts zu lesen ist (Kennzeichen, kein gemerkter Pfad);
 * sonst ein Versprechen, das nach dem Vergleich mit der Datei erfüllt wird.
 *
 * @param {{type: string, path?: string, task?: string, lauf?: boolean}} meldung
 * @returns {boolean|Promise<boolean>}
 */
function istLaufSchreibvorgang(meldung) {
  if (!meldung || typeof meldung !== 'object') return false;
  if (meldung.lauf === true) return true;
  if (typeof meldung.path !== 'string' || meldung.path === '') return false;
  const schluessel = laufSchluessel(meldung.path);
  if (meldung.type === 'task-done') return aufgabeVomLauf(schluessel, meldung.task);
  if (!DATEI_MELDUNGEN.has(meldung.type)) return false;
  if (!laufStaende.has(schluessel) && einmalMarke(schluessel) === null) return false;
  return inhaltVomLauf(schluessel, meldung.path);
}

// Nur für Tests: Register der Lauf-Marke leeren.
function _laufLeeren() {
  laufStaende.clear();
  laufEinmal.clear();
}

module.exports = {
  MAX_EINTRAEGE,
  MAX_STAENDE_JE_PFAD,
  merke,
  abgeschlossen,
  vergiss,
  istEigenerStand,
  _anzahl,
  _hat,
  _leeren,
  // 4T-002461: Lauf-Marke der Workflows.
  LAUF_EINMAL_MS,
  MAX_LAUF_EINTRAEGE,
  imWorkflowLauf,
  istImWorkflowLauf,
  merkeLaufStand,
  merkeLaufBewegung,
  merkeLaufAufgabe,
  hatLaufMarke,
  istLaufSchreibvorgang,
  _laufLeeren,
};
