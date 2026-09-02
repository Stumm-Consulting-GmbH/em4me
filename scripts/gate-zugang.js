// 4T-001191: Der Pflicht-Zugang wird zum einzigen Weg (Weg 4 der
// Entscheidungsvorlage vom 2026-08-29, Ort am 2026-08-30 entschieden).
//
// Die Regel «jeder Lauf mit Befund-Charakter geht über node scripts/gate-lauf.js
// <gate>» gilt seit dem 2026-08-20 und trug nicht: Die Zählung wies für die
// Fehlerklasse L3 vier Wiederholungen nach dem Maßnahme-Datum aus. Ursache war
// nicht die fehlende Regel, sondern die fehlende Deckung — nichts hinderte eine
// Sitzung am bequemeren Aufruf, und der Rückgabewert einer Pipe belohnte ihn
// zusätzlich mit einem Erfolg, der keiner war.
//
// **Warum die Sperre hier sitzt und nicht in `package.json`.** Die Entscheidung
// vom 2026-08-29 sah vor, `npm test` auf den Pflicht-Zugang umzubiegen und den
// rohen Lauf auf einen internen Namen zu legen. `package.json` gehört jedoch zur
// Release-Isolation (`scripts/produkt-code-waechter.js`): Der Wächter weist jede
// Integration mit dieser Datei außerhalb einer Release-Strecke ab, und das
// Pflege-Gefäß dieses Vorgangs kann selbst kein Release tragen. Der Product
// Owner hat am 2026-08-30 deshalb den Ort verlegt, nicht das Prinzip: Die Sperre
// liegt in der Test-Konfiguration, die fortlaufend integrierbar ist. Sie deckt
// dabei **mehr** als der ursprüngliche Zuschnitt, weil auch der direkte Aufruf
// des Test-Programms (`npx vitest run`, `npx playwright test`) an ihr vorbei
// müsste — ein Vorbeiweg, den eine Umbenennung in `package.json` offen gelassen
// hätte.
//
// **Die Abgrenzung gegen die freie Entwicklungs-Iteration** ist die vom Product
// Owner am 2026-08-29 bestätigte: Ein Aufruf mit konkretem Datei- oder
// Muster-Argument ist Iteration und bleibt frei, ein Aufruf ohne solches
// Argument ist ein Voll-Lauf und verlangt den Zugang. Sie steht im Kommandotext
// und braucht keine Kenntnis darüber, ob der Ausgang später berichtet wird — die
// Frage, an der eine Erkennung sonst scheitern müsste, weil ein Wächter die
// Zukunft nicht kennt.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Der Pflicht-Zugang setzt diese Marke, bevor er ein Test-Gate startet
// (`prozessGate` in `gate-lauf.js`). Sie ist bewusst die einzige Stelle, an der
// beide Zugänge — Einzel-Lauf und Merge-Queue — sie erzeugen, weil die Queue
// ihre Gates aus demselben Modul bezieht.
const ZUGANGS_MARKE = 'EM4ME_GATE_ZUGANG';

// Unterbefehle und Optionen sind keine Filter. Die Menge deckt beide Werkzeuge
// gemeinsam ab; im Zweifel gilt ein Argument als Filter **nicht**, sondern der
// Lauf als Voll-Lauf — die Richtung, die eine Lücke schließt statt sie zu
// öffnen (fail closed, Muster des Produkt-Code-Wächters).
const UNTERBEFEHLE = Object.freeze([
  'run',
  'watch',
  'dev',
  'related',
  'bench',
  'list',
  'test',
  'vitest',
  'playwright',
]);

// 4T-001322: Eine Auflistung ist kein Lauf. Vitest kennt sie als Unterbefehl
// (`vitest list`), Playwright als Schalter (`playwright test --list`); beide
// laden die Prüfdateien und durchlaufen die Registrierungs-Phase, führen aber
// keinen einzigen Fall aus und tragen deshalb keinen Befund.
//
// **Warum das eine eigene Erkennung ist und nicht ein Eintrag mehr in
// `UNTERBEFEHLE`.** Dort steht `list` bereits, und zwar als das, was es dort
// bedeutet: kein Filter. Beide Begriffe fallen für dasselbe Wort verschieden
// aus — ein Filter macht den Lauf zur freien Iteration, eine Auflistung macht
// ihn zum Nicht-Lauf — und wer sie in einer Liste vermengt, kann später den
// einen nicht ändern, ohne den anderen still mitzuändern.
//
// **Warum die Sperre dadurch nicht lockerer wird.** Der erklärte Gegenstand
// des Wächters ist der «Lauf mit Befund-Charakter» (Kopf dieser Datei). Eine
// Auflistung ist keiner, also trifft die Ausnahme die Regel-Grenze und nicht
// ihren Inhalt. Der Voll-Lauf bleibt unverändert abgewiesen; der Prüffall dazu
// ist die Gegenprobe in `test/unit/gate-zugang.test.js`.
//
// Anlass: `scripts/test-kennzahlen.js` ermittelt die Kennzahl «Automatische
// Prüfungen» bewusst über die Auflistung statt über einen Lauf (4T-000831). Seit
// dem 2026-08-30 wies der Pflicht-Zugang sie ab, Schritt 8 jeder
// Release-Vorbereitung fiel aus, und die Kennzahl der Webseite fror auf 5400
// ein.
function istAuflistung(argv) {
  const rest = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < rest.length; i += 1) {
    const wort = String(rest[i]);
    if (wort.startsWith('-')) {
      if (wort === '--list' || wort.startsWith('--list=')) return true;
      // Wie unten: `--option wert` frisst das nächste Wort. Ohne diesen Schritt
      // gälte `--reporter list` als Auflistung, obwohl `list` dort der Wert
      // einer Option ist.
      if (!wort.includes('=') && i + 1 < rest.length && !String(rest[i + 1]).startsWith('-'))
        i += 1;
      continue;
    }
    if (wort === 'list') return true;
  }
  return false;
}

