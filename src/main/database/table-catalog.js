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
// 4T-002248 (Epic 3E-000262, F1 A): die Angaben der Listen-Maske im Behälter
// der Abfrage-Datei.
const { parseListAngaben } = require('../../shared/database/list-angaben.js');
// 4T-002307 (Epic 3E-000263): die Rollen des Steckbriefs gegen die Tabellen;
// seit 4T-002308 samt Zuordnung geprüft und zur eigenen Rolle aufgelöst.
const {
  pruefeSteckbriefRollen,
  rollenBefundAngaben,
} = require('../../shared/database/rollen-angaben.js');
const { loeseRechte } = require('../../shared/database/rechte.js');
const { ermittleHerkunft } = require('../herkunft.js');
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

// --- Masken-Dateien (4T-001943, Bauplan B2; 4T-002184) ---------------------------------
//
// **Die Maske nennt ihre Tabelle, nicht umgekehrt** (Entscheidung des Product
// Owners vom 2026-09-25): Der Behälter `db-form` trägt den Namen der Tabelle.
// Zugeordnet wird über denselben Doppel-Vergleich wie `findeKopfDatei` in den
// Regel-Hilfen und `tabellenDefinition` unten, Pfad oder Name ohne Endung, in der
// sortierten Reihenfolge der Tabellen-Pfade; bei zwei Tabellen desselben Namens
// gewinnt damit dieselbe wie dort. Der Vergleich steht hier noch einmal und
// wird nicht aus den Regel-Hilfen geholt, weil jene diesen Katalog laden und
// ein Import in die Gegenrichtung einen Kreis schlösse. Eine Maske zu einer
// Tabelle, die es nicht gibt, trägt `formTabelleUnbekannt`; gemeldet wird, nie
// stillschweigend ausgelassen (E22 in der weichen Ausprägung).
//
// **Mehrere Masken je Tabelle, eine davon die Standard-Maske** (4T-002184,
// Entscheidungen F1 A und F2 A des Product Owners vom 2026-10-09). Jede
// Masken-Datei einer Tabelle ist eine gültige Maske; die Tabellen-Definition
// nennt mit `form` die, die jedes Öffnen eines Datensatzes zeigt. **Ohne
// Angabe gilt wie bis dahin die erste nach Pfad**, ohne Masken-Datei die
// erzeugte Maske. Damit wirkt jede seit der Stufe 2 gestaltete einzelne
// Masken-Datei unverändert weiter, und der frühere Hinweis «mehrere
// Masken-Dateien» entfällt. Eine Angabe, die keine Masken-Datei dieser Tabelle
// trifft, ist ein Befund der Definition (`formDateiUnbekannt`, oder
// `formDateiFremd`, wenn sie die Masken-Datei einer anderen Tabelle nennt), und
// es gilt die Regel «ohne Angabe».

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
 * Trifft eine Masken-Datei den Namen, den die Angabe `form` oder eine Anfrage
 * nennt? Verglichen wird wie bei einem Wiki-Link-Ziel: der Datei-Name ohne
 * Endung, auch mit Ordnern davor, ohne Rücksicht auf die Schreibung; ein
 * absoluter Pfad trifft sich selbst. Eine Endung `.md` und Rückstriche im Namen
 * werden vor dem Vergleich abgelegt.
 *
 * @param {string} pfad Absoluter Pfad der Masken-Datei.
 * @param {string} angabe Der genannte Name.
 * @returns {boolean}
 */
function trifftMaskenAngabe(pfad, angabe) {
  if (typeof pfad !== 'string' || typeof angabe !== 'string') return false;
  const name = angabe
    .split('\\')
    .join('/')
    .trim()
    .replace(/\.md$/i, '')
    .replace(/^\/+/, '')
    .toLowerCase();
  if (name === '') return false;
  const voll = `/${pfad.split('\\').join('/').toLowerCase()}`;
  return voll.endsWith(`/${name}.md`);
}

