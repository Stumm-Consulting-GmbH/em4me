// 4T-002510 (Epic 3E-000402): Die beiden Dienste des Hauptprozesses, die der
// Anzeige-Prozess für ein Dashboard nicht selbst leisten kann.
//
// **`filterWerte`** liefert die im Bereich vergebenen Werte einer Eigenschaft,
// die Auswahl eines Filters am Kopf (Story 4S-001186). Aufgebaut auf
// `eigenschaftsWerteFuerFeld` (dieselbe Sammel-Regel: Zeichenketten zählen,
// Listen je Element, erste Schreibweise gewinnt, alphabetisch, begrenzt), mit
// zwei Zusätzen, die die Abfrage ebenfalls hat: Was im Vorlagen-Ordner liegt,
// zählt nicht (`createTemplateExclusion` mit derselben Regel wie die Abfrage
// ohne ausdrückliche Quelle), und der ungespeicherte Stand einer geöffneten
// Datei gilt (Puffer-Overlay-Schicht). Ohne beide Zusätze ist das Ergebnis das
// der Bestands-Sicht, und sie wird unverändert gerufen.
//
// **`abfrageDatei`** löst das Ziel einer Kachel mit `abfrage="…"` auf (Story
// 4S-001183): dieselben Formen wie `doc=` einer Canvas-Karte, also Dokumentname
// oder Pfad relativ zum eigenen Dokument, über dieselben drei Stufen wie die
// Einbettung (dokument-relativ, Unterseiten-Schreibweise, Namens-Suche im
// Index) und mit derselben Grenze. Danach prüft es die Marke `db-query` und
// sucht genau einen Abfrage-Block der obersten Ebene, mit derselben Zaun-Regel
// wie der Katalog der Abfrage-Dateien (`fence-level.js`).
//
// **Die Marke wird unabhängig vom Datenbank-Schalter erkannt** (Befund 4 der
// Konzept-Stufe 4T-002506): Eine Abfrage-Datei bleibt nach Story 4S-001040
// auch bei ausgeschalteter Datenbank ein Dokument mit ausgewertetem
// Abfrage-Block. Deshalb liest dieser Dienst die Marke aus dem Text der Datei
// und nicht aus dem Datensatz-Bestand des Index, der bei ausgeschalteter
// Datenbank ruht.
//
// Kein eigener Zustand und kein Zwischenspeicher: Beide Fragen kommen selten
// (Öffnen, Index-Nachzug), und ein Speicher brächte die Invalidierungs-Frage
// beider Schichten mit.
'use strict';

