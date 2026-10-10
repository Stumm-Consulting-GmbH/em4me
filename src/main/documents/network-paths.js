// 4T-000946 (Story 4S-000005, Befund B-12): Erkennung von Pfaden auf Netz-Freigaben.
//
// Warum das noetig ist: Die Datei-Beobachtung stuetzt sich auf die nativen
// Ereignisse des Betriebssystems. Auf SMB-Freigaben kommen die unzuverlaessig,
// und zwar nicht «nie», sondern «mal ja, mal nein» — in Messreihen am
// 2026-08-08 und 2026-08-10 blieb eine fremde Aenderung teils auch nach zwoelf
// Sekunden unbemerkt, in anderen Laeufen desselben Aufbaus kam sie nach rund
// 280 ms. Genau diese Unbestimmtheit macht die Zusage von 4S-000005 wertlos, denn
// eine Zusage, die manchmal gilt, ist keine. Der Abfrage-Betrieb macht das
// Verhalten deterministisch; er kostet dafuer Dauerlast und wird deshalb nur
// dort eingeschaltet, wo er gebraucht wird.
//
// Zwei Zugangswege fuehren auf dieselbe Freigabe, und beide muessen erkannt
// werden: Ein UNC-Pfad verraet sich am Praefix, ein gemapptes Laufwerk nur
// ueber seine Laufwerksart. Eine Erkennung, die allein den Pfad ansieht,
// deckte den halben Fall ab.
//
// 4T-001202 (Epic 3E-000121): Bewusste Plattform-Luecke. Die Laufwerks-Ermittlung
// laeuft nur unter Windows (Gate unten); auf Linux/macOS
// erscheinen SMB-/NFS-Mounts als gewoehnliche Pfade, die Beobachtung bleibt
// dort bei den nativen Ereignissen und ist auf Netz-Mounts entsprechend
// unzuverlaessig. Eine Mount-Erkennung je Plattform entsteht erst bei Bedarf
// im Linux-Epic (PO-Entscheidung vom 2026-08-25, Plattform-Analyse Q5) —
// vor der ersten realen Nutzung auf Netz-Freigaben waere sie ungetestete
// Vorratsarbeit. Der UNC-Praefix-Zweig ('//…') greift plattformunabhaengig.
//
// 4T-001991 (Epic 3E-000188): Die Laufwerksart kommt direkt von Windows, ueber
// GetLogicalDrives und GetDriveTypeW aus kernel32.dll per FFI (koffi, Muster
// app/caption-color.js). Bis dahin fragte das Modul eine PowerShell; die
// hinterliess bei jedem Start Dateien ausserhalb des Daten-Ordners
// (Pruef-Skripte im Temp-Ordner, Profil-Daten im PowerShell-Ordner unter
// %LOCALAPPDATA%), gemessen am gebauten Programm am 2026-09-28. Der direkte Aufruf
// startet keinen fremden Prozess und schreibt nichts. Er gilt in jeder
// Fassung, nicht nur im portablen Betrieb: Die Auskunft ist dieselbe
// (Win32_LogicalDisk stuetzt sich ebenfalls auf GetDriveType), und eine
// zweite Abfrage-Art je Fassung waere eine zweite Wahrheit.
//
// Zur Lade-Zeit ist das Modul koffi-frei; koffi wird erst bei der Ermittlung
// geladen. Scheitern Laden oder Aufruf, bleibt es nach einer Warnung bei der
// leeren Menge — dem Verhalten, das schon die PowerShell-Abfrage im
// Fehlerfall hatte.
'use strict';

const path = require('node:path');

// Laufwerksart «Netzlaufwerk» aus winbase.h (DRIVE_REMOTE).
const DRIVE_REMOTE = 4;
// Laufwerksbuchstaben A bis Z: die unteren 26 Bits der Maske von
// GetLogicalDrives.
const ANZAHL_LAUFWERKSBUCHSTABEN = 26;

