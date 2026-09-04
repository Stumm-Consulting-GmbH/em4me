// 4T-000221 (Epic 3E-000042): Stil-Waechter der nutzer-sichtbaren Hilfetexte.
//
// Sichert die beiden Befunde der Gesamtabnahme 0.29.0 dauerhaft ab
// (Hotfixes 4T-000219/0.29.1 und 4T-000220/0.29.2): Handbuch-Seiten und
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
import { produktnamenImText, produktnamenInDatei } from './produktnamen-helfer.js';

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

describe('Stil-Waechter Hilfetexte (4T-000221)', () => {
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

  // 4T-001377: Stil-Regel 4 der Entwicklungsrichtlinien (Gattungsname statt
  // Produktname des Datei-Managers) gilt laut Kapitel 13 auch für Handbuch-
  // Seiten und README; geprüft wurden bis dahin allein die Sprachdateien. Am
  // 2026-09-01 standen sechs Verstöße in Handbuch-Seiten, die Suite lief grün.
  describe('Stil-Regel 4: Gattungsname statt Datei-Manager-Produktname (4T-001377)', () => {
    // Bestands-Ausnahmen mit Ratsche (Stand 2026-09-03): 4T-001294 hat die
    // sechs Fundstellen des Anlasses behoben, aber allein in den deutschen
    // Fassungen und je einer weiteren Zeile; in vierzehn fremdsprachigen Seiten
    // steht der Produktname weiter («file explorer», «Explorador»,
    // «Explorateur», «Esplora risorse» und die Windows-10/11-Schreibung
    // «Esplora file», die der Wächter aus 4T-001279 nicht kannte). Die Behebung
    // ist Produkt-Text und läuft als 4T-001397 über die Release-Strecke; bis
    // dahin meldet der Fall genau diese Seiten, und die Liste darf nur
    // schrumpfen — eine Ausnahme ohne Fund ist ein Befund.
    const BESTAND_AUSNAHMEN = new Set([
      'apps-windows.en.md',
      'apps-windows.es.md',
      'apps-windows.fr.md',
      'apps-windows.it.md',
      'extensions-dev.en.md',
      'extensions-dev.es.md',
      'extensions-dev.fr.md',
      'extensions-dev.it.md',
      'subpages.es.md',
      'subpages.fr.md',
      'templates.en.md',
      'templates.es.md',
      'templates.fr.md',
      'templates.it.md',
    ]);

    it('findet die historischen Fundstellen und schont Plattform-Bindung und Code (Gegenprobe)', () => {
      const text = [
        'Der Ordner öffnet sich im Datei-Explorer.',
        'Opens the folder in the file explorer.',
        'Apre la cartella in esplora risorse.',
        'Die farbige Titelleiste setzt Windows 11 voraus.',
        '```',
        'C:\\Programme\\Explorer\\beispiel.txt',
        '```',
        'Dateien im Dateimanager öffnen.',
      ].join('\n');
      expect(produktnamenImText(text, 'probe')).toEqual([
        'probe Zeile 1: "Explorer"',
        'probe Zeile 2: "Explorer"',
        'probe Zeile 3: "Esplora risorse"',
      ]);
    });

    it('Handbuch-Seiten aller fünf Sprachfassungen nennen den Datei-Manager mit dem Gattungsnamen', () => {
      const funde = [];
      const ausnahmeOhneFund = [];
      for (const file of helpFiles()) {
        const f = produktnamenInDatei(path.join(HELP_DIR, file), file);
        if (BESTAND_AUSNAHMEN.has(file)) {
          if (f.length === 0) ausnahmeOhneFund.push(file);
          continue;
        }
        funde.push(...f);
      }
      expect(
        funde,
        `Produktname eines Datei-Managers in Handbuch-Seiten — Gattungsnamen verwenden ` +
          `(Dateimanager, file manager, gestionnaire de fichiers, gestor de archivos, gestore file):\n${funde.join('\n')}`,
      ).toEqual([]);
      expect(
        ausnahmeOhneFund,
        `Bestands-Ausnahme ohne Fund — aus BESTAND_AUSNAHMEN streichen (Ratsche): ${ausnahmeOhneFund.join(', ')}`,
      ).toEqual([]);
    });

    it('das README nennt den Datei-Manager mit dem Gattungsnamen', () => {
      expect(produktnamenInDatei(path.join(ROOT, 'README.md'), 'README.md')).toEqual([]);
    });
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
