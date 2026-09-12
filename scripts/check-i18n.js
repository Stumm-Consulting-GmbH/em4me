// S-09 (4T-000185): Waechter fuer die i18n-Synchronitaet. Prueft die fuenf
// Sprachfassungen auf identische Key-Mengen, nicht-leere Werte und pro Key
// identische Platzhalter-Mengen ({name}-Tokens). Wird als Unit-Test
// eingebunden (test/unit/i18n.test.js) und laeuft damit in `npm test`
// und ueber den pre-commit-Hook bei jedem Commit; zusaetzlich direkt
// aufrufbar: `node scripts/check-i18n.js`.
//
// 4T-001607 (Epic 3E-000278): Der Waechter liest seit diesem Task die
// **Fragmente** unter src/i18n/fragments/<code>/ ueber den gemeinsamen Lader,
// nicht mehr die zusammengesetzten Dateien src/i18n/<code>.json. Grund ist die
// Trennlinie des Epics: Wer den Schluessel-Bestand prueft, zaehlt oder pflegt,
// liest die versionierte Quelle; wer eine ladefertige Sprachdatei als Daten
// braucht, liest das Erzeugnis. Ein Waechter muss ohne vorherigen Bau laufen
// koennen — das Erzeugnis ist unversioniert und im frisch geklonten Baum gar
// nicht da.
//
// Dazu kommt eine Pruefung, die es am Erzeugnis nicht geben konnte: Die fuenf
// Sprachen muessen **gleich geschnitten** sein, also je Sprache genau die
// Fragment-Dateien fuehren, welche die Zuordnungs-Tafel nennt. Beide
// Richtungen zaehlen. Eine fehlende Datei nimmt einer Sprache einen ganzen
// Namensraum; eine ueberzaehlige Datei ist schlimmer, weil niemand sie
// bemerkt: Der Bau setzt allein zusammen, was die Tafel nennt, und ein Ordner
// mit `fr/veraltet.json` faellt sonst keinem Werkzeug auf.
//
// Die **Schluessel-Menge je Fragment** wird nicht eigens verglichen, und zwar
// nicht aus Nachlaessigkeit: Der Lader prueft je Sprache jeden Schluessel gegen
// die Tafel («liegt im falschen Fragment»), und die Schluessel-Gleichheit
// unten prueft die Mengen ueber alle fuenf. Beides zusammen laesst zwei
// Sprachen denselben Schluessel gar nicht in verschiedenen Fragmenten fuehren.
// Ein dritter Vergleich wuerde nie ausschlagen und liesse sich damit auch nicht
// scharf stellen (Fehlerklasse L11).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
const { LOCALE_CODES: LANGS } = require('../src/shared/locales');
const {
  FRAGMENTE_WURZEL,
  ladeManifest,
  fragmentDateien,
  zusammensetzen,
} = require('./i18n-fragmente');

const REF_LANG = 'de';

function placeholders(value) {
  const found = new Set();
  for (const m of String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)) found.add(m[1]);
  return found;
}

/**
 * Gleicher Schnitt ueber alle Sprachen: je Sprache genau die Fragment-Dateien,
 * welche die Zuordnungs-Tafel nennt — keine fehlt, keine kommt hinzu.
 *
 * @param {string} wurzel Fragment-Wurzel.
 * @param {string[]} errors Befund-Liste, wird ergaenzt.
 */
