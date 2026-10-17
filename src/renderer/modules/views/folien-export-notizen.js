// --- Sprecher-Notizen in den Ausgaben des Foliensatzes (4T-002283, Epic 3E-000348) ---
// Story 4S-001083. Schwester-Datei von folien-export.js, nach dessen
// Zeilen-Budget ausgelagert: alles, was die Notizen in beide Ausgaben bringt.
//
// **Schalter.** Die Einstellung «Sprecher-Notizen mitgeben» (Seite «Export»,
// Gruppe «Foliensatz») liegt unter `export.folien.notizen`; Vorgabe aus, damit
// eine Weitergabe keine Notizen unbemerkt mitnimmt. Nur der Wert `true`
// schaltet ein — ein fehlender Wert (etwa weil ein gespeicherter
// `export`-Zweig die Vorgabe des Speichers überdeckt) bleibt aus.
//
// **Eine Quelle für beide Ausgaben.** Die Notizen jeder Folie werden auf der
// Druck-Fläche gezeichnet, als eigene Seite im Folien-Format hinter ihrer
// Folie (Klasse `presentation-druck-notizen`). Das PDF druckt diese Seite; die
// HTML-Seiten nehmen den gerenderten Inhalt derselben Seite in einen
// zugeklappten Notiz-Bereich (`<details>`). So zeigen beide Ausgaben dieselben
// Notizen (Paritäts-Checkliste der Entwicklungsrichtlinien).
//
// **Sicherheit.** Notizen sind Markdown-Text des Format-Kerns
// (`{ text, herkunft }`, 4T-002277) und laufen durch dieselbe Render-Pipeline
// wie der Folien-Inhalt (`render`), nie als Roh-HTML; auf den HTML-Seiten
// laufen sie zusätzlich durch dieselbe Einbettung von Bildern und Verweisen
// (`bereiteInhaltVor`) wie die Folie.
'use strict';

import { t } from '../../i18n.js';
// Bewusst leicht: nur Übersetzung und Brücke. Die Einstellungs-Seite liest
// den Schlüssel von hier, ohne den Export-Weg mitzuladen; die Einbettung
// (`bereiteInhaltVor` aus html-export.js) reicht folien-export.js herein.
import { api } from '../app/api.js';

/** Schlüssel der Einstellung im Speicher. */
export const NOTIZEN_EINSTELLUNG = 'export.folien.notizen';

/** Klassen der Notiz-Seite auf der Druck-Fläche und ihres Inhalts. */
export const NOTIZ_SEITE_KLASSE = 'presentation-druck-notizen';
export const NOTIZ_KOPF_KLASSE = 'presentation-druck-notizen-kopf';
export const NOTIZ_INHALT_KLASSE = 'presentation-druck-notizen-inhalt';
/** Eine einzelne gerenderte Notiz (Herkunft als data-Attribut). */
export const NOTIZ_KLASSE = 'presentation-druck-notiz';

/** Klasse des Notiz-Bereichs auf einer HTML-Seite. */
export const SEITEN_NOTIZEN_KLASSE = 'praesentation-seite-notizen';

// Gestaltung der Notiz-Seite im PDF. Als Stil-Attribut gesetzt, weil die
// Seite nur für die Dauer der Ausgabe besteht; die Schriftgröße steht am
// Inhalt selbst, weil die Druck-Regel `.presentation-druck .markdown-body`
// sie sonst auf die Grundschrift der Folie setzte.
const SEITEN_STIL = {
  background: '#ffffff',
  color: '#1a1a1a',
  boxSizing: 'border-box',
  padding: '48px 64px',
  fontFamily: 'system-ui, sans-serif',
};
const KOPF_STIL = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#555555',
  borderBottom: '1px solid #cccccc',
  paddingBottom: '8px',
  marginBottom: '20px',
};
const INHALT_SCHRIFT = '22px';

// Eigene Regeln der HTML-Seite für den Notiz-Bereich: eine schmale Zeile
// zwischen Folie und Blätter-Leiste; aufgeklappt legt sich der Inhalt über
// die Folie, statt die Bühne zu verkleinern — das Blätter-Skript passt die
// Folie nur beim Laden und bei Fenster-Größen-Änderung ein.
export const NOTIZEN_SEITEN_REGELN = [
  `details.${SEITEN_NOTIZEN_KLASSE} { flex: 0 0 auto; position: relative; ` +
    'font: 14px/1.4 system-ui, sans-serif; color: #e8e8e8; text-align: center; }',
  `.${SEITEN_NOTIZEN_KLASSE} > summary { cursor: pointer; padding: 4px 8px; }`,
  `.${SEITEN_NOTIZEN_KLASSE} > .markdown-body { position: absolute; left: 0; right: 0; ` +
    'bottom: 100%; max-height: 50vh; overflow: auto; box-sizing: border-box; ' +
    'padding: 16px 32px; text-align: left; background: #ffffff; color: #1a1a1a; ' +
    'border-top: 1px solid #666; }',
].join('\n');

/**
 * Liest den Schalter «Sprecher-Notizen mitgeben». Ohne Brücke oder bei einem
 * Fehler bleibt er aus.
 *
 * @returns {Promise<boolean>}
 */
export async function notizenMitgeben() {
  if (typeof api.getSetting !== 'function') return false;
  try {
    return (await api.getSetting(NOTIZEN_EINSTELLUNG)) === true;
  } catch {
    return false;
  }
}

