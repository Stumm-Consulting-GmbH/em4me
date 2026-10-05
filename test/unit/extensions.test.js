// 4T-000292 (Epic 3E-000052): Erweiterungs-Registry und Pipeline-Neuaufbau.
// Registry-Validierung, Disabled-Normalisierung, Abhaengigkeits-Kopplung
// und Kommando-Filterung laufen als reine Funktionen gegen synthetische
// Listen; der Pipeline-Teil schaltet die real registrierte KaTeX-
// Erweiterung und prueft beide markdown-it-Instanzen (Viewer, Portable).
import { describe, it, expect, afterEach } from 'vitest';
import {
  EXTENSIONS_DISABLED_KEY,
  EXTENSION_MODE_LEVELS,
  allExtensions,
  internalExtensions,
  extensionById,
  isExtensionId,
  registerExternalExtension,
  unregisterExternalExtension,
  validateExtensionRegistry,
} from '../../src/shared/extensions/extensions.js';
// 4T-000993 (Epic 3E-000196): Die Ableitungen aus der Disabled-Liste liegen seit
// dem Funktions-Auszug in src/shared/extensions/extensions-core.js.
import {
  normalizeDisabledIds,
  effectiveDisabledSet,
  blockingDependentIds,
  isExtensionLocked,
  disabledIdsForModeLevel,
  modeLevelForDisabledIds,
  START_MODE_LEVEL,
  startupDisabledIds,
  isExtensionEnabled,
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
} from '../../src/shared/extensions/extensions-core.js';
import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';

// Synthetische Registry mit Abhaengigkeits-Kette spitze -> aufbau -> basis.
const SYNTH = [
  {
    id: 'basis',
    category: 'render',
    modeLevel: 'beginner',
    nameKey: 'n.b',
    descKey: 'd.b',
    commands: ['b.eins'],
  },
  {
    id: 'aufbau',
    category: 'tools',
    modeLevel: 'advanced',
    nameKey: 'n.a',
    descKey: 'd.a',
    dependencies: ['basis'],
    commands: ['a.eins', 'a.zwei'],
  },
  {
    id: 'spitze',
    category: 'linking',
    modeLevel: 'full',
    nameKey: 'n.s',
    descKey: 'd.s',
    dependencies: ['aufbau'],
  },
];

