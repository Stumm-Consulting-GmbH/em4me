// 4T-1156 (Epic 3E-0219, E11): Ziel-Liste eines Verweis-Feldes der
// Eigenschafts-Profile.
//
// Eigene Datei und nicht in `views.js`: Die Lese-Sichten dort stehen bei 448
// Zeilen und damit dicht am Budget; vor allem aber ist dies eine Sicht der
// PROFIL-Fachlichkeit und nicht des Autocomplete-Systems. Die Nachbarschaft
// zu `views.js` bleibt trotzdem die richtige, weil beide dieselbe
// Index-Sicht lesen.
//
// Warum nicht die vorhandenen Wiki-Vorschläge aus `views.js`: Ein
// Verweis-Feld kennt drei Optionen, die die Ziel-Menge selbst betreffen —
// `restrictTo` grenzt sie ein, `sort` ordnet sie, `display` bestimmt den
// angezeigten Namen aus einem Frontmatter-Feld des Ziels. Alle drei werden
// hier angewandt, wo die Daten liegen, statt die volle Liste in den Renderer
// zu tragen und dort zu filtern (Leitsatz aus Konzept 6.11: Aufwand an den
// Änderungs-Umfang binden, nicht an die Bestandsgröße).
//
// Read-only-Sicht ohne eigenen Scan, wie die Nachbarn in `views.js`: Der
// Status wird durchgereicht, der Index-Aufbau bleibt Sache des Aufrufers.
// Ohne Overlay-Schicht — ungespeicherte Puffer bleiben außen vor, dieselbe
// Semantik wie bei der Wiki-Link-Vervollständigung.

'use strict';

const path = require('node:path');
const { toLogicalName } = require('../../shared/subpages.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
const { indexes, resolveRootInfo } = require('./store.js');

// Ordner-Pfad auf die Wurzel bezogen und mit '/' normalisiert; '' für eine
// Datei direkt in der Wurzel.
function relativerOrdner(root, absDatei) {
  const rel = path.relative(root, path.dirname(absDatei));
  if (rel === '' || rel === '.') return '';
  return rel.split(path.sep).join('/');
}

// Liegt `ordner` in einem der Präfixe? Ein Präfix bindet den Ordner UND
// seine Unterordner, sonst müsste jede Unterteilung nachgepflegt werden.
// Case-insensitiv wie die übrigen Pfad-Vergleiche der Anwendung (Windows).
function imBereich(ordner, praefixe) {
  if (!praefixe || praefixe.length === 0) return true;
  const o = ordner.toLowerCase();
  return praefixe.some((p) => {
    const q = String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (q === '') return true;
    return o === q || o.startsWith(q + '/');
  });
}

// Anzeige-Name aus einem Frontmatter-Feld des Ziels. Die Index-Map führt
// ihre Schlüssel kleingeschrieben; ein Listen-Wert ergibt seinen ersten
// Eintrag, alles Nicht-Skalare ergibt nichts (dann gilt der Datei-Name).
function anzeigeAus(props, feld) {
  if (!props || !feld) return null;
  const wert = props[String(feld).trim().toLowerCase()];
  const skalar = Array.isArray(wert) ? wert[0] : wert;
  if (typeof skalar === 'string') return skalar.trim() || null;
  if (typeof skalar === 'number' && Number.isFinite(skalar)) return String(skalar);
  return null;
}

/**
 * Ziele eines Verweis-Feldes im Suchraum der aktiven Datei.
 *
 * @param {string} activeFile Aktive Datei (bestimmt den Suchraum).
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters.
 * @param {object} [optionen] Die typ-eigenen Angaben des Feldes.
 * @param {string[]} [optionen.restrictTo] Ordner-Pfade, die die Menge eingrenzen.
 * @param {string} [optionen.display] Frontmatter-Feld des Ziels als Anzeige-Name.
 * @param {string} [optionen.sort] 'name' (Vorgabe) oder 'path'.
 * @returns {{status: string, targets: Array<{name: string, folder: string, display: string|null}>}}
 */
function verweisZiele(activeFile, areaRoot, optionen) {
  const leer = { status: 'unavailable', targets: [] };
  if (!activeFile) return leer;
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return leer;
  const entry = indexes.get(root);
  if (!entry) return leer;
  if (entry.status === 'indexing') return { status: 'indexing', targets: [] };
  // Ein eingefrorener Index eines toten Watchers gilt nicht als verbindlich
  // (dieselbe Regel wie bei den Wiki-Vorschlägen).
  if (entry.status !== 'ready') return leer;

  const opt = optionen || {};
  const praefixe = Array.isArray(opt.restrictTo)
    ? opt.restrictTo
    : opt.restrictTo
      ? [opt.restrictTo]
      : [];
  const display = opt.display || null;

  const targets = [];
  const gesehen = new Set();
  for (const datei of entry.files.keys()) {
    const ordner = relativerOrdner(root, datei);
    if (!imBereich(ordner, praefixe)) continue;
    // Unterseiten erscheinen in Slash-Schreibweise, so wie sie im Wiki-Link
    // geschrieben werden (Muster der Wiki-Vorschläge).
    const name = toLogicalName(path.basename(datei).replace(MD_EXT_RE, ''));
    const schluessel = name.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    targets.push({
      name,
      folder: ordner,
      display: display ? anzeigeAus(entry.propertiesPerFile.get(datei), display) : null,
    });
  }

  const nachPfad = opt.sort === 'path';
  targets.sort((a, b) => {
    if (nachPfad && a.folder !== b.folder) {
      return a.folder.localeCompare(b.folder, 'de', { sensitivity: 'base' });
    }
    const at = a.display || a.name;
    const bt = b.display || b.name;
    return at.localeCompare(bt, 'de', { sensitivity: 'base' });
  });
  return { status: 'ready', targets };
}

module.exports = { verweisZiele };
