// 4T-001605 (Epic 3E-000278): Die wiederholbare Zerlegung der Sprachdateien in
// Fragmente.
//
// **Warum wiederholbar und nicht einmalig von Hand.** Die Zerlegung ist kein
// Umzug, den man einmal macht und danach vergisst: Sie ist der Gegenbeweis zum
// Bau-Schritt. Wer wissen will, ob Fragmente und zusammengesetzte Datei noch
// dasselbe sagen, lässt dieses Werkzeug laufen und vergleicht byte-genau. Ein
// von Hand geschnittener Bestand könnte das nie belegen.
//
// **Die Reihenfolge ist die von de.json, für alle fünf Sprachen.** Die vier
// übersetzten Fassungen weichen heute an 27 bis 32 Positionen von der deutschen
// Reihenfolge ab, ohne dass ein Grund dafür erkennbar wäre — Reste von
// Hand-Nachträgen. Nach der Zerlegung sind die fünf Dateien eines Fragments
// zeilengleich aufgebaut: Wer zwei Sprachfassungen nebeneinander legt, sieht
// dieselbe Zeile am selben Ort. Das ist der eigentliche Gewinn gegenüber einem
// bloßen Aufteilen, und es kostet nichts, weil die Reihenfolge innerhalb einer
// JSON-Datei fachlich nichts bedeutet.
//
// **Abbruch statt Notbehelf.** Eine nicht deckungsgleiche Schlüssel-Menge oder
// ein Schlüssel ohne Fragment sind keine Lagen, die dieses Werkzeug ausbügeln
// darf: Beides hieße, eine Entscheidung zu treffen, die in die Zuordnungs-Tafel
// oder in die Sprachdateien gehört. Es bricht deshalb ab und nennt Sprache und
// Schlüssel.
//
// Aufruf:
//   node scripts/i18n-zerlegen.js                     zerlegt src/i18n nach src/i18n/fragments
//   node scripts/i18n-zerlegen.js --nur-pruefen       rechnet, schreibt nichts
//   Optionen: --quelle <ordner>, --ziel <ordner>, --hilfe
// Rückgabe: 0 bei Erfolg, 1 bei Abbruch.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  FRAGMENTE_WURZEL,
  LOCALE_CODES,
  ladeManifest,
  fragmentFuer,
  serialisiere,
} = require('./i18n-fragmente.js');

const REPO_WURZEL = path.resolve(__dirname, '..');
const QUELLE_VORGABE = path.join(REPO_WURZEL, 'src', 'i18n');

// Die Sprache, deren Reihenfolge alle fünf Fassungen übernehmen. Bewusst nicht
// FALLBACK_LOCALE: Der Rückfall ist Englisch, die Formulierungs-Quelle des
// Projekts ist Deutsch, und die Reihenfolge folgt der Quelle.
const REIHENFOLGE_SPRACHE = 'de';

function repoRelativ(absolut) {
  return path.relative(REPO_WURZEL, absolut).split(path.sep).join('/');
}

/**
 * Zerlegt die Sprachdateien in Fragmente.
 *
 * @param {object} [optionen]
 * @param {string} [optionen.quelle] Ordner mit den fünf `<code>.json`.
 * @param {string} [optionen.ziel] Ordner, unter dem `<code>/<name>.json` entsteht.
 * @param {string} [optionen.manifestWurzel] Ordner der Zuordnungs-Tafel. Sie
 *   beschreibt den Bestand und nicht das Erzeugnis; deshalb bleibt sie beim
 *   Schreiben in einen Wegwerf-Ordner die des Repositoriums.
 * @param {boolean} [optionen.schreiben] false rechnet nur.
 * @returns {{fragmente: Array<{name: string, anzahl: number}>, summe: number,
 *   codes: string[], dateien: string[]}} Ergebnis-Übersicht.
 */