const { indexes } = require('./store.js');
const { entryWithOverlay, overlaysUnder, bufferTextFor } = require('./overlay.js');
const { createTemplateExclusion } = require('./query-templates.js');
const { eigenschaftsWerteFuerFeld, MAX_WERTE } = require('./eigenschafts-werte.js');
const { resolveWikiTargetInIndex } = require('./resolve.js');
const { liesEmbedInhalt } = require('../documents/embed-content.js');
const { loeseZielDreistufig, mitMarkdownEndung } = require('./ziel-aufloesung.js');
const subpages = require('../../shared/subpages.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { DB_QUERY_KEY } = require('../../shared/database/behaelter.js');
const { zaunOeffnung, schliesstZaun } = require('../../shared/markdown/fence-level.js');

// Sprache des Abfrage-Blocks; dieselbe Zeichenfolge wie im Katalog der
// Abfrage-Dateien (`table-catalog.js`) und in der Render-Pipeline.
const ABFRAGE_SPRACHE = 'perspective-query';

// Die Ergebnis-Codes der Abfrage-Datei (Lösungsansatz des Tasks). Der fünfte
// kam mit der Review-Runde 1 von 3E-000402 (Befund A2): Eine gefundene, aber zu
// große oder gesperrte Datei ist nicht «nicht zu finden».
const ABFRAGE_DATEI_FEHLT = 'abfrageDateiFehlt';
const ABFRAGE_DATEI_NICHT_LESBAR = 'abfrageDateiNichtLesbar';
const KEINE_ABFRAGE_DATEI = 'keineAbfrageDatei';
const ABFRAGE_DATEI_OHNE_BLOCK = 'abfrageDateiOhneBlock';
const ABFRAGE_DATEI_MEHRERE_BLOECKE = 'abfrageDateiMehrereBloecke';

// --- filterWerte ------------------------------------------------------------------

// Sammel-Regel wie `sammleAusWert` in `eigenschafts-werte.js` (dort nicht
// ausgeführt): Zeichenketten zählen getrimmt, Listen je Element, alles Übrige
// bleibt draußen.
function sammleAusWert(wert, hinein) {
  const liste = Array.isArray(wert) ? wert : [wert];
  for (const einzeln of liste) {
    if (typeof einzeln !== 'string') continue;
    const sauber = einzeln.trim();
    if (sauber) hinein(sauber);
  }
}

/**
 * Die im Bereich vergebenen Werte einer Kopf-Eigenschaft.
 *
 * Eine im Suchraum nicht vorhandene Eigenschaft ergibt eine leere Menge ohne
 * Fehler (Story 4S-001186, AK7); der Anzeige-Prozess bietet dann nur «alle».
 *
 * @param {string} filePath Pfad des Dokuments mit dem Dashboard (bestimmt die Wurzel).
 * @param {string} eigenschaft Name der Eigenschaft; Groß- und Kleinschreibung egal.
 * @param {string|null} areaRoot Bereichs-Wurzel, falls bekannt.
 * @param {string|null} [templatesFolder] Wirksamer Vorlagen-Ordner (absolut) oder nichts.
 * @returns {{status: string, values: string[], wurzel?: string}}
 */
function filterWerte(filePath, eigenschaft, areaRoot, templatesFolder = null) {
  const basis = eigenschaftsWerteFuerFeld(filePath, eigenschaft, areaRoot);
  if (basis.status !== 'ready') return basis;
  const root = basis.wurzel;
  const ueberlagert = overlaysUnder(root);
  const vorlagen = createTemplateExclusion({ root, templatesFolder, source: null });
  if (!ueberlagert && !vorlagen) return basis;

  const name = String(eigenschaft).trim().toLowerCase();
  const sicht = entryWithOverlay(indexes.get(root), ueberlagert);
  const gesehen = new Map();
  for (const [absPath, props] of sicht.propertiesPerFile) {
    if (!props || props[name] === undefined) continue;
    if (vorlagen && vorlagen.excludes(absPath)) continue;
    sammleAusWert(props[name], (v) => {
      const schluessel = v.toLowerCase();
      if (!gesehen.has(schluessel)) gesehen.set(schluessel, v);
    });
  }
  const werte = [...gesehen.values()].sort((a, b) => a.localeCompare(b));
  return { status: 'ready', wurzel: root, values: werte.slice(0, MAX_WERTE) };
}

// --- abfrageDatei -----------------------------------------------------------------

// Die drei Stufen der Einbettung mit derselben Grenze, aus dem gemeinsamen
// Modul `ziel-aufloesung.js` (4T-002517, Übergabe aus 4T-002510). Liefert
// `{abs}` für ein gefundenes oder im Puffer liegendes Ziel, `{abs: null}`
// sonst; ein Ziel außerhalb der Grenze ist nicht gefunden und wird nie gelesen.
// Die drei Angaben halten das Verhalten der bisherigen Kopie fest: Ein
// Puffer-Stand zählt in Stufe 1, ein relatives Unterseiten-Ziel ist stets ein
// Markdown-Dokument, und ein Treffer der Namens-Suche gilt nur mit
// Markdown-Endung. Den Bedarf am Index meldet schon der Kanal an.
async function loeseZiel(basePath, zielRoh, areaRoot) {
  const erg = await loeseZielDreistufig({
    basePath,
    ziel: subpages.isRelativeTarget(zielRoh) ? zielRoh : mitMarkdownEndung(zielRoh),
    areaRoot,
    kind: 'md',
    subpages,
    resolveWikiTargetInIndex,
    pufferText: bufferTextFor,
    relativStetsMarkdown: true,
    trefferNurMarkdown: true,
  });
  if (erg.ok) return { abs: erg.abs };
  return typeof erg.indexBereit === 'boolean'
    ? { abs: null, indexBereit: erg.indexBereit }
    : { abs: null };
}

/**
 * Die Abfrage-Blöcke der obersten Ebene eines Textes, je mit ihrem Inhalt.
 *
 * @param {string} text Körper eines Dokuments (ohne Frontmatter).
 * @returns {string[]} Inhalt je Block, Zeilenenden als `\n`.
 */
function abfrageBloecke(text) {
  const bloecke = [];
  let offen = null;
  let zeilen = null;
  for (const zeile of String(text == null ? '' : text).split('\n')) {
    if (offen) {
      if (schliesstZaun(zeile, offen)) {
        if (zeilen) bloecke.push(zeilen.join('\n'));
        offen = null;
        zeilen = null;
      } else if (zeilen) {
        zeilen.push(zeile.replace(/\r$/, ''));
      }
      continue;
    }
    offen = zaunOeffnung(zeile);
    zeilen = offen && offen.sprache === ABFRAGE_SPRACHE ? [] : null;
  }
  // Ein nicht geschlossener Block läuft bis zum Ende, wie in der Pipeline.
  if (zeilen) bloecke.push(zeilen.join('\n'));
  return bloecke;
}

/**
 * Prüft den Text einer Abfrage-Datei: Marke `db-query` und genau ein Block.
 *
 * @param {string} roh Ganzer Text der Datei.
 * @param {string} name Das genannte Ziel, für die Meldung.
 * @returns {{ok: true, abfrage: string}|{ok: false, code: string, name: string}}
 */
function pruefeAbfrageText(roh, name) {
  const text = roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh;
  const fm = extractFrontmatter(text);
  const data = fm && fm.data && typeof fm.data === 'object' ? fm.data : null;
  if (!data || data[DB_QUERY_KEY] === undefined)
    return { ok: false, code: KEINE_ABFRAGE_DATEI, name };
  const bloecke = abfrageBloecke(fm.body);
  if (bloecke.length === 0) return { ok: false, code: ABFRAGE_DATEI_OHNE_BLOCK, name };
  if (bloecke.length > 1) return { ok: false, code: ABFRAGE_DATEI_MEHRERE_BLOECKE, name };
  return { ok: true, abfrage: bloecke[0] };
}

/**
 * Löst das Ziel einer Kachel auf und liefert den einen Abfrage-Block.
 *
 * @param {object} p Parameter.
 * @param {string} p.basePath Pfad des Dokuments mit dem Dashboard.
 * @param {string} p.ziel Die Angabe `abfrage=` der Kachel.
 * @param {string|null} p.areaRoot Bereichs-Wurzel des Fensters.
 * @param {number} [p.maxBytes] Größen-Grenze des Lesens.
 * @returns {Promise<{ok: true, pfad: string, abfrage: string, quelle: 'puffer'|'platte'}
 *   |{ok: false, code: string, name: string, indexBereit?: boolean}>}
 *   Gefunden, aber nicht lesbar (zu groß oder gesperrt), ist
 *   `abfrageDateiNichtLesbar`, nicht `abfrageDateiFehlt`.
 */
async function abfrageDatei({ basePath, ziel, areaRoot, maxBytes }) {
  const name = String(ziel).trim();
  const fehlt = { ok: false, code: ABFRAGE_DATEI_FEHLT, name };
  if (!name) return fehlt;
  const gefunden = await loeseZiel(basePath, name, areaRoot);
  if (!gefunden.abs) {
    if (typeof gefunden.indexBereit === 'boolean') fehlt.indexBereit = gefunden.indexBereit;
    return fehlt;
  }
  const nichtLesbar = { ok: false, code: ABFRAGE_DATEI_NICHT_LESBAR, name };
  let gelesen;
  try {
    gelesen = await liesEmbedInhalt(gefunden.abs, bufferTextFor(gefunden.abs), maxBytes);
  } catch (err) {
    // Zwischen Auflösung und Lesen gelöschte Datei: sie fehlt, sie ist nicht
    // «nicht lesbar» (Zweitblick Runde 2, 2026-11-03).
    if (err && err.code === 'ENOENT') return fehlt;
    return nichtLesbar;
  }
  if (!gelesen || !gelesen.ok || typeof gelesen.content !== 'string') return nichtLesbar;
  const geprueft = pruefeAbfrageText(gelesen.content, name);
  if (!geprueft.ok) return geprueft;
  return {
    ok: true,
    pfad: gefunden.abs,
    abfrage: geprueft.abfrage,
    quelle: gelesen.ausPuffer ? 'puffer' : 'platte',
  };
}

module.exports = {
  ABFRAGE_DATEI_FEHLT,
  ABFRAGE_DATEI_NICHT_LESBAR,
  KEINE_ABFRAGE_DATEI,
  ABFRAGE_DATEI_OHNE_BLOCK,
  ABFRAGE_DATEI_MEHRERE_BLOECKE,
  filterWerte,
  abfrageBloecke,
  pruefeAbfrageText,
  abfrageDatei,
};
