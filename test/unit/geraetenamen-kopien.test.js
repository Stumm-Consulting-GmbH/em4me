// Review-Befund Z2 vom 2026-11-22 (Epic 3E-000416, Fehlerklasse L5,
// «Doppel-Mechanismen ohne gemeinsame Heimat»): die Heimat der Erkennung
// reservierter Gerätenamen von Windows und eine Ratsche über ihre Kopien im
// Produkt-Code. Dritte Familie nach dem Muster von test/unit/zaun-kopien.test.js
// und test/unit/anker-kopien.test.js, angelegt mit ihrem ersten Vorfall
// (Entwicklungsrichtlinien, Kapitel 6, «Erkennungen haben eine Heimat»).
//
// Der Vorfall: Die Prüf-Funktion der Grenze (`src/main/grants/path-check.js`)
// trug eine zweite, weitere Fassung der Regel aus
// `src/shared/database/lock-folder-name.js`. Beide lesen seither aus
// `src/shared/windows-geraetenamen.js`.
//
// **Was als Kopie zählt**, erhoben am 2026-11-22 über alle Quelldateien unter
// `src/` außer den erzeugten Bündeln: ein regulärer Ausdruck, eine
// Zeichenkette oder ein Stück einer Vorlagen-Zeichenkette, das zwei der
// Gerätenamen `con`, `prn`, `aux` und `nul` als Alternativen nebeneinander
// trägt (`con|prn`, in jeder Reihenfolge und Schreibweise). Kommentare
// zählen nicht, weil die Zerlegung über `espree` sie nicht sieht. Ausnahmen
// gibt es keine; eine begründete zweite Fassung käme mit einer Ausnahme-Liste
// nach dem Vorbild der beiden anderen Ratschen.
//
// Die Bestands-Lesung steht im Modulkopf (test/README.md, Abschnitt
// «Bestands-Lesungen gehören in den Modulkopf»).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tokenize } from 'espree';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// Die Ratsche liest jede Quelldatei unter src/ im Rumpf eines Prüffalls.
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const require = createRequire(import.meta.url);
const {
  WINDOWS_DEVICE_NAME_RE,
  isWindowsDeviceName,
} = require('../../src/shared/windows-geraetenamen.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEIMAT = 'src/shared/windows-geraetenamen.js';

// Plausibilitäts-Schranke: Ein Scan, der kaum Dateien sieht, wäre grün, ohne
// etwas geprüft zu haben (Bestand am 2026-11-22: weit über 1000 Dateien).
const MINDEST_DATEIEN = 800;

// Template-Stücke zählen mit (Review Runde 2, Hinweis): Ein `new RegExp` aus
// einer Vorlagen-Zeichenkette ist ebenso eine Kopie wie ein Literal.
const ARTEN = new Set(['RegularExpression', 'String', 'Template']);

const GERAET = '(?:con|prn|aux|nul)';
const ZWEI_GERAETE = new RegExp(`${GERAET}\\|${GERAET}`, 'i');

function zerlege(quelltext) {
  const optionen = { ecmaVersion: 'latest', loc: true };
  try {
    return tokenize(quelltext, { ...optionen, sourceType: 'module' });
  } catch {
    return tokenize(quelltext, { ...optionen, sourceType: 'script' });
  }
}

function quellDateien(ordner, liste = []) {
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) quellDateien(voll, liste);
    else if (eintrag.name.endsWith('.js') && !eintrag.name.endsWith('.bundle.js')) liste.push(voll);
  }
  return liste;
}

describe('Heimat der Gerätenamen-Regel', () => {
  it.each([
    'CON',
    'con',
    'PRN.txt',
    'aux .md',
    'NUL',
    'COM1',
    'com0',
    'LPT9.log',
    'lpt0',
    'COM¹',
    'LPT³.txt',
    'CLOCK$',
    'CONIN$',
    'conout$.x',
  ])('%s ist ein Gerätename', (name) => {
    expect(isWindowsDeviceName(name)).toBe(true);
    expect(WINDOWS_DEVICE_NAME_RE.test(name)).toBe(true);
  });

  it.each(['.con', 'console', 'COM10', 'LPT', 'auxiliary.txt', 'Notiz.md', 'nul-Punkt', ''])(
    '%s ist kein Gerätename',
    (name) => {
      expect(isWindowsDeviceName(name)).toBe(false);
    },
  );

  it('ein Wert, der kein Text ist, ist kein Gerätename', () => {
    expect(isWindowsDeviceName(undefined)).toBe(false);
    expect(isWindowsDeviceName(42)).toBe(false);
  });
});

describe('Ratsche: keine Kopie der Gerätenamen-Regel außerhalb ihrer Heimat', () => {
  it('nur die Heimat trägt die Erkennung', () => {
    const dateien = quellDateien(path.join(WURZEL, 'src'));
    expect(dateien.length).toBeGreaterThan(MINDEST_DATEIEN);
    const funde = [];
    let heimatGesehen = false;
    for (const datei of dateien) {
      const rel = path.relative(WURZEL, datei).split(path.sep).join('/');
      const treffer = zerlege(fs.readFileSync(datei, 'utf8')).filter(
        (t) => ARTEN.has(t.type) && ZWEI_GERAETE.test(t.value),
      );
      if (rel === HEIMAT) {
        heimatGesehen = treffer.length > 0;
        continue;
      }
      for (const t of treffer) funde.push(`${rel}:${t.loc.start.line}`);
    }
    // Die Heimat selbst muss der Scan erkennen, sonst prüft die Ratsche nichts.
    expect(heimatGesehen).toBe(true);
    expect(funde).toEqual([]);
  });
});
