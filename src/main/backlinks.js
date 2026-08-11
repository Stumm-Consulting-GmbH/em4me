// 4T-0015: Backlinks-Indexierung pro Wurzel.
// Eine Wurzel ist der Ordner einer aktiven Datei. Suchraum = Wurzel + 2
// zusaetzliche Unterordner-Ebenen (chokidar depth: 2). Pro Wurzel haelt
// dieses Modul einen Index aller Markdown-Dateien mit allen darin gefundenen
// Wiki-Links und relativen Markdown-Links plus chokidar-Watcher fuer
// inkrementelle Updates. Reference-Counting plus 60-s-Soft-Timer steuert,
// wann der Watcher abgebaut wird (letzter Tab in der Wurzel ist zu).

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const chokidar = require('chokidar');
// 4T-0050 (Epic 3E-0010): js-yaml fuer Frontmatter-Aliases-Auswertung
// (SAFE-Schema, kein Code-Eval).
const yaml = require('js-yaml');
// W-06 (4T-0310): Heading-Slug aus der gemeinsamen Quelle (Single Source),
// statt einer lokalen Kopie — verhindert Divergenz zwischen Backlinks-/
// Autocomplete-Ankern und dem Render-Pfad.
const { githubLikeSlug } = require('../shared/markdown/slug.js');
// 4T-0336 (Epic 3E-0061): Unterseiten-Namens-Logik (U+2215-Trennzeichen,
// Slash-Uebersetzung, Expansion relativer Ziele) aus der gemeinsamen Quelle.
const {
  SUBPAGE_SEP,
  expandRelativeTarget,
  isRelativeTarget,
  toLogicalName,
} = require('../shared/subpages.js');
// 4T-0344 (Epic 3E-0062): Erkennungs-Bausteine (Link-Regexe, Inline-Code-
// Maskierung, Frontmatter-Grenze, Namens-Normalisierung) aus der gemeinsamen
// Quelle, damit Backlinks-Index und Rewrite-Kern dieselben Stellen als Link
// erkennen (keine duplizierten Patterns).
const {
  MD_EXT_RE,
  FENCE_RE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
  normalizeNameKey,
  maskInlineCode,
  frontmatterBodyStart,
} = require('../shared/markdown/link-scan.js');
// 4T-0354 (Epic 3E-0065): Query-Parser der Perspective-Query-Sprache
// (perspective-query-Fence). Prozess-neutral, mit den Unit-Tests geteilt.
// Seit 4T-0401 (Epic 3E-0076) unter dem Namen perspective-query.js
// (Klausel-Sprache, nicht mehr nur Frontmatter).
const { parseQuery } = require('../shared/perspective-query.js');
// 4T-0515 (Epic 3E-0092): Zuordnungs-Feld-Auswertung der Ereignis-
// Aggregation (Grundmenge = Dateien, deren Zuordnungs-Feld das interne
// Ereignis-Profil nennt).
const { assignedProfileNames } = require('../shared/property-profiles.js');
// 4T-0402 (Epic 3E-0076): Auswertung (Typ-System, file.*-Felder, Funktions-
// Katalog, FROM-Quellen) aus dem Schwester-Modul; frontmatterQueryFor baut
// den Kontext pro Datei aus dem Index und laesst matchesQuery entscheiden.
const {
  matchesQuery,
  validateQuery,
  queryUsesLinks,
  applyResultPipeline,
  evaluateExpression,
  formatValueSegments,
  formatExprSource,
  // 4T-0503 (Epic 3E-0096): Werte-Ordnung und Anzeige-Form der Gruppen-Keys.
  orderForSort,
  formatValue,
} = require('../shared/perspective-query-eval.js');
// 4T-0347 (Epic 3E-0062): isInsideArea ist die kanonische, reine Innerhalb-
// Pruefung des Bereichs-Konzepts (case-insensitiv, ..-sicher). Bereichs-
// Applikationen indexieren den gesamten Bereichs-Baum als eine Wurzel; die
// Grenze ist dieselbe wie fuer alle uebrigen Bereichs-Pfade der App.
const { isInsideArea } = require('./area-path.js');
// 4T-0502 (Epic 3E-0096): Marker-Kern fuer den TASKS-Scope der Abfrage —
// Task-Zeilen werden beim Indexieren als Roh-Zeilen gesammelt und erst im
// Query-Zweig zum Modell geparst (Index bleibt schlank, Re-Parse trivial).
// 4T-0505: Dringlichkeits-Score und Vergleichs-Helfer der Default-Sortierung.
const {
  parseTaskLine,
  modelMatchesGlobalFilter,
  computeUrgency,
  compareDateValue,
  priorityRank,
  // 4T-0508: Blockierungs-/Duplikat-Flags ueber die Task-Menge des Bereichs.
  computeDependencyFlags,
} = require('../shared/task-markers.js');
// 4T-0363 (Epic 3E-0067): Block-Anker-Regex aus der gemeinsamen, prozess-
// neutralen Quelle (Single Source). Dieselbe Definition nutzt der Renderer-
// Abgleich des Block-Metadaten-Panels, damit Index (`blockIds`) und Panel
// dieselben Anker als Block-Anker erkennen.
const { BLOCK_ANCHOR_RE } = require('../shared/block-anchors.js');
// 4T-0348 (Epic 3E-0062): Cache-Container-Format und Hash fuer die Index-
// Persistenz (Area_Cache.mdda). mdd-store bleibt path-frei; die wurzel-relative
// Transformation der md-Link-Ziele passiert hier in backlinks.js.
const {
  hashText,
  MDDA_CACHE_FILENAME,
  emptyCacheContainer,
  parseCacheContainer,
  serializeCacheContainer,
  // 4T-0408 (Epic 3E-0077): blockData-Sektion der .mdd fuer die Block-Abfrage.
  parseContainer,
  getAllBlockData,
} = require('./mdd-store.js');
// 4T-0064 (Epic 3E-0012): markdown-it fuer die AST-basierte Block-Range-
// Erkennung bei `![[Datei#^id]]`-Embeds. Lazy-Init beim ersten Aufruf, damit
// das Modul nur geladen wird, wenn ein Embed-Lookup tatsaechlich erfolgt.
let mdEmbedParserInstance = null;
function getEmbedParser() {
  if (!mdEmbedParserInstance) {
    const MarkdownIt = require('markdown-it');
    mdEmbedParserInstance = new MarkdownIt({ html: false, breaks: false });
  }
  return mdEmbedParserInstance;
}

// Konstanten
const SCAN_DEPTH = 2;
const MAX_FILES = 2000;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
// B-19 (4T-0181): Einzeldatei-Limit — groessere Dateien werden nicht
// geparst (Index bleibt funktionsfaehig, Datei traegt keine Links bei).
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
// B-14 (4T-0181): Batch-Groesse fuer das Yielding beim Async-Aufbau.
const BUILD_BATCH_SIZE = 50;
const SNIPPET_MAX = 120;
const INVALIDATE_DEBOUNCE_MS = 200;
const SOFT_TIMEOUT_MS = 60 * 1000;
// B-21 (4T-0187): Wartezeit nach einem Watcher-Fehler, bevor ein neuer
// Bedarf den Index wieder aufbauen darf.
const WATCHER_ERROR_BACKOFF_MS = 30 * 1000;
// 4T-0348 (Epic 3E-0062): Wartezeit nach der letzten Aenderung, bevor der
// Bereichs-Index-Cache (Area_Cache.mdda) geschrieben wird (debounced).
const CACHE_DEBOUNCE_MS = 3000;
// 4T-0344 (Epic 3E-0062): eine Instanz je Modul-Ladung; lastIndex wird pro Zeile
// zurueckgesetzt (unveraendertes Verhalten der frueheren Modul-Konstante).
// MD_EXT_RE und FRONTMATTER_END_LINE kommen jetzt aus der gemeinsamen Quelle.
const WIKI_LINK_RE = createWikiLinkRegex();

// B-10 (4T-0175): Heading-Text vor dem Sluggen um Link-Syntax reduzieren,
// wie es der Renderer ueber den Token-Text effektiv tut: [[Ziel|Label]] ->
// Label, [[Ziel]] -> Ziel, [Text](url) -> Text.
function reduceHeadingText(s) {
  return String(s || '')
    .replace(/\[\[([^\]\n|]+)\|([^\]\n]+)\]\]/g, '$2')
    .replace(/\[\[([^\]\n]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

// B-04/B-23 (4T-0175): normalizeNameKey (Vergleichs-Schluessel fuer Datei-/
// Wiki-Namen, NFC + lowercase) liegt seit 4T-0344 in der gemeinsamen Quelle.

// B-03/B-12 (4T-0175): gemeinsame Ignore-Regel fuer Initial-Scan und
// Watcher — node_modules und alle Punkt-Ordner bleiben draussen.
function isIgnoredDirName(name) {
  return name === 'node_modules' || name.startsWith('.');
}

// 4T-0054: ATX-Heading-Erkennung (1-6 Hashes plus mind. ein Leerzeichen).
// Optionaler Trailing-Hash (`# Heading #`) wird abgeschnitten.
const HEADING_RE = /^#{1,6}\s+(.+?)(?:\s+#{1,6})?\s*$/;
// 4T-0054 / B-06 (4T-0175): Block-Anker am Zeilenende (auch als einziger
// Zeileninhalt); Definition seit 4T-0363 (Epic 3E-0067) importiert aus
// src/shared/block-anchors.js (siehe Import oben).
// 4T-0054: FENCE_RE (Fenced-Code-Block-Marker) liegt seit 4T-0344 in der
// gemeinsamen Quelle (link-scan.js).

// 4T-0056: Inline-Tags `#tag` im Body. Gleiches Pattern wie tagsPlugin in
// preload.js. Negativer Look-behind verhindert Treffer mitten in Woertern
// (z.B. 'foo#bar'), nach `##` (Markdown-Heading-Doppelhash) und in
// Markdown-Link-Zielen `](#anker)` (4T-0060).
const TAG_RE = /(?<![\p{L}\p{N}_#])(?<!\]\()#([\p{L}\p{N}_/-]+)/gu;
// 4T-0060: Hex-Farbcodes (3-, 4-, 6- oder 8-stellig, alles Hex) sind kein
// Tag. Schliesst CSS-Farb-Notationen wie #fff, #ffffff, #c0392b aus.
const HEX_COLOR_RE = /^[0-9a-f]{3,8}$/i;
// 4T-0060: Tags muessen mindestens einen Buchstaben enthalten, damit reine
// Zahlen (Issue-Referenzen, Fussnoten) nicht als Tag indexiert werden.
const TAG_LETTER_RE = /[\p{L}]/u;

// 4T-0060: Pruefung, ob ein Tag-Kandidat tatsaechlich ein Tag ist.
function isValidTag(tag) {
  if (!tag) return false;
  if (tag.startsWith('/') || tag.endsWith('/')) return false;
  if (!TAG_LETTER_RE.test(tag)) return false; // reine Zahlen raus
  if (HEX_COLOR_RE.test(tag)) return false; // Hex-Codes raus
  return true;
}

// 4T-0344 (Epic 3E-0062): MD_LINK_RE (relative Markdown-Links) aus der
// gemeinsamen Quelle; eine Instanz je Modul-Ladung, lastIndex-Reset pro Zeile.
const MD_LINK_RE = createMdLinkRegex();

// State pro Wurzel.
// indexes: Map<wurzel(absolut), Eintrag>
// Eintrag = {
//   wurzel, status: 'indexing'|'ready'|'oversized',
//   files: Map<absoluterPfad, Array<{zeile, linkTyp, ziel(absolut)|null, ankerTeilTyp, anker, snippet}>>,
//   fileCount, byteSize,
//   watcher, refCount, softTimer,
//   invalidateTimer
// }
const indexes = new Map();

let broadcastFn = null;

// Registriert den Broadcast-Mechanismus aus main.js. broadcastFn(channel, payload)
// sendet an alle BrowserWindows.
function attachBroadcast(fn) {
  broadcastFn = fn;
}

// 4T-0348 (Epic 3E-0062): markSelfWriting aus main.js, damit das Schreiben der
// Cache-Datei nicht als Fremd-Aenderung zaehlt (Konsistenz zum Area_Settings.mdda-
// Schreibpfad; die Cache-Datei selbst ist nie ein Tab). null = kein Writer
// verdrahtet (z.B. Unit-Test) -> Schreiben laeuft ohne Selbst-Markierung.
let selfWriterFn = null;
function attachSelfWriter(fn) {
  selfWriterFn = fn;
}

// Verzeichnis-Scan, der die Datei-Liste plus Gesamt-Bytes ermittelt.
// Bricht ab, sobald MAX_FILES oder MAX_BYTES ueberschritten ist (oversized).
// B-14 (4T-0181): asynchron mit Batch-Yielding, damit der Main-Prozess
// waehrend des Scans grosser Wurzeln nicht blockiert.
async function collectMarkdownFiles(root, isArea) {
  const files = [];
  const sizes = new Map();
  // 4T-0348 (Epic 3E-0062): mtime pro Datei fuer den Cache-Abgleich (der stat
  // wird ohnehin erhoben). Nur bei Bereichs-Wurzeln ausgewertet.
  const mtimes = new Map();
  // 4T-0402 (Epic 3E-0076): Erstell-Zeit pro Datei fuer das implizite
  // Abfrage-Feld file.ctime (birthtime = Anlage-Zeit; ctime-Fallback fuer
  // Dateisysteme ohne birthtime).
  const ctimes = new Map();
  let bytes = 0;
  let sinceYield = 0;
  // B-22 (4T-0187): unlesbare Ordner nicht mehr voellig still uebergehen —
  // zaehlen, loggen und im meta-Payload an die Panels melden.
  let skippedDirs = 0;
  const dirs = [{ dir: root, depth: 0 }];
  while (dirs.length > 0) {
    const { dir, depth } = dirs.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      skippedDirs++;
      console.warn('Backlinks-Scan: Ordner nicht lesbar:', dir, err && err.code);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // B-03 (4T-0175): gleiche Ignore-Regel wie der Watcher, sonst
        // landen node_modules-/Punkt-Ordner-Dateien im Index.
        if (isIgnoredDirName(entry.name)) continue;
        // 4T-0347 (Epic 3E-0062): Bereichs-Wurzeln ohne Tiefen-Grenze.
        if (isArea || depth < SCAN_DEPTH) dirs.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && MD_EXT_RE.test(entry.name)) {
        let size = 0;
        let mtimeMs = 0;
        let ctimeMs = 0;
        try {
          const st = await fs.promises.stat(full);
          size = st.size;
          mtimeMs = st.mtimeMs;
          ctimeMs = st.birthtimeMs || st.ctimeMs;
        } catch {
          /* ignore */
        }
        files.push(full);
        sizes.set(full, size);
        mtimes.set(full, mtimeMs);
        ctimes.set(full, ctimeMs);
        bytes += size;
        // 4T-0347 (Epic 3E-0062): Caps gelten nur fuer bereichslose Wurzeln;
        // eine Bereichs-Wurzel indexiert immer den gesamten Bereich.
        if (!isArea && (files.length > MAX_FILES || bytes > MAX_BYTES)) {
          return { oversized: true, fileCount: files.length, byteSize: bytes, skippedDirs };
        }
        if (++sinceYield >= BUILD_BATCH_SIZE) {
          sinceYield = 0;
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    }
  }
  return {
    oversized: false,
    fileCount: files.length,
    byteSize: bytes,
    files,
    sizes,
    mtimes,
    ctimes,
    skippedDirs,
  };
}

// Parst eine Datei und extrahiert alle Link-Treffer. Zielpfad wird beim
// Markdown-Link gegen das Datei-Verzeichnis aufgeloest und absolut gemacht.
// Wiki-Links speichern den Basename als ziel-Erwartung (ohne .md), Aufloesung
// passiert spaeter beim Lookup ueber die files-Map.
// 4T-0050: Liefert zusaetzlich die Aliases aus dem YAML-Frontmatter (Feld
// `aliases:`, Liste oder einzelner String). Wiki-Link- und Markdown-Link-
// Scan ueberspringt Frontmatter-Zeilen, damit YAML-Inhalte nicht als
// ausgehende Links indexiert werden.
function parseFile(filePath) {
  let content;
  try {
    // B-19 (4T-0181): Einzeldatei-Limit vor dem Lesen — uebergrosse
    // Dateien werden nicht geparst (leeres Ergebnis statt Speicherlast).
    if (fs.statSync(filePath).size > MAX_FILE_BYTES) {
      return {
        hits: [],
        aliases: [],
        headings: [],
        blockIds: [],
        tags: [],
        properties: {},
        hash: '',
      };
    }
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    // B-11 (4T-0175): null = Lesefehler (Aufrufer behaelt bestehende
    // Index-Daten); eine leere Datei liefert dagegen ein leeres Ergebnis.
    return null;
  }
  // 4T-0348 (Epic 3E-0062): SHA-256 des Roh-Inhalts als Cache-Absicherung
  // mitfuehren (die Abgleich-Entscheidung bleibt mtime+size).
  const parsed = parseContent(filePath, content);
  parsed.hash = hashText(content);
  return parsed;
}

// B-14 (4T-0181): Async-Variante fuer den Initial-Aufbau (kein Sync-IO im
// Main-Loop); der Parser-Kern ist mit dem Watcher-Pfad geteilt.
async function parseFileAsync(filePath) {
  let content;
  try {
    if ((await fs.promises.stat(filePath)).size > MAX_FILE_BYTES) {
      return {
        hits: [],
        aliases: [],
        headings: [],
        blockIds: [],
        tags: [],
        properties: {},
        hash: '',
      };
    }
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseContent(filePath, content);
  parsed.hash = hashText(content);
  return parsed;
}

function parseContent(filePath, content) {
  // M-04 (4T-0173): UTF-8-BOM entfernen — gleicher Fix wie in file:read
  // (main.js). Ohne Strip schluege die Frontmatter-Erkennung in Zeile 1
  // fehl und Aliases/Tags der Datei fehlten im Index. \uFEFF explizit
  // statt literalem BOM-Zeichen im Regex (unsichtbar, Lint-Befund).
  content = content.replace(/^\uFEFF/, '');
  const dir = path.dirname(filePath);
  const lines = content.split(/\r?\n/);

  // 4T-0050: Frontmatter erkennen. Heuristik wie in src/shared/markdown/frontmatter.js:
  // Zeile 1 muss genau '---' sein, Schluss-Zeile '---' oder '...' an
  // exaktem Zeilenanfang. fmBodyStartLine ist die 0-basierte Index der
  // ersten Markdown-Zeile nach dem Frontmatter (oder 0, wenn kein
  // Frontmatter erkannt).
  // 4T-0344 (Epic 3E-0062): Frontmatter-Grenze aus der gemeinsamen Quelle, damit
  // Backlinks-Parser und Rewrite-Kern dieselbe Body-Grenze sehen. Der YAML-Parse
  // (Aliases/Tags) bleibt Backlinks-spezifisch.
  const fmBodyStartLine = frontmatterBodyStart(lines);
  let aliases = [];
  let properties = {};
  const tagsSet = new Set(); // Sammelt Inline- und Frontmatter-Tags (case-preserving)
  if (fmBodyStartLine > 0) {
    // YAML-Block ist lines[1 .. fmBodyStartLine-2] (Schluss-Zeile ausgeschlossen).
    const yamlText = lines.slice(1, fmBodyStartLine - 1).join('\n');
    try {
      const parsed = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        aliases = normalizeAliases(parsed.aliases);
        // 4T-0354 (Epic 3E-0065): abfragbare Frontmatter-Properties mitnehmen.
        properties = extractProperties(parsed);
        // 4T-0056: Frontmatter-Tags akzeptieren YAML-Liste, einzelnen String
        // oder mehrzeilige Liste. Normalisierungs-Funktion wird mit Aliases
        // geteilt.
        const fmTags = normalizeAliases(parsed.tags);
        for (const t of fmTags) {
          // Inline-Tags duerfen kein '/' am Anfang/Ende haben; gleicher Filter
          // fuer Frontmatter-Tags zur Konsistenz.
          if (t && !t.startsWith('/') && !t.endsWith('/')) {
            tagsSet.add(t);
          }
        }
      }
    } catch {
      // Parse-Fehler: keine Aliases/Tags, Body trotzdem ab Schluss-Zeile.
      aliases = [];
    }
  }

  const out = [];
  // 4T-0054: Pro Datei zusaetzlich Heading-Slugs und Block-IDs sammeln,
  // damit existingWikiTargets Anker-Prueferungen machen kann. Fenced-
  // Code-Bloecke werden uebersprungen, damit Markdown-Beispiele im Code
  // nicht als echte Headings/Block-IDs zaehlen.
  const headings = [];
  const blockIds = [];
  // 4T-0502 (Epic 3E-0096): Task-Zeilen fuer den TASKS-Scope der Abfrage —
  // Roh-Zeile plus Zeilennummer plus Text der umgebenden Ueberschrift
  // (heading-Feld des Evaluators). Modell-Parsing erst im Query-Zweig.
  const tasks = [];
  let currentHeading = null;
  let inFence = false;
  let fenceChar = null;

  // B-10 (4T-0175): Slug-Deduplizierung wie markdown-it-anchor (x, x-1,
  // x-2 …), damit Linter und Autocomplete dieselben Anker sehen wie der
  // Renderer.
  const slugCounts = new Map();
  const pushHeadingSlug = (rawText) => {
    // 4T-0502: laufender Ueberschrifts-Text fuer die Task-Zeilen-Zuordnung.
    currentHeading = reduceHeadingText(rawText).trim() || null;
    const slug = githubLikeSlug(reduceHeadingText(rawText));
    if (!slug) return;
    const n = slugCounts.get(slug) || 0;
    slugCounts.set(slug, n + 1);
    headings.push(n === 0 ? slug : `${slug}-${n}`);
  };

  for (let i = fmBodyStartLine; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Fenced-Code-Tracking.
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const ch = marker.charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;

    // 4T-0054: Heading-Erkennung (ATX).
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      pushHeadingSlug(headingMatch[1]);
    } else if (line.trim() !== '' && i + 1 < lines.length) {
      // B-10 (4T-0175): Setext-Headings (Text-Zeile mit ===- bzw. ----
      // Unterstreichung). Heuristik: '-'-Marker nur, wenn die Text-Zeile
      // nicht selbst Listen-/Quote-/Tabellen-Syntax ist (sonst waere es
      // ein Thematic Break bzw. eine Tabellen-Trennzeile).
      const next = lines[i + 1];
      const isEq = /^\s{0,3}=+\s*$/.test(next);
      const isDash = /^\s{0,3}-+\s*$/.test(next) && !/^\s*([-*+]\s|\d+[.)]\s|>|\||#)/.test(line);
      if (isEq || isDash) pushHeadingSlug(line);
    }

    // 4T-0054: Block-Anker am Zeilenende.
    const blockMatch = line.match(BLOCK_ANCHOR_RE);
    if (blockMatch) {
      blockIds.push(blockMatch[1]);
    }

    // 4T-0502 (Epic 3E-0096): Task-Zeilen sammeln (Checkbox-Zeilen laut
    // Marker-Kern; der Global Filter wird bewusst erst im Query-Zweig
    // angewandt, damit eine Filter-Aenderung keinen Index-Neuaufbau braucht).
    // Schnelle Kandidaten-Vorpruefung vor dem vollen Zeilen-Parse.
    if (TASK_CANDIDATE_RE.test(line) && parseTaskLine(line) !== null) {
      tasks.push({ zeile: lineNum, text: line, heading: currentHeading });
    }

    // 4T-0060 / B-07 (4T-0175): Link- und Tag-Scans laufen auf der inline-code-
    // maskierten Zeile (Offsets bleiben erhalten), damit `[[Beispiel]]` in
    // Inline-Code keinen Backlink erzeugt. Maskierungs-Logik liegt seit 4T-0344
    // in der gemeinsamen Quelle (link-scan.js).
    const lineForLinks = maskInlineCode(line);
    // B-08 (4T-0175): Wiki-Link-Spannen vor dem Tag-Scan maskieren, damit
    // [[#Heading]] bzw. [[Ziel#Anker]] nicht als Tag indexiert wird.
    // 4T-0202: ebenso {...}-Attribut-Bloecke (markdown-it-attrs) — '#id'
    // darin ist eine ID-Angabe, kein Tag (Konsistenz zum
    // insideAttrBlock-Guard im tagsPlugin).
    const lineForTags = lineForLinks
      .replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length))
      .replace(/\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
    TAG_RE.lastIndex = 0;
    let tagMatch;
    while ((tagMatch = TAG_RE.exec(lineForTags)) !== null) {
      const tag = tagMatch[1];
      // 4T-0060: Hex-Codes, reine Zahlen und Slash-Randlagen filtern.
      if (isValidTag(tag)) {
        tagsSet.add(tag);
      }
    }

    // Wiki-Links
    WIKI_LINK_RE.lastIndex = 0;
    let m;
    while ((m = WIKI_LINK_RE.exec(lineForLinks)) !== null) {
      // B-09 (4T-0175): escapte Pipe in Tabellen-Zellen ([[Ziel\|Label]])
      // laesst das Capture mit '\' enden — abschneiden wie im preload.
      const target = m[1].trim().replace(/\\$/, '');
      if (!target) continue;
      // Anker im Wiki-Link: [[Foo#anker]] -> ziel=Foo, anker=anker.
      // Auch [[#Anker]] (reiner Anker im selben Doc) wird erkannt, aber
      // als ausgehender Backlink uebersprungen — ein interner Anker ist
      // kein Verweis auf eine andere Datei.
      let anker = null;
      let ziel = target;
      const hashIdx = target.indexOf('#');
      if (hashIdx >= 0) {
        anker = target.slice(hashIdx + 1).trim() || null;
        ziel = target.slice(0, hashIdx).trim();
      }
      if (!ziel) continue; // 4T-0054: reiner Anker — kein externer Backlink
      // 4T-0336 (Epic 3E-0061): relative Unterseiten-Ziele ('/Name', '..')
      // gegen den eigenen Basename expandieren — der Index traegt dann die
      // aufgeloeste U+2215-Form, damit Backlinks auf Unterseiten entstehen.
      if (isRelativeTarget(ziel)) {
        const ownBase = path.basename(filePath).replace(MD_EXT_RE, '');
        const expanded = expandRelativeTarget(ownBase, ziel);
        if (!expanded) continue; // '..' auf Top-Level — kein aufloesbares Ziel
        ziel = expanded;
      }
      out.push({
        zeile: lineNum,
        linkTyp: 'wiki',
        zielBasename: ziel,
        zielAbsolut: null,
        anker,
        snippet: shortSnippet(line),
      });
    }
    // Markdown-Links
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(lineForLinks)) !== null) {
      // 4T-0476 (Epic 3E-0088): Ziel/Anker über den Form-Helfer lesen — die
      // Regex erfasst seit 4T-0476 auch die <…>-Form mit Leerzeichen im Ziel.
      const { target: linkTarget, anchor: anker } = mdLinkTargetFromMatch(m);
      // Externe Links rausfiltern, falls Regex doch mal greift.
      if (/^[a-z]+:\/\//i.test(linkTarget) || linkTarget.startsWith('//')) continue;
      // B-05 (4T-0175): %-kodierte Ziele ([Text](Mein%20Ziel.md)) wie der
      // Klick-Pfad dekodieren, sonst entstehen fuer sie nie Backlinks.
      // Bei ungueltiger Kodierung unkodiert weiterverarbeiten.
      let decodedTarget = linkTarget;
      try {
        decodedTarget = decodeURI(linkTarget);
      } catch {
        /* unkodiert */
      }
      let absolute;
      try {
        absolute = path.resolve(dir, decodedTarget);
      } catch {
        continue;
      }
      out.push({
        zeile: lineNum,
        linkTyp: 'md',
        zielBasename: null,
        zielAbsolut: absolute,
        anker,
        snippet: shortSnippet(line),
      });
    }
  }
  return { hits: out, aliases, headings, blockIds, tags: [...tagsSet], properties, tasks };
}

// 4T-0502 (Epic 3E-0096): schnelle Kandidaten-Vorpruefung fuer Task-Zeilen
// (Aufzaehlungszeichen plus '['), bevor der volle Marker-Kern-Parse laeuft.
const TASK_CANDIDATE_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[/;

// 4T-0050: Normalisiert das aliases-Feld eines Frontmatter-Objekts zu einer
// Array<string>-Liste. Akzeptierte YAML-Formen:
//   aliases: MV                    -> ['MV']
//   aliases: [MV, Viewer]          -> ['MV', 'Viewer']
//   aliases:
//     - MV
//     - Viewer                     -> ['MV', 'Viewer']
// Einzelne Werte werden getrimmt; leere Strings, null/undefined und Nicht-
// Strings ausgefiltert.
function normalizeAliases(raw) {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    const v = raw.trim();
    return v ? [v] : [];
  }
  if (Array.isArray(raw)) {
    const out = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const v = item.trim();
        if (v) out.push(v);
      }
    }
    return out;
  }
  return [];
}

