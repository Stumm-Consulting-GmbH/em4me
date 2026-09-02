// Datei-Fixtures der E2E-Suite zu den Büchern: das Anlegen eines vollständigen
// Test-Buchs im Temp-Verzeichnis, das Aufräumen danach und die Lese-Helfer auf
// seine Begleitdatei.
//
// 4T-001190 (Epic 3E-000221): Auszug aus buch.spec.js, erzwungen vom Datei-Budget
// der Test-Dateien, als der Race-Fix des Panel-Helfers die Datei über 800
// Zeilen hob. Der Schnitt folgt der Fachlichkeit nach dem Vorbild von
// profil-bereich.js: Was hier steht, ist AUFBAU und kein Prüffall, und es
// arbeitet ausschließlich auf dem Dateisystem — keine Selektoren, keine
// Playwright-Mechanik. Die Bedien-Helfer der Suite bleiben deshalb bewusst in
// der Spec, wo sie neben ihren Fällen stehen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { leseJsonOderNull } = require('./dateien');
const { BOOK_SETTINGS_FILENAME } = require('../../../src/shared/books/book-core.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-buch-'));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

// Legt ein vollständiges Test-Buch an (Muster der Datei-Fixtures in
// bereichs-panel.spec.js: zur Laufzeit im Temp-Verzeichnis statt unter
// test/fixtures/, weil der Bestand veränderlich ist).
//
//   Reise/Reise.md              Buch-Datei (von der Begleitdatei benannt)
//   Reise/Aufbruch.md           Kapitel, oberste Ebene
//   Reise/Teil2/Heimkehr.md     Unterkapitel von Aufbruch — die Ordner-Lage ist
//                               bewusst eine ANDERE als die Baum-Lage
//   Reise/Schluss.md            Kapitel, oberste Ebene
//   Reise/Anhang.md             Markdown-Datei ohne Baum-Eintrag („nicht
//                               eingehängt")
//
// Ordnernamen ohne Leerzeichen, damit die Prüfung relativer Markdown-Links in
// BU-06 nicht an der URL-Kodierung hängt.
function makeBook(parentDir, name = 'Reise') {
  const bookDir = path.join(parentDir, name);
  fs.mkdirSync(path.join(bookDir, 'Teil2'), { recursive: true });
  fs.writeFileSync(path.join(bookDir, `${name}.md`), `# ${name}\n`, 'utf8');
  fs.writeFileSync(path.join(bookDir, 'Aufbruch.md'), '# Aufbruch\n', 'utf8');
  fs.writeFileSync(path.join(bookDir, 'Teil2', 'Heimkehr.md'), '# Heimkehr\n', 'utf8');
  fs.writeFileSync(path.join(bookDir, 'Schluss.md'), '# Schluss\n', 'utf8');
  fs.writeFileSync(path.join(bookDir, 'Anhang.md'), '# Anhang\n', 'utf8');
  fs.writeFileSync(
    path.join(bookDir, BOOK_SETTINGS_FILENAME),
    JSON.stringify(
      {
        schemaVersion: 1,
        book: { file: `${name}.md` },
        chapters: [
          { path: 'Aufbruch.md', children: [{ path: 'Teil2/Heimkehr.md', children: [] }] },
          { path: 'Schluss.md', children: [] },
        ],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return bookDir;
}

// Alle Dateien eines Baums als sortierte, relative Pfade — Grundlage der
// Aussage „keine Datei wurde bewegt".
function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

function settingsPathOf(bookDir) {
  return path.join(bookDir, BOOK_SETTINGS_FILENAME);
}

// Pfade der obersten Baum-Ebene aus der Begleitdatei; null, solange die Datei
// nicht vollständig geschrieben ist (Warte-Bedingung, die den Inhalt liefert).
function declaredTopLevel(bookDir) {
  const container = leseJsonOderNull(settingsPathOf(bookDir));
  return container && Array.isArray(container.chapters)
    ? container.chapters.map((node) => node.path)
    : null;
}

module.exports = {
  makeTempDir,
  removeDir,
  makeBook,
  listFiles,
  settingsPathOf,
  declaredTopLevel,
};
