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
const PRODUKT_RE = 'EM4me|Perspective Markdown\\+\\+|SCG Markdown|Markdown Viewer';
const EXE_PATTERN = new RegExp(`^(?:${PRODUKT_RE})-(${VERSION_RE.source})-(Setup|Portable)\\.exe$`);
const NOTES_PATTERN = new RegExp(`^release-notes-(${VERSION_RE.source})\\.md$`);
// 4T-0921: Dateiname eines temporaeren Baus zwischen zwei Releases
// (`EM4me-T-0.105.0-202608071130-Portable.exe`). Er wird bewusst NICHT
// archiviert: `releases/` ist das Versions-Archiv der Releases, und wer dort
// eine Datei findet, soll ein Release vor sich haben. Weil der Bau damit an
// einem anderen Ort landet als sonst, nennt dieser Schritt den Ordner
// ausdruecklich (Anordnung des Product Owners vom 2026-08-07).
// Fanggruppe 1 ist der zwoelfstellige Zeitstempel; die Meldung unten nennt
// darueber den frischen Stand.
const TEMP_EXE_PATTERN = new RegExp(
  `^(?:${PRODUKT_RE})-T-${VERSION_RE.source}-(\\d{12})-(?:Setup|Portable)\\.exe$`,
);
// Dasselbe samt Blockmap-Beigabe der Setup-Datei: die Aufraeum-Menge umfasst
// alles, was ein temporaerer Bau hinterlaesst, die Melde-Menge nur die
// Programmdateien.
const TEMP_ARTEFAKT_PATTERN = new RegExp(
  `^(?:${PRODUKT_RE})-T-${VERSION_RE.source}-(\\d{12})-(?:Setup|Portable)\\.exe(?:\\.blockmap)?$`,
);

// Zeitstempel aus dem Dateinamen eines temporaeren Artefakts; '' bei Nicht-Treffer.
function tempStempel(name) {
  return (String(name).match(TEMP_ARTEFAKT_PATTERN) || [])[1] || '';
}

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

// 4T-0921: Erinnert an den Ablage-Ort eines temporaeren Baus. Steht bewusst am
// Ende des Archivierungs-Schritts und damit am Ende von `npm run build`: Es ist
// das Letzte, was nach einem Bau auf dem Schirm steht.
//
// Genannt wird ausdruecklich der **frische** Stand. Der Ordner sammelt die
// temporaeren Bauten, weil keiner archiviert wird; eine blosse Aufzaehlung
// aller Treffer liesse den Leser raten, welche Datei die eben gebaute ist, und
// die Erinnerung verfehlte damit ihren Zweck. Der Zeitstempel im Namen ist
// zwoelfstellig und sortiert deshalb als Zeichenkette wie als Zeitpunkt.
function meldeTemporaere(namen, log = console.log) {
  if (namen.length === 0) return;
  const stempelVon = tempStempel;
  const stempel = [...new Set(namen.map(stempelVon))].sort().reverse();
  const juengster = stempel[0];
  const frisch = namen.filter((name) => stempelVon(name) === juengster).sort();
  const aeltere = namen.length - frisch.length;

  log('archive-build: TEMPORAERER BAU — nicht archiviert, weil in releases/ nur Releases stehen.');
  log('archive-build: Zuletzt gebaut, zu finden im Ordner dist/:');
  for (const name of frisch) log(`archive-build:   dist\\${name}`);
  if (aeltere > 0) {
    log(
      `archive-build: Daneben liegen ${aeltere} Datei(en) aelterer temporaerer Staende ` +
        `(${stempel.slice(1).join(', ')}); sie sind nicht der frische Bau.`,
    );
  }
}

/**
 * 4T-0921: Raeumt verwaiste Blockmaps weg (Anordnung des Product Owners vom
 * 2026-08-07). Eine Blockmap ist eine Beigabe des Setup-Baus; ohne ihre
 * Programmdatei in `dist/` gehoert sie zu einem Bau, den es dort nicht mehr
 * gibt. Genau daran haengt die Regel: **Waise heisst entfernen**, ohne
 * Versions-Vergleich und ohne Namens-Liste, weshalb sie auch die drei
 * Produktnamen der Vorgeschichte ohne Zutun erfasst.
 *
 * Dass sie sich ansammelten, ist ein Rueckstand aus dem Ausbau des
 * Auto-Update-Apparats: Das Aufraeumen alter Blockmaps gab es bereits einmal
 * (Aenderungsprotokoll zu 0.11.0) und ging mit dem Rueckbau verloren. Verbraucht
 * werden sie von nichts mehr; ins Versions-Archiv gehen sie nicht ein.
 *
 * Best effort wie beim Aufraeumen der temporaeren Staende: eine gesperrte Datei
 * wird gemeldet, nicht erzwungen.
 */