// 4T-0354 (Epic 3E-0065): Frontmatter-Properties für die Abfrage extrahieren.
// Ergebnis ist ein Objekt mit klein-normalisierten Schlüsseln auf Skalar-Strings
// bzw. String-Listen. Nicht-Skalare (verschachtelte Objekte) sowie leere und
// null-Werte sind in v1 nicht abfragbar und werden weggelassen.
function extractProperties(fm) {
  const out = {};
  for (const key of Object.keys(fm)) {
    const val = normalizePropertyValue(fm[key]);
    if (val === null) continue;
    out[key.toLowerCase()] = val;
  }
  return out;
}

// Normalisiert einen einzelnen Frontmatter-Wert: Skalar -> getrimmter String,
// Liste -> Array getrimmter Strings (leere Elemente raus); Objekte, null und
// leere Werte -> null (nicht abfragbar).
function normalizePropertyValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const v = raw.trim();
    return v ? v : null;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    const out = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const v = item.trim();
        if (v) out.push(v);
      } else if (typeof item === 'number' || typeof item === 'boolean') {
        out.push(String(item));
      }
      // Verschachtelte Objekte in Listen: übersprungen (v1 nicht abfragbar).
    }
    return out.length ? out : null;
  }
  return null;
}

function shortSnippet(line) {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= SNIPPET_MAX) return trimmed;
  return trimmed.slice(0, SNIPPET_MAX - 1) + '…';
}

// --- 4T-0408 (Epic 3E-0077): Block-Daten aus der .mdd-Begleitdatei ------------
// Datengrundlage der Block-Abfrage: die blockData-Sektion der .mdd wird beim
// Index-Aufbau pro Markdown-Datei mitgelesen (die .mdd liegt ausserhalb des
// Markdown-Watchers; Aenderungen ueber das Panel invalidieren per
// updateBlockDataForFile, siehe unten). Bewusst NICHT in Area_Cache.mdda
// persistiert: der komplette Zusatz-Pass kostet auch im pessimistischen
// Szenario (2000 Dateien, 300 .mdd a 100 KB) nur ~0,36 s einmalig pro
// Index-Aufbau (Messung 4T-0408); eine Cache-Aufnahme braeuchte dagegen
// eigene .mdd-mtime-Verfolgung plus Schema-Bump. Fehler-Isolation: eine
// defekte .mdd setzt nur die Block-Ebene dieser Datei aus (null), nie den
// uebrigen Index.

// Begleitdatei zum Dokument: gleicher Basisname, Endung .mdd (dieselbe
// Konvention wie mddPathFor in main.js; mdd-store bleibt bewusst path-frei).
function mddCompanionPath(mdPath) {
  const parsed = path.parse(mdPath);
  return path.join(parsed.dir, `${parsed.name}.mdd`);
}

// Normalisiert die rohe Anker-Map (Form von getAllBlockData) zur Index-Form:
// Array [{ anchor, values, updatedMs }], alphabetisch nach Anker (determinis-
// tische Basis-Ordnung der Treffer). Schluessel lowercase wie die Frontmatter-
// Properties (extractProperties); Werte typ-erhaltend (string/number/boolean,
// String-Listen), leere Strings und leere Listen entfallen wie dort.
function normalizeBlockEntries(rawMap) {
  const out = [];
  if (!rawMap || typeof rawMap !== 'object') return out;
  for (const id of Object.keys(rawMap)) {
    const entry = rawMap[id];
    if (!entry || typeof entry.values !== 'object' || entry.values === null) continue;
    const values = {};
    for (const key of Object.keys(entry.values)) {
      const v = entry.values[key];
      if (typeof v === 'string') {
        const t = v.trim();
        if (t) values[key.toLowerCase()] = t;
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        values[key.toLowerCase()] = v;
      } else if (Array.isArray(v)) {
        const arr = v
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean);
        if (arr.length) values[key.toLowerCase()] = arr;
      }
    }
    // updated ist UTC ISO-8601 mit 'Z' (Zeitstempel-Konvention) — Date.parse
    // statt parseIsoLocalMs, damit die Zone korrekt eingeht.
    const updatedMs = typeof entry.updated === 'string' ? Date.parse(entry.updated) : NaN;
    out.push({ anchor: id, values, updatedMs: Number.isFinite(updatedMs) ? updatedMs : null });
  }
  out.sort((a, b) => a.anchor.localeCompare(b.anchor));
  return out;
}

// Extrahiert die Block-Eintraege aus dem rohen .mdd-Inhalt. Die Substring-
// Vorpruefung erspart den JSON.parse grosser History-Container ohne blockData-
// Sektion (der haeufigste .mdd-Fall). null = keine Block-Daten (fehlende oder
// defekte Sektion/Datei).
function extractBlockEntries(raw) {
  if (typeof raw !== 'string' || !raw.includes('"blockData"')) return null;
  const parsed = parseContainer(raw);
  if (!parsed.ok) return null;
  const entries = normalizeBlockEntries(getAllBlockData(parsed.container));
  return entries.length > 0 ? entries : null;
}

// Async-Variante fuer den Initial-Aufbau (kein Sync-IO im Main-Loop).
async function readBlockDataAsync(mdPath) {
  let raw;
  try {
    raw = await fs.promises.readFile(mddCompanionPath(mdPath), 'utf8');
  } catch {
    return null; // keine .mdd (ENOENT) oder nicht lesbar
  }
  return extractBlockEntries(raw);
}

// Sync-Variante fuer den Watcher-Pfad (parseFile dort ist ebenfalls sync).
function readBlockDataSync(mdPath) {
  let raw;
  try {
    raw = fs.readFileSync(mddCompanionPath(mdPath), 'utf8');
  } catch {
    return null;
  }
  return extractBlockEntries(raw);
}

// Invalidierungs-Pfad der Block-Ebene: main.js ruft dies nach jeder blockData-
// Mutation auf (derselbe Schreibvorgang, der 'blockData:changed' broadcastet).
// rawBlockData ist die frische Anker-Map aus getAllBlockData; alle Wurzeln, die
// die Datei indexieren, ziehen nach und melden sich ueber den regulaeren
// 'backlinks:invalidated'-Broadcast (debounced), worauf die sichtbaren
// Abfrage-Container neu befuellen.
function updateBlockDataForFile(filePath, rawBlockData) {
  if (!filePath) return;
  let absolute;
  try {
    absolute = path.resolve(filePath);
  } catch {
    return;
  }
  const entries = normalizeBlockEntries(rawBlockData);
  for (const entry of indexes.values()) {
    if (!entry.files.has(absolute)) continue;
    if (entries.length > 0) entry.blockDataPerFile.set(absolute, entries);
    else entry.blockDataPerFile.delete(absolute);
    scheduleInvalidate(entry);
  }
}

// Liefert die Wurzel zur aktiven Datei.
function rootFor(filePath) {
  if (!filePath) return null;
  try {
    return path.dirname(path.resolve(filePath));
  } catch {
    return null;
  }
}

// 4T-0347 (Epic 3E-0062): Index-Wurzel bereichsbewusst bestimmen. Fuer Dateien
// innerhalb einer Bereichs-Applikation ist die Wurzel der Bereichs-Wurzelordner
// (voller Bereichs-Baum, keine Tiefen-Grenze, keine Caps); ohne Bereich bleibt
// es bei rootFor (Ordner der Datei plus SCAN_DEPTH, mit Caps). areaRoot liefert
// der IPC-Handler aus der App-Registry (areaOfWindow); null/leere Werte fallen
// auf das bisherige Ordner-Verhalten zurueck. isArea steuert Tiefe und Cap-
// Verhalten des Index-Eintrags.
function resolveRootInfo(filePath, areaRoot) {
  if (areaRoot && filePath && isInsideArea(areaRoot, filePath)) {
    return { root: path.resolve(areaRoot), isArea: true };
  }
  return { root: rootFor(filePath), isArea: false };
}

