// 4T-001510 (Epic 3E-000250, Baustein T1): Der Katalog — die eine Stelle, an
// der die Anwendung nachschlägt, welche Tabellen es gibt und wie sie definiert
// sind.
//
// Ohne ihn läse jeder Teil der Datenbank das Frontmatter selbst, und jede
// Auslegungs-Frage bekäme mehrfach eine eigene Antwort. Genau dieses Muster hat
// bei den Ereignissen zu einem Sonderweg geführt, den dieses Vorhaben vermeidet.
//
// --- Der Zuschnitt der Schnittstelle ------------------------------------------------
//
// **Entscheidung des Product Owners vom 2026-09-06**, auf Vorlage: **zwei**
// Auskünfte statt einer oder dreier.
//
//   `katalogUeberblick`  Steckbrief der Datenbank, die Namen ihrer Tabellen und
//                        die Fehlerlagen — alles, was eine Liste zeigt.
//   `tabellenDefinition` die vollständige Definition EINER Tabelle — alles, was
//                        eine Prüfung, eine Abfrage oder eine Maske braucht.
//
// Verworfen ist die **eine** Auskunft über alles: Sie wächst mit jeder Tabelle
// und zöge den ganzen Bestand über die Prozess-Grenze, auch wenn nur ein Name
// gebraucht wird. Verworfen sind ebenso **drei** getrennte Auskünfte (Liste,
// Definition, Steckbrief): Der häufigste Fall, der Überblick, kostete dann zwei
// Aufrufe, und der Steckbrief hätte keinen natürlichen Platz.
//
// **Die Fehlerlagen gehören in den Überblick**, nicht in einen eigenen Kanal:
// Eine Tabelle mit kaputter Definition erscheint dort MIT ihrem Befund, statt
// einfach zu fehlen. Das ist die Linie aus E22 — melden, nie stillschweigend
// auslassen — und sie wäre verfehlt, wenn der Befund erst sichtbar würde,
// nachdem jemand die Tabelle einzeln abgefragt hat.
//
// --- Woher der Bestand kommt --------------------------------------------------------
//
// **Aus dem vorhandenen Datei-Verzeichnis** (Entscheidung des Product Owners vom
// 2026-09-06, auf Vorlage). Der Index merkt sich seit 4T-001510 je Datei, DASS
// sie sich als Tabelle oder als Steckbrief erklärt; der Katalog fragt ihn danach
// und liest nur die so gefundenen Dateien. Die Architektur schließt für die
// gesamte Perspective-Familie eine zweite Scan-Infrastruktur aus, und ein
// eigener Durchlauf über alle Dateien des Bereichs wäre genau das.
//
// Der Index liefert damit die **Menge**, die Datei die **Wahrheit** — die
// Rangfolge aus E26.4, nach der die Angabe in der Datei gilt und der Katalog der
// Beschleuniger ist.
//
// --- Aktualität ohne Neustart -------------------------------------------------------
//
// Auf zwei Wegen, beide aus dem Bestand übernommen: Eine **neue oder entfernte**
// Tabelle sieht der Index über seinen Watcher; eine **geänderte** Definition
// erkennt der Zwischenspeicher hier über Änderungszeit und Größe bei jedem
// Zugriff, nach dem Vorbild des Profil-Katalogs. Der stat-Abgleich ist die
// strengere Form, weil er auch Änderungen von außen sieht.
//
// **Der geschriebene Stand geht vor der Platte** (E25): Eine offene, ungespeichert
// geänderte Tabelle wird aus ihrem Puffer gelesen und nicht zwischengespeichert,
// weil der Puffer sich mit jedem Tastendruck ändert.
//
// --- Härte -------------------------------------------------------------------------
//
// Nach E22 in seiner weichen Ausprägung, weil hier gelesen und nicht geschrieben
// wird: Eine Tabelle mit fehlerhafter Definition bleibt eine lesbare
// Markdown-Datei, sie ist nur keine benutzbare Tabelle. Kein Abbruch, keine
// stille Teil-Auslegung, kein Anfassen des Dokuments.
//
// Electron-frei; Dateizugriff und Index-Sicht werden injiziert, damit der
// Katalog ohne laufende Anwendung prüfbar ist.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const {
  parseTableDefinition,
  parseFormDefinition,
} = require('../../shared/database/table-definition.js');
const { parseSteckbrief } = require('../../shared/database/database-steckbrief.js');
const { baueHinweis } = require('../../shared/database/table-hinweise.js');
const { leseFrontmatterKopf } = require('./frontmatter-kopf.js');
// 4T-002081: Text und Zaun-Regel für das Zählen der Abfrage-Blöcke.
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { zaunOeffnung, schliesstZaun } = require('../../shared/markdown/fence-level.js');

