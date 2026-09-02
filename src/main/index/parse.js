// 4T-000977 (Epic 3E-000196): Datei-Parser des Backlinks-Index, herausgelöst aus
// src/main/backlinks.js. Extrahiert aus einer Markdown-Datei die Link-Treffer,
// Aliases, Heading-Slugs, Block-IDs, Tags, Frontmatter-Properties und
// Task-Zeilen. Alle Funktionen sind zustandsfrei gegenüber dem Index (reine
// Eingabe → Ergebnis); die Eintrags-Pflege übernimmt build.js, die Leser der
// blockData-Sektion der .mdd-Begleitdatei liegen in block-data.js.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
// 4T-000050 (Epic 3E-000010): js-yaml fuer Frontmatter-Aliases-Auswertung
// (SAFE-Schema, kein Code-Eval).
const yaml = require('js-yaml');
// W-06 (4T-000310): Heading-Slug aus der gemeinsamen Quelle (Single Source),
// statt einer lokalen Kopie — verhindert Divergenz zwischen Backlinks-/
// Autocomplete-Ankern und dem Render-Pfad.
const { githubLikeSlug } = require('../../shared/markdown/slug.js');
// 4T-000336 (Epic 3E-000061): Unterseiten-Namens-Logik (U+2215-Trennzeichen,
// Slash-Uebersetzung, Expansion relativer Ziele) aus der gemeinsamen Quelle.
const { expandRelativeTarget, isRelativeTarget } = require('../../shared/subpages.js');
// 4T-000344 (Epic 3E-000062): Erkennungs-Bausteine (Link-Regexe, Inline-Code-
// Maskierung, Frontmatter-Grenze, Namens-Normalisierung) aus der gemeinsamen
// Quelle, damit Backlinks-Index und Rewrite-Kern dieselben Stellen als Link
// erkennen (keine duplizierten Patterns).
const {
  MD_EXT_RE,
  FENCE_RE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
  maskInlineCode,
  frontmatterBodyStart,
} = require('../../shared/markdown/link-scan.js');
// 4T-000363 (Epic 3E-000067): Block-Anker-Regex aus der gemeinsamen, prozess-
// neutralen Quelle (Single Source). Dieselbe Definition nutzt der Renderer-
// Abgleich des Block-Metadaten-Panels, damit Index (`blockIds`) und Panel
// dieselben Anker als Block-Anker erkennen.
const { BLOCK_ANCHOR_RE } = require('../../shared/block-anchors.js');
// 4T-000502 (Epic 3E-000096): Marker-Kern fuer den TASKS-Scope der Abfrage —
// Task-Zeilen werden beim Indexieren als Roh-Zeilen gesammelt und erst im
// Query-Zweig zum Modell geparst (Index bleibt schlank, Re-Parse trivial).
const { parseTaskLine } = require('../../shared/tasks/task-markers.js');
// 4T-000348 (Epic 3E-000062): Hash fuer die Index-Persistenz (Cache-Absicherung
// des Parse-Ergebnisses).
const { hashText } = require('../documents/mdd-store.js');

// B-19 (4T-000181): Einzeldatei-Limit — groessere Dateien werden nicht
// geparst (Index bleibt funktionsfaehig, Datei traegt keine Links bei).
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SNIPPET_MAX = 120;
// 4T-000344 (Epic 3E-000062): eine Instanz je Modul-Ladung; lastIndex wird pro Zeile
// zurueckgesetzt (unveraendertes Verhalten der frueheren Modul-Konstante).
// MD_EXT_RE und FRONTMATTER_END_LINE kommen jetzt aus der gemeinsamen Quelle.
const WIKI_LINK_RE = createWikiLinkRegex();