function raeumeWaisenBlockmaps(verbleibend, deps = {}) {
  const entfernen = deps.entfernen || ((name) => fs.rmSync(path.join(DIST, name)));
  const log = deps.log || console.log;
  const vorhanden = new Set(verbleibend);
  // 4T-0957: Dieselbe Regel gilt fuer die Release-Hinweise (Entscheidung des
  // Product Owners vom 2026-08-11, Nebenpunkt zu Befund B-06). Ihre Version
  // steht im Dateinamen; kommt sie in keiner verbliebenen Programmdatei vor,
  // gehoert die Datei zu einem Bau, den es hier nicht mehr gibt. Das Muster
  // deckt Release-Bau und temporaeren Bau gleichermassen ab, weil beide ihre
  // Version im Namen fuehren. Im Versions-Archiv gilt weiter der
  // Vollstaendigkeits-Grundsatz; dort wird nichts entfernt.
  const gebauteVersionen = new Set(
    verbleibend
      .filter((name) => name.toLowerCase().endsWith('.exe'))
      .map((name) => (name.match(VERSION_RE) || [])[0])
      .filter(Boolean),
  );
  const istWaisenNote = (name) => {
    const treffer = name.match(/^release-notes-(\d+\.\d+\.\d+)\.md$/);
    return !!treffer && !gebauteVersionen.has(treffer[1]);
  };
  const waisen = verbleibend
    .filter(
      (name) =>
        (name.endsWith('.blockmap') && !vorhanden.has(name.slice(0, -'.blockmap'.length))) ||
        istWaisenNote(name),
    )
    .sort();
  const entfernt = [];
  const gescheitert = [];
  for (const name of waisen) {
    try {
      entfernen(name);
      entfernt.push(name);
    } catch (err) {
      gescheitert.push(name);
      log(
        `archive-build: HINWEIS — verwaiste Beigabe ${name} liess sich nicht entfernen: ${err.message}`,
      );
    }
  }
  if (entfernt.length > 0) {
    log(
      `archive-build: ${entfernt.length} verwaiste Beigabe(n) entfernt (Blockmaps und Release-Hinweise) — ` +
        `sie gehoeren zu Bauten, die nicht mehr in dist/ liegen.`,
    );
  }
  return { entfernt, gescheitert };
}

/**
 * 4T-0921: Raeumt ueberholte temporaere Bauten weg (Anordnung des Product
 * Owners vom 2026-08-07). `dist/` traegt laut Konvention nur den aktuellen Bau;
 * weil ein temporaerer Bau nicht archiviert wird, sammelte er sich hier
 * dennoch an — je Bau rund 170 MB, und beim Testen die Frage, welche der
 * Dateien die gemeinte ist.
 *
 * Entfernt wird ausschliesslich, was das Muster eines temporaeren Artefakts
 * trifft **und** einen aelteren Zeitstempel traegt als der juengste; Releases,
 * Zwischenprodukte und der frische Bau bleiben unberuehrt. Die Blockmap-Beigabe
 * der Setup-Datei geht mit, sonst bliebe sie als Waise liegen.
 *
 * Best effort, nie ein Abbruch: Eine laufende Programmdatei ist gesperrt und
 * laesst sich nicht entfernen. Das ist ein Hinweis wert, aber kein Grund, einen
 * gelungenen Bau rot zu machen; die Melde-Funktion nennt die verbliebenen
 * Staende dann ohnehin als solche.
 */
