// 4T-0221 (Epic 3E-0042): Stil-Waechter der nutzer-sichtbaren Hilfetexte.
//
// Sichert die beiden Befunde der Gesamtabnahme 0.29.0 dauerhaft ab
// (Hotfixes 4T-0219/0.29.1 und 4T-0220/0.29.2): Handbuch-Seiten und
// i18n-Kataloge enthalten keine Fremdprodukt-Verweise als Herkunfts-
// oder Stil-Referenz und keine Versions-Historie ("Ab Version 0.13.0
// ..."). Einzige Ausnahme: die Emoji-Seiten duerfen "GitHub" nennen
// (Datenbasis GitHub-Emoji-Set samt ikatyang-Link, Festlegung des
// Product Owners im Epic-Auftrag). Details: CLAUDE.md, Abschnitt
// "Stil-Regeln fuer nutzer-sichtbare Texte".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const HELP_DIR = path.join(ROOT, 'src', 'i18n', 'help');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

// Fremdprodukt-Namen, die nirgendwo in Hilfetexten stehen duerfen.
const FREMDPRODUKT = /\b(Pandoc|Obsidian|Logseq|MediaWiki|GFM|VS Code)\b|commonmark\.org/;
// "GitHub" ist nur auf den Emoji-Seiten erlaubt (Datenbasis-Angabe).
const GITHUB = /GitHub/;
// Versions-Historie: "Version 0.13.0", "version 0.13.0", "versión 0.13.0",
// "versione 0.13.0" sowie nackte SemVer-Nummern (einstellige Major-Version,
// letztes Segment maximal dreistellig — Punkt-Datumsangaben wie 12.06.2026
// in den Werkzeug-Beispielen bleiben dadurch erlaubt) und "seit/ab 0.x".
const VERSIONS_HISTORIE =
  /\bversi(?:on|ón|one)\s+\d|\b\d\.\d+\.\d{1,3}(?!\d)|\b(?:seit|ab|since|depuis|desde|dalla)\s+0\.\d/i;

function helpFiles() {
  return fs.readdirSync(HELP_DIR).filter((f) => /\.(de|en|fr|es|it)\.md$/.test(f));
}

function treffer(text, regex) {
  const zeilen = [];
  text.split('\n').forEach((zeile, i) => {
    if (regex.test(zeile)) zeilen.push(`Zeile ${i + 1}: ${zeile.trim().slice(0, 80)}`);
  });
  return zeilen;
}

describe('Stil-Waechter Hilfetexte (4T-0221)', () => {
  it('Handbuch-Seiten enthalten keine Fremdprodukt-Verweise', () => {
    const funde = [];
    for (const file of helpFiles()) {
      const text = fs.readFileSync(path.join(HELP_DIR, file), 'utf8');
      for (const t of treffer(text, FREMDPRODUKT)) funde.push(`${file} — ${t}`);
      if (!/^emoji\./.test(file)) {
        for (const t of treffer(text, GITHUB)) funde.push(`${file} — ${t}`);
      }
    }
    expect(funde, `Fremdprodukt-Verweise in Handbuch-Seiten:\n${funde.join('\n')}`).toEqual([]);
  });

  it('Handbuch-Seiten enthalten keine Versions-Historie', () => {
    const funde = [];
    for (const file of helpFiles()) {
      const text = fs.readFileSync(path.join(HELP_DIR, file), 'utf8');
      for (const t of treffer(text, VERSIONS_HISTORIE)) funde.push(`${file} — ${t}`);
    }
    expect(funde, `Versions-Historie in Handbuch-Seiten:\n${funde.join('\n')}`).toEqual([]);
  });

  it('i18n-Katalog-Texte sind frei von Fremdprodukt-Verweisen und Versions-Historie', () => {
    const funde = [];
    for (const lang of LANGS) {
      const dict = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'),
      );
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== 'string') continue;
        if (FREMDPRODUKT.test(value) || GITHUB.test(value))
          funde.push(`${lang}: ${key} (Fremdprodukt)`);
        if (VERSIONS_HISTORIE.test(value)) funde.push(`${lang}: ${key} (Versions-Historie)`);
      }
    }
    expect(funde, `Stil-Verstoesse im Katalog:\n${funde.join('\n')}`).toEqual([]);
  });
});