// Stellt sicher, dass fuer eine Wurzel ein Index existiert. Beim ersten
// Aufruf wird er asynchron aufgebaut und der Watcher gestartet. Folgeaufrufe
// liefern den existierenden Eintrag.
// B-01/R3-01 (4T-0175): Owner-Modell statt blindem Refcount. Referenzen
// werden pro Owner-Key (webContents-ID + Pane) als Set gefuehrt; wiederholte
// Requests desselben Owners fuer dieselbe Wurzel zaehlen nicht erneut.
// Vorher liefen request/release asymmetrisch (Request bei jedem Editor-Sync
// und jedem Invalidate, Release nur beim Datei-Wechsel) — der Zaehler wuchs
// unbegrenzt und das Teardown lief nie.
function ensureIndex(rootPath, ownerKey, isArea) {
  let entry = indexes.get(rootPath);
  if (entry) {
    if (ownerKey) entry.ownerKeys.add(ownerKey);
    if (entry.softTimer) {
      clearTimeout(entry.softTimer);
      entry.softTimer = null;
    }
    // 4T-0347 (Epic 3E-0062): Upgrade bereichslos -> Bereich. Wird eine
    // bestehende Wurzel als Bereichs-Wurzel angefragt (dieselbe Datei zugleich
    // in einer Bereichs-App und einer bereichslosen App, Datei direkt im
    // Wurzelordner), muss der Index auf den vollen Bereichs-Baum umgestellt
    // werden — sonst saehe die Bereichs-App einen tiefenbegrenzten Index.
    // Rebuild wie beim Watcher-Fehler (Owner uebernehmen). Der umgekehrte Fall
    // (bestehende Bereichs-Wurzel, bereichslose Anfrage) bleibt: mehr Suchraum
    // ist harmlos, kein Downgrade.
    if (isArea && !entry.isArea) {
      const owners = new Set(entry.ownerKeys);
      teardownIndex(rootPath, { force: true });
      let fresh = null;
      for (const key of owners) {
        fresh = ensureIndex(rootPath, key, true);
      }
      return fresh || ensureIndex(rootPath, ownerKey, true);
    }
    // B-21 (4T-0187): Nach einem Watcher-Fehler bleibt der Eintrag im
    // 'error'-Status liegen (kein Sofort-Rebuild, kein Schleifen-Risiko);
    // erst nach Ablauf des Backoffs stoesst der naechste Bedarf einen
    // frischen Aufbau an.
    if (entry.status === 'error' && Date.now() >= (entry.errorUntil || 0)) {
      const owners = new Set(entry.ownerKeys);
      teardownIndex(rootPath, { force: true });
      let fresh = null;
      for (const key of owners) {
        fresh = ensureIndex(rootPath, key, isArea);
      }
      return fresh || ensureIndex(rootPath, ownerKey, isArea);
    }
    return entry;
  }
  entry = {
    wurzel: rootPath,
    // 4T-0347 (Epic 3E-0062): true = Bereichs-Wurzel (voller Baum, keine
    // Tiefen-Grenze, keine Caps); false = Ordner-Wurzel mit SCAN_DEPTH und Caps.
    isArea: !!isArea,
    status: 'indexing',
    files: new Map(),
    // 4T-0050: Aliases pro Datei (Original-Casing aus dem YAML) plus inverse
    // Map alias-lowercase -> Set von Datei-Pfaden. Inverse Map fuer schnelles
    // Lookup beim Wiki-Link-Klick und im Linter.
    aliasesPerFile: new Map(),
    aliasMap: new Map(),
    // 4T-0054: Heading-Slugs und Block-IDs pro Datei fuer Anker-Pruefung
    // im Linter. Sets fuer O(1)-Lookup.
    //   anchorsPerFile: Map<absPath, { headings: Set<slug>, blockIds: Set<id> }>
    anchorsPerFile: new Map(),
    // 4T-0056: Tags pro Datei (Inline + Frontmatter) plus inverse Map fuer
    // O(1)-Lookup beim Filtern. tagsPerFile speichert Original-Casing,
    // tagMap-Schluessel ist Lowercase fuer case-insensitive Filter.
    //   tagsPerFile: Map<absPath, string[]>
    //   tagMap:      Map<tagLower, Set<absPath>>
    tagsPerFile: new Map(),
    tagMap: new Map(),
    // B-16 (4T-0181): Display-Casing pro Tag-Key (erstes gesehenes Casing).
    tagDisplay: new Map(),
    // 4T-0354 (Epic 3E-0065): Frontmatter-Properties pro Datei für die Abfrage-
    // Auswertung. Objekt mit lowercase-Schlüsseln -> String bzw. String-Liste
    // (Nicht-Skalare und leere Werte weggelassen). Vorwärts-Map; der Evaluator
    // läuft pro Datei gegen diese Map (bewusst keine inverse Wert-Map).
    //   propertiesPerFile: Map<absPath, { [keyLower]: string | string[] }>
    propertiesPerFile: new Map(),
    // 4T-0408 (Epic 3E-0077): Block-Daten pro Datei aus der blockData-Sektion
    // der .mdd-Begleitdatei (nur Dateien mit Eintraegen). Grundlage des
    // BLOCKS-Scopes der Abfrage; Pflege ueber Index-Aufbau, Watcher-Pfad und
    // updateBlockDataForFile (blockData:changed-Mutationen aus main.js).
    //   blockDataPerFile: Map<absPath, Array<{ anchor, values, updatedMs }>>
    blockDataPerFile: new Map(),
    // 4T-0502 (Epic 3E-0096): Task-Zeilen pro Datei fuer den TASKS-Scope
    // (nur Dateien mit Eintraegen). Roh-Zeilen; Modell-Parsing im Query-Zweig.
    //   tasksPerFile: Map<absPath, Array<{ zeile, text, heading }>>
    tasksPerFile: new Map(),
    // B-15 (4T-0181): inverse Namens-Map basenameKeyLower -> Set<Pfad>
    // fuer O(1)-Wiki-Aufloesung (traegt die B-04-Normalisierung strukturell).
    nameMap: new Map(),
    // B-19 (4T-0181): Groesse pro Datei fuer die inkrementelle Cap-Pruefung.
    fileSizes: new Map(),
    // 4T-0402 (Epic 3E-0076): Datei-Zeiten pro Datei fuer die impliziten
    // Abfrage-Felder file.ctime/file.mtime (Epoch-ms aus dem ohnehin
    // erhobenen stat; ctime = birthtime mit ctime-Fallback).
    //   fileStats: Map<absPath, { ctimeMs, mtimeMs }>
    fileStats: new Map(),
    // 4T-0402 (Epic 3E-0076): Link-Graph-Cache fuer file.inlinks/file.outlinks
    // und FROM-Link-Quellen: { outMap, inMap } (Map<absPath, absPath[]>),
    // lazy beim ersten Bedarf gebaut, bei jeder Index-Aenderung invalidiert.
    linkGraph: null,
    // 4T-0348 (Epic 3E-0062): Cache-Metadaten pro Datei (mtimeMs, size, hash)
    // fuer den Warmstart-Abgleich; nur bei Bereichs-Wurzeln gefuellt. Das
    // Parse-Ergebnis selbst wird beim Schreiben aus den Index-Maps rekonstruiert
    // (keine doppelte Haltung). cachePath/cacheWriteTimer steuern das debouncede
    // Schreiben von Area_Cache.mdda.
    cacheFiles: new Map(),
    cachePath: null,
    cacheWriteTimer: null,
    fileCount: 0,
    byteSize: 0,
    watcher: null,
    // B-01 (4T-0175): Owner-Keys statt Zaehler (Set dedupliziert).
    ownerKeys: new Set(ownerKey ? [ownerKey] : []),
    softTimer: null,
    invalidateTimer: null,
  };
  indexes.set(rootPath, entry);

  // B-14 (4T-0181): Aufbau asynchron starten, NICHT awaiten. Der IPC-
  // Handler liefert sofort 'indexing'; das fertige Ergebnis meldet sich
  // ueber den bestehenden 'backlinks:invalidated'-Broadcast.
  buildIndexAsync(rootPath, entry).catch((err) => {
    console.warn('Backlinks-Index-Aufbau fehlgeschlagen:', err);
    if (indexes.get(rootPath) === entry) teardownIndex(rootPath, { force: true });
    // W-08 (4T-0309): wartende Panels aus dem 'indexing'-Stand loesen. Ohne
    // Broadcast blieben sie bis zum naechsten eigenen Request haengen
    // (Muster wie beim Watcher-Fehler oben).
    if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: rootPath });
  });
  return entry;
}

// B-14 (4T-0181): asynchroner Initial-Aufbau mit Batch-Yielding. Bricht
// still ab, wenn der Eintrag zwischenzeitlich abgebaut wurde (Teardown
// waehrend des Aufbaus).
async function buildIndexAsync(rootPath, entry) {
  const stillCurrent = () => indexes.get(rootPath) === entry;

  const scan = await collectMarkdownFiles(rootPath, entry.isArea);
  if (!stillCurrent()) return;
  entry.fileCount = scan.fileCount;
  entry.byteSize = scan.byteSize;
  // B-22 (4T-0187): Anzahl unlesbarer Ordner fuer den Panel-Hinweis.
  entry.skippedDirs = scan.skippedDirs || 0;
  if (scan.oversized) {
    entry.status = 'oversized';
    if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: rootPath });
    return;
  }

  // 4T-0348 (Epic 3E-0062): Warmstart-Abgleich fuer Bereichs-Wurzeln. Die
  // Cache-Datei liefert das Parse-Ergebnis unveraenderter Dateien (mtime+size
  // stimmen ueberein); nur geaenderte oder neue Dateien werden gelesen/geparst.
  let cache = null;
  if (entry.isArea) {
    entry.cachePath = path.join(rootPath, MDDA_CACHE_FILENAME);
    cache = await loadAreaCache(entry.cachePath, rootPath);
    if (!stillCurrent()) return;
  }

  // Initial-Parse aller Dateien (Batch-Yield alle BUILD_BATCH_SIZE).
  let sinceYield = 0;
  for (const f of scan.files) {
    const size = scan.sizes.get(f) || 0;
    const mtimeMs = scan.mtimes.get(f) || 0;
    let parsed = null;
    let hash = '';
    if (cache) {
      const cached = cache.get(cacheRelPath(f, rootPath));
      if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
        parsed = cached.parsed;
        hash = cached.hash;
      }
    }
    if (!parsed) {
      const res = await parseFileAsync(f);
      if (!stillCurrent()) return;
      if (res) {
        parsed = res;
        hash = res.hash || '';
      }
    }
    entry.fileSizes.set(f, size);
    // 4T-0402 (Epic 3E-0076): Datei-Zeiten fuer file.ctime/file.mtime.
    entry.fileStats.set(f, { ctimeMs: scan.ctimes.get(f) || 0, mtimeMs });
    if (parsed) applyParsedFile(entry, f, parsed);
    if (entry.isArea) entry.cacheFiles.set(f, { mtimeMs, size, hash });
    // 4T-0408 (Epic 3E-0077): Block-Daten der .mdd mitlesen — auch bei Cache-
    // Treffern, denn die blockData-Sektion ist bewusst nicht Teil des Caches
    // (Begruendung am Block-Daten-Abschnitt oben).
    const blocks = await readBlockDataAsync(f);
    if (!stillCurrent()) return;
    if (blocks) entry.blockDataPerFile.set(f, blocks);
    if (++sinceYield >= BUILD_BATCH_SIZE) {
      sinceYield = 0;
      await new Promise((resolve) => setImmediate(resolve));
      if (!stillCurrent()) return;
    }
  }
  entry.status = 'ready';

  // Watcher starten. ignoreInitial: true, weil wir gerade selbst geparst
  // haben. Markdown-Filter via ignored-Funktion.
  entry.watcher = chokidar.watch(rootPath, {
    // 4T-0347 (Epic 3E-0062): Bereichs-Wurzeln ohne Tiefen-Grenze (chokidar
    // depth: undefined = unbegrenzt).
    depth: entry.isArea ? undefined : SCAN_DEPTH,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    // B-12 (4T-0175): Symlink-/Junction-Verzeichnissen nicht folgen — der
    // Initial-Scan (readdir mit Dirents) folgt ihnen auch nicht.
    followSymlinks: false,
    ignored: (p) => {
      // B-03 (4T-0175): gleiche Ignore-Regel wie der Initial-Scan
      // (node_modules und alle Punkt-Ordner, nicht nur .git*).
      const base = path.basename(p);
      try {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) return isIgnoredDirName(base);
      } catch {
        return false;
      }
      if (isIgnoredDirName(base)) return true;
      return !MD_EXT_RE.test(base);
    },
  });
  entry.watcher.on('add', (p) => onWatcherChange(entry, p, 'add'));
  entry.watcher.on('change', (p) => onWatcherChange(entry, p, 'change'));
  entry.watcher.on('unlink', (p) => onWatcherChange(entry, p, 'unlink'));
  entry.watcher.on('error', (err) => {
    // B-21 (4T-0187): Fehler-Status mit Backoff statt Force-Teardown mit
    // Sofort-Rebuild — ein dauerhaft kaputter Watcher (z.B. geloeschtes
    // Netzlaufwerk) loeste sonst eine Scan-Schleife aus. Die Panels
    // zeigen den 'error'-Status; nach Ablauf des Backoffs baut der
    // naechste Bedarf neu auf (ensureIndex).
    console.warn('Backlinks-Watcher-Fehler:', rootPath, err && err.message);
    try {
      if (entry.watcher) entry.watcher.close();
    } catch {
      /* ignore */
    }
    entry.watcher = null;
    entry.status = 'error';
    entry.errorUntil = Date.now() + WATCHER_ERROR_BACKOFF_MS;
    if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: rootPath });
  });

  // 4T-0348 (Epic 3E-0062): den nach dem Warmstart aktualisierten Stand (neue,
  // geaenderte oder entfernte Dateien) persistieren. Debounced, damit schnelle
  // Re-Opens nicht mehrfach schreiben.
  if (entry.isArea) scheduleCacheWrite(entry);

  // Fertig-Meldung: Konsumenten (Panel, Tags, Autocomplete, Linter) fragen
  // daraufhin neu an und sehen den 'ready'-Stand.
  if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: rootPath });
}

// Gemeinsames Eintragen eines Parse-Ergebnisses in alle Index-Maps
// (Initial-Aufbau und Watcher-Add/-Change nutzen denselben Pfad).
function applyParsedFile(entry, filePath, parsed) {
  entry.files.set(filePath, parsed.hits);
  addToNameMap(entry, filePath);
  if (parsed.aliases.length > 0) {
    entry.aliasesPerFile.set(filePath, parsed.aliases);
    addToAliasMap(entry, filePath, parsed.aliases);
  }
  // 4T-0054: Headings und Block-IDs pro Datei speichern.
  if (parsed.headings.length > 0 || parsed.blockIds.length > 0) {
    entry.anchorsPerFile.set(filePath, {
      headings: new Set(parsed.headings),
      blockIds: new Set(parsed.blockIds),
    });
  }
  // 4T-0056: Tags pro Datei speichern und in die inverse Map eintragen.
  if (parsed.tags && parsed.tags.length > 0) {
    entry.tagsPerFile.set(filePath, parsed.tags);
    addToTagMap(entry, filePath, parsed.tags);
  }
  // 4T-0354 (Epic 3E-0065): abfragbare Frontmatter-Properties pro Datei ablegen.
  if (parsed.properties && Object.keys(parsed.properties).length > 0) {
    entry.propertiesPerFile.set(filePath, parsed.properties);
  }
  // 4T-0502 (Epic 3E-0096): Task-Zeilen pro Datei ablegen.
  if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
    entry.tasksPerFile.set(filePath, parsed.tasks);
  }
  // 4T-0402 (Epic 3E-0076): geaenderte Links machen den Link-Graphen ungueltig.
  entry.linkGraph = null;
}

// B-15 (4T-0181): Pflege der inversen Namens-Map.
function nameKeyForFile(filePath) {
  return normalizeNameKey(path.basename(filePath).replace(MD_EXT_RE, ''));
}

function addToNameMap(entry, filePath) {
  const key = nameKeyForFile(filePath);
  if (!key) return;
  let set = entry.nameMap.get(key);
  if (!set) {
    set = new Set();
    entry.nameMap.set(key, set);
  }
  set.add(filePath);
}

function removeFromNameMap(entry, filePath) {
  const key = nameKeyForFile(filePath);
  const set = entry.nameMap.get(key);
  if (!set) return;
  set.delete(filePath);
  if (set.size === 0) entry.nameMap.delete(key);
}

// Entfernt eine Datei vollstaendig aus allen Index-Maps.
function removeFileFromIndex(entry, filePath) {
  entry.files.delete(filePath);
  removeFromNameMap(entry, filePath);
  const prevAliases = entry.aliasesPerFile.get(filePath);
  if (prevAliases) {
    removeFromAliasMap(entry, filePath, prevAliases);
    entry.aliasesPerFile.delete(filePath);
  }
  entry.anchorsPerFile.delete(filePath);
  const prevTags = entry.tagsPerFile.get(filePath);
  if (prevTags) {
    removeFromTagMap(entry, filePath, prevTags);
    entry.tagsPerFile.delete(filePath);
  }
  // 4T-0354 (Epic 3E-0065): Properties-Eintrag der Datei mit entfernen.
  entry.propertiesPerFile.delete(filePath);
  // 4T-0408 (Epic 3E-0077): Block-Daten der Datei mit entfernen.
  entry.blockDataPerFile.delete(filePath);
  // 4T-0502 (Epic 3E-0096): Task-Zeilen der Datei mit entfernen.
  entry.tasksPerFile.delete(filePath);
  entry.byteSize -= entry.fileSizes.get(filePath) || 0;
  entry.fileSizes.delete(filePath);
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten und Link-Graph mit austragen.
  entry.fileStats.delete(filePath);
  entry.linkGraph = null;
  entry.fileCount = entry.files.size;
}

function onWatcherChange(entry, filePath, kind) {
  if (!MD_EXT_RE.test(filePath)) return;
  if (kind === 'unlink') {
    if (entry.files.has(filePath)) {
      removeFileFromIndex(entry, filePath);
      // 4T-0348 (Epic 3E-0062): Cache-Eintrag mit entfernen.
      if (entry.isArea) {
        entry.cacheFiles.delete(filePath);
        scheduleCacheWrite(entry);
      }
      scheduleInvalidate(entry);
    }
    return;
  }
  // add oder change
  // B-19 (4T-0181): Caps gelten auch fuer nachtraegliches Wachstum. Bei
  // Ueberschreiten wird die Wurzel oversized (Daten geleert, Watcher zu,
  // Broadcast); nach Teardown ueber das Owner-Modell ist ein frischer
  // Re-Scan moeglich.
  let size = 0;
  let mtimeMs = 0;
  let ctimeMs = 0;
  try {
    const st = fs.statSync(filePath);
    size = st.size;
    mtimeMs = st.mtimeMs;
    // 4T-0402 (Epic 3E-0076): birthtime = Anlage-Zeit, ctime-Fallback.
    ctimeMs = st.birthtimeMs || st.ctimeMs;
  } catch {
    /* unlink folgt */
  }
  const prevSize = entry.fileSizes.get(filePath) || 0;
  const newCount = entry.files.has(filePath) ? entry.fileCount : entry.fileCount + 1;
  const newBytes = entry.byteSize - prevSize + size;
  // 4T-0347 (Epic 3E-0062): nachtraeglicher Cap-Check nur fuer bereichslose
  // Wurzeln; Bereichs-Wurzeln kennen keinen oversized-Status.
  if (!entry.isArea && (newCount > MAX_FILES || newBytes > MAX_BYTES)) {
    markOversized(entry);
    return;
  }
  const parsed = parseFile(filePath);
  // B-11 (4T-0175): Lesefehler (Datei kurz gesperrt/gerade geloescht)
  // ueberschreibt die bestehenden Index-Daten nicht mit einem Leer-
  // Ergebnis; der naechste Event bzw. unlink raeumt regulaer auf.
  if (!parsed) return;
  // Alte Eintraege der Datei austragen, dann den neuen Stand eintragen
  // (gemeinsamer applyParsedFile-Pfad mit dem Initial-Aufbau).
  if (entry.files.has(filePath)) removeFileFromIndex(entry, filePath);
  entry.fileSizes.set(filePath, size);
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten fuer file.ctime/file.mtime nachziehen.
  entry.fileStats.set(filePath, { ctimeMs, mtimeMs });
  entry.byteSize += size;
  applyParsedFile(entry, filePath, parsed);
  // 4T-0408 (Epic 3E-0077): Block-Daten der .mdd nachziehen (removeFileFromIndex
  // hat den alten Stand mit ausgetragen); sync wie parseFile in diesem Pfad.
  const blocks = readBlockDataSync(filePath);
  if (blocks) entry.blockDataPerFile.set(filePath, blocks);
  entry.fileCount = entry.files.size;
  // 4T-0348 (Epic 3E-0062): Cache-Metadaten mitpflegen und Schreiben planen.
  if (entry.isArea) {
    entry.cacheFiles.set(filePath, { mtimeMs, size, hash: parsed.hash || '' });
    scheduleCacheWrite(entry);
  }
  scheduleInvalidate(entry);
}