function raeumeTemporaere(entries, deps = {}) {
  const entfernen = deps.entfernen || ((name) => fs.rmSync(path.join(DIST, name)));
  const log = deps.log || console.log;
  const artefakte = entries.filter((name) => TEMP_ARTEFAKT_PATTERN.test(name));
  const stempel = [...new Set(artefakte.map(tempStempel))].sort().reverse();
  if (stempel.length <= 1) return { entfernt: [], gescheitert: [] };

  const ueberholt = artefakte.filter((name) => tempStempel(name) !== stempel[0]).sort();
  const entfernt = [];
  const gescheitert = [];
  for (const name of ueberholt) {
    try {
      entfernen(name);
      entfernt.push(name);
    } catch (err) {
      gescheitert.push(name);
      log(
        `archive-build: HINWEIS — ueberholter temporaerer Bau ${name} liess sich nicht ` +
          `entfernen (laeuft er noch?): ${err.message}`,
      );
    }
  }
  if (entfernt.length > 0) {
    log(
      `archive-build: ${entfernt.length} Datei(en) ueberholter temporaerer Staende entfernt ` +
        `(${stempel.slice(1).join(', ')}); dist/ traegt nur den aktuellen Bau.`,
    );
  }
  return { entfernt, gescheitert };
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
  // Release-Strecke beschreibt seit jeher dieses Soll ("die zur
  // package.json-Version passende Notes-Datei").
  const pkgVersion = deps.pkgVersion || pkgVersionAusDatei();
  const notes = entries.filter((name) => {
    const treffer = name.match(NOTES_PATTERN);
    return treffer !== null && treffer[1] === pkgVersion;
  });
  // 4T-0921: Ein temporaerer Bau ruehrt das Versions-Archiv ueberhaupt nicht
  // an — auch nicht mit einer Notes-Kopie. Der erste echte Lauf am 2026-08-07
  // zeigte, warum das ausdruecklich stehen muss: Die EXEs blieben zwar liegen,
  // die Notes-Kopie lief aber weiter und schrieb `release-notes-<version>.md`
  // erneut ins Archiv, weil ihr Filter allein an der package.json-Version
  // haengt. Diesmal war die Datei byte-gleich und nichts ging verloren; die
  // Regel lautet dennoch: In `releases/` steht ausschliesslich, was
  // ausgeliefert wurde.
  //
  // 4T-1028: Ob der Lauf ein temporaerer Bau ist, entscheidet seit der
  // Release-Vorbereitung 1.107.0 (2026-08-13) nicht mehr der Datei-Bestand in
  // dist/, sondern derselbe Umstand, der auch den Bau selbst dazu macht: eine
  // bereits ausgelieferte Versions-Angabe (build-app.js ueber bauAngaben, das
  // die Release-Marken befragt). Aus den Dateinamen allein ist der Fall nicht
  // entscheidbar, weil beide Richtungen denselben Bestand zeigen — ein
  // temporaerer Bau mit Release-Resten und ein Release-Bau mit T-Resten. Die
  // fruehere Namens-Heuristik las jeden Bestand als die erste Richtung: ein
  // liegen gebliebenes T-Artefakt genuegte, um einen frischen Release-Bau
  // unarchiviert zu lassen (Sofort-Abhilfe war das Raeumen von Hand).
  const temporaere = entries.filter((name) => TEMP_EXE_PATTERN.test(name));
  const melde = deps.meldeTemporaere || meldeTemporaere;
  const raeume = deps.raeumeTemporaere || raeumeTemporaere;
  const raeumeWaisen = deps.raeumeWaisenBlockmaps || raeumeWaisenBlockmaps;
  const temporaererLauf = !!pkgVersion && tagExists(pkgVersion);
  if (temporaererLauf) {
    // Erst aufraeumen, dann melden: Die Erinnerung soll den Stand nach dem
    // Aufraeumen beschreiben und nicht Dateien nennen, die es nicht mehr gibt.
    const aufgeraeumt = raeume(entries);
    const uebrig = entries.filter((name) => !aufgeraeumt.entfernt.includes(name));
    raeumeWaisen(uebrig);
    melde(temporaere.filter((name) => uebrig.includes(name)));
    return 0;
  }
  // Release-Lauf mit T-Resten: Sie sind kein Grund mehr, den Lauf anzuhalten,
  // gehoeren aber auch nicht ins Archiv. Ein Hinweis genuegt — dist/ ist
  // Wegwerf-Ausgabe, und ueber ihren Bestand entscheidet der Product Owner.
  if (temporaere.length > 0) {
    console.log(
      `archive-build: HINWEIS — ${temporaere.length} Programmdatei(en) frueherer temporaerer ` +
        'Bauten liegen in dist/; sie gehen nicht ins Versions-Archiv.',
    );
  }

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
  // Nach dem Verschieben: Die Blockmaps der eben archivierten Programmdateien
  // sind damit ebenfalls Waisen, denn ins Versions-Archiv gehen sie nicht ein.
  raeumeWaisen(entries.filter((name) => !archived.includes(name)));
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

module.exports = {
  archiveBuild,
  writeChecksumFiles,
  meldeTemporaere,
  raeumeTemporaere,
  raeumeWaisenBlockmaps,
  EXE_PATTERN,
  NOTES_PATTERN,
  TEMP_EXE_PATTERN,
  TEMP_ARTEFAKT_PATTERN,
};