// Eigener Zwischenspeicher pro Aufrufer (main.js hält einen prozessweiten, Tests
// je einen frischen). Map pathCompareKey(absPath) -> { mtimeMs, size, gelesen }.
function createDatabaseCatalogCache() {
  return new Map();
}

// Der Name einer Tabelle ist ihr Dateiname ohne Endung — dieselbe Größe, die ein
// Wiki-Link und später `FROM` nennen. Ein eigener Name im Behälter ist bewusst
// nicht vorgesehen: Er wäre eine zweite Identität neben der Datei und liefe beim
// Umbenennen auseinander, während E3 das Umbenennen gerade folgenlos hält.
function tabellenName(absPath) {
  return path.basename(absPath).replace(/\.md$/i, '');
}

// Eine Datei lesen und auslegen, mit Zwischenspeicher gegen Änderungszeit und
// Größe. Liefert { data, parseError } — die Auslegung selbst macht der Aufrufer,
// weil Tabelle und Steckbrief verschiedene Parser haben.
async function leseDatei({ absPath, fsp, cache, bufferTextFor }) {
  const schluessel = pathCompareKey(absPath);
  const gepuffert = typeof bufferTextFor === 'function' ? bufferTextFor(absPath) : null;
  // Ein Puffer-Stand wird nie zwischengespeichert: Er ändert sich mit jedem
  // Tastendruck, und ein Eintrag dazu wäre schon beim Ablegen veraltet.
  if (typeof gepuffert === 'string') {
    cache.delete(schluessel);
    return leseFrontmatterKopf({ absPath, fsp, bufferTextFor });
  }

  let stat;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    cache.delete(schluessel);
    return { data: null, parseError: null, quelle: null };
  }
  const eintrag = cache.get(schluessel);
  if (eintrag && eintrag.mtimeMs === stat.mtimeMs && eintrag.size === stat.size)
    return eintrag.gelesen;

  const gelesen = await leseFrontmatterKopf({ absPath, fsp, bufferTextFor: null });
  cache.set(schluessel, { mtimeMs: stat.mtimeMs, size: stat.size, gelesen });
  return gelesen;
}

// Die Dateien einer Wurzel, die eine Datenbank-Marke tragen, nach Art getrennt.
// Der Index führt die Marken; diese Funktion sortiert sie nur.
function markierteDateien(sicht) {
  const tabellen = [];
  const steckbriefe = [];
  // 4T-001943 (Bauplan B2): die dritte Marke, die Masken-Dateien.
  const masken = [];
  // 4T-002081 (Epic 3E-000259): die vierte Marke, die Abfrage-Dateien.
  const abfragen = [];
  for (const [absPath, marken] of sicht.dbKindsPerFile || new Map()) {
    if (!Array.isArray(marken)) continue;
    if (marken.includes('table')) tabellen.push(absPath);
    if (marken.includes('database')) steckbriefe.push(absPath);
    if (marken.includes('form')) masken.push(absPath);
    if (marken.includes('query')) abfragen.push(absPath);
  }
  // Stabile Reihenfolge, damit zwei Aufrufe dieselbe Liste liefern und der
  // «erste gewinnt»-Fall unten nicht von der Laufzeit abhängt.
  tabellen.sort();
  steckbriefe.sort();
  masken.sort();
  abfragen.sort();
  return { tabellen, steckbriefe, masken, abfragen };
}

