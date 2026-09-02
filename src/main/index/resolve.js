// 4T-000977 (Epic 3E-000196): Ziel-Auflösung des Index, herausgelöst aus
// src/main/backlinks.js. Löst Wiki-Link-Basenames (Namens-, Pfad- und
// Unterseiten-Form) und Aliases gegen den Index auf, prüft Linter-Ziele samt
// Ankern (existingWikiTargets) und sammelt die Backlinks der aktiven Datei
// (backlinksFor als Haupt-API der IPC-Handler).

'use strict';

const path = require('node:path');
const { githubLikeSlug } = require('../../shared/markdown/slug.js');
const { SUBPAGE_SEP, expandRelativeTarget, isRelativeTarget } = require('../../shared/subpages.js');
const { MD_EXT_RE, normalizeNameKey } = require('../../shared/markdown/link-scan.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { ensureIndex } = require('./lifecycle.js');

// 4T-000050: Liefert alle Dateien im Index, die den gegebenen Alias fuehren.
// Case-insensitive Lookup. Leeres Array bei keinem Treffer.
function filesByAlias(entry, alias) {
  if (!alias) return [];
  const set = entry.aliasMap.get(String(alias).trim().toLowerCase());
  if (!set) return [];
  return [...set];
}

// Aufloesung von Wiki-Link-Treffern: zielBasename wird gegen alle Dateien
// im Index gematcht, deren Basename ohne Markdown-Extension passt. Mehrere
// Treffer pro Wiki-Link sind erlaubt (Namens-Konflikt).
// B-04/B-23 (4T-000175): Vergleich case-insensitiv und NFC-normalisiert —
// der Klick-Pfad (NTFS) und die Alias-Map entscheiden bereits so; vorher
// meldete der Linter [[readme]] als broken, obwohl der Klick README.md
// oeffnete.
// B-13 (4T-000175): Pfad-Ziele ([[sub/Datei]]) matchen per Suffix gegen den
// Datei-Pfad, wie es der dokument-relative Klick-Pfad effektiv tut.
// 4T-000336 (Epic 3E-000061): getrennte Treffer-Mengen fuer Namens-, Pfad- und
// Unterseiten-Form. Der Linter nutzt Pfad- und Unterseiten-Menge fuer die
// Mehrdeutigkeits-Meldung; resolveWikiLink kombiniert mit Pfad-Vorrang
// (Epic-Entscheidung: bestehendes B-13-Verhalten bricht nicht).
// 4T-001288: Suffix-Map der Pfad-Form, lazy gebaut und in build.js bei jeder
// Aenderung der Pfad-Menge invalidiert (entry.pathSuffixMap = null).
//
// Hintergrund: Die Pfad-Form lief vorher linear ueber alle Dateien, mit
// normalizeNameKey je Datei UND je Aufruf — unter der Annahme «selten
// genutzt». Der migrierte Obsidian-Bestand des Product Owners bricht sie
// (879 Pfad-Links auf 6483 Dateien): Jede Backlinks-Anfrage loeste rund 5,7
// Millionen Normalisierungen aus und blockierte den UI-Thread des
// Hauptprozesses sekundenlang, samt der OS-Eingabe-Zustellung an alle
// Fenster (Analyse 4T-001287, CPU-Profil).
//
// Die Map traegt je Datei alle ECHTEN Segment-Suffixe ihres normalisierten
// Pfads (mindestens ein fuehrendes Segment bleibt uebrig) — exakt die Menge,
// die das bisherige fileKey.endsWith('/' + wanted) treffen konnte. Der volle
// Pfad ist bewusst NICHT enthalten: Ihn traf das alte Kriterium wegen des
// verlangten fuehrenden '/' ebenfalls nie.
function ensurePathSuffixMap(entry) {
  if (entry.pathSuffixMap) return entry.pathSuffixMap;
  const map = new Map();
  for (const f of entry.files.keys()) {
    const fileKey = normalizeNameKey(f.replace(MD_EXT_RE, '')).replace(/\\/g, '/');
    const segmente = fileKey.split('/');
    let suffix = '';
    for (let i = segmente.length - 1; i > 0; i -= 1) {
      suffix = suffix === '' ? segmente[i] : `${segmente[i]}/${suffix}`;
      let set = map.get(suffix);
      if (!set) {
        set = new Set();
        map.set(suffix, set);
      }
      set.add(f);
    }
  }
  entry.pathSuffixMap = map;
  return map;
}

function resolveWikiLinkDetailed(entry, zielBasename) {
  const wanted = normalizeNameKey(String(zielBasename).replace(MD_EXT_RE, '')).replace(/\\/g, '/');
  if (!wanted.includes('/')) {
    // B-15 (4T-000181): O(1) ueber die inverse Namens-Map statt linear ueber
    // alle Dateien (vorher O(Hits x Dateien) in collectBacklinksFor).
    // Deckt auch bereits expandierte Unterseiten-Namen in U+2215-Form ab.
    const set = entry.nameMap.get(wanted);
    return { nameMatches: set ? [...set] : [], pathMatches: [], subpageMatches: [] };
  }
  // Pfad-Form (B-13): seit 4T-001288 O(1) ueber die Suffix-Map (siehe oben);
  // Verhalten identisch zum frueheren endsWith('/' + wanted)-Scan.
  const pset = ensurePathSuffixMap(entry).get(wanted);
  const pathMatches = pset ? [...pset] : [];
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
// 4T-000050: Aliases-aware. Ein Wiki-Link [[MV]] aus quelle.md gilt als
// Backlink auf die aktive Datei, wenn entweder
//   (a) die aktive Datei den Basename 'MV' hat, oder
//   (b) die aktive Datei einen Alias 'MV' im Frontmatter fuehrt.
// Im Treffer wird viaAlias='MV' gesetzt, wenn (b) zutrifft; sonst null.
function collectBacklinksFor(activeFile, entry) {
  const activeAbs = path.resolve(activeFile);
  // 4T-000050: Aliases der aktiven Datei (case-insensitive Vergleich gegen
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
          // 4T-000050: Alias-Match? Nur greifen, wenn kein direkter
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
// B-01 (4T-000175): ownerKey identifiziert den anfragenden Kontext
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
  // B-21 (4T-000187): Watcher-Fehler-Status an das Panel melden.
  if (entry.status === 'error') {
    return { status: 'error', meta: { wurzel: root } };
  }
  const results = collectBacklinksFor(filePath, entry);
  return {
    status: 'ready',
    // B-22 (4T-000187): skippedDirs fuer den Panel-Hinweis.
    meta: { wurzel: root, fileCount: entry.fileCount, skippedDirs: entry.skippedDirs || 0 },
    results,
  };
}

// B-17 (4T-000183): fileBelongsToRoot entfernt — exportiert, aber ohne
// Aufrufer, und die Semantik (reiner Prefix-Match) entsprach nicht dem
// Owner-basierten Root-Modell seit 4T-000175/4T-000181.

// 4T-000020: Lookup fuer den Markdown-Linter. Liefert fuer eine Liste von
// Wiki-Link-Basenames das Set derjenigen, deren Ziel im Suchraum der aktiven
// Datei existiert. Aufrufer (Renderer-Linter) entscheidet anhand des Status,
// ob er die broken-wiki-link-Regel anwenden darf:
// - 'ready': Index ist verfuegbar, 'existing' ist verbindlich.
// - 'indexing': Index wird gerade aufgebaut, Regel temporaer unterdruecken.
// - 'unavailable': kein Suchraum (z.B. unbenannte Datei) oder Index
//   oversized, Regel ebenfalls unterdruecken.
// B-18 (4T-000187): Der Index-AUFBAU wird nicht mehr hier, sondern im IPC-
// Handler ueber ensureIndexForDemand angestossen (Owner-Modell macht das
// seit 4T-000175 leak-frei); diese Funktion bleibt ein reiner Read-Pfad.
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
  // W-07 (4T-000309): Fehler-Status wie unavailable — sonst markiert der Linter
  // gegen den Stale-Index neue Dateien faelschlich als broken.
  if (entry.status === 'error')
    return { status: 'unavailable', existing: [], brokenAnchor: [], ambiguous: [] };
  const existing = [];
  const brokenAnchor = [];
  // 4T-000336 (Epic 3E-000061): Ziele, bei denen Ordner-Pfad-Form und
  // Unterseiten-Form auf verschiedene Dateien zeigen (Linter-Hinweis).
  const ambiguous = [];
  const activeFileAbs = path.resolve(filePath);

  for (const target of targets) {
    if (typeof target !== 'string' || !target) continue;
    // 4T-000054: Anker-Trennung. '#' beendet den Pfad-Teil. Reiner Anker
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

    // 4T-000336: relative Unterseiten-Formen gegen die aktive Datei
    // expandieren; '..' auf Top-Level bleibt unaufloesbar (broken).
    let lookupName = basename;
    if (isRelativeTarget(basename)) {
      const ownBase = path.basename(activeFileAbs).replace(MD_EXT_RE, '');
      const expanded = expandRelativeTarget(ownBase, basename);
      if (!expanded) continue;
      lookupName = expanded;
    }

    // 4T-000050: Datei direkt oder ueber Alias auflösen.
    // 4T-000336: getrennte Treffer-Mengen fuer die Mehrdeutigkeits-Meldung.
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

    // 4T-000054: Anker pruefen. Es reicht, wenn EIN Kandidat den Anker fuehrt.
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

// 4T-000054: Prueft, ob die Datei einen Heading-Slug oder eine Block-ID
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

// 4T-000050: Aufloesung eines Wiki-Link-Basenames ueber den Alias-Index.
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
  // W-07 (4T-000309): Fehler-Status wie unavailable behandeln.
  if (entry.status === 'error') return { status: 'unavailable', candidates: [], viaAlias: null };
  const candidates = filesByAlias(entry, basename);
  return {
    status: 'ready',
    candidates,
    viaAlias: candidates.length > 0 ? basename : null,
  };
}

// B-13 (4T-000175): Suchraum-Fallback fuer den Klick-Pfad. Loest einen
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
  // W-07 (4T-000309): Fehler-Status wie unavailable behandeln.
  if (entry.status === 'error') return { status: 'unavailable', candidates: [] };
  return { status: 'ready', candidates: resolveWikiLink(entry, basename) };
}

module.exports = {
  filesByAlias,
  resolveWikiLink,
  // 4T-001288: fuer den Kosten-Waechter-Test exportiert (Suffix-Map-Semantik
  // und Aufruf-Schranke werden am entry-Objekt direkt geprueft).
  resolveWikiLinkDetailed,
  backlinksFor,
  existingWikiTargets,
  resolveWikiTargetByAlias,
  resolveWikiTargetInIndex,
};
