// 4T-001605 (Epic 3E-000278): Der gemeinsame Lader der Sprachdatei-Fragmente.
//
// **Der Gegenstand.** Die fünf Sprachdateien `src/i18n/<code>.json` sind je über
// 3100 Schlüssel lang und liegen als eine einzige flache Datei je Sprache. Jede
// Änderung an irgendeinem Namensraum berührt damit dieselbe Datei, und zwei
// Sitzungen, die in verschiedenen Bereichen arbeiten, kollidieren regelmäßig an
// einer Stelle, die fachlich nichts miteinander zu tun hat. Das Epic zerlegt den
// Bestand deshalb in Fragmente je Namensraum; die zusammengesetzte Datei bleibt
// das, was die Anwendung liest, und entsteht später beim Bau.
//
// **Warum ein eigenes Modul und nicht je Werkzeug eine Kopie.** An den
// Fragmenten hängen mehrere Werkzeuge: die Zerlegung (`i18n-zerlegen.js`), der
// spätere Bau-Schritt, der Gleichheits-Nachweis und die Wächter. Sie alle
// brauchen dieselben drei Aussagen — welche Fragmente es gibt, zu welchem
// Fragment ein Schlüssel gehört und wie ein Fragment-Satz zu einem Wörterbuch
// wird. Stünde das mehrfach im Code, liefe genau die Art von Kopie mit, die
// `src/shared/locales.js` für die Sprachliste bereits einmal abgeschafft hat.
//
// **Die Zuordnungs-Regel.** Ein Schlüssel gehört zu dem Fragment, dessen Präfix
// an einer Punkt-Grenze passt (`key === praefix` oder `key.startsWith(praefix +
// '.')`); bei mehreren Treffern gewinnt das **längste** Präfix. Nur so lassen
// sich Namensräume schneiden, die ineinander liegen: `settings.calendar.*`
// gehört zum Fragment `calendar`, `settings.title` zum Fragment `settings`.
// Die Punkt-Grenze ist wesentlich — ein reiner `startsWith`-Vergleich zöge
// `settings.tasks` in ein Fragment mit dem Präfix `settings.task`.
//
// **Die eine Textform.** `serialisiere` ist die einzige Stelle, an der aus einem
// Wörterbuch Text wird — für die Fragmente dieses Tasks ebenso wie für das
// zusammengesetzte Erzeugnis des Bau-Schritts. Sie ist gegen die heutigen
// Sprachdateien geprüft: `serialisiere(JSON.parse(text)) === text` gilt für alle
// fünf, die Prettier-Form und die Erzeugnis-Form sind also dieselbe. Damit kann
// der spätere Gleichheits-Nachweis byte-genau vergleichen statt Objekte.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle, nicht als
// sechste Kopie hier.
const { LOCALE_CODES } = require('../src/shared/locales');

const REPO_WURZEL = path.resolve(__dirname, '..');
const FRAGMENTE_WURZEL = path.join(REPO_WURZEL, 'src', 'i18n', 'fragments');
const MANIFEST_NAME = 'manifest.json';

// Fragment-Namen sind Datei-Namen: klein, ohne Umlaute und ohne Leerzeichen,
// damit sie auf jedem Dateisystem und in jedem Muster gleich heißen.
const NAME_MUSTER = /^[a-z0-9-]+$/;

/** Repo-relativer Pfad mit Schrägstrichen — die Form, in der Meldungen zitieren. */
function repoRelativ(absolut) {
  return path.relative(REPO_WURZEL, absolut).split(path.sep).join('/');
}

/**
 * Liest die Zuordnungs-Tafel und prüft sie auf die Zusagen, auf denen alles
 * Weitere steht. Ein Verstoß wirft: Eine kaputte Tafel darf nicht in eine
 * halb zugeordnete Zerlegung münden.
 *
 * @param {string} [wurzel] Ordner, der die manifest.json trägt.
 * @returns {{fragmente: Array<{name: string, praefixe: string[]}>}} Die Tafel.
 */
