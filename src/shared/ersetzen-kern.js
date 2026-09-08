// 4T-001526 (Epic 3E-000169): Prozess-neutraler Kern des Ersetzens an
// ausgewählten Fundstellen.
//
// Herausgelöst aus src/main/area/area-replace.js (4T-001524), als das Ersetzen
// einen zweiten Aufrufer bekam: Ein geänderter Reiter bekommt die Ersetzung auf
// seinen Puffer im Anzeige-Prozess (Entscheidung E5), jede andere Datei auf der
// Platte im Hauptprozess. Beide müssen an derselben Stelle dasselbe einsetzen —
// eine zweite Auslegung wäre für den Anwender nicht erklärbar und für einen
// Prüffall nicht greifbar. Muster ist der Rewrite-Kern der Verweis-Nachführung
// (src/shared/link-rewrite.js), der aus demselben Grund geteilt wird.
//
// Rein string-basiert, ohne Datei- und ohne DOM-Zugriff.
'use strict';

/**
 * Der Suchausdruck des Laufs.
 *
 * Muster und Flags kommen aus buildRegex im Anzeige-Prozess — eine Auslegung
 * von Groß-/Kleinschreibung und Regex-Modus, nicht zwei. Ohne g-Flag fände der
 * Lauf immer nur den ersten Fund und liefe endlos; es wird deshalb ergänzt,
 * statt vorausgesetzt.
 */
function baueSuchAusdruck(muster, flags) {
  const f = typeof flags === 'string' && flags ? flags : 'gm';
  return new RegExp(muster, f.includes('g') ? f : `${f}g`);
}

/**
 * Alle Fundstellen des Musters im Text als Map Offset -> Fund-Text.
 *
 * Der Lauf wiederholt die Suche auf dem Text, in den geschrieben wird. Damit
 * kommen die Länge des Fundes und seine Klammer-Gruppen von dort, wo auch der
 * Text herkommt, und zugleich ist belegt, dass an jedem übergebenen Offset
 * wirklich ein Fund steht.
 */
function fundstellen(text, regex) {
  const gefunden = new Map();
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[0].length === 0) {
      // Null-Breiten-Treffer (Muster ^ oder $) würden die Schleife nie beenden;
      // dieselbe Absicherung wie in Dokument- und Bereichs-Suche.
      regex.lastIndex += 1;
      continue;
    }
    gefunden.set(m.index, m[0]);
  }
  return gefunden;
}

/**
 * Die Ersetzung eines einzelnen Fundes.
 *
 * Ohne Regex-Modus ist der Ersetzungs-Text wörtlich zu nehmen, mit Regex-Modus
 * werden Rückverweise ($1, $2 …) ausgewertet (Entscheidung E6). Beides ist
 * dieselbe Auslegung wie `computeReplacement` in der Dokument-Suche; ein
 * Rückverweis auf eine nicht vorhandene Gruppe setzt Leertext ein, weil
 * String.replace das so hält — der Lauf bricht davon nicht ab.
 */
function ersetzungFuer(fund, { ersetzung, regexModus, muster, flags }) {
  if (!regexModus) return ersetzung;
  try {
    return fund.replace(baueSuchAusdruck(muster, flags), ersetzung);
  } catch {
    return ersetzung;
  }
}

/**
 * Wendet die Ersetzung an den übergebenen Offsets an.
 *
 * Ersetzt wird ausschließlich dort — nicht an allen Fundstellen des Textes.
 * Ein Offset, an dem kein Fund beginnt, oder einer, der in den vorigen Fund
 * hineinragt, ist ein Auftrags-Fehler und wird gemeldet statt zurechtgebogen:
 * An dieser Stelle blind zu schreiben hieße, den Text des Anwenders zu raten.
 *
 * @param {string} text Der Text, in dem die Offsets gelten.
 * @param {number[]} offsets Ausgewählte Fundstellen.
 * @param {object} opts muster, flags, ersetzung, regexModus.
 * @returns {{ok: true, text: string, anzahl: number}|{ok: false, grund: string}}
 */
function wendeErsetzungenAn(text, offsets, opts) {
  let regex;
  try {
    if (!opts || typeof opts.muster !== 'string' || !opts.muster) throw new Error('leeres Muster');
    regex = baueSuchAusdruck(opts.muster, opts.flags);
  } catch (err) {
    return { ok: false, grund: 'muster', detail: err && err.message ? err.message : String(err) };
  }

  const sortiert = [...new Set(offsets)].sort((a, b) => a - b);
  const gefunden = fundstellen(text, regex);
  let neu = '';
  let gelesenBis = 0;
  for (const offset of sortiert) {
    const fund = gefunden.get(offset);
    if (fund === undefined || offset < gelesenBis) return { ok: false, grund: 'offsetUngueltig' };
    neu += text.slice(gelesenBis, offset);
    neu += ersetzungFuer(fund, opts);
    gelesenBis = offset + fund.length;
  }
  neu += text.slice(gelesenBis);
  return { ok: true, text: neu, anzahl: sortiert.length };
}

module.exports = { baueSuchAusdruck, fundstellen, ersetzungFuer, wendeErsetzungenAn };
