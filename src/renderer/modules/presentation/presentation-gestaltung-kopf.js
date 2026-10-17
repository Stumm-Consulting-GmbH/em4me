// 4T-002282 (Epic 3E-000348): Der Schreibweg des Dialogs «Gestaltung dieser
// Präsentation…» in den Dateikopf — Lesen des `theme`-Eintrags, Bauen des
// neuen Werts und Schreiben über `writeFrontmatter`.
//
// Reine Funktionen ohne DOM; der Dialog (presentation-gestaltung-dialog.js)
// und die Prüffälle rufen sie auf.
//
// **Was geschrieben wird** (Lösungsansatz (c)): `name:` mit dem gewählten Theme
// und nur die eigenen Werte; ohne eigene Werte steht `theme: <Name>`. Der Kopf
// wird nie neu serialisiert: `writeFrontmatter` setzt allein den geänderten
// Schlüssel `theme`, Reihenfolge, Kommentare und alle übrigen Schlüssel bleiben
// byte-gleich. Unbekannte Schlüssel im Block und Slot-Werte, die die Prüfung
// nicht bestehen, bleiben stehen, solange die Zeile keinen eigenen Wert
// bekommt: Der Dialog verwirft nichts, was er nicht zeigt.
//
// **Als ein Rückgängig-Schritt** schreibt der Aufrufer: `textAenderung` liefert
// die eine Ersetzung zwischen altem und neuem Text, die als eine Transaktion in
// den Editor geht.
'use strict';

import { extractFrontmatter, writeFrontmatter } from '../../../shared/markdown/frontmatter.js';
import {
  FOLIEN_SLOTS,
  THEME_VORGABE,
  slotWertPruefen,
} from '../../../shared/presentation/presentation-themes.js';

const hat = (obj, schluessel) => Object.prototype.hasOwnProperty.call(obj, schluessel);

/**
 * Liest den `theme`-Eintrag eines Dokument-Kopfs.
 *
 * @param {string} inhalt der Dokument-Text.
 * @returns {{ok: boolean, vorhanden: boolean, themeName: string,
 *   eigene: Object<string,string>, extra: Object<string,unknown>}}
 *   `ok` ist false bei defektem Kopf (dann wird nie geschrieben). `themeName`
 *   ist das gewählte Theme (ohne Angabe oder ohne `name:` die Vorgabe
 *   `light`), `eigene` die gültigen eigenen Slot-Werte, `extra` alles Übrige
 *   im Block.
 */
export function leseKopfGestaltung(inhalt) {
  const leer = { ok: true, vorhanden: false, themeName: THEME_VORGABE, eigene: {}, extra: {} };
  let fm;
  try {
    fm = extractFrontmatter(typeof inhalt === 'string' ? inhalt : '');
  } catch {
    return { ...leer, ok: false };
  }
  if (!fm || fm.parseError) return { ...leer, ok: false };
  const daten = fm.data || {};
  if (!hat(daten, 'theme') || daten.theme === null || daten.theme === undefined) return leer;
  const theme = daten.theme;
  if (typeof theme === 'string' || typeof theme === 'number') {
    const name = String(theme).trim();
    return { ...leer, vorhanden: true, themeName: name || THEME_VORGABE };
  }
  if (typeof theme !== 'object' || Array.isArray(theme)) return { ...leer, vorhanden: true };
  const name = typeof theme.name === 'string' && theme.name.trim() ? theme.name.trim() : '';
  const eigene = {};
  const extra = {};
  for (const [schluessel, wert] of Object.entries(theme)) {
    if (schluessel === 'name') continue;
    const gueltig = FOLIEN_SLOTS.includes(schluessel) ? slotWertPruefen(wert) : null;
    if (gueltig !== null) eigene[schluessel] = gueltig;
    else extra[schluessel] = wert;
  }
  return { ok: true, vorhanden: true, themeName: name || THEME_VORGABE, eigene, extra };
}

/**
 * Der neue Wert des Schlüssels `theme`.
 *
 * @param {string} themeName das gewählte Theme.
 * @param {Object<string,string>} eigene die eigenen Slot-Werte.
 * @param {Object<string,unknown>} [extra] Übriges aus dem bisherigen Block;
 *   ein Slot mit eigenem Wert ersetzt seinen Eintrag darin.
 * @returns {string|object} `<Name>` ohne eigene Werte, sonst der Block.
 */
export function themeKopfWert(themeName, eigene, extra = {}) {
  const block = { name: themeName };
  for (const slot of FOLIEN_SLOTS) {
    if (eigene && hat(eigene, slot)) block[slot] = eigene[slot];
  }
  for (const [schluessel, wert] of Object.entries(extra || {})) {
    if (!hat(block, schluessel)) block[schluessel] = wert;
  }
  return Object.keys(block).length === 1 ? themeName : block;
}

/**
 * Schreibt den Wert des Schlüssels `theme` in den Kopf; alle übrigen
 * Schlüssel und Kommentare bleiben byte-gleich.
 *
 * @param {string} inhalt der Dokument-Text.
 * @param {string|object} wert Ergebnis von `themeKopfWert`.
 * @returns {string|null} der neue Text, oder null bei defektem Kopf.
 */
