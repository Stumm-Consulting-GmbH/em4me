// 4T-001601 (Epic 3E-000191, Story 4S-000906): die Anzeige-Bausteine der Seite
// My Extended Memory — ein DOM-Helfer, ein Knopf und die drei Formatierer.
//
// Sie standen bis zur Detail-Sicht modul-lokal in memory-page.js. Mit
// 4T-001601 bekam die Seite ein zweites Modul (memory-detail.js), das dieselben
// Bausteine braucht; eine zweite Kopie wäre die dritte Stelle gewesen, an der
// dieselben zehn Zeilen Zahlen-Formatierung stehen. Der Schnitt liegt deshalb
// hier: eine Datei ohne eigenen Zustand, von beiden Seiten-Modulen benutzt.
//
// Die Formatierer sind weiterhin eine bewusste kleine Kopie aus
// area-stats-page.js (dort modul-lokal, Zeile 108 bis 132) und kein Import:
// Die Renderer-Seiten sind gegeneinander geschnitten, und ein Export nur für
// die Zahlen-Formatierung verbände zwei Seiten, die sonst nichts miteinander
// zu tun haben.
'use strict';

import { intlLocale } from '../i18n.js';

/**
 * Element mit Klasse und Text. Text ausschliesslich ueber textContent — die
 * Seite zeigt Pfade und Namen aus fremden Ordnern.
 *
 * @param {string} tag Tag-Name.
 * @param {string} [className] Klassen-Attribut.
 * @param {string} [text] Textinhalt.
 * @returns {HTMLElement} das neue Element.
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Schaltflaeche der Seite. Ein deaktivierter Knopf bekommt keinen Zuhoerer.
 *
 * @param {string} className Klassen-Attribut.
 * @param {string} label Beschriftung.
 * @param {Function} onClick Klick-Behandlung.
 * @param {object} [optionen] `disabled`.
 * @returns {HTMLButtonElement} der neue Knopf.
 */
export function knopf(className, label, onClick, { disabled = false } = {}) {
  const node = el('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  if (!disabled) node.addEventListener('click', onClick);
  return node;
}

/**
 * Zeitpunkt in der Sprache der Oberflaeche. intlLocale() liefert die
 * BCP-47-Form; die Kennung einer eigenen Sprache (`custom:<code>`) wuerde in
 * toLocaleString werfen.
 *
 * @param {string|number|Date} wert Zeitpunkt.
 * @returns {string} formatierter Zeitpunkt.
 */
export function zeitpunkt(wert) {
  try {
    return new Date(wert).toLocaleString(intlLocale() || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(wert);
  }
}

/**
 * Zahl mit Tausender-Trennung in der Sprache der Oberflaeche.
 *
 * @param {number} wert Zahl.
 * @returns {string} formatierte Zahl.
 */
export function zahl(wert) {
  return Number(wert || 0).toLocaleString(intlLocale() || undefined);
}

/**
 * Byte-Groesse in Stufen bis Megabyte (Muster area-stats-page.js).
 *
 * @param {number} wert Bytes.
 * @returns {string} formatierte Groesse.
 */
export function bytes(wert) {
  const n = Number(wert || 0);
  const lang = intlLocale() || undefined;
  if (n < 1024) return `${n.toLocaleString(lang)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString(lang, { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`;
}
