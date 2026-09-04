// 4T-001101 (Epic 3E-000156): Die eine Quelle der Profil-Vorbelegung fuer alle
// Werkzeuge, die die Anwendung mit einem frischen Profil starten.
//
// Zwei Werkzeuge starten die Anwendung mit einem Wegwerf-Profil und brachten
// bis hierher je ihre eigene Vorbelegung mit: die Pruef-Umgebung der
// Ablauf-Pruefungen (test/e2e/helpers/app.js) und das Foto-Werkzeug der
// Produkt-Webseite (scripts/web-bildschirmfotos.js). Der Preis wurde am
// 2026-08-19 faellig: Mit der Produkt-Tour wurde ein frisches Profil zum
// Erststart, die Pruef-Umgebung nahm den Merker `tourSeen` auf, das
// Foto-Werkzeug nicht — neun von neun Motiven scheiterten in der Auslieferung
// 1.114.0 am Tour-Overlay (Fehlerklasse L5, Doppel-Mechanismus ohne
// gemeinsame Heimat).
//
// Schnitt (Entscheidung dieses Vorgangs): Gemeinsam ist der Anteil, der den
// ZUSTAND betrifft — alles, was einen frischen Speicher vom Erststart
// unterscheidet und damit Overlays, Hinweise oder Abfragen unterdrueckt, die
// ein Werkzeug nicht bedienen kann. Verschieden bleibt der Anteil, der die
// DARSTELLUNG betrifft (Sprache, Historie): Er ist je Aufrufer eine bewusste
// Wahl und liegt als Ueberlagerung darueber.
//
// Ablage unter scripts/, nicht unter test/: Das Foto-Werkzeug ist Teil der
// Auslieferungs-Strecke und darf nicht aus dem Pruef-Bestand lesen; die
// Pruef-Umgebung darf umgekehrt ein Werkzeug laden, wie jede Pruefdatei es
// tut. Wer ein weiteres Konstrukt mit Erststart-Wirkung baut, ergaenzt den
// Merker HIER — und nur hier. Der Waechter test/unit/profil-vorbelegung.test.js
// meldet jede App-startende Stelle, die dieses Modul nicht laedt.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Zustands-Anteil: Merker, die ein frisches Profil vom Erststart unterscheiden.
// 4T-000644: `tourSeen` — ohne ihn laeuft die gefuehrte Produkt-Tour beim
// ersten Start an und legt ihr Overlay ueber die Oberflaeche.
const ZUSTANDS_VORBELEGUNG = Object.freeze({ tourSeen: true });

// Name der Konfigurations-Datei, wie electron-store sie im userData-Verzeichnis
// erwartet (Hook SCG_TEST_USER_DATA in src/main/main.js).
const KONFIG_DATEI = 'config.json';

// Schreibt die Vorbelegung in das Profil, bevor Electron startet: bestehender
// Inhalt (bei wiederverwendetem Profil), darueber der Zustands-Anteil, darueber
// die aufrufer-eigene Ueberlagerung. Fehlende Werte legt conf beim Start selbst
// nach; hier stehen nur die abweichenden. Liefert den Pfad der Datei.
function schreibeProfilVorbelegung(userData, ueberlagerung = {}) {
  fs.mkdirSync(userData, { recursive: true });
  const datei = path.join(userData, KONFIG_DATEI);
  let bestand;
  try {
    bestand = JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch {
    bestand = {};
  }
  const inhalt = { ...bestand, ...ZUSTANDS_VORBELEGUNG, ...(ueberlagerung || {}) };
  fs.writeFileSync(datei, JSON.stringify(inhalt, null, 2), 'utf8');
  return datei;
}

module.exports = { ZUSTANDS_VORBELEGUNG, KONFIG_DATEI, schreibeProfilVorbelegung };
