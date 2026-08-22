// 4T-0947 (Story 4S-0005, AK6): Eigene Schreibvorgaenge von fremden trennen.
//
// Die Anwendung schreibt Dateien selbst und beobachtet dieselben Dateien. Ohne
// Unterscheidung meldete jeder eigene Schreibvorgang eine «externe Aenderung»
// und loeste einen Reload aus.
//
// Zugesagt ist (AK6 von 4S-0005), dass diese Unterscheidung ueber einen
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
// neuer eigener Schreibvorgang ihn ersetzt oder die Beobachtung der Datei
// endet. Ueber die Zugehoerigkeit entscheidet allein der Inhalt.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

// Obergrenze gegen unbegrenztes Wachsen. Sie greift nur fuer Pfade, deren
// Beobachtung nie endet, weil sie nie begonnen hat — etwa die Begleitdateien
// der Historie, die geschrieben, aber nicht beobachtet werden. Ueberzaehlige
// Eintraege fallen in Einfuege-Reihenfolge weg (Map haelt sie).
const MAX_EINTRAEGE = 500;

// filePath -> Hash des zuletzt selbst geschriebenen Inhalts.
const eintraege = new Map();

function hashContent(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

// Haelt fest, was gerade selbst geschrieben wurde.
function merke(filePath, content) {
  if (!filePath) return;
  // Neu einfuegen statt aktualisieren, damit ein erneut geschriebener Pfad in
  // der Verfalls-Reihenfolge nach hinten rueckt und nicht als aeltester gilt.
  eintraege.delete(filePath);
  eintraege.set(filePath, hashContent(content));
  while (eintraege.size > MAX_EINTRAEGE) {
    const aeltester = eintraege.keys().next().value;
    if (aeltester === undefined) break;
    eintraege.delete(aeltester);
  }
}

// Wird gerufen, wenn die Beobachtung einer Datei endet.
function vergiss(filePath) {
  eintraege.delete(filePath);
}

/**
 * Entspricht der aktuelle Datei-Stand dem zuletzt selbst geschriebenen?
 *
 * true unterdrueckt die Meldung, false laesst sie durch. Ein Lesefehler gilt
 * als fremd: Dann greift der Weg fuer geloeschte oder unlesbare Dateien.
 */
async function istEigenerStand(filePath) {
  const hash = eintraege.get(filePath);
  if (hash === undefined) return false;
  try {
    const aktuell = await fs.readFile(filePath, 'utf8');
    return hashContent(aktuell) === hash;
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

module.exports = { MAX_EINTRAEGE, merke, vergiss, istEigenerStand, _anzahl, _hat, _leeren };