describe('Erweiterungs-Registry: Validierung (4T-000292)', () => {
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

describe('Erweiterungs-Registry: Disabled-Zustand (4T-000292)', () => {
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

  it('reale Registry: wiki-embeds deaktiviert sich mit wiki-links (4T-000294)', () => {
    const eff = effectiveDisabledSet(['wiki-links']);
    expect(eff.has('wiki-embeds')).toBe(true);
    // Umgekehrt nicht: wiki-links bleibt bei deaktivierten Embeds aktiv.
    expect(effectiveDisabledSet(['wiki-embeds']).has('wiki-links')).toBe(false);
  });

  // 4T-000517 (Epic 3E-000092): events haengt an property-profiles — die
  // Voraussetzung nimmt die Ereignis-Erweiterung transitiv mit.
  it('reale Registry: events deaktiviert sich mit property-profiles (4T-000517)', () => {
    expect(extensionById('events').dependencies).toEqual(['property-profiles']);
    expect(isExtensionEnabled('events', ['property-profiles'])).toBe(false);
    // Umgekehrt nicht: property-profiles bleibt bei deaktivierten events aktiv.
    expect(isExtensionEnabled('property-profiles', ['events'])).toBe(true);
    expect(isExtensionEnabled('events', [])).toBe(true);
  });

  it('reale Registry: Kommando-Filterung der Panel-Erweiterungen (4T-000294)', () => {
    const cmds = disabledCommandIdSet(['wiki-links', 'bookmarks']);
    expect(cmds.has('view.toggleOutgoingLinks')).toBe(true);
    expect(cmds.has('view.toggleBacklinks')).toBe(true);
    expect(cmds.has('file.bookmarkAdd')).toBe(true);
    expect(cmds.has('view.toggleBookmarks')).toBe(true);
    expect(cmds.has('view.toggleOutline')).toBe(false);
  });

  // 4T-000599 (Epic 3E-000112): Aus-Zustand der Listen-Struktur-Erweiterung — die
  // beiden Verschiebe-Kommandos verlieren ihr Binding, der Tastendruck faellt
  // damit auf das zeilenweise Verschieben der Standard-Belegung durch. Die
  // Erweiterung haengt bewusst an keiner anderen: Listen sind Kern, nur ihre
  // Struktur-Bearbeitung ist schaltbar.
  it('reale Registry: outliner filtert die beiden Listen-Kommandos (4T-000599)', () => {
    expect(extensionById('outliner').dependencies).toBeUndefined();
    const cmds = disabledCommandIdSet(['outliner']);
    expect(cmds.has('list.moveUp')).toBe(true);
    expect(cmds.has('list.moveDown')).toBe(true);
    // Absatz- und Format-Kommandos bleiben unberuehrt (sie sind Kern).
    expect(cmds.has('paragraph.bulletList')).toBe(false);
    expect(disabledCommandIdSet([]).has('list.moveUp')).toBe(false);
  });

  // 4T-000538 (Epic 3E-000098): Aus-Zustand der Arbeitsbereichs-Erweiterung —
  // alle vier Lebenszyklus-Kommandos verschwinden (Menue-Block, Palette,
  // Dispatcher); die Ablage selbst liegt im Main und bleibt unberuehrt.
  it('reale Registry: workspaces filtert die vier Lebenszyklus-Kommandos (4T-000538)', () => {
    expect(extensionById('workspaces').dependencies).toBeUndefined();
    const cmds = disabledCommandIdSet(['workspaces']);
    expect(cmds.has('workspace.saveAs')).toBe(true);
    expect(cmds.has('workspace.create')).toBe(true);
    expect(cmds.has('workspace.close')).toBe(true);
    expect(cmds.has('workspace.manage')).toBe(true);
    expect(cmds.has('app.newApplication')).toBe(false);
    expect(disabledCommandIdSet([]).has('workspace.saveAs')).toBe(false);
  });

  // 4T-000632 (Epic 3E-000102): Demo-Area — Aus-Zustand filtert das einzige
  // Kommando area.createDemo (Menue-Punkt und Palette-Eintrag entfallen).
  it('reale Registry: demo-area filtert area.createDemo (4T-000632)', () => {
    expect(extensionById('demo-area').dependencies).toBeUndefined();
    expect(disabledCommandIdSet(['demo-area']).has('area.createDemo')).toBe(true);
    // Ohne Deaktivierung bleibt das Kommando erhalten.
    expect(disabledCommandIdSet([]).has('area.createDemo')).toBe(false);
  });

  // 4T-000590 (Epic 3E-000109): Tabellen-Werkzeuge — Aus-Zustand filtert alle
  // zwoelf table.*-Kommandos (Kontextmenue-Untermenue, Palette, Keymap).
  it('reale Registry: table-tools filtert alle zwoelf table.*-Kommandos (4T-000590)', () => {
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

  // 4T-000697 (Epic 3E-000141): Sidebar-Spalten-Kollaps — Aus-Zustand filtert die
  // beiden Toggle-Kommandos (Menue-Eintraege, Palette, Dispatcher). Ohne
  // Abhaengigkeit auf andere Erweiterungen; die Sidebar selbst bleibt Kern.
  it('reale Registry: sidebar-collapse filtert die beiden Toggle-Kommandos (4T-000697)', () => {
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

describe('Pipeline-Neuaufbau: KaTeX schaltbar (4T-000292)', () => {
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

// 4T-000528 (Epic 3E-000095): Erweiterung "reminders" — Abhaengigkeit zur
// Erweiterung "Aufgaben" (zweiter Nutzer der dependencies-Mechanik) und
// Aus-Zustand in beide Richtungen (eigener Schalter, transitiv ueber tasks).
describe('Erweiterung reminders: Abhaengigkeit und Aus-Zustand (4T-000528)', () => {
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

// 4T-001877 (Epic 3E-000187, Story 4S-000991): Abhaengigkeits-Schutz — die
// Gegenrichtung der Ableitung. Solange eine Abhaengige wirksam ist, ist der
// Schalter ihrer Grundlage gesperrt; die Sperre folgt allein dem Schalter-Stand
// und wird nirgends gespeichert. Die Faelle hier decken die reine Funktion ab,
// die Zeilen-Darstellung liegt in renderer/settings-extensions.test.js.
//
// Die fuenf HARTEN Paare des Konzepts 4T-001843 sind die Grundgesamtheit der
// Sperre; die daneben erhobenen Verarmungen (autocomplete zu wiki-links,
// tasks zu task-states und weitere) bleiben ausdruecklich sperrfrei.
const HARTE_PAARE = [
  ['wiki-embeds', 'wiki-links'],
  ['area-links', 'wiki-links'],
  ['reminders', 'tasks'],
  ['events', 'property-profiles'],
  ['database', 'property-profiles'],
  // Sechstes Paar seit der Zusammenführung mit dem Release 1.141.0: Die
  // Kanban-Tafel deklariert «Aufgaben» als harte Grundlage.
  ['kanban', 'tasks'],
  // 4T-002019 (Epic 3E-000192): Das Diagramm zu einer Datentabelle deklariert die
  // Datentabelle als harte Grundlage (4S-001021 AK17).
  ['perspective-chart', 'perspective-datatable'],
];

describe('Abhaengigkeits-Schutz: Sperre der Grundlage (4T-001877)', () => {
  it('AK1/AK8: jedes der fuenf deklarierten Paare sperrt seine Grundlage', () => {
    for (const [abhaengige, grundlage] of HARTE_PAARE) {
      expect(extensionById(abhaengige).dependencies).toContain(grundlage);
      expect(blockingDependentIds(grundlage, [])).toContain(abhaengige);
      expect(isExtensionLocked(grundlage, [])).toBe(true);
      // Die Abhaengige selbst bleibt frei abschaltbar.
      expect(isExtensionLocked(abhaengige, [])).toBe(false);
    }
  });

  it('AK3: mehrere Abhaengige derselben Grundlage erscheinen gemeinsam', () => {
    expect(blockingDependentIds('wiki-links', []).sort()).toEqual(['area-links', 'wiki-embeds']);
    expect(blockingDependentIds('property-profiles', []).sort()).toEqual(['database', 'events']);
  });

  it('AK4: die Grundlage wird erst mit der LETZTEN Abhaengigen frei', () => {
    expect(blockingDependentIds('property-profiles', ['events'])).toEqual(['database']);
    expect(blockingDependentIds('property-profiles', ['events', 'database'])).toEqual([]);
    expect(isExtensionLocked('property-profiles', ['events', 'database'])).toBe(false);
    expect(blockingDependentIds('tasks', ['reminders'])).toEqual(['kanban']);
    expect(blockingDependentIds('tasks', ['reminders', 'kanban'])).toEqual([]);
  });

  // 4T-002019 (Epic 3E-000192, 4S-001021 AK17): Solange das Diagramm an ist,
  // ist die Datentabelle gesperrt; ist es aus, ist ihr Schalter frei.
  it('4T-002019: das Diagramm sperrt die Datentabelle nur, solange es an ist', () => {
    expect(blockingDependentIds('perspective-datatable', [])).toEqual(['perspective-chart']);
    expect(isExtensionLocked('perspective-datatable', [])).toBe(true);
    expect(blockingDependentIds('perspective-datatable', ['perspective-chart'])).toEqual([]);
    expect(isExtensionLocked('perspective-datatable', ['perspective-chart'])).toBe(false);
    expect(isExtensionLocked('perspective-chart', [])).toBe(false);
  });

  it('AK5: eine Grundlage ohne Abhaengige ist nie gesperrt', () => {
    expect(isExtensionLocked('katex', [])).toBe(false);
    expect(isExtensionLocked('tags', [])).toBe(false);
    expect(isExtensionLocked('outliner', [])).toBe(false);
  });

  // AK8 negativ: Verarmungen sind NICHT deklariert und sperren deshalb nichts.
  // task-states ist der Beleg — tasks laeuft ohne die erweiterte Status-
  // Semantik weiter (live-pass-tasks.js), und autocomplete steht in keiner
  // dependencies-Liste, obwohl es wiki-links, tags, tasks und reminders nutzt.
  it('AK8: keine Verarmung erzeugt eine Sperre', () => {
    expect(blockingDependentIds('task-states', [])).toEqual([]);
    expect(blockingDependentIds('wiki-links', [])).not.toContain('autocomplete');
    expect(blockingDependentIds('tags', [])).toEqual([]);
    expect(blockingDependentIds('date-picker', [])).toEqual([]);
    expect(blockingDependentIds('setup-exchange', [])).toEqual([]);
  });

  // AK6/AK7/AK12: Ein mitgebrachter Stand (Grundlage aus, Abhaengige als AN
  // gespeichert) bleibt unveraendert wirksam — die Abhaengige wirkt weiter als
  // abgeschaltet, die roh gespeicherte Liste wird nicht angefasst, und die drei
  // abgeleiteten Mengen bleiben dazu widerspruchsfrei.
  it('AK6/AK7/AK12: mitgebrachter Stand wirkt unveraendert und bleibt stimmig', () => {
    const mitgebracht = ['property-profiles'];
    expect(normalizeDisabledIds(mitgebracht)).toEqual(['property-profiles']);
    const effektiv = effectiveDisabledSet(mitgebracht);
    expect(effektiv.has('events')).toBe(true);
    expect(effektiv.has('database')).toBe(true);
    expect(isExtensionEnabled('events', mitgebracht)).toBe(false);
    // Die Grundlage laesst sich jederzeit wieder einschalten: Sie ist nicht
    // gesperrt, weil ihre Abhaengigen in diesem Stand nicht wirksam sind.
    expect(blockingDependentIds('property-profiles', mitgebracht)).toEqual([]);
    // Die drei abgeleiteten Mengen folgen demselben effektiven Satz.
    for (const id of ['events', 'database']) {
      const manifest = extensionById(id);
      for (const cmd of manifest.commands || []) {
        expect(disabledCommandIdSet(mitgebracht).has(cmd)).toBe(true);
      }
      for (const section of manifest.settingsSections || []) {
        expect(disabledSettingsSectionIdSet(mitgebracht).has(section)).toBe(true);
      }
      for (const key of manifest.featureKeys || []) {
        expect(disabledFeatureKeySet(mitgebracht).has(key)).toBe(true);
      }
    }
  });

  // AK17: Das Sperr-Bild ist eine Ableitung aus dem uebergebenen Schalter-Stand
  // und traegt keinen eigenen Zustand — derselbe Stand ergibt dasselbe Bild,
  // ein anderer Stand ein anderes, ohne Ruecksicht auf die Reihenfolge der
  // Aufrufe. Damit gilt es nach einem Neustart und in jedem Fenster gleich.
  it('AK17: das Sperr-Bild folgt allein dem uebergebenen Schalter-Stand', () => {
    const erst = blockingDependentIds('tasks', []);
    expect(blockingDependentIds('tasks', ['reminders', 'kanban'])).toEqual([]);
    expect(blockingDependentIds('tasks', [])).toEqual(erst);
    expect(erst.slice().sort()).toEqual(['kanban', 'reminders']);
  });

  // AK18: Eine Kennung, die es nicht mehr gibt, sperrt nichts und stoert die
  // Ableitung der uebrigen nicht.
  it('AK18: eine unbekannte Kennung sperrt nichts', () => {
    expect(blockingDependentIds('gibtsnicht', [])).toEqual([]);
    expect(isExtensionLocked('gibtsnicht', ['gibtsnicht'])).toBe(false);
    expect(blockingDependentIds('tasks', ['gibtsnicht']).sort()).toEqual(['kanban', 'reminders']);
  });

  // AK13: Die Validierung bleibt wirksam; zusaetzlich sperrt eine Abhaengigkeit
  // auf eine nicht registrierte Kennung nichts, weil die Schleife ueber die
  // Registry laeuft und dort keinen Gegenpart findet.
  it('AK13: eine Abhaengigkeit auf eine unbekannte Kennung sperrt nichts', () => {
    const KAPUTT = [
      { id: 'x', category: 'render', nameKey: 'n', descKey: 'd', dependencies: ['fehlt'] },
    ];
    expect(
      validateExtensionRegistry(KAPUTT).some((e) => e.includes('unbekannte Abhängigkeit')),
    ).toBe(true);
    expect(blockingDependentIds('fehlt', [], KAPUTT)).toEqual([]);
    expect(blockingDependentIds('x', [], KAPUTT)).toEqual([]);
  });

  // AK10: Externe Erweiterungen bleiben ausserhalb — ihre Registrierung
  // uebernimmt kein dependencies-Feld, ein uebergebenes wird verworfen.
  it('AK10: eine externe Erweiterung erzeugt keine Sperre', () => {
    try {
      const manifest = registerExternalExtension({
        id: 'fremd-schutz',
        name: 'Fremd',
        dependencies: ['katex'],
      });
      expect(manifest.dependencies).toBeUndefined();
      expect(blockingDependentIds('katex', [])).toEqual([]);
      expect(isExtensionLocked('katex', [])).toBe(false);
      expect(blockingDependentIds('fremd-schutz', [])).toEqual([]);
    } finally {
      unregisterExternalExtension('fremd-schutz');
    }
  });

  // Mehrstufige Kette an der synthetischen Registry: Die Sperre wirkt je Paar
  // und braucht dafuer keine eigene Mechanik — sie loest sich Stufe fuer Stufe.
  it('mehrstufige Kette: die Sperre loest sich von der Spitze her', () => {
    expect(blockingDependentIds('basis', [], SYNTH)).toEqual(['aufbau']);
    expect(blockingDependentIds('aufbau', [], SYNTH)).toEqual(['spitze']);
    expect(blockingDependentIds('spitze', [], SYNTH)).toEqual([]);
    // Spitze abgeschaltet: aufbau ist frei, basis bleibt gesperrt.
    expect(blockingDependentIds('aufbau', ['spitze'], SYNTH)).toEqual([]);
    expect(blockingDependentIds('basis', ['spitze'], SYNTH)).toEqual(['aufbau']);
    // Danach aufbau abgeschaltet: basis ist frei.
    expect(blockingDependentIds('basis', ['spitze', 'aufbau'], SYNTH)).toEqual([]);
  });
});

// 4T-001880 (Epic 3E-000185, Story 4S-000992): Die Modus-Stufe als Pflicht-Angabe
// je Registry-Eintrag und ihre Ableitung zum Schalter-Satz eines festen
// Arbeitsmodus. Der Task aendert das Verhalten der Anwendung NICHT: Das Feld
// wird gesetzt und geprueft, angewandt wird es erst mit den festen Modi
// (4T-001881). Die entschiedene Zuordnung aller zweiundsechzig Erweiterungen
// steht in der Konzept-Runde 4T-001842 und ist dort die Quelle; sie wird hier
// bewusst NICHT als zweite Liste wiederholt, weil eine zweite Liste genau das
// waere, was die Pflicht-Angabe am Manifest verhindern soll. Seit der
// Zusammenfuehrung mit dem Release 1.141.0 kommt die Kanban-Tafel als
// dreiundsechzigste hinzu, auf «Fortgeschritten» (Sammeltask 4T-001891). Mit
// 4T-002019 kommt das Diagramm zu einer Datentabelle als vierundsechzigste
// hinzu, auf «Voll».
const STUFEN_ZAHLEN = { beginner: 24, advanced: 27, full: 13 };

describe('Arbeitsmodi: Modus-Stufe der Registry (4T-001880)', () => {
  it('AK1: jede interne Erweiterung traegt eine gueltige Stufe', () => {
    const intern = internalExtensions();
    expect(intern).toHaveLength(64);
    const gezaehlt = { beginner: 0, advanced: 0, full: 0 };
    for (const m of intern) {
      expect(EXTENSION_MODE_LEVELS, `${m.id} ohne gueltige Stufe`).toContain(m.modeLevel);
      gezaehlt[m.modeLevel] += 1;
    }
    // Die Zahlen der entschiedenen Tabelle samt Kanban-Tafel und Diagramm:
    // Einsteiger 24 von 64, Fortgeschritten 51 von 64 (24 + 27), Voll 64 von 64.
    expect(gezaehlt).toEqual(STUFEN_ZAHLEN);
  });

  it('AK4: ein Eintrag ohne Stufe wird abgewiesen', () => {
    const errors = validateExtensionRegistry([
      { id: 'ohne-stufe', category: 'render', nameKey: 'n', descKey: 'd' },
    ]);
    expect(errors.some((e) => e.includes('Modus-Stufe fehlt'))).toBe(true);
  });

  it('AK5: ein unbekannter Stufen-Wert wird abgewiesen', () => {
    const errors = validateExtensionRegistry([
      { id: 'falsche-stufe', category: 'render', modeLevel: 'profi', nameKey: 'n', descKey: 'd' },
    ]);
    expect(errors.some((e) => e.includes('unbekannte Modus-Stufe profi'))).toBe(true);
    // Ein gueltiger Wert bleibt fehlerfrei — der Befund haengt am Wert, nicht
    // am Vorhandensein des Feldes.
    expect(
      validateExtensionRegistry([
        { id: 'gute-stufe', category: 'render', modeLevel: 'full', nameKey: 'n', descKey: 'd' },
      ]),
    ).toEqual([]);
  });

  it('AK6: die drei Mengen sind ineinander geschachtelt', () => {
    const voll = disabledIdsForModeLevel('full');
    const fortgeschritten = disabledIdsForModeLevel('advanced');
    const einsteiger = disabledIdsForModeLevel('beginner');
    // Abgeschaltet ist, wessen Stufe hoeher liegt als der Modus.
    expect(voll).toEqual([]);
    expect(fortgeschritten).toHaveLength(STUFEN_ZAHLEN.full);
    expect(einsteiger).toHaveLength(STUFEN_ZAHLEN.full + STUFEN_ZAHLEN.advanced);
    // Schachtelung: was der groessere Modus abschaltet, schaltet der kleinere
    // ebenfalls ab. Kein Modus nimmt etwas weg, das ein kleinerer enthaelt.
    for (const id of voll) expect(fortgeschritten).toContain(id);
    for (const id of fortgeschritten) expect(einsteiger).toContain(id);
    // Gegenprobe an drei benannten Kennungen der entschiedenen Tabelle.
    expect(einsteiger).not.toContain('wiki-links');
    expect(einsteiger).toContain('katex');
    expect(fortgeschritten).not.toContain('katex');
    expect(fortgeschritten).toContain('database');
  });

  // 4T-002019 (Epic 3E-000192, 4S-001021 AK16): Das Diagramm zu einer
  // Datentabelle ist im Modus «Voll» an und in den beiden kleineren aus —
  // gemeinsam mit seiner Grundlage, der Datentabelle.
  it('4T-002019: das Diagramm ist nur im Modus «Voll» an, wie seine Datentabelle', () => {
    expect(extensionById('perspective-chart').modeLevel).toBe('full');
    expect(disabledIdsForModeLevel('full')).not.toContain('perspective-chart');
    for (const stufe of ['advanced', 'beginner']) {
      expect(disabledIdsForModeLevel(stufe)).toContain('perspective-chart');
      expect(disabledIdsForModeLevel(stufe)).toContain('perspective-datatable');
    }
  });

  it('AK6: eine unbekannte Stufen-Angabe schaltet nichts ab', () => {
    expect(disabledIdsForModeLevel('profi')).toEqual([]);
    expect(disabledIdsForModeLevel(undefined)).toEqual([]);
  });

  // Die Abhaengigkeits-Vertraeglichkeit je Stufe: In keinem der drei Modi ist
  // eine Erweiterung eingeschaltet, deren deklarierte Grundlage dort
  // abgeschaltet waere. Das ist die maschinelle Fassung der Pruefung, die die
  // Konzept-Runde von Hand gefuehrt hat, und sie haelt auch bei kuenftigen
  // Zugaengen.
  it('AK6/AK9: keine Stufe verletzt eine deklarierte Abhaengigkeit', () => {
    for (const stufe of EXTENSION_MODE_LEVELS) {
      const aus = new Set(disabledIdsForModeLevel(stufe));
      for (const m of internalExtensions()) {
        if (aus.has(m.id)) continue;
        for (const dep of m.dependencies || []) {
          expect(aus.has(dep), `${stufe}: ${m.id} an, Grundlage ${dep} aus`).toBe(false);
        }
      }
      // Gegenprobe ueber die Ableitung: Der gesetzte Satz nimmt nichts
      // zusaetzlich mit, weil keine Grundlage fehlt.
      expect(effectiveDisabledSet([...aus]).size).toBe(aus.size);
    }
  });

  it('AK7: eine externe Erweiterung traegt keine Stufe und bleibt ausserhalb', () => {
    try {
      const manifest = registerExternalExtension({
        id: 'fremd-stufe',
        name: 'Fremd',
        modeLevel: 'beginner',
      });
      expect(manifest.modeLevel).toBeUndefined();
      // Kein fester Modus fasst sie an — auch der kleinste nicht.
      for (const stufe of EXTENSION_MODE_LEVELS) {
        expect(disabledIdsForModeLevel(stufe)).not.toContain('fremd-stufe');
      }
      // Und die Registry bleibt trotz fehlender Stufe gueltig.
      expect(validateExtensionRegistry(allExtensions())).toEqual([]);
    } finally {
      unregisterExternalExtension('fremd-stufe');
    }
  });

  it('AK8: die Vorgabe bleibt unveraendert — kein Schalter aendert seinen Zustand', () => {
    // Persistiert wird nur die Liste der bewusst abgeschalteten Kennungen;
    // ihre Vorgabe ist leer, und daran aendert die neue Angabe nichts.
    expect(effectiveDisabledSet([]).size).toBe(0);
    expect(disabledCommandIdSet([]).size).toBe(0);
    expect(disabledFeatureKeySet([]).size).toBe(0);
    expect(disabledSettingsSectionIdSet([]).size).toBe(0);
    for (const m of internalExtensions()) expect(isExtensionEnabled(m.id, [])).toBe(true);
  });

  it('AK9: die uebrigen Regeln der Validierung bleiben wirksam', () => {
    // Eine gueltige Stufe heilt keinen anderen Verstoss.
    const errors = validateExtensionRegistry([
      { id: 'a', category: 'quatsch', modeLevel: 'full', nameKey: 'n', descKey: 'd' },
      { id: 'a', category: 'render', modeLevel: 'full', nameKey: 'n', descKey: 'd' },
      {
        id: 'b',
        category: 'render',
        modeLevel: 'full',
        nameKey: 'n',
        descKey: 'd',
        dependencies: ['fehlt'],
      },
    ]);
    expect(errors.some((e) => e.includes('unbekannte Kategorie'))).toBe(true);
    expect(errors.some((e) => e.includes('Doppelte'))).toBe(true);
    expect(errors.some((e) => e.includes('unbekannte Abhängigkeit'))).toBe(true);
  });

  it('die Ableitung arbeitet auch auf einer uebergebenen Liste', () => {
    expect(disabledIdsForModeLevel('beginner', SYNTH)).toEqual(['aufbau', 'spitze']);
    expect(disabledIdsForModeLevel('advanced', SYNTH)).toEqual(['spitze']);
    expect(disabledIdsForModeLevel('full', SYNTH)).toEqual([]);
  });
});

// 4T-001881 (Epic 3E-000185, Story 4S-000992): Die beiden Ableitungen, die die
// festen Arbeitsmodi bedienbar machen — welcher Modus entspricht einem
// Schalter-Stand (Anzeige in den Einstellungen und in der Tour-Karte), und ist
// beim Start der Einsteiger-Satz zu schreiben (Start-Modus neuer
// Installationen).
describe('Feste Arbeitsmodi: Anzeige und Start-Modus (4T-001881)', () => {
  it('AK18: jeder der drei Saetze wird als sein Modus erkannt', () => {
    for (const stufe of EXTENSION_MODE_LEVELS) {
      expect(modeLevelForDisabledIds(disabledIdsForModeLevel(stufe))).toBe(stufe);
    }
    // Der Auslieferungszustand (nichts abgeschaltet) ist der volle Modus.
    expect(modeLevelForDisabledIds([])).toBe('full');
  });

  it('AK19: ein abweichender Einzel-Schalter fuehrt auf «Angepasst» und zurueck', () => {
    const einsteiger = disabledIdsForModeLevel('beginner');
    // Einen Schalter zusaetzlich einschalten: kein fester Modus mehr.
    const einerAn = einsteiger.filter((id) => id !== einsteiger[0]);
    expect(modeLevelForDisabledIds(einerAn)).toBeNull();
    // Einen weiteren abschalten, der im Einsteiger-Modus an ist: ebenfalls
    // keiner — die Richtung spielt keine Rolle.
    expect(modeLevelForDisabledIds([...einsteiger, 'wiki-links'])).toBeNull();
    // Zurueck auf den Satz: der Modus ist wieder da. Die Reihenfolge der
    // Liste ist dabei gleichgueltig, gemessen wird die Menge.
    expect(modeLevelForDisabledIds([...einsteiger].reverse())).toBe('beginner');
  });

  it('AK29: unbekannte und doppelte Kennungen stoeren die Anzeige nicht', () => {
    const einsteiger = disabledIdsForModeLevel('beginner');
    expect(modeLevelForDisabledIds([...einsteiger, ...einsteiger])).toBe('beginner');
    expect(modeLevelForDisabledIds([...einsteiger, 'gibt-es-nicht'])).toBe('beginner');
    // Auch ein voellig defekter Stand liefert eine Aussage statt eines Fehlers.
    expect(modeLevelForDisabledIds(null)).toBe('full');
    expect(modeLevelForDisabledIds('kaputt')).toBe('full');
  });

  it('die Anzeige arbeitet auch auf einer uebergebenen Liste', () => {
    expect(modeLevelForDisabledIds(['aufbau', 'spitze'], SYNTH)).toBe('beginner');
    expect(modeLevelForDisabledIds(['spitze'], SYNTH)).toBe('advanced');
    expect(modeLevelForDisabledIds([], SYNTH)).toBe('full');
    expect(modeLevelForDisabledIds(['aufbau'], SYNTH)).toBeNull();
  });

  it('AK7: ohne gespeicherten Stand und ohne Tour-Merker gilt der Einsteiger-Satz', () => {
    expect(START_MODE_LEVEL).toBe('beginner');
    const start = startupDisabledIds({ hasStoredState: false, hasSeenTour: false });
    expect(start).toEqual(disabledIdsForModeLevel('beginner'));
    expect(modeLevelForDisabledIds(start)).toBe('beginner');
  });

  it('AK6: ein vorhandener Schalter-Stand bleibt unberuehrt — auch die leere Liste', () => {
    // Die leere Liste ist der Stand einer bestehenden Einrichtung mit voller
    // Funktionalitaet. Gemessen wird das Vorhandensein des Schluessels, nicht
    // sein Inhalt; deshalb schreibt der Start hier nichts.
    expect(startupDisabledIds({ hasStoredState: true, hasSeenTour: false })).toBeNull();
    expect(startupDisabledIds({ hasStoredState: true, hasSeenTour: true })).toBeNull();
  });

  it('AK6: der gesetzte Tour-Merker allein verhindert die Vorgabe', () => {
    // Wer die Tour schon gesehen hat, hat die Anwendung schon benutzt — auch
    // wenn er nie einen Erweiterungs-Schalter angefasst hat. Ein Update
    // beschneidet ihm den Funktionsumfang nicht.
    expect(startupDisabledIds({ hasStoredState: false, hasSeenTour: true })).toBeNull();
  });

  it('die Start-Entscheidung arbeitet auch auf einer uebergebenen Liste', () => {
    expect(startupDisabledIds({ hasStoredState: false, hasSeenTour: false }, SYNTH)).toEqual([
      'aufbau',
      'spitze',
    ]);
  });
});
