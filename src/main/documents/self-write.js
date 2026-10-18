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
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

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
};
