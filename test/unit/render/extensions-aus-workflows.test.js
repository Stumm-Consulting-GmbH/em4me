// 4T-002352 (Epic 3E-000184, Story 4S-001108): Registry und Aus-Zustand der
// Erweiterung «Workflows» (workflows). Eigene Datei nach dem Muster
// extensions-aus-praesentation.test.js: extensions-aus.test.js steht am Budget
// von 800 Code-Zeilen, und die Ausnahme-Liste der Datei-Größen darf nicht
// wachsen. Muster und Hilfsfunktion renderOff wie dort; afterEach stellt den
// Default (alles an) her.
//
// Hier steht die deklarative Seite (Registry, Arbeitsmodi, Kommandos,
// Einstellungs-Abschnitte, Katalog-Zeilen) und die Darstellung durch die
// Pipeline. Den Aus-Zustand der Oberfläche über den echten Schalter (Editor,
// Kopfzeile, Kommandos, Seite, Start) prüft renderer/workflow-aus-zustand.test.js,
// den verweigernden Ausführungs-Kanal workflow-ipc.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import { extensionById, internalExtensions } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledIdsForModeLevel,
  disabledSettingsSectionIdSet,
  effectiveDisabledSet,
  isExtensionEnabled,
  normalizeDisabledIds,
} from '../../../src/shared/extensions/extensions-core.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../src/shared/workflows/workflow-konstanten.js';

afterEach(() => {
  configureExtensions([]);
});

function renderOff(id, src) {
  configureExtensions([id]);
  return renderMarkdown(src, 'de');
}

const KATALOG = [
  'help.feature.workflows',
  'help.feature.workflowStart',
  'help.feature.workflowRuns',
  'help.feature.workflowEditor',
  'help.feature.workflowFolder',
  // 4T-002427 (Epic 3E-000366): die Katalog-Zeilen der Stufe 2, in der
  // Reihenfolge des Registry-Eintrags.
  'help.feature.workflowMaintenance',
  'help.feature.workflowSchedule',
  'help.feature.workflowArming',
  'help.feature.workflowLinked',
  'help.feature.workflowStatusbar',
];
const KOMMANDOS = ['ext.workflows.openRuns', 'ext.workflows.newWorkflow'];
const ABSCHNITTE = ['workflows', 'workflowsArea'];
const DATEI = [
  '---',
  'workflow: true',
  'name: Wochenrückblick',
  '---',
  '',
  '```workflow',
  'create "{{folder}}/Neu.md" from-template "Vorlagen/Woche.md"',
  'notify "fertig"',
  '```',
  '',
].join('\n');

