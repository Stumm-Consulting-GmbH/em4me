// 4T-001731 (Epic 3E-000306): Eine Datei des Bereichs kopieren.
//
// Eigenes Modul und nicht in file-actions.js, aus denselben beiden Gruenden wie
// file-trash.js daneben. Fachlich: Die uebrigen Datei-Aktionen aendern den
// Bestand am Ort — sie benennen um oder haengen um; diese hier vermehrt ihn und
// traegt eine eigene Abfolge samt eigener Rueckmeldung. Und das
// Groessen-Budget von file-actions.js (466 von 500 Zeilen) haette den Zusatz
// nicht getragen.
//
// **Es gibt bewusst keinen Dialog** (Entscheidung E5 des Epics): kein
// Namens-Dialog, keine Rueckfrage, kein Ziel-Ordner. Der Weg ist ein Klick;
// wer die Kopie anders nennen will, nutzt das Umbenennen im Eintrag darueber.
// Deshalb ist dieses Modul so kurz — die ganze Fachlichkeit (Namensfindung,
// Bereichs-Grenze, Begleitdaten) liegt im Hauptprozess, wo sie hingehoert
// (E7), und hier bleibt der Aufruf samt Rueckmeldung.
//
// Eigener Zustand: keiner.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';

import { sichereOffeneReiter } from './file-actions.js';
import { showStatusbarHint } from './views.js';

// Fehler-Code des Kanals -> Kurzhinweis. Was hier nicht steht, laeuft auf den
// allgemeinen Hinweis; die Codes sind bewusst nicht erschoepfend aufgezaehlt,
// weil der Kanal auch rohe Dateisystem-Meldungen durchreicht (Muster
// meldeAnlageFehler in area-panel-anlage.js: der Code wird uebersetzt, der
// Text nie angezeigt).
const FEHLER_HINWEISE = {
  'split-document': 'areaPanel.copySplit',
};

/**
 * Legt eine Kopie der Datei im selben Ordner an.
 *
 * **Die Reihenfolge ist die Entscheidung dieses Wegs**, und sie steht hier,
 * damit sie beim naechsten Umbau nicht verloren geht:
 *
 *  1. **Offene Reiter der Vorlage sichern.** Der Kanal kopiert die DATEI, also
 *     ihren Stand auf der Platte. Haette der Anwender ungesicherte Aenderungen
 *     offen, truege die Kopie einen aelteren Text als den, den er vor sich
 *     sieht — und genau das waere der Fehler, den niemand vermutet, weil die
 *     Kopie ja "dieselbe Datei" ist. Derselbe Schritt in derselben Absicht
 *     steht am Anfang des Umbenennen-Wegs (`renameFileAtPath`), und es ist
 *     dieselbe Funktion, nicht eine zweite gleichlautende.
 *  2. **Kopieren.** Ein Abbruch der Speichern-Abfrage in Schritt 1 stoppt
 *     alles; es ist bis dahin nichts entstanden.
 *  3. **Panel nachziehen.** Die Kopie erscheint unmittelbar an ihrer
 *     Sortier-Position, ohne auf den gedrosselten Verzeichnis-Waechter zu
 *     warten (AK9). **Geoeffnet wird sie nicht** — das ist ausdruecklich keine
 *     Unterlassung, sondern Umfang des Epics: Der Anwender kopiert, um eine
 *     Grundlage zu haben, und entscheidet selbst, wann er sie aufschlaegt.
 *
 * @param {string} absPath Absoluter Pfad der Vorlage im Bereich.
 * @param {() => void} aufRefresh Neuaufbau der sichtbaren Panels.
 */
export async function copyFileAtPath(absPath, aufRefresh) {
  if (typeof absPath !== 'string' || !absPath) return;
  if (!(await sichereOffeneReiter(absPath))) return;
  let ergebnis;
  try {
    ergebnis = await api.areaCopyFile(absPath);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    const schluessel = (ergebnis && FEHLER_HINWEISE[ergebnis.error]) || 'areaPanel.copyFailed';
    showStatusbarHint(schluessel, { duration: 5000, error: true });
    return;
  }
  if (typeof aufRefresh === 'function') aufRefresh();
  // Der Hinweis NENNT den Namen der Kopie, weil er vergeben und nicht erfragt
  // wurde: Ohne ihn muesste der Anwender in der Liste suchen, welche der
  // gleichnamigen Nummern gerade entstanden ist.
  showStatusbarHint(null, {
    duration: 3000,
    text: t('areaPanel.copyDone').replace('{name}', ergebnis.name),
  });
}
