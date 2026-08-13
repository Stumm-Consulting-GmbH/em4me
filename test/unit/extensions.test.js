// 4T-0292 (Epic 3E-0052): Erweiterungs-Registry und Pipeline-Neuaufbau.
// Registry-Validierung, Disabled-Normalisierung, Abhaengigkeits-Kopplung
// und Kommando-Filterung laufen als reine Funktionen gegen synthetische
// Listen; der Pipeline-Teil schaltet die real registrierte KaTeX-
// Erweiterung und prueft beide markdown-it-Instanzen (Viewer, Portable).
import { describe, it, expect, afterEach } from 'vitest';
import {
  EXTENSIONS_DISABLED_KEY,
  allExtensions,
  extensionById,
  isExtensionId,
  validateExtensionRegistry,
} from '../../src/shared/extensions/extensions.js';
// 4T-0993 (Epic 3E-0196): Die Ableitungen aus der Disabled-Liste liegen seit
// dem Funktions-Auszug in src/shared/extensions/extensions-core.js.
import {
  normalizeDisabledIds,
  effectiveDisabledSet,
  isExtensionEnabled,
  disabledCommandIdSet,
} from '../../src/shared/extensions/extensions-core.js';
import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';

// Synthetische Registry mit Abhaengigkeits-Kette spitze -> aufbau -> basis.
const SYNTH = [
  { id: 'basis', category: 'render', nameKey: 'n.b', descKey: 'd.b', commands: ['b.eins'] },
  {
    id: 'aufbau',
    category: 'tools',
    nameKey: 'n.a',
    descKey: 'd.a',
    dependencies: ['basis'],
    commands: ['a.eins', 'a.zwei'],
  },
  { id: 'spitze', category: 'linking', nameKey: 'n.s', descKey: 'd.s', dependencies: ['aufbau'] },
];

describe('Erweiterungs-Registry: Validierung (4T-0292)', () => {
  it('eingebaute Registry ist gueltig und enthaelt katex', () => {
    expect(validateExtensionRegistry(allExtensions())).toEqual([]);
    expect(isExtensionId('katex')).toBe(true);
    expect(extensionById('katex').category).toBe('render');
  });

  it('synthetische Registry mit Abhaengigkeiten ist gueltig', () => {
    expect(validateExtensionRegistry(SYNTH)).toEqual([]);
  });

  it('doppelte IDs, unbekannte Kategorien und fehlende Keys werden gemeldet', () => {
    const errors = validateExtensionRegistry([
      { id: 'x', category: 'render', nameKey: 'n', descKey: 'd' },
      { id: 'x', category: 'quatsch', nameKey: 'n', descKey: 'd' },
      { id: 'y', category: 'render' },
      { id: 'GROSS', category: 'render', nameKey: 'n', descKey: 'd' },
    ]);
    expect(errors.some((e) => e.includes('Doppelte'))).toBe(true);
    expect(errors.some((e) => e.includes('unbekannte Kategorie'))).toBe(true);
    expect(errors.some((e) => e.includes('nameKey/descKey'))).toBe(true);
    expect(errors.some((e) => e.includes('Ungültige Erweiterungs-ID'))).toBe(true);
  });

  it('unbekannte Abhaengigkeiten und Zyklen werden gemeldet', () => {
    const unknownDep = validateExtensionRegistry([
      { id: 'x', category: 'render', nameKey: 'n', descKey: 'd', dependencies: ['fehlt'] },
    ]);
    expect(unknownDep.some((e) => e.includes('unbekannte Abhängigkeit'))).toBe(true);
    const cycle = validateExtensionRegistry([
      { id: 'a', category: 'render', nameKey: 'n', descKey: 'd', dependencies: ['b'] },
      { id: 'b', category: 'render', nameKey: 'n', descKey: 'd', dependencies: ['a'] },
    ]);
    expect(cycle.some((e) => e.includes('Zyklus'))).toBe(true);
  });
});