/** Die Notizen einer Folie mit Text, in Dokument-Reihenfolge. */
export function notizenMitText(folie) {
  const liste = folie && Array.isArray(folie.notizen) ? folie.notizen : [];
  return liste.filter((n) => n && typeof n.text === 'string' && n.text.trim());
}

/** Zahl der mitgegebenen Notizen im Foliensatz (nur solche mit Text). */
export function mitgegebeneNotizen(modell) {
  const folien = (modell && modell.folien) || [];
  return folien.reduce((s, f) => s + notizenMitText(f).length, 0);
}

/**
 * Baut die Notiz-Seite einer Folie: Kopf mit der Folien-Nummer, darunter die
 * gerenderten Notizen. Folien ohne Notizen bekommen keine Seite.
 *
 * @param {Document} doc
 * @param {object} angaben
 * @param {object} angaben.folie Folie des Format-Kerns.
 * @param {number} angaben.index null-basiert.
 * @param {{breite: number, hoehe: number}} angaben.geometrie
 * @param {string} angaben.seitenKlasse Klasse jeder Seite der Druck-Fläche.
 * @param {(markdown: string) => string} angaben.render Render-Pipeline.
 * @param {(key: string) => string} [angaben.uebersetze]
 * @returns {HTMLElement|null} die Seite oder null.
 */
export function baueNotizSeite(doc, angaben) {
  const { folie, index, geometrie, seitenKlasse, render } = angaben;
  const notizen = notizenMitText(folie);
  if (!notizen.length) return null;
  const uebersetze = angaben.uebersetze || t;
  const seite = doc.createElement('div');
  seite.className = `${seitenKlasse} ${NOTIZ_SEITE_KLASSE}`;
  seite.dataset.folie = String(index);
  // Mindestens eine Seite im Folien-Format; längere Notizen laufen auf
  // weitere Seiten desselben Formats weiter, statt am Seiten-Ende still
  // abgeschnitten zu werden (die Seiten-Regel der Druck-Fläche schneidet ab).
  Object.assign(seite.style, SEITEN_STIL, {
    width: `${geometrie.breite}px`,
    minHeight: `${geometrie.hoehe}px`,
    overflow: 'visible',
  });
  const kopf = doc.createElement('div');
  kopf.className = NOTIZ_KOPF_KLASSE;
  Object.assign(kopf.style, KOPF_STIL);
  kopf.textContent = uebersetze('export.folien.notizSeite').replace('{nummer}', String(index + 1));
  const inhalt = doc.createElement('div');
  inhalt.className = `markdown-body ${NOTIZ_INHALT_KLASSE}`;
  inhalt.style.fontSize = INHALT_SCHRIFT;
  for (const notiz of notizen) {
    const el = doc.createElement('div');
    el.className = NOTIZ_KLASSE;
    el.dataset.herkunft = notiz.herkunft === 'html' ? 'html' : 'prozent';
    el.innerHTML = render(notiz.text);
    inhalt.appendChild(el);
  }
  seite.append(kopf, inhalt);
  return seite;
}

/**
 * Der gerenderte Notiz-Inhalt einer Folie auf der Druck-Fläche, oder null.
 *
 * @param {Element} flaeche
 * @param {number} index null-basiert.
 * @returns {Element|null}
 */
export function notizInhaltAufFlaeche(flaeche, index) {
  return flaeche.querySelector(
    `.${NOTIZ_SEITE_KLASSE}[data-folie="${Number(index)}"] .${NOTIZ_INHALT_KLASSE}`,
  );
}

/**
 * Der Notiz-Bereich der HTML-Seite einer Folie aus ihrer Notiz-Seite auf der
 * Druck-Fläche, durch dieselbe Einbettung wie die Folie.
 *
 * @param {Element} flaeche
 * @param {number} index null-basiert.
 * @param {(wurzel: Element, opts: object) => object} vorbereiten die Einbettung
 *   der Folie (`bereiteInhaltVor` aus html-export.js).
 * @param {(key: string) => string} [uebersetze]
 * @returns {{z: {verweise: number, bilder: number, diagramme: number,
 *   formeln: boolean}, html: string}|null} null bei einer Folie ohne Notizen.
 */
export function notizBereichVon(flaeche, index, vorbereiten, uebersetze = t) {
  const inhalt = notizInhaltAufFlaeche(flaeche, index);
  if (!inhalt) return null;
  const behaelter = flaeche.ownerDocument.createElement('div');
  for (const kind of inhalt.childNodes) behaelter.appendChild(kind.cloneNode(true));
  const z = vorbereiten(behaelter, { uebersetze });
  return { z, html: notizenBereich(behaelter.innerHTML, uebersetze) };
}

/**
 * Der zugeklappte Notiz-Bereich einer HTML-Seite.
 *
 * @param {string} inhaltHtml der vorbereitete Notiz-Inhalt.
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function notizenBereich(inhaltHtml, uebersetze = t) {
  const titel = String(uebersetze('export.folien.notizen'))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return [
    `<details class="${SEITEN_NOTIZEN_KLASSE}">`,
    `<summary>${titel}</summary>`,
    `<div class="markdown-body">${inhaltHtml}</div>`,
    '</details>',
  ].join('\n');
}
