// @vitest-environment jsdom
// 4T-000567 (Epic 3E-000104): Paritäts-Wächter über das Panel-Zugangs-Modell
// (src/shared/panel-access.js). Erzwingt für jedes eingebaute Sidebar-Panel
// beide Zugänge — Statusbar-Button (real in index.html vorhanden, real in
// einer registerSidebarPanel-Definition genannt) und Kommando-Zugang
// (Kommando real in der Registry) — sowie die Deckungsgleichheit der
// ID-Menge mit der Renderer-Registry (DEFAULT_PANEL_ORDER) und der
// Erweiterungs-Gates mit den commands-Listen in extensions.js. Fehlt einem
// künftigen Panel einer der Zugänge, schlägt npm test fehl (Muster der
// bestehenden Vollständigkeits-Wächter, z. B. demo-area.test.js).
import { describe, expect, it, vi } from 'vitest';
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
import { COMMANDS } from '../../src/shared/commands/commands.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// 4T-001632: Diese Pruefung liest einen Baum des Repositoriums im Rumpf
// ihrer Prueffaelle und faellt damit unter testTimeout. Gemessen am
// 2026-09-09 vom Lese-Ort-Waechter (scripts/lese-ort-regel.js); die Regel
// steht in test/README.md, Abschnitt "Bestands-Lesungen gehoeren in den
// Modulkopf".
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const { DEFAULT_PANEL_ORDER } = await import('../../src/renderer/modules/sidebar-layout.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'src', 'renderer', 'index.html'),
  'utf8',
);
const DE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
);

// 4T-001769 (Abnahme-Befund vom 2026-09-16): der Renderer-Bestand als Text,
// gelesen im Modulkopf (Regel «Bestands-Lesungen gehören in den Modulkopf»,
// test/README.md). Grundlage des Verdrahtungs-Wächters weiter unten.
const RENDERER_MODULE_DIR = path.resolve(HERE, '..', '..', 'src', 'renderer', 'modules');