function pruefeSchnitt(wurzel, errors) {
  const manifest = ladeManifest(wurzel);
  const erwartet = new Set(manifest.fragmente.map((f) => f.name));

  for (const lang of LANGS) {
    // fragmentDateien liefert die Pfade in Tafel-Reihenfolge; gemessen wird
    // hier, ob es sie gibt.
    for (const datei of fragmentDateien(lang, wurzel)) {
      if (fs.existsSync(datei)) continue;
      errors.push(
        `${lang}: nicht gleich geschnitten — Fragment «${path.basename(datei, '.json')}» fehlt ` +
          `(erwartet ${lang}/${path.basename(datei)} nach der Zuordnungs-Tafel)`,
      );
    }

    const ordner = path.join(wurzel, lang);
    let vorhanden;
    try {
      vorhanden = fs.readdirSync(ordner);
    } catch (err) {
      errors.push(`${lang}: Fragment-Ordner nicht lesbar (${err.message})`);
      continue;
    }
    for (const name of vorhanden) {
      if (!name.endsWith('.json')) continue;
      const kurz = name.slice(0, -'.json'.length);
      if (erwartet.has(kurz)) continue;
      errors.push(
        `${lang}: nicht gleich geschnitten — Fragment «${kurz}» steht nicht in der ` +
          `Zuordnungs-Tafel; der Bau laesst ${lang}/${name} stillschweigend liegen`,
      );
    }
  }
}

// Liefert { ok, errors: string[], keyCount } ueber alle fuenf Sprachfassungen.
function checkI18n(wurzel = FRAGMENTE_WURZEL) {
  const errors = [];
  const dicts = {};

  for (const lang of LANGS) {
    const { dict, fehler } = zusammensetzen(lang, { wurzel });
    errors.push(...fehler);
    dicts[lang] = dict;
  }

  // Der Schnitt wird auch dann gemessen, wenn der Lader schon Befunde hat: Eine
  // fehlende Fragment-Datei ist beides — der Lader nennt sie als unlesbar, und
  // erst diese Meldung sagt, dass die Sprachen verschieden geschnitten sind.
  try {
    pruefeSchnitt(wurzel, errors);
  } catch (err) {
    // Eine kaputte Zuordnungs-Tafel wirft; der Lader hat sie oben bereits je
    // Sprache gemeldet, hier genuegt der Verzicht auf die Schnitt-Aussage.
    if (errors.length === 0) errors.push(err.message);
  }

  if (errors.length > 0) return { ok: false, errors, keyCount: 0 };

  const refKeys = Object.keys(dicts[REF_LANG]);
  const refSet = new Set(refKeys);

  for (const lang of LANGS) {
    const keys = new Set(Object.keys(dicts[lang]));
    if (lang !== REF_LANG) {
      for (const k of refSet) {
        if (!keys.has(k)) errors.push(`${lang}: Key fehlt: ${k}`);
      }
      for (const k of keys) {
        if (!refSet.has(k)) errors.push(`${lang}: ueberzaehliger Key: ${k}`);
      }
    }
    for (const [k, v] of Object.entries(dicts[lang])) {
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`${lang}: leerer oder nicht-String-Wert: ${k}`);
      }
    }
  }

  // Platzhalter-Konsistenz gegen die DE-Referenz.
  for (const k of refKeys) {
    const refPh = placeholders(dicts[REF_LANG][k]);
    for (const lang of LANGS) {
      if (lang === REF_LANG || dicts[lang][k] === undefined) continue;
      const ph = placeholders(dicts[lang][k]);
      const missing = [...refPh].filter((p) => !ph.has(p));
      const extra = [...ph].filter((p) => !refPh.has(p));
      if (missing.length > 0 || extra.length > 0) {
        errors.push(
          `${lang}: Platzhalter-Abweichung bei ${k}` +
            (missing.length ? ` (fehlt: {${missing.join('}, {')}})` : '') +
            (extra.length ? ` (zu viel: {${extra.join('}, {')}})` : ''),
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, keyCount: refKeys.length };
}

module.exports = { checkI18n, LANGS, FRAGMENTE_WURZEL };

if (require.main === module) {
  const result = checkI18n();
  if (result.ok) {
    console.log(
      `check-i18n: OK (${LANGS.length} Sprachen, ${result.keyCount} Keys, ` +
        'schluesselgleich und gleich geschnitten)',
    );
  } else {
    console.error(`check-i18n: ${result.errors.length} Problem(e):`);
    for (const e of result.errors) console.error('  - ' + e);
    process.exitCode = 1;
  }
}