// 4T-001758 (Epic 3E-000253, E-A): Ist die Wurzel dieser Sicht ein
// Datenbank-Bereich?
//
// **Die eine Stelle, an der die Frage beantwortet wird.** Entscheidung des
// Product Owners vom 2026-09-15 (Weg A der Vorlage vom 2026-09-14): Ein Bereich
// gilt als Datenbank-Bereich, sobald sein Bestand ein Dokument mit
// Datenbank-Steckbrief führt. Es gibt dafür weder eine Bereichs-Einstellung noch
// ein neues Datenformat; die Aussage «hier ist eine Datenbank» steht damit genau
// einmal, nämlich im Frontmatter des Dokuments, das den Steckbrief trägt.
//
// Ohne bereite Sicht (kein gebundener Bereich, Index noch im Aufbau, Wurzel
// übergroß) ist die Antwort `false` und **nie** ein Wurf: Der Aufrufer bekommt
// den Status daneben und kann «noch nicht bekannt» von «keine Datenbank»
// unterscheiden, ohne dass die Frage selbst scheitern könnte (AK3).
//
// Ein DEFEKTER Steckbrief zählt mit, denn `istSteckbriefDokument` weist die
// Datei an der bloßen Anwesenheit des Behälters aus. Das ist gewollt: Ein
// Bereich, dessen einzige Datenbank-Beschreibung einen Fehler hat, ist eine
// Datenbank mit einem Fehler und kein gewöhnlicher Bereich — sonst verschwänden
// gerade die Fehlerlagen, die der Anwender sehen muss, zusammen mit der Anzeige.
function istDatenbankBereich(sicht) {
  if (!sicht) return false;
  return markierteDateien(sicht).steckbriefe.length > 0;
}

// YAML-Hinweis in der Gestalt der übrigen Diagnose (Muster des Profil-Katalogs).
function yamlHinweis(gelesen) {
  return gelesen.parseError ? [baueHinweis('yaml', -1, null)] : [];
}

// --- Masken-Dateien (4T-001943, Bauplan B2) ------------------------------------------
//
// **Die Maske nennt ihre Tabelle, nicht umgekehrt** (Entscheidung des Product
// Owners vom 2026-09-25): Der Behälter `db-form` trägt den Namen der Tabelle.
// Zugeordnet wird über denselben Doppel-Vergleich wie `findeKopfDatei` in den
// Regel-Hilfen und `tabellenDefinition` unten, Pfad oder Name ohne Endung, in der
// sortierten Reihenfolge der Tabellen-Pfade; bei zwei Tabellen desselben Namens
// gewinnt damit dieselbe wie dort. Der Vergleich steht hier noch einmal und
// wird nicht aus den Regel-Hilfen geholt, weil jene diesen Katalog laden und
// ein Import in die Gegenrichtung einen Kreis schlösse.
//
// **Es gilt die erste Masken-Datei nach Pfad**, dieselbe Sortierung wie bei den
// Tabellen. Jede weitere derselben Tabelle bleibt ein gewöhnliches Dokument und
// trägt den Hinweis `formMehrereDateien`, damit der Anwender sieht, warum seine
// Änderung dort nicht wirkt; eine Maske zu einer Tabelle, die es nicht gibt,
// trägt `formTabelleUnbekannt`. Gemeldet wird, nie stillschweigend ausgelassen
// (E22 in der weichen Ausprägung, wie bei den Tabellen).

function kopfZuAngabe(tabellenPfade, angabe) {
  const klein = angabe.toLowerCase();
  return (
    tabellenPfade.find(
      (p) =>
        pathCompareKey(p) === pathCompareKey(angabe) || tabellenName(p).toLowerCase() === klein,
    ) || null
  );
}

/**
 * Die Masken-Dateien der Sicht, ihrer Tabelle zugeordnet.
 *
 * @param {object} p Parameter wie `katalogUeberblick`, ohne `status`.
 * @returns {Promise<{masken: Array<{path: string, table: string|null, hints: Array<object>}>,
 *   geltend: Map<string, string>}>} `geltend` führt je `pathCompareKey` einer
 *   Kopf-Datei den Pfad ihrer geltenden Masken-Datei.
 */
async function maskenZuordnung({ sicht, fsp, cache, bufferTextFor = null }) {
  const { tabellen, masken: pfade } = markierteDateien(sicht);
  const masken = [];
  const geltend = new Map();
  for (const absPath of pfade) {
    const gelesen = await leseDatei({ absPath, fsp, cache, bufferTextFor });
    const form = parseFormDefinition(gelesen.data);
    const hints = [...yamlHinweis(gelesen), ...form.hints];
    const eintrag = { path: absPath, table: form.table, hints };
    masken.push(eintrag);
    if (!form.istMaske) continue;
    const kopf = kopfZuAngabe(tabellen, form.table);
    if (kopf === null) {
      hints.push(baueHinweis('formTabelleUnbekannt', -1, form.table));
      continue;
    }
    const schluessel = pathCompareKey(kopf);
    if (geltend.has(schluessel)) {
      hints.push(baueHinweis('formMehrereDateien', -1, tabellenName(kopf)));
      continue;
    }
    geltend.set(schluessel, absPath);
  }
  return { masken, geltend };
}

