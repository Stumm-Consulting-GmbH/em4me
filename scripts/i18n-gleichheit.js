// 4T-001608 (Epic 3E-000278): Der Gleichheits-Nachweis, Abnahme-Bedingung des
// Epics.
//
// **Der Gegenstand.** Das Epic ersetzt fünf gewachsene Sprachdateien durch 39
// Fragmente je Sprache und einen Bau-Schritt, der daraus wieder
// `src/i18n/<code>.json` macht. Die tragende Zusage dieses Umbaus ist eine
// Gleichheit: Was die Anwendung nach der Umstellung liest, ist Schlüssel für
// Schlüssel und Wert für Wert dasselbe wie das, was sie davor gelesen hat.
// Dieses Modul belegt genau das — gegen den letzten Release-Stand, den die
// Git-Historie noch als versionierte Datei trägt.
//
// **Die Grenze des Nachweises.** Er belegt die Gleichheit des **Bestands**,
// nicht die Richtigkeit der **Zuordnung**. Ob ein Schlüssel im fachlich
// passenden Fragment liegt, ist eine Beurteilung und bleibt die Sichtprüfung
// aus 4T-001605; hier fiele sie nicht auf, weil das Erzeugnis dieselbe Menge
// trägt, egal aus welcher Datei ein Schlüssel kam. Ebenso ausdrücklich NICHT
// verglichen wird die Reihenfolge: Sie folgt jetzt der Zuordnungs-Tafel, das
// ist entschieden, und kein Leser des Erzeugnisses wertet sie aus.
//
// **Hinzugekommene Schlüssel sind erlaubt, fehlende und geänderte nicht.** Der
// Bezugsstand ist ein Release-Tag, und zwischen ihm und dem heutigen Stand
// liegen Vorgänge, die Texte hinzugefügt haben — 119 zum Stand des 2026-09-10.
// Sie werden gezählt und nicht bemängelt. Ein **fehlender** Schlüssel oder ein
// **geänderter Wert** ist dagegen ein Befund am Schnitt: Beides kann die
// Zerlegung verursacht haben, und beides sähe niemand, weil die Anwendung mit
// einem stillschweigend verlorenen Text weiterläuft.
//
// **Warum fail closed.** Ist `git` nicht aufrufbar oder der Baum kein
// Repositorium, wirft `bezugsstand` statt einen leeren Bezug zu liefern. Ein
// Nachweis, der still grün bleibt, weil er nichts lesen konnte, ist die
// Fehlerklasse `L11` in Reinform: eingerichtet, aber nicht scharf. Der Fall
// «kein Tag trägt die Datei» ist davon zu unterscheiden und ausdrücklich
// vorgesehen (siehe `bezugsstand`).
//
// **Der Ruhestand ist eingebaut.** Der Bezugsstand wandert mit jedem Release
// weiter. Sobald der erste Tag nach der Umstellung gesetzt ist, trägt kein von
// ihm erreichbarer Tag mehr eine versionierte `src/i18n/de.json` — spätestens
// dann liefert `bezugsstand` `{ tag: null }`, und der Nachweis hat seine
// Aufgabe erfüllt. Bis dahin läuft er bei jedem Lauf seines Prüf-Ausschnitts
// mit.
//
// Aufruf von Hand: `node scripts/i18n-gleichheit.js` — druckt je Sprache die
// Zahlen und endet bei Abweichungen mit 1. Das ist der Beleg für die Abnahme.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { LOCALE_CODES } = require('./i18n-fragmente.js');

const REPO_WURZEL = path.resolve(__dirname, '..');

// Die Marke eines Releases: `v<major>.<minor>.<patch>`, nichts daneben. Ein
// Vorab- oder Arbeits-Tag darf den Bezugsstand nicht setzen.
const RELEASE_TAG_MUSTER = /^v\d+\.\d+\.\d+$/;

/** Repo-relativer Pfad der Sprachdatei einer Sprache, mit Schrägstrichen. */
function bezugsPfad(code) {
  return `src/i18n/${code}.json`;
}

/**
 * Bewusst geänderte Bestands-Texte seit dem Bezugsstand.
 *
 * Sie ist LEER und bleibt es, solange das Epic Text nur verschiebt: Ein
 * Eintrag hier nimmt einen Schlüssel aus dem Wert-Vergleich heraus und ist
 * damit genau die Stelle, an der ein Nachweis weich wird. Ein späteres
 * Vorhaben, das einen bestehenden Text ändert, hat zwei Wege — hier eintragen
 * mit Grund, oder auf den nächsten Release-Tag warten, mit dem der Bezugsstand
 * ohnehin weiterwandert. Der zweite ist der bessere, weil er nichts hinterlässt.
 *
 * @type {Array<{sprache: string, schluessel: string, grund: string}>}
 */