/**
 * Die Masken-Dateien der Sicht, ihrer Tabelle zugeordnet.
 *
 * @param {object} p Parameter wie `katalogUeberblick`, ohne `status`.
 * @returns {Promise<{masken: Array<{path: string, table: string|null, hints: Array<object>}>,
 *   jeKopf: Map<string, string[]>, zugeordnet: Array<{path: string, table: string}>}>}
 *   `jeKopf` führt je `pathCompareKey` einer Kopf-Datei die Pfade ihrer
 *   Masken-Dateien nach Pfad sortiert; `zugeordnet` alle Dateien, die eine
 *   Maske sind, mit der Tabelle, die sie nennen (für den Befund «fremd»).
 */
async function maskenZuordnung({ sicht, fsp, cache, bufferTextFor = null }) {
  const { tabellen, masken: pfade } = markierteDateien(sicht);
  const masken = [];
  const jeKopf = new Map();
  const zugeordnet = [];
  for (const absPath of pfade) {
    const gelesen = await leseDatei({ absPath, fsp, cache, bufferTextFor });
    const form = parseFormDefinition(gelesen.data);
    const hints = [...yamlHinweis(gelesen), ...form.hints];
    masken.push({ path: absPath, table: form.table, hints });
    if (!form.istMaske) continue;
    zugeordnet.push({ path: absPath, table: form.table });
    const kopf = kopfZuAngabe(tabellen, form.table);
    if (kopf === null) {
      hints.push(baueHinweis('formTabelleUnbekannt', -1, form.table));
      continue;
    }
    const schluessel = pathCompareKey(kopf);
    if (!jeKopf.has(schluessel)) jeKopf.set(schluessel, []);
    jeKopf.get(schluessel).push(absPath);
  }
  return { masken, jeKopf, zugeordnet };
}

/**
 * Die Standard-Maske einer Tabelle nach F2 A: die Masken-Datei, die die Angabe
 * `form` nennt, sonst die erste nach Pfad, ohne Masken-Datei null (die
 * erzeugte Maske). Trifft die Angabe keine eigene Masken-Datei, kommt der
 * Befund der Definition mit, und es gilt die Regel «ohne Angabe».
 *
 * @param {object} p Parameter.
 * @param {string[]} p.eigene Die Masken-Dateien der Tabelle, nach Pfad sortiert.
 * @param {Array<{path: string, table: string}>} p.zugeordnet Alle Masken-Dateien.
 * @param {string|undefined} p.angabe Der Wert der Angabe `form`, falls gesetzt.
 * @returns {{pfad: string|null, hinweis: object|null}}
 */
function waehleStandardMaske({ eigene, zugeordnet, angabe }) {
  const erste = eigene.length > 0 ? eigene[0] : null;
  if (typeof angabe !== 'string' || angabe === '') return { pfad: erste, hinweis: null };
  const treffer = eigene.find((p) => trifftMaskenAngabe(p, angabe));
  if (treffer) return { pfad: treffer, hinweis: null };
  const fremd = zugeordnet.find((m) => trifftMaskenAngabe(m.path, angabe));
  const hinweis = fremd
    ? baueHinweis('formDateiFremd', -1, angabe, fremd.table)
    : baueHinweis('formDateiUnbekannt', -1, angabe);
  return { pfad: erste, hinweis };
}

/**
 * Die Masken einer Tabelle: alle ihre Masken-Dateien und die Standard-Maske.
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel.
 * @param {object} p.fsp Dateizugriff (stat, readFile, optional open).
 * @param {Map} [p.cache] Zwischenspeicher aus createDatabaseCatalogCache.
 * @param {string} p.tabellenPfad Absoluter Pfad der Kopf-Datei.
 * @returns {Promise<{masken: string[], standard: string|null, hinweis: object|null}>}
 */
async function maskenDerTabelle({
  sicht,
  fsp,
  cache = createDatabaseCatalogCache(),
  tabellenPfad,
}) {
  if (!sicht || typeof tabellenPfad !== 'string' || tabellenPfad === '')
    return { masken: [], standard: null, hinweis: null };
  const { jeKopf, zugeordnet } = await maskenZuordnung({ sicht, fsp, cache });
  const eigene = jeKopf.get(pathCompareKey(tabellenPfad)) || [];
  const gelesen = await leseDatei({ absPath: tabellenPfad, fsp, cache, bufferTextFor: null });
  const { form } = parseTableDefinition(gelesen.data);
  const wahl = waehleStandardMaske({ eigene, zugeordnet, angabe: form });
  return { masken: eigene, standard: wahl.pfad, hinweis: wahl.hinweis };
}