function ladeManifest(wurzel = FRAGMENTE_WURZEL) {
  const datei = path.join(wurzel, MANIFEST_NAME);
  const rel = repoRelativ(datei);
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (err) {
    throw new Error(`${rel}: Zuordnungs-Tafel nicht lesbar (${err.message})`, { cause: err });
  }
  if (!roh || !Array.isArray(roh.fragmente) || roh.fragmente.length === 0) {
    throw new Error(`${rel}: Feld «fragmente» fehlt oder ist ein leeres Array`);
  }

  const namen = new Set();
  const praefixHerkunft = new Map();
  for (const fragment of roh.fragmente) {
    const name = fragment && fragment.name;
    if (typeof name !== 'string' || !NAME_MUSTER.test(name)) {
      throw new Error(`${rel}: Fragment-Name «${name}» passt nicht auf ${NAME_MUSTER}`);
    }
    if (namen.has(name)) {
      throw new Error(`${rel}: Fragment-Name «${name}» kommt doppelt vor`);
    }
    namen.add(name);
    if (!Array.isArray(fragment.praefixe) || fragment.praefixe.length === 0) {
      throw new Error(`${rel}: Fragment «${name}» führt keine Präfixe`);
    }
    for (const praefix of fragment.praefixe) {
      if (typeof praefix !== 'string' || praefix.length === 0) {
        throw new Error(`${rel}: Fragment «${name}» führt ein leeres Präfix`);
      }
      const vorher = praefixHerkunft.get(praefix);
      if (vorher != null) {
        throw new Error(
          `${rel}: Präfix «${praefix}» steht in zwei Fragmenten — «${vorher}» und «${name}»`,
        );
      }
      praefixHerkunft.set(praefix, name);
    }
  }
  return roh;
}

// Die Präfix-Tafel je Manifest-Objekt, damit die Zuordnung nicht bei jedem der
// über 3100 Schlüssel erneut über alle Fragmente läuft. Am Manifest-Objekt
// aufgehängt statt global, damit ein Wegwerf-Manifest im Prüffall nicht den
// Stand des Bestands-Manifests sieht.
const PRAEFIX_TAFELN = new WeakMap();

function praefixTafel(manifest) {
  let tafel = PRAEFIX_TAFELN.get(manifest);
  if (tafel == null) {
    tafel = new Map();
    for (const fragment of manifest.fragmente) {
      for (const praefix of fragment.praefixe) tafel.set(praefix, fragment.name);
    }
    PRAEFIX_TAFELN.set(manifest, tafel);
  }
  return tafel;
}

/**
 * Name des Fragments, in das ein Schlüssel gehört — längstes an einer
 * Punkt-Grenze passendes Präfix.
 *
 * @param {string} schluessel Katalog-Schlüssel.
 * @param {object} manifest Tafel aus ladeManifest.
 * @returns {string|null} Fragment-Name oder null, wenn kein Präfix passt.
 */
function fragmentFuer(schluessel, manifest) {
  const tafel = praefixTafel(manifest);
  // Von hinten nach vorn über die Punkt-Grenzen: der erste Treffer ist zugleich
  // das längste passende Präfix, weitere Vergleiche entfallen.
  let rest = String(schluessel);
  for (;;) {
    const name = tafel.get(rest);
    if (name != null) return name;
    const punkt = rest.lastIndexOf('.');
    if (punkt < 0) return null;
    rest = rest.slice(0, punkt);
  }
}

/**
 * Die Fragment-Dateien einer Sprache als Pfade **unterhalb der Fragment-Wurzel**,
 * mit Schrägstrichen, in Manifest-Reihenfolge.
 *
 * 4T-001607: Reine Ableitung aus der bereits gelesenen Tafel, ohne eigenen
 * Datei-Zugriff. Nötig für Aufrufer, die nicht vom Dateisystem lesen: Der
 * Anforderungs-Linter liest den Katalog wahlweise aus dem Git-Index, kommt
 * also mit einer eigenen Bezugsquelle und braucht von hier allein die
 * Zuordnung «welche Dateien, in welcher Reihenfolge».
 *
 * @param {string} code Sprach-Code.
 * @param {object} manifest Tafel aus ladeManifest.
 * @returns {string[]} Pfade der Form `<code>/<name>.json`.
 */
function fragmentPfade(code, manifest) {
  return manifest.fragmente.map((f) => `${code}/${f.name}.json`);
}

