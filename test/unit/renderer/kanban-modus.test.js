// @vitest-environment jsdom
// 4T-001847 (Epic 3E-000110): Prüffälle des Tafel-Ansichts-Modus — die eine
// Verfügbarkeits-Entscheidung samt Rückfall, dazu die Verdrahtung des siebten
// Modus über alle Zugänge.
//
// **Warum jeder Zugang einzeln benannt ist.** Der Mindmap-Modus kam in
// 4T-001047 in Menü und Palette an, nicht aber in die Statusleiste; der Befund
// fiel erst beim Struktur-Prüfschritt auf. Die Canvas hat die Prüfung deshalb
// in 4T-001653 Zugang für Zugang ausgeschrieben, und dieser Prüffall folgt ihr.
//
// Der Erweiterungs-Lebenszyklus ist gemockt (Muster canvas-pane.test.js): Der
// echte bräuchte Store und Preload-Brücke, und geprüft wird hier die Regel,
// nicht ihre Speicherung.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

// Voreinstellung «an», damit die Fälle der Dokument-Abhängigkeit diese messen
// und nicht den Schalter.
const istAktiv = vi.fn(() => true);
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));

const {
  KANBAN_EXTENSION_ID,
  istKanbanErweiterungAn,
  istTafelInhalt,
  istTafelModusVerfuegbar,
  resolveTafelViewMode,
} = await import('../../../src/renderer/modules/kanban/kanban-modus.js');
const { initKanbanPane, renderKanban, scheduleKanbanRender } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
const { VIEW_MODES, VIEW_MODE_CLASSES } =
  await import('../../../src/renderer/modules/views/view-modes.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

// Eine Tafel und ein gewöhnliches Dokument. Der Kopf-Schlüssel des Vorbilds
// ist das ganze Kennzeichen; sein Wert ist gleichgültig (F1 des Format-Kerns).
const TAFEL = '---\nkanban-plugin: board\n---\n\n## Offen\n\n- [ ] Erste Karte\n';
const OHNE = '---\ntags:\n---\n\n## Offen\n\n- [ ] Erste Karte\n';

// Gegenständliche Probe einer Verfügbarkeits-Bedingung samt Gegenrichtung
// (Muster `pruefeBedingung` in canvas-pane.test.js): Ein Quelltext-Muster
// allein sagt nichts darüber, was die Bedingung entscheidet.
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

describe('Tafel-Modus: die eine Verfügbarkeits-Entscheidung (4T-001847, AK2)', () => {
  it('erkennt die Tafel am Kopf-Schlüssel und nirgends sonst', () => {
    expect(istTafelInhalt(TAFEL)).toBe(true);
    expect(istTafelInhalt(OHNE)).toBe(false);
    expect(istTafelInhalt(null)).toBe(false);
    // Die bloße Erwähnung im Fließtext ist keine Tafel — der Vorfilter des
    // Kerns darf nicht zum Fehlurteil führen.
    expect(istTafelInhalt('Der Schlüssel heißt `kanban-plugin`.')).toBe(false);
  });

  it('der Modus ist für ein Tafel-Dokument verfügbar und sonst nicht', () => {
    expect(istTafelModusVerfuegbar({ content: TAFEL })).toBe(true);
    expect(istTafelModusVerfuegbar({ content: OHNE })).toBe(false);
    expect(istTafelModusVerfuegbar(null)).toBe(false);
  });

  it('System-Seiten bleiben außen vor, auch mit passendem Inhalt', () => {
    expect(istTafelModusVerfuegbar({ content: TAFEL, systemPage: true })).toBe(false);
  });

  it('AK4: ein gespeicherter Tafel-Reiter ohne Tafel fällt auf die Lese-Ansicht', () => {
    // Der Fall entsteht real: Dokument in der Tafel-Ansicht gespeichert, der
    // Kopf-Schlüssel später außerhalb der Anwendung entfernt.
    expect(resolveTafelViewMode('kanban', OHNE)).toBe('rendered');
    expect(resolveTafelViewMode('kanban', TAFEL)).toBe('kanban');
  });

  it('alle anderen Modi bleiben in beiden Fällen unangetastet', () => {
    for (const inhalt of [TAFEL, OHNE]) {
      for (const modus of ['source', 'split', 'rendered', 'live', 'mindmap', 'canvas']) {
        expect(resolveTafelViewMode(modus, inhalt)).toBe(modus);
      }
    }
  });

  it('AK2: die Kommando-Bedingung trägt dieselbe Entscheidung', () => {
    pruefeBedingung('view.modeKanban', 'tafelAnsicht', [
      [{ tafelTab: true }, true],
      [{ tafelTab: false }, false],
      [{ tafelTab: true, systemTab: true }, false],
    ]);
  });

  it('AK2: alle Zugänge fragen diese eine Stelle', () => {
    // Keine Stelle trägt eine eigene Bedingung; bräche das auf, entstünde die
    // Lage «Schalter sagt ja, Menü sagt nein».
    expect(lies('src/renderer/modules/views/views.js')).toMatch(
      /mode === 'kanban' && !istTafelModusVerfuegbar\(tab\)/,
    );
    expect(lies('src/renderer/modules/tabs/tabs.js')).toContain(
      'tafelTab: istTafelModusVerfuegbar(tab)',
    );
    expect(lies('src/renderer/modules/command-palette.js')).toContain(
      'tafelTab: istTafelModusVerfuegbar(tab)',
    );
    expect(lies('src/renderer/modules/app/app-state.js')).toContain('resolveTafelViewMode(');
  });
});

describe('Tafel-Modus: Verdrahtung über alle Zugänge (4T-001847, AK1/AK5)', () => {
  it('AK1: der Modus ist in der einen Modus-Liste geführt', () => {
    expect(VIEW_MODES).toContain('kanban');
    expect(VIEW_MODE_CLASSES).toContain('view-kanban');
  });

  it('AK5: das Dokument-Gerüst trägt in jeder Spalte einen Container und einen Schalter', () => {
    const html = lies('src/renderer/index.html');
    expect([...html.matchAll(/class="pane pane-kanban"/g)]).toHaveLength(2);
    expect(html).toContain('data-view="kanban"');
  });

  it('das Stilblatt schaltet den Container über die Modus-Klasse sichtbar', () => {
    const css = lies('src/renderer/styles/kanban.css');
    expect(css).toMatch(/\.content\.view-kanban \.pane-kanban \{/);
    expect(lies('src/renderer/index.html')).toContain('styles/kanban.css');
  });

  it('AK5: das Kommando steht in der Registry mit dem nächsten Kürzel der Reihe', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'view\.modeKanban',[\s\S]{0,400}?\},/.exec(quelle);
    expect(block, 'Kommando view.modeKanban fehlt').not.toBeNull();
    expect(block[0]).toContain("'CmdOrCtrl+7'");
    expect(block[0]).toContain("labelKey: 'menu.view.kanban'");
  });

  it('das Kürzel ist nicht doppelt belegt', () => {
    const quelle = lies('src/shared/commands/commands.js');
    expect([...quelle.matchAll(/'CmdOrCtrl\+7'/g)]).toHaveLength(1);
  });

  it('AK5: Statusleiste, Überlauf-Menü, Ansichtsmenü und Dispatcher führen ihn', () => {
    expect(lies('src/renderer/modules/statusbar-availability.js')).toContain(
      "kanban: 'view.modeKanban'",
    );
    expect(lies('src/renderer/modules/statusbar-overflow.js')).toContain(
      "['kanban', 'menu.view.kanban']",
    );
    expect(lies('src/main/menu/menu.js')).toMatch(/unless\('view\.modeKanban', \{/);
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain("'view.modeKanban'");
  });

  it('AK5: der Laufzeit-Nachzug beim Tippen hängt am Editor-Beobachter', () => {
    // Aus einem Dokument wird während des Schreibens eine Tafel und umgekehrt;
    // ohne diesen Aufruf blieben Schaltfläche und Menü-Eintrag stehen.
    expect(lies('src/renderer/modules/editor/editor.js')).toContain('scheduleKanbanRender(pIdx)');
    expect(lies('src/renderer/modules/app-init.js')).toContain('initKanbanPane({');
  });

  it('AK5: der Menü-Zustand reist über beide Prozess-Seiten', () => {
    expect(lies('src/main/menu/menu-state.js')).toContain('tafelTab: !!b.tafelTab');
    expect(lies('src/main/menu/menu.js')).toContain('const tafelTab = !!(state && state.tafelTab)');
  });

  it('die Texte des Modus stehen im Katalog', () => {
    const de = JSON.parse(lies('src/i18n/de.json'));
    for (const key of [
      'menu.view.kanban',
      'kanban.keineTafel',
      'help.feature.kanban',
      'help.featureName.kanban',
      'help.featureAccess.kanban',
    ]) {
      expect(de[key], `Schlüssel ${key} fehlt`).toBeTruthy();
    }
  });

  it('AK3: ohne Tafel ist der Schalter deaktiviert und nicht versteckt', () => {
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    // Das Urteil formuliert die Leiste nicht selbst: Sie reicht den Schalter
    // samt seinem Kommando an die gemeinsame Funktion. Ausgeblendet wird allein
    // nach dem Erweiterungs-Schalter.
    expect(tabs).toContain('const kanbanErweiterungAn = istKanbanErweiterungAn();');
    expect(tabs).toContain("if (b.dataset.view === 'kanban') b.hidden = !kanbanErweiterungAn;");
    expect(tabs).toContain("t('kanban.keineTafel')");
  });
});

describe('Tafel-Andockstelle: der Platz für die Zeichnung (4T-001847)', () => {
  // Die Zeichnung selbst liefert 4T-001848. Geprüft ist hier, dass der Platz
  // verdrahtet ist und nur im eigenen Modus greift — sonst zeichnete der
  // Folge-Vorgang in eine Spalte, die gerade etwas anderes zeigt.
  it('liefert den Container nur im Tafel-Modus', () => {
    const el = document.createElement('section');
    const dokumente = [{ content: TAFEL, viewMode: 'kanban' }];
    initKanbanPane({
      getPaneEls: () => ({ kanbanEl: el }),
      aktivesDokument: () => dokumente[0],
    });
    expect(renderKanban(0)).toBe(el);
    dokumente[0].viewMode = 'rendered';
    expect(renderKanban(0)).toBeNull();
  });

  it('meldet den Wechsel der Verfügbarkeit genau einmal je Wechsel', async () => {
    vi.useFakeTimers();
    const meldungen = [];
    const dokumente = [{ content: OHNE, viewMode: 'rendered' }];
    initKanbanPane({
      getPaneEls: () => ({ kanbanEl: null }),
      aktivesDokument: () => dokumente[0],
      beiVerfuegbarkeitsWechsel: (paneIdx, jetzt) => meldungen.push([paneIdx, jetzt]),
    });
    // Erster Takt: kein Wechsel, weil der Ausgangs-Stand «nicht verfügbar» ist
    // und die Merke-Zelle leer beginnt — gemeldet wird der erste ermittelte
    // Stand, danach nur noch Änderungen.
    scheduleKanbanRender(0);
    vi.runAllTimers();
    expect(meldungen).toEqual([[0, false]]);
    // Der Anwender tippt den Kopf-Schlüssel: ein Wechsel, eine Meldung.
    dokumente[0].content = TAFEL;
    scheduleKanbanRender(0);
    vi.runAllTimers();
    expect(meldungen).toEqual([
      [0, false],
      [0, true],
    ]);
    // Weiteres Tippen ohne Wechsel meldet nichts mehr.
    scheduleKanbanRender(0);
    vi.runAllTimers();
    expect(meldungen).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe('Kanban-Erweiterung: Aus-Zustand im Renderer (4T-001847, AK7/AK8)', () => {
  it('fragt genau die eigene Erweiterungs-Kennung ab', () => {
    istAktiv.mockClear();
    istKanbanErweiterungAn();
    expect(istAktiv).toHaveBeenCalledWith('kanban');
    expect(KANBAN_EXTENSION_ID).toBe('kanban');
  });

  it('AK7: abgeschaltet ist der Modus auch mit Tafel nicht verfügbar', () => {
    // Nicht-Vakuitäts-Probe: eingeschaltet ist dasselbe Dokument verfügbar.
    expect(istTafelModusVerfuegbar({ content: TAFEL })).toBe(true);
    istAktiv.mockReturnValue(false);
    expect(istTafelModusVerfuegbar({ content: TAFEL })).toBe(false);
    expect(istKanbanErweiterungAn()).toBe(false);
  });

  it('AK7: ein gespeicherter Tafel-Reiter öffnet abgeschaltet in der Lese-Ansicht', () => {
    expect(resolveTafelViewMode('kanban', TAFEL)).toBe('kanban');
    istAktiv.mockReturnValue(false);
    expect(resolveTafelViewMode('kanban', TAFEL)).toBe('rendered');
  });

  it('alle anderen Modi bleiben auch im Aus-Zustand unangetastet', () => {
    istAktiv.mockReturnValue(false);
    for (const modus of ['source', 'split', 'rendered', 'live', 'mindmap', 'canvas']) {
      expect(resolveTafelViewMode(modus, TAFEL)).toBe(modus);
    }
  });

  it('AK7: eine offene Tafel fällt beim Abschalten auf die Lese-Ansicht', () => {
    // Der Rückfall in kanban-modus.js greift beim Öffnen; das Umschalten bei
    // offener Tafel braucht den Laufzeit-Hook, sonst bliebe das geöffnete
    // Dokument in einer Ansicht ohne Schalter und ohne Menü-Eintrag stehen.
    const quelle = lies('src/renderer/modules/app/app-extension-runtime.js');
    expect(quelle).toContain('attachExtensionRuntime(KANBAN_EXTENSION_ID, {');
    expect(quelle).toMatch(/if \(tab\.viewMode === 'kanban'\) tab\.viewMode = 'rendered';/);
  });
});