const ABWEICHUNGEN = [
  {
    sprache: 'de',
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand 1.132.0 entstand',
  },
  {
    sprache: 'en',
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand 1.132.0 entstand',
  },
  {
    sprache: 'fr',
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand 1.132.0 entstand',
  },
  {
    sprache: 'es',
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand 1.132.0 entstand',
  },
  {
    sprache: 'it',
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand 1.132.0 entstand',
  },
];

/**
 * Vergleicht einen Bezugs-Katalog gegen den heutigen Ist-Katalog einer Sprache.
 *
 * Liefert Abweichungen UND die hinzugekommenen Schlüssel in einem Rutsch statt
 * in zwei Funktionen: Beides fällt in demselben Lauf über die Schlüssel an, und
 * ein zweiter Lauf über 3100 Schlüssel brächte nichts, was dieser nicht schon
 * gesehen hat.
 *
 * @param {Object<string,string>} bezug Katalog des Bezugsstands.
 * @param {Object<string,string>} ist Heutiger Katalog.
 * @param {{sprache?: string, abweichungen?: Array<{sprache: string, schluessel: string}>}} [optionen]
 *        Sprach-Code für die Meldungen und die Liste der bewusst geänderten
 *        Texte (Vorgabe: `ABWEICHUNGEN`).
 * @returns {{abweichungen: Array<{sprache: string, schluessel: string, art: string}>,
 *            hinzugekommen: string[]}} Befunde und die erlaubten Zugänge.
 */
function vergleicheKataloge(bezug, ist, { sprache = '', abweichungen = ABWEICHUNGEN } = {}) {
  const ausgenommen = new Set(
    (abweichungen || [])
      .filter((eintrag) => eintrag && eintrag.sprache === sprache)
      .map((eintrag) => eintrag.schluessel),
  );

  const befunde = [];
  for (const [schluessel, wert] of Object.entries(bezug)) {
    if (!Object.prototype.hasOwnProperty.call(ist, schluessel)) {
      befunde.push({ sprache, schluessel, art: 'fehlt' });
      continue;
    }
    if (ist[schluessel] !== wert && !ausgenommen.has(schluessel)) {
      befunde.push({ sprache, schluessel, art: 'wert' });
    }
  }

  const hinzugekommen = Object.keys(ist).filter(
    (schluessel) => !Object.prototype.hasOwnProperty.call(bezug, schluessel),
  );

  return { abweichungen: befunde, hinzugekommen };
}

/**
 * Vergleicht die fünf Sprachen untereinander gegen `de` als Referenz.
 *
 * Der Nachweis der Gleichheit über die Zeit deckt diesen Fall nicht ab: Ginge
 * ein Schlüssel in EINER Sprache verloren, während der Bezugsstand fehlt, bliebe
 * der Zeit-Vergleich stumm. Die Schlüsselgleichheit über die Sprachen ist
 * deshalb eine eigene Zusage.
 *
 * @param {Object<string,Object<string,string>>} dicts Kataloge je Sprach-Code.
 * @returns {Array<{sprache: string, schluessel: string, art: string}>}
 *          Befunde mit `art` «fehlt» oder «ueberzaehlig».
 */
function vergleicheSprachen(dicts) {
  const referenz = dicts.de;
  if (referenz == null) return [{ sprache: 'de', schluessel: '(alle)', art: 'fehlt' }];

  const referenzSchluessel = Object.keys(referenz);
  const referenzMenge = new Set(referenzSchluessel);
  const befunde = [];

  for (const sprache of Object.keys(dicts)) {
    if (sprache === 'de') continue;
    const dict = dicts[sprache];
    const menge = new Set(Object.keys(dict || {}));
    for (const schluessel of referenzSchluessel) {
      if (!menge.has(schluessel)) befunde.push({ sprache, schluessel, art: 'fehlt' });
    }
    for (const schluessel of menge) {
      if (!referenzMenge.has(schluessel)) {
        befunde.push({ sprache, schluessel, art: 'ueberzaehlig' });
      }
    }
  }
  return befunde;
}

