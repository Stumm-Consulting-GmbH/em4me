// 4T-001606 (Epic 3E-000278): Der Bau-Schritt, der aus den Fragmenten die fünf
// Sprachdateien `src/i18n/<code>.json` zusammensetzt.
//
// **Der Gegenstand.** Seit 4T-001605 liegen die über 3100 Schlüssel je Sprache
// als 39 Fragmente unter `src/i18n/fragments/<code>/`, geordnet von der
// Zuordnungs-Tafel `src/i18n/fragments/manifest.json`. Gelesen wird zur Laufzeit
// unverändert die eine flache Datei je Sprache — vom Renderer über `fetch`, vom
// Haupt-Prozess und von der Markdown-Kette über `__dirname`. Dieser Schritt ist
// die Brücke dazwischen: Er macht das Erzeugnis, das die Anwendung liest, aus
// dem Bestand, den die Sitzungen pflegen. Die fünf Dateien sind damit erzeugt
// und nicht mehr versioniert (`.gitignore`, `.prettierignore`).
//
// **Warum die Fehler aller Sprachen und dann EIN Wurf.** `zusammensetzen` wirft
// bewusst nicht, sondern sammelt (Kopf von `scripts/i18n-fragmente.js`). Ein
// Bau, der beim ersten Befund abbricht, zwingt zu fünf Läufen, wenn ein
// verschobener Namensraum in fünf Sprachen dieselbe Wirkung hat — und genau das
// ist der Normalfall, weil die Fragmente aller Sprachen dieselbe Tafel teilen.
// Ein Schlüssel, der in zwei Fragmenten steht, nennt deshalb BEIDE Dateien; wer
// nur die zweite sähe, suchte die erste von Hand.
//
// **Warum immer geschrieben wird, auch bei gleichem Inhalt.** Der Frische-
// Wächter (`scripts/bundle-frische.js`) misst Änderungszeiten, nicht Inhalte.
// Ein Schreiber, der bei gleichem Inhalt die Datei stehen ließe, hinterließe ein
// Erzeugnis, das älter ist als seine Eingänge — und der Wächter meldete danach
// zu Recht «veraltet», ohne dass ein Bau daran je etwas ändern könnte. Der Preis
// sind fünf Schreibzugriffe von zusammen unter 2 MB je Bau.
//
// **Wo der Schritt hängt.** Im Modulkopf von `scripts/build-renderer.js`, neben
// den drei bestehenden Vorbereitungs-Schritten; über `package.json` ist der
// Renderer-Bau jedem Weg vorgeschaltet (`start`, `dev`, `build`,
// `build:installer`, `build:portable`, `build:pruefstand`, `pretest:e2e`).
// Zusätzlich im `globalSetup` von `vitest.config.mjs`, weil die Unit-Fälle das
// Erzeugnis lesen und `npm test` den Renderer-Bau nicht anfasst.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  LOCALE_CODES,
  MANIFEST_NAME,
  zusammensetzen,
  serialisiere,
} = require('./i18n-fragmente.js');

const REPO_WURZEL = path.resolve(__dirname, '..');

// Der Ordner, der die Fragmente trägt UND die Erzeugnisse aufnimmt. Beides an
// einem Parameter, weil ein Prüffall genau diese Einheit in einen
// Wegwerf-Ordner stellt: dort die Fragmente hinein, dort das Erzeugnis heraus.
const I18N_WURZEL = path.join(REPO_WURZEL, 'src', 'i18n');
const FRAGMENTE_ORDNER = 'fragments';

function repoRelativ(absolut) {
  return path.relative(REPO_WURZEL, absolut).split(path.sep).join('/');
}