// B-19 (4T-0181): Wurzel nachtraeglich als oversized markieren.
function markOversized(entry) {
  entry.status = 'oversized';
  entry.files.clear();
  entry.nameMap.clear();
  entry.aliasesPerFile.clear();
  entry.aliasMap.clear();
  entry.anchorsPerFile.clear();
  entry.tagsPerFile.clear();
  entry.tagMap.clear();
  entry.tagDisplay.clear();
  entry.propertiesPerFile.clear();
  entry.blockDataPerFile.clear();
  entry.tasksPerFile.clear();
  entry.fileSizes.clear();
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten und Link-Graph mit leeren.
  entry.fileStats.clear();
  entry.linkGraph = null;
  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      /* ignore */
    }
    entry.watcher = null;
  }
  if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: entry.wurzel });
}

// 4T-0050: Helfer fuer die inverse Alias-Map. Schluessel ist Alias-Lowercase
// (case-insensitive Lookup), Werte sind Sets von Datei-Pfaden (mehrere
// Dateien koennen denselben Alias fuehren). Leere Sets werden geloescht,
// damit aliasMap.has() ein verlaesslicher Existenz-Check bleibt.
function addToAliasMap(entry, filePath, aliases) {
  for (const a of aliases) {
    const key = a.trim().toLowerCase();
    if (!key) continue;
    let set = entry.aliasMap.get(key);
    if (!set) {
      set = new Set();
      entry.aliasMap.set(key, set);
    }
    set.add(filePath);
  }
}

function removeFromAliasMap(entry, filePath, aliases) {
  for (const a of aliases) {
    const key = a.trim().toLowerCase();
    if (!key) continue;
    const set = entry.aliasMap.get(key);
    if (!set) continue;
    set.delete(filePath);
    if (set.size === 0) entry.aliasMap.delete(key);
  }
}

// 4T-0050: Liefert alle Dateien im Index, die den gegebenen Alias fuehren.
// Case-insensitive Lookup. Leeres Array bei keinem Treffer.
function filesByAlias(entry, alias) {
  if (!alias) return [];
  const set = entry.aliasMap.get(String(alias).trim().toLowerCase());
  if (!set) return [];
  return [...set];
}

// 4T-0056: Helfer fuer die inverse Tag-Map. Schluessel ist Tag-Lowercase
// (case-insensitive Lookup), Werte sind Sets von Datei-Pfaden. Identisches
// Pattern zur Alias-Map.
function addToTagMap(entry, filePath, tags) {
  for (const t of tags) {
    const key = String(t || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    let set = entry.tagMap.get(key);
    if (!set) {
      set = new Set();
      entry.tagMap.set(key, set);
    }
    set.add(filePath);
    // B-16 (4T-0181): Display-Casing beim ersten Vorkommen merken, statt
    // es spaeter pro Listen-Aufbau linear zu suchen.
    if (!entry.tagDisplay.has(key)) entry.tagDisplay.set(key, String(t).trim());
  }
}

// 4T-0950 (Befund E-03): Tag-Zuordnung aus einer Sicht ableiten, statt die im
// Index gepflegten Umkehr-Abbildungen zu lesen.
//
// Hintergrund: tagMap und tagDisplay bilden Tag -> Dateien ab und werden beim
// Indexieren fortgeschrieben. Die Puffer-Overlay-Schicht kann sie nicht
// mitpatchen, weil sie je Datei arbeitet und ein Overlay einen Tag auch
// ENTFERNEN kann — dafür müsste sie den Beitrag der Datei aus einer geteilten
// Menge herausrechnen. Diese Ableitung baut beide Abbildungen stattdessen aus
// tagsPerFile neu auf, das die Overlay-Sicht führt.
//
// Die Regeln des Index bleiben dabei erhalten: Schlüssel ist die getrimmte
// Kleinschreibung, und als Anzeige gilt das zuerst gesehene Casing.
function tagMapsAusSicht(sicht) {
  const tagMap = new Map();
  const tagDisplay = new Map();
  for (const [filePath, tags] of sicht.tagsPerFile) {
    for (const t of tags || []) {
      const key = String(t || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      let set = tagMap.get(key);
      if (!set) {
        set = new Set();
        tagMap.set(key, set);
      }
      set.add(filePath);
      if (!tagDisplay.has(key)) tagDisplay.set(key, String(t).trim());
    }
  }
  return { tagMap, tagDisplay };
}

function removeFromTagMap(entry, filePath, tags) {
  for (const t of tags) {
    const key = String(t || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const set = entry.tagMap.get(key);
    if (!set) continue;
    set.delete(filePath);
    if (set.size === 0) {
      entry.tagMap.delete(key);
      entry.tagDisplay.delete(key);
    }
  }
}

// 4T-0056: Liefert alle Tags der Wurzel sortiert nach Haeufigkeit
// (absteigend), bei Gleichstand alphabetisch. Tag-Casing: das erste
// gesehene Casing wird beibehalten (deterministisch durch Iteration der
// tagMap-Schluessel-Reihenfolge).
function getAllTagsWithCounts(entry) {
  if (!entry || !entry.tagMap) return [];
  const out = [];
  for (const [keyLower, set] of entry.tagMap) {
    // B-16 (4T-0181): Display-Casing kommt aus der beim Indexieren
    // gepflegten Map statt aus einer linearen Suche pro Tag.
    const displayTag = entry.tagDisplay.get(keyLower) || keyLower;
    out.push({ tag: displayTag, count: set.size });
  }
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag);
  });
  return out;
}

// 4T-0056: Liefert alle Dateien im Index, die den gegebenen Tag fuehren.
// Case-insensitive Lookup. Pfade alphabetisch sortiert fuer deterministische
// Anzeige in der Sidebar.
function filesForTag(entry, tag) {
  if (!tag) return [];
  const set = entry.tagMap.get(String(tag).trim().toLowerCase());
  if (!set) return [];
  return [...set].sort((a, b) => a.localeCompare(b));
}

// 4T-0057 (Epic 3E-0011): Autocomplete-Suggestions fuer Wiki-Link-Trigger
// `[[`. Liefert die Liste aller Datei-Basenames (ohne .md) und Aliases
// im aktiven Suchraum, je mit Hinweis-Detail (Verzeichnis bzw. Ziel-
// Datei). Renderer filtert clientseitig per Prefix und sortiert. Liefert
// alle Kandidaten ohne serverseitiges Limit; bei 2000 Dateien (Backlinks-
// Cap) bleibt die Liste handhabbar.
function wikiLinkAutocompleteSuggestions(activeFile, areaRoot) {
  if (!activeFile) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  const suggestions = [];
  const seenFiles = new Set();
  for (const f of entry.files.keys()) {
    // 4T-0337 (Epic 3E-0061): Unterseiten erscheinen in Slash-Schreibweise
    // (U+2215 im Basename -> '/'), so wie sie im Wiki-Link geschrieben werden.
    const base = toLogicalName(path.basename(f).replace(MD_EXT_RE, ''));
    const key = base.toLowerCase();
    if (seenFiles.has(key)) continue;
    seenFiles.add(key);
    suggestions.push({ name: base, kind: 'file', detail: path.dirname(f) });
  }
  for (const [aliasLower, fileSet] of entry.aliasMap) {
    let displayAlias = aliasLower;
    for (const filePath of fileSet) {
      const fileAliases = entry.aliasesPerFile.get(filePath) || [];
      const found = fileAliases.find((a) => String(a).toLowerCase() === aliasLower);
      if (found) {
        displayAlias = found;
        break;
      }
    }
    const firstFile = [...fileSet][0];
    const detail = firstFile ? toLogicalName(path.basename(firstFile).replace(MD_EXT_RE, '')) : '';
    suggestions.push({ name: displayAlias, kind: 'alias', detail });
  }
  return { status: 'ready', suggestions };
}

// 4T-0057: Heading-/Block-Anker-Suggestions fuer Wiki-Link-Anker-Trigger
// `[[Datei#` bzw. `[[Datei#^`. Loest den Basename ueber Datei-Namen und
// Aliases auf und sammelt die Union aller Anker der gefundenen Datei(en).
function anchorAutocompleteSuggestions(activeFile, basename, anchorType, areaRoot) {
  if (!activeFile || !basename) return { status: 'unavailable', suggestions: [] };
  if (anchorType !== 'heading' && anchorType !== 'block') {
    return { status: 'unavailable', suggestions: [] };
  }
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  // 4T-0337 (Epic 3E-0061): relative Unterseiten-Formen ('[[/Name#',
  // '[[..#') gegen die aktive Datei expandieren, damit auch dort Anker
  // vorgeschlagen werden.
  let lookupName = basename;
  if (isRelativeTarget(basename)) {
    const ownBase = path.basename(path.resolve(activeFile)).replace(MD_EXT_RE, '');
    const expanded = expandRelativeTarget(ownBase, basename);
    if (!expanded) return { status: 'ready', suggestions: [] };
    lookupName = expanded;
  }

  let candidates = resolveWikiLink(entry, lookupName);
  if (candidates.length === 0) {
    candidates = filesByAlias(entry, lookupName);
  }
  if (candidates.length === 0) return { status: 'ready', suggestions: [] };

  const seen = new Set();
  for (const candPath of candidates) {
    const meta = entry.anchorsPerFile.get(candPath);
    if (!meta) continue;
    const collection = anchorType === 'block' ? meta.blockIds : meta.headings;
    for (const a of collection) seen.add(a);
  }
  return { status: 'ready', suggestions: [...seen].sort((a, b) => a.localeCompare(b)) };
}

// 4T-0057: Tag-Autocomplete-Suggestions fuer den `#`-Trigger ausserhalb
// von Wiki-Link-Kontexten. Nutzt direkt getAllTagsWithCounts; sortiert
// also nach Haeufigkeit (absteigend) und alphabetisch.
function tagAutocompleteSuggestions(activeFile, areaRoot) {
  if (!activeFile) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };
  return { status: 'ready', suggestions: getAllTagsWithCounts(entry) };
}

// 4T-0056: High-level-API fuer Renderer. Liefert Tag-Liste mit Counts
// und ggf. Datei-Liste fuer einen ausgewaehlten Filter-Tag. Pattern
// analog zu backlinksFor: kein ensureIndex-Aufruf, nutzt nur vorhandenen
// Index.
function tagsFor(filePath, filterTag, areaRoot) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') {
    return { status: 'indexing', meta: { wurzel: root } };
  }
  // B-21 (4T-0187): Fehler-Status durchreichen.
  if (entry.status === 'error') {
    return { status: 'error', meta: { wurzel: root } };
  }
  // 4T-0950 (Befund E-03): Puffer-Overlay freigeschaltet. Ein gerade
  // getippter Tag erscheint damit in der Liste, ein gerade gelöschter
  // verschwindet, ohne dass gespeichert werden muss.
  const overlays = overlaysUnder(root);
  // Ohne Overlay bleibt es bei den im Index gepflegten Abbildungen; das ist
  // der häufige Fall und spart den Neuaufbau. (overlaysUnder liefert null,
  // wenn es nichts zu überlagern gibt.)
  const maps = overlays ? tagMapsAusSicht(entryWithOverlay(entry, overlays)) : entry;
  const tags = getAllTagsWithCounts(maps);
  const result = {
    status: 'ready',
    meta: { wurzel: root, fileCount: entry.fileCount, skippedDirs: entry.skippedDirs || 0 },
    tags,
  };
  if (filterTag) {
    result.filterTag = filterTag;
    result.files = filesForTag(maps, filterTag);
  }
  return result;
}

// 4T-0402 (Epic 3E-0076): Link-Graph der Wurzel (ausgehende und eingehende
// Links pro Datei, als absolute Pfade). Wiki-Ziele werden wie im Backlinks-
// Pfad aufgeloest (Namens-Map, Pfad-/Unterseiten-Form, Alias-Fallback);
// Markdown-Links zaehlen nur, wenn das Ziel im Index liegt (Best-Effort-
// Grenze des Suchraums, wie dokumentiert). Lazy gebaut und via
// entry.linkGraph gecacht; jede Index-Aenderung invalidiert (applyParsedFile/
// removeFileFromIndex), damit kein O(n)-Aufbau pro Abfrage-Lauf noetig ist.
function buildLinkGraph(entry) {
  const outMap = new Map(); // absPath -> absPath[] (dedupliziert)
  const inMap = new Map(); // absPath -> absPath[] (dedupliziert)
  for (const [src, hits] of entry.files) {
    const targets = new Map(); // lowercase -> Original-Pfad
    for (const h of hits) {
      let resolved = [];
      if (h.linkTyp === 'wiki' && h.zielBasename) {
        resolved = resolveWikiLink(entry, h.zielBasename);
        if (resolved.length === 0) resolved = filesByAlias(entry, h.zielBasename);
      } else if (h.linkTyp === 'md' && h.zielAbsolut && entry.files.has(h.zielAbsolut)) {
        resolved = [h.zielAbsolut];
      }
      for (const t of resolved) {
        if (t !== src) targets.set(t.toLowerCase(), t);
      }
    }
    outMap.set(src, [...targets.values()]);
  }
  for (const [src, outs] of outMap) {
    for (const t of outs) {
      let arr = inMap.get(t);
      if (!arr) {
        arr = [];
        inMap.set(t, arr);
      }
      arr.push(src);
    }
  }
  return { outMap, inMap };
}

// 4T-0402 (Epic 3E-0076): Aufloesung eines FROM-Link-Ziels ([[X]] bzw.
// outgoing([[X]])) zu einer Menge absoluter Pfade (lowercase, Vergleichs-
// Schluessel). Alias- und Anker-/Label-Teile werden wie beim Klick-Pfad
// abgeschnitten; pro Abfrage-Lauf memoisiert.
function createTargetResolver(entry) {
  const cache = new Map();
  return (targetText) => {
    const raw = String(targetText || '');
    if (cache.has(raw)) return cache.get(raw);
    let cleaned = raw.split('|')[0].split('#')[0].trim();
    cleaned = cleaned.replace(MD_EXT_RE, '');
    let resolved = cleaned ? resolveWikiLink(entry, cleaned) : [];
    if (resolved.length === 0 && cleaned) resolved = filesByAlias(entry, cleaned);
    const set = new Set(resolved.map((p) => p.toLowerCase()));
    cache.set(raw, set);
    return set;
  };
}

// Logischer Anzeige-Name einer Index-Datei (Unterseiten-Notation inklusive).
function logicalNameFor(absPath) {
  return toLogicalName(path.basename(absPath).replace(MD_EXT_RE, ''));
}

// 4T-0505 (Epic 3E-0096): Ordnung der Status-Typen fuer die Task-Default-
// Sortierung (Referenz-Muster: Laufendes zuerst, Erledigtes und Verworfenes
// ans Ende); unbekannte Zeichen ohne Typ ordnen sich hinter ON_HOLD ein.
const STATUS_TYPE_ORDER = {
  IN_PROGRESS: 0,
  TODO: 1,
  ON_HOLD: 2,
  DONE: 4,
  CANCELLED: 5,
  NON_TASK: 6,
};

function statusTypeRank(type) {
  const rank = STATUS_TYPE_ORDER[type];
  return rank === undefined ? 3 : rank;
}

// 4T-0505 (Epic 3E-0096): lokales ISO-Datum eines Zeitpunkts (Bezugstag des
// Dringlichkeits-Scores; dieselbe lokale Zeitachse wie date(today)).
function localIsoDateOf(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 4T-0505 (Epic 3E-0096): globale Task-Abfrage aus den Einstellungen —
// zugelassen sind nur FROM- und WHERE-Anteile (auch als Alt-Body bzw. mit
// fuehrendem LIST/LIST TASKS); alles andere (Spalten, SORT, LIMIT,
// Gruppierung, Layout) gehoert in den lokalen Fence und macht die globale
// Vorgabe ungueltig. Rueckgabe { where, source } oder { error: true }.
function parseGlobalTaskQuery(text) {
  const parsed = parseQuery(text);
  if (!parsed.ok) return { error: true };
  const ast = parsed.ast;
  if (
    ast.type !== 'list' ||
    (ast.scope !== 'files' && ast.scope !== 'tasks') ||
    ast.fields.length > 0 ||
    ast.sort.length > 0 ||
    ast.limit !== null ||
    ast.layoutColumns !== null ||
    ast.groupBy.length > 0 ||
    ast.hide.length > 0 ||
    ast.show.length > 0 ||
    ast.short
  ) {
    return { error: true };
  }
  if (validateQuery(ast)) return { error: true };
  return { where: ast.where || null, source: ast.source || null };
}

// 4T-0502 (Epic 3E-0096): Inline-Tags einer Task-Beschreibung fuer das
// tags-Feld des TASKS-Scopes. Dieselben Maskierungen und Gueltigkeits-
// Filter wie der Datei-Tag-Scan in parseContent (Inline-Code, Wiki-Links,
// Attribut-Bloecke), damit beide Ebenen dieselben Tags sehen.
function taskLineTags(description) {
  const masked = maskInlineCode(String(description || ''))
    .replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length))
    .replace(/\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
  const tags = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(masked)) !== null) {
    if (isValidTag(m[1]) && !tags.includes(m[1])) tags.push(m[1]);
  }
  return tags;
}

