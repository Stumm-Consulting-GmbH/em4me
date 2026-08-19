// 4T-0645 (Epic 3E-0127): Unit-Tests der Zustands-Vorlage der Beispiel-Sammlung
// (src/main/area/demo-workspace.js). Geprüft werden die Auflösung der relativen
// Pfade gegen den Zielordner, die Gruppen- und tabSettings-Behandlung, die
// Abwehr defekter Vorlagen und ein Wächter über die mitgelieferte Vorlage
// selbst (jeder genannte Pfad muss in src/demo existieren).
// Stil-Muster des benachbarten Demo-Tests (test/unit/demo-area.test.js).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_WORKSPACE_TEMPLATE,
  buildDemoWorkspaces,
  loadDemoWorkspaces,
} from '../../src/main/area/demo-workspace.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');
const TARGET = path.join('C:', 'Ziel');

const VORLAGE = {
  workspaces: [
    {
      name: 'Astronomy',
      color: 'blue',
      windows: [
        {
          panes: [
            {
              paths: ['Milky Way.md', 'Milky Way∕Sun.md'],
              activeIndex: 1,
              groups: [{ name: 'Hierarchy', color: 'blue', collapsed: false }],
              tabSettings: [{ group: 0 }, { group: 0 }],
            },
          ],
        },
      ],
    },
  ],
};

describe('buildDemoWorkspaces', () => {
  it('löst relative Pfade gegen den Zielordner auf', () => {
    const [ws] = buildDemoWorkspaces(VORLAGE, TARGET);
    expect(ws.app.area.rootPath).toBe(TARGET);
    expect(ws.app.windows[0].panes[0].paths).toEqual([
      path.join(TARGET, 'Milky Way.md'),
      path.join(TARGET, 'Milky Way∕Sun.md'),
    ]);
  });

  it('übernimmt Gruppen und die Gruppen-Zuordnung der Reiter', () => {
    const [ws] = buildDemoWorkspaces(VORLAGE, TARGET);
    const pane = ws.app.windows[0].panes[0];
    expect(pane.groups).toEqual([{ name: 'Hierarchy', color: 'blue', collapsed: false }]);
    expect(pane.tabSettings).toEqual([{ group: 0 }, { group: 0 }]);
  });

  it('vergibt Kennungen über den injizierten Erzeuger und legt nicht offen an', () => {
    const [ws] = buildDemoWorkspaces(VORLAGE, TARGET, (i) => `fest-${i}`);
    expect(ws.id).toBe('fest-0');
    expect(ws.open).toBe(false);
    expect(ws.lastOpenedAt).toBeNull();
  });

  it('fängt eine Farbe außerhalb der Palette an der Quelle ab', () => {
    const kaputt = {
      workspaces: [
        {
          name: 'X',
          color: 'magenta',
          windows: [{ panes: [{ paths: ['a.md'], groups: [{ name: 'G', color: 'magenta' }] }] }],
        },
      ],
    };
    const [ws] = buildDemoWorkspaces(kaputt, TARGET);
    expect(ws.color).toBe('blue');
    expect(ws.app.windows[0].panes[0].groups[0].color).toBe('blue');
  });

  it('verwirft eine Gruppen-Zuordnung, die auf keine vorhandene Gruppe zeigt', () => {
    const kaputt = {
      workspaces: [
        {
          name: 'X',
          windows: [{ panes: [{ paths: ['a.md'], groups: [], tabSettings: [{ group: 7 }] }] }],
        },
      ],
    };
    const [ws] = buildDemoWorkspaces(kaputt, TARGET);
    expect(ws.app.windows[0].panes[0].tabSettings).toEqual([{}]);
  });

  it('kappt einen activeIndex jenseits der Reiter-Zahl', () => {
    const kaputt = {
      workspaces: [
        { name: 'X', windows: [{ panes: [{ paths: ['a.md', 'b.md'], activeIndex: 9 }] }] },
      ],
    };
    const [ws] = buildDemoWorkspaces(kaputt, TARGET);
    expect(ws.app.windows[0].panes[0].activeIndex).toBe(1);
  });

  it('verwirft Einträge ohne Namen und Fenster ohne jeden Reiter', () => {
    const kaputt = {
      workspaces: [
        { name: '   ', windows: [{ panes: [{ paths: ['a.md'] }] }] },
        { name: 'Leer', windows: [{ panes: [{ paths: [] }] }] },
      ],
    };
    expect(buildDemoWorkspaces(kaputt, TARGET)).toEqual([]);
  });

  it('liefert bei unbrauchbarer Eingabe eine leere Liste statt zu werfen', () => {
    expect(buildDemoWorkspaces(null, TARGET)).toEqual([]);
    expect(buildDemoWorkspaces(VORLAGE, '')).toEqual([]);
    expect(buildDemoWorkspaces({}, TARGET)).toEqual([]);
  });
});

describe('loadDemoWorkspaces', () => {
  it('liefert bei fehlender Vorlage eine leere Liste statt zu werfen', async () => {
    const weg = path.join(HERE, 'gibt-es-nicht-demo-workspace.json');
    await expect(loadDemoWorkspaces(TARGET, undefined, weg)).resolves.toEqual([]);
  });

  it('liest die mitgelieferte Vorlage und baut daraus Arbeitsbereiche', async () => {
    const list = await loadDemoWorkspaces(TARGET);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((ws) => ws.app.windows.length >= 2)).toBe(true);
    expect(
      list.some((ws) => ws.app.windows.some((w) => w.panes.some((p) => p.groups.length > 0))),
    ).toBe(true);
  });
});

// Wächter über die mitgelieferte Vorlage: Jeder dort genannte Pfad muss im
// Bestand von src/demo existieren. Ohne ihn zeigt ein Tipp- oder Umbenenn-
// Fehler erst beim Anwender als fehlender Reiter.
describe('Vorlage gegen den Bestand von src/demo', () => {
  it('nennt ausschließlich vorhandene Dateien', () => {
    const vorlage = JSON.parse(fs.readFileSync(DEMO_WORKSPACE_TEMPLATE, 'utf8'));
    const fehlend = [];
    for (const ws of vorlage.workspaces) {
      for (const win of ws.windows) {
        for (const pane of win.panes) {
          for (const rel of pane.paths) {
            if (!fs.existsSync(path.join(DEMO_DIR, rel))) fehlend.push(rel);
          }
        }
      }
    }
    expect(fehlend).toEqual([]);
  });

  it('erfüllt die Akzeptanzkriterien der Story an der Vorlage selbst', () => {
    const vorlage = JSON.parse(fs.readFileSync(DEMO_WORKSPACE_TEMPLATE, 'utf8'));
    // AK1: mindestens zwei Applikationen.
    expect(vorlage.workspaces.length).toBeGreaterThanOrEqual(2);
    // AK2: mindestens eine Applikation mit mehreren Fenstern.
    expect(vorlage.workspaces.some((ws) => ws.windows.length >= 2)).toBe(true);
    // AK3: mindestens ein Fenster mit gruppierten Reitern.
    expect(
      vorlage.workspaces.some((ws) =>
        ws.windows.some((w) => w.panes.some((p) => (p.groups || []).length > 0)),
      ),
    ).toBe(true);
  });
});
