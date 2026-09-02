// 4T-000649 (Epic 3E-000126): Waechter der Bildmarke.
//
// Die Marke liegt in zwei Fassungen vor: em4me-logo.svg (vollstaendig, fuer
// Ueber-Dialog, Handbuch und die grossen Icon-Stufen) und em4me-mark.svg
// (Kompaktmarke fuer 16/24/32 px). Drei Dinge koennen dabei still brechen:
//   1. Eine Quelldatei wird umbenannt oder geloescht — build:icon schlaegt
//      dann zwar fehl, aber erst beim naechsten manuellen Lauf.
//   2. Das Handbuch-Bild zeigt ins Leere. Der Markdown-Linter meldet fehlende
//      BILD-Ziele nicht (nur fehlende Alt-Texte und tote Wiki-Links), der
//      Fehler faellt also erst im gerenderten Handbuch auf.
//   3. Das volle Logo wird versehentlich aus dem Paket ausgeschlossen. Dann
//      fehlt es NUR in der gebauten EXE, nicht im Entwicklungs-Modus — der
//      teuerste Fehler-Modus, weil er die Suite passiert.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ASSETS = path.join(ROOT, 'src', 'assets');
const HELP_DIR = path.join(ROOT, 'src', 'i18n', 'help');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('Bildmarke (4T-000649)', () => {
  it('beide Quell-SVG existieren', () => {
    for (const datei of ['em4me-logo.svg', 'em4me-mark.svg']) {
      expect(fs.existsSync(path.join(ASSETS, datei)), `${datei} fehlt`).toBe(true);
    }
  });

  it('die Kompaktmarke fuehrt vier Punkte und genau eine Ziffer', () => {
    const svg = fs.readFileSync(path.join(ASSETS, 'em4me-mark.svg'), 'utf8');
    const punkte = svg.match(/<circle\b/g) || [];
    expect(punkte.length, 'vier Punkte fuer E, M, m und e erwartet').toBe(4);
    // Zwei Plaettchen-Pfade (Rahmen und Flaeche) plus der Ziffern-Pfad.
    const pfade = svg.match(/<path\b/g) || [];
    expect(pfade.length, 'nur die Ziffer neben dem Plaettchen erwartet').toBe(3);
  });

  it('das Handbuch-Bild zeigt in allen fuenf Fassungen auf eine vorhandene Datei', () => {
    const kaputt = [];
    for (const lang of LANGS) {
      const seite = path.join(HELP_DIR, `overview.${lang}.md`);
      const inhalt = fs.readFileSync(seite, 'utf8');
      const treffer = [...inhalt.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)];
      expect(treffer.length, `overview.${lang}.md fuehrt kein Bild`).toBeGreaterThan(0);
      for (const [, ziel] of treffer) {
        // Bild-Ziele der Handbuch-Seiten loesen gegen src/renderer/ auf, weil
        // Handbuch-Tabs pfadlos sind und die Seite im Renderer-Dokument haengt.
        const aufgeloest = path.resolve(ROOT, 'src', 'renderer', ziel);
        if (!fs.existsSync(aufgeloest)) kaputt.push(`overview.${lang}.md -> ${ziel}`);
      }
    }
    expect(kaputt, `Bild-Ziele ohne Datei: ${kaputt.join(', ')}`).toEqual([]);
  });

  it('das Handbuch-Bild traegt einen Alt-Text (Linter-Regel missingAltText)', () => {
    for (const lang of LANGS) {
      const inhalt = fs.readFileSync(path.join(HELP_DIR, `overview.${lang}.md`), 'utf8');
      const ohneAlt = [...inhalt.matchAll(/!\[\s*\]\(/g)];
      expect(ohneAlt.length, `overview.${lang}.md hat ein Bild ohne Alt-Text`).toBe(0);
    }
  });

  // 4T-000643: Der Marken-Claim begleitet den Namen an drei Orten (leerer
  // Zustand, Ueber-Dialog, Handbuch-Ueberblick). Ein vergessener Ort faellt im
  // Betrieb kaum auf, weil jede Stelle fuer sich stimmig aussieht.
  it('der Marken-Claim steht an allen drei Orten', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
    const vorkommen = (html.match(/data-i18n="app\.claim"/g) || []).length;
    expect(vorkommen, 'erwartet im leeren Zustand und im Ueber-Dialog').toBe(2);

    const fehlend = LANGS.filter(
      (lang) =>
        !fs
          .readFileSync(path.join(HELP_DIR, `overview.${lang}.md`), 'utf8')
          .includes('extended memory for me'),
    );
    expect(fehlend, `Handbuch ohne Claim: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('der Claim lautet in allen fünf Sprachen gleich (Bestandteil der Marke)', () => {
    const werte = LANGS.map(
      (lang) =>
        JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'))[
          'app.claim'
        ],
    );
    expect(new Set(werte).size, `abweichende Fassungen: ${JSON.stringify(werte)}`).toBe(1);
    expect(werte[0]).toBe('extended memory for me');
  });

  it('das volle Logo bleibt im Paket, die reine Icon-Quelle nicht', () => {
    const ausschluesse = pkg.build.files.filter((eintrag) => eintrag.startsWith('!'));
    expect(
      ausschluesse,
      'em4me-logo.svg wird vom Handbuch geladen und darf nicht ausgeschlossen werden',
    ).not.toContain('!src/assets/em4me-logo.svg');
    expect(
      ausschluesse,
      'em4me-mark.svg ist reine Quelle fuer build:icon und gehoert nicht ins Paket',
    ).toContain('!src/assets/em4me-mark.svg');
  });
});