/**
 * Die geltende Masken-Datei einer Tabelle, oder null.
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel.
 * @param {object} p.fsp Dateizugriff (stat, readFile, optional open).
 * @param {Map} [p.cache] Zwischenspeicher aus createDatabaseCatalogCache.
 * @param {string} p.tabellenPfad Absoluter Pfad der Kopf-Datei.
 * @returns {Promise<string|null>} Absoluter Pfad der Masken-Datei.
 */
async function geltendeMaske({ sicht, fsp, cache = createDatabaseCatalogCache(), tabellenPfad }) {
  if (!sicht || typeof tabellenPfad !== 'string' || tabellenPfad === '') return null;
  const { geltend } = await maskenZuordnung({ sicht, fsp, cache });
  return geltend.get(pathCompareKey(tabellenPfad)) || null;
}

// --- Abfrage-Dateien (4T-002081, Epic 3E-000259) --------------------------------------
//
// **Die Abfrage steht im Text, in genau einem Abfrage-Block** (Entscheidung des
// Product Owners vom 2026-10-03, F2 Option A; Festlegung 13). Der Behälter
// `db-query` trägt nichts, also gibt es im Frontmatter nichts auszulegen; was
// der Katalog über die Datei wissen muss, ist allein die Zahl ihrer Blöcke. Er
// liest dafür die ganze Datei und nicht nur ihren Kopf: Eine Abfrage-Datei ist
// ein Dokument und keine Tabelle mit Datensatz-Körper, und die Blöcke stehen im
// Text.
//
// **Gezählt werden die Code-Blöcke der obersten Ebene mit der Sprache des
// Abfrage-Blocks**, über dieselbe Zaun-Regel, die der portable Export und der
// Datensatz-Block benutzen (`fence-level.js`), und mit derselben Lesart der
// Sprache wie die Render-Pipeline (erstes Wort des Infostrings). Ein Block in
// einem umschließenden Zaun ist zitierter Text und zählt nicht, so wie er auch
// nicht ausgewertet wird.
//
// **Keine oder mehrere Blöcke sind eine Fehlerlage und kein Ausschluss**
// (Festlegung 14): Die Datei bleibt in der Liste und trägt ihren Befund, und
// ihre Blöcke werden in der Ansicht ausgewertet wie in jedem Dokument. Gemeldet
// wird, nie stillschweigend ausgelassen, wie bei den Masken-Dateien.

// Sprache des Abfrage-Blocks; dieselbe Zeichenfolge, an der `markdown.js` den
// Block als Abfrage zeichnet.
const ABFRAGE_SPRACHE = 'perspective-query';

// Die Zahl der Abfrage-Blöcke der obersten Ebene in einem Text.
function zaehleAbfrageBloecke(text) {
  let zahl = 0;
  let offen = null;
  for (const zeile of String(text == null ? '' : text).split('\n')) {
    if (offen) {
      if (schliesstZaun(zeile, offen)) offen = null;
      continue;
    }
    offen = zaunOeffnung(zeile);
    if (offen && offen.sprache === ABFRAGE_SPRACHE) zahl += 1;
  }
  return zahl;
}

