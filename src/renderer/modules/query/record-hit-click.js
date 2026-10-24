// 4T-002040 (Epic 3E-000258, Entscheidung F1 Option A): Klick auf einen
// Datensatz im Abfrage-Ergebnis. Das Modul beantwortet eine Frage: ob ein
// Klick einen Datensatz getroffen hat und wie daraus die Maske des Datensatzes
// wird. Es gilt für den Datensatz-Treffer selbst und für einen Datensatz-Verweis
// in einer Spalte; beide tragen dieselben Angaben am DOM
// (`display-list-table.js`):
//
//   data-fm-record-table  absoluter Pfad der Kopf-Datei der Tabelle
//   data-fm-record-id     Kennung des Datensatzes, etwa `r-00001`
//   data-fm-record-maske  (optional) Pfad der Maske, die der Klick öffnet
//
// 4T-002249 (Epic 3E-000262, F1 A): Die Zeile einer Listen-Maske trägt die
// dritte Angabe, wenn die Abfrage-Datei mit `form` eine Maske nennt
// (`database/listen-maske.js`); ohne sie öffnet der Klick wie bisher die
// Standard-Maske. Weil dort die ganze Zeile der Treffer ist, geht ein
// Datei-Link in einer ihrer Zellen dem Klick der Zeile vor.
//
// Bewusst **kein** `data-fm-path`: Der zentrale Treffer-Klick öffnete sonst das
// Tabellen-Dokument, und das ist nach F1 technische Ablage. Seit 4T-002333
// (Epic 3E-000264, F2 A) führt auch ein Verweis im Fließtext über `openRecordHit`
// in die Maske (`views/link-navigation.js`, `activateLink`); ein Datensatz hat
// damit überall dasselbe Klick-Ziel, und die Zeile in der Tabellen-Datei
// erreicht der Handgriff «Im Tabellen-Dokument zeigen» der Maske
// (`database/masken-fehlt.js`).
//
// **Warum ein Dokument-Ereignis statt eines Imports** (Muster
// `datensatz-zeilen-zugang.js`): Die beiden Klick-Handler, die dieses Modul
// rufen (`views/link-navigation.js` für Lese- und geteilte Ansicht,
// `live/live-interaction.js` für die Live-Ansicht), liegen in der eingefrorenen
// Bestands-Komponente des Ordner-Import-Wächters. Ein statischer Import der
// Masken-Seite von hier meldet der Wächter als neuen Datei-Zyklus über
// Ordner-Grenzen mit sieben Dateien außerhalb jener Komponente (am 2026-09-30
// gemessen), und die Verdrahtungs-Stelle `app-init.js`, über die der
// Zeilen-Zugang seine Einstiege bekommt, steht an ihrem eingefrorenen
// Größen-Wert.
// Die Masken-Seite hört dagegen seit 4T-001939 auf `scg:open-form` und ruft dort
// `oeffneMaske`, mit dem Tor des Aus-Zustands der Erweiterung «Datenbank» an
// seiner einen Stelle. Dieses Modul importiert deshalb nichts.
'use strict';

const RECORD_HIT = '[data-fm-record-id]';
const FILE_HIT = '[data-fm-path]';

/**
 * Der Datensatz unter dem Ziel eines Klicks, oder null, wenn der Klick keinen
 * Datensatz der Abfrage-Ausgabe getroffen hat.
 *
 * @param {EventTarget|null} target
 * @returns {{ path: string, id: string, maske: string|null }|null} Tabellen-Pfad
 *   und Kennung, beide leer, wenn das getroffene Element sie nicht vollständig
 *   trägt; dazu die genannte Maske oder null (4T-002249).
 */
export function recordHitOf(target) {
  if (!target || typeof target.closest !== 'function') return null;
  const el = target.closest(RECORD_HIT);
  if (!el) return null;
  // 4T-002249: Ein Datei-Link innerhalb des Treffers ist ein eigener Treffer.
  const datei = target.closest(FILE_HIT);
  if (datei && datei !== el && el.contains(datei)) return null;
  return {
    path: el.dataset.fmRecordTable || '',
    id: el.dataset.fmRecordId || '',
    maske: el.dataset.fmRecordMaske || null,
  };
}

/**
 * Öffnet die Maske eines getroffenen Datensatzes. Ohne Tabellen-Pfad oder ohne
 * Kennung geschieht nichts; ohne Kennung öffnete die Masken-Seite sonst eine
 * Neuanlage.
 *
 * 4T-002249: Nennt der Treffer eine Maske, reist sie als `maske` mit; die
 * Masken-Seite nimmt Pfad oder Namen einer Masken-Datei der Tabelle. Ohne sie
 * bleibt das Ereignis, wie es war.
 *
 * @param {{ path: string, id: string, maske?: string|null }|null} hit Ergebnis von
 *   `recordHitOf`.
 * @returns {boolean} true, wenn die Maske angefordert wurde.
 */
export function openRecordHit(hit) {
  if (!hit || !hit.path || !hit.id) return false;
  const detail = { filePath: hit.path, recordId: hit.id };
  if (typeof hit.maske === 'string' && hit.maske) detail.maske = hit.maske;
  document.dispatchEvent(new CustomEvent('scg:open-form', { detail }));
  return true;
}

/**
 * Setzt die Angaben eines Datensatz-Klicks an ein Element. Der Titel nennt den
 * Datensatz in der Schreibweise eines Verweises im Fließtext (`Tabelle#^r-00042`).
 *
 * @param {HTMLElement} el
 * @param {{ path?: string, table?: string, id?: string }} record
 */
export function markRecordHit(el, record) {
  const id = (record && record.id) || '';
  el.dataset.fmRecordId = id;
  if (record && typeof record.path === 'string' && record.path) {
    el.dataset.fmRecordTable = record.path;
  }
  if (record && record.table && id) el.title = `${record.table}#^${id}`;
}