// Abfrage-Abstand der Beobachtung auf Netz-Pfaden. Begruendung der Groesse:
// Die native Beobachtung meldet lokal in rund 280 ms; mit diesem Abstand liegt
// die gemessene Reaktionszeit auf der Freigabe bei 270 bis 700 ms und damit in
// derselben Groessenordnung. Die Last ist klein und gemessen: 20 gleichzeitig
// beobachtete Dateien kosten rund 0,4 Prozent eines Prozessorkerns.
const NETZ_ABFRAGE_MS = 1000;

// Laufwerksbuchstaben, die auf ein Netzlaufwerk zeigen (Grossbuchstabe ohne
// Doppelpunkt). null = noch nicht ermittelt. Die Ermittlung laeuft
// nachgelagert (setImmediate), nicht im Aufruf-Stapel ihres Anstosses: Der
// Programmstart wartet so weiterhin nicht auf sie, und wer ueber
// `beiErmittlung` einen Rueckruf anmeldet, erhaelt ihn wie bisher erst nach
// seiner eigenen Anmeldung.
let netzLaufwerke = null;
let ermittlungLaeuft = false;
const nachErmittlung = [];

// Nativer Aufruf-Kanal: undefined = noch nicht geladen (lazy). Sonst ein
// Objekt mit `logischeLaufwerke()` (Bit-Maske wie GetLogicalDrives) und
// `laufwerksArt(wurzel)` (Laufwerksart wie GetDriveTypeW, Wurzel 'X:\').
// Fuer Tests einschiebbar (Muster setDwmCallForTests in app/caption-color.js).
let laufwerksKanal;

// Plattform-Gate, fuer Tests einschiebbar (Muster setPlatformForTests).
let plattform = process.platform;

function ladeLaufwerksKanal() {
  if (laufwerksKanal !== undefined) return laufwerksKanal;
  // Lazy-Require: die native koffi-Binaerdatei wird erst hier geladen.
  const koffi = require('koffi');
  const lib = koffi.load('kernel32.dll');
  const getLogicalDrives = lib.func('uint32 __stdcall GetLogicalDrives()');
  const getDriveTypeW = lib.func('uint32 __stdcall GetDriveTypeW(str16 lpRootPathName)');
  laufwerksKanal = {
    logischeLaufwerke: () => getLogicalDrives(),
    laufwerksArt: (wurzel) => getDriveTypeW(wurzel),
  };
  return laufwerksKanal;
}

// Fragt Windows nach den Netzlaufwerken. Jeder Fehler — koffi nicht ladbar,
// Aufruf gescheitert, leere Maske (GetLogicalDrives meldet so sein Scheitern)
// — endet mit einer Warnung in der leeren Menge.
function frageNetzLaufwerkeAb() {
  try {
    const kanal = ladeLaufwerksKanal();
    const maske = Number(kanal.logischeLaufwerke()) >>> 0;
    if (maske === 0) throw new Error('GetLogicalDrives lieferte keine Laufwerke');
    const ergebnis = new Set();
    for (let i = 0; i < ANZAHL_LAUFWERKSBUCHSTABEN; i++) {
      if ((maske & (1 << i)) === 0) continue;
      const buchstabe = String.fromCharCode(65 + i);
      if (Number(kanal.laufwerksArt(`${buchstabe}:\\`)) === DRIVE_REMOTE) ergebnis.add(buchstabe);
    }
    return ergebnis;
  } catch (err) {
    console.warn('Netzlaufwerke nicht ermittelbar:', err && err.message ? err.message : err);
    return new Set();
  }
}

function istUncPfad(p) {
  const s = String(p || '');
  return s.startsWith('\\\\') || s.startsWith('//');
}

// Liefert den Laufwerksbuchstaben eines Pfades oder null (UNC, relativ, leer).
function laufwerkVon(p) {
  const s = String(p || '');
  const treffer = /^([A-Za-z]):[\\/]/.exec(s);
  return treffer ? treffer[1].toUpperCase() : null;
}

