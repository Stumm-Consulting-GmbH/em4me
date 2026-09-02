// 4T-000215 (Epic 3E-000042): Vollstaendigkeits-Waechter der Handbuch-Seiten.
//
// Jede gebuendelte Seite der Registry (src/shared/manual/manual-pages.js) braucht
// alle fuenf Sprachfassungen unter src/i18n/help/<id>.<lang>.md, und jeder
// titleKey existiert in allen fuenf Sprachdateien. Eine neue Seite ohne
// vollstaendige Uebersetzungen laesst `npm test` fehlschlagen — analog zum
// i18n-Waechter (scripts/check-i18n.js); technische Absicherung der
// Handbuch-Pflege-Konvention (4T-000218).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUAL_PAGES } from '../../src/shared/manual/manual-pages.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const HELP_DIR = path.join(ROOT, 'src', 'i18n', 'help');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

const dicts = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8')),
  ]),
);

describe('Handbuch-Seiten-Registry (4T-000215)', () => {
  it('jede gebuendelte Seite hat alle fuenf Sprachfassungen', () => {
    const fehlend = [];
    for (const page of MANUAL_PAGES) {
      if (page.source !== 'bundled') continue;
      for (const lang of LANGS) {
        const file = path.join(HELP_DIR, `${page.id}.${lang}.md`);
        if (!fs.existsSync(file)) fehlend.push(`${page.id}.${lang}.md`);
      }
    }
    expect(fehlend, `Fehlende Handbuch-Fassungen: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('jeder Seiten-Titel-Key existiert in allen fuenf Sprachdateien', () => {
    const fehlend = [];
    for (const page of MANUAL_PAGES) {
      for (const lang of LANGS) {
        if (typeof dicts[lang][page.titleKey] !== 'string' || dicts[lang][page.titleKey] === '') {
          fehlend.push(`${lang}: ${page.titleKey}`);
        }
      }
    }
    expect(fehlend, `Fehlende Titel-Keys: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('keine verwaisten Seiten-Dateien ohne Registry-Eintrag', () => {
    const bundledIds = new Set(MANUAL_PAGES.filter((p) => p.source === 'bundled').map((p) => p.id));
    const verwaist = fs
      .readdirSync(HELP_DIR)
      .filter((f) => /\.(de|en|fr|es|it)\.md$/.test(f))
      .filter((f) => !bundledIds.has(f.replace(/\.(de|en|fr|es|it)\.md$/, '')));
    expect(verwaist, `Dateien ohne Registry-Eintrag: ${verwaist.join(', ')}`).toEqual([]);
  });
});