describe('Erweiterungs-Registry: Disabled-Zustand (4T-0292)', () => {
  it('normalizeDisabledIds verwirft Nicht-Arrays, unbekannte IDs und Duplikate', () => {
    expect(normalizeDisabledIds(null, SYNTH)).toEqual([]);
    expect(normalizeDisabledIds('basis', SYNTH)).toEqual([]);
    expect(normalizeDisabledIds(['basis', 'fremd', 'basis', 42], SYNTH)).toEqual(['basis']);
  });

  it('effectiveDisabledSet nimmt abhaengige Erweiterungen transitiv mit', () => {
    const eff = effectiveDisabledSet(['basis'], SYNTH);
    expect([...eff].sort()).toEqual(['aufbau', 'basis', 'spitze']);
    // Mittlere Stufe deaktiviert: basis bleibt aktiv.
    const eff2 = effectiveDisabledSet(['aufbau'], SYNTH);
    expect([...eff2].sort()).toEqual(['aufbau', 'spitze']);
  });

  it('isExtensionEnabled: unbekannte IDs sind Kern und immer aktiv', () => {
    expect(isExtensionEnabled('gibtsnicht', ['basis'], SYNTH)).toBe(true);
    expect(isExtensionEnabled('spitze', ['basis'], SYNTH)).toBe(false);
    expect(isExtensionEnabled('spitze', [], SYNTH)).toBe(true);
  });

  it('disabledCommandIdSet sammelt Kommandos aller effektiv deaktivierten', () => {
    const cmds = disabledCommandIdSet(['basis'], SYNTH);
    expect([...cmds].sort()).toEqual(['a.eins', 'a.zwei', 'b.eins']);
    expect(disabledCommandIdSet([], SYNTH).size).toBe(0);
  });

  it('Store-Key ist stabil', () => {
    expect(EXTENSIONS_DISABLED_KEY).toBe('extensions.disabled');
  });

  it('reale Registry: wiki-embeds deaktiviert sich mit wiki-links (4T-0294)', () => {
    const eff = effectiveDisabledSet(['wiki-links']);
    expect(eff.has('wiki-embeds')).toBe(true);
    // Umgekehrt nicht: wiki-links bleibt bei deaktivierten Embeds aktiv.
    expect(effectiveDisabledSet(['wiki-embeds']).has('wiki-links')).toBe(false);
  });

  // 4T-0517 (Epic 3E-0092): events haengt an property-profiles — die
  // Voraussetzung nimmt die Ereignis-Erweiterung transitiv mit.
  it('reale Registry: events deaktiviert sich mit property-profiles (4T-0517)', () => {
    expect(extensionById('events').dependencies).toEqual(['property-profiles']);
    expect(isExtensionEnabled('events', ['property-profiles'])).toBe(false);
    // Umgekehrt nicht: property-profiles bleibt bei deaktivierten events aktiv.
    expect(isExtensionEnabled('property-profiles', ['events'])).toBe(true);
    expect(isExtensionEnabled('events', [])).toBe(true);
  });

  it('reale Registry: Kommando-Filterung der Panel-Erweiterungen (4T-0294)', () => {
    const cmds = disabledCommandIdSet(['wiki-links', 'bookmarks']);
    expect(cmds.has('view.toggleOutgoingLinks')).toBe(true);
    expect(cmds.has('view.toggleBacklinks')).toBe(true);
    expect(cmds.has('file.bookmarkAdd')).toBe(true);
    expect(cmds.has('view.toggleBookmarks')).toBe(true);
    expect(cmds.has('view.toggleOutline')).toBe(false);
  });

  // 4T-0599 (Epic 3E-0112): Aus-Zustand der Listen-Struktur-Erweiterung — die
  // beiden Verschiebe-Kommandos verlieren ihr Binding, der Tastendruck faellt
  // damit auf das zeilenweise Verschieben der Standard-Belegung durch. Die
  // Erweiterung haengt bewusst an keiner anderen: Listen sind Kern, nur ihre
  // Struktur-Bearbeitung ist schaltbar.
  it('reale Registry: outliner filtert die beiden Listen-Kommandos (4T-0599)', () => {
    expect(extensionById('outliner').dependencies).toBeUndefined();
    const cmds = disabledCommandIdSet(['outliner']);
    expect(cmds.has('list.moveUp')).toBe(true);
    expect(cmds.has('list.moveDown')).toBe(true);
    // Absatz- und Format-Kommandos bleiben unberuehrt (sie sind Kern).
    expect(cmds.has('paragraph.bulletList')).toBe(false);
    expect(disabledCommandIdSet([]).has('list.moveUp')).toBe(false);
  });

  // 4T-0538 (Epic 3E-0098): Aus-Zustand der Arbeitsbereichs-Erweiterung —
  // alle vier Lebenszyklus-Kommandos verschwinden (Menue-Block, Palette,
  // Dispatcher); die Ablage selbst liegt im Main und bleibt unberuehrt.
  it('reale Registry: workspaces filtert die vier Lebenszyklus-Kommandos (4T-0538)', () => {
    expect(extensionById('workspaces').dependencies).toBeUndefined();
    const cmds = disabledCommandIdSet(['workspaces']);
    expect(cmds.has('workspace.saveAs')).toBe(true);
    expect(cmds.has('workspace.create')).toBe(true);
    expect(cmds.has('workspace.close')).toBe(true);
    expect(cmds.has('workspace.manage')).toBe(true);
    expect(cmds.has('app.newApplication')).toBe(false);
    expect(disabledCommandIdSet([]).has('workspace.saveAs')).toBe(false);
  });

  // 4T-0632 (Epic 3E-0102): Demo-Area — Aus-Zustand filtert das einzige
  // Kommando area.createDemo (Menue-Punkt und Palette-Eintrag entfallen).
  it('reale Registry: demo-area filtert area.createDemo (4T-0632)', () => {
    expect(extensionById('demo-area').dependencies).toBeUndefined();
    expect(disabledCommandIdSet(['demo-area']).has('area.createDemo')).toBe(true);
    // Ohne Deaktivierung bleibt das Kommando erhalten.
    expect(disabledCommandIdSet([]).has('area.createDemo')).toBe(false);
  });

  // 4T-0590 (Epic 3E-0109): Tabellen-Werkzeuge — Aus-Zustand filtert alle
  // zwoelf table.*-Kommandos (Kontextmenue-Untermenue, Palette, Keymap).
  it('reale Registry: table-tools filtert alle zwoelf table.*-Kommandos (4T-0590)', () => {
    expect(extensionById('table-tools').dependencies).toBeUndefined();
    const cmds = disabledCommandIdSet(['table-tools']);
    const ids = [
      'table.alignLeft',
      'table.alignCenter',
      'table.alignRight',
      'table.rowUp',
      'table.rowDown',
      'table.rowInsert',
      'table.rowDelete',
      'table.colLeft',
      'table.colRight',
      'table.colInsert',
      'table.colDelete',
      'table.transpose',
    ];
    for (const id of ids) expect(cmds.has(id)).toBe(true);
    expect(cmds.has('insert.table')).toBe(false);
    expect(disabledCommandIdSet([]).has('table.rowUp')).toBe(false);
  });

  // 4T-0697 (Epic 3E-0141): Sidebar-Spalten-Kollaps — Aus-Zustand filtert die
  // beiden Toggle-Kommandos (Menue-Eintraege, Palette, Dispatcher). Ohne
  // Abhaengigkeit auf andere Erweiterungen; die Sidebar selbst bleibt Kern.
  it('reale Registry: sidebar-collapse filtert die beiden Toggle-Kommandos (4T-0697)', () => {
    const manifest = extensionById('sidebar-collapse');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.commands).toEqual(['view.toggleSidebarLeft', 'view.toggleSidebarRight']);
    const cmds = disabledCommandIdSet(['sidebar-collapse']);
    expect(cmds.has('view.toggleSidebarLeft')).toBe(true);
    expect(cmds.has('view.toggleSidebarRight')).toBe(true);
    // Fokus-Modus-Kommandos bleiben unberuehrt (eigene Erweiterung).
    expect(cmds.has('view.toggleFocusMode')).toBe(false);
    expect(disabledCommandIdSet([]).has('view.toggleSidebarLeft')).toBe(false);
  });
});

