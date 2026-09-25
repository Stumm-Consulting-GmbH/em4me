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
// Fehlerklasse `L11` in Reinform: eingerichtet, aber nicht scharf. Die beiden
// Fälle ohne Bezugsstand sind davon zu unterscheiden, und sie sind
// voneinander zu unterscheiden (siehe `bezugsstand`).
//
// **Der Bezugsstand ist die jüngste Release-Marke — und nur sie**
// (4T-001764 und 4T-001707, 2026-09-21). Trägt sie `src/i18n/de.json` nicht
// mehr versioniert, geht der Nachweis über die Zeit in den Ruhestand und sagt
// das; er weicht **nicht** auf eine ältere Marke aus, die die Datei noch
// trägt. Genau dieses Ausweichen war der Fehler der ersten Fassung: Ein Tag
// wird nie gelöscht, `v1.132.0` bleibt von jedem künftigen Stand aus
// erreichbar, und der Bezugsstand stand deshalb ab dem Release 1.133.0
// unverrückbar dort fest. Der eingebaute Ruhestand konnte so **nie**
// eintreten, und der Nachweis maß mit wachsendem Abstand etwas anderes als
// seine Zusage: nicht mehr «der Umbau in Fragmente hat nichts verändert»,
// sondern «seit 1.132.0 ist nichts verlorengegangen» — eine Aussage, deren
// Wert mit jedem Release sinkt. Ein Nachweis, dessen Zusage an einen Umbau
// gebunden ist, endet mit dem Umbau, statt seinen Gegenstand still zu
// verlieren.
//
// **Was der Ruhestand nicht berührt.** Die Schlüsselgleichheit der fünf
// Sprachen untereinander (`vergleicheSprachen`) ist eine eigene Zusage ohne
// Bezugsstand; sie läuft weiter, im Hand-Lauf wie im Prüffall. Ebenso der
// Nachweis, dass das Erzeugnis die Zusammensetzung seiner Fragmente ist
// (`test/unit/i18n-gleichheit.test.js`) und der Bau-Schritt selbst
// (`test/unit/build-i18n.test.js`).
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
 * Bewusst geänderte Bestands-Texte seit dem Bezugsstand — je Eintrag ein
 * Schlüssel, der in allen fünf Sprachen aus dem Wert-Vergleich fällt.
 *
 * Ein Eintrag hier nimmt einen Schlüssel aus dem Wert-Vergleich heraus und ist
 * damit genau die Stelle, an der ein Nachweis weich wird. Ein späteres
 * Vorhaben, das einen bestehenden Text ändert, hat zwei Wege — hier eintragen
 * mit Grund, oder auf den nächsten Release-Tag warten, mit dem der Bezugsstand
 * weiterwandert. Der zweite ist der bessere, weil er nichts hinterlässt; seit
 * `bezugsstand()` an der jüngsten Marke hält, steht er wieder offen.
 *
 * **Die Liste gehört ihrem Bezugsstand und überlebt ihn nicht.** Jeder Eintrag
 * sagt «dieser Wert weicht von GENAU DIESER Marke bewusst ab». Wandert der
 * Bezugsstand, ist die Aussage für die neue Marke ungeprüft — ein stehen
 * gebliebener Eintrag nähme den Schlüssel dann aus einem Vergleich heraus, den
 * nie jemand geführt hat. Wer den Bezugsstand wandern lässt, leert deshalb im
 * selben Zug die Liste.
 *
 * **Leer seit dem 2026-09-21** (4T-001764, 4T-001707): Der Nachweis über die
 * Zeit ist im Ruhestand, weil die jüngste Release-Marke die versionierten
 * Sprachdateien nicht mehr trägt. Damit hat kein Eintrag mehr einen
 * Gegenstand; die zwanzig Schlüssel des Stands `v1.132.0` sind entfallen, ihre
 * Gründe stehen in den Vorgängen, die sie eingetragen haben. Die Liste ist
 * wieder das, was sie sein sollte: die Ausnahme, nicht der Regelweg.
 *
 * @type {Array<{schluessel: string, grund: string}>}
 */
const GEAENDERTE_TEXTE = [];