// Trägt der Aufruf ein Datei- oder Muster-Argument? Optionen (`--reporter`,
// `-t`) und ihre Werte bleiben außen vor: Ein Wert nach einer Option ist kein
// Filter, sondern gehört zu ihr.
function hatFilterArgument(argv) {
  const rest = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < rest.length; i += 1) {
    const wort = String(rest[i]);
    if (wort.startsWith('-')) {
      // `--option=wert` trägt den Wert bei sich; `--option wert` frisst das
      // nächste Wort. Beides ist kein Filter.
      if (!wort.includes('=') && i + 1 < rest.length && !String(rest[i + 1]).startsWith('-'))
        i += 1;
      continue;
    }
    if (!UNTERBEFEHLE.includes(wort)) return true;
  }
  return false;
}

// 4T-001324: Der Pflicht-Zugang gilt nur dort, wo sein Weg überhaupt existiert.
// Der kuratierte Quellcode-Export überträgt beide Test-Konfigurationen samt
// diesem Modul, aber bewusst **nicht** `gate-lauf.js`: Der Gate-Weg ist internes
// Vorgehen und gehört nicht in die Veröffentlichung. Dort liefe der Wächter
// sonst scharf ins Leere — `npm test` ist im öffentlichen Repositorium
// `vitest run`, also ein Voll-Lauf ohne Filter, und der einzige von der
// Abweisung genannte Ausweg wäre nicht vorhanden. Ein Wächter, der einen Weg
// verlangt, den es in dieser Kopie nicht gibt, ist eine Falle statt eines
// Schutzes. Innerhalb des Projekts liegt `gate-lauf.js` neben dieser Datei, die
// Sperre bleibt dort also unverändert scharf.
//
// Die Existenz wird hereingereicht statt hier ermittelt, damit die Entscheidung
// rein bleibt und ohne Repositorium prüfbar ist.
function pruefeZugang(argv, env, zugangswegVorhanden = true) {
  if (!zugangswegVorhanden) return null;
  if (env && env[ZUGANGS_MARKE]) return null;
  // 4T-001322: vor der Filter-Frage, weil eine Auflistung gar kein Lauf ist und
  // die Filter-Frage nur Läufe unterscheidet.
  if (istAuflistung(argv)) return null;
  if (hatFilterArgument(argv)) return null;
  return (
    `Voll-Lauf ohne Pflicht-Zugang — abgewiesen.\n` +
    `Ein Lauf mit Befund-Charakter geht über den Gate-Weg:\n` +
    `    node scripts/gate-lauf.js test      (Unit- und Snapshot-Suite)\n` +
    `    node scripts/gate-lauf.js e2e       (E2E-Suite)\n` +
    `    node scripts/gate-lauf.js alle      (alle Gates)\n` +
    `Er fährt dasselbe Kommando wie das gleichnamige Gate der Merge-Queue, reicht ` +
    `den Rückgabewert unverfälscht weiter und sichert im roten Fall den ungekürzten ` +
    `Beleg selbsttätig.\n` +
    `Die freie Entwicklungs-Iteration bleibt offen: Ein Aufruf mit konkretem Datei- ` +
    `oder Muster-Argument läuft unverändert durch.\n` +
    `Hintergrund: Fehlerklasse L3, Vorgang 4T-001191.`
  );
}

// Setup-Einsprung beider Werkzeuge. Vitest ruft den benannten Export `setup`
// seines `globalSetup`, Playwright das Modul selbst als Funktion — deshalb
// trägt das Modul beide Formen. Die Meldung geht zusätzlich auf stderr, weil
// der geworfene Fehler bei Vitest sonst zwischen Stapel-Zeilen steht.
// Liegt der Gate-Weg neben diesem Modul? Siehe die Begründung an
// `pruefeZugang`; getrennt gehalten, damit die Entscheidung rein bleibt.
function zugangswegVorhanden() {
  return fs.existsSync(path.join(__dirname, 'gate-lauf.js'));
}

function setup() {
  const befund = pruefeZugang(process.argv, process.env, zugangswegVorhanden());
  if (!befund) return;
  process.stderr.write(`\n${befund}\n\n`);
  throw new Error('Voll-Lauf ohne Pflicht-Zugang (4T-001191)');
}

module.exports = setup;
module.exports.setup = setup;
module.exports.pruefeZugang = pruefeZugang;
module.exports.zugangswegVorhanden = zugangswegVorhanden;
module.exports.hatFilterArgument = hatFilterArgument;
module.exports.istAuflistung = istAuflistung;
module.exports.ZUGANGS_MARKE = ZUGANGS_MARKE;
module.exports.UNTERBEFEHLE = UNTERBEFEHLE;
