// 4T-002006 (Epic 3E-000333): Wächter der Bibliotheken, die allein
// Entwicklungs-Hilfsmittel sind. Eine solche Bibliothek steht unter
// devDependencies, exakt festgelegt, und kein Modul unter src/ lädt sie — der
// Bündler des Anzeige-Prozesses nähme sonst auch eine Entwicklungs-Abhängigkeit
// ins Programm auf (Entwicklungsrichtlinien, Kapitel 8). Erste und bisher
// einzige: lunar-javascript, die Quelle der chinesischen Kalender-Tafel
// (scripts/kalender-tafel-erzeugen.js); das Programm liest nur die erzeugte
// Tafel src/shared/calendar/year-tables/chinese.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Name → exakte Fassung.
const NUR_ENTWICKLUNG = { 'lunar-javascript': '1.7.1' };

describe('Bibliotheken nur für die Entwicklung (4T-002006)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

  it('package.json führt sie exakt festgelegt unter devDependencies, nie unter dependencies', () => {
    for (const [name, fassung] of Object.entries(NUR_ENTWICKLUNG)) {
      expect(pkg.devDependencies[name], name).toBe(fassung);
      expect(pkg.dependencies, name).not.toHaveProperty(name);
    }
    // Die Bau-Konfiguration nimmt allein src/ und package.json auf, nie node_modules.
    expect(pkg.build.files.filter((f) => !f.startsWith('!'))).toEqual(['src/**/*', 'package.json']);
  });

  // Liest jede Datei unter src/ im Rumpf; benanntes Zeitlimit nach test/zeitlimits.js.
  it('kein Modul unter src/ lädt sie', { timeout: BESTAND_ZEITLIMIT }, () => {
    const namen = Object.keys(NUR_ENTWICKLUNG).join('|');
    const laden = new RegExp(
      `(require\\s*\\(\\s*|from\\s+|import\\s*\\(\\s*)['"](${namen})(/|['"])`,
    );
    const treffer = [];
    const durchsuche = (ordner) => {
      for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
        const p = path.join(ordner, e.name);
        if (e.isDirectory()) durchsuche(p);
        else if (/\.(c|m)?js$/.test(e.name) && laden.test(fs.readFileSync(p, 'utf8'))) {
          treffer.push(path.relative(REPO, p));
        }
      }
    };
    durchsuche(path.join(REPO, 'src'));
    expect(treffer).toEqual([]);
  });
});