describe('Pipeline-Neuaufbau: KaTeX schaltbar (4T-0292)', () => {
  afterEach(() => {
    configureExtensions([]);
  });

  it('unveraenderter Zustand ist ein No-op', () => {
    expect(configureExtensions([])).toBe(false);
    expect(configureExtensions(['katex'])).toBe(true);
    expect(configureExtensions(['katex'])).toBe(false);
    expect(configureExtensions([])).toBe(true);
  });

  it('deaktiviertes KaTeX laesst $…$ als Fliesstext stehen (Viewer-Instanz)', () => {
    const src = 'Formel $x^2$ Ende';
    expect(renderMarkdown(src, 'de')).toContain('katex');
    configureExtensions(['katex']);
    const html = renderMarkdown(src, 'de');
    expect(html).not.toContain('katex');
    expect(html).toContain('$x^2$');
    // Wieder einschalten stellt das Rendering her.
    configureExtensions([]);
    expect(renderMarkdown(src, 'de')).toContain('katex');
  });

  it('deaktiviertes KaTeX wirkt auch auf die Portable-Instanz', () => {
    const src = '<!-- perspective-portable -->\n\nFormel $x^2$ Ende';
    expect(renderMarkdown(src, 'de')).toContain('katex');
    configureExtensions(['katex']);
    const html = renderMarkdown(src, 'de');
    expect(html).not.toContain('katex');
    expect(html).toContain('$x^2$');
  });

  it('unbekannte IDs in der Disabled-Liste aendern nichts', () => {
    expect(configureExtensions(['voellig-fremd'])).toBe(false);
    expect(renderMarkdown('$x^2$', 'de')).toContain('katex');
  });

  it('uebrige Konstrukte bleiben beim Neuaufbau unveraendert', () => {
    configureExtensions(['katex']);
    const html = renderMarkdown('# Kopf\n\n==markiert== und [[Wiki]]\n\n- [ ] Task', 'de');
    expect(html).toContain('<mark>');
    expect(html).toContain('wikilink');
    expect(html).toContain('task-list-item');
  });
});