function sammleJsDateien(dir, out = []) {
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) sammleJsDateien(abs, out);
    else if (eintrag.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

const RENDERER_QUELLEN = sammleJsDateien(RENDERER_MODULE_DIR).map((abs) => ({
  rel: `src/renderer/modules/${path.relative(RENDERER_MODULE_DIR, abs).split(path.sep).join('/')}`,
  text: fs.readFileSync(abs, 'utf8'),
}));

describe('Paritäts-Wächter Panel-Zugänge (4T-000567)', () => {
  // 4T-000372 (Epic 3E-000069): 13 -> 14 durch das Uhr-Panel.
  // 4T-000759 (Epic 3E-000142): 14 -> 15 durch das Suchergebnis-Panel.
  // 4T-000844 (Epic 3E-000147): 15 -> 16 durch das Inhaltsverzeichnis des Buches.
  // 4T-001769 (Epic 3E-000290): 16 -> 17 durch die Karten-Liste der Canvas-Fläche.
  //
  // 4T-001541: Hier endet die Kette. Die Zusage dieses Falls ist die
  // DECKUNGSGLEICHHEIT zweier Verzeichnisse, nicht ihre Größe — und genau die
  // trägt der Mengen-Vergleich darunter. Die Zahl davor war eine eingefrorene
  // Momentaufnahme: Sie wurde bei jedem neuen Panel rot, obwohl beide
  // Verzeichnisse einträchtig gewachsen waren, und musste viermal nachgezogen
  // werden. Was sie zusätzlich hielt — dass kein Panel doppelt steht —, prüft
  // der Vergleich der Mengen-Größe mit der Listen-Länge.
  it('Modell und Renderer-Registry führen dieselbe ID-Menge, jede ID genau einmal', () => {
    const modelIds = PANEL_ACCESS.map((p) => p.id);
    expect(new Set(modelIds).size).toBe(modelIds.length);
    expect(new Set(DEFAULT_PANEL_ORDER).size).toBe(DEFAULT_PANEL_ORDER.length);
    expect([...modelIds].sort()).toEqual([...DEFAULT_PANEL_ORDER].sort());
    // Gegenprobe, dass überhaupt etwas verglichen wird: Zwei leere Listen
    // wären deckungsgleich und der Fall bliebe grün.
    expect(modelIds.length).toBeGreaterThan(10);
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

  // 4T-000639 (Epic 3E-000069): Die Icon-Überschriften klonen ihr Symbol aus dem
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
    // 4T-000980 (Epic 3E-000196): rekursiv statt flach. Die Panel-Module ziehen im
    // Zuge des Datei-Größen-Epics in Feature-Ordner (books/, tabs/, panels/);
    // eine flache Lesung übersähe ihre Registrierung und meldete einen
    // Fehlalarm. Die Prüfung selbst ist unverändert.
    const jsDateien = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return jsDateien(p);
        return e.name.endsWith('.js') ? [p] : [];
      });
    const src = jsDateien(modulesDir)
      .map((p) => fs.readFileSync(p, 'utf8'))
      .join('\n');
    for (const p of PANEL_ACCESS) {
      expect(
        src.includes(`buttonId: '${p.buttonId}'`),
        `keine registerSidebarPanel-Definition nennt buttonId '${p.buttonId}' (${p.id})`,
      ).toBe(true);
    }
  });

  // 4T-001769 (Abnahme-Befund des Product Owners vom 2026-09-16): Der
  // Statusleisten-Knopf der Karten-Liste stand in der Leiste, trug sein Symbol,
  // war im Modell geführt — und tat nichts, weil ihm der Klick-Zuhörer fehlte.
  // Die Prüffälle darüber messen die EXISTENZ beider Zugänge; die Wirkung des
  // einen lag zwischen ihnen und der Bedienung und blieb ungeprüft. Dieser Fall
  // schließt die Lücke gegenständlich: Zu jedem `buttonId` des Modells muss
  // irgendwo im Renderer-Bestand ein Klick-Zuhörer an genau diesem Element
  // hängen. Gemessen wird der Quelltext und nicht die laufende App, weil die
  // Verdrahtung in einer zentralen Datei ausserhalb des Panel-Moduls wohnt
  // (app-bindings.js; die Ausnahme area-panel.js bindet beim Modul-Laden) und
  // ein Bestands-Scan genau diese Streuung erträgt. Den Weg des Anwenders misst
  // zusätzlich PZ-10 in test/e2e/funktionen/panel-zugänge.spec.js.
  it('jeder Panel-Button trägt einen Klick-Zuhörer im Renderer-Bestand', () => {
    for (const p of PANEL_ACCESS) {
      // Das Element wird in eine Variable geholt und der Zuhörer an DIESE
      // Variable gehängt (Muster aller 17 Bindungs-Stellen); die Rückbindung
      // über \1 verhindert, dass ein beliebiger Zuhörer in der Nachbarschaft
      // als Verdrahtung durchgeht.
      const muster = new RegExp(
        `(?:const|let|var)\\s+([A-Za-z0-9_$]+)\\s*=\\s*(?:document\\.getElementById|\\$)\\(\\s*['"]#?${p.buttonId}['"]\\s*\\)[\\s\\S]{0,300}?\\b\\1\\.addEventListener\\(\\s*['"]click['"]`,
      );
      expect(
        RENDERER_QUELLEN.some((datei) => muster.test(datei.text)),
        `Statusleisten-Knopf ${p.buttonId} (${p.id}) hat keinen Klick-Zuhörer im Renderer-Bestand — der Knopf wäre sichtbar und wirkungslos`,
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

// 4T-000569 (Epic 3E-000104): Normalisierung des Reihenfolge-Settings — robust
// gegen unbekannte, doppelte und fehlende IDs (Muster normalizeSidebarLayout).
describe('normalizePanelToggleOrder (4T-000569)', () => {
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