/**
 * Liegt der Pfad auf einer Netz-Freigabe?
 *
 * Bewusst synchron und ohne Systemaufruf: Die Beobachtung wird beim Oeffnen
 * einer Datei eingerichtet und darf dort nicht auf die Laufwerks-Ermittlung
 * warten. Ist die Laufwerks-Liste noch nicht da, gilt der Pfad als nicht-Netz
 * (heutiges Verhalten); `beiErmittlung` traegt das Nachziehen.
 */
function istNetzPfad(p) {
  if (!p) return false;
  if (istUncPfad(p)) return true;
  const laufwerk = laufwerkVon(path.resolve(String(p)));
  if (!laufwerk || netzLaufwerke === null) return false;
  return netzLaufwerke.has(laufwerk);
}

// Beobachtungs-Optionen fuer einen Pfad. Auf lokalen Pfaden bleibt es bei den
// nativen Ereignissen; die Ergaenzung gilt nur fuer Netz-Freigaben.
function watchOptionenFuer(p) {
  if (!istNetzPfad(p)) return {};
  return { usePolling: true, interval: NETZ_ABFRAGE_MS, binaryInterval: NETZ_ABFRAGE_MS };
}

/**
 * Ermittelt die gemappten Netzlaufwerke einmalig und ruft danach alle
 * angemeldeten Rueckrufe. Fehler sind kein Abbruch: Dann bleibt es beim
 * heutigen Verhalten, statt vorsorglich alles abzufragen.
 *
 * Die Ermittlung selbst laeuft nachgelagert (siehe oben); auf anderen
 * Plattformen als Windows ergibt sie ohne Abfrage die leere Menge.
 */
function ermittleNetzLaufwerke() {
  if (netzLaufwerke !== null || ermittlungLaeuft) return;
  ermittlungLaeuft = true;
  setImmediate(() => {
    const ergebnis = plattform === 'win32' ? frageNetzLaufwerkeAb() : new Set();
    ermittlungLaeuft = false;
    netzLaufwerke = ergebnis;
    const warteten = nachErmittlung.splice(0);
    for (const rueckruf of warteten) {
      try {
        rueckruf(netzLaufwerke);
      } catch {
        /* ein fehlerhafter Rueckruf darf die uebrigen nicht verhindern */
      }
    }
  });
}

// Meldet einen Rueckruf an, der laeuft, sobald die Liste vorliegt (oder sofort,
// wenn sie es schon tut). Damit koennen Beobachter, die vor der Ermittlung
// eingerichtet wurden, nachtraeglich auf Abfrage umgestellt werden.
function beiErmittlung(rueckruf) {
  if (netzLaufwerke !== null) {
    rueckruf(netzLaufwerke);
    return;
  }
  nachErmittlung.push(rueckruf);
  ermittleNetzLaufwerke();
}

// Nur fuer Tests: Zustand setzen bzw. zuruecksetzen. Mit null steht das
// Modul wieder vor der Ermittlung (keine Liste, keine laufende Ermittlung,
// keine wartenden Rueckrufe).
function _setNetzLaufwerkeFuerTest(werte) {
  netzLaufwerke = werte === null ? null : new Set(werte);
  if (werte === null) {
    ermittlungLaeuft = false;
    nachErmittlung.length = 0;
  }
}

// Nur fuer Tests: nativen Aufruf-Kanal einschieben bzw. mit undefined auf den
// Lazy-Ausgangszustand zuruecksetzen (Muster setDwmCallForTests).
function _setLaufwerksKanalFuerTest(kanal) {
  laufwerksKanal = kanal;
}

// Nur fuer Tests: Plattform einschieben bzw. mit undefined auf die reale
// Plattform zuruecksetzen (Muster setPlatformForTests).
function _setPlattformFuerTest(p) {
  plattform = p === undefined ? process.platform : p;
}

module.exports = {
  NETZ_ABFRAGE_MS,
  DRIVE_REMOTE,
  istUncPfad,
  laufwerkVon,
  istNetzPfad,
  watchOptionenFuer,
  ermittleNetzLaufwerke,
  beiErmittlung,
  _setNetzLaufwerkeFuerTest,
  _setLaufwerksKanalFuerTest,
  _setPlattformFuerTest,
};
