// 4T-002254 (Epic 3E-000262): Aus-Zustand der Erweiterung «Kanban-Tafel»
// (kanban), byte-gleich aus extensions-aus.test.js ausgelagert. Grund: Mit den
// vier Katalog-Zeilen der Listen-Maske in der Pin-Liste der Erweiterung
// «Datenbank» stand jene Datei bei 801 von 800 Code-Zeilen; der Schnitt nach
// dem Muster von extensions-aus-praesentation.test.js hält das Budget, statt
// die Ausnahme-Liste der Datei-Größen wachsen zu lassen. Hilfsfunktion
// renderOff wie dort; afterEach stellt den Default (alles an) her.
import { describe, it, expect, afterEach } from 'vitest';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';
import { extensionById, internalExtensions } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
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

// 4T-001847 (Epic 3E-000110): Registry und Aus-Zustand der Kanban-Tafel
// (Story 4S-000978). Anders als die Canvas bringt sie **kein** Render-Konstrukt
// mit — eine Tafel ist gewöhnliches Markdown —, deshalb steht hier allein die
// deklarative Seite. Der Rückfall des gespeicherten Ansichts-Modus und die
// Verfügbarkeit des Modus liegen im Renderer und werden in
// renderer/kanban-modus.test.js geprüft.
describe('Erweiterung kanban: Registry und Aus-Zustand (4T-001847)', () => {
  it('AK1: ist als Render-Erweiterung mit den Katalog-Keys registriert', () => {
    const manifest = extensionById('kanban');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('render');
    // Die Katalog-Schlüssel der Tafel, keine duplizierten Übersetzungen.
    expect(manifest.nameKey).toBe('help.featureName.kanban');
    expect(manifest.descKey).toBe('help.feature.kanban');
    // Ab Werk eingeschaltet: der Default der Disabled-Liste ist leer.
    expect(isExtensionEnabled('kanban', [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === 'kanban')).toBe(true);
    // Der descKey IST die Katalog-Zeile; im Aus-Zustand wird genau sie
    // gekennzeichnet.
    expect(disabledFeatureKeySet(['kanban']).has('help.feature.kanban')).toBe(true);
  });

  it('AK6: erklärt ihre Abhängigkeit zur Erweiterung «Aufgaben»', () => {
    // Die Sache selbst: Eine Karte IST eine Aufgaben-Zeile.
    expect(extensionById('kanban').dependencies).toEqual(['tasks']);
    expect(effectiveDisabledSet(['tasks']).has('kanban')).toBe(true);
    expect(isExtensionEnabled('kanban', ['tasks'])).toBe(false);
    // Umgekehrt nicht: die Tafel abzuschalten lässt die Aufgaben stehen.
    expect(isExtensionEnabled('tasks', ['kanban'])).toBe(true);
    // Und keine dritte Erweiterung hängt ihrerseits an der Tafel.
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('kanban'), `${m.id} hängt an kanban`).toBe(false);
    }
  });

  it('führt Modus-Kommando, Karten- und Spalten-Anlage, alle registriert', () => {
    // 4T-001849 (Epic 3E-000110): Die Karten-Anlage kam hinzu. 4T-001851: die
    // Spalten-Anlage. 4T-001852: die beiden Wege zu einer Tafel. Alle hängen an
    // derselben Erweiterung, weil sie ohne die Tafel keinen Gegenstand haben.
    const manifest = extensionById('kanban');
    expect(manifest.commands).toEqual([
      'view.modeKanban',
      'kanban.addCard',
      // 4T-001906: das Archivieren der gewählten Karte.
      'kanban.archiveCard',
      // 4T-001956: «Notiz aus Karte erzeugen…».
      'kanban.noteFromCard',
      'kanban.addColumn',
      'kanban.newBoard',
      'kanban.convertToBoard',
      // 4T-001904: der Schalter «Tags am Kartenfuß».
      'kanban.toggleTagsFooter',
      // 4T-001903: der Schalter «Termine relativ anzeigen».
      'kanban.toggleRelativeDates',
      // 4T-001955: der Dialog «Einstellungen dieser Tafel…».
      'kanban.boardSettings',
    ]);
    const registrierte = new Set(COMMANDS.map((c) => c.id));
    for (const id of manifest.commands) {
      expect(registrierte.has(id), `${id} fehlt in der Kommando-Registry`).toBe(true);
    }
  });

  it('AK7: der Aus-Zustand filtert genau dieses Kommando, der An-Zustand keines', () => {
    const aus = disabledCommandIdSet(['kanban']);
    expect(aus.has('view.modeKanban')).toBe(true);
    expect(aus.has('kanban.addCard')).toBe(true);
    // 4T-001906: mit ihr das Archivieren der gewählten Karte.
    expect(aus.has('kanban.archiveCard')).toBe(true);
    // 4T-001956: ebenso «Notiz aus Karte erzeugen…».
    expect(aus.has('kanban.noteFromCard')).toBe(true);
    expect(aus.has('kanban.addColumn')).toBe(true);
    // 4T-001852: mit ihnen die beiden Wege zu einer Tafel — und damit das
    // ganze Untermenü «Kanban-Tafel», das aus genau diesen beiden entsteht.
    expect(aus.has('kanban.newBoard')).toBe(true);
    expect(aus.has('kanban.convertToBoard')).toBe(true);
    // 4T-001904: mit ihnen der Schalter «Tags am Kartenfuß».
    expect(aus.has('kanban.toggleTagsFooter')).toBe(true);
    // 4T-001903: und der Schalter «Termine relativ anzeigen».
    expect(aus.has('kanban.toggleRelativeDates')).toBe(true);
    // 4T-001955: und der Dialog «Einstellungen dieser Tafel…».
    expect(aus.has('kanban.boardSettings')).toBe(true);
    expect(disabledCommandIdSet([]).has('kanban.boardSettings')).toBe(false);
    // Die Nachbarn in denselben Menüs bleiben unberührt.
    for (const id of [
      'view.modeRendered',
      'view.modeSplit',
      'view.modeSource',
      'view.modeLive',
      'view.modeMindmap',
      'view.modeCanvas',
    ]) {
      expect(aus.has(id), `${id} darf nicht mitgefiltert werden`).toBe(false);
    }
    expect(disabledCommandIdSet([]).has('view.modeKanban')).toBe(false);
    expect(disabledCommandIdSet([]).has('kanban.addCard')).toBe(false);
  });

  it('4T-001955: der Abschnitt «Kanban-Tafel» der Einstellungen hängt an der Erweiterung', () => {
    // Der Block «Erweiterungen (intern)» entsteht aus diesem Feld; im
    // Aus-Zustand blendet die Einstellungs-Seite den Abschnitt darüber aus.
    expect(extensionById('kanban').settingsSections).toEqual(['kanban']);
  });

  it('AK8: mit abgeschalteten Aufgaben entfällt das Kommando ebenso', () => {
    // Die Kaskade ist die Zusicherung: Wer «Aufgaben» abschaltet, muss die
    // Tafel nicht zusätzlich abschalten.
    expect(disabledCommandIdSet(['tasks']).has('view.modeKanban')).toBe(true);
    expect(disabledCommandIdSet(['tasks']).has('kanban.addCard')).toBe(true);
    expect(disabledFeatureKeySet(['tasks']).has('help.feature.kanban')).toBe(true);
  });

  it('AK8: ein Tafel-Dokument bleibt im Aus-Zustand gewöhnliches Markdown', () => {
    // Die Tafel bringt kein Render-Konstrukt mit; ihr Inhalt ist in jeder
    // Stellung des Schalters dasselbe Markdown. Geprüft an einer Spalte mit
    // einer Karte, damit die Probe nicht leer ist.
    const src = '## Offen\n\n- [ ] Erste Karte\n';
    const an = renderMarkdown(src, 'de');
    const aus = renderOff('kanban', src);
    expect(aus).toBe(an);
    expect(aus).toContain('Erste Karte');
  });
});