const ABWEICHUNGEN = GEAENDERTE_TEXTE.flatMap(({ schluessel, grund }) =>
  LOCALE_CODES.map((sprache) => ({ sprache, schluessel, grund })),
);

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
 * Der Bezugsstand: die jüngste vom aktuellen Stand erreichbare Release-Marke —
 * und nur sie. Trägt sie die versionierte `src/i18n/de.json` nicht mehr, ist
 * der Nachweis über die Zeit im Ruhestand.
 *
 * «Erreichbar» schließt Marken fremder Züge aus, die den eigenen Stand nie
 * gesehen haben. «Die jüngste» ist die Bedingung, die 4T-001764 und 4T-001707
 * am 2026-09-21 wirksam gemacht haben: Die erste Fassung suchte rückwärts über
 * ALLE erreichbaren Marken die jüngste, welche die Datei noch trägt — und weil
 * eine Marke nie gelöscht wird, blieb sie dauerhaft bei `v1.132.0` hängen. Der
 * Ruhestand konnte so nie eintreten (Begründung im Modulkopf).
 *
 * **Drei Ausgänge, und sie sind auseinanderzuhalten.** `ruhestand: null` ist
 * der laufende Nachweis. `'ohne-sprachdatei'` ist der vorgesehene Ruhestand:
 * Die jüngste Marke steht fest, sie trägt die Datei nicht mehr. `'ohne-marke'`
 * ist etwas anderes und schwächer — es ist überhaupt keine Release-Marke
 * erreichbar, der Bezugsstand ist also nicht bestimmbar statt überholt. Wer
 * beides in ein `{ tag: null }` wirft, verwechselt «fertig» mit «ich konnte
 * nicht nachsehen» und landet bei der Fehlerklasse `L11`.
 *
 * @param {{wurzel?: string}} [optionen] Arbeitsbaum, in dem `git` läuft.
 * @returns {{tag: string|null, marke: string|null, ruhestand: string|null,
 *            dicts: Object<string,Object<string,string>>|null}}
 *          `marke` ist die jüngste erreichbare Release-Marke, auch im
 *          Ruhestand; `tag` und `dicts` tragen den Bezugsstand und sind im
 *          Ruhestand `null`.
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

  const marke = tags.length > 0 ? tags[0] : null;
  if (marke === null) return { tag: null, marke: null, ruhestand: 'ohne-marke', dicts: null };

  // `git cat-file -e` endet mit 0 bei «vorhanden» und sonst mit einem
  // Fehler-Status; execFileSync würde den zweiten Fall als Wurf melden und
  // damit den Ruhestands-Fall mit dem fail-closed-Fall verwechseln.
  const vorhanden = spawnSync('git', ['cat-file', '-e', `${marke}:${bezugsPfad('de')}`], {
    cwd: wurzel,
    stdio: 'ignore',
  });
  if (vorhanden.status !== 0) {
    return { tag: null, marke, ruhestand: 'ohne-sprachdatei', dicts: null };
  }

  const dicts = {};
  for (const code of LOCALE_CODES) {
    const text = execFileSync('git', ['show', `${marke}:${bezugsPfad(code)}`], {
      cwd: wurzel,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    dicts[code] = JSON.parse(text);
  }
  return { tag: marke, marke, ruhestand: null, dicts };
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

  const { tag, marke, ruhestand, dicts } = bezugsstand();
  if (ruhestand === 'ohne-marke') {
    // Kein Ruhestand, sondern ein nicht bestimmbarer Bezugsstand: Das meldet
    // der Hand-Lauf als Befund, statt es wie einen erfüllten Auftrag aussehen
    // zu lassen.
    zeilen.push(
      'i18n-gleichheit: keine erreichbare Release-Marke — der Bezugsstand ist nicht bestimmbar.',
    );
    befunde += 1;
  } else {
    const ist = istStand();

    if (ruhestand !== null) {
      zeilen.push(
        `i18n-gleichheit: im Ruhestand — die jüngste Release-Marke ${marke} trägt ` +
          'src/i18n/de.json nicht mehr versioniert.',
        'Der Nachweis über die Zeit hat seine Aufgabe erfüllt (Epic 3E-000278, 4T-001608);',
        'die Schlüsselgleichheit der fünf Sprachen untereinander läuft weiter.',
      );
    } else {
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
    }

    // Die Schlüsselgleichheit über die Sprachen hängt an keinem Bezugsstand
    // und läuft deshalb auch im Ruhestand — dort ist sie die einzige Aussage,
    // die der Hand-Lauf noch trifft, und ein Lauf, der gar nichts mehr prüfte,
    // wäre eine stille Zusage (L11).
    const quer = vergleicheSprachen(ist);
    befunde += quer.length;
    zeilen.push(`  Sprachen untereinander: ${quer.length} Abweichung(en)`);
    for (const a of quer) zeilen.push(`    ${a.art}: ${a.sprache} / ${a.schluessel}`);
  }

  process.stdout.write(`${zeilen.join('\n')}\n`);
  if (befunde > 0) process.exitCode = 1;
}
