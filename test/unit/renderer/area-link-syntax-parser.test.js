// @vitest-environment jsdom
// 4T-001451 (Epic 3E-000190): die beiden RENDERER-seitigen Parse-Stellen der
// Kuerzel-Syntax `[[@kuerzel:Ziel]]` — Live-Modus und Linter.
//
// Warum eigene Datei: Beide Module setzen den Renderer-Zustand voraus
// (`window.api`), laufen also nur unter jsdom mit dem api-Stub. Die beiden
// Stellen unter src/shared/ — Render-Pfad sowie Index und Rewrite — liegen in
// test/unit/area-link-syntax.test.js. Zusammen decken die zwei Dateien die
// vier Stellen aus Erhebung 1 der Konzept-Stufe 4T-001368 ab.
//
// Geprueft wird die PARITAET: Dasselbe Muster, derselbe Ziel-Teil, dieselbe
// Trennung wie in der gemeinsamen Regel. Nach der Erhebung weichen die vier
// Muster schon heute voneinander ab; eine Abweichung bei der neuen Syntax
// fiele erst im Betrieb auf.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { splitAreaLink } from '../../../src/shared/area-link-syntax.js';

const { LIVE_WIKILINK_RE } = await import('../../../src/renderer/modules/live/live-scans.js');
const { LINT_WIKI_RE } = await import('../../../src/renderer/modules/editor/editor-lint.js');

// Ziel-Teil aus dem Treffer ziehen; die Tabellen-Escape-Behandlung ist an
// allen vier Stellen dieselbe (Backslash vor der Pipe abschneiden).
function zielAusTreffer(m) {
  const inner = m[1] || '';
  const pipeIdx = inner.indexOf('|');
  return (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).replace(/\\$/, '').trim();
}

const FAELLE = [
  { link: '[[@zt:Datei]]', prefix: 'zt', target: 'Datei' },
  { link: '[[@zt:Datei#Kapitel]]', prefix: 'zt', target: 'Datei#Kapitel' },
  { link: '[[@zt:Datei|Anzeige]]', prefix: 'zt', target: 'Datei' },
  { link: '[[@Zentral-2_alt:Ordner/Datei]]', prefix: 'Zentral-2_alt', target: 'Ordner/Datei' },
  { link: '[[Datei]]', prefix: null, target: 'Datei' },
  { link: '[[@Datei]]', prefix: null, target: '@Datei' },
];

describe('Live-Modus: Muster und Trennung (4T-001451)', () => {
  it('erkennt die Verknuepfungs-Form und trennt sie wie die gemeinsame Regel', () => {
    for (const fall of FAELLE) {
      const re = new RegExp(LIVE_WIKILINK_RE.source, 'g');
      const m = re.exec(fall.link);
      expect(m, fall.link).not.toBeNull();
      expect(splitAreaLink(zielAusTreffer(m)), fall.link).toEqual({
        prefix: fall.prefix,
        target: fall.target,
      });
    }
  });
});

describe('Linter: Muster und Trennung (4T-001451)', () => {
  it('erkennt die Verknuepfungs-Form und trennt sie wie die gemeinsame Regel', () => {
    for (const fall of FAELLE) {
      const re = new RegExp(LINT_WIKI_RE.source, 'g');
      const m = re.exec(fall.link);
      expect(m, fall.link).not.toBeNull();
      expect(splitAreaLink(zielAusTreffer(m)), fall.link).toEqual({
        prefix: fall.prefix,
        target: fall.target,
      });
    }
  });

  it('schliesst Einbettungen weiterhin aus (Negative-Lookbehind bleibt)', () => {
    const re = new RegExp(LINT_WIKI_RE.source, 'g');
    expect(re.exec('![[@zt:Bild.png]]')).toBeNull();
  });
});

describe('Alle vier Stellen liefern dieselbe Trennung (AK5)', () => {
  it('derselbe Kuerzel-Link ergibt ueberall dasselbe Paar', () => {
    const link = '[[@zt:Datei#Kapitel|Anzeige]]';
    const ergebnisse = [LIVE_WIKILINK_RE, LINT_WIKI_RE].map((muster) => {
      const m = new RegExp(muster.source, 'g').exec(link);
      return splitAreaLink(zielAusTreffer(m));
    });
    // Beide Renderer-Stellen untereinander gleich ...
    expect(ergebnisse[0]).toEqual(ergebnisse[1]);
    // ... und gleich dem, was die gemeinsame Regel aus dem blossen Ziel macht.
    // Denselben Wert belegen die beiden shared-Stellen in
    // test/unit/area-link-syntax.test.js.
    expect(ergebnisse[0]).toEqual({ prefix: 'zt', target: 'Datei#Kapitel' });
  });
});
