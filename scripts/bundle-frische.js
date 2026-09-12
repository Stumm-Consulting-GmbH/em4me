// 4T-001481 / 4T-001475: Frische des Renderer-Bündels am E2E-Tor.
//
// **Der Gegenstand.** Die E2E-Fälle starten die Anwendung gegen das erzeugte,
// unversionierte Bündel `src/renderer/renderer.bundle.js`; `src/renderer/index.html`
// lädt es, `scripts/build-renderer.js` baut es. Angestoßen wird der Bau über den
// npm-Hook `pretest:e2e`, und der greift bei `npm run test:e2e` und damit auch
// beim Gate-Weg `node scripts/gate-lauf.js e2e` — **nicht** aber bei einem
// direkten `npx playwright test <datei>`. Genau dieser Aufruf ist die freie
// Entwicklungs-Iteration, die der Pflicht-Zugang (4T-001191) ausdrücklich offen
// lässt; dort läuft die Suite gegen ein beliebig altes Bündel, und nichts meldet
// es.
//
// **Zwei belegte Vorfälle.** `4T-001478` (Fehlerklasse L9) meldete acht grüne
// E2E-Fälle, die den geänderten Code nie berührt hatten. `4T-001410` verbrannte
// rund fünfzehn Minuten und zwei verworfene Hypothesen an einem leeren
// Diagnose-Protokoll, weil der instrumentierte Quelltext gar nicht lief.
//
// **Wo das Tor hängt und warum nicht im `globalSetup`.** `4T-001481` nannte das
// `globalSetup` der Playwright-Konfiguration als Ort. Es ist besetzt und trägt
// genau einen Eintrag, den der Pflicht-Zugang (`scripts/gate-zugang.js`) hält;
// sein Wächter `test/unit/gate-zugang.test.js` schreibt ihn zusätzlich als
// **Zeichenkette** fest, eine Liste fiele dort durch. Und die Konfiguration
// selbst darf nicht prüfen: Derselbe Wächter lädt sie, und ein fehlendes Bündel
// ist im Unit-Lauf der Normalfall — ein Abbruch im Konfigurations-Rumpf färbte
// die Unit-Suite rot. Das Tor sitzt deshalb im Modulkopf von
// `test/e2e/helpers/app.js`, der einzigen Stelle des Projekts, die Electron für
// die E2E-Suite startet (nachgesehen an `test/e2e/**`), und zwar in `launchApp`
// unmittelbar vor `electron.launch`. Die Schärfe bleibt die von `4T-001481`
// verlangte: **Abbruch, nicht Warnung.**
//
// **Warum in `launchApp` und nicht im Modulkopf des Helfers.** Ein Wurf beim
// Laden träfe auch `playwright test --list`: Die Auflistung lädt jede Prüfdatei,
// führt aber keinen Fall aus, und `scripts/test-kennzahlen.js` gewinnt die
// Kennzahl «Automatische Prüfungen» genau daraus (4T-000831). Ein Wächter im
// Modulkopf hätte sie eingefroren — derselbe Vorfall, den 4T-001322 für den
// Pflicht-Zugang bereits einmal aufräumen musste. In `launchApp` stellt sich die
// Frage gar nicht: Eine Auflistung startet keine Anwendung. Gemessen am
// 2026-09-06 gegen ein veraltetes Bündel listet
// `npx playwright test --list --reporter=json` unverändert 726 Fälle.
//
// **Warum Änderungszeiten und kein Inhalts-Hash** (die von `4T-001481` zur
// Klärung gestellte Frage). Ein Inhalts-Vergleich müsste den Fingerabdruck der
// Bau-Eingänge festhalten, aus denen das vorliegende Bündel entstanden ist —
// also einen Stempel schreiben. Das Bündel selbst trägt ihn nicht, und aus ihm
// sind seine Quellen nicht rückrechenbar. Ein Stempel wäre eine Schreib-Wirkung
// und stünde damit gegen die Zusicherung, dass dieser Wächter den Arbeitsbaum
// nicht anfasst (AK4, Grundsatz E7/E8); geschrieben werden könnte er ohnehin nur
// vom Bau, nicht von der Prüfung.
//
// Der Zweifel, den der Vorgang nennt — nach einem `git checkout` springen
// Zeitstempel —, trägt in die andere Richtung als befürchtet. Gemessen am
// 2026-09-06 an einem Wegwerf-Repositorium: `git checkout` schreibt **nur** die
// Dateien neu, deren Inhalt sich unterscheidet (eine unberührte Datei behielt
// ihre Zeit), und das ungetrackte Bündel fasst es nie an. Ein Sprung der
// Quell-Zeit bedeutet also einen tatsächlich geänderten Inhalt, und das Bündel
// ist dann wirklich veraltet. Der eine Rest-Fall ist der Hin-und-Zurück-Wechsel:
// Der Inhalt ist wieder der des Baus, die Zeit ist jünger, der Wächter schlägt
// an. Er kostet einen überflüssigen Bau von wenigen Sekunden — ein Fehlalarm,
// nie ein stiller Durchlass. Die Richtung des Irrtums ist damit dieselbe, in die
// der Produkt-Code-Wächter und der Pflicht-Zugang irren: fail closed.
//
// ---------------------------------------------------------------------------
//
// 4T-001606 (Epic 3E-000278): **Eine zweite Zuständigkeit, kein zweiter
// Wächter.** Seit diesem Vorgang sind auch die fünf Sprachdateien
// `src/i18n/<code>.json` erzeugt — aus den Fragmenten unter
// `src/i18n/fragments/`, durch `scripts/build-i18n.js`, angestoßen vom selben
// `npm run build:renderer`. Damit gilt für sie Wort für Wort dieselbe Gefahr wie
// oben für das Bündel: ein Lauf gegen einen alten Stand, grün oder rot aus
// Gründen, die mit der eigenen Änderung nichts zu tun haben. Die zwei belegten
// Vorfälle des Bündels (`4T-001478`, `4T-001410`) sind der Beleg, dass diese
// Gefahr sich nicht von selbst meldet.
//
// **Warum hier und nicht als eigenes Modul.** Beide Prüfungen beantworten
// dieselbe Frage an denselben Zeitpunkten mit demselben Mittel — ist das
// Erzeugnis jünger als seine Eingänge, gemessen an Änderungszeiten —, und beide
// hängen an demselben Bau-Kommando, das die Abhilfe nennt. Ein zweites Modul
// hieße: zwei Einhäng-Stellen, die einzeln vergessen werden können, zwei
// Meldungs-Formen, die auseinanderlaufen, und zwei Antworten auf die Frage «ist
// mein Arbeitsbaum gebaut». Der Aufrufer will genau eine Antwort. Die
// Begründungen oben — Änderungszeiten statt Inhalts-Hash, Gleichstand gilt als
// frisch, fail closed, der Wächter schreibt nichts — gelten unverändert mit.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 4T-000391: Sprachliste aus der einen Quelle, nicht als weitere Kopie hier.
const { LOCALE_CODES } = require('../src/shared/locales.js');