// B-10 (4T-000175): Heading-Text vor dem Sluggen um Link-Syntax reduzieren,
// wie es der Renderer ueber den Token-Text effektiv tut: [[Ziel|Label]] ->
// Label, [[Ziel]] -> Ziel, [Text](url) -> Text.
function reduceHeadingText(s) {
  return String(s || '')
    .replace(/\[\[([^\]\n|]+)\|([^\]\n]+)\]\]/g, '$2')
    .replace(/\[\[([^\]\n]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

// 4T-000054: ATX-Heading-Erkennung (1-6 Hashes plus mind. ein Leerzeichen).
// Optionaler Trailing-Hash (`# Heading #`) wird abgeschnitten.
const HEADING_RE = /^#{1,6}\s+(.+?)(?:\s+#{1,6})?\s*$/;

// 4T-000056: Inline-Tags `#tag` im Body. Gleiches Pattern wie tagsPlugin in
// preload.js. Negativer Look-behind verhindert Treffer mitten in Woertern
// (z.B. 'foo#bar'), nach `##` (Markdown-Heading-Doppelhash) und in
// Markdown-Link-Zielen `](#anker)` (4T-000060).
const TAG_RE = /(?<![\p{L}\p{N}_#])(?<!\]\()#([\p{L}\p{N}_/-]+)/gu;
// 4T-000060: Hex-Farbcodes (3-, 4-, 6- oder 8-stellig, alles Hex) sind kein
// Tag. Schliesst CSS-Farb-Notationen wie #fff, #ffffff, #c0392b aus.
const HEX_COLOR_RE = /^[0-9a-f]{3,8}$/i;
// 4T-000060: Tags muessen mindestens einen Buchstaben enthalten, damit reine
// Zahlen (Issue-Referenzen, Fussnoten) nicht als Tag indexiert werden.
const TAG_LETTER_RE = /[\p{L}]/u;

// 4T-000060: Pruefung, ob ein Tag-Kandidat tatsaechlich ein Tag ist.
function isValidTag(tag) {
  if (!tag) return false;
  if (tag.startsWith('/') || tag.endsWith('/')) return false;
  if (!TAG_LETTER_RE.test(tag)) return false; // reine Zahlen raus
  if (HEX_COLOR_RE.test(tag)) return false; // Hex-Codes raus
  return true;
}

// 4T-000344 (Epic 3E-000062): MD_LINK_RE (relative Markdown-Links) aus der
// gemeinsamen Quelle; eine Instanz je Modul-Ladung, lastIndex-Reset pro Zeile.
const MD_LINK_RE = createMdLinkRegex();

// Parst eine Datei und extrahiert alle Link-Treffer. Zielpfad wird beim
// Markdown-Link gegen das Datei-Verzeichnis aufgeloest und absolut gemacht.
// Wiki-Links speichern den Basename als ziel-Erwartung (ohne .md), Aufloesung
// passiert spaeter beim Lookup ueber die files-Map.
// 4T-000050: Liefert zusaetzlich die Aliases aus dem YAML-Frontmatter (Feld
// `aliases:`, Liste oder einzelner String). Wiki-Link- und Markdown-Link-
// Scan ueberspringt Frontmatter-Zeilen, damit YAML-Inhalte nicht als
// ausgehende Links indexiert werden.
function parseFile(filePath) {
  let content;
  try {
    // B-19 (4T-000181): Einzeldatei-Limit vor dem Lesen — uebergrosse
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
    // B-11 (4T-000175): null = Lesefehler (Aufrufer behaelt bestehende
    // Index-Daten); eine leere Datei liefert dagegen ein leeres Ergebnis.
    return null;
  }
  // 4T-000348 (Epic 3E-000062): SHA-256 des Roh-Inhalts als Cache-Absicherung
  // mitfuehren (die Abgleich-Entscheidung bleibt mtime+size).
  const parsed = parseContent(filePath, content);
  parsed.hash = hashText(content);
  return parsed;
}

// B-14 (4T-000181): Async-Variante fuer den Initial-Aufbau (kein Sync-IO im
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
  // M-04 (4T-000173): UTF-8-BOM entfernen — gleicher Fix wie in file:read
  // (main.js). Ohne Strip schluege die Frontmatter-Erkennung in Zeile 1
  // fehl und Aliases/Tags der Datei fehlten im Index. \uFEFF explizit
  // statt literalem BOM-Zeichen im Regex (unsichtbar, Lint-Befund).
  content = content.replace(/^\uFEFF/, '');
  const dir = path.dirname(filePath);
  const lines = content.split(/\r?\n/);

  // 4T-000050: Frontmatter erkennen. Heuristik wie in src/shared/markdown/frontmatter.js:
  // Zeile 1 muss genau '---' sein, Schluss-Zeile '---' oder '...' an
  // exaktem Zeilenanfang. fmBodyStartLine ist die 0-basierte Index der
  // ersten Markdown-Zeile nach dem Frontmatter (oder 0, wenn kein
  // Frontmatter erkannt).
  // 4T-000344 (Epic 3E-000062): Frontmatter-Grenze aus der gemeinsamen Quelle, damit
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
        // 4T-000354 (Epic 3E-000065): abfragbare Frontmatter-Properties mitnehmen.
        properties = extractProperties(parsed);
        // 4T-000056: Frontmatter-Tags akzeptieren YAML-Liste, einzelnen String
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
  // 4T-000054: Pro Datei zusaetzlich Heading-Slugs und Block-IDs sammeln,
  // damit existingWikiTargets Anker-Prueferungen machen kann. Fenced-
  // Code-Bloecke werden uebersprungen, damit Markdown-Beispiele im Code
  // nicht als echte Headings/Block-IDs zaehlen.
  const headings = [];
  const blockIds = [];
  // 4T-000502 (Epic 3E-000096): Task-Zeilen fuer den TASKS-Scope der Abfrage —
  // Roh-Zeile plus Zeilennummer plus Text der umgebenden Ueberschrift
  // (heading-Feld des Evaluators). Modell-Parsing erst im Query-Zweig.
  const tasks = [];
  let currentHeading = null;
  let inFence = false;
  let fenceChar = null;

  // B-10 (4T-000175): Slug-Deduplizierung wie markdown-it-anchor (x, x-1,
  // x-2 …), damit Linter und Autocomplete dieselben Anker sehen wie der
  // Renderer.
  const slugCounts = new Map();
  const pushHeadingSlug = (rawText) => {
    // 4T-000502: laufender Ueberschrifts-Text fuer die Task-Zeilen-Zuordnung.
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

    // 4T-000054: Heading-Erkennung (ATX).
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      pushHeadingSlug(headingMatch[1]);
    } else if (line.trim() !== '' && i + 1 < lines.length) {
      // B-10 (4T-000175): Setext-Headings (Text-Zeile mit ===- bzw. ----
      // Unterstreichung). Heuristik: '-'-Marker nur, wenn die Text-Zeile
      // nicht selbst Listen-/Quote-/Tabellen-Syntax ist (sonst waere es
      // ein Thematic Break bzw. eine Tabellen-Trennzeile).
      const next = lines[i + 1];
      const isEq = /^\s{0,3}=+\s*$/.test(next);
      const isDash = /^\s{0,3}-+\s*$/.test(next) && !/^\s*([-*+]\s|\d+[.)]\s|>|\||#)/.test(line);
      if (isEq || isDash) pushHeadingSlug(line);
    }

    // 4T-000054: Block-Anker am Zeilenende.
    const blockMatch = line.match(BLOCK_ANCHOR_RE);
    if (blockMatch) {
      blockIds.push(blockMatch[1]);
    }

    // 4T-000502 (Epic 3E-000096): Task-Zeilen sammeln (Checkbox-Zeilen laut
    // Marker-Kern; der Global Filter wird bewusst erst im Query-Zweig
    // angewandt, damit eine Filter-Aenderung keinen Index-Neuaufbau braucht).
    // Schnelle Kandidaten-Vorpruefung vor dem vollen Zeilen-Parse.
    if (TASK_CANDIDATE_RE.test(line) && parseTaskLine(line) !== null) {
      tasks.push({ zeile: lineNum, text: line, heading: currentHeading });
    }

    // 4T-000060 / B-07 (4T-000175): Link- und Tag-Scans laufen auf der inline-code-
    // maskierten Zeile (Offsets bleiben erhalten), damit `[[Beispiel]]` in
    // Inline-Code keinen Backlink erzeugt. Maskierungs-Logik liegt seit 4T-000344
    // in der gemeinsamen Quelle (link-scan.js).
    const lineForLinks = maskInlineCode(line);
    // B-08 (4T-000175): Wiki-Link-Spannen vor dem Tag-Scan maskieren, damit
    // [[#Heading]] bzw. [[Ziel#Anker]] nicht als Tag indexiert wird.
    // 4T-000202: ebenso {...}-Attribut-Bloecke (markdown-it-attrs) — '#id'
    // darin ist eine ID-Angabe, kein Tag (Konsistenz zum
    // insideAttrBlock-Guard im tagsPlugin).
    const lineForTags = lineForLinks
      .replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length))
      .replace(/\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
    TAG_RE.lastIndex = 0;
    let tagMatch;
    while ((tagMatch = TAG_RE.exec(lineForTags)) !== null) {
      const tag = tagMatch[1];
      // 4T-000060: Hex-Codes, reine Zahlen und Slash-Randlagen filtern.
      if (isValidTag(tag)) {
        tagsSet.add(tag);
      }
    }

    // Wiki-Links
    WIKI_LINK_RE.lastIndex = 0;
    let m;
    while ((m = WIKI_LINK_RE.exec(lineForLinks)) !== null) {
      // B-09 (4T-000175): escapte Pipe in Tabellen-Zellen ([[Ziel\|Label]])
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
      if (!ziel) continue; // 4T-000054: reiner Anker — kein externer Backlink
      // 4T-000336 (Epic 3E-000061): relative Unterseiten-Ziele ('/Name', '..')
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
      // 4T-000476 (Epic 3E-000088): Ziel/Anker über den Form-Helfer lesen — die
      // Regex erfasst seit 4T-000476 auch die <…>-Form mit Leerzeichen im Ziel.
      const { target: linkTarget, anchor: anker } = mdLinkTargetFromMatch(m);
      // Externe Links rausfiltern, falls Regex doch mal greift.
      if (/^[a-z]+:\/\//i.test(linkTarget) || linkTarget.startsWith('//')) continue;
      // B-05 (4T-000175): %-kodierte Ziele ([Text](Mein%20Ziel.md)) wie der
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

// 4T-000502 (Epic 3E-000096): schnelle Kandidaten-Vorpruefung fuer Task-Zeilen
// (Aufzaehlungszeichen plus '['), bevor der volle Marker-Kern-Parse laeuft.
const TASK_CANDIDATE_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[/;

// 4T-000050: Normalisiert das aliases-Feld eines Frontmatter-Objekts zu einer
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

// 4T-000354 (Epic 3E-000065): Frontmatter-Properties für die Abfrage extrahieren.
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

module.exports = {
  HEADING_RE,
  TAG_RE,
  isValidTag,
  parseFile,
  parseFileAsync,
  parseContent,
};
