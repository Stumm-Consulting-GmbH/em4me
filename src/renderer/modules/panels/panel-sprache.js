// 4T-002129: Zusammengesetzte Texte der Seitenleisten-Panels folgen dem
// Sprachwechsel.
//
// Ein fester Text erreicht die neue Sprache über das `data-i18n`-Merkmal, das
// `applyTranslations` beim Sprachwechsel abarbeitet. Ein Text mit Platzhalter
// oder mit einem Bestandteil, der nicht übersetzt wird (Dateiname, Anzahl),
// kann das nicht: Das Merkmal ersetzte den ganzen Inhalt durch den nackten
// Katalog-Wert. Solche Texte setzt dieser Helfer und merkt sich dabei Schlüssel,
// Werte und die festen Bestandteile davor und dahinter; beim Ereignis des
// Sprachwechsels baut er sie aus dem Gemerkten neu. Das Panel selbst wird dabei
// nicht neu aufgebaut, und deshalb bleiben Fokus, Auswahl und Roll-Lage stehen.
//
// Ein Blatt-Modul ohne Rückweg in die Panels: Es kennt allein den Katalog.
'use strict';

import { t } from '../../i18n.js';

const MERKMAL = 'data-i18n-satz';

function gemerkt(el) {
  try {
    return JSON.parse(el.getAttribute(MERKMAL) || '{}') || {};
  } catch {
    return {};
  }
}

// Platzhalter werden einzeln wie im Bestand ersetzt (`replace` je Name).
function baue({ key, werte, vor, nach }) {
  let text = t(key);
  for (const [name, wert] of Object.entries(werte || {})) {
    text = text.replace(`{${name}}`, String(wert));
  }
  return `${vor || ''}${text}${nach || ''}`;
}

function wende(el, ziel, satz) {
  if (ziel === 'text') el.textContent = baue(satz);
  else el.setAttribute(ziel, baue(satz));
}

/**
 * Setzt einen übersetzten Text, der den Sprachwechsel überdauert.
 *
 * @param {Element} el Ziel-Element.
 * @param {'text'|'title'|'aria-label'} ziel Inhalt oder Merkmal des Elements.
 * @param {string} key Schlüssel im Sprachkatalog.
 * @param {{werte?: object, vor?: string, nach?: string}} [teile] Werte der
 *   Platzhalter sowie feste, nicht übersetzte Bestandteile davor und dahinter.
 */
export function setzeSprachSatz(el, ziel, key, { werte = null, vor = '', nach = '' } = {}) {
  const alle = gemerkt(el);
  alle[ziel] = { key, werte, vor, nach };
  el.setAttribute(MERKMAL, JSON.stringify(alle));
  wende(el, ziel, alle[ziel]);
}

/** Baut alle gemerkten Texte unterhalb von `wurzel` in der geladenen Sprache neu. */
export function erneuereSprachSaetze(wurzel = document) {
  for (const el of wurzel.querySelectorAll(`[${MERKMAL}]`)) {
    for (const [ziel, satz] of Object.entries(gemerkt(el))) wende(el, ziel, satz);
  }
}

document.addEventListener('i18n-language-changed', () => erneuereSprachSaetze());