// Wurzel-relativer, portabler Pfad ('/', wie die Cache-Schluessel).
function relPortable(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

// --- Puffer-Overlay (4T-0935, Befund B-08) ---------------------------------------
// Zweite, ausdrueckliche Schicht ueber dem Index: je Datei-Pfad optional der
// Parse des GESCHRIEBENEN Stands aus dem Editor-Puffer. Die Platten-Schicht
// bleibt unangetastet daneben liegen; der Datei-Beobachter bleibt damit Herr
// ueber sie, und ein Overlay verschwindet erst mit Speichern, Verwerfen oder
// Schliessen.
//
// Die Schicht wirkt NICHT von selbst. Nur wer sie ausdruecklich anfordert,
// sieht sie — freigeschaltet sind in 4T-0935 die drei Verbraucher der
// gerenderten Ansicht (frontmatterQueryFor, scriptDataFor, eventsForQuery).
// Die uebrigen neun Index-Verbraucher (Backlinks, Tags, Graph, Autocomplete,
// Ziel-Aufloesung samt Linter, Embeds) sehen weiter den Platten-Stand; ob sie
// folgen sollen, erhebt 4T-0936 und entscheidet der Product Owner.
//
// Sie liegt bewusst im Hauptprozess und gilt damit fensteruebergreifend: Der
// gemeldete Fall hatte dieselbe Datei in zwei Fenstern offen. Melden zwei
// Fenster verschiedene Staende derselben Datei, gilt der zuletzt gemeldete —
// dieselbe Regel, die beim Speichern ohnehin greift.
// 4T-0948 (Befund E-01): Der Eintrag fuehrt neben dem Parse den ROH-TEXT, weil
// die Wiki-Einbettung ihren Anker am Text schneidet (extractEmbedSnippet). Die
// uebrigen Verbraucher sehen davon nichts: overlaysUnder reicht wie bisher
// allein den Parse weiter.
const bufferOverlays = new Map(); // absPath -> { parsed, text }

function setBufferOverlay(filePath, content) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (typeof content !== 'string') return false;
  bufferOverlays.set(filePath, { parsed: parseContent(filePath, content), text: content });
  return true;
}

function clearBufferOverlay(filePath) {
  return bufferOverlays.delete(filePath);
}

function clearAllBufferOverlays() {
  bufferOverlays.clear();
}

// Overlays unterhalb einer Wurzel. Leere Map = nichts zu ueberlagern; die
// Aufrufer geben dann den Original-Eintrag weiter und zahlen nichts.
function overlaysUnder(root) {
  if (bufferOverlays.size === 0) return null;
  const treffer = new Map();
  for (const [absPath, eintrag] of bufferOverlays) {
    if (isInsideArea(root, absPath)) treffer.set(absPath, eintrag.parsed);
  }
  return treffer.size > 0 ? treffer : null;
}

// 4T-0948 (Befund E-01): Roh-Text-Auskunft fuer Verbraucher, die den
// geschriebenen Stand als Text brauchen (Wiki-Einbettung). Ohne Bereichs-
// Filter, weil der Aufrufer den Ziel-Pfad bereits geprueft hat. Der zweite
// Anlauf ohne Ruecksicht auf Gross- und Kleinschreibung gilt nur unter
// Windows und faengt '![[quelle]]' gegen 'Quelle.md'; wo das Dateisystem die
// Schreibweise unterscheidet, waeren das zwei Dateien.
function bufferTextFor(absPath) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const genau = bufferOverlays.get(absPath);
  if (genau) return genau.text;
  if (process.platform !== 'win32') return null;
  const gesucht = absPath.toLowerCase();
  for (const [pfad, e] of bufferOverlays) if (pfad.toLowerCase() === gesucht) return e.text;
  return null;
}

// Map-artige Sicht: Werte des Patches gewinnen, Schluessel beider Seiten sind
// sichtbar. Bewusst kein Kopieren der Basis-Map — die Auswertungen laufen bei
// jedem Tastendruck (debounced) und ein Bereich kann tausende Dateien fuehren.
function overlayView(base, patch) {
  return {
    get: (k) => (patch.has(k) ? patch.get(k) : base.get(k)),
    has: (k) => patch.has(k) || base.has(k),
    get size() {
      let n = base.size;
      for (const k of patch.keys()) if (!base.has(k)) n++;
      return n;
    },
    *keys() {
      for (const k of base.keys()) yield k;
      for (const k of patch.keys()) if (!base.has(k)) yield k;
    },
    *[Symbol.iterator]() {
      for (const k of base.keys()) yield [k, patch.has(k) ? patch.get(k) : base.get(k)];
      for (const [k, v] of patch) if (!base.has(k)) yield [k, v];
    },
  };
}

// Eintrags-Sicht mit ueberlagerten Datei-Daten. Ueberlagert werden die
// Bestaende, die aus dem Datei-Text stammen; Datei-Groesse und Zeitstempel
// bleiben die der Platte, weil ein ungespeicherter Puffer keine hat (eine
// Abfrage ueber file.mtimeMs sieht also weiter den Speicher-Zeitpunkt).
// Ebenso bleibt der Link-Graph der der Platte: Er wird ueber alle Dateien
// gebaut und gecacht; ein FROM-Link-Bezug auf einen erst geschriebenen Link
// wirkt deshalb erst nach dem Speichern.
function entryWithOverlay(entry, overlays) {
  if (!overlays || overlays.size === 0) return entry;
  const patchOf = (feld, wandeln) => {
    const m = new Map();
    for (const [absPath, parsed] of overlays) m.set(absPath, wandeln(parsed));
    return overlayView(entry[feld], m);
  };
  return {
    ...entry,
    files: patchOf('files', (p) => p.hits),
    propertiesPerFile: patchOf('propertiesPerFile', (p) => p.properties || {}),
    tasksPerFile: patchOf('tasksPerFile', (p) => (Array.isArray(p.tasks) ? p.tasks : [])),
    tagsPerFile: patchOf('tagsPerFile', (p) => p.tags || []),
    aliasesPerFile: patchOf('aliasesPerFile', (p) => p.aliases || []),
    anchorsPerFile: patchOf('anchorsPerFile', (p) => ({
      headings: new Set(p.headings || []),
      blockIds: new Set(p.blockIds || []),
    })),
  };
}

// 4T-0402 (Epic 3E-0076): Kontext-Struktur einer Datei fuer den Evaluator
// (Werte-Vertrag siehe perspective-query-eval.js). linkGraph darf null sein
// (Abfrage ohne Link-Bezug); inlinks/outlinks sind dann leere Listen.
function buildQueryContext(entry, root, absPath, linkGraph, now, resolveLinkTarget) {
  const stats = entry.fileStats.get(absPath) || {};
  const relPath = relPortable(root, absPath);
  const lastSlash = relPath.lastIndexOf('/');
  const toLinkRef = (p) => ({ path: p, name: logicalNameFor(p) });
  return {
    props: entry.propertiesPerFile.get(absPath) || {},
    file: {
      name: logicalNameFor(absPath),
      folder: lastSlash >= 0 ? relPath.slice(0, lastSlash) : '',
      path: relPath,
      ext: path.extname(absPath).replace(/^\./, '').toLowerCase(),
      absPath,
      size: entry.fileSizes.get(absPath) || 0,
      ctimeMs: stats.ctimeMs || 0,
      mtimeMs: stats.mtimeMs || 0,
      tags: entry.tagsPerFile.get(absPath) || [],
      aliases: entry.aliasesPerFile.get(absPath) || [],
      inlinks: linkGraph ? (linkGraph.inMap.get(absPath) || []).map(toLinkRef) : [],
      outlinks: linkGraph ? (linkGraph.outMap.get(absPath) || []).map(toLinkRef) : [],
    },
    now,
    resolveLinkTarget,
  };
}

// 4T-0515 (Epic 3E-0092): Ereignis-Aggregation. Grundmenge sind alle
// Index-Dateien, deren Zuordnungs-Feld (assignField der Profil-
// Konfiguration) das interne Ereignis-Profil nennt; eine optionale
// FROM/WHERE-Abfrage verfeinert die Menge ueber denselben Evaluator wie
// die Perspective-Abfrage. Liefert pro Treffer die event-*-Frontmatter-
// Felder (roh, Abbildung uebernimmt der Renderer), den logischen Namen
// (Titel-Fallback) und mtimeMs (Konflikt-Erkennung des Rueckschreibens).
// Status-Semantik identisch zu frontmatterQueryFor.
function eventsForQuery(filePath, queryText, areaRoot, opts) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };

  let ast = null;
  const trimmed = String(queryText || '').trim();
  if (trimmed !== '') {
    const parsed = parseQuery(trimmed);
    if (!parsed.ok) {
      return { status: 'ready', meta: { wurzel: root }, queryError: parsed.error, events: [] };
    }
    const fnError = validateQuery(parsed.ast);
    if (fnError) {
      return { status: 'ready', meta: { wurzel: root }, queryError: fnError, events: [] };
    }
    // Die Aggregation arbeitet auf Datei-Ebene; BLOCKS/TASKS-Scopes sind
    // hier nicht sinnvoll (klarer Hinweis statt stiller Leer-Liste).
    if (parsed.ast.scope !== 'files') {
      return {
        status: 'ready',
        meta: { wurzel: root },
        queryError: { code: 'eventsFilesOnly', message: 'nur Datei-Scope', pos: -1 },
        events: [],
      };
    }
    ast = parsed.ast;
  }
  const now = Date.now();
  const resolveLinkTarget = createTargetResolver(entry);
  const linkGraph = ast && queryUsesLinks(ast) ? entry.linkGraph : null;
  const profileName = String((opts && opts.profileName) || '').toLowerCase();
  const events = [];
  // 4T-0935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten Ansicht).
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  for (const [absPath, props] of sicht.propertiesPerFile) {
    const assigned = assignedProfileNames(props, opts && opts.assignField);
    if (!assigned.some((n) => n.toLowerCase() === profileName)) continue;
    if (ast) {
      const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
      if (!matchesQuery(ast, ctx)) continue;
    }
    const stats = entry.fileStats.get(absPath) || {};
    events.push({
      path: absPath,
      name: logicalNameFor(absPath),
      mtimeMs: stats.mtimeMs || 0,
      fields: {
        date: props['event-date'],
        end: props['event-end'],
        text: props['event-text'],
        category: props['event-category'],
        notes: props['event-notes'],
        recurring: props['event-recurring'],
        predecessors: props['event-predecessors'],
        successors: props['event-successors'],
      },
    });
  }
  return { status: 'ready', meta: { wurzel: root }, events };
}

// 4T-0354 (Epic 3E-0065): Perspective-Abfrage. Prueft jede Index-Datei ueber
// ihren Kontext (Frontmatter-Properties plus implizite file.*-Felder) gegen
// den Abfrage-AST (FROM-Quelle und WHERE-Bedingung, 4T-0402) und liefert die
// passenden Dateien (logischer Name plus Pfad), alphabetisch nach Anzeigename
// (SORT/LIMIT uebernimmt die Ergebnis-Pipeline in 4T-0403). Read-only-View wie
// tagsFor: Status wird durchgereicht, kein eigener Scan. Ein Query-Syntax-
// oder Funktions-Fehler wird als queryError-Info bei status 'ready' mit leerer
// Liste durchgereicht; die nutzer-sichtbare Anzeige uebernimmt die View.
// 4T-0409 (Epic 3E-0077): im BLOCKS-Scope (Scope-Zusatz am Ausgabe-Typ) sind
// die Treffer Bloecke statt Dateien — pro aktivem blockData-Eintrag ein
// Kontext, Anzeige-Name 'Datei#^anker', anchor als Sprung-Information.
// 4T-0502 (Epic 3E-0096): im TASKS-Scope sind die Treffer Task-Zeilen —
// pro indexierter Checkbox-Zeile ein Kontext (Datei-Kontext plus ctx.task),
// Treffer tragen Zeilennummer und Roh-Zeile fuer Anzeige und Zeilen-Sprung.
// taskEnv liefert der IPC-Handler aus dem Store: { enabled (Erweiterung
// "Aufgaben" aktiv), globalFilter, statusTypeOf (char -> Typ | null) };
// im Aus-Zustand meldet der TASKS-Scope einen lokalisierbaren queryError.
function frontmatterQueryFor(filePath, query, areaRoot, taskEnv) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };

  const parsedQuery = parseQuery(query);
  if (!parsedQuery.ok) {
    return { status: 'ready', meta: { wurzel: root }, queryError: parsedQuery.error, files: [] };
  }
  // 4T-0402 (Epic 3E-0076): unbekannte Funktionen und falsche Stelligkeit
  // laufen ueber denselben queryError-Pfad wie Syntaxfehler.
  const fnError = validateQuery(parsedQuery.ast);
  if (fnError) {
    return { status: 'ready', meta: { wurzel: root }, queryError: fnError, files: [] };
  }
  // 4T-0503 (Epic 3E-0096): Aktivierungs-Grenze der Gruppierung und der
  // Layout-Klauseln — generisch geparst, in dieser Stufe aber nur fuer
  // LIST TASKS ausgewertet (Epic-Risiko-Punkt: die Klauseln sollen spaeter
  // auch Datei- und Block-Scope tragen koennen, ohne sie dort zu aktivieren).
  const isTaskList = parsedQuery.ast.scope === 'tasks' && parsedQuery.ast.type === 'list';
  if (parsedQuery.ast.groupBy.length > 0 && !isTaskList) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: { code: 'groupByTasksOnly', message: 'GROUP BY nur bei LIST TASKS', pos: -1 },
      files: [],
    };
  }
  if (
    (parsedQuery.ast.hide.length > 0 || parsedQuery.ast.show.length > 0 || parsedQuery.ast.short) &&
    !isTaskList
  ) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: {
        code: 'layoutTasksOnly',
        message: 'HIDE/SHOW/SHORT nur bei LIST TASKS',
        pos: -1,
      },
      files: [],
    };
  }
  const now = Date.now();
  const resolveLinkTarget = createTargetResolver(entry);
  const blockScope = parsedQuery.ast.scope === 'blocks';
  const taskScope = parsedQuery.ast.scope === 'tasks';
  // 4T-0502 (Epic 3E-0096): TASKS-Scope nur bei aktiver Erweiterung
  // "Aufgaben" (Querschnitt C des Konzept-Workshops: im Aus-Zustand
  // entfaellt der Scope; klarer Hinweis statt stiller Leer-Liste).
  if (taskScope && !(taskEnv && taskEnv.enabled)) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: { code: 'tasksScopeDisabled', message: 'TASKS-Scope deaktiviert', pos: -1 },
      files: [],
    };
  }
  const globalFilter = (taskEnv && taskEnv.globalFilter) || '';
  const statusTypeOf =
    taskEnv && typeof taskEnv.statusTypeOf === 'function' ? taskEnv.statusTypeOf : () => null;
  // 4T-0505: Bezugstag des Dringlichkeits-Scores (lokales Datum zu now).
  const todayIso = localIsoDateOf(now);
  // 4T-0505: globale Abfrage (Einstellungs-Vorgabe) — einmal pro Lauf
  // geparst und als zusaetzliche FROM-/WHERE-Anteile vorangestellt; ein
  // Fehler der globalen Abfrage meldet sich mit eigenem Code, damit die
  // Anzeige global von lokal unterscheidet.
  let evalAst = parsedQuery.ast;
  if (taskScope && taskEnv && typeof taskEnv.globalQuery === 'string' && taskEnv.globalQuery) {
    const globalParsed = parseGlobalTaskQuery(taskEnv.globalQuery);
    if (globalParsed.error) {
      return {
        status: 'ready',
        meta: { wurzel: root },
        queryError: { code: 'globalQueryInvalid', message: 'Globale Abfrage ungültig', pos: -1 },
        files: [],
      };
    }
    evalAst = { ...parsedQuery.ast };
    if (globalParsed.where) {
      evalAst.where = evalAst.where
        ? { type: 'and', left: globalParsed.where, right: evalAst.where }
        : globalParsed.where;
    }
    if (globalParsed.source) {
      evalAst.source = evalAst.source
        ? { type: 'srcAnd', left: globalParsed.source, right: evalAst.source }
        : globalParsed.source;
    }
  }
  // Link-Graph nur aufbauen, wenn die (effektive, inklusive globaler
  // Anteile) Abfrage ihn braucht (file.inlinks/file.outlinks oder
  // FROM-Link-Quelle).
  let linkGraph = null;
  if (queryUsesLinks(evalAst)) {
    if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
    linkGraph = entry.linkGraph;
  }
  // 4T-0935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten
  // Ansicht). Erst hier, nach dem Link-Graph-Aufbau oben, damit dessen Cache
  // am Original-Eintrag landet.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const rows = [];
  // 4T-0502/4T-0508: TASKS-Scope in zwei Phasen — erst ALLE Task-Zeilen des
  // Bereichs zum Modell parsen (Global Filter angewandt), dann die
  // Blockierungs-/Duplikat-Flags ueber die Gesamt-Menge berechnen
  // (computeDependencyFlags braucht die Datei-uebergreifende Sicht), erst
  // danach der Filter-Pass mit vollstaendigem Task-Kontext.
  if (taskScope) {
    const candidates = [];
    for (const absPath of sicht.files.keys()) {
      const taskLines = sicht.tasksPerFile.get(absPath);
      if (!taskLines || taskLines.length === 0) continue;
      for (const tl of taskLines) {
        const model = parseTaskLine(tl.text);
        if (!model) continue;
        if (!modelMatchesGlobalFilter(model, globalFilter)) continue;
        candidates.push({
          absPath,
          tl,
          model,
          statusType: statusTypeOf(model.statusChar),
        });
      }
    }
    const flags = computeDependencyFlags(
      candidates.map((c) => ({
        id: c.model.id,
        dependsOn: c.model.dependsOn,
        statusType: c.statusType,
      })),
    );
    const fileCtxCache = new Map();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let fileCtx = fileCtxCache.get(c.absPath);
      if (!fileCtx) {
        fileCtx = buildQueryContext(sicht, root, c.absPath, linkGraph, now, resolveLinkTarget);
        fileCtxCache.set(c.absPath, fileCtx);
      }
      const ctx = {
        ...fileCtx,
        task: {
          model: c.model,
          line: c.tl.zeile,
          heading: c.tl.heading || null,
          statusType: c.statusType,
          description: c.model.description.trim(),
          tags: taskLineTags(c.model.description),
          raw: c.tl.text,
          // 4T-0505: Dringlichkeits-Score mit injiziertem Bezugstag.
          urgency: computeUrgency(c.model, { todayIso }),
          // 4T-0508: Blockierungs- und Duplikat-Flags.
          blocked: flags[i].blocked,
          blocking: flags[i].blocking,
          duplicateId: flags[i].duplicateId,
        },
      };
      if (matchesQuery(evalAst, ctx)) rows.push(ctx);
    }
  }
  for (const absPath of taskScope ? [] : sicht.files.keys()) {
    if (blockScope) {
      // 4T-0409 (Epic 3E-0077): BLOCKS-Scope — pro Block-Daten-Eintrag ein
      // Kontext aus Datei-Kontext plus Block ({ anchor, values, updatedMs },
      // 4T-0408). Nur aktive Anker zaehlen: verwaiste Eintraege (Anker steht
      // nicht mehr im Dokument) sind kein Block-Treffer, denn Treffer sind
      // klickbare Datei#^anker-Ziele (Anker als Identitaet, Epic-Entscheidung);
      // das Panel fuehrt verwaiste Daten separat. Dateien ohne Block-Daten
      // liefern schlicht keine Treffer (kein Fehler-Zustand).
      const blocks = entry.blockDataPerFile.get(absPath);
      if (!blocks || blocks.length === 0) continue;
      const anchorsMeta = sicht.anchorsPerFile.get(absPath);
      if (!anchorsMeta || anchorsMeta.blockIds.size === 0) continue;
      let fileCtx = null;
      for (const block of blocks) {
        if (!anchorsMeta.blockIds.has(block.anchor)) continue;
        if (!fileCtx) {
          fileCtx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
        }
        const ctx = { ...fileCtx, block };
        if (matchesQuery(evalAst, ctx)) rows.push(ctx);
      }
      continue;
    }
    const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
    if (matchesQuery(evalAst, ctx)) rows.push(ctx);
  }
  // Basis-Ordnung: Datei- und Block-Scope alphabetisch (Name, Pfad, Anker)
  // wie bisher; der Task-Scope folgt seit 4T-0505 der Referenz-Default-
  // Sortierung Status-Typ -> Dringlichkeit (absteigend) -> Faelligkeit ->
  // Prioritaet -> Pfad (Zeile als letzter Determinismus-Anker). SORT
  // ueberschreibt sie in der Ergebnis-Pipeline, LIMIT schneidet nach der
  // Sortierung (4T-0403).
  if (taskScope) {
    rows.sort(
      (a, b) =>
        statusTypeRank(a.task.statusType) - statusTypeRank(b.task.statusType) ||
        b.task.urgency - a.task.urgency ||
        compareDateValue(a.task.model.due, b.task.model.due) ||
        priorityRank(a.task.model.priority) - priorityRank(b.task.model.priority) ||
        a.file.path.localeCompare(b.file.path) ||
        a.task.line - b.task.line,
    );
  } else {
    rows.sort(
      (a, b) =>
        a.file.name.localeCompare(b.file.name) ||
        a.file.path.localeCompare(b.file.path) ||
        (blockScope ? a.block.anchor.localeCompare(b.block.anchor) : 0),
    );
  }
  const finalRows = applyResultPipeline(rows, evalAst);
  const ast = parsedQuery.ast;
  // 4T-0409: Treffer-Identitaet der View. Im Block-Scope ist der Anzeige-Name
  // 'Datei#^anker' und `anchor` traegt die Sprung-Information fuer den Klick
  // (bestehende Wiki-Link-Sprung-Mechanik); path bleibt der absolute Index-Pfad.
  // 4T-0502: im Task-Scope tragen Treffer Zeilennummer (Zeilen-Sprung) und
  // Roh-Zeile (die View parst sie mit dem Marker-Kern und baut die Task-Optik).
  const toHit = (ctx) => {
    if (blockScope) {
      return {
        name: `${ctx.file.name}#^${ctx.block.anchor}`,
        path: ctx.file.absPath,
        anchor: ctx.block.anchor,
      };
    }
    if (taskScope) {
      return {
        name: ctx.file.name,
        path: ctx.file.absPath,
        line: ctx.task.line,
        taskText: ctx.task.raw,
        // 4T-0505: einblendbarer Score (SHOW urgency), auf zwei
        // Nachkommastellen gerundet (Anzeige-Form der Referenz-Formel).
        urgency: Math.round(ctx.task.urgency * 100) / 100,
        // 4T-0508: dezente Kennzeichnungen der Treffer-Darstellung.
        blocked: ctx.task.blocked,
        duplicateId: ctx.task.duplicateId,
      };
    }
    return { name: ctx.file.name, path: ctx.file.absPath };
  };
  const result = {
    status: 'ready',
    meta: { wurzel: root, fileCount: entry.fileCount },
    // 4T-0404 (Epic 3E-0076): Ausgabe-Typ fuer die View ('list' | 'table').
    queryType: ast.type,
    // 4T-0502 (Epic 3E-0096): Auswertungs-Ebene fuer die View
    // ('files' | 'blocks' | 'tasks') — steuert die Task-Listen-Optik.
    queryScope: ast.scope,
    files: finalRows.map(toHit),
  };
  // 4T-0405 (Epic 3E-0076): COLUMNS ist reines Listen-Layout; bei TABLE wird
  // es ignoriert und als lokalisierter Hinweis am Fence gemeldet (kein Fehler).
  if (ast.layoutColumns) {
    if (ast.type === 'list') result.layoutColumns = ast.layoutColumns;
    else result.hint = 'columnsIgnored';
  }
  if (ast.type === 'table') {
    // Tabellen-Daten: Kopfzeile aus AS-Alias bzw. Ausdrucks-Quelltext, Zellen
    // als Anzeige-Segmente (Text plus klickbare Link-Verweise). Die files-
    // Liste bleibt parallel gefuellt (gemeinsamer Leer-/Alt-Pfad der View).
    result.table = {
      withoutId: !!ast.withoutId,
      headers: ast.fields.map((f) => f.alias || formatExprSource(f.expr)),
      rows: finalRows.map((ctx) => ({
        ...toHit(ctx),
        cells: ast.fields.map((f) => formatValueSegments(evaluateExpression(f.expr, ctx))),
      })),
    };
  } else if (ast.fields.length > 0) {
    // LIST-Zusatzfeld: ausgewerteter Ausdruck als Segmente je Treffer.
    result.files = finalRows.map((ctx) => ({
      ...toHit(ctx),
      extra: formatValueSegments(evaluateExpression(ast.fields[0].expr, ctx)),
    }));
  }
  // 4T-0503 (Epic 3E-0096): Task-Layout und Gruppierung (nur LIST TASKS,
  // Aktivierungs-Grenze oben). Die Gruppierung laeuft NACH der Ergebnis-
  // Pipeline: SORT bestimmt die Reihenfolge innerhalb der Gruppen, LIMIT
  // schneidet vor der Gruppen-Bildung; die Gruppen-Reihenfolge folgt der
  // Werte-Ordnung der Gruppen-Keys (orderForSort), Treffer ohne Wert bilden
  // die letzte Gruppe (label null, lokalisiert von der View). Das LIST-
  // Zusatzfeld geht ueber hitFor in die Gruppen-Eintraege mit ein.
  if (taskScope && ast.type === 'list') {
    result.totalCount = finalRows.length;
    result.taskLayout = { hide: ast.hide, show: ast.show, short: ast.short };
    if (ast.groupBy.length > 0) {
      const hitFor = (ctx) => {
        const hit = toHit(ctx);
        if (ast.fields.length > 0) {
          hit.extra = formatValueSegments(evaluateExpression(ast.fields[0].expr, ctx));
        }
        return hit;
      };
      result.groups = buildTaskGroups(finalRows, ast.groupBy, 0, hitFor);
      result.files = [];
    }
  }
  return result;
}

