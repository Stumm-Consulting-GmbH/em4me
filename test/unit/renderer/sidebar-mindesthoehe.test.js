// @vitest-environment jsdom
// 4T-0854 (Epic 3E-0164): Drift-Wächter der Sidebar-Mindesthöhe.
//
// Das Rollen einer überlaufenden Seitenleisten-Spalte hängt an zwei Stellen,
// die dieselbe Zahl tragen müssen: der Untergrenze des Zieh-Griffs
// (MIN_PANEL_HEIGHT in sidebar-layout.js) und der Mindesthöhe der
// Panel-Sektion in styles.css. Laufen sie auseinander, entsteht genau der
// Fehler zurück, den der Task behoben hat: Bei einer CSS-Untergrenze von 0
// drückt der Flex-Algorithmus verdrängte Panels auf Höhe 0, und die Spalte
// läuft nicht über, sondern staucht — das Panel bleibt auch im gerollten
// Zustand unsichtbar.
//
// Der Wächter prüft zusätzlich, dass die Spalte senkrecht rollt und
// waagerecht nicht, weil beides zusammen die Anforderung trägt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

const { MIN_PANEL_HEIGHT } = await import('../../../src/renderer/modules/sidebar-layout.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');

// 4T-0992: Das Renderer-Stilblatt liegt in zusammenhängenden Scheiben
// (styles.css plus src/renderer/styles/*.css). Der Wächter liest den ganzen
// Bestand in Kaskaden-Reihenfolge, damit er unabhängig davon bleibt, in welcher
// Scheibe die Sidebar-Regeln gerade stehen. Maßgeblich für die Reihenfolge sind
// die Link-Tags in index.html, weil dort die Kaskade der Anwendung steht.
const html = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
const scheiben = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
  .map((treffer) => treffer[1])
  .filter((pfad) => pfad === 'styles.css' || pfad.startsWith('styles/'));
const css = scheiben
  .map((pfad) => fs.readFileSync(path.join(RENDERER, ...pfad.split('/')), 'utf8'))
  .join('\n');

// Liefert den Regel-Körper des ersten Blocks, dessen Selektor exakt passt.
// Die Sidebar-Regeln sind flach, daher schließt die erste '}' den Block.
function regelKoerper(selektor) {
  const marke = `\n${selektor} {`;
  const start = css.indexOf(marke);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function eigenschaft(koerper, name) {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'm');
  const treffer = re.exec(koerper);
  return treffer ? treffer[1].trim() : null;
}

describe('Sidebar-Mindesthöhe: Kopplung von CSS und Layout-Modul', () => {
  it('die Mindesthöhe der Panel-Sektion entspricht MIN_PANEL_HEIGHT', () => {
    const koerper = regelKoerper('.sidebar-section');
    expect(koerper, 'Regel .sidebar-section nicht gefunden').not.toBeNull();
    const minHeight = eigenschaft(koerper, 'min-height');
    expect(minHeight, 'min-height fehlt an .sidebar-section').not.toBeNull();
    expect(minHeight).toBe(`${MIN_PANEL_HEIGHT}px`);
  });

  it('die Mindesthöhe ist größer als null', () => {
    // Der eigentliche Regressions-Schutz: min-height: 0 war der Zustand vor
    // 4T-0854 und ließ verdrängte Panels auf Höhe 0 zusammenfallen.
    expect(MIN_PANEL_HEIGHT).toBeGreaterThan(0);
  });
});

describe('Sidebar-Spalte: Überlauf-Verhalten', () => {
  it('rollt senkrecht und nicht waagerecht', () => {
    const koerper = regelKoerper('.pane-sidebar');
    expect(koerper, 'Regel .pane-sidebar nicht gefunden').not.toBeNull();
    expect(eigenschaft(koerper, 'overflow-y')).toBe('auto');
    expect(eigenschaft(koerper, 'overflow-x')).toBe('hidden');
    // Ein pauschales overflow würde beide Achsen gleichsetzen und die
    // getrennte Festlegung still überschreiben.
    expect(eigenschaft(koerper, 'overflow')).toBeNull();
  });

  it('der eingeklappte Zustand hebt das Rollen wieder auf', () => {
    // .pane-sidebar.collapsed braucht overflow: visible, damit der
    // Hover-Icon-Button über den schmalen Strich hinausragen kann; die Regel
    // steht später und ist spezifischer, gewinnt also gegen beide Achsen.
    const koerper = regelKoerper('.pane-sidebar.collapsed');
    expect(koerper, 'Regel .pane-sidebar.collapsed nicht gefunden').not.toBeNull();
    expect(eigenschaft(koerper, 'overflow')).toBe('visible');
    expect(css.indexOf('.pane-sidebar.collapsed {')).toBeGreaterThan(
      css.indexOf('\n.pane-sidebar {'),
    );
  });
});
