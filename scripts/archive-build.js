// Postbuild-Aufgabe nach `npm run build`:
//   Versions-EXEs aus dist/ nach releases/ verschieben (Versions-Archiv)
//   und die Release-Notes der gebauten Version nach releases/ kopieren
//   (X-10, 4T-0182; auf die gebaute Version begrenzt seit 4T-0683).
// dist/ bleibt damit reiner Build-Output von electron-builder mit nur dem
// aktuellen Build; releases/ sammelt die Setup- und Portable-EXEs ueber alle
// Releases hinweg. Beide Ordner sind gitignored.
//
// X-01 (4T-0182): Tag-Guard. Existiert fuer die Version im EXE-Namen bereits
// ein lokaler Release-Tag v<version>, wird NICHT ueberschrieben (Exit 1):
// das faengt den vergessenen Versions-Bump ab, der zweimal offizielle
// Release-EXEs zerstoert hat (4T-0049, 4T-0054). Test-Iterationen derselben
// noch ungetaggten Zielversion ueberschreiben weiterhin.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
// 4T-0375 (Epic 3E-0070): Build-Nummer-Guard — reine Vergleichslogik.
const { buildNumberGuardError } = require('../src/shared/build-version');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');

// SemVer-Versions-Pattern: Major.Minor.Patch.
const VERSION_RE = /\d+\.\d+\.\d+/;
const EXE_PATTERN = new RegExp(
  `^(?:EM4me|Perspective Markdown\\+\\+|SCG Markdown|Markdown Viewer)-(${VERSION_RE.source})-(Setup|Portable)\\.exe$`,
);
const NOTES_PATTERN = new RegExp(`^release-notes-(${VERSION_RE.source})\\.md$`);

// 4T-0683: Version aus package.json, fuer den Notes-Filter. Ohne lesbare
// package.json gibt es keinen Build und damit auch keine Notes-Kopie.
function pkgVersionAusDatei() {
  try {
    return require('../package.json').version;
  } catch {
    return null;
  }
}

// Liefert true, wenn der lokale Git-Tag v<version> existiert.
function gitTagExists(version) {
  try {
    const out = execSync(`git tag -l v${version}`, { cwd: ROOT, encoding: 'utf8' });
    return out.trim() === `v${version}`;
  } catch {
    // Ohne Git-Auskunft lieber NICHT blockieren (z.B. Build ausserhalb
    // eines Klons); der Guard ist eine Zusatzsicherung.
    return false;
  }
}

// 4T-0375: Build-Nummer-Guard. Vergleicht die in build-info.json geschriebene
// Nummer mit der realen Commit-Anzahl des HEAD. Greift nur, wenn die
// Build-Info zur package.json-Version gehoert (Release-Fenster); in der
// laufenden Entwicklung (Versions-Mismatch oder Fallback-Zustand) steigt die
// Funktion ohne Git-Aufruf frueh aus. Liefert null oder eine Fehlermeldung.
function defaultGuardBuildNumber() {
  let info, pkgVersion;
  try {
    info = require('../src/shared/build-info.json');
    pkgVersion = require('../package.json').version;
  } catch {
    return null;
  }
  if (!info || info.version !== pkgVersion || !Number.isInteger(info.buildNumber)) return null;
  let gitCount;
  try {
    const out = execSync('git rev-list --count HEAD', { cwd: ROOT, encoding: 'utf8' });
    gitCount = parseInt(out.trim(), 10);
  } catch {
    // Ohne Git-Auskunft nicht blockieren (wie der Tag-Guard).
    return null;
  }
  return buildNumberGuardError(info, pkgVersion, gitCount);
}

// Verschiebt eine EXE; X-03 (4T-0182): Fehler pro Datei abfangen (typisch:
// Ziel-EXE laeuft gerade), gesammelt als Exit-Code melden statt halbfertig
// hart abzubrechen.
function moveFile(name, _opts) {
  const from = path.join(DIST, name);
  const to = path.join(RELEASES, name);
  if (!fs.existsSync(from)) return true;
  try {
    // K-05 (4T-0309): copy-then-delete statt delete-then-rename. Schlaegt der
    // Transfer fehl, bleibt die vorher archivierte EXE erhalten (delete-then-
    // rename haette sie schon geloescht, bevor renameSync fehlschlug).
    // copyFileSync ueberschreibt ein vorhandenes Ziel.
    fs.copyFileSync(from, to);
    fs.rmSync(from);
    console.log(`archive-build: ${name} -> releases/`);
    return true;
  } catch (err) {
    console.error(
      `archive-build: FEHLER beim Verschieben von ${name} (laeuft die EXE noch?): ${err.message}`,
    );
    return false;
  }
}