/**
 * Die geltende Masken-Datei einer Tabelle, also ihre Standard-Maske, oder null.
 *
 * @param {object} p Parameter wie `maskenDerTabelle`.
 * @returns {Promise<string|null>} Absoluter Pfad der Masken-Datei.
 */
async function geltendeMaske(p) {
  return (await maskenDerTabelle(p)).standard;
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
// { bloecke, parseError, data } oder null, wenn die Datei nicht lesbar ist;
// `data` ist seit 4T-002248 das Frontmatter-Objekt, aus dem die Angaben der
// Listen-Maske kommen.
async function leseAbfrageDatei({ absPath, fsp, cache, bufferTextFor }) {
  const schluessel = `query:${pathCompareKey(absPath)}`;
  const auswerten = (roh) => {
    const text = roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh;
    const fm = extractFrontmatter(text);
    return { bloecke: zaehleAbfrageBloecke(fm.body), parseError: fm.parseError, data: fm.data };
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

// 4T-002248 (Epic 3E-000262, F1 A, S1): Die Angaben der Listen-Maske. Ob die
// Angabe `form` eine Masken-Datei trifft, prüft der Katalog gegen ALLE
// Masken-Dateien der Sicht, nach derselben Vergleichs-Regel wie die Angabe
// `form` der Tabellen-Definition (`trifftMaskenAngabe`). Ob die getroffene
// Maske zur Tabelle der Abfrage gehört, ist hier nicht prüfbar, weil die
// Tabelle erst aus `FROM` folgt; das prüft die Auswertung der Liste.
function listenEintrag(gelesen, zugeordnet) {
  const angaben = parseListAngaben(gelesen.data);
  const hints = [...angaben.hints];
  if (angaben.form !== null && !zugeordnet.some((m) => trifftMaskenAngabe(m.path, angaben.form)))
    hints.push(baueHinweis('listFormDateiUnbekannt', -1, angaben.form));
  return { editable: angaben.editable, form: angaben.form, allow: angaben.allow, hints };
}

/**
 * Die Abfrage-Dateien der Sicht mit Name, Pfad, Zahl der Blöcke, den Angaben
 * der Listen-Maske (seit 4T-002248) und Hinweisen. Eine Datei, die der Index
 * kennt und die es nicht mehr gibt, wird übergangen.
 *
 * @param {object} p Parameter wie `katalogUeberblick`, ohne `status`.
 * @param {Array<{path: string, table: string}>} [p.zugeordnet] Die Masken-Dateien
 *   aus `maskenZuordnung`, falls der Aufrufer sie schon hat; ohne Angabe ermittelt
 *   die Funktion sie selbst.
 * @returns {Promise<Array<{name: string, path: string, bloecke: number,
 *   editable: boolean, form: string|null, allow: string[], hints: Array<object>}>>}
 */
async function abfrageDateien({ sicht, fsp, cache, bufferTextFor = null, zugeordnet = null }) {
  const { abfragen: pfade } = markierteDateien(sicht);
  const masken =
    zugeordnet || (await maskenZuordnung({ sicht, fsp, cache, bufferTextFor })).zugeordnet;
  const abfragen = [];
  for (const absPath of pfade) {
    const gelesen = await leseAbfrageDatei({ absPath, fsp, cache, bufferTextFor });
    if (!gelesen) continue;
    const hints = gelesen.parseError ? [baueHinweis('yaml', -1, null)] : [];
    if (gelesen.bloecke === 0) hints.push(baueHinweis('queryOhneFence', -1, null));
    if (gelesen.bloecke > 1)
      hints.push(baueHinweis('queryMehrereFences', -1, String(gelesen.bloecke)));
    const liste = listenEintrag(gelesen, masken);
    hints.push(...liste.hints);
    abfragen.push({
      name: tabellenName(absPath),
      path: absPath,
      bloecke: gelesen.bloecke,
      editable: liste.editable,
      form: liste.form,
      allow: liste.allow,
      hints,
    });
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
 *   Masken-Datei oder null), seit 4T-002081 kommen die Abfrage-Dateien hinzu, seit
 *   4T-002184 je Tabelle `maskenPfade` (alle ihre Masken-Dateien nach Pfad); `maske`
 *   ist seither die Standard-Maske. Seit 4T-002307 trägt `steckbrief` die gegen die
 *   Tabellen geprüften `rollen`, sofern die Datei `roles` trägt. Seit 4T-002308
 *   trägt die Antwort `eigeneRolle` ({ rolle, anmeldename, quelle }) und jede
 *   Tabelle `rechte` ({ create, update, delete, define }); `p.herkunft` ist die
 *   Naht für den Anmeldenamen.
 */
async function katalogUeberblick({
  sicht,
  status,
  fsp,
  cache,
  bufferTextFor = null,
  herkunft = null,
}) {
  const hints = [];
  const { tabellen: pfade, steckbriefe } = markierteDateien(sicht);

  const tabellen = [];
  const gesehen = new Map();
  // 4T-002184: die Angabe `form` je Tabellen-Eintrag, aufgelöst erst, wenn alle
  // Masken-Dateien gelesen sind.
  const formJeEintrag = new Map();
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
    formJeEintrag.set(eintrag, definition.form);
    tabellen.push(eintrag);
  }

  // Der Steckbrief ist eine Aussage über die Datenbank als Ganzes und steht
  // deshalb genau einmal (I1). Ein zweiter wird gemeldet und nicht benutzt; die
  // Reihenfolge ist die der Pfade und damit stabil.
  let steckbrief = null;
  const namen = tabellen.map((eintrag) => eintrag.name);
  let geprueft = pruefeSteckbriefRollen(null, namen);
  if (steckbriefe.length > 0) {
    const gelesen = await leseDatei({ absPath: steckbriefe[0], fsp, cache, bufferTextFor });
    const gelesenerSteckbrief = parseSteckbrief(gelesen.data);
    steckbrief = { path: steckbriefe[0], ...gelesenerSteckbrief };
    hints.push(...yamlHinweis(gelesen), ...gelesenerSteckbrief.hints);
    // 4T-002307 (S3): Erst hier sind die Tabellen bekannt. Eine Rolle mit einer
    // unbekannten Tabelle fällt aus `rollen`, ihr Hinweis geht denselben Weg
    // wie die übrigen Hinweise des Steckbriefs in die Fehlerlagen. Geprüft
    // werden auch die Tabellen einer Rolle, die schon beim Lesen entfallen ist.
    // 4T-002308 (S3): danach Vorgabe-Rolle und Zuordnung gegen die endgültigen
    // Rollen; eine unbekannte Rolle gilt als nicht gesetzt. Die Hinweise des
    // Lesens stehen schon im Steckbrief, hier kommen allein die der Prüfung dazu.
    geprueft = pruefeSteckbriefRollen(gelesen.data, namen);
    if (gelesenerSteckbrief.rollen) steckbrief.rollen = geprueft.rollen;
    delete steckbrief.defaultRole;
    if (geprueft.defaultRole !== null) steckbrief.defaultRole = geprueft.defaultRole;
    if (gelesenerSteckbrief.users) steckbrief.users = geprueft.users;
    if (geprueft.pruefHinweise.length > 0) {
      steckbrief.hints = [...gelesenerSteckbrief.hints, ...geprueft.pruefHinweise];
      hints.push(...geprueft.pruefHinweise);
    }
    for (const weiterer of steckbriefe.slice(1))
      hints.push(baueHinweis('duplicateDatabase', -1, tabellenName(weiterer)));
  }

  // 4T-001943 (Bauplan B2): Die Masken-Dateien mit ihren Hinweisen, und je
  // Tabelle der Pfad ihrer Standard-Maske, damit die Übersicht ihn zeigen kann.
  // 4T-002184 (F2 A): dazu alle Masken-Dateien der Tabelle nach Pfad und der
  // Befund einer Angabe `form`, die keine eigene Masken-Datei trifft.
  const { masken, jeKopf, zugeordnet } = await maskenZuordnung({
    sicht,
    fsp,
    cache,
    bufferTextFor,
  });
  for (const eintrag of tabellen) {
    const eigene = jeKopf.get(pathCompareKey(eintrag.path)) || [];
    const wahl = waehleStandardMaske({ eigene, zugeordnet, angabe: formJeEintrag.get(eintrag) });
    eintrag.maske = wahl.pfad;
    eintrag.maskenPfade = eigene;
    if (wahl.hinweis) eintrag.hints.push(wahl.hinweis);
  }

  // 4T-002081: die Abfrage-Dateien mit ihren Hinweisen für den Abschnitt «Abfragen».
  // 4T-002248: mit den schon gelesenen Masken-Dateien für die Angabe `form`.
  const abfragen = await abfrageDateien({ sicht, fsp, cache, bufferTextFor, zugeordnet });

  // 4T-002308 (S4): die eigene Rolle und je Tabelle die Erlaubnis-Menge, aus
  // derselben Auflösung, die die übrigen Lese-Kanäle über `rechteDerSicht` fragen.
  const { eigeneRolle, rechte } = eigeneRechte(geprueft, namen, herkunft);
  for (const eintrag of tabellen) eintrag.rechte = rechte[eintrag.name];

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
    eigeneRolle,
  };
}

// 4T-002308: Der Anmeldename allein aus der Herkunft, nur lesend; `herkunft`
// ist die Naht der Prüfdateien wie in `record-auftrag.js`.
function anmeldenameVon(herkunft) {
  const angabe = (typeof herkunft === 'function' ? herkunft : ermittleHerkunft)();
  return angabe && typeof angabe.benutzer === 'string' ? angabe.benutzer : null;
}

// 4T-002308: Eigene Rolle und Erlaubnis-Menge aus den geprüften Angaben.
function eigeneRechte(geprueft, namen, herkunft) {
  const anmeldename = anmeldenameVon(herkunft);
  const { rolle, quelle, rechte } = loeseRechte({
    rollen: geprueft.rollen,
    defaultRole: geprueft.defaultRole,
    users: geprueft.users,
    anmeldename,
    tabellenNamen: namen,
  });
  return { eigeneRolle: { rolle, anmeldename, quelle }, rechte };
}

/**
 * Die eigene Rolle und die Erlaubnis-Menge je Tabelle einer Sicht (4T-002308,
 * S3, S4), für die Lese-Kanäle Datensatz, Liste und Positionsliste.
 *
 * Steckbrief und Tabellen kommen aus denselben Marken wie im Überblick, die
 * Prüfung aus `pruefeSteckbriefRollen` und die Auflösung aus `loeseRechte`:
 * Alle vier Kanäle geben damit auf dieselbe Frage dieselbe Antwort. Ohne
 * lesbaren Steckbrief gibt es keine Rollen, und alles ist erlaubt (E12.5).
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel.
 * @param {object} p.fsp Dateizugriff (stat, readFile, optional open).
 * @param {Map} [p.cache] Zwischenspeicher aus createDatabaseCatalogCache.
 * @param {Function} [p.bufferTextFor] Puffer-Auskunft des geschriebenen Stands.
 * @param {Function} [p.herkunft] Naht für Benutzer und Rechner.
 * @returns {Promise<{eigeneRolle: {rolle: string|null, anmeldename: string|null,
 *   quelle: string}, rechte: Object<string, object>}>} `rechte` je Tabellen-Name.
 */
async function rechteDerSicht({
  sicht,
  fsp,
  cache = createDatabaseCatalogCache(),
  bufferTextFor = null,
  herkunft = null,
}) {
  const { tabellen, steckbriefe } = markierteDateien(sicht || {});
  const namen = tabellen.map(tabellenName);
  const data =
    steckbriefe.length > 0
      ? (await leseDatei({ absPath: steckbriefe[0], fsp, cache, bufferTextFor })).data
      : null;
  return eigeneRechte(pruefeSteckbriefRollen(data, namen), namen, herkunft);
}

/**
 * Geltende Rolle und Erlaubnis-Menge für die Schreib-Schnittstelle (4T-002309,
 * Entscheidung der Sitzung vom 2026-10-18).
 *
 * Dieselbe Auflösung wie `rechteDerSicht`, aber **mit Status**, weil der
 * Schreibweg «nicht bestimmbar» von «keine Rollen» unterscheiden muss: Ohne
 * Sicht, mit nicht lesbarem oder fehlerhaftem Steckbrief ist die Erlaubnis-Menge
 * nicht bestimmbar, und die Schnittstelle weist ab (E12.6). «Keine Rollen» gilt
 * allein, wenn die Sicht keinen Steckbrief führt oder der gelesene Steckbrief
 * keine trägt (E12.5). Gelesen wird der gespeicherte Stand, ohne Puffer.
 * `rechteDerSicht` bleibt für die Lese-Kanäle unverändert.
 *
 * 4T-002310: `zusatzNamen` löst die Erlaubnis-Menge zusätzlich für Tabellen auf,
 * die die Sicht noch nicht führt (eine neue Tabellen-Datei beim ersten
 * Speichern). Der Abgleich der Rollen gegen die Tabellen bleibt der der Sicht.
 *
 * @param {object} p Parameter wie `rechteDerSicht`, ohne `bufferTextFor`.
 * @param {string[]} [p.zusatzNamen] Weitere Tabellen-Namen der Auflösung.
 * @returns {Promise<{status: 'ready', rolle: string|null, rechte: Object<string, object>}
 *   |{status: 'sichtFehlt'|'steckbriefNichtLesbar'|'steckbriefFehlerhaft'}>}
 */
async function rechteZumSchreiben({
  sicht,
  fsp,
  cache = createDatabaseCatalogCache(),
  herkunft = null,
  zusatzNamen = [],
}) {
  if (!sicht) return { status: 'sichtFehlt' };
  const { tabellen, steckbriefe } = markierteDateien(sicht);
  const namen = tabellen.map(tabellenName);
  let data = null;
  if (steckbriefe.length > 0) {
    const gelesen = await leseDatei({ absPath: steckbriefe[0], fsp, cache, bufferTextFor: null });
    if (gelesen.quelle === null) return { status: 'steckbriefNichtLesbar' };
    if (gelesen.parseError) return { status: 'steckbriefFehlerhaft' };
    data = gelesen.data;
  }
  const bekannt = new Set(namen.map((n) => n.toLowerCase()));
  const weitere = (Array.isArray(zusatzNamen) ? zusatzNamen : []).filter(
    (n) => typeof n === 'string' && n && !bekannt.has(n.toLowerCase()),
  );
  const { eigeneRolle, rechte } = eigeneRechte(
    pruefeSteckbriefRollen(data, namen),
    [...namen, ...weitere],
    herkunft,
  );
  return { status: 'ready', rolle: eigeneRolle.rolle, rechte };
}

/**
 * Die Erlaubnis-Menge EINER Tabelle (4T-002308, S4), für das Feld `rechte` der
 * Antworten von Datensatz, Liste und Positionsliste. Ohne Sicht ist sie
 * unbekannt (null) und nie «alles erlaubt», weil eine Antwort ohne Steckbrief
 * nichts über die Rollen weiß.
 *
 * @param {object} p Parameter wie `rechteDerSicht`, dazu `tabellenPfad`.
 * @param {string} p.tabellenPfad Absoluter Pfad der Kopf-Datei.
 * @returns {Promise<{create: boolean, update: boolean, delete: boolean,
 *   define: boolean}|null>}
 */
async function rechteDerTabelle(p) {
  return (await rolleUndRechteDerTabelle(p)).rechte;
}

/**
 * Geltende Rolle und Erlaubnis-Menge EINER Tabelle (4T-002311, Story AK4), für
 * die Felder `rolle` und `rechte` der Antworten von Datensatz, Liste,
 * Positionsliste und Tabellen-Definition: Der Hinweis-Text eines verwehrten
 * Handgriffs nennt die Rolle. Dieselbe Auflösung wie `rechteDerTabelle`, mit
 * einem Lesen des Steckbriefs. `rolle` ist null, wenn keine Rolle gilt (keine
 * Rollen, keine Zuordnung und keine Vorgabe-Rolle) und ohne Sicht.
 *
 * @param {object} p Parameter wie `rechteDerSicht`, dazu `tabellenPfad`.
 * @param {string} p.tabellenPfad Absoluter Pfad der Kopf-Datei.
 * @returns {Promise<{rolle: string|null, rechte: {create: boolean, update: boolean,
 *   delete: boolean, define: boolean}|null}>}
 */
async function rolleUndRechteDerTabelle({ tabellenPfad, ...p }) {
  if (!p.sicht || typeof tabellenPfad !== 'string') return { rolle: null, rechte: null };
  const { eigeneRolle, rechte } = await rechteDerSicht(p);
  const name = tabellenName(tabellenPfad);
  const hat = Object.prototype.hasOwnProperty.call(rechte, name);
  return { rolle: eigeneRolle.rolle, rechte: hat ? rechte[name] : null };
}

/**
 * Die Hinweise der Rollen im Steckbrief als Angaben für Befunde der
 * Konsistenz-Prüfung (4T-002307, S3).
 *
 * Der Steckbrief und die Tabellen kommen aus denselben Marken wie im Überblick
 * (`markierteDateien`), die Auslegung und der Abgleich aus derselben Funktion
 * (`rollenBefundAngaben`): Übersicht und Prüfung geben damit auf dieselbe
 * Frage dieselbe Antwort. **Gelesen wird allein über `readFile`**, weil die
 * Prüfung nur diesen Zugriff trägt (Zusage «schreibt nichts»); ein zweiter
 * Steckbrief ist ein Befund des Überblicks und wird hier nicht gelesen. Eine
 * nicht lesbare Datei wird übergangen wie eine nicht lesbare Masken-Datei.
 *
 * @param {object} p Parameter.
 * @param {object} p.sicht Index-Sicht der Wurzel.
 * @param {object} p.fsp Dateizugriff mit `readFile`.
 * @returns {Promise<Array<{datei: string, wert: string, zieltabelle: string|null}>>}
 */
async function rollenBefundeDerSicht({ sicht, fsp }) {
  const { tabellen, steckbriefe } = markierteDateien(sicht || {});
  if (steckbriefe.length === 0) return [];
  let roh;
  try {
    roh = String(await fsp.readFile(steckbriefe[0], 'utf8'));
  } catch {
    return [];
  }
  const fm = extractFrontmatter(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh);
  return rollenBefundAngaben(fm.data, tabellen.map(tabellenName), steckbriefe[0]);
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
  // 4T-002184: die Masken einer Tabelle und der Vergleich mit einem Masken-Namen.
  maskenDerTabelle,
  // 4T-002249: alle Masken-Dateien mit ihrer Tabelle, für den Befund «fremd» der Liste.
  maskenZuordnung,
  trifftMaskenAngabe,
  waehleStandardMaske,
  istDatenbankBereich,
  katalogUeberblick,
  // 4T-001945 (Bauplan B1): die Masken-Dateien einer Sicht für den Verwendungsnachweis.
  markierteDateien,
  // 4T-002307: die Hinweise der Rollen für die Konsistenz-Prüfung.
  rollenBefundeDerSicht,
  // 4T-002308: eigene Rolle und Erlaubnis-Menge für die Lese-Kanäle.
  rechteDerSicht,
  rechteDerTabelle,
  // 4T-002311: Rolle und Erlaubnis-Menge einer Tabelle für die Masken.
  rolleUndRechteDerTabelle,
  // 4T-002309: dieselbe Auflösung mit Status für die Schreib-Schnittstelle.
  rechteZumSchreiben,
  tabellenDefinition,
  tabellenName,
};