// 4T-0503 (Epic 3E-0096): rekursive Gruppen-Bildung der Task-Ausgabe.
// Pro Ebene wird der Gruppen-Key je Treffer ausgewertet; Treffer mit
// gleichem Anzeige-Wert bilden eine Gruppe (Reihenfolge der Treffer
// innerhalb der Gruppe bleibt die der Ergebnis-Pipeline). Gruppen
// sortieren nach der Werte-Ordnung des ersten Roh-Werts (orderForSort,
// Fallback Anzeige-Label); Treffer ohne Wert bilden die letzte Gruppe
// mit label null (die View lokalisiert die Beschriftung).
function buildTaskGroups(rows, keyExprs, level, hitFor) {
  const groups = [];
  const byLabel = new Map();
  for (const ctx of rows) {
    const value = evaluateExpression(keyExprs[level], ctx);
    const label = value === null || value === undefined ? null : formatValue(value);
    const mapKey = label === null ? ' none' : `v:${label}`;
    let group = byLabel.get(mapKey);
    if (!group) {
      group = { value, label, rows: [] };
      byLabel.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(ctx);
  }
  groups.sort((a, b) => {
    const aNone = a.label === null;
    const bNone = b.label === null;
    if (aNone && bNone) return 0;
    if (aNone) return 1;
    if (bNone) return -1;
    const ord = orderForSort(a.value, b.value);
    if (ord !== null && ord !== 0) return ord;
    return a.label.localeCompare(b.label);
  });
  return groups.map((g) => {
    if (level + 1 < keyExprs.length) {
      return { label: g.label, groups: buildTaskGroups(g.rows, keyExprs, level + 1, hitFor) };
    }
    return { label: g.label, items: g.rows.map(hitFor) };
  });
}

// 4T-0413 (Epic 3E-0078): Daten-Snapshot fuer Skript-Bloecke
// (perspective-script). Liefert einmalig pro Lauf den kompletten Suchraum
// als serialisierbare Struktur: pro Datei der Abfrage-Kontext (Frontmatter-
// props plus implizite file.*-Felder inkl. inlinks/outlinks — identisches
// Feld-Modell wie frontmatterQueryFor) und die aktiven Block-Metadaten
// (Anker-Identitaet wie im BLOCKS-Scope: verwaiste Eintraege zaehlen nicht).
// Der Link-Graph wird immer aufgebaut (Skripte fragen ihn typischerweise ab,
// der Referenz-Fall des PO ist ein rekursiver outlinks-Baum). Kein Live-
// Kanal: die Sandbox erhaelt den Snapshot mit dem Run-Auftrag; Aktualitaet
// sichert die Index-Invalidierung ueber den Neustart des Blocks.
function scriptDataFor(filePath, areaRoot) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return { status: 'oversized', meta: { wurzel: root, fileCount: entry.fileCount } };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };

  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const linkGraph = entry.linkGraph;
  const now = Date.now();
  const pages = [];
  const blocks = [];
  // 4T-0935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten
  // Ansicht). Die Sicht wird nach dem Link-Graph-Aufbau gebildet, damit der
  // Cache am Original-Eintrag landet und nicht an der Sicht.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  for (const absPath of sicht.files.keys()) {
    const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, null);
    pages.push({ props: ctx.props, file: ctx.file });
    const blockEntries = entry.blockDataPerFile.get(absPath);
    if (!blockEntries || blockEntries.length === 0) continue;
    const anchorsMeta = sicht.anchorsPerFile.get(absPath);
    if (!anchorsMeta || anchorsMeta.blockIds.size === 0) continue;
    for (const block of blockEntries) {
      if (!anchorsMeta.blockIds.has(block.anchor)) continue;
      blocks.push({
        file: { path: ctx.file.path, absPath: ctx.file.absPath, name: ctx.file.name },
        anchor: block.anchor,
        values: block.values,
        updatedMs: block.updatedMs,
      });
    }
  }
  return { status: 'ready', current: filePath, pages, blocks };
}

function scheduleInvalidate(entry) {
  if (entry.invalidateTimer) return;
  entry.invalidateTimer = setTimeout(() => {
    entry.invalidateTimer = null;
    if (broadcastFn) broadcastFn('backlinks:invalidated', { wurzel: entry.wurzel });
  }, INVALIDATE_DEBOUNCE_MS);
}

// Ein Owner gibt die Wurzel frei. Wenn kein Owner mehr registriert ist,
// startet der Soft-Timer. Wird in dieser Zeit erneut ensureIndex aufgerufen,
// wird der Timer abgebrochen.
// B-01 (4T-0175): Owner-Key-Modell; ohne ownerKey (Alt-Aufrufer) wird nur
// der Leer-Check ausgefuehrt.
function releaseRoot(rootPath, ownerKey) {
  const entry = indexes.get(rootPath);
  if (!entry) return;
  if (ownerKey) entry.ownerKeys.delete(ownerKey);
  if (entry.ownerKeys.size > 0) return;
  if (entry.softTimer) return;
  entry.softTimer = setTimeout(() => {
    teardownIndex(rootPath);
  }, SOFT_TIMEOUT_MS);
}

// B-02 (4T-0175): Beim Schliessen eines Fensters alle Owner-Keys dieses
// webContents freigeben (Keys haben die Form '<webContentsId>:<paneIdx>').
function releaseAllForOwner(webContentsId) {
  const prefix = `${webContentsId}:`;
  for (const [rootPath, entry] of indexes) {
    let removed = false;
    for (const key of [...entry.ownerKeys]) {
      if (key.startsWith(prefix)) {
        entry.ownerKeys.delete(key);
        removed = true;
      }
    }
    if (removed && entry.ownerKeys.size === 0 && !entry.softTimer) {
      entry.softTimer = setTimeout(() => {
        teardownIndex(rootPath);
      }, SOFT_TIMEOUT_MS);
    }
  }
}

// --- 4T-0348 (Epic 3E-0062): Bereichs-Index-Persistenz (Area_Cache.mdda) ------
// Der In-Memory-Index bleibt die Quelle der Wahrheit; die Cache-Datei ist ein
// regenerierbares Maschinen-Artefakt. Persistiert wird pro Datei { mtimeMs,
// size, hash, parsed }, Schluessel ist der wurzel-relative Pfad (Umzugs-
// Toleranz). Nur Bereichs-Wurzeln (entry.isArea) schreiben; bereichslose
// Wurzeln bleiben rein fluechtig.

// Wurzel-relativer, portabler ('/') und NFC-normalisierter Datei-Schluessel.
function cacheRelPath(absPath, wurzel) {
  return path.relative(wurzel, absPath).split(path.sep).join('/').normalize('NFC');
}

// md-Link-Treffer tragen im Speicher ein absolutes `zielAbsolut`; im Cache wird
// es wurzel-relativ (`zielRel`) abgelegt, damit ein Verschieben des Bereichs-
// Ordners die Backlinks nicht bricht. Wiki-Treffer sind namensbasiert und
// bleiben unveraendert.
function hitToCacheForm(h, wurzel) {
  if (h.linkTyp === 'md' && h.zielAbsolut) {
    const { zielAbsolut, ...rest } = h;
    return { ...rest, zielRel: path.relative(wurzel, zielAbsolut).split(path.sep).join('/') };
  }
  return h;
}

function hitFromCacheForm(h, wurzel) {
  if (h && h.linkTyp === 'md' && typeof h.zielRel === 'string') {
    const { zielRel, ...rest } = h;
    return { ...rest, zielAbsolut: path.resolve(wurzel, zielRel) };
  }
  return h;
}

// Rekonstruiert das Datei-Parse-Ergebnis aus den bestehenden Index-Maps (statt
// es doppelt zu halten). Die Reihenfolge der Anker ist fuer die Existenz-
// Pruefungen unerheblich.
function reconstructParsed(entry, absPath) {
  const anchors = entry.anchorsPerFile.get(absPath);
  return {
    hits: entry.files.get(absPath) || [],
    aliases: entry.aliasesPerFile.get(absPath) || [],
    headings: anchors ? [...anchors.headings] : [],
    blockIds: anchors ? [...anchors.blockIds] : [],
    tags: entry.tagsPerFile.get(absPath) || [],
    // 4T-0354 (Epic 3E-0065): Properties für den Cache mit rekonstruieren.
    properties: entry.propertiesPerFile.get(absPath) || {},
    // 4T-0502 (Epic 3E-0096): Task-Zeilen für den Cache mit rekonstruieren.
    tasks: entry.tasksPerFile.get(absPath) || [],
  };
}

// Laedt die Cache-Datei zu Map<relPath, {mtimeMs,size,hash,parsed(in-memory)}>.
// Fehlend oder defekt -> leere Map (stiller Neuaufbau, nie Absturz).
async function loadAreaCache(cachePath, wurzel) {
  const map = new Map();
  let raw;
  try {
    raw = await fs.promises.readFile(cachePath, 'utf8');
  } catch {
    return map; // fehlend
  }
  const res = parseCacheContainer(raw);
  if (!res.ok) return map; // defekt/versionsfremd
  const files = res.container.linkIndex.files;
  for (const relPath of Object.keys(files)) {
    const rec = files[relPath];
    if (!rec || typeof rec !== 'object' || !rec.parsed) continue;
    const p = rec.parsed;
    map.set(relPath, {
      mtimeMs: rec.mtimeMs,
      size: rec.size,
      hash: typeof rec.hash === 'string' ? rec.hash : '',
      parsed: {
        hits: (Array.isArray(p.hits) ? p.hits : []).map((h) => hitFromCacheForm(h, wurzel)),
        aliases: Array.isArray(p.aliases) ? p.aliases : [],
        headings: Array.isArray(p.headings) ? p.headings : [],
        blockIds: Array.isArray(p.blockIds) ? p.blockIds : [],
        tags: Array.isArray(p.tags) ? p.tags : [],
        // 4T-0354 (Epic 3E-0065): Properties-Map (Objekt) aus dem Cache lesen.
        properties:
          p.properties && typeof p.properties === 'object' && !Array.isArray(p.properties)
            ? p.properties
            : {},
        // 4T-0502 (Epic 3E-0096): Task-Zeilen aus dem Cache lesen (Schema-
        // Version 3; Alt-Caches verwirft parseCacheContainer ueber die Version).
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
      },
    });
  }
  return map;
}

// Serialisiert die aktuelle Index-Struktur in die Cache-Datei. Der Container-
// Aufbau laeuft synchron (liest die Maps), das Schreiben asynchron ueber
// markSelfWriting. Fehler werden geloggt, nicht geworfen (Cache ist optional).
async function writeAreaCache(entry) {
  if (!entry.isArea || !entry.cachePath) return;
  const wurzel = entry.wurzel;
  const container = emptyCacheContainer();
  for (const absPath of entry.files.keys()) {
    const meta = entry.cacheFiles.get(absPath);
    if (!meta) continue;
    const parsed = reconstructParsed(entry, absPath);
    container.linkIndex.files[cacheRelPath(absPath, wurzel)] = {
      mtimeMs: meta.mtimeMs,
      size: meta.size,
      hash: meta.hash,
      parsed: {
        hits: parsed.hits.map((h) => hitToCacheForm(h, wurzel)),
        aliases: parsed.aliases,
        headings: parsed.headings,
        blockIds: parsed.blockIds,
        tags: parsed.tags,
        // 4T-0354 (Epic 3E-0065): Properties-Map mit persistieren.
        properties: parsed.properties || {},
        // 4T-0502 (Epic 3E-0096): Task-Zeilen mit persistieren.
        tasks: parsed.tasks || [],
      },
    };
  }
  const serialized = serializeCacheContainer(container);
  try {
    if (selfWriterFn) selfWriterFn(entry.cachePath, serialized);
    await fs.promises.writeFile(entry.cachePath, serialized, 'utf8');
  } catch (err) {
    console.warn('Area_Cache schreiben fehlgeschlagen:', entry.cachePath, err && err.message);
  }
}