/**
 * Die Fragment-Dateien einer Sprache in Manifest-Reihenfolge.
 *
 * @param {string} code Sprach-Code.
 * @param {string} [wurzel] Fragment-Wurzel.
 * @returns {string[]} Absolute Pfade.
 */
function fragmentDateien(code, wurzel = FRAGMENTE_WURZEL) {
  const manifest = ladeManifest(wurzel);
  return fragmentPfade(code, manifest).map((rel) => path.join(wurzel, rel));
}

/**
 * Setzt die Fragmente einer Sprache zu einem flachen Wörterbuch zusammen.
 *
 * Wirft NICHT: Der Aufrufer ist ein Bau-Schritt oder ein Wächter, und beide
 * wollen ALLE Befunde sehen und nicht nur den ersten. Bei Befunden kann `dict`
 * unvollständig sein; maßgeblich ist dann `fehler`.
 *
 * @param {string} code Sprach-Code.
 * @param {{wurzel?: string}} [optionen] Fragment-Wurzel.
 * @returns {{dict: Object<string,string>, fehler: string[]}} Wörterbuch und Befunde.
 */
function zusammensetzen(code, { wurzel = FRAGMENTE_WURZEL } = {}) {
  const dict = {};
  const fehler = [];

  let manifest;
  try {
    manifest = ladeManifest(wurzel);
  } catch (err) {
    return { dict, fehler: [err.message] };
  }

  // Schlüssel → Datei, in der er zuerst stand. Trägt die Dubletten-Meldung, die
  // BEIDE Dateien nennen muss: Wer nur die zweite sieht, sucht die erste von Hand.
  const herkunft = new Map();

  for (const fragment of manifest.fragmente) {
    const datei = path.join(wurzel, code, `${fragment.name}.json`);
    const rel = repoRelativ(datei);

    let text;
    try {
      text = fs.readFileSync(datei, 'utf8');
    } catch (err) {
      fehler.push(`${rel}: Fragment-Datei nicht lesbar (${err.message})`);
      continue;
    }

    let roh;
    try {
      roh = JSON.parse(text);
    } catch (err) {
      fehler.push(`${rel}: nicht parsebar (${err.message})`);
      continue;
    }
    if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
      fehler.push(`${rel}: kein flaches Objekt`);
      continue;
    }

    for (const [schluessel, wert] of Object.entries(roh)) {
      if (typeof wert !== 'string') {
        fehler.push(
          `${rel} / ${schluessel}: Wert ist keine Zeichenkette, sondern ${
            Array.isArray(wert) ? 'ein Array' : `vom Typ ${wert === null ? 'null' : typeof wert}`
          }`,
        );
        continue;
      }

      const erwartet = fragmentFuer(schluessel, manifest);
      if (erwartet !== fragment.name) {
        const ziel =
          erwartet == null
            ? 'kein Fragment im Manifest, Namensraum eintragen'
            : `Fragment «${erwartet}»`;
        fehler.push(`${rel} / ${schluessel}: liegt im falschen Fragment — erwartet ${ziel}`);
      }

      const vorher = herkunft.get(schluessel);
      if (vorher != null) {
        fehler.push(`${schluessel}: steht in zwei Fragmenten — ${vorher} und ${rel}`);
        continue;
      }
      herkunft.set(schluessel, rel);
      dict[schluessel] = wert;
    }
  }

  return { dict, fehler };
}

/**
 * Die eine Textform, in der Fragmente und Erzeugnis geschrieben werden.
 *
 * Sie reproduziert die heutigen, Prettier-formatierten Sprachdateien
 * byte-genau (geprüft für alle fünf); ein eigener Schreiber mit anderer
 * Einrückung oder ohne abschließenden Zeilenumbruch machte den späteren
 * Gleichheits-Nachweis unmöglich.
 *
 * @param {Object<string,string>} dict Flaches Wörterbuch.
 * @returns {string} JSON-Text mit abschließendem Zeilenumbruch.
 */
function serialisiere(dict) {
  return `${JSON.stringify(dict, null, 2)}\n`;
}

module.exports = {
  FRAGMENTE_WURZEL,
  MANIFEST_NAME,
  LOCALE_CODES,
  ladeManifest,
  fragmentFuer,
  fragmentPfade,
  fragmentDateien,
  zusammensetzen,
  serialisiere,
};
