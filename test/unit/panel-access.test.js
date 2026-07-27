// @vitest-environment jsdom
// 4T-0567 (Epic 3E-0104): Paritäts-Wächter über das Panel-Zugangs-Modell
// (src/shared/panel-access.js). Erzwingt für jedes eingebaute Sidebar-Panel
// beide Zugänge — Statusbar-Button (real in index.html vorhanden, real in
// einer registerSidebarPanel-Definition genannt) und Kommando-Zugang
// (Kommando real in der Registry) — sowie die Deckungsgleichheit der
// ID-Menge mit der Renderer-Registry (DEFAULT_PANEL_ORDER) und der
// Erweiterungs-Gates mit den commands-Listen in extensions.js. Fehlt einem
// künftigen Panel einer der Zugänge, schlägt npm test fehl (Muster der
// bestehenden Vollständigkeits-Wächter, z. B. demo-area.test.js).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './renderer/api-stub.js';
import {
  PANEL_ACCESS,
  DEFAULT_PANEL_TOGGLE_ORDER,
  normalizePanelToggleOrder,
  panelAccessById,
} from '../../src/shared/panel-access.js';
import { COMMANDS } from '../../src/shared/commands.js';
import { extensionById } from '../../src/shared/extensions.js';

const { DEFAULT_PANEL_ORDER } = await import('../../src/renderer/modules/sidebar-layout.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'src', 'renderer', 'index.html'),
  'utf8',
);
const DE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
);

describe('Paritäts-Wächter Panel-Zugänge (4T-0567)', () => {
  // 4T-0372 (Epic 3E-0069): 13 -> 14 durch das Uhr-Panel.
  // 4T-0759 (Epic 3E-0142): 14 -> 15 durch das Suchergebnis-Panel.
  it('Modell und Renderer-Registry führen dieselbe 15er-ID-Menge', () => {
    const modelIds = PANEL_ACCESS.map((p) => p.id);
    expect(modelIds.length).toBe(15);
    expect(new Set(modelIds).size).toBe(modelIds.length);
    expect([...modelIds].sort()).toEqual([...DEFAULT_PANEL_ORDER].sort());
  });

  it('jedes Panel führt beide Zugänge: Statusbar-Button und Registry-Kommando', () => {
    const commandIds = new Set(COMMANDS.map((c) => c.id));
    for (const p of PANEL_ACCESS) {
      expect(p.buttonId, `buttonId fehlt oder unplausibel: ${p.id}`).toMatch(/^btn-/);
      expect(
        INDEX_HTML.includes(`id="${p.buttonId}"`),
        `Statusbar-Button ${p.buttonId} (${p.id}) fehlt in index.html`,
      ).toBe(true);
      expect(
        commandIds.has(p.commandId),
        `Kommando ${p.commandId} (${p.id}) fehlt in commands.js`,
      ).toBe(true);
    }
  });

  // 4T-0639 (Epic 3E-0069): Die Icon-Überschriften klonen ihr Symbol aus dem
  // Statusbar-Button. Dieser Wächter sichert die dafür nötige Voraussetzung:
  // JEDER Panel-Button trägt ein Inline-SVG. Fehlt es einem künftigen Panel,
  // fiele dessen Kopf im Icon-Zustand auf den Text zurück — das soll
  // auffallen, statt still zu passieren.
  it('jeder Panel-Button trägt ein Inline-SVG (Quelle der Icon-Überschriften)', () => {
    for (const p of PANEL_ACCESS) {
      const start = INDEX_HTML.indexOf(`id="${p.buttonId}"`);
      expect(start, `Statusbar-Button ${p.buttonId} (${p.id}) fehlt`).toBeGreaterThan(-1);
      const ende = INDEX_HTML.indexOf('</button>', start);
      const markup = INDEX_HTML.slice(start, ende);
      expect(
        /<svg[\s\S]*?<\/svg>/.test(markup),
        `Button ${p.buttonId} (${p.id}) hat kein Inline-SVG`,
      ).toBe(true);
    }
  });

  it('jede Renderer-Registrierung nennt den buttonId des Modells', () => {
    // Quelltext-Scan über die Panel-Module: registerSidebarPanel-Definitionen
    // müssen den buttonId führen (Active-State-Sync und künftige dynamische
    // Anordnung hängen daran).
    const modulesDir = path.resolve(HERE, '..', '..', 'src', 'renderer', 'modules');
    const src = fs
      .readdirSync(modulesDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(modulesDir, f), 'utf8'))
      .join('\n');
    for (const p of PANEL_ACCESS) {
      expect(
        src.includes(`buttonId: '${p.buttonId}'`),
        `keine registerSidebarPanel-Definition nennt buttonId '${p.buttonId}' (${p.id})`,
      ).toBe(true);
    }
  });

  it('titleKeys existieren in de.json (i18n-Wächter sichert die übrigen Sprachen)', () => {
    for (const p of PANEL_ACCESS) {
      expect(typeof DE_JSON[p.titleKey], `titleKey ${p.titleKey} (${p.id})`).toBe('string');
      expect(DE_JSON[p.titleKey].length, `titleKey ${p.titleKey} leer`).toBeGreaterThan(0);
    }
  });

  it('Erweiterungs-Gates decken sich mit den commands-Listen der Erweiterungen', () => {
    for (const p of PANEL_ACCESS) {
      if (p.extensionId === null) continue;
      const ext = extensionById(p.extensionId);
      expect(ext, `Erweiterung ${p.extensionId} (${p.id}) unbekannt`).toBeTruthy();
      expect(
        (ext.commands || []).includes(p.commandId),
        `Kommando ${p.commandId} fehlt in der commands-Liste von ${p.extensionId} — Menü-/Paletten-Gate und Panel-Sichtbarkeit würden divergieren`,
      ).toBe(true);
    }
  });

  it('DEFAULT_PANEL_TOGGLE_ORDER ist eine vollständige Permutation der Modell-IDs', () => {
    expect([...DEFAULT_PANEL_TOGGLE_ORDER].sort()).toEqual(PANEL_ACCESS.map((p) => p.id).sort());
  });

  it('panelAccessById liefert den Eintrag bzw. null', () => {
    expect(panelAccessById('outline') && panelAccessById('outline').buttonId).toBe('btn-outline');
    expect(panelAccessById('gibt-es-nicht')).toBeNull();
  });
});