// 4T-0658: SHA256 einer bereits archivierten EXE. Die Prüfsumme entsteht im
// Bau-Schritt und nicht am Ablage-Ort, weil sie die Datei beschreiben soll,
// die den Bau-Rechner verlässt; am Ziel gebildet bestätigte sie nur, dass eine
// Datei mit sich selbst identisch ist. Fehlende Datei liefert null (wie
// moveFile ist eine nicht vorhandene Datei kein Fehler).
function sha256OfArchived(name) {
  const file = path.join(RELEASES, name);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 4T-0658: Schreibt je Version eine Sammel-Datei mit den Prüfsummen der
// archivierten EXEs. Ohne Code-Signatur ist sie der einzige Integritäts-
// Nachweis für den Anwender und zugleich Pflichtangabe für eine spätere
// Aufnahme in eine Paketverwaltung. Sammel- statt Einzeldatei, weil ein
// Release beide Varianten trägt und der Inhalt am Stück in den Herkunfts-
// Nachweis am Quellcode-Host übernommen wird. Zeilenformat wie sha256sum:
// Hash, zwei Leerzeichen, Dateiname.
function writeChecksumFiles(names, deps = {}) {
  const hash = deps.hash || sha256OfArchived;
  const write = deps.write || ((file, content) => fs.writeFileSync(file, content, 'utf8'));
  const byVersion = new Map();
  for (const name of names) {
    const version = name.match(EXE_PATTERN)[1];
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(name);
  }
  let ok = true;
  for (const [version, files] of byVersion) {
    const lines = [];
    // Sortiert, damit die Datei bei gleichem Bau-Ergebnis gleich aussieht.
    for (const name of [...files].sort()) {
      try {
        const digest = hash(name);
        if (digest) lines.push(`${digest}  ${name}`);
      } catch (err) {
        console.error(`archive-build: Pruefsumme fuer ${name} fehlgeschlagen: ${err.message}`);
        ok = false;
      }
    }
    if (lines.length === 0) continue;
    // Produktnamen-Präfix aus dem EXE-Namen übernehmen, damit die Datei neben
    // ihren EXEs steht; das Muster erlaubt auch die drei Altnamen.
    const prefix = files[0].slice(0, files[0].indexOf(`-${version}-`));
    const target = path.join(RELEASES, `${prefix}-${version}-SHA256SUMS.txt`);
    try {
      write(target, `${lines.join('\n')}\n`);
      console.log(`archive-build: ${path.basename(target)} -> releases/`);
    } catch (err) {
      console.error(
        `archive-build: Pruefsummen-Datei fuer ${version} fehlgeschlagen: ${err.message}`,
      );
      ok = false;
    }
  }
  return ok;
}

// Kern-Logik, testbar: entries = Dateinamen in dist/; deps injizierbar.
function archiveBuild(entries, deps = {}) {
  const tagExists = deps.tagExists || gitTagExists;
  const move = deps.move || moveFile;
  const guardBuildNumber = deps.guardBuildNumber || defaultGuardBuildNumber;
  const writeChecksums = deps.writeChecksums || writeChecksumFiles;
  const copyNotes =
    deps.copyNotes ||
    ((name) => {
      try {
        fs.copyFileSync(path.join(DIST, name), path.join(RELEASES, name));
        console.log(`archive-build: ${name} -> releases/ (Kopie)`);
        return true;
      } catch (err) {
        console.error(`archive-build: Notes-Kopie ${name} fehlgeschlagen: ${err.message}`);
        return false;
      }
    });

  const exes = entries.filter((name) => EXE_PATTERN.test(name));
  // 4T-0683: Nur die Notes der gebauten Version. In dist/ sammeln sich die
  // Notes-Dateien aller Releases; pauschales Kopieren hat am 2026-07-22 eine
  // Archiv-Fassung mit einer aelteren Probe-Fassung ueberschrieben. Die
  // projekt-lokale CLAUDE.md beschreibt seit jeher dieses Soll ("die zur
  // package.json-Version passende Notes-Datei").
  const pkgVersion = deps.pkgVersion || pkgVersionAusDatei();
  const notes = entries.filter((name) => {
    const treffer = name.match(NOTES_PATTERN);
    return treffer !== null && treffer[1] === pkgVersion;
  });
  if (exes.length === 0 && notes.length === 0) {
    console.log('archive-build: nichts zu archivieren.');
    return 0;
  }

  // X-01: Tag-Guard ueber alle gefundenen EXE-Versionen.
  for (const name of exes) {
    const version = name.match(EXE_PATTERN)[1];
    if (tagExists(version)) {
      console.error(
        `archive-build: ABBRUCH — fuer Version ${version} existiert bereits der ` +
          `Release-Tag v${version}. Die offiziellen EXEs in releases/ werden nicht ` +
          'ueberschrieben. Vermutlich fehlt der Versions-Bump in package.json.',
      );
      return 1;
    }
  }

  // 4T-0375: Build-Nummer-Guard — Abweichung zwischen build-info.json und der
  // realen Commit-Anzahl (Amend/Nachzuegler) machte die archivierte EXE-Nummer
  // falsch, deshalb Abbruch vor dem Verschieben.
  if (exes.length > 0) {
    const buildNumberError = guardBuildNumber();
    if (buildNumberError) {
      console.error(`archive-build: ABBRUCH — ${buildNumberError}`);
      return 1;
    }
  }

  fs.mkdirSync(RELEASES, { recursive: true });
  let ok = true;
  // 4T-0658: nur tatsächlich archivierte EXEs bekommen eine Prüfsumme. Eine
  // fehlgeschlagene Verschiebung darf keinen Nachweis über eine Datei
  // hinterlassen, die so nicht im Versions-Archiv liegt.
  const archived = [];
  for (const name of exes) {
    if (move(name)) archived.push(name);
    else ok = false;
  }
  if (archived.length > 0 && !writeChecksums(archived)) ok = false;
  for (const name of notes) {
    if (!copyNotes(name)) ok = false;
  }
  return ok ? 0 : 1;
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.log('archive-build: dist/ existiert nicht, nichts zu tun.');
    return;
  }
  const entries = fs.readdirSync(DIST);
  const code = archiveBuild(entries);
  if (code !== 0) process.exit(code);
}

if (require.main === module) {
  main();
}

module.exports = { archiveBuild, writeChecksumFiles, EXE_PATTERN, NOTES_PATTERN };