// Liest eine Abfrage-Datei ganz und zählt ihre Blöcke. Zwischenspeicher wie
// `leseDatei`, aber unter eigenem Schlüssel, weil eine Datei mit zwei Marken
// sonst den Kopf-Stand der anderen Art überschriebe. Liefert
// { bloecke, parseError } oder null, wenn die Datei nicht lesbar ist.
async function leseAbfrageDatei({ absPath, fsp, cache, bufferTextFor }) {
  const schluessel = `query:${pathCompareKey(absPath)}`;
  const auswerten = (roh) => {
    const text = roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh;
    const fm = extractFrontmatter(text);
    return { bloecke: zaehleAbfrageBloecke(fm.body), parseError: fm.parseError };
  };
  const gepuffert = typeof bufferTextFor === 'function' ? bufferTextFor(absPath) : null;
  if (typeof gepuffert === 'string') {
    cache.delete(schluessel);
    return auswerten(gepuffert);
  }
  let stat;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    cache.delete(schluessel);
    return null;
  }
  const eintrag = cache.get(schluessel);
  if (eintrag && eintrag.mtimeMs === stat.mtimeMs && eintrag.size === stat.size)
    return eintrag.gelesen;
  let roh;
  try {
    roh = await fsp.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
  const gelesen = auswerten(String(roh));
  cache.set(schluessel, { mtimeMs: stat.mtimeMs, size: stat.size, gelesen });
  return gelesen;
}

/**
 * Die Abfrage-Dateien der Sicht mit Name, Pfad, Zahl der Blöcke und Hinweisen.
 * Eine Datei, die der Index kennt und die es nicht mehr gibt, wird übergangen.
 *
 * @param {object} p Parameter wie `katalogUeberblick`, ohne `status`.
 * @returns {Promise<Array<{name: string, path: string, bloecke: number,
 *   hints: Array<object>}>>}
 */
async function abfrageDateien({ sicht, fsp, cache, bufferTextFor = null }) {
  const { abfragen: pfade } = markierteDateien(sicht);
  const abfragen = [];
  for (const absPath of pfade) {
    const gelesen = await leseAbfrageDatei({ absPath, fsp, cache, bufferTextFor });
    if (!gelesen) continue;
    const hints = gelesen.parseError ? [baueHinweis('yaml', -1, null)] : [];
    if (gelesen.bloecke === 0) hints.push(baueHinweis('queryOhneFence', -1, null));
    if (gelesen.bloecke > 1)
      hints.push(baueHinweis('queryMehrereFences', -1, String(gelesen.bloecke)));
    abfragen.push({ name: tabellenName(absPath), path: absPath, bloecke: gelesen.bloecke, hints });
  }
  return abfragen;
}

/**
 * Überblick über eine Datenbank: Steckbrief, Tabellen-Namen, Fehlerlagen.
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel (mit Puffer-Overlay).
 * @param {string} p.status Status des Index, unverändert durchgereicht.
 * @param {object} p.fsp Dateizugriff (stat, readFile, optional open).
 * @param {Map} p.cache Zwischenspeicher aus createDatabaseCatalogCache.
 * @param {Function} [p.bufferTextFor] Puffer-Auskunft des geschriebenen Stands.
 * @returns {Promise<object>} { status, istDatenbankBereich, steckbrief, tabellen, masken,
 *   abfragen, hints }; seit 4T-001943 trägt jede Tabelle `maske` (Pfad der geltenden
 *   Masken-Datei oder null), seit 4T-002081 kommen die Abfrage-Dateien hinzu.
 */
