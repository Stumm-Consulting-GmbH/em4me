// 4T-0632 (Epic 3E-0102): Demo-Area — Erstell-Logik ohne UI.
//
// Die mitgelieferten Demo-Inhalte (src/demo/, ausschließlich englisch,
// PO-Entscheidung vom 2026-07-16) werden in einen vom Nutzer gewählten
// LEEREN Ordner kopiert; der Aufrufer (main.js) öffnet den Ordner danach
// über den bestehenden „Bereich öffnen"-Pfad. Es wird niemals
// überschrieben: jeder vorhandene Eintrag (auch versteckte Dateien) macht
// den Zielordner „nicht leer" — die strengste und am klarsten erklärbare
// Regel (Epic-Abgrenzung).
//
// Modul ist zur Ladezeit electron-frei (unit-testbar); der Quell-Ordner
// liegt in der asar und wird über Electrons gepatchtes fs gelesen (auch
// Binär-Anlagen wie PNG/PDF).
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

// Quell-Ordner der Demo-Inhalte (wandert über die src/**-Packliste in die EXE).
const DEMO_SOURCE_DIR = path.join(__dirname, '..', '..', 'demo');

// Ziel-Prüfung als reine Funktion: leer heißt „kein einziger Eintrag".
function isEmptyDirListing(entries) {
  return Array.isArray(entries) && entries.length === 0;
}

// Rekursives Kopieren Quelle → Ziel über readdir/readFile/writeFile.
// Bewusst kein fs.cp: der Weg über readFile/writeFile ist aus der asar
// heraus zuverlässig und Binär-sicher (Buffer).
async function copyDirRecursive(srcDir, destDir) {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await fsp.mkdir(to, { recursive: true });
      await copyDirRecursive(from, to);
    } else {
      await fsp.writeFile(to, await fsp.readFile(from));
    }
  }
}

// Erstellt die Demo-Area im Zielordner. Rückgabe:
//   { ok: true } | { ok: false, error: 'not-found' | 'not-empty' | 'copy-failed' }.
// srcDir ist nur für Tests injizierbar.
async function createDemoAreaAt(targetDir, srcDir = DEMO_SOURCE_DIR) {
  let entries;
  try {
    entries = await fsp.readdir(targetDir);
  } catch {
    return { ok: false, error: 'not-found' };
  }
  if (!isEmptyDirListing(entries)) return { ok: false, error: 'not-empty' };
  try {
    await copyDirRecursive(srcDir, targetDir);
  } catch (err) {
    console.warn('[demo-area] Kopieren fehlgeschlagen:', err && err.message ? err.message : err);
    return { ok: false, error: 'copy-failed' };
  }
  return { ok: true };
}

module.exports = { DEMO_SOURCE_DIR, isEmptyDirListing, copyDirRecursive, createDemoAreaAt };