function zerlegen({
  quelle = QUELLE_VORGABE,
  ziel = FRAGMENTE_WURZEL,
  manifestWurzel = FRAGMENTE_WURZEL,
  schreiben = true,
} = {}) {
  const manifest = ladeManifest(manifestWurzel);

  const dicts = new Map();
  for (const code of LOCALE_CODES) {
    const datei = path.join(quelle, `${code}.json`);
    let roh;
    try {
      roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
    } catch (err) {
      throw new Error(`${repoRelativ(datei)}: nicht lesbar (${err.message})`, { cause: err });
    }
    if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
      throw new Error(`${repoRelativ(datei)}: kein flaches Objekt`);
    }
    dicts.set(code, roh);
  }

  // Deckungsgleichheit der Schlüssel-Mengen. Ohne sie wären die Fragmente einer
  // Sprache nicht zeilengleich zu denen der anderen, und der spätere
  // Gleichheits-Nachweis verglich Äpfel mit Birnen.
  const leitSchluessel = Object.keys(dicts.get(REIHENFOLGE_SPRACHE));
  const leitMenge = new Set(leitSchluessel);
  const abweichungen = [];
  for (const code of LOCALE_CODES) {
    if (code === REIHENFOLGE_SPRACHE) continue;
    const eigene = Object.keys(dicts.get(code));
    for (const schluessel of eigene) {
      if (!leitMenge.has(schluessel)) abweichungen.push(`${code}: «${schluessel}» kennt de nicht`);
    }
    const eigeneMenge = new Set(eigene);
    for (const schluessel of leitSchluessel) {
      if (!eigeneMenge.has(schluessel)) abweichungen.push(`${code}: «${schluessel}» fehlt`);
    }
  }
  if (abweichungen.length > 0) {
    throw new Error(
      `Die Schlüssel-Mengen der Sprachdateien sind nicht deckungsgleich:\n  ${abweichungen.join('\n  ')}`,
    );
  }

  // Zuordnung in der Reihenfolge von de.json; innerhalb eines Fragments bleibt
  // die relative Reihenfolge damit erhalten.
  const nachFragment = new Map(manifest.fragmente.map((f) => [f.name, []]));
  const ohneFragment = [];
  for (const schluessel of leitSchluessel) {
    const name = fragmentFuer(schluessel, manifest);
    if (name == null) ohneFragment.push(schluessel);
    else nachFragment.get(name).push(schluessel);
  }
  if (ohneFragment.length > 0) {
    throw new Error(
      `Kein Fragment für ${ohneFragment.length} Schlüssel — Namensraum in die Zuordnungs-Tafel eintragen:\n  ${ohneFragment.join('\n  ')}`,
    );
  }
  const leere = manifest.fragmente
    .map((f) => f.name)
    .filter((n) => nachFragment.get(n).length === 0);
  if (leere.length > 0) {
    throw new Error(`Leere Fragmente — Eintrag streichen oder Präfixe prüfen: ${leere.join(', ')}`);
  }

  const dateien = [];
  for (const code of LOCALE_CODES) {
    const dict = dicts.get(code);
    const ordner = path.join(ziel, code);
    if (schreiben) fs.mkdirSync(ordner, { recursive: true });
    for (const fragment of manifest.fragmente) {
      const teil = {};
      for (const schluessel of nachFragment.get(fragment.name)) teil[schluessel] = dict[schluessel];
      const datei = path.join(ordner, `${fragment.name}.json`);
      if (schreiben) fs.writeFileSync(datei, serialisiere(teil), 'utf8');
      dateien.push(datei);
    }
  }

  const fragmente = manifest.fragmente.map((f) => ({
    name: f.name,
    anzahl: nachFragment.get(f.name).length,
  }));
  return { fragmente, summe: leitSchluessel.length, codes: [...LOCALE_CODES], dateien };
}

// --- Kommandozeile ---------------------------------------------------------

function leseArgumente(argv) {
  const optionen = {
    quelle: QUELLE_VORGABE,
    ziel: FRAGMENTE_WURZEL,
    schreiben: true,
    hilfe: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hilfe' || arg === '--help') optionen.hilfe = true;
    else if (arg === '--nur-pruefen') optionen.schreiben = false;
    else if (arg === '--quelle') optionen.quelle = path.resolve(argv[(i += 1)] ?? '');
    else if (arg === '--ziel') optionen.ziel = path.resolve(argv[(i += 1)] ?? '');
    else throw new Error(`Unbekanntes Argument «${arg}» (--hilfe zeigt die Optionen)`);
  }
  return optionen;
}

function hilfe() {
  console.log(
    [
      'node scripts/i18n-zerlegen.js [--quelle <ordner>] [--ziel <ordner>] [--nur-pruefen]',
      '',
      '  Zerlegt die fünf Sprachdateien in die Fragmente der Zuordnungs-Tafel',
      '  src/i18n/fragments/manifest.json. Alle fünf Fassungen übernehmen die',
      '  Reihenfolge von de.json.',
      '',
      '  --quelle       Ordner mit den <code>.json (Vorgabe src/i18n)',
      '  --ziel         Ordner für <code>/<name>.json (Vorgabe src/i18n/fragments)',
      '  --nur-pruefen  rechnet und meldet, schreibt nichts',
    ].join('\n'),
  );
}

function main(argv) {
  let optionen;
  try {
    optionen = leseArgumente(argv);
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  if (optionen.hilfe) {
    hilfe();
    return 0;
  }

  let ergebnis;
  try {
    ergebnis = zerlegen(optionen);
  } catch (err) {
    console.error(`Abbruch: ${err.message}`);
    return 1;
  }

  const breite = Math.max(...ergebnis.fragmente.map((f) => f.name.length));
  for (const fragment of ergebnis.fragmente) {
    console.log(`  ${fragment.name.padEnd(breite)}  ${String(fragment.anzahl).padStart(5)}`);
  }
  console.log(`  ${'Summe'.padEnd(breite)}  ${String(ergebnis.summe).padStart(5)}`);
  console.log(
    `\n${ergebnis.fragmente.length} Fragmente × ${ergebnis.codes.length} Sprachen = ` +
      `${ergebnis.dateien.length} Dateien ${optionen.schreiben ? 'geschrieben' : 'gerechnet (--nur-pruefen)'}` +
      `${optionen.schreiben ? ` unter ${repoRelativ(optionen.ziel)}/` : ''}`,
  );
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { zerlegen, QUELLE_VORGABE, REIHENFOLGE_SPRACHE };