/**
 * Der Bezugsstand: der jüngste Release-Tag, der vom aktuellen Stand erreichbar
 * ist UND die versionierte `src/i18n/de.json` noch trägt.
 *
 * Beide Bedingungen sind nötig. «Erreichbar» schließt Tags fremder Züge aus,
 * die den eigenen Stand nie gesehen haben; «trägt die Datei» ist der Schalter,
 * der den Nachweis nach der Umstellung in den Ruhestand schickt, statt ihn an
 * einem Tag scheitern zu lassen, der die Datei nicht mehr kennt.
 *
 * @param {{wurzel?: string}} [optionen] Arbeitsbaum, in dem `git` läuft.
 * @returns {{tag: string|null, dicts: Object<string,Object<string,string>>|null}}
 *          Tag und Kataloge, oder zweimal `null`, wenn kein Tag die Datei trägt.
 * @throws {Error} Wenn `git` nicht aufrufbar ist oder der Ordner kein
 *         Repositorium ist — fail closed, siehe Modulkopf.
 */
function bezugsstand({ wurzel = REPO_WURZEL } = {}) {
  // `stdio` mit gefangenem stderr: Sonst schreibt Git seine Meldung ungefragt
  // in die Ausgabe des Elternprozesses — und der Prüffall, der den Wurf
  // NACHWEIST, hinterließe in jedem grünen Suite-Lauf eine «fatal»-Zeile. Der
  // Text bleibt am geworfenen Fehler (`err.stderr`) erhalten.
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--sort=-v:refname'], {
    cwd: wurzel,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => RELEASE_TAG_MUSTER.test(zeile));

  for (const tag of tags) {
    // `git cat-file -e` endet mit 0 bei «vorhanden» und sonst mit einem
    // Fehler-Status; execFileSync würde den zweiten Fall als Wurf melden und
    // damit den Ruhestands-Fall mit dem fail-closed-Fall verwechseln.
    const vorhanden = spawnSync('git', ['cat-file', '-e', `${tag}:${bezugsPfad('de')}`], {
      cwd: wurzel,
      stdio: 'ignore',
    });
    if (vorhanden.status !== 0) continue;

    const dicts = {};
    for (const code of LOCALE_CODES) {
      const text = execFileSync('git', ['show', `${tag}:${bezugsPfad(code)}`], {
        cwd: wurzel,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      dicts[code] = JSON.parse(text);
    }
    return { tag, dicts };
  }

  return { tag: null, dicts: null };
}

/**
 * Die heutigen Kataloge von der Platte — das Erzeugnis, das die Anwendung liest.
 *
 * @param {{wurzel?: string}} [optionen] Repo-Wurzel.
 * @returns {Object<string,Object<string,string>>} Kataloge je Sprach-Code.
 */
function istStand({ wurzel = REPO_WURZEL } = {}) {
  const dicts = {};
  for (const code of LOCALE_CODES) {
    dicts[code] = JSON.parse(
      fs.readFileSync(path.join(wurzel, 'src', 'i18n', `${code}.json`), 'utf8'),
    );
  }
  return dicts;
}

module.exports = {
  ABWEICHUNGEN,
  RELEASE_TAG_MUSTER,
  bezugsPfad,
  vergleicheKataloge,
  vergleicheSprachen,
  bezugsstand,
  istStand,
};

if (require.main === module) {
  const zeilen = [];
  let befunde = 0;

  const { tag, dicts } = bezugsstand();
  if (tag == null) {
    zeilen.push(
      'i18n-gleichheit: kein erreichbarer Release-Tag trägt src/i18n/de.json noch versioniert.',
      'Der Gleichheits-Nachweis ist damit im Ruhestand (Epic 3E-000278, 4T-001608).',
    );
  } else {
    const ist = istStand();
    zeilen.push(`i18n-gleichheit: Bezugsstand ${tag}`);
    for (const code of LOCALE_CODES) {
      const { abweichungen, hinzugekommen } = vergleicheKataloge(dicts[code], ist[code], {
        sprache: code,
      });
      befunde += abweichungen.length;
      zeilen.push(
        `  ${code}: Bezug ${Object.keys(dicts[code]).length}, ` +
          `Ist ${Object.keys(ist[code]).length}, ` +
          `hinzugekommen ${hinzugekommen.length}, Abweichungen ${abweichungen.length}`,
      );
      for (const a of abweichungen) {
        zeilen.push(
          `    ${a.art === 'fehlt' ? 'fehlt' : 'Wert geändert'}: ${a.sprache} / ${a.schluessel}`,
        );
      }
    }

    const quer = vergleicheSprachen(ist);
    befunde += quer.length;
    zeilen.push(`  Sprachen untereinander: ${quer.length} Abweichung(en)`);
    for (const a of quer) zeilen.push(`    ${a.art}: ${a.sprache} / ${a.schluessel}`);
  }

  process.stdout.write(`${zeilen.join('\n')}\n`);
  if (befunde > 0) process.exitCode = 1;
}
