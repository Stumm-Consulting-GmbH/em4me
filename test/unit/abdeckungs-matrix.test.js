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

  // 4T-001167: Sichtbarkeit pruefen statt Verdrahtung. Ein Unit- oder
  // Snapshot-Fall liest Quelltext oder Markup und kann nicht sehen, ob ein
  // Bedienelement in der realen Anordnung sichtbar ist (Befund 1.116.0: vier
  // gruene Faelle, Element durch eine fremde CSS-Regel unsichtbar). Deshalb
  // traegt jeder Unit- und Snapshot-Eintrag das Feld "sichtbarkeit": eine
  // Liste rendernder E2E-Specs, "entfällt: <Grund>" (kein dauerhaft
  // sichtbares Bedienelement betroffen) oder "offen: <Grund>" fuer die
  // gedeckelte Altbestand-Luecke. Regel: Entwicklungsrichtlinien, Kapitel 10.
  describe('Sichtbarkeits-Nachweis (4T-001167)', () => {
    const pflicht = matrix.eintraege.filter(
      (e) => e.testart === 'unit' || e.testart === 'snapshot',
    );

    it('jeder Unit- und Snapshot-Eintrag traegt das Feld sichtbarkeit', () => {
      const ohne = pflicht.filter((e) => e.sichtbarkeit === undefined).map((e) => e.key);
      expect(
        ohne,
        `Ohne Feld "sichtbarkeit" (rendernde E2E-Specs oder "entfällt: <Grund>"): ${ohne.join(', ')}`,
      ).toEqual([]);
    });

    it('das Feld nennt existierende E2E-Specs oder einen substanziellen Grund', () => {
      const fehler = [];
      for (const e of pflicht) {
        const s = e.sichtbarkeit;
        if (Array.isArray(s)) {
          if (s.length === 0) fehler.push(`${e.key}: leere Nachweis-Liste`);
          for (const t of s) {
            if (!/^test\/e2e\/.+\.spec\.js$/.test(t)) fehler.push(`${e.key}: kein E2E-Spec: ${t}`);
            else if (!fs.existsSync(path.join(ROOT, t))) fehler.push(`${e.key}: fehlt: ${t}`);
          }
        } else if (typeof s === 'string') {
          const m = /^(entfällt|offen): (.+)$/.exec(s);
          if (!m) fehler.push(`${e.key}: Form ist weder Liste noch "entfällt: …"/"offen: …"`);
          else if (m[2].length <= 20) fehler.push(`${e.key}: Grund zu kurz`);
        } else {
          fehler.push(`${e.key}: unerwarteter Typ`);
        }
      }
      expect(fehler, fehler.join('\n')).toEqual([]);
    });

    it('die Altbestand-Luecke waechst nicht: neue Bedienelemente bringen ihren E2E-Fall mit', () => {
      const offen = pflicht.filter(
        (e) => typeof e.sichtbarkeit === 'string' && e.sichtbarkeit.startsWith('offen:'),
      );
      // Stand der Sichtung vom 2026-09-03: F-274, F-275, F-276, S-139.
      expect(
        offen.map((e) => e.id),
        'Ein neuer "offen:"-Eintrag ist kein Weg: Das Bedienelement braucht einen rendernden E2E-Fall.',
      ).toEqual(['F-274', 'F-275', 'F-276', 'S-139']);
    });
  });
});
