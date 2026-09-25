// 4T-001904 (Epic 3E-000318): Tags am Kartenfuß — Sammeln, Herausnehmen aus
// dem angezeigten Text und die Fußreihe der Karte.
//
// **Nur für die Anzeige.** Alles hier arbeitet auf dem Markdown-Fragment, das
// die Zeichnung ohnehin baut (`kartenFragment`), und nie auf dem Dokument. Die
// Tags bleiben im Text stehen, wo der Anwender sie geschrieben hat; die
// Darstellung wählt nur, wo sie gezeigt werden (Story 4S-000980, AK4).
//
// **Dieselbe Erkennung wie Index und Lese-Ansicht.** Gefunden wird mit `TAG_RE`
// über die maskierte Zeile (`maskiereFuerTagScan`: Code-Spannen, Wiki-Verweise
// und Attribut-Blöcke längengleich ausgeblendet) samt `istInAdresse` und
// `isValidTag` aus `src/shared/tag-erkennung.js` — dem Modul, das Index und
// Umbenennung bereits teilen. Eine zweite Regel entsteht nicht. Vorbild für das
// Herausnehmen ist das Verfahren von `stripInlineTags` in der Anzeige der
// Frontmatter-Abfragen; dessen eigener, schlichterer Ausdruck wird bewusst
// nicht übernommen, weil er Code-Spannen und Adressen nicht kennt.
//
// **Abhängigkeits-frei wie die Zeichnung** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n` — nur der prozessneutrale Kern.
'use strict';

import {
  TAG_RE,
  isValidTag,
  istInAdresse,
  maskiereFuerTagScan,
} from '../../../shared/tag-erkennung.js';
import { findPercentCommentRanges } from '../../../shared/markdown/plugins/comments.js';
import { zaunOeffnung, schliesstZaun } from '../../../shared/markdown/fence-level.js';

export const FUSS_KLASSE = 'kanban-karte-tags';

const LEERRAUM = /[ \t]/;

// Die Treffer einer Zeile, von links nach rechts. Ein eigener Ausdruck je
// Aufruf, weil `TAG_RE` global ist und sein `lastIndex` sonst zwischen Index,
// Umbenennung und Tafel geteilt würde.
function treffer(zeile) {
  const maskiert = maskiereFuerTagScan(zeile);
  const re = new RegExp(TAG_RE.source, TAG_RE.flags);
  const out = [];
  let m;
  while ((m = re.exec(maskiert)) !== null) {
    const name = m[1];
    if (istInAdresse(maskiert, m.index)) continue;
    if (!isValidTag(name)) continue;
    // Ein maskiertes `\#name` ist in der Lese-Ansicht ein wörtliches Zeichen und
    // kein Tag (die Escape-Regel von markdown-it greift vor der Tag-Regel).
    // Der Index kennt den Fall nicht; auf der Karte zählt, was angezeigt wird.
    if (m.index > 0 && zeile.charAt(m.index - 1) === '\\') continue;
    out.push({ start: m.index, ende: m.index + 1 + name.length, name });
  }
  return out;
}

// Nimmt die Treffer aus der Zeile, von rechts nach links, damit die Positionen
// der übrigen gültig bleiben. Mit jedem Tag geht **ein** Leerzeichen: das davor,
// wenn davor schon Text steht, sonst das danach — so entsteht weder ein doppelter
// Abstand mitten im Satz noch wird der Einzug einer Folgezeile angeschnitten.
function ohneTreffer(zeile, liste) {
  let text = zeile;
  for (let i = liste.length - 1; i >= 0; i--) {
    let { start, ende } = liste[i];
    const davor = text.slice(0, start);
    if (start > 0 && LEERRAUM.test(text.charAt(start - 1)) && davor.trim() !== '') start -= 1;
    else if (LEERRAUM.test(text.charAt(ende))) ende += 1;
    text = text.slice(0, start) + text.slice(ende);
  }
  return text;
}

