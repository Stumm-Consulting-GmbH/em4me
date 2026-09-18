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
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { parseSteckbrief } = require('../../shared/database/database-steckbrief.js');
const { baueHinweis } = require('../../shared/database/table-hinweise.js');
const { leseFrontmatterKopf } = require('./frontmatter-kopf.js');

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
  for (const [absPath, marken] of sicht.dbKindsPerFile || new Map()) {
    if (!Array.isArray(marken)) continue;
    if (marken.includes('table')) tabellen.push(absPath);
    if (marken.includes('database')) steckbriefe.push(absPath);
  }
  // Stabile Reihenfolge, damit zwei Aufrufe dieselbe Liste liefern und der
  // «erste gewinnt»-Fall unten nicht von der Laufzeit abhängt.
  tabellen.sort();
  steckbriefe.sort();
  return { tabellen, steckbriefe };
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

/**
 * Überblick über eine Datenbank: Steckbrief, Tabellen-Namen, Fehlerlagen.
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel (mit Puffer-Overlay).
 * @param {string} p.status Status des Index, unverändert durchgereicht.
 * @param {object} p.fsp Dateizugriff (stat, readFile, optional open).
 * @param {Map} p.cache Zwischenspeicher aus createDatabaseCatalogCache.
 * @param {Function} [p.bufferTextFor] Puffer-Auskunft des geschriebenen Stands.
 * @returns {Promise<object>} { status, istDatenbankBereich, steckbrief, tabellen, hints }
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

  // 4T-001758: Die Bereichs-Art reist mit dem Überblick, statt einen eigenen
  // Kanal zu bekommen — sie ist aus demselben Bestand abgeleitet, und wer sie
  // braucht, braucht in aller Regel auch die Auskunft daneben. Abgeleitet wird
  // sie über dieselbe Funktion, die jeder andere Verbraucher fragt.
  return { status, istDatenbankBereich: istDatenbankBereich(sicht), steckbrief, tabellen, hints };
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
  createDatabaseCatalogCache,
  istDatenbankBereich,
  katalogUeberblick,
  tabellenDefinition,
  tabellenName,
};