// Der Gegenstand der Prüfung, relativ zur Projekt-Wurzel.
const BUENDEL = ['src', 'renderer', 'renderer.bundle.js'];

// 4T-001606: Gegenstand und Eingänge der zweiten Zuständigkeit. Die
// Zuordnungs-Tafel zählt für JEDE Sprache mit — sie bestimmt, welche Fragmente
// es gibt und in welcher Reihenfolge sie zusammenkommen, und eine Änderung an
// ihr allein verändert jedes der fünf Erzeugnisse.
const I18N_ORDNER = ['src', 'i18n'];
const FRAGMENTE_ORDNER = ['src', 'i18n', 'fragments'];
const FRAGMENTE_MANIFEST = ['src', 'i18n', 'fragments', 'manifest.json'];

// Die Ordner, aus denen das Bündel entsteht. `src/shared/` gehört dazu, weil die
// Renderer-Module daraus importieren (nachgesehen an `src/renderer/modules/**`,
// nicht angenommen); esbuild zieht den gesamten Import-Graphen des Einstiegs
// `src/renderer/renderer.js` ein.
const QUELL_ORDNER = [
  ['src', 'renderer'],
  ['src', 'shared'],
];

// Erzeugtes zählt nicht als Quelle. Alle Einträge sind an `.gitignore` und an
// den Bau-Skripten geprüft: `build-renderer.js` erzeugt das Bündel selbst und
// ruft davor `build-hljs-themes.js` (hljs-themes.css), `build-katex-assets.js`
// (katex/), `build-tour-assets.js` (driverjs/) und `build-mermaid.js`
// (mermaid.bundle.js). Ohne diese Liste hielte sich der Wächter an seinem
// eigenen Bau-Ergebnis fest.
const ERZEUGT_DATEIEN = new Set([
  'src/renderer/renderer.bundle.js',
  'src/renderer/mermaid.bundle.js',
  'src/renderer/hljs-themes.css',
]);
const ERZEUGT_ORDNER = ['src/renderer/katex/', 'src/renderer/driverjs/'];

