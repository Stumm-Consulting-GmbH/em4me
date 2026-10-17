// 4T-002160 (Epic 3E-000149): Aus-Zustand der Erweiterung «Präsentations-Ansicht»
// (presentation). Eigene Datei nach dem Muster extensions-aus-diagramm.test.js:
// extensions-aus.test.js steht am Budget von 800 Code-Zeilen, und die
// Ausnahme-Liste der Datei-Größen darf nicht wachsen. Muster und Hilfsfunktion
// renderOff wie dort; afterEach stellt den Default (alles an) her.
import { describe, it, expect, afterEach } from 'vitest';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';
import { extensionById, internalExtensions } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
  effectiveDisabledSet,
  isExtensionEnabled,
} from '../../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

afterEach(() => {
  configureExtensions([]);
});

function renderOff(id, src) {
  configureExtensions([id]);
  return renderMarkdown(src, 'de');
}

// Registry und Aus-Zustand der Präsentations-Ansicht
// (Story 4S-001056). Wie die Tafel bringt sie **kein** Render-Konstrukt mit —
// eine Präsentation ist gewöhnliches Markdown, `---` bleibt in jeder Stellung
// des Schalters eine thematische Linie —, deshalb steht hier die deklarative
// Seite samt der Render-Probe. Rückfall des gespeicherten Modus und
// Verfügbarkeit liegen im Renderer (renderer/presentation-modus.test.js).
describe('Erweiterung presentation: Registry und Aus-Zustand (4T-002160)', () => {
  it('AK1/AK2: ist als Render-Erweiterung auf «Fortgeschritten» mit den Katalog-Keys registriert', () => {
    const manifest = extensionById('presentation');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('render');
    expect(manifest.modeLevel).toBe('advanced');
    expect(manifest.nameKey).toBe('help.featureName.presentation');
    expect(manifest.descKey).toBe('help.feature.presentation');
    expect(isExtensionEnabled('presentation', [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === 'presentation')).toBe(true);
    expect(disabledFeatureKeySet(['presentation']).has('help.feature.presentation')).toBe(true);
  });

  it('hängt an keiner anderen Erweiterung, und keine hängt an ihr', () => {
    expect(extensionById('presentation').dependencies || []).toEqual([]);
    for (const id of ['comments', 'tasks', 'kanban', 'canvas', 'mindmap']) {
      expect(effectiveDisabledSet([id]).has('presentation'), `mit ${id} aus`).toBe(false);
    }
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('presentation'), `${m.id} hängt an ihr`).toBe(false);
    }
  });

  it('führt das Modus-Kommando, die beiden der Vorführung und die drei des Foliensatzes, registriert', () => {
    // 4T-002162: Start und Ende der Vorführung hängen an derselben Erweiterung.
    const manifest = extensionById('presentation');
    expect(manifest.commands).toEqual([
      'view.modePresentation',
      'presentation.start',
      // 4T-002278: die Vorführung im eigenen Fenster.
      'presentation.startWindow',
      'presentation.presenterView',
      'presentation.stop',
      // 4T-002280: die Folien-Übersicht.
      'presentation.overview',
      // 4T-002163: der Weg zu einer neuen Präsentation und die beiden Ausgaben.
      'presentation.new',
      'presentation.exportPdf',
      'presentation.exportHtml',
      // 4T-002282: der Dialog «Gestaltung dieser Präsentation…».
      'presentation.gestaltung',
    ]);
    for (const id of manifest.commands) {
      expect(
        COMMANDS.some((c) => c.id === id),
        `${id} registriert`,
      ).toBe(true);
    }
  });

  it('AK3/AK4: der Aus-Zustand filtert genau diese Kommandos aus Menü, Palette und Tastenbelegung', () => {
    // Menü (menu-apply.js), Palette, Dispatcher und Tastenbelegung
    // (rebuildHotkeyDispatchMap) lesen dieselbe Menge.
    const aus = disabledCommandIdSet(['presentation']);
    for (const id of extensionById('presentation').commands) {
      expect(aus.has(id), `${id} im Aus-Zustand gefiltert`).toBe(true);
      expect(disabledCommandIdSet([]).has(id), `${id} im An-Zustand da`).toBe(false);
    }
    for (const id of [
      'view.modeRendered',
      'view.modeSplit',
      'view.modeSource',
      'view.modeLive',
      'view.modeMindmap',
      'view.modeCanvas',
      'view.modeKanban',
    ]) {
      expect(aus.has(id), `${id} darf nicht mitgefiltert werden`).toBe(false);
    }
  });

  // 4T-002282 (Epic 3E-000348): seither der Abschnitt «Folien-Themes».
  it('trägt genau den Abschnitt «Folien-Themes» der Einstellungen', () => {
    expect(extensionById('presentation').settingsSections || []).toEqual(['presentationThemes']);
    // AK7 von 4T-002282: Im Aus-Zustand entfällt der Abschnitt, im An-Zustand
    // steht er (Navigation und Seite lesen dieselbe Menge, settings-page.js).
    expect(disabledSettingsSectionIdSet(['presentation']).has('presentationThemes')).toBe(true);
    expect(disabledSettingsSectionIdSet([]).has('presentationThemes')).toBe(false);
  });

  it('AK7 von 4T-002282: der Aus-Zustand nimmt den Gestaltungs-Dialog aus Menü, Palette und Tastenbelegung', () => {
    expect(disabledCommandIdSet(['presentation']).has('presentation.gestaltung')).toBe(true);
    expect(disabledCommandIdSet([]).has('presentation.gestaltung')).toBe(false);
  });

  it('AK5: ein Präsentations-Dokument ist im Aus-Zustand gewöhnliches Markdown, `---` bleibt Linie', () => {
    // Mit Kennzeichen im Kopf: Es hat in keiner Stellung eine Wirkung.
    const src =
      '---\npresentation: true\n---\n\n# Eins\n\nText der ersten Folie\n\n---\n\n# Zwei\n';
    const an = renderMarkdown(src, 'de');
    const aus = renderOff('presentation', src);
    expect(aus).toBe(an);
    expect(aus).toContain('<hr');
    expect(aus).toContain('Text der ersten Folie');
  });
});
