// 4T-0674 (Epic 3E-0135): Wächter des Rückverweises auf die Produkt-Webseite.
//
// Die Adresse der Webseite steht an zwei Orten in der Anwendung: als anklickbarer
// Verweis im Über-Dialog und als Listenpunkt der Handbuch-Überblicksseite. Beide
// Stellen sind sprachabhängig (en unter der Wurzel, de/fr/es/it als Unterordner)
// und können still auseinanderlaufen — etwa wenn ein Sprach-Ziel vergessen wird
// oder das Anker-Element beim Umbau des Modals verloren geht. Ein solcher Bruch
// fällt im Betrieb kaum auf, weil jede Fassung für sich stimmig aussieht.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const HELP_DIR = path.join(ROOT, 'src', 'i18n', 'help');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

// Sprach-Ziele: Englisch liegt unter der Wurzel, die übrigen als Unterordner mit
// abschließendem Schrägstrich. Muss mit about.websiteUrl und den Handbuch-Links
// übereinstimmen.
const ZIEL = {
  de: 'https://em4me.ch/de/',
  en: 'https://em4me.ch/',
  fr: 'https://em4me.ch/fr/',
  es: 'https://em4me.ch/es/',
  it: 'https://em4me.ch/it/',
};

describe('Rückverweis auf die Produkt-Webseite (4T-0674)', () => {
  it('der Über-Dialog führt genau ein Rückverweis-Element', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
    const vorkommen = (html.match(/data-i18n="about\.website"/g) || []).length;
    expect(vorkommen, 'erwartet genau ein Anker mit data-i18n="about.website"').toBe(1);
  });

  it('alle fünf Handbuch-Überblicksseiten verweisen auf das sprachrichtige Ziel', () => {
    const fehlend = [];
    for (const lang of LANGS) {
      const inhalt = fs.readFileSync(path.join(HELP_DIR, `overview.${lang}.md`), 'utf8');
      // Markdown-Link-Ziel mit schließender Klammer, damit die Wurzel-Adresse
      // (en) nicht fälschlich in den Unterordner-Adressen mitzählt.
      if (!inhalt.includes(`](${ZIEL[lang]})`))
        fehlend.push(`overview.${lang}.md -> ${ZIEL[lang]}`);
    }
    expect(fehlend, `Handbuch ohne sprachrichtigen Verweis: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('alle fünf Sprachdateien tragen about.website und about.websiteUrl', () => {
    for (const lang of LANGS) {
      const json = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'),
      );
      expect(json['about.website'], `${lang}: about.website fehlt`).toBeTruthy();
      const url = json['about.websiteUrl'];
      expect(url, `${lang}: about.websiteUrl fehlt`).toBeTruthy();
      expect(
        url.startsWith('https://em4me.ch'),
        `${lang}: about.websiteUrl zeigt woanders hin`,
      ).toBe(true);
      expect(url, `${lang}: about.websiteUrl weicht vom Sprach-Ziel ab`).toBe(ZIEL[lang]);
    }
  });
});