// Eine benannte Ausnahme: `src/shared/build-info.json` ist versioniert, wird
// aber vom Anwendungs-Bau geschrieben und erreicht das Bündel nicht — sie wird
// allein vom Main-Prozess gelesen (`src/main/main.js`, nachgesehen). Ohne die
// Ausnahme machte jeder `npm run build` das Bündel formal veraltet.
const NICHT_IM_BUENDEL = new Set(['src/shared/build-info.json']);

function istErzeugt(relPfad) {
  if (ERZEUGT_DATEIEN.has(relPfad)) return true;
  if (NICHT_IM_BUENDEL.has(relPfad)) return true;
  return ERZEUGT_ORDNER.some((ordner) => relPfad.startsWith(ordner));
}

// Rein lesender Durchlauf; er legt nichts an und ändert nichts (AK4).
function sammle(wurzel, ordner, treffer) {
  let eintraege;
  try {
    eintraege = fs.readdirSync(ordner, { withFileTypes: true });
  } catch {
    // Fehlender Ordner ist kein Befund dieses Wächters: Der Bau scheiterte dann
    // ohnehin lauter, als eine Frische-Meldung es könnte.
    return;
  }
  for (const eintrag of eintraege) {
    const abs = path.join(ordner, eintrag.name);
    const rel = path.relative(wurzel, abs).split(path.sep).join('/');
    if (eintrag.isDirectory()) {
      if (istErzeugt(`${rel}/`)) continue;
      sammle(wurzel, abs, treffer);
      continue;
    }
    if (!eintrag.isFile()) continue;
    if (istErzeugt(rel)) continue;
    let zeit;
    try {
      zeit = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    if (!treffer.zeit || zeit > treffer.zeit) {
      treffer.zeit = zeit;
      treffer.pfad = rel;
    }
  }
}

/**
 * Jüngste Quelldatei des Bündel-Graphen.
 * @param {string} wurzel Projekt-Wurzel (im Prüffall ein gestelltes Verzeichnis).
 * @returns {{pfad: string, zeit: number}|null}
 */
function juengsteQuelle(wurzel) {
  const treffer = { pfad: null, zeit: 0 };
  for (const teile of QUELL_ORDNER) sammle(wurzel, path.join(wurzel, ...teile), treffer);
  return treffer.pfad ? treffer : null;
}

function alsZeit(ms) {
  return new Date(ms).toISOString();
}

function meldung(grund, quelle, buendelZeit) {
  const kopf =
    grund === 'fehlt'
      ? 'Renderer-Bündel fehlt — E2E-Lauf abgebrochen.'
      : 'Renderer-Bündel veraltet — E2E-Lauf abgebrochen.';
  const zeilen = [
    kopf,
    'Die Prüffälle starten die Anwendung gegen src/renderer/renderer.bundle.js,',
    'nicht gegen die Quellmodule. Ein Lauf gegen einen alten Stand ist grün oder rot',
    'aus Gründen, die mit der eigenen Änderung nichts zu tun haben.',
  ];
  if (grund === 'veraltet' && quelle) {
    zeilen.push('');
    zeilen.push(`    jüngste Quelle:  ${quelle.pfad}  (${alsZeit(quelle.zeit)})`);
    zeilen.push(`    Bündel:          ${alsZeit(buendelZeit)}`);
  }
  zeilen.push('');
  zeilen.push('Frisch bauen, dann erneut laufen lassen:');
  zeilen.push('    node scripts/gate-lauf.js e2e     (der Gate-Weg baut selbst mit)');
  zeilen.push('    npm run build:renderer            (vor einer freien Iteration von Hand)');
  zeilen.push('');
  zeilen.push('Hintergrund: Fehlerklasse L9, Vorgänge 4T-001481 und 4T-001475.');
  return zeilen.join('\n');
}

/**
 * Die reine Entscheidung: Ist das Bündel jünger als jede seiner Quellen?
 *
 * Der Wächter liest ausschließlich; er baut nicht und schreibt nichts (AK4 von
 * 4T-001481). Ein fehlendes Bündel wird wie ein veraltetes behandelt (AK3).
 *
 * @param {string} wurzel Projekt-Wurzel (im Prüffall ein gestelltes Verzeichnis).
 * @returns {{grund: 'fehlt'|'veraltet', quelle: object|null, meldung: string}|null}
 *          null heißt frisch — der Normalfall über den Gate-Weg, weil dessen
 *          `pre`-Kette unmittelbar davor gebaut hat.
 */
function pruefeBundleFrische(wurzel) {
  const buendelPfad = path.join(wurzel, ...BUENDEL);
  let buendelZeit;
  try {
    buendelZeit = fs.statSync(buendelPfad).mtimeMs;
  } catch {
    // Fehlend, unlesbar oder kein regulärer Eintrag: alles derselbe Befund.
    buendelZeit = null;
  }
  if (buendelZeit === null) {
    return { grund: 'fehlt', quelle: null, meldung: meldung('fehlt', null, null) };
  }
  const quelle = juengsteQuelle(wurzel);
  // Gleichstand gilt als frisch: Der Bau schreibt das Bündel nach dem Lesen
  // seiner Eingänge, und die Zeit-Auflösung des Dateisystems ist gröber als
  // dieser Abstand.
  if (!quelle || quelle.zeit <= buendelZeit) return null;
  return { grund: 'veraltet', quelle, meldung: meldung('veraltet', quelle, buendelZeit) };
}

// --- 4T-001606: zweite Zuständigkeit, die erzeugten Sprachdateien -----------

/**
 * Jüngster Eingang einer Sprache: ihre Fragmente plus die Zuordnungs-Tafel.
 *
 * Der Durchlauf ist derselbe wie beim Bündel (`sammle`), weil die Frage
 * dieselbe ist. Die Ausnahme-Listen greifen hier nicht — sie führen
 * ausschließlich Pfade unter `src/renderer/` und `src/shared/` —, und unter
 * `src/i18n/fragments/` steht ohnehin nichts Erzeugtes.
 *
 * @param {string} wurzel Projekt-Wurzel.
 * @param {string} code Sprach-Code.
 * @returns {{pfad: string, zeit: number}|null}
 */
function juengsterSprachEingang(wurzel, code) {
  const treffer = { pfad: null, zeit: 0 };
  sammle(wurzel, path.join(wurzel, ...FRAGMENTE_ORDNER, code), treffer);
  try {
    const zeit = fs.statSync(path.join(wurzel, ...FRAGMENTE_MANIFEST)).mtimeMs;
    if (zeit > treffer.zeit) {
      treffer.zeit = zeit;
      treffer.pfad = FRAGMENTE_MANIFEST.join('/');
    }
  } catch {
    // Fehlende Tafel ist kein Befund dieses Wächters: Der Bau scheiterte dann
    // ohnehin lauter, als eine Frische-Meldung es könnte (Muster von `sammle`).
  }
  return treffer.pfad ? treffer : null;
}

function sprachMeldung(grund, code, quelle, erzeugnisZeit) {
  const zeilen = [
    grund === 'fehlt'
      ? `Sprachdatei src/i18n/${code}.json fehlt — Lauf abgebrochen.`
      : `Sprachdatei src/i18n/${code}.json veraltet — Lauf abgebrochen.`,
    'Die fünf Sprachdateien sind seit 4T-001606 erzeugt: scripts/build-i18n.js setzt sie',
    'aus den Fragmenten unter src/i18n/fragments/ zusammen. Anwendung und Prüffälle lesen',
    'das Erzeugnis, nicht die Fragmente — ein Lauf gegen einen alten Stand misst einen',
    'Bestand, den niemand mehr pflegt.',
  ];
  if (grund === 'veraltet' && quelle) {
    zeilen.push('');
    zeilen.push(`    jüngster Eingang:  ${quelle.pfad}  (${alsZeit(quelle.zeit)})`);
    zeilen.push(`    Erzeugnis:         src/i18n/${code}.json  (${alsZeit(erzeugnisZeit)})`);
  }
  zeilen.push('');
  zeilen.push('Frisch bauen, dann erneut laufen lassen:');
  zeilen.push('    npm run build:renderer            (baut die Sprachdateien mit)');
  zeilen.push('    node scripts/build-i18n.js        (nur die Sprachdateien)');
  zeilen.push('');
  zeilen.push('Hintergrund: Epic 3E-000278, Vorgang 4T-001606.');
  return zeilen.join('\n');
}

/**
 * Die reine Entscheidung für die Sprachdateien: Ist jedes der fünf Erzeugnisse
 * jünger als die Fragmente seiner Sprache und als die Zuordnungs-Tafel?
 *
 * Gemeldet wird der ERSTE Befund in der Reihenfolge der Sprachliste. Fünf
 * Befunde auf einmal helfen nicht: Die Abhilfe ist für alle dieselbe, und sie
 * behebt sie alle in einem Lauf.
 *
 * @param {string} wurzel Projekt-Wurzel (im Prüffall ein gestelltes Verzeichnis).
 * @returns {{grund: 'fehlt'|'veraltet', code: string, quelle: object|null,
 *           meldung: string}|null} null heißt frisch.
 */
function pruefeSprachFrische(wurzel) {
  for (const code of LOCALE_CODES) {
    const erzeugnis = path.join(wurzel, ...I18N_ORDNER, `${code}.json`);
    let erzeugnisZeit;
    try {
      erzeugnisZeit = fs.statSync(erzeugnis).mtimeMs;
    } catch {
      erzeugnisZeit = null;
    }
    if (erzeugnisZeit === null) {
      return {
        grund: 'fehlt',
        code,
        quelle: null,
        meldung: sprachMeldung('fehlt', code, null, null),
      };
    }
    const quelle = juengsterSprachEingang(wurzel, code);
    // Gleichstand gilt als frisch, aus demselben Grund wie beim Bündel.
    if (!quelle || quelle.zeit <= erzeugnisZeit) continue;
    return {
      grund: 'veraltet',
      code,
      quelle,
      meldung: sprachMeldung('veraltet', code, quelle, erzeugnisZeit),
    };
  }
  return null;
}

/**
 * Die Durchsetzung am Tor: Abbruch statt Warnung.
 *
 * Eine Warnung stünde in der Ausgabe eines Laufs, den man erst am Ende liest —
 * also genau die Prosa-Regel, die der Vorfall bereits gerissen hat. Die Meldung
 * geht zusätzlich auf stderr, damit sie nicht zwischen Stapel-Zeilen steht
 * (Muster aus `scripts/gate-zugang.js`).
 *
 * 4T-001606: Geprüft werden BEIDE Erzeugnisse mit derselben Deutlichkeit. Ein
 * frisches Bündel neben einer veralteten Sprachdatei ist kein halber Erfolg,
 * sondern derselbe Irrtum an einer anderen Stelle.
 *
 * @param {string} wurzel Projekt-Wurzel.
 */
function fordereFrischesBuendel(wurzel) {
  const befund = pruefeBundleFrische(wurzel);
  if (befund) {
    process.stderr.write(`\n${befund.meldung}\n\n`);
    throw new Error(
      befund.grund === 'fehlt'
        ? 'Renderer-Bündel fehlt (4T-001481)'
        : 'Renderer-Bündel veraltet (4T-001481)',
    );
  }
  const sprachBefund = pruefeSprachFrische(wurzel);
  if (!sprachBefund) return null;
  process.stderr.write(`\n${sprachBefund.meldung}\n\n`);
  throw new Error(
    sprachBefund.grund === 'fehlt'
      ? `Sprachdatei ${sprachBefund.code}.json fehlt (4T-001606)`
      : `Sprachdatei ${sprachBefund.code}.json veraltet (4T-001606)`,
  );
}

module.exports = {
  pruefeBundleFrische,
  pruefeSprachFrische,
  fordereFrischesBuendel,
  juengsteQuelle,
  juengsterSprachEingang,
  BUENDEL,
  QUELL_ORDNER,
  ERZEUGT_DATEIEN,
  ERZEUGT_ORDNER,
  NICHT_IM_BUENDEL,
  I18N_ORDNER,
  FRAGMENTE_ORDNER,
  FRAGMENTE_MANIFEST,
};

// Auskunft von Hand: `node scripts/bundle-frische.js` meldet den Stand und
// endet bei einem Befund mit 1. Kein npm-Skript dafür — `package.json` gehört
// zur Release-Isolation und wird außerhalb einer Release-Strecke nicht angefasst.
if (require.main === module) {
  const wurzel = path.join(__dirname, '..');
  // 4T-001606: beide Zuständigkeiten, beide melden einzeln. Ein Befund reicht
  // für den Rückgabewert 1; gezeigt werden trotzdem beide, weil ein Bau ohnehin
  // beide zugleich behebt und die zweite Meldung sonst erst im nächsten Lauf
  // sichtbar würde.
  const befunde = [pruefeBundleFrische(wurzel), pruefeSprachFrische(wurzel)].filter(Boolean);
  if (befunde.length === 0) {
    process.stdout.write('Renderer-Bündel und Sprachdateien sind frisch.\n');
  } else {
    for (const befund of befunde) process.stderr.write(`\n${befund.meldung}\n\n`);
    process.exitCode = 1;
  }
}