export function schreibeThemeInKopf(inhalt, wert) {
  const quelle = typeof inhalt === 'string' ? inhalt : '';
  let fm;
  try {
    fm = extractFrontmatter(quelle);
  } catch {
    return null;
  }
  if (!fm || fm.parseError) return null;
  const soll = { ...(fm.data || {}), theme: wert };
  const gesamt = writeFrontmatter(quelle, soll);
  const rueckfall = gesamt && gesamt.ok && typeof gesamt.text === 'string' ? gesamt.text : null;
  if (fm.raw === null) return rueckfall;
  const gespleisst = spleisseThemeEintrag(quelle, fm, wert);
  // Nur was nachweislich denselben Kopf ergibt, wird genommen; sonst gilt der
  // Weg über das ganze Kopf-Dokument.
  if (gespleisst !== null) {
    try {
      const probe = extractFrontmatter(gespleisst);
      if (!probe.parseError && JSON.stringify(probe.data) === JSON.stringify(soll)) {
        return gespleisst;
      }
    } catch {
      // Rückfall unten.
    }
  }
  return rueckfall;
}

// Der Eintrag `theme` allein, serialisiert über denselben Schreiber wie der
// ganze Kopf (Anführungszeichen und Block-Form nach der YAML-Bibliothek).
function themeEintragZeilen(wert) {
  const ergebnis = writeFrontmatter('', { theme: wert });
  if (!ergebnis || !ergebnis.ok || typeof ergebnis.text !== 'string') return null;
  const zeilen = ergebnis.text.split('\n');
  // `---`, Eintrag …, `---`, leer.
  return zeilen.slice(1, zeilen.lastIndexOf('---'));
}

// Ersetzt im Kopf allein die Zeilen des Eintrags `theme` (oder fügt ihn am
// Ende des Kopfs an); alle übrigen Zeilen bleiben byte-gleich. Ein Eintrag der
// obersten Ebene beginnt in Spalte 0 und reicht bis zur nächsten Zeile, die in
// Spalte 0 mit etwas anderem als Leerraum beginnt; Leerzeilen am Ende gehören
// nicht dazu. `writeFrontmatter` allein schriebe das Kopf-Dokument neu und
// glättete dabei Abstände in fremden Schlüsseln.
function spleisseThemeEintrag(quelle, fm, wert) {
  const neu = themeEintragZeilen(wert);
  if (!neu) return null;
  const eol = quelle.includes('\r\n') ? '\r\n' : '\n';
  const start = quelle.indexOf('\n') + 1;
  const yamlText = fm.yamlText || '';
  if (quelle.slice(start, start + yamlText.length) !== yamlText) return null;
  const zeilen = yamlText === '' ? [] : yamlText.split(/\r?\n/);
  const von = zeilen.findIndex((z) => /^theme[ \t]*:/.test(z));
  let ergebnis;
  if (von < 0) {
    ergebnis = [...zeilen, ...neu];
  } else {
    let bis = von + 1;
    while (bis < zeilen.length && (zeilen[bis] === '' || /^[ \t]/.test(zeilen[bis]))) bis += 1;
    while (bis > von + 1 && zeilen[bis - 1].trim() === '') bis -= 1;
    ergebnis = [...zeilen.slice(0, von), ...neu, ...zeilen.slice(bis)];
  }
  return quelle.slice(0, start) + ergebnis.join(eol) + quelle.slice(start + yamlText.length);
}

/**
 * Ist der neue Wert gleichbedeutend mit dem bisherigen Kopf? Dann wird nicht
 * geschrieben, auch kein `theme: light` in einen Kopf, der keinen Eintrag hat.
 *
 * @param {ReturnType<typeof leseKopfGestaltung>} gelesen
 * @param {string|object} wert
 * @returns {boolean}
 */
export function kopfUnveraendert(gelesen, wert) {
  if (!gelesen.vorhanden) return wert === THEME_VORGABE;
  const bisher = themeKopfWert(gelesen.themeName, gelesen.eigene, gelesen.extra);
  return JSON.stringify(bisher) === JSON.stringify(wert);
}

/**
 * Die eine Ersetzung zwischen zwei Texten (gemeinsamer Anfang und gemeinsames
 * Ende bleiben stehen), oder null ohne Unterschied.
 *
 * @param {string} alt
 * @param {string} neu
 * @returns {{from: number, to: number, insert: string}|null}
 */
export function textAenderung(alt, neu) {
  if (alt === neu) return null;
  let anfang = 0;
  const grenze = Math.min(alt.length, neu.length);
  while (anfang < grenze && alt[anfang] === neu[anfang]) anfang += 1;
  let ende = 0;
  while (ende < grenze - anfang && alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]) {
    ende += 1;
  }
  return { from: anfang, to: alt.length - ende, insert: neu.slice(anfang, neu.length - ende) };
}
