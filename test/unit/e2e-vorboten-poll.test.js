// 4T-001699 (Epic 3E-000156): Wächter gegen die Bauart «Tastendruck in einer
// Poll-Schleife, die auf einen Vorboten wartet».
//
// Der Fall EX-04 (erweiterungen-extern.spec.js) war zwischen dem 2026-08-14 und
// dem 2026-09-19 neunmal rot, jedes Mal mit demselben Bild: Der Helfer drückte
// in jedem Poll-Durchgang Strg+, und wartete auf die ANZAHL der Einstellungs-
// Seiten im DOM — vorhanden ist die Seite aber auch als Reiter im Hintergrund,
// und der nächste Schritt klickte 30 Sekunden gegen «element is not visible».
// Dieselbe Bauart stand in 24 Prüfdateien an 30 Stellen; sie ist mit dem
// Vorgang durch den geteilten Helfer oeffneEinstellungsSeite ersetzt
// (test/e2e/helpers/eingabe.js), der auf die Sichtbarkeit wartet.
// Stabilitätsregel 12 in test/README.md sagt es als Prosa: Gewartet wird auf
// den erwarteten Zustand, nie auf dessen Vorboten. Dieser Wächter macht den
// häufigsten Vorboten maschinell: eine Zählung «mehr als null» als Rückgabe
// eines Poll-Rückrufs, in dem gedrückt wird. Die Form ist statisch sichtbar,
// wie beim Formprüfer der Browser-Rückrufe; ein Lauf ist dafür nicht nötig.
//
// Grenze: Erkannt wird die Form «press … return …count()» mit «toBeGreaterThan(0)»
// innerhalb EINES Poll-Rückrufs. Eine Zählung, die auf einen genauen Wert wartet
// (toBe(1), toBe(0)), misst den Zustand selbst — etwa die Einträge eines
// Kontextmenüs nach einer Einstellungs-Änderung in bereichs-statistik.spec.js —
// und bleibt erlaubt.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// Der Bestands-Fall liest jede Ablauf-Prüfdatei (Regel Z1 des Zeitlimit-Wächters).
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const E2E = path.join(WURZEL, 'test', 'e2e');

// Ein Poll-Rückruf, der drückt, eine Zählung zurückgibt und auf «mehr als null»
// wartet — also auf das VORHANDENSEIN. Die Klammerung ist bewusst grob: Innerhalb
// des Rückrufs darf beliebiger Text stehen, solange der Druck vor der Rückgabe
// kommt und kein zweiter Poll dazwischenliegt; ein Optionen-Objekt des Polls
// (zweites Argument) ist erlaubt.
const VORBOTEN_POLL =
  /\.poll\(\s*async\s*\([^)]*\)\s*=>\s*\{(?:(?!\.poll\()[^])*?keyboard\.press\([^)]*\)(?:(?!\.poll\()[^])*?return\s+[^;]*\.count\(\);\s*\}\s*(?:,\s*\{[^}]*\}\s*)?\)\s*\.toBeGreaterThan\(0\)/g;

function specDateien() {
  const treffer = [];
  (function lauf(ordner) {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const abs = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) lauf(abs);
      else if (eintrag.name.endsWith('.spec.js'))
        treffer.push(path.relative(WURZEL, abs).split(path.sep).join('/'));
    }
  })(E2E);
  return treffer;
}

function fundstellen(text) {
  return [...text.matchAll(VORBOTEN_POLL)].map((m) => text.slice(0, m.index).split('\n').length);
}

describe('E2E-Suite: kein Tastendruck in einer Poll-Schleife auf eine Zählung (4T-001699)', () => {
  const vorher = [
    'async function openExternalSection(page) {',
    '  await expect',
    '    .poll(async () => {',
    "      await page.keyboard.press('Control+,');",
    '      return page.locator(SETTINGS_PAGE).count();',
    '    })',
    '    .toBeGreaterThan(0);',
    '}',
  ].join('\n');

  it('Rot-Probe: die Fassung von EX-04 vor 4T-001699 wird gemeldet', () => {
    expect(fundstellen(vorher)).toEqual([3]);
    // Mit Optionen-Objekt des Polls ebenso.
    const mitOptionen = vorher.replace(
      '    })\n    .toBeGreaterThan(0);',
      '    }, { timeout: 20000 })\n    .toBeGreaterThan(0);',
    );
    expect(fundstellen(mitOptionen)).toEqual([3]);
  });

  it('Gegenprobe: Sichtbarkeit, Zählung ohne Tastendruck und genauer Wert sind erlaubt', () => {
    const sichtbar = vorher.replace(
      'return page.locator(SETTINGS_PAGE).count();',
      'return page.locator(SETTINGS_PAGE).isVisible();',
    );
    const ohneDruck = vorher.replace(
      "await page.keyboard.press('Control+,');",
      'await ziel.click();',
    );
    // Kontextmenü nach einer Einstellungs-Änderung: die Zählung IST der Zustand.
    const genauerWert = [
      '      await expect',
      '        .poll(',
      '          async () => {',
      "            await page.keyboard.press('Escape');",
      "            await section.locator('.area-files-title').click({ button: 'right', force: true });",
      '            return page.locator(MENU_EINTRAG).count();',
      '          },',
      '          { timeout: 20000 },',
      '        )',
      '        .toBe(1);',
    ].join('\n');
    // Zwei Polls hintereinander: der Druck gehört zum ersten, die Zählung zum zweiten.
    const zweiPolls = [
      '    .poll(async () => {',
      "      await page.keyboard.press('Escape');",
      '      return page.locator(MODAL).isVisible();',
      '    })',
      '    .toBe(false);',
      '  await expect.poll(async () => page.locator(ROWS).count()).toBeGreaterThan(0);',
    ].join('\n');
    expect(fundstellen(sichtbar)).toEqual([]);
    expect(fundstellen(ohneDruck)).toEqual([]);
    expect(fundstellen(genauerWert)).toEqual([]);
    expect(fundstellen(zweiPolls)).toEqual([]);
  });

  it('der Bestand unter test/e2e trägt die Bauart nicht', () => {
    const befunde = [];
    for (const rel of specDateien()) {
      const text = fs.readFileSync(path.join(WURZEL, ...rel.split('/')), 'utf8');
      for (const zeile of fundstellen(text)) befunde.push(`${rel}:${zeile}`);
    }
    expect(
      befunde,
      'Poll-Rückruf drückt eine Taste und wartet auf eine Zählung — auf den Zustand warten ' +
        '(Sichtbarkeit), für die Einstellungs-Seite oeffneEinstellungsSeite aus test/e2e/helpers/eingabe.js',
    ).toEqual([]);
  });
});