// 4T-0569 (Epic 3E-0104): Normalisierung des Reihenfolge-Settings — robust
// gegen unbekannte, doppelte und fehlende IDs (Muster normalizeSidebarLayout).
describe('normalizePanelToggleOrder (4T-0569)', () => {
  it('übernimmt eine gültige Permutation unverändert', () => {
    const reversed = [...DEFAULT_PANEL_TOGGLE_ORDER].reverse();
    expect(normalizePanelToggleOrder(reversed)).toEqual(reversed);
  });

  it('verwirft unbekannte IDs und reduziert Duplikate aufs erste Vorkommen', () => {
    const raw = ['outline', 'fremd-panel', 'outline', 42, 'bookmarks'];
    const result = normalizePanelToggleOrder(raw);
    expect(result[0]).toBe('outline');
    expect(result[1]).toBe('bookmarks');
    expect(result).not.toContain('fremd-panel');
    expect(result).toHaveLength(DEFAULT_PANEL_TOGGLE_ORDER.length);
  });

  it('ergänzt fehlende Panels am Ende in Modell-Reihenfolge', () => {
    const result = normalizePanelToggleOrder(['notes']);
    expect(result[0]).toBe('notes');
    expect(result.slice(1)).toEqual(DEFAULT_PANEL_TOGGLE_ORDER.filter((id) => id !== 'notes'));
  });

  it('Nicht-Arrays fallen auf die Modell-Reihenfolge zurück', () => {
    expect(normalizePanelToggleOrder(null)).toEqual(DEFAULT_PANEL_TOGGLE_ORDER);
    expect(normalizePanelToggleOrder('kaputt')).toEqual(DEFAULT_PANEL_TOGGLE_ORDER);
    expect(normalizePanelToggleOrder(undefined)).toEqual(DEFAULT_PANEL_TOGGLE_ORDER);
  });
});