// 4T-0528 (Epic 3E-0095): Erweiterung "reminders" — Abhaengigkeit zur
// Erweiterung "Aufgaben" (zweiter Nutzer der dependencies-Mechanik) und
// Aus-Zustand in beide Richtungen (eigener Schalter, transitiv ueber tasks).
describe('Erweiterung reminders: Abhaengigkeit und Aus-Zustand (4T-0528)', () => {
  it('ist als tools-Erweiterung mit Abhaengigkeit auf tasks registriert', () => {
    const manifest = extensionById('reminders');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.dependencies).toEqual(['tasks']);
    expect(manifest.commands).toEqual(['task.setReminder', 'view.toggleReminders']);
    expect(manifest.settingsSections).toEqual(['reminders']);
  });

  it('eigener Schalter aus: reminders inaktiv, tasks bleibt aktiv', () => {
    expect(isExtensionEnabled('reminders', ['reminders'])).toBe(false);
    expect(isExtensionEnabled('tasks', ['reminders'])).toBe(true);
    const commands = disabledCommandIdSet(['reminders']);
    expect(commands.has('task.setReminder')).toBe(true);
    expect(commands.has('view.toggleReminders')).toBe(true);
    expect(commands.has('task.editDialog')).toBe(false);
  });

  it('tasks aus: reminders ist transitiv mit-deaktiviert', () => {
    const disabled = effectiveDisabledSet(['tasks']);
    expect(disabled.has('reminders')).toBe(true);
    expect(isExtensionEnabled('reminders', ['tasks'])).toBe(false);
    const commands = disabledCommandIdSet(['tasks']);
    expect(commands.has('task.setReminder')).toBe(true);
    expect(commands.has('view.toggleReminders')).toBe(true);
    expect(commands.has('task.editDialog')).toBe(true);
  });
});
