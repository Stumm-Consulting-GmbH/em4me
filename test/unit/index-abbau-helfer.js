// 4T-002885: Abbau-Hilfe für Prüfdateien, die einen Bereichs-Index über einem
// Wegwerf-Ordner aufbauen.
//
// Beim Abbau eines Bereichs-Index sichert das Programm seinen Zwischenspeicher
// noch einmal (`Area_Cache.mdda`, `teardownIndex` in
// `src/main/index/lifecycle.js`), und zwar ohne darauf zu warten: Der Stand
// wird synchron gelesen, geschrieben wird danach asynchron über eine
// Schattenkopie. Löscht die Prüfdatei ihren Wegwerf-Ordner unmittelbar nach dem
// Abbau, findet dieser Schreibvorgang den Ordner nicht mehr vor, und das
// Programm meldet «Area_Cache schreiben fehlgeschlagen … ENOENT» auf die
// Fehler-Ausgabe. Kein Fall scheitert daran, die Meldung verdeckt aber echte.
//
// Die Meldung des Programms ist im Betrieb ein echtes Signal und wird deshalb
// nicht unterdrückt. Stattdessen wartet der Abbau der Prüfdatei auf den
// Zustand «Zwischenspeicher geschrieben», bevor er den Ordner löscht:
//
//   const gemerkt = merkeZwischenspeicher(wurzeln);   // vor dem Abbau
//   vi.useFakeTimers();
//   … releaseRoot(…) …
//   vi.advanceTimersByTime(61_000);
//   vi.useRealTimers();
//   await warteAufZwischenspeicher(gemerkt);          // vor dem Löschen
//
// «Geschrieben» heißt: Die Datei steht in einem neuen Stand da, neben ihr
// liegt keine Schattenkopie mehr, und zwei Abfragen nacheinander sehen
// denselben Stand.
//
// Gewartet wird nur für Wurzeln, deren Index ein Bereichs-Index mit
// Zwischenspeicher war und zwischen den beiden Aufrufen wirklich abgebaut
// wurde; alle anderen schreiben nichts, und die Hilfe kehrt für sie sofort
// zurück.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { istSchattenkopie } = require_('../../src/main/documents/atomic-write.js');

// Obergrenze des Wartens je Aufruf. Der Schreibvorgang dauert Millisekunden;
// die Grenze greift nur, wenn er ausbleibt oder scheitert.
export const ZWISCHENSPEICHER_WARTEZEIT_MS = 5000;

// Kennung des Datei-Stands: Das Programm ersetzt die Datei über eine
// Schattenkopie, ein neuer Stand hat also eine andere Datei-Nummer oder
// zumindest eine andere Änderungszeit. `null` heißt: Die Datei gibt es nicht.
function standVon(pfad) {
  try {
    const st = fs.statSync(pfad, { bigint: true });
    return `${st.ino}:${st.mtimeNs}:${st.size}`;
  } catch {
    return null;
  }
}

// Liegt neben dem Zwischenspeicher noch eine Schattenkopie von ihm, läuft ein
// Schreibvorgang: der des Abbaus oder ein entprellter, der kurz davor begann.
function schreibtNoch(pfad) {
  const anfang = `.${path.basename(pfad)}.`;
  try {
    return fs
      .readdirSync(path.dirname(pfad))
      .some((name) => name.startsWith(anfang) && istSchattenkopie(name));
  } catch {
    return false;
  }
}

// Vor dem Abbau aufzurufen: hält je Wurzel fest, welcher Index-Eintrag dort
// steht und in welchem Stand sein Zwischenspeicher ist.
export function merkeZwischenspeicher(wurzeln) {
  const gemerkt = [];
  for (const wurzel of wurzeln) {
    const eintrag = indexes.get(wurzel);
    if (!eintrag || !eintrag.isArea || !eintrag.cachePath) continue;
    gemerkt.push({ wurzel, eintrag, pfad: eintrag.cachePath, vorher: standVon(eintrag.cachePath) });
  }
  return gemerkt;
}

// Nach dem Abbau und vor dem Löschen der Wegwerf-Ordner aufzurufen. Liefert
// die Wurzeln, deren Zwischenspeicher bis zur Obergrenze nicht geschrieben
// war oder deren Stand bis zuletzt in Bewegung blieb; für sie steht zusätzlich
// eine Zeile auf der Fehler-Ausgabe, damit ein ausbleibender Schreibvorgang
// nicht still verschwindet. `opts.abstand` (Abstand der Abfragen) ist allein
// für die Prüffälle der Hilfe da.
export async function warteAufZwischenspeicher(gemerkt, opts = {}) {
  const wartezeit = opts.wartezeit === undefined ? ZWISCHENSPEICHER_WARTEZEIT_MS : opts.wartezeit;
  const abstand = opts.abstand === undefined ? 5 : opts.abstand;
  // Steht der Eintrag noch in der Tabelle, hat ein anderer Halter den Abbau
  // verhindert; dann schreibt das Programm jetzt nichts.
  const offen = gemerkt.filter((g) => indexes.get(g.wurzel) !== g.eintrag);
  const ausstehend = () =>
    offen.filter(
      (g) => standVon(g.pfad) === g.vorher || !fs.existsSync(g.pfad) || schreibtNoch(g.pfad),
    );
  // Fertig heißt: zwei Abfragen nacheinander sehen denselben neuen Stand. Lief
  // beim Abbau schon ein entprellter Schreibvorgang, endet er vor dem des
  // Abbaus; die zweite Abfrage fängt den Augenblick dazwischen ab, in dem der
  // erste fertig ist und der zweite seine Schattenkopie noch nicht angelegt
  // hat. Ganz schließen ließe sich dieses Fenster nur im Programm, wenn der
  // Abbau seinen Schreibvorgang abwartbar machte.
  let zuletzt = null;
  try {
    await vi.waitFor(
      () => {
        if (ausstehend().length > 0) {
          zuletzt = null;
          throw new Error('Zwischenspeicher noch nicht geschrieben');
        }
        const jetzt = offen.map((g) => standVon(g.pfad)).join('|');
        if (offen.length > 0 && jetzt !== zuletzt) {
          zuletzt = jetzt;
          throw new Error('Stand des Zwischenspeichers noch nicht bestätigt');
        }
      },
      { timeout: wartezeit, interval: abstand },
    );
    return [];
  } catch {
    // Zwei Ausgänge der Obergrenze: Der Schreibvorgang steht noch aus, oder
    // der Stand wurde nie in zwei Abfragen nacheinander gleich gesehen. Beide
    // werden genannt; ein leeres Ergebnis hieße «geschrieben».
    const stehtAus = ausstehend();
    const rest = (stehtAus.length > 0 ? stehtAus : offen).map((g) => g.wurzel);
    const grund = stehtAus.length > 0 ? 'nicht geschrieben' : 'bis zuletzt in Bewegung';
    for (const wurzel of rest) {
      console.warn(`index-abbau-helfer: Zwischenspeicher nach ${wartezeit} ms ${grund}: ${wurzel}`);
    }
    return rest;
  }
}
