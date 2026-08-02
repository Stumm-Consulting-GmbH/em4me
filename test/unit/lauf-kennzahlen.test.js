// 4T-0782 (Epic 3E-0156): Wächter über die versionierte Kennzahl der
// ausgeführten Testfälle (test/lauf-kennzahlen.json).
//
// Die Datei wird nicht von Hand gepflegt, sondern von
// scripts/test-kennzahlen.js aus den Maschinen-Berichten des Voll-Laufs
// geschrieben, und das Zahlenband der Produkt-Webseite liest sie. Sie kann
// deshalb auf zwei Arten falsch werden: Sie fehlt oder verliert ihre Form
// (dann entfällt die Kennzahl still), oder sie veraltet, weil ein Release
// ohne den Nachzieh-Schritt lief.
//
// Gegen das Veralten hilft nur eine grobe Schranke: Die exakte Zahl der
// ausgeführten Fälle steht erst nach einem Lauf fest, und den führt ein
// Unit-Test nicht. Die statische Quelltext-Zählung ist dafür der richtige
// Anker — sie ist die Größenordnung, nicht der Wert, und beide Größen
// wachsen miteinander.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HERE, '..', '..');
const DATEI = path.join(WURZEL, 'test', 'lauf-kennzahlen.json');

const FALL_MUSTER = /^[ \t]*(?:it|test)\s*\(/gm;

function zaehleStatisch(ordner) {
  let summe = 0;
  const gehe = (verzeichnis) => {
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const voll = path.join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) gehe(voll);
      else if (/\.(test|spec)\.js$/.test(eintrag.name)) {
        summe += (fs.readFileSync(voll, 'utf8').match(FALL_MUSTER) || []).length;
      }
    }
  };
  gehe(ordner);
  return summe;
}

describe('Lauf-Kennzahlen der Testsuiten (4T-0782, 4T-0831)', () => {
  it('die Datei existiert und trägt die drei Zahlen', () => {
    expect(fs.existsSync(DATEI), `${path.relative(WURZEL, DATEI)} fehlt`).toBe(true);
    const daten = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
    for (const feld of ['unit', 'e2e', 'summe']) {
      expect(Number.isFinite(daten[feld]), `Feld ${feld} fehlt oder ist keine Zahl`).toBe(true);
      expect(daten[feld]).toBeGreaterThan(0);
    }
    expect(daten.summe, 'summe ist nicht die Summe von unit und e2e').toBe(daten.unit + daten.e2e);
  });

  it('die Zahlen liegen in der Größenordnung des Quelltext-Bestands', () => {
    const daten = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
    const statischUnit = zaehleStatisch(path.join(WURZEL, 'test', 'unit'));
    const statischE2E = zaehleStatisch(path.join(WURZEL, 'test', 'e2e'));
    // Nach unten großzügig (übersprungene Fälle, Abstand der Zählweisen),
    // nach oben ebenfalls: Schleifen-erzeugte Fälle dürfen die statische Zahl
    // deutlich übersteigen. Was die Schranke fängt, ist der grobe Verfall —
    // eine Datei, die zwei Releases alt ist. Den Teillauf gibt es seit 4T-0831
    // nicht mehr: Die Zahlen stammen aus der Auflistung, nicht aus Lauf-Berichten.
    expect(daten.unit).toBeGreaterThan(statischUnit * 0.8);
    expect(daten.unit).toBeLessThan(statischUnit * 2);
    expect(daten.e2e).toBeGreaterThan(statischE2E * 0.8);
    expect(daten.e2e).toBeLessThan(statischE2E * 2);
  });

  it('trägt den Hinweis, dass sie erzeugt und nicht gepflegt wird', () => {
    const daten = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
    expect(String(daten._hinweis || '')).toMatch(/test-kennzahlen\.js/);
  });
});
