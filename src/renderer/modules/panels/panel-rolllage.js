// 4T-002129: Roll-Lage eines Panels über einen asynchronen Neuaufbau halten.
//
// Ein Panel, das seine Liste vor dem Laden leert und erst nach der Antwort des
// Hauptprozesses neu füllt, verliert dazwischen seine Roll-Lage: Die leere
// Fläche lässt sich nicht rollen, der Browser setzt sie auf null. Gemessen am
// Tags-Panel beim Sprachwechsel (300 Pixel fielen auf 0). Der Helfer merkt sich
// die Lage beim Beginn und stellt sie am Ende wieder her — aber nur, wenn
// dasselbe gezeichnet wird wie zuletzt (gleicher Schlüssel, etwa Datei und
// Filter). Ein anderes Dokument beginnt wie bisher oben.
//
// Zwei Aufrufe kurz hintereinander (das Neuzeichnen der Spalten läuft beim
// Sprachwechsel zweimal) teilen sich die zuerst gemerkte Lage; der zweite sähe
// sonst schon die geleerte Fläche.
'use strict';

const stand = new WeakMap();

/**
 * @param {Element|null} sektion Die Panel-Sektion; gerollt wird ihr Körper
 *   (`.sidebar-section-body`), ohne einen solchen das Element selbst.
 * @param {string} schluessel Was gezeichnet wird.
 * @returns {() => void} Am Ende eines vollständigen Neuaufbaus aufzurufen.
 */
export function halteRollLage(sektion, schluessel) {
  const el = sektion ? sektion.querySelector('.sidebar-section-body') || sektion : null;
  if (!el) return () => {};
  const s = stand.get(el) || { fertig: null, offen: null };
  if (!s.offen || s.offen.schluessel !== schluessel) {
    s.offen = { schluessel, lage: el.scrollTop, gleich: s.fertig === schluessel };
  }
  stand.set(el, s);
  const offen = s.offen;
  return () => {
    s.fertig = schluessel;
    s.offen = null;
    if (offen.gleich) el.scrollTop = offen.lage;
  };
}
