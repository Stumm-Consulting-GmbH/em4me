// 4T-000195: Vollstaendigkeits-Meta-Test der Abdeckungs-Matrix.
//
// Der kuratierte Funktions-Katalog sind die help.feature.*- und
// help.shortcut.*-Keys aus src/i18n/de.json (import-frei lesbar, keine
// Kopplung an den Renderer-Modul-Schnitt). Jeder Katalog-Eintrag braucht
// einen Matrix-Eintrag mit Testart und existierenden Testdateien oder
// eine Ausnahme (ipc/manuell) mit Begruendung — ein neuer Hilfe-Dialog-
// Eintrag ohne Matrix-Pflege laesst `npm test` fehlschlagen. Damit ist
// die Test-Pflege-Konvention aus 3E-000041 technisch durchgesetzt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const de = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'de.json'), 'utf8'));
const matrix = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'test', 'abdeckungs-matrix.json'), 'utf8'),
);

const katalog = Object.keys(de).filter(
  (k) => k.startsWith('help.feature.') || k.startsWith('help.shortcut.'),
);
const TESTARTEN = ['e2e', 'unit', 'snapshot', 'ipc', 'manuell'];

describe('Abdeckungs-Matrix (Meta-Test, 4T-000195)', () => {
  it('jeder Hilfe-Katalog-Key hat genau einen Matrix-Eintrag', () => {
    const matrixKeys = matrix.eintraege.map((e) => e.key);
    const fehlend = katalog.filter((k) => !matrixKeys.includes(k));
    expect(
      fehlend,
      `Ohne Matrix-Eintrag (test/abdeckungs-matrix.json pflegen!): ${fehlend.join(', ')}`,
    ).toEqual([]);
    const verwaist = matrixKeys.filter((k) => !katalog.includes(k));
    expect(verwaist, `Matrix-Eintraege ohne Katalog-Key: ${verwaist.join(', ')}`).toEqual([]);
    const doppelt = matrixKeys.filter((k, i) => matrixKeys.indexOf(k) !== i);
    expect(doppelt).toEqual([]);
  });

  it('jeder Eintrag hat gueltige Testart, eindeutige ID und konsistente Felder', () => {
    const ids = new Set();
    for (const e of matrix.eintraege) {
      expect(TESTARTEN, `${e.key}: unbekannte Testart '${e.testart}'`).toContain(e.testart);
      expect(e.id).toMatch(/^[FS]-\d{3}$/);
      expect(ids.has(e.id), `doppelte Matrix-ID ${e.id}`).toBe(false);
      ids.add(e.id);
      if (e.testart === 'manuell' || e.testart === 'ipc') {
        expect(
          typeof e.begruendung === 'string' && e.begruendung.length > 20,
          `${e.key}: '${e.testart}' braucht eine substanzielle Begruendung`,
        ).toBe(true);
      }
      if (e.testart !== 'manuell') {
        expect(
          Array.isArray(e.tests) && e.tests.length > 0,
          `${e.key}: Testart '${e.testart}' braucht mindestens eine Testdatei`,
        ).toBe(true);
      }
    }
  });

  it('alle referenzierten Testdateien existieren', () => {
    const fehlend = [];
    for (const e of matrix.eintraege) {
      for (const t of e.tests || []) {
        if (!fs.existsSync(path.join(ROOT, t))) fehlend.push(`${e.key} -> ${t}`);
      }
    }
    expect(fehlend, fehlend.join('\n')).toEqual([]);
  });

  it('manuelle Ausnahmen bleiben die Minderheit', () => {
    const manuell = matrix.eintraege.filter((e) => e.testart === 'manuell');
    expect(manuell.length).toBeLessThanOrEqual(8);
  });
});
