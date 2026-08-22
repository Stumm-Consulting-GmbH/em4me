// 4T-0946 (Story 4S-0005, Befund B-12): Erkennung von Pfaden auf Netz-Freigaben.
//
// Warum das noetig ist: Die Datei-Beobachtung stuetzt sich auf die nativen
// Ereignisse des Betriebssystems. Auf SMB-Freigaben kommen die unzuverlaessig,
// und zwar nicht «nie», sondern «mal ja, mal nein» — in Messreihen am
// 2026-08-08 und 2026-08-10 blieb eine fremde Aenderung teils auch nach zwoelf
// Sekunden unbemerkt, in anderen Laeufen desselben Aufbaus kam sie nach rund
// 280 ms. Genau diese Unbestimmtheit macht die Zusage von 4S-0005 wertlos, denn
// eine Zusage, die manchmal gilt, ist keine. Der Abfrage-Betrieb macht das
// Verhalten deterministisch; er kostet dafuer Dauerlast und wird deshalb nur
// dort eingeschaltet, wo er gebraucht wird.
//
// Zwei Zugangswege fuehren auf dieselbe Freigabe, und beide muessen erkannt
// werden: Ein UNC-Pfad verraet sich am Praefix, ein gemapptes Laufwerk nur
// ueber seine Laufwerksart. Eine Erkennung, die allein den Pfad ansieht,
// deckte den halben Fall ab.
'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');

// Abfrage-Abstand der Beobachtung auf Netz-Pfaden. Begruendung der Groesse:
// Die native Beobachtung meldet lokal in rund 280 ms; mit diesem Abstand liegt
// die gemessene Reaktionszeit auf der Freigabe bei 270 bis 700 ms und damit in
// derselben Groessenordnung. Die Last ist klein und gemessen: 20 gleichzeitig
// beobachtete Dateien kosten rund 0,4 Prozent eines Prozessorkerns.
const NETZ_ABFRAGE_MS = 1000;

// Laufwerksbuchstaben, die auf ein Netzlaufwerk zeigen (Grossbuchstabe ohne
// Doppelpunkt). null = noch nicht ermittelt; die Ermittlung laeuft asynchron,
// weil sie einen fremden Prozess startet und den Programmstart sonst bremste.
let netzLaufwerke = null;
let ermittlungLaeuft = false;
const nachErmittlung = [];

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
 * einer Datei eingerichtet und darf dort nicht auf einen fremden Prozess
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
 */
function ermittleNetzLaufwerke() {
  if (netzLaufwerke !== null || ermittlungLaeuft) return;
  if (process.platform !== 'win32') {
    netzLaufwerke = new Set();
    return;
  }
  ermittlungLaeuft = true;
  execFile(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=4' | Select-Object -ExpandProperty DeviceID",
    ],
    { timeout: 20000, windowsHide: true },
    (err, stdout) => {
      ermittlungLaeuft = false;
      if (err) {
        console.warn('Netzlaufwerke nicht ermittelbar:', err.message);
        netzLaufwerke = new Set();
      } else {
        netzLaufwerke = new Set(
          String(stdout)
            .split(/\r?\n/)
            .map((z) => z.trim().replace(':', '').toUpperCase())
            .filter((z) => /^[A-Z]$/.test(z)),
        );
      }
      const warteten = nachErmittlung.splice(0);
      for (const rueckruf of warteten) {
        try {
          rueckruf(netzLaufwerke);
        } catch {
          /* ein fehlerhafter Rueckruf darf die uebrigen nicht verhindern */
        }
      }
    },
  );
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

// Nur fuer Tests: Zustand setzen bzw. zuruecksetzen.
function _setNetzLaufwerkeFuerTest(werte) {
  netzLaufwerke = werte === null ? null : new Set(werte);
}

module.exports = {
  NETZ_ABFRAGE_MS,
  istUncPfad,
  laufwerkVon,
  istNetzPfad,
  watchOptionenFuer,
  ermittleNetzLaufwerke,
  beiErmittlung,
  _setNetzLaufwerkeFuerTest,
};