async function katalogUeberblick({ sicht, status, fsp, cache, bufferTextFor = null }) {
  const hints = [];
  const { tabellen: pfade, steckbriefe } = markierteDateien(sicht);

  const tabellen = [];
  const gesehen = new Map();
  for (const absPath of pfade) {
    const gelesen = await leseDatei({ absPath, fsp, cache, bufferTextFor });
    const definition = parseTableDefinition(gelesen.data);
    const name = tabellenName(absPath);
    const eigene = [...yamlHinweis(gelesen), ...definition.hints];
    // Zwei Tabellen desselben Namens: Beide bleiben sichtbar, beide tragen den
    // Befund. Wer sie still zu einer machte, ließe eine Tabelle samt ihren
    // Datensätzen verschwinden.
    if (gesehen.has(name.toLowerCase())) {
      eigene.push(baueHinweis('duplicateTable', -1, name));
      const erste = gesehen.get(name.toLowerCase());
      if (!erste.hints.some((h) => h.code === 'duplicateTable'))
        erste.hints.push(baueHinweis('duplicateTable', -1, name));
    }
    const eintrag = { name, path: absPath, felder: definition.fields.length, hints: eigene };
    gesehen.set(name.toLowerCase(), eintrag);
    tabellen.push(eintrag);
  }

  // Der Steckbrief ist eine Aussage über die Datenbank als Ganzes und steht
  // deshalb genau einmal (I1). Ein zweiter wird gemeldet und nicht benutzt; die
  // Reihenfolge ist die der Pfade und damit stabil.
  let steckbrief = null;
  if (steckbriefe.length > 0) {
    const gelesen = await leseDatei({ absPath: steckbriefe[0], fsp, cache, bufferTextFor });
    const gelesenerSteckbrief = parseSteckbrief(gelesen.data);
    steckbrief = { path: steckbriefe[0], ...gelesenerSteckbrief };
    hints.push(...yamlHinweis(gelesen), ...gelesenerSteckbrief.hints);
    for (const weiterer of steckbriefe.slice(1))
      hints.push(baueHinweis('duplicateDatabase', -1, tabellenName(weiterer)));
  }

  // 4T-001943 (Bauplan B2): Die Masken-Dateien mit ihren Hinweisen, und je
  // Tabelle der Pfad ihrer geltenden Maske, damit die Übersicht ihn zeigen kann.
  const { masken, geltend } = await maskenZuordnung({ sicht, fsp, cache, bufferTextFor });
  for (const eintrag of tabellen) eintrag.maske = geltend.get(pathCompareKey(eintrag.path)) || null;

  // 4T-002081: die Abfrage-Dateien mit ihren Hinweisen für den Abschnitt «Abfragen».
  const abfragen = await abfrageDateien({ sicht, fsp, cache, bufferTextFor });

  // 4T-001758: Die Bereichs-Art reist mit dem Überblick, statt einen eigenen
  // Kanal zu bekommen — sie ist aus demselben Bestand abgeleitet, und wer sie
  // braucht, braucht in aller Regel auch die Auskunft daneben. Abgeleitet wird
  // sie über dieselbe Funktion, die jeder andere Verbraucher fragt.
  return {
    status,
    istDatenbankBereich: istDatenbankBereich(sicht),
    steckbrief,
    tabellen,
    masken,
    abfragen,
    hints,
  };
}

/**
 * Die vollständige Definition einer Tabelle.
 *
 * Die Tabelle wird über ihren Namen benannt, wie ein Wiki-Link sie nennt; ein
 * absoluter Pfad wird ebenso angenommen, weil ein Aufrufer, der den Überblick
 * gelesen hat, ihn bereits hat und der Umweg über den Namen dann eine
 * Namens-Auflösung zu viel wäre.
 *
 * @returns {Promise<object>} { status, gefunden, name, path, fields, hints } —
 *   plus lastId, key und display, sofern die Datei sie trägt.
 */
async function tabellenDefinition({ sicht, status, tabelle, fsp, cache, bufferTextFor = null }) {
  const gesucht = String(tabelle || '').trim();
  if (gesucht === '') return { status, gefunden: false, hints: [] };
  const { tabellen } = markierteDateien(sicht);
  const gesuchtKlein = gesucht.toLowerCase();
  const absPath = tabellen.find(
    (p) =>
      pathCompareKey(p) === pathCompareKey(gesucht) ||
      tabellenName(p).toLowerCase() === gesuchtKlein,
  );
  // Eine unbekannte Tabelle ist keine Fehlerlage der Datenbank, sondern eine
  // Frage ohne Gegenstand: leere Antwort mit `gefunden: false`, nie ein Wurf und
  // nie eine erfundene leere Definition, die eine Prüfung bestehen ließe, was
  // sie nicht bestehen darf.
  if (!absPath) return { status, gefunden: false, hints: [] };

  const gelesen = await leseDatei({ absPath, fsp, cache, bufferTextFor });
  const definition = parseTableDefinition(gelesen.data);
  return {
    status,
    gefunden: true,
    name: tabellenName(absPath),
    path: absPath,
    ...definition,
    hints: [...yamlHinweis(gelesen), ...definition.hints],
  };
}

module.exports = {
  // 4T-002081: die Abfrage-Dateien einer Sicht und das Zählen ihrer Blöcke.
  abfrageDateien,
  zaehleAbfrageBloecke,
  createDatabaseCatalogCache,
  geltendeMaske,
  istDatenbankBereich,
  katalogUeberblick,
  // 4T-001945 (Bauplan B1): die Masken-Dateien einer Sicht für den Verwendungsnachweis.
  markierteDateien,
  tabellenDefinition,
  tabellenName,
};
