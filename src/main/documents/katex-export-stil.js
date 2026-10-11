// 4T-002167 (Epic 3E-000347): Das KaTeX-Stilblatt samt Schriften fuer den
// HTML-Export, die Schriften als Daten-Adressen eingesetzt.
//
// **Warum im Hauptprozess.** Der Renderer kann die Schrift-Dateien neben
// seiner Seite nicht selbst lesen: `fetch` kennt das Schema `file:` nicht, und
// die Inhalts-Regel des Fensters laesst fuer Daten nur die eigene Seite zu.
// Gelesen wird deshalb hier, ueber den schmalen Kanal `html:katexStyles` in
// src/main/ipc/dialogs.js, ohne Parameter und allein aus dem festen Ordner der
// Anwendung — der Renderer kann keinen Pfad mitgeben.
//
// **Was geliefert wird.** Das Stilblatt `katex.css`, das scripts/build-katex-
// assets.js beim Renderer-Bau aus node_modules/katex erzeugt (nur woff2), mit
// jedem `url(fonts/<Name>.woff2)` ersetzt durch die Daten-Adresse der Datei.
// Bleibt ein Schrift-Verweis ohne Daten-Adresse uebrig, wirft die Funktion,
// statt eine Datei auszuliefern, deren Formeln beim Empfaenger ohne Schrift
// erscheinen.
//
// Electron-frei (nur node:fs und node:path), damit unit-pruefbar.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const KATEX_ORDNER = path.join(__dirname, '..', '..', 'renderer', 'katex');

const SCHRIFT_VERWEIS = /url\((["']?)fonts\/([\w.-]+\.woff2)\1\)/g;
const SCHRIFT_REST = /url\((["']?)fonts\//;

// Der Inhalt aendert sich zur Laufzeit nicht; einmal gelesen genuegt.
let zwischenspeicher = null;

/**
 * Liest das KaTeX-Stilblatt und setzt die Schriften als Daten-Adressen ein.
 *
 * @param {string} [ordner] Ordner mit `katex.css` und `fonts/`; Vorgabe ist
 *   der Ordner der Anwendung. Nur Pruefaelle geben einen anderen an.
 * @returns {Promise<string>} Der Stil-Text.
 */
async function katexStilMitSchriften(ordner = KATEX_ORDNER) {
  const standard = ordner === KATEX_ORDNER;
  if (standard && zwischenspeicher) return zwischenspeicher;
  const css = await fs.readFile(path.join(ordner, 'katex.css'), 'utf8');
  const namen = [...new Set([...css.matchAll(SCHRIFT_VERWEIS)].map((m) => m[2]))];
  const adressen = new Map();
  for (const name of namen) {
    const inhalt = await fs.readFile(path.join(ordner, 'fonts', name));
    adressen.set(name, `data:font/woff2;base64,${inhalt.toString('base64')}`);
  }
  const ersetzt = css.replace(
    SCHRIFT_VERWEIS,
    (_treffer, _q, name) => `url(${adressen.get(name)})`,
  );
  if (SCHRIFT_REST.test(ersetzt)) {
    throw new Error('KaTeX-Stil: Schrift-Verweis ohne Daten-Adresse');
  }
  if (standard) zwischenspeicher = ersetzt;
  return ersetzt;
}

module.exports = { katexStilMitSchriften, KATEX_ORDNER };
