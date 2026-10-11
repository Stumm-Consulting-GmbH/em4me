// @vitest-environment jsdom
// 4T-002160 (Epic 3E-000149): Prüffälle des Präsentations-Ansichts-Modus — die
// eine Verfügbarkeits-Entscheidung samt Rückfall, dazu die Verdrahtung des
// achten Modus über alle Zugänge (Muster kanban-modus.test.js).
//
// Der Erweiterungs-Lebenszyklus ist gemockt: Der echte bräuchte Store und
// Preload-Brücke, und geprüft wird hier die Regel, nicht ihre Speicherung.
// Die Erkennung selbst gehört dem Format-Kern (4T-002159) und läuft hier
// ungemockt: Geprüft wird, dass das Modus-Modul ihn fragt und sein Urteil
// unverändert weitergibt — gegen den echten Kern, damit kein Zwischenstand der
// Absprache die Prüfung trägt.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';

// Voreinstellung «an», damit die Fälle der Dokument-Abhängigkeit diese messen
// und nicht den Schalter.
const istAktiv = vi.fn(() => true);
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));

const {
  PRESENTATION_EXTENSION_ID,
  istPraesentationsErweiterungAn,
  istPraesentationsInhalt,
  istPraesentationsModusVerfuegbar,
  resolvePraesentationsViewMode,
} = await import('../../../src/renderer/modules/presentation/presentation-modus.js');
const { VIEW_MODES, VIEW_MODE_CLASSES } =
  await import('../../../src/renderer/modules/views/view-modes.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

// Eine Präsentation und ein gewöhnliches Dokument, beide mit Kopf und Trennern.
const PRAESENTATION = '---\npresentation: true\n---\n\n# Eins\n\n---\n\n# Zwei\n';
const OHNE = '---\ntags:\n---\n\n# Eins\n\n---\n\n# Zwei\n';

// Gegenständliche Probe einer Verfügbarkeits-Bedingung samt Gegenrichtung.
function pruefeBedingung(kommandoId, sollBedingung, faelle) {
  const cmd = COMMANDS.find((c) => c.id === kommandoId);
  expect(cmd, `Kommando ${kommandoId} nicht in der Registry`).toBeTruthy();
  expect(cmd.availability, `${kommandoId} trägt die erwartete Bedingung`).toBe(sollBedingung);
  for (const [roh, soll] of faelle) {
    const ctx = availabilityContext({ hasTab: true, ...roh });
    expect(isAvailable(cmd.availability, ctx), `${kommandoId} bei ${JSON.stringify(roh)}`).toBe(
      soll,
    );
  }
}

afterEach(() => {
  istAktiv.mockReturnValue(true);
});

describe('Präsentations-Modus: die eine Verfügbarkeits-Entscheidung (4T-002160, AK2/AK3)', () => {
  it('erkennt die Präsentation am Kennzeichen im Kopf und nirgends sonst', () => {
    expect(istPraesentationsInhalt(PRAESENTATION)).toBe(true);
    expect(istPraesentationsInhalt(OHNE)).toBe(false);
    expect(istPraesentationsInhalt(null)).toBe(false);
    expect(istPraesentationsInhalt('Das Kennzeichen heißt `presentation: true`.')).toBe(false);
  });

  it('die Erkennung kommt aus dem Format-Kern und nicht aus einem zweiten Weg', () => {
    const quelle = lies('src/renderer/modules/presentation/presentation-modus.js');
    expect(quelle).toMatch(
      /import \{ istPraesentationsDokument \} from '\.\.\/\.\.\/\.\.\/shared\/presentation\/presentation-core\.js';/,
    );
    // Kein eigener Blick auf den Kopf: keine Frontmatter-Lesung, kein Muster
    // auf das Kennzeichen im Modus-Modul.
    expect(quelle).not.toMatch(/extractFrontmatter|presentation:\s*true/);
  });

  it('der Modus ist für eine Präsentation verfügbar und sonst nicht', () => {
    expect(istPraesentationsModusVerfuegbar({ content: PRAESENTATION })).toBe(true);
    expect(istPraesentationsModusVerfuegbar({ content: OHNE })).toBe(false);
    expect(istPraesentationsModusVerfuegbar(null)).toBe(false);
  });

  it('System-Seiten bleiben außen vor, auch mit passendem Inhalt', () => {
    expect(istPraesentationsModusVerfuegbar({ content: PRAESENTATION, systemPage: true })).toBe(
      false,
    );
  });

  it('AK3: ein gespeicherter Präsentations-Reiter ohne Kennzeichen fällt auf die Lese-Ansicht', () => {
    expect(resolvePraesentationsViewMode('presentation', OHNE)).toBe('rendered');
    expect(resolvePraesentationsViewMode('presentation', PRAESENTATION)).toBe('presentation');
  });

  it('alle anderen Modi bleiben in beiden Fällen unangetastet', () => {
    for (const inhalt of [PRAESENTATION, OHNE]) {
      for (const modus of VIEW_MODES.filter((m) => m !== 'presentation')) {
        expect(resolvePraesentationsViewMode(modus, inhalt)).toBe(modus);
      }
    }
  });

  it('AK2: die Kommando-Bedingung trägt dieselbe Entscheidung', () => {
    pruefeBedingung('view.modePresentation', 'praesentationsAnsicht', [
      [{ praesentationTab: true }, true],
      [{ praesentationTab: false }, false],
      [{ praesentationTab: true, systemTab: true }, false],
      // Eine Tafel ist keine Präsentation: Die beiden Felder ketten die Modi
      // nicht aneinander.
      [{ tafelTab: true }, false],
    ]);
  });

  it('AK2: alle Zugänge fragen diese eine Stelle', () => {
    expect(lies('src/renderer/modules/views/views.js')).toMatch(
      /mode === 'presentation' && !istPraesentationsModusVerfuegbar\(tab\)/,
    );
    expect(lies('src/renderer/modules/tabs/tabs.js')).toContain(
      'praesentationTab: istPraesentationsModusVerfuegbar(tab)',
    );
    expect(lies('src/renderer/modules/command-palette.js')).toContain(
      'praesentationTab: istPraesentationsModusVerfuegbar(tab)',
    );
    expect(lies('src/renderer/modules/app/app-state.js')).toContain(
      'resolvePraesentationsViewMode(',
    );
  });
});

describe('Präsentations-Modus: Verdrahtung über alle Zugänge (4T-002160, AK1/AK4)', () => {
  it('AK1: der Modus ist der achte Eintrag der einen Modus-Liste', () => {
    expect(VIEW_MODES).toHaveLength(8);
    expect(VIEW_MODES[7]).toBe('presentation');
    expect(VIEW_MODE_CLASSES).toContain('view-presentation');
  });

  it('AK4: das Dokument-Gerüst trägt in jeder Spalte einen Container und einen Schalter', () => {
    const html = lies('src/renderer/index.html');
    expect([...html.matchAll(/class="pane pane-presentation"/g)]).toHaveLength(2);
    expect([...html.matchAll(/data-view="presentation"/g)]).toHaveLength(1);
    // Der Schalter steht hinter dem der Tafel.
    expect(html.indexOf('data-view="presentation"')).toBeGreaterThan(
      html.indexOf('data-view="kanban"'),
    );
  });

  it('das Stilblatt schaltet den Container über die Modus-Klasse sichtbar', () => {
    const css = lies('src/renderer/styles/presentation.css');
    expect(css).toMatch(/\.content\.view-presentation \.pane-presentation \{/);
    const html = lies('src/renderer/index.html');
    expect(html).toContain('styles/presentation.css');
    expect(html.indexOf('styles/presentation.css')).toBeGreaterThan(
      html.indexOf('styles/kanban.css'),
    );
  });

  it('AK4: das Kommando steht in der Registry mit Strg+8', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'view\.modePresentation',[\s\S]{0,500}?\},/.exec(quelle);
    expect(block, 'Kommando view.modePresentation fehlt').not.toBeNull();
    expect(block[0]).toContain("'CmdOrCtrl+8'");
    expect(block[0]).toContain("labelKey: 'menu.view.presentation'");
    expect(block[0]).toContain("descKey: 'help.feature.presentation'");
    expect(block[0]).toContain("categoryKey: 'help.group.view'");
    expect(block[0]).toContain('menu: true');
  });

  it('das Kürzel Strg+8 ist genau einmal belegt', () => {
    const belegt = COMMANDS.filter((c) => (c.defaultBindings || []).includes('CmdOrCtrl+8'));
    expect(belegt.map((c) => c.id)).toEqual(['view.modePresentation']);
    expect([...lies('src/shared/commands/commands.js').matchAll(/'CmdOrCtrl\+8'/g)]).toHaveLength(
      1,
    );
  });

  it('AK4: Statusleiste, Überlauf-Menü, Ansichtsmenü und Dispatcher führen ihn', () => {
    expect(lies('src/renderer/modules/statusbar-availability.js')).toContain(
      "presentation: 'view.modePresentation'",
    );
    expect(lies('src/renderer/modules/statusbar-overflow.js')).toContain(
      "['presentation', 'menu.view.presentation']",
    );
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toMatch(/unless\('view\.modePresentation', \{/);
    expect(menu).toContain("click: send('menu:viewChange', 'presentation')");
    // Der Radio-Eintrag steht hinter dem der Tafel.
    expect(menu.indexOf("unless('view.modePresentation'")).toBeGreaterThan(
      menu.indexOf("unless('view.modeKanban'"),
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toMatch(
      /'view\.modePresentation': \(\) => \{\s*setViewMode\('presentation'\);/,
    );
  });

  it('AK4: der Laufzeit-Nachzug beim Tippen hängt am Editor-Beobachter', () => {
    expect(lies('src/renderer/modules/editor/editor.js')).toContain(
      'schedulePresentationRender(pIdx)',
    );
    expect(lies('src/renderer/modules/app-init.js')).toContain('initPresentationPane({');
  });

  it('AK4: der Menü-Zustand reist über beide Prozess-Seiten', () => {
    expect(lies('src/main/menu/menu-state.js')).toContain('praesentationTab: !!b.praesentationTab');
    expect(lies('src/main/menu/menu.js')).toContain(
      'const praesentationTab = !!(state && state.praesentationTab)',
    );
  });

  it('AK8: die Texte des Modus stehen im Katalog aller fünf Sprachen', () => {
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${code}.json`));
      for (const key of [
        'menu.view.presentation',
        'presentation.keinePraesentation',
        'presentation.zaehler',
        'presentation.zurueck',
        'presentation.weiter',
        'presentation.flaeche',
        'help.feature.presentation',
        'help.featureName.presentation',
        'help.featureAccess.presentation',
      ]) {
        expect(katalog[key], `${code}: Schlüssel ${key} fehlt`).toBeTruthy();
      }
      expect(katalog['presentation.zaehler']).toContain('{aktuell}');
      expect(katalog['presentation.zaehler']).toContain('{gesamt}');
    }
  });

  it('AK3: ohne Kennzeichen ist der Schalter deaktiviert und nicht versteckt', () => {
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    expect(tabs).toContain('const praesentationErweiterungAn = istPraesentationsErweiterungAn();');
    expect(tabs).toContain(
      "if (b.dataset.view === 'presentation') b.hidden = !praesentationErweiterungAn;",
    );
    expect(tabs).toContain("t('presentation.keinePraesentation')");
  });
});

describe('Präsentations-Erweiterung: Registry und Aus-Zustand im Renderer (4T-002160, AK5/AK6)', () => {
  it('AK5: der Registry-Eintrag trägt Kategorie, Arbeitsmodus, Katalog-Schlüssel und Kommando', () => {
    const eintrag = extensionById('presentation');
    expect(eintrag).toBeTruthy();
    expect(eintrag.category).toBe('render');
    expect(eintrag.modeLevel).toBe('advanced');
    expect(eintrag.nameKey).toBe('help.featureName.presentation');
    expect(eintrag.descKey).toBe('help.feature.presentation');
    expect(eintrag.commands).toEqual([
      'view.modePresentation',
      'presentation.start',
      'presentation.stop',
      // 4T-002163: der Weg zu einer neuen Präsentation und die beiden Ausgaben.
      'presentation.new',
      'presentation.exportPdf',
      'presentation.exportHtml',
    ]);
    expect(eintrag.dependencies || []).toEqual([]);
    expect(eintrag.settingsSections || []).toEqual([]);
  });

  it('fragt genau die eigene Erweiterungs-Kennung ab', () => {
    istAktiv.mockClear();
    istPraesentationsErweiterungAn();
    expect(istAktiv).toHaveBeenCalledWith('presentation');
    expect(PRESENTATION_EXTENSION_ID).toBe('presentation');
  });

  it('AK6: abgeschaltet ist der Modus auch mit Kennzeichen nicht verfügbar', () => {
    expect(istPraesentationsModusVerfuegbar({ content: PRAESENTATION })).toBe(true);
    istAktiv.mockReturnValue(false);
    expect(istPraesentationsModusVerfuegbar({ content: PRAESENTATION })).toBe(false);
    expect(istPraesentationsErweiterungAn()).toBe(false);
  });

  it('AK6: ein gespeicherter Präsentations-Reiter öffnet abgeschaltet in der Lese-Ansicht', () => {
    expect(resolvePraesentationsViewMode('presentation', PRAESENTATION)).toBe('presentation');
    istAktiv.mockReturnValue(false);
    expect(resolvePraesentationsViewMode('presentation', PRAESENTATION)).toBe('rendered');
  });

  it('alle anderen Modi bleiben auch im Aus-Zustand unangetastet', () => {
    istAktiv.mockReturnValue(false);
    for (const modus of VIEW_MODES.filter((m) => m !== 'presentation')) {
      expect(resolvePraesentationsViewMode(modus, PRAESENTATION)).toBe(modus);
    }
  });

  it('AK6: eine offene Präsentation fällt beim Abschalten auf die Lese-Ansicht', () => {
    const quelle = lies('src/renderer/modules/app/app-extension-runtime.js');
    expect(quelle).toContain('attachExtensionRuntime(PRESENTATION_EXTENSION_ID, {');
    expect(quelle).toMatch(/if \(tab\.viewMode === 'presentation'\) tab\.viewMode = 'rendered';/);
  });
});