/**
 * Zerlegt das Fragment einer Karte in den angezeigten Text ohne Tags und die
 * Tags selbst.
 *
 * Gesammelt wird aus der Karten-Zeile **und** den Folgezeilen, weil beide auf
 * der Karte stehen und ein Tag in einer Folgezeile sonst als einziges mitten im
 * Text bliebe. Die Reihenfolge ist die des Vorkommens; ein Tag erscheint einmal,
 * auch in anderer Groß- und Kleinschreibung — derselbe Maßstab wie im
 * Tag-Panel, das beide Schreibweisen zusammenfasst. Es gilt die erste.
 *
 * Eine Zeile, die nur aus Tags bestand, fällt ganz weg: Als Leerzeile stehen
 * gelassen, teilte sie den Absatz darüber und darunter in zwei.
 *
 * Ein Tag in einem privaten Kommentar (`%%` … `%%`) bleibt, wo es ist: Die
 * Lese-Ansicht blendet den Kommentar aus, und am Fuß stünde sonst ein Tag, das
 * die Karte an keiner anderen Stelle zeigt. Die Bereiche kommen aus dem einen
 * Kommentar-Scanner des Bestands.
 *
 * @param {string} fragment Markdown-Fragment aus `kartenFragment`.
 * @returns {{text: string, tags: string[]}}
 */
export function trenneKartenTags(fragment) {
  const quelle = String(fragment == null ? '' : fragment);
  const tags = [];
  const gesehen = new Set();
  const zeilen = [];
  const kommentare = findPercentCommentRanges(quelle);
  const imKommentar = (pos) => kommentare.some((k) => pos >= k.from && pos < k.to);
  // Ein `#` in einem Code-Block der Folgezeilen ist nie ein Tag. Öffnen und
  // Schließen nach der Zaun-Regel aus `fence-level.js` (4T-001913), damit die
  // Tafel dieselben Code-Blöcke sieht wie die Lese-Ansicht.
  let offenerZaun = null;
  let versatz = 0;
  for (const zeile of quelle.split('\n')) {
    const beginn = versatz;
    versatz += zeile.length + 1;
    if (offenerZaun) {
      if (schliesstZaun(zeile, offenerZaun)) offenerZaun = null;
      zeilen.push(zeile);
      continue;
    }
    offenerZaun = zaunOeffnung(zeile);
    if (offenerZaun) {
      zeilen.push(zeile);
      continue;
    }
    const liste = treffer(zeile).filter((t) => !imKommentar(beginn + t.start));
    if (liste.length === 0) {
      zeilen.push(zeile);
      continue;
    }
    for (const { name } of liste) {
      const schluessel = name.toLowerCase();
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      tags.push(name);
    }
    const rest = ohneTreffer(zeile, liste);
    if (rest.trim() !== '') zeilen.push(rest);
  }
  return { text: zeilen.join('\n'), tags };
}

/**
 * Die Fußreihe einer Karte: je Tag ein Verweis mit derselben Klasse und
 * demselben Ziel wie in der Lese-Ansicht (`tagsPlugin` in
 * `src/shared/markdown/plugins/wiki.js`), damit Gestaltung und Klick-Weg
 * dieselben sind. Ohne Tag gibt es keine Reihe (AK5).
 *
 * Name und Ziel gehen als Text bzw. Attribut hinaus, nie als Markup.
 *
 * @param {string[]} tags
 * @returns {HTMLElement|null}
 */
export function baueTagFuss(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const fuss = document.createElement('div');
  fuss.className = FUSS_KLASSE;
  for (const name of tags) {
    const a = document.createElement('a');
    a.className = 'tag-link';
    a.setAttribute('href', `#tag:${name}`);
    a.textContent = `#${name}`;
    fuss.appendChild(a);
  }
  return fuss;
}

/**
 * Der Tag-Verweis an einer Zeiger-Stelle der Karte, sonst null.
 *
 * Gilt für jedes Tag der Karte — am Fuß wie im Text bei ausgeschaltetem
 * Schalter: Ein Tag, das aussieht wie ein Verweis und keiner ist, wäre ein
 * Bruch mit dem übrigen Bestand.
 *
 * @param {EventTarget|null} ziel
 * @returns {HTMLAnchorElement|null}
 */
export function tagVerweisAn(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const a = ziel.closest('a.tag-link');
  if (!a || typeof a.closest !== 'function' || !a.closest('.kanban-karte')) return null;
  const href = a.getAttribute('href') || '';
  return href.startsWith('#tag:') ? a : null;
}
