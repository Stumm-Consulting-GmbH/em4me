// 4T-0977 (Epic 3E-0196): Verzeichnis-Scan des Backlinks-Index, herausgelöst
// aus src/main/backlinks.js. Sammelt die Markdown-Dateien einer Wurzel samt
// Größen und Zeitstempeln und trägt die Scan-Konstanten (Tiefe, Caps,
// Batch-Größe), die auch der Aufbau- und Watcher-Pfad (build.js) nutzt.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');

// Konstanten
const SCAN_DEPTH = 2;
const MAX_FILES = 2000;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
// B-14 (4T-0181): Batch-Groesse fuer das Yielding beim Async-Aufbau.
const BUILD_BATCH_SIZE = 50;

// B-03/B-12 (4T-0175): gemeinsame Ignore-Regel fuer Initial-Scan und
// Watcher — node_modules und alle Punkt-Ordner bleiben draussen.
function isIgnoredDirName(name) {
  return name === 'node_modules' || name.startsWith('.');
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

module.exports = {
  SCAN_DEPTH,
  MAX_FILES,
  MAX_BYTES,
  BUILD_BATCH_SIZE,
  isIgnoredDirName,
  collectMarkdownFiles,
};