// Debounced-Schreiben nach der letzten Aenderung; nur Bereichs-Wurzeln.
function scheduleCacheWrite(entry) {
  if (!entry.isArea || !entry.cachePath) return;
  if (entry.cacheWriteTimer) return;
  entry.cacheWriteTimer = setTimeout(() => {
    entry.cacheWriteTimer = null;
    writeAreaCache(entry).catch(() => {});
  }, CACHE_DEBOUNCE_MS);
}

function teardownIndex(rootPath, opts = {}) {
  const entry = indexes.get(rootPath);
  if (!entry) return;
  if (!opts.force && entry.ownerKeys.size > 0) return;
  if (entry.softTimer) clearTimeout(entry.softTimer);
  if (entry.invalidateTimer) clearTimeout(entry.invalidateTimer);
  // 4T-0348 (Epic 3E-0062): letzten Cache-Stand sichern, bevor die Wurzel
  // abgebaut wird. Container-Aufbau synchron (liest die noch intakten Index-
  // Maps), Schreiben asynchron (fire-and-forget). Ein verpasster Flush ist
  // unkritisch, weil geaenderte Dateien beim naechsten Oeffnen per mtime-
  // Mismatch neu geparst werden.
  if (entry.cacheWriteTimer) {
    clearTimeout(entry.cacheWriteTimer);
    entry.cacheWriteTimer = null;
  }
  if (entry.isArea) writeAreaCache(entry).catch(() => {});
  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      /* ignore */
    }
  }
  indexes.delete(rootPath);
}

// Aufloesung von Wiki-Link-Treffern: zielBasename wird gegen alle Dateien
// im Index gematcht, deren Basename ohne Markdown-Extension passt. Mehrere
// Treffer pro Wiki-Link sind erlaubt (Namens-Konflikt).
// B-04/B-23 (4T-0175): Vergleich case-insensitiv und NFC-normalisiert —
// der Klick-Pfad (NTFS) und die Alias-Map entscheiden bereits so; vorher
// meldete der Linter [[readme]] als broken, obwohl der Klick README.md
// oeffnete.
// B-13 (4T-0175): Pfad-Ziele ([[sub/Datei]]) matchen per Suffix gegen den
// Datei-Pfad, wie es der dokument-relative Klick-Pfad effektiv tut.
// 4T-0336 (Epic 3E-0061): getrennte Treffer-Mengen fuer Namens-, Pfad- und
// Unterseiten-Form. Der Linter nutzt Pfad- und Unterseiten-Menge fuer die
// Mehrdeutigkeits-Meldung; resolveWikiLink kombiniert mit Pfad-Vorrang
// (Epic-Entscheidung: bestehendes B-13-Verhalten bricht nicht).
function resolveWikiLinkDetailed(entry, zielBasename) {
  const wanted = normalizeNameKey(String(zielBasename).replace(MD_EXT_RE, '')).replace(/\\/g, '/');
  if (!wanted.includes('/')) {
    // B-15 (4T-0181): O(1) ueber die inverse Namens-Map statt linear ueber
    // alle Dateien (vorher O(Hits x Dateien) in collectBacklinksFor).
    // Deckt auch bereits expandierte Unterseiten-Namen in U+2215-Form ab.
    const set = entry.nameMap.get(wanted);
    return { nameMatches: set ? [...set] : [], pathMatches: [], subpageMatches: [] };
  }
  // Pfad-Form (B-13): Suffix-Match bleibt linear — selten genutzt.
  const pathMatches = [];
  for (const f of entry.files.keys()) {
    const fileKey = normalizeNameKey(f.replace(MD_EXT_RE, '')).replace(/\\/g, '/');
    if (fileKey.endsWith('/' + wanted)) pathMatches.push(f);
  }
  // Unterseiten-Form: Slash-Schreibweise -> U+2215 im Basename.
  const subSet = entry.nameMap.get(wanted.replace(/\//g, SUBPAGE_SEP));
  return { nameMatches: [], pathMatches, subpageMatches: subSet ? [...subSet] : [] };
}

function resolveWikiLink(entry, zielBasename) {
  const d = resolveWikiLinkDetailed(entry, zielBasename);
  if (d.nameMatches.length > 0) return d.nameMatches;
  return d.pathMatches.length > 0 ? d.pathMatches : d.subpageMatches;
}

// Liefert alle Treffer in der Wurzel, deren Ziel die aktive Datei ist.
// 4T-0050: Aliases-aware. Ein Wiki-Link [[MV]] aus quelle.md gilt als
// Backlink auf die aktive Datei, wenn entweder
//   (a) die aktive Datei den Basename 'MV' hat, oder
//   (b) die aktive Datei einen Alias 'MV' im Frontmatter fuehrt.
// Im Treffer wird viaAlias='MV' gesetzt, wenn (b) zutrifft; sonst null.
function collectBacklinksFor(activeFile, entry) {
  const activeAbs = path.resolve(activeFile);
  // 4T-0050: Aliases der aktiven Datei (case-insensitive Vergleich gegen
  // Wiki-Link-Basenames der Quelldateien).
  const activeAliases = entry.aliasesPerFile.get(activeAbs) || [];
  const activeAliasesLower = new Set(activeAliases.map((a) => normalizeNameKey(a.trim())));
  const activeBasenameLower = normalizeNameKey(path.basename(activeAbs).replace(MD_EXT_RE, ''));
  const groups = new Map(); // quelldatei -> Array<{zeile, anker, snippet, linkTyp, viaAlias}>
  for (const [src, hits] of entry.files) {
    if (src === activeAbs) continue; // Eigen-Referenz ueberspringen
    for (const h of hits) {
      let isMatch = false;
      let viaAlias = null;
      if (h.linkTyp === 'wiki') {
        // Direkter Datei-Treffer (Basename-Match).
        const candidates = resolveWikiLink(entry, h.zielBasename);
        if (candidates.includes(activeAbs)) {
          isMatch = true;
        } else {
          // 4T-0050: Alias-Match? Nur greifen, wenn kein direkter
          // Datei-Treffer existiert (sonst wuerde ein Wiki-Link auf eine
          // echte Datei zusaetzlich als Alias-Backlink auftauchen). Wenn
          // candidates.length === 0 und der Basename ein Alias der aktiven
          // Datei ist, gilt der Link.
          if (candidates.length === 0) {
            const targetLower = normalizeNameKey(String(h.zielBasename || '').trim());
            if (targetLower && targetLower === activeBasenameLower) {
              // Sollte nicht passieren, weil resolveWikiLink den Basename
              // matchen wuerde — Defensiv-Fallback.
              isMatch = true;
            } else if (targetLower && activeAliasesLower.has(targetLower)) {
              isMatch = true;
              viaAlias = h.zielBasename;
            }
          }
        }
      } else if (h.linkTyp === 'md') {
        // Markdown-Link kann ohne .md-Endung gesetzt sein? Unser Regex faengt
        // nur .md-aehnliche Endungen, also direkter Vergleich:
        if (h.zielAbsolut === activeAbs) isMatch = true;
      }
      if (!isMatch) continue;
      if (!groups.has(src)) groups.set(src, []);
      groups.get(src).push({
        zeile: h.zeile,
        anker: h.anker,
        snippet: h.snippet,
        linkTyp: h.linkTyp,
        viaAlias,
      });
    }
  }
  // In Group-Listen nach Zeile sortieren, Groups nach Pfad.
  const result = [];
  for (const [quelldatei, hits] of groups) {
    hits.sort((a, b) => a.zeile - b.zeile);
    result.push({ quelldatei, hits });
  }
  result.sort((a, b) => a.quelldatei.localeCompare(b.quelldatei));
  return result;
}

// Haupt-API fuer den IPC-Handler in main.js. Bestimmt die Wurzel zur
// aktiven Datei, sorgt fuer den Index, liefert das Status-Payload zurueck.
// B-01 (4T-0175): ownerKey identifiziert den anfragenden Kontext
// ('<webContentsId>:<paneIdx>'); Mehrfach-Requests desselben Owners
// erhoehen die Referenz nicht.
function backlinksFor(filePath, ownerKey, areaRoot) {
  if (!filePath) {
    return { status: 'unavailable' };
  }
  const { root, isArea } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = ensureIndex(root, ownerKey, isArea);
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') {
    return { status: 'indexing', meta: { wurzel: root } };
  }
  // B-21 (4T-0187): Watcher-Fehler-Status an das Panel melden.
  if (entry.status === 'error') {
    return { status: 'error', meta: { wurzel: root } };
  }
  const results = collectBacklinksFor(filePath, entry);
  return {
    status: 'ready',
    // B-22 (4T-0187): skippedDirs fuer den Panel-Hinweis.
    meta: { wurzel: root, fileCount: entry.fileCount, skippedDirs: entry.skippedDirs || 0 },
    results,
  };
}

// B-18 (4T-0187): Index-Lebenszyklus von der Panel-Sichtbarkeit entkoppelt.
// Bedarfs-Pfade (Tag-Sidebar, Autocomplete, Linter, Alias-/Index-Klick)
// stossen den asynchronen Aufbau selbst an. Der Owner-Key folgt dem
// B-01-Modell ('<webContentsId>:…'); releaseAllForOwner raeumt ihn beim
// Fenster-Schliessen mit ab, Mehrfach-Aufrufe desselben Owners sind durch
// das Set idempotent (kein Rueckfall in das B-01-Leak).
function ensureIndexForDemand(filePath, ownerKey, areaRoot) {
  if (!filePath || !ownerKey) return;
  const { root, isArea } = resolveRootInfo(filePath, areaRoot);
  if (!root) return;
  ensureIndex(root, ownerKey, isArea);
}

// 4T-0348 (Epic 3E-0062): proaktiver Aufbau des Bereichs-Index beim Bereichs-
// Oeffnen, unabhaengig von einer offenen Datei. So entsteht der Index (und
// damit Area_Cache.mdda) "automatisch beim Start" statt erst beim ersten
// Panel-/Linter-Bedarf. Der ownerKey ('area:<appId>') haelt den Index ueber
// die Lebensdauer der Bereichs-App; main.js gibt ihn beim Bereichs-Schliessen
// frei (releaseRoot -> Soft-Timer -> Teardown mit Cache-Flush).
function ensureAreaIndex(areaRoot, ownerKey) {
  if (!areaRoot || !ownerKey) return;
  let root;
  try {
    root = path.resolve(areaRoot);
  } catch {
    return;
  }
  ensureIndex(root, ownerKey, true);
}

// Liefert den aktuellen Wurzel-Pfad fuer eine Datei (fuer Refcount-Release).
function rootForActiveFile(filePath, areaRoot) {
  // 4T-0347 (Epic 3E-0062): dieselbe bereichsbewusste Wurzel wie backlinksFor,
  // damit backlinks:release exakt den Owner freigibt, den backlinks:request
  // registriert hat (sonst Owner-Leak in Bereichs-Apps).
  return resolveRootInfo(filePath, areaRoot).root;
}

// B-17 (4T-0183): fileBelongsToRoot entfernt — exportiert, aber ohne
// Aufrufer, und die Semantik (reiner Prefix-Match) entsprach nicht dem
// Owner-basierten Root-Modell seit 4T-0175/4T-0181.

// 4T-0020: Lookup fuer den Markdown-Linter. Liefert fuer eine Liste von
// Wiki-Link-Basenames das Set derjenigen, deren Ziel im Suchraum der aktiven
// Datei existiert. Aufrufer (Renderer-Linter) entscheidet anhand des Status,
// ob er die broken-wiki-link-Regel anwenden darf:
// - 'ready': Index ist verfuegbar, 'existing' ist verbindlich.
// - 'indexing': Index wird gerade aufgebaut, Regel temporaer unterdruecken.
// - 'unavailable': kein Suchraum (z.B. unbenannte Datei) oder Index
//   oversized, Regel ebenfalls unterdruecken.
// B-18 (4T-0187): Der Index-AUFBAU wird nicht mehr hier, sondern im IPC-
// Handler ueber ensureIndexForDemand angestossen (Owner-Modell macht das
// seit 4T-0175 leak-frei); diese Funktion bleibt ein reiner Read-Pfad.
function existingWikiTargets(filePath, targets, areaRoot) {
  if (!filePath || !Array.isArray(targets)) {
    return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  }
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  if (entry.status === 'oversized')
    return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  if (entry.status === 'indexing')
    return { status: 'indexing', existing: [], brokenAnchor: [], ambiguous: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable — sonst markiert der Linter
  // gegen den Stale-Index neue Dateien faelschlich als broken.
  if (entry.status === 'error')
    return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  const existing = [];
  const brokenAnchor = [];
  // 4T-0336 (Epic 3E-0061): Ziele, bei denen Ordner-Pfad-Form und
  // Unterseiten-Form auf verschiedene Dateien zeigen (Linter-Hinweis).
  const ambiguous = [];
  const activeFileAbs = path.resolve(filePath);

  for (const target of targets) {
    if (typeof target !== 'string' || !target) continue;
    // 4T-0054: Anker-Trennung. '#' beendet den Pfad-Teil. Reiner Anker
    // ('#Heading' oder '#^id') zaehlt gegen die aktive Datei selbst.
    let basename = target;
    let anchor = null;
    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      basename = target.slice(0, hashIdx);
      anchor = target.slice(hashIdx + 1).trim() || null;
    }

    // Reiner Anker: prueft gegen die aktive Datei.
    if (!basename) {
      if (anchor && anchorExistsInFile(entry, activeFileAbs, anchor)) {
        existing.push(target);
      } else if (anchor) {
        brokenAnchor.push(target);
      }
      // Falls weder basename noch anchor: stiller Skip.
      continue;
    }

    // 4T-0336: relative Unterseiten-Formen gegen die aktive Datei
    // expandieren; '..' auf Top-Level bleibt unaufloesbar (broken).
    let lookupName = basename;
    if (isRelativeTarget(basename)) {
      const ownBase = path.basename(activeFileAbs).replace(MD_EXT_RE, '');
      const expanded = expandRelativeTarget(ownBase, basename);
      if (!expanded) continue;
      lookupName = expanded;
    }

    // 4T-0050: Datei direkt oder ueber Alias auflösen.
    // 4T-0336: getrennte Treffer-Mengen fuer die Mehrdeutigkeits-Meldung.
    const detailed = resolveWikiLinkDetailed(entry, lookupName);
    if (detailed.pathMatches.length > 0 && detailed.subpageMatches.length > 0) {
      ambiguous.push(target);
      continue;
    }
    let candidates =
      detailed.nameMatches.length > 0
        ? detailed.nameMatches
        : detailed.pathMatches.length > 0
          ? detailed.pathMatches
          : detailed.subpageMatches;
    if (candidates.length === 0) {
      candidates = filesByAlias(entry, lookupName);
    }
    if (candidates.length === 0) {
      // Datei existiert nicht — kein 'existing'-Eintrag, kein
      // 'brokenAnchor'-Eintrag. Renderer markiert spaeter als broken-link.
      continue;
    }

    if (!anchor) {
      existing.push(target);
      continue;
    }

    // 4T-0054: Anker pruefen. Es reicht, wenn EIN Kandidat den Anker fuehrt.
    let anchorOk = false;
    for (const candPath of candidates) {
      if (anchorExistsInFile(entry, candPath, anchor)) {
        anchorOk = true;
        break;
      }
    }
    if (anchorOk) existing.push(target);
    else brokenAnchor.push(target);
  }
  return { status: 'ready', existing, brokenAnchor, ambiguous };
}

// 4T-0054: Prueft, ob die Datei einen Heading-Slug oder eine Block-ID
// fuehrt, die dem Anker entspricht. Anker mit '^'-Prefix sind Block-IDs;
// alle anderen werden via githubLikeSlug zu einem Slug normalisiert und
// gegen die Heading-Slugs der Datei geprueft.
function anchorExistsInFile(entry, filePath, anchor) {
  if (!entry || !entry.anchorsPerFile) return false;
  const meta = entry.anchorsPerFile.get(filePath);
  if (!meta) return false;
  if (typeof anchor !== 'string' || !anchor) return false;
  if (anchor.startsWith('^')) {
    const id = anchor.slice(1);
    return meta.blockIds.has(id);
  }
  const slug = githubLikeSlug(anchor);
  return meta.headings.has(slug);
}

// 4T-0050: Aufloesung eines Wiki-Link-Basenames ueber den Alias-Index.
// Wird vom Renderer aufgerufen, wenn die direkte Datei (basename.md
// relativ zum aktiven Dokument) nicht existiert. Liefert alle Dateien,
// die den gegebenen Basename als Alias fuehren.
//
// Rueckgabe:
//   { status: 'ready'|'indexing'|'unavailable', candidates: string[], viaAlias: string|null }
//
// candidates ist:
//   []         : kein Alias-Treffer (Linter markiert spaeter als broken)
//   [pfad]     : eindeutiger Alias-Treffer (Renderer oeffnet direkt)
//   [p1, p2..] : mehrdeutiger Alias-Treffer (Renderer zeigt Auswahl-Dialog)
//
// viaAlias enthaelt den eingegebenen Alias-Text (zur Anzeige im Dialog).
function resolveWikiTargetByAlias(activeFile, basename, areaRoot) {
  if (!activeFile || typeof basename !== 'string' || !basename) {
    return { status: 'unavailable', candidates: [], viaAlias: null };
  }
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', candidates: [], viaAlias: null };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', candidates: [], viaAlias: null };
  if (entry.status === 'oversized')
    return { status: 'unavailable', candidates: [], viaAlias: null };
  if (entry.status === 'indexing') return { status: 'indexing', candidates: [], viaAlias: null };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln.
  if (entry.status === 'error') return { status: 'unavailable', candidates: [], viaAlias: null };
  const candidates = filesByAlias(entry, basename);
  return {
    status: 'ready',
    candidates,
    viaAlias: candidates.length > 0 ? basename : null,
  };
}

// 4T-0055 (Epic 3E-0011): Schneidet aus dem Datei-Inhalt einen Anker-
// Snippet heraus. Wird vom embed:read-IPC-Handler genutzt fuer Markdown-
// Embeds mit Anker (![[Datei#Heading]] / ![[Datei#^id]]).
//
// Bei Heading-Anker: von der Heading-Zeile bis zur naechsten Heading mit
// gleichem oder hoeherem Rang (oder Datei-Ende). Heading-Zeile selbst ist
// Teil des Snippets. Fenced-Code-Bloecke werden uebersprungen, damit
// Markdown-Beispiele im Code nicht versehentlich als Heading gefunden
// werden.
//
// Bei Block-Anker (anchor.startsWith('^')): wird mit 4T-0064 AST-basiert
// aufgeloest — siehe extractBlockByAnchor. Das umschliessende Block-Element
// (Listen-Item inkl. Sub-Listen, Fenced-Code, Tabellen-Zeile, mehrzeiliger
// Blockquote, Paragraph) wird komplett extrahiert. Bei Parser-Fehler oder
// unbekannter Struktur Fallback auf die alte Zeilen-Heuristik (nur die
// Marker-Zeile selbst).
//
// Liefert null, wenn der Anker nicht gefunden wurde.

