// 4T-000179: Abhaengigkeitsfreies Basis-Modul fuer die contextBridge-API.
// Bewusst ohne weitere Imports: esbuild platziert es dadurch im Bundle vor
// allen Konsumenten, auch innerhalb der Modul-Zyklen des mechanischen
// Schnitts (zyklische const-Exporte haetten sonst var-Hoisting-Semantik
// und waeren bei fruehen Top-Level-Zugriffen undefined).
'use strict';

export const api = window.api;

// 4T-002650 (Epic 3E-000416): Auswertung der Antwort von `settings:set`. Der
// Hauptprozess weist seit 4T-002649 Schlüssel außerhalb der Klasse 1 und Werte
// der falschen Art mit `{ ok: false, error }` ab. Die Hüllen der Schreib-Wege
// melden das hier in der Konsole des Fensters, mit Schlüssel und Grund, nie mit
// dem Wert. Eine Antwort ohne diese Form (ältere Prüf-Attrappen) gilt als
// angenommen.
export function settingWriteAccepted(key, antwort) {
  if (antwort && typeof antwort === 'object' && antwort.ok === false) {
    console.warn('Einstellung abgewiesen:', key, antwort.error);
    return false;
  }
  return true;
}

// Kurzform-Selektor. Gehoert wie api zu den zyklenfreien Basis-Exporten
// (der Generator behandelt $-Namen wegen des Regex-Wortzeichensatzes nicht).
export const $ = (sel) => document.querySelector(sel);

// R1-05/R1-06/R2-11 (4T-000180): Geteilte Voll-Text-Serialisierung pro
// Doc-Version. CodeMirror-Text-Objekte sind immutabel — jede Aenderung
// erzeugt eine neue Instanz, unveraenderte Versionen behalten ihre
// Identitaet. Die WeakMap teilt deshalb genau eine toString()-Kopie
// zwischen allen StateFields, Plugins und Listenern, die im selben
// Update den Voll-Text brauchen (vorher: bis zu sechs Kopien pro
// Tastendruck ueber Marker-Felder, Live-Pass, Lint und Dirty-Vergleich).
const docTextCache = new WeakMap();
export function getDocText(doc) {
  let text = docTextCache.get(doc);
  if (text === undefined) {
    text = doc.toString();
    docTextCache.set(doc, text);
  }
  return text;
}