function fehlerMeldung(zeilen) {
  return [
    'Sprachdateien nicht zusammensetzbar — Bau abgebrochen.',
    'Die fünf Dateien src/i18n/<code>.json entstehen aus den Fragmenten unter',
    'src/i18n/fragments/; ein Befund unten verhindert die Datei seiner Sprache.',
    '',
    ...zeilen.map((z) => `    ${z}`),
    '',
    `Fragment berichtigen oder die Zuordnungs-Tafel src/i18n/${FRAGMENTE_ORDNER}/${MANIFEST_NAME}`,
    'nachziehen, dann erneut bauen: npm run build:renderer',
    'Hintergrund: Epic 3E-000278, Vorgang 4T-001606.',
  ].join('\n');
}

/**
 * Setzt die fünf Sprachdateien aus ihren Fragmenten zusammen und schreibt sie.
 *
 * Die Reihenfolge der Schlüssel im Erzeugnis ist die der Zuordnungs-Tafel, und
 * innerhalb eines Fragments die der Datei — so liefert es `zusammensetzen`. Sie
 * weicht damit von der Reihenfolge der bis 4T-001606 versionierten Dateien ab;
 * das ist entschieden und kein Befund, weil jeder Leser die Datei als Objekt
 * auswertet und kein Wächter über die Reihenfolge urteilt.
 *
 * @param {{wurzel?: string}} [optionen] Ordner mit `fragments/`, der zugleich
 *        die Erzeugnisse aufnimmt. Vorgabe: `src/i18n` des Repositoriums.
 * @returns {{sprachen: Array<{code: string, schluessel: number, datei: string}>}}
 *          Zusammenfassung je Sprache.
 * @throws {Error} Ein Wurf mit ALLEN Befunden aller Sprachen; geschrieben wird
 *         dann nichts, damit kein halber Satz Erzeugnisse zurückbleibt.
 */
function buildI18n({ wurzel = I18N_WURZEL } = {}) {
  const fragmenteWurzel = path.join(wurzel, FRAGMENTE_ORDNER);
  const fertig = [];
  const befunde = [];

  for (const code of LOCALE_CODES) {
    const { dict, fehler } = zusammensetzen(code, { wurzel: fragmenteWurzel });
    if (fehler.length > 0) {
      for (const zeile of fehler) befunde.push(`${code}: ${zeile}`);
      continue;
    }
    fertig.push({ code, dict });
  }

  if (befunde.length > 0) throw new Error(fehlerMeldung(befunde));

  const sprachen = [];
  for (const { code, dict } of fertig) {
    const datei = path.join(wurzel, `${code}.json`);
    fs.writeFileSync(datei, serialisiere(dict), 'utf8');
    sprachen.push({ code, schluessel: Object.keys(dict).length, datei });
  }
  return { sprachen };
}

/**
 * Setup-Einsprung beider Werkzeuge: Vitest ruft den benannten Export `setup`
 * seines `globalSetup`, Playwright das Modul selbst als Funktion — deshalb
 * trägt das Modul beide Formen (Muster aus `scripts/gate-zugang.js`). Die
 * Meldung geht zusätzlich auf stderr, weil der geworfene Fehler bei Vitest
 * sonst zwischen Stapel-Zeilen steht.
 */
function setup() {
  try {
    buildI18n();
  } catch (err) {
    process.stderr.write(`\n${err.message}\n\n`);
    throw new Error('Sprachdateien nicht zusammensetzbar (4T-001606)', { cause: err });
  }
}

module.exports = setup;
module.exports.setup = setup;
module.exports.buildI18n = buildI18n;
module.exports.I18N_WURZEL = I18N_WURZEL;
module.exports.FRAGMENTE_ORDNER = FRAGMENTE_ORDNER;

// Auskunft und Bau von Hand: `node scripts/build-i18n.js` schreibt die fünf
// Dateien und endet bei einem Befund mit 1.
if (require.main === module) {
  try {
    const { sprachen } = buildI18n();
    for (const s of sprachen) {
      process.stdout.write(`build-i18n: ${repoRelativ(s.datei)} — ${s.schluessel} Schlüssel\n`);
    }
  } catch (err) {
    process.stderr.write(`\n${err.message}\n\n`);
    process.exitCode = 1;
  }
}