describe('Erweiterung workflows: Registry und Arbeitsmodus (4T-002352)', () => {
  it('AK1: ist als Werkzeug-Erweiterung auf «Voll» mit den Katalog-Schlüsseln registriert', () => {
    const manifest = extensionById('workflows');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.modeLevel).toBe('full');
    // Die Katalog-Schlüssel aus 4T-002353, keine eigenen extension.*-Texte.
    expect(manifest.nameKey).toBe('help.featureName.workflows');
    expect(manifest.descKey).toBe('help.feature.workflows');
    expect(internalExtensions().some((m) => m.id === 'workflows')).toBe(true);
    // Die Kennung der Registry ist die der Workflow-Module (Literal dort, weil
    // die Registry nichts aus App-Modulen importiert).
    expect(manifest.id).toBe(WORKFLOWS_EXTENSION_ID);
    // Ab Werk eingeschaltet: der Default der Disabled-Liste ist leer.
    expect(isExtensionEnabled('workflows', [])).toBe(true);
  });

  it('AK2: in «Einsteiger» und «Fortgeschritten» aus, in «Voll» an', () => {
    expect(disabledIdsForModeLevel('beginner')).toContain('workflows');
    expect(disabledIdsForModeLevel('advanced')).toContain('workflows');
    expect(disabledIdsForModeLevel('full')).not.toContain('workflows');
  });

  it('der Schalter bleibt stehen: die Aus-Liste nimmt die Kennung auf', () => {
    // Vor der Registrierung verwarf die Normalisierung die unbekannte Kennung,
    // und kein Schalter konnte die Workflows abschalten.
    expect(normalizeDisabledIds(['workflows'])).toEqual(['workflows']);
    expect(isExtensionEnabled('workflows', ['workflows'])).toBe(false);
  });

  it('AK3/AK4: die Katalog-Zeilen der Stufen 1 und 2 sind im Aus-Zustand gekennzeichnet', () => {
    expect(extensionById('workflows').featureKeys).toEqual(KATALOG.slice(1));
    const aus = disabledFeatureKeySet(['workflows']);
    const an = disabledFeatureKeySet([]);
    for (const key of KATALOG) {
      expect(aus.has(key), `${key} im Aus-Zustand`).toBe(true);
      expect(an.has(key), `${key} im An-Zustand`).toBe(false);
    }
  });

  it('AK4: die beiden Kommandos der Erweiterung entfallen im Aus-Zustand', () => {
    expect(extensionById('workflows').commands).toEqual(KOMMANDOS);
    for (const id of KOMMANDOS) {
      expect(disabledCommandIdSet(['workflows']).has(id), `${id} gefiltert`).toBe(true);
      expect(disabledCommandIdSet([]).has(id), `${id} im An-Zustand da`).toBe(false);
    }
    // Die Makros bleiben unberührt: Sie hängen an der Kommando-Platzierung.
    expect(effectiveDisabledSet(['workflows']).has('command-placement')).toBe(false);
  });

  it('AK4: die beiden Einstellungs-Abschnitte «Workflows» entfallen im Aus-Zustand', () => {
    expect(extensionById('workflows').settingsSections).toEqual(ABSCHNITTE);
    // Kopplung an die Seite: Beide Kennungen sind Abschnitte von settings-page.js.
    const seite = fs.readFileSync(
      path.resolve('src/renderer/modules/settings/settings-page.js'),
      'utf8',
    );
    for (const id of ABSCHNITTE) {
      expect(seite.includes(`id: '${id}',`), `${id} auf der Einstellungs-Seite`).toBe(true);
      expect(disabledSettingsSectionIdSet(['workflows']).has(id)).toBe(true);
      expect(disabledSettingsSectionIdSet([]).has(id)).toBe(false);
    }
  });

  it('AK6: keine Abhängigkeit zu den Vorlagen, in keiner Richtung', () => {
    expect(extensionById('workflows').dependencies).toBeUndefined();
    // Vorlagen aus lässt die Workflows an (der Befund templatesDisabled kommt
    // aus dem Prüfen vor Laufen, workflow-check.test.js).
    expect(effectiveDisabledSet(['templates']).has('workflows')).toBe(false);
    expect([...effectiveDisabledSet(['workflows'])]).toEqual(['workflows']);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('workflows'), `${m.id} hängt an ihr`).toBe(false);
    }
  });
});

describe('Erweiterung workflows: Darstellung im Aus-Zustand (4T-002352)', () => {
  it('AK3: der workflow-Block ist abgeschaltet ein gewöhnlicher Code-Block', () => {
    // Nicht-Vakuitäts-Probe zuerst: eingeschaltet trägt er die Färbung.
    const an = renderMarkdown(DATEI, 'de');
    expect(an).toContain('wf-keyword');
    expect(an).toContain('wf-placeholder');
    const aus = renderOff('workflows', DATEI);
    expect(aus).not.toMatch(/class="wf-/);
    expect(aus).toContain('language-workflow');
    // Der Inhalt bleibt lesbar: abgeschaltet wird die Darstellung, nicht die Angabe.
    expect(aus).toContain('notify &quot;fertig&quot;');
  });

  it('AK5: das Wiedereinschalten stellt den Block zeichengleich wieder her', () => {
    const vorher = renderMarkdown(DATEI, 'de');
    renderOff('workflows', DATEI);
    configureExtensions([]);
    expect(renderMarkdown(DATEI, 'de')).toBe(vorher);
  });

  it('der portable Export zeigt in beiden Stellungen den Rohtext der Fence', () => {
    // E6 von 4T-002351: Die portable Instanz kennt die Weiche nicht; die Probe
    // hält fest, dass der Schalter dort nichts verändert.
    const an = convertMarkdownPortable(DATEI, false, 'de');
    configureExtensions(['workflows']);
    const aus = convertMarkdownPortable(DATEI, false, 'de');
    expect(aus).toBe(an);
    expect(aus).toContain('```workflow');
    expect(aus).toContain('notify "fertig"');
  });
});