// 4T-0064 (Epic 3E-0012): Token-Typen, die als Block-Container gelten und
// das gesamte umschliessende Block-Konstrukt abdecken (mehrzeilige Listen-
// Items, Blockquotes, Tabellen-Zeilen, Fenced- und Indented-Code).
const EMBED_CONTAINER_TYPES = new Set([
  'list_item_open',
  'blockquote_open',
  'tr_open',
  'fence',
  'code_block',
  'html_block',
]);

// 4T-0064 (Epic 3E-0012): AST-basierte Block-Range-Erkennung fuer Block-
// Anker `^id`. Parst den Content mit markdown-it, findet die Source-Zeile
// mit dem `^id`-Marker und ermittelt das innerste Container-Block-Token,
// dessen token.map die Zeile einschliesst. Dessen Source-Range
// (lines[from..to]) ist der einzubettende Block. Wenn kein Container passt,
// wird auf den umschliessenden paragraph_open / heading_open zurueckgegriffen
// (Marker in einfachem Paragraph oder Heading).
//
// Liefert den extrahierten Block-Text mit entferntem `^id`-Marker, oder
// null bei Parser-Fehler bzw. wenn der Marker nicht zu einem Token
// zugeordnet werden kann (Fallback wird dann vom Aufrufer verwendet).
function extractBlockByAnchor(content, blockId, lines) {
  const escapedId = blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 4T-0064: Marker kann entweder mit Whitespace davor am Ende einer
  // Inhalts-Zeile stehen (typisch: `Text ^id`) oder allein am Zeilen-
  // anfang (typisch: nach einem Fenced Code Block, wo der Marker nicht
  // auf der Closing-Fence-Zeile stehen darf).
  const markerRe = new RegExp(`(?:^|\\s)\\^${escapedId}\\s*$`, 'u');
  // Marker-Zeile in den Source-Lines suchen.
  let markerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (markerRe.test(lines[i])) {
      markerLine = i;
      break;
    }
  }
  if (markerLine < 0) return null;

  let tokens;
  try {
    tokens = getEmbedParser().parse(String(content || ''), {});
  } catch {
    return null;
  }

  // Innerstes Container-Token finden, dessen map die Marker-Zeile abdeckt.
  // Container haben Vorrang vor paragraph_open / heading_open, damit ein
  // Marker innerhalb eines Listen-Items das gesamte Item (inkl. Sub-Listen)
  // liefert, statt nur den paragraph der Marker-Zeile.
  let bestToken = null;
  let fallbackToken = null;
  let fallbackTokenIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.map) continue;
    if (token.nesting === -1) continue;
    if (!(token.map[0] <= markerLine && markerLine < token.map[1])) continue;
    if (EMBED_CONTAINER_TYPES.has(token.type)) {
      bestToken = token;
    } else if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      fallbackToken = token;
      fallbackTokenIndex = i;
    }
  }
  let finalToken = bestToken || fallbackToken;
  if (!finalToken || !finalToken.map) return null;

  // Sonderfall fuer Fenced Code Blocks: der Marker `^id` kann nicht auf
  // der schliessenden ```-Zeile stehen (das wuerde den Fence-Close zer-
  // stoeren). Obsidian-Konvention ist daher `^id` auf einer eigenen Zeile
  // direkt nach dem Block. Wir erkennen das: wenn der bestToken ein
  // paragraph_open ist, der nur den Marker als Inhalt traegt, mappen wir
  // ihn auf das DIREKT VORANGEHENDE Container-Token.
  if (!bestToken && fallbackToken && fallbackToken.type === 'paragraph_open') {
    const inlineTok = tokens[fallbackTokenIndex + 1];
    const inlineContent =
      inlineTok && inlineTok.type === 'inline' ? String(inlineTok.content || '').trim() : '';
    if (inlineContent === '^' + blockId) {
      for (let k = fallbackTokenIndex - 1; k >= 0; k--) {
        const prev = tokens[k];
        if (!prev.map) continue;
        if (prev.nesting === -1) continue;
        if (EMBED_CONTAINER_TYPES.has(prev.type)) {
          finalToken = prev;
          break;
        }
      }
    }
  }

  // Block extrahieren; in der Marker-Zeile den `^id`-Marker entfernen.
  const blockStart = finalToken.map[0];
  const blockEnd = finalToken.map[1];
  if (blockEnd <= blockStart) return null;
  const blockLines = [];
  for (let i = blockStart; i < blockEnd; i++) {
    const line = lines[i] != null ? lines[i] : '';
    blockLines.push(i === markerLine ? line.replace(markerRe, '') : line);
  }
  return blockLines.join('\n');
}

function extractEmbedSnippet(content, anchor) {
  if (!anchor) return content;
  const lines = String(content || '').split(/\r?\n/);

  if (anchor.startsWith('^')) {
    const id = anchor.slice(1);
    // 4T-0064 (Epic 3E-0012): AST-basierte Block-Range-Erkennung. Erkennt
    // den umschliessenden Block (Listen-Item mit Sub-Inhalt, Code-Block,
    // Tabellen-Zeile, mehrzeiliger Blockquote) und extrahiert ihn vollstaen-
    // dig. Bei Fehler oder unbekannter Struktur Fallback auf die alte
    // Zeilen-Heuristik (eine Zeile mit dem Marker).
    const blockSnippet = extractBlockByAnchor(content, id, lines);
    if (blockSnippet !== null) return blockSnippet;
    // Fallback: nur die Marker-Zeile selbst (Verhalten vor 4T-0064).
    // 4T-0064: Pattern erlaubt jetzt auch Marker am Zeilenanfang ohne
    // Whitespace davor — symmetrisch zum AST-Pfad in extractBlockByAnchor.
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\s)\\^${escapedId}\\s*$`, 'u');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        return lines[i].replace(re, '');
      }
    }
    return null;
  }

  const wantedSlug = githubLikeSlug(anchor);
  let startLine = -1;
  let headingLevel = 0;
  let inFence = false;
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(HEADING_RE);
    if (m && githubLikeSlug(m[1]) === wantedSlug) {
      startLine = i;
      headingLevel = (lines[i].match(/^(#{1,6})/) || ['', ''])[1].length;
      break;
    }
  }
  if (startLine < 0) return null;

  let endLine = lines.length;
  inFence = false;
  fenceChar = null;
  for (let i = startLine + 1; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= headingLevel) {
      endLine = i;
      break;
    }
  }
  return lines.slice(startLine, endLine).join('\n');
}

// B-13 (4T-0175): Suchraum-Fallback fuer den Klick-Pfad. Loest einen
// Wiki-Link-Basename (auch Pfad-Form) gegen den VORHANDENEN Index auf —
// kein ensureIndex, gleicher Grundsatz wie existingWikiTargets. Damit ist
// jeder Treffer, den das Backlinks-Panel meldet, auch klickbar.
function resolveWikiTargetInIndex(activeFile, basename, areaRoot) {
  if (!activeFile || typeof basename !== 'string' || !basename) {
    return { status: 'unavailable', candidates: [] };
  }
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', candidates: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', candidates: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', candidates: [] };
  if (entry.status === 'indexing') return { status: 'indexing', candidates: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln.
  if (entry.status === 'error') return { status: 'unavailable', candidates: [] };
  return { status: 'ready', candidates: resolveWikiLink(entry, basename) };
}

// 4T-0453 (Epic 3E-0084): Graph-Daten der Graphenansicht — alle Markdown-
// Knoten des Suchraums plus gerichtete Link-Kanten aus dem Link-Graph-Cache
// (buildLinkGraph, 4T-0402). Read-only-View wie tagsFor: Status wird
// durchgereicht, kein eigener Scan. Der Bereichs-Graph-Tab fragt ohne aktive
// Datei an (filePath null, areaRoot gesetzt); das Datei-Graph-Panel liefert
// die aktive Datei mit. Außerhalb eines Bereichs arbeitet die Ansicht über
// den Best-Effort-Suchraum der Ordner-Wurzel (Epic-Architekturentscheidung 4);
// meta.isArea kennzeichnet das Ergebnis für den Hinweis der Ansicht.
function graphFor(filePath, areaRoot) {
  let root;
  if (areaRoot && !filePath) {
    // Bereichs-Fall ohne aktive Datei: die Bereichs-Wurzel ist der Suchraum.
    try {
      root = path.resolve(areaRoot);
    } catch {
      root = null;
    }
  } else {
    root = resolveRootInfo(filePath, areaRoot).root;
  }
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };
  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const nodes = [];
  for (const absPath of entry.files.keys()) {
    nodes.push({ path: absPath, name: logicalNameFor(absPath) });
  }
  const edges = [];
  for (const [src, outs] of entry.linkGraph.outMap) {
    for (const target of outs) edges.push({ from: src, to: target });
  }
  return {
    status: 'ready',
    meta: {
      wurzel: root,
      isArea: !!entry.isArea,
      fileCount: entry.fileCount,
      skippedDirs: entry.skippedDirs || 0,
    },
    nodes,
    edges,
  };
}

// 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen eines Bereichs fuer den
// Erinnerungs-Pruefer — schlanker Lese-Pfad auf tasksPerFile ohne
// Query-Auswertung (die Anker stecken in den Roh-Zeilen, es gibt keine
// zusaetzlichen Index-Felder und damit keinen Cache-Schema-Bump).
// Rueckgabe null, solange der Index fehlt oder nicht bereit ist — der
// Aufrufer unterscheidet "noch nicht bereit" von "keine Treffer".
function areaTaskLines(rootPath) {
  if (!rootPath) return null;
  const root = path.resolve(rootPath);
  const entry = indexes.get(root);
  if (!entry || entry.status !== 'ready') return null;
  // 4T-0951 (Befund E-06): Puffer-Overlay freigeschaltet. Eine gerade
  // getippte Erinnerung wird damit fällig, eine gerade gelöschte meldet sich
  // nicht mehr — ohne dass gespeichert werden muss. Das wiegt schwerer als
  // seine Häufigkeit, weil eine ausbleibende Erinnerung nicht auffällt.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const out = [];
  for (const [absPath, taskLines] of sicht.tasksPerFile) {
    for (const tl of taskLines) {
      out.push({ path: absPath, zeile: tl.zeile, text: tl.text });
    }
  }
  return out;
}

// 4T-0619 (Epic 3E-0117): Index-Anteil der Bereichs-Statistik — alle
// Kennzahlen, die der Index ohnehin fuehrt. Read-only-View wie graphFor:
// Status wird durchgereicht, kein eigener Scan, kein ensureIndex. Den
// Index-fremden Anteil (Nicht-Markdown, Ordner, Begleitdateien) erhebt
// src/main/area-stats.js und fuehrt beide Anteile zusammen.
//
// env.statusTypeOf ist der Status-Typ-Aufloeser der Aufgaben-Zustaende
// (createTaskStatusTypeResolver in main.js); ohne ihn gelten allein die
// festen Basis-Zeichen ' ' = offen und 'x'/'X' = erledigt.
function statsFor(areaRoot, env) {
  let root;
  try {
    root = areaRoot ? path.resolve(areaRoot) : null;
  } catch {
    root = null;
  }
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'indexing') return { status: 'indexing', wurzel: root };
  if (entry.status === 'oversized') return { status: 'oversized', wurzel: root };
  if (entry.status === 'error') return { status: 'error', wurzel: root };

  // Haeufigkeiten: je Tag bzw. je Eigenschafts-Schluessel die Anzahl DATEIEN.
  // Fundstellen zaehlt der Index nicht (er fuehrt Zuordnungen, keine Treffer-
  // Listen); die Seite spricht deshalb durchgehend von Dateien.
  const tags = [];
  for (const [tag, dateien] of entry.tagMap) tags.push({ name: tag, dateien: dateien.size });
  const eigenschaftsZaehler = new Map();
  for (const props of entry.propertiesPerFile.values()) {
    for (const schluessel of Object.keys(props || {})) {
      eigenschaftsZaehler.set(schluessel, (eigenschaftsZaehler.get(schluessel) || 0) + 1);
    }
  }
  const eigenschaften = [...eigenschaftsZaehler].map(([name, dateien]) => ({ name, dateien }));
  sortiereHaeufigkeit(tags);
  sortiereHaeufigkeit(eigenschaften);

  // Aufgaben nach Zustand. Die drei Kategorien sind vollstaendig und
  // ueberschneidungsfrei: NON_TASK zaehlt gar nicht, DONE und CANCELLED
  // haben ihre eigene Kategorie, alles Uebrige gilt als offen — auch ein
  // Zeichen ohne Status-Semantik, das ist eine Checkbox ohne Haken.
  const statusTypeOf =
    env && typeof env.statusTypeOf === 'function' ? env.statusTypeOf : () => null;
  const aufgaben = { gesamt: 0, offen: 0, erledigt: 0, abgebrochen: 0 };
  for (const taskLines of entry.tasksPerFile.values()) {
    for (const tl of taskLines) {
      const model = parseTaskLine(tl.text);
      if (!model) continue;
      const typ = statusTypeOf(model.statusChar);
      if (typ === 'NON_TASK') continue;
      aufgaben.gesamt += 1;
      if (typ === 'DONE') aufgaben.erledigt += 1;
      else if (typ === 'CANCELLED') aufgaben.abgebrochen += 1;
      else aufgaben.offen += 1;
    }
  }

  // Roh-Zahlen der ausgehenden Verweise, getrennt nach Link-Art.
  let wikiVerweise = 0;
  let mdVerweise = 0;
  for (const treffer of entry.files.values()) {
    for (const h of treffer) {
      if (h.linkTyp === 'wiki') wikiVerweise += 1;
      else if (h.linkTyp === 'md') mdVerweise += 1;
    }
  }

  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const { inMap } = entry.linkGraph;
  let ohneEingehende = 0;
  const eingehendJeDatei = [];
  for (const absPath of entry.files.keys()) {
    const anzahl = (inMap.get(absPath) || []).length;
    if (anzahl === 0) ohneEingehende += 1;
    eingehendJeDatei.push({ ...dateiKopf(absPath), eingehend: anzahl });
  }

  const groesste = [];
  const juengste = [];
  for (const absPath of entry.files.keys()) {
    groesste.push({ ...dateiKopf(absPath), bytes: entry.fileSizes.get(absPath) || 0 });
    const stat = entry.fileStats.get(absPath);
    juengste.push({ ...dateiKopf(absPath), mtimeMs: (stat && stat.mtimeMs) || 0 });
  }
  groesste.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  juengste.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  eingehendJeDatei.sort((a, b) => b.eingehend - a.eingehend || a.name.localeCompare(b.name));

  return {
    status: 'ready',
    wurzel: root,
    markdown: { anzahl: entry.fileCount, bytes: entry.byteSize },
    dateiPfade: [...entry.files.keys()],
    tags,
    eigenschaften,
    aliase: entry.aliasMap.size,
    aufgaben,
    verweise: { wiki: wikiVerweise, markdown: mdVerweise, ohneEingehende },
    auffaelligkeiten: {
      groesste: groesste.slice(0, TOP_N),
      juengste: juengste.slice(0, TOP_N),
      meistverlinkt: eingehendJeDatei.filter((e) => e.eingehend > 0).slice(0, TOP_N),
    },
    uebersprungeneOrdner: entry.skippedDirs || 0,
  };
}

// 4T-0619: Laenge der Top-Listen der Auffaelligkeiten.
const TOP_N = 10;

// Absteigend nach Anzahl, bei Gleichstand alphabetisch — deterministische
// Ordnung, damit wiederholte Aufrufe dieselbe Liste liefern.
function sortiereHaeufigkeit(liste) {
  liste.sort((a, b) => b.dateien - a.dateien || a.name.localeCompare(b.name));
}

// Anzeige-Kopf einer Datei fuer die Top-Listen: voller Pfad (Klick-Ziel und
// Tooltip) plus logischer Name (Anzeige, U+2215-Form der Unterseiten).
function dateiKopf(absPath) {
  return { pfad: absPath, name: logicalNameFor(absPath) };
}

module.exports = {
  attachBroadcast,
  // 4T-0348 (Epic 3E-0062): markSelfWriting-Injection fuer das Cache-Schreiben.
  attachSelfWriter,
  backlinksFor,
  releaseRoot,
  // B-02 (4T-0175): Fenster-Schliessen gibt alle Roots des webContents frei.
  releaseAllForOwner,
  // B-13 (4T-0175): Index-Fallback fuer den Klick-Pfad.
  resolveWikiTargetInIndex,
  rootForActiveFile,
  // B-18 (4T-0187): Bedarfs-Aufbau fuer Tag-Sidebar/Autocomplete/Linter.
  ensureIndexForDemand,
  // 4T-0348 (Epic 3E-0062): proaktiver Bereichs-Index beim Bereichs-Oeffnen.
  ensureAreaIndex,
  // 4T-0020: Linter-Lookup fuer broken-wiki-link.
  existingWikiTargets,
  // 4T-0050: Aliases-Aufloesung fuer Wiki-Link-Klick.
  resolveWikiTargetByAlias,
  // 4T-0055: Anker-Snippet-Extraktion fuer Wiki-Embeds.
  extractEmbedSnippet,
  // 4T-0056: Tag-System.
  tagsFor,
  // 4T-0354 (Epic 3E-0065): Frontmatter-Abfrage.
  frontmatterQueryFor,
  // 4T-0935 (Befund B-08): Puffer-Overlay der gerenderten Ansicht.
  setBufferOverlay,
  clearBufferOverlay,
  clearAllBufferOverlays,
  // 4T-0948 (Befund E-01): Roh-Text der Schicht fuer die Wiki-Einbettung.
  bufferTextFor,
  // 4T-0515 (Epic 3E-0092): Ereignis-Aggregation ueber das Frontmatter.
  eventsForQuery,
  // 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen fuer den Erinnerungs-Pruefer.
  areaTaskLines,
  // 4T-0413 (Epic 3E-0078): Daten-Snapshot der Skript-Bloecke.
  scriptDataFor,
  // 4T-0453 (Epic 3E-0084): Graph-Daten der Graphenansicht.
  graphFor,
  // 4T-0619 (Epic 3E-0117): Index-Anteil der Bereichs-Statistik; die
  // Ignorier-Regel teilt sich der ergaenzende Scan in area-stats.js mit
  // Initial-Scan und Watcher (eine Regel, keine Kopie).
  statsFor,
  isIgnoredDirName,
  // 4T-0408 (Epic 3E-0077): Invalidierung der Block-Ebene nach blockData-
  // Mutationen (blockData:changed-Datenpfad in main.js); extractBlockEntries
  // (rein, raw -> Eintraege) zusaetzlich fuer den Unit-Test des Lese-Pfads.
  updateBlockDataForFile,
  extractBlockEntries,
  // 4T-0057: Autocomplete-Suggestions.
  wikiLinkAutocompleteSuggestions,
  anchorAutocompleteSuggestions,
  tagAutocompleteSuggestions,
};
