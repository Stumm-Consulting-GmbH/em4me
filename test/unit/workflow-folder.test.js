// 4T-002355 (Epic 3E-000184): Der Workflow-Ordner — Auflösung über zwei Ebenen
// und Lesen seiner Workflows (Story 4S-001109, AK1, AK2-Liste, AK5).
//
// Gelesen wird an einem echten Temp-Verzeichnis: Die Entscheidung, was als
// Workflow gilt, fällt beim Lesen der Dateien, und ein nachgebauter Datei-Baum
// prüfte den Nachbau (test/README, Abschnitt «Setup-/Teardown-Vorlage»).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeWorkflowsConfig,
  readWorkflowFolder,
  resolveWorkflowsFolder,
} = require('../../src/main/workflows/workflow-folder.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-ordner-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Rest bleibt im OS-Temp liegen; unkritisch.
  }
});

function workflowText(kopf) {
  return `---\n${kopf}\n---\n\n\`\`\`workflow\nnotify "Hallo"\n\`\`\`\n`;
}

function lege(rel, inhalt) {
  const abs = path.join(tmpDir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt, 'utf8');
  return abs;
}

describe('normalizeWorkflowsConfig', () => {
  it('nimmt einen getrimmten Ordner', () => {
    expect(normalizeWorkflowsConfig({ folder: '  Abläufe ' })).toEqual({ folder: 'Abläufe' });
  });

  it('wertet fehlende, leere und unbrauchbare Angaben als «nicht festgelegt»', () => {
    for (const roh of [
      null,
      undefined,
      'Abläufe',
      [],
      {},
      { folder: '' },
      { folder: '   ' },
      { folder: 3 },
    ]) {
      expect(normalizeWorkflowsConfig(roh), JSON.stringify(roh)).toBeNull();
    }
  });
});

describe('resolveWorkflowsFolder — Bereich vor global (AK1)', () => {
  const WURZEL = path.resolve(os.tmpdir(), 'Bereich');
  const GLOBAL = path.resolve(os.tmpdir(), 'Global-Workflows');

  it('löst den Bereichs-Ordner relativ zur Bereichs-Wurzel auf', () => {
    expect(
      resolveWorkflowsFolder({
        areaRootPath: WURZEL,
        areaConfig: { folder: 'Abläufe/Tag' },
        globalFolder: null,
      }),
    ).toEqual({ source: 'area', folder: path.join(WURZEL, 'Abläufe', 'Tag') });
  });

  it('toleriert einen absoluten Bereichs-Ordner', () => {
    expect(
      resolveWorkflowsFolder({
        areaRootPath: WURZEL,
        areaConfig: { folder: GLOBAL },
        globalFolder: null,
      }).folder,
    ).toBe(GLOBAL);
  });

  it('ersetzt den globalen Ordner vollständig, wenn der Bereich einen festlegt', () => {
    expect(
      resolveWorkflowsFolder({
        areaRootPath: WURZEL,
        areaConfig: { folder: 'Abläufe' },
        globalFolder: GLOBAL,
      }),
    ).toEqual({ source: 'area', folder: path.join(WURZEL, 'Abläufe') });
  });

  it('fällt ohne Bereichs-Festlegung auf den globalen Ordner zurück', () => {
    for (const areaConfig of [undefined, null, {}, { folder: '' }]) {
      expect(
        resolveWorkflowsFolder({ areaRootPath: WURZEL, areaConfig, globalFolder: GLOBAL }),
      ).toEqual({
        source: 'global',
        folder: GLOBAL,
      });
    }
  });

  it('übergeht eine Bereichs-Sektion ohne Bereichs-Wurzel', () => {
    expect(
      resolveWorkflowsFolder({
        areaRootPath: null,
        areaConfig: { folder: 'Abläufe' },
        globalFolder: GLOBAL,
      }).source,
    ).toBe('global');
  });

  it('meldet «kein Ordner», wenn keine Ebene einen festlegt', () => {
    expect(
      resolveWorkflowsFolder({ areaRootPath: WURZEL, areaConfig: undefined, globalFolder: '  ' }),
    ).toEqual({
      source: 'none',
      folder: null,
    });
  });
});

describe('readWorkflowFolder — gekennzeichnete Dateien, nach Name, Unterordner als Gruppen', () => {
  it('nimmt nur Dateien mit Kennzeichen und übergeht die übrigen (AK5 der Story)', async () => {
    lege('Mit.md', workflowText('workflow: true\nname: Mit Kennzeichen'));
    lege('Text.md', workflowText('workflow: "true"\nname: Als Text'));
    lege('Ohne.md', workflowText('name: Ohne Kennzeichen'));
    lege('Falsch.md', workflowText('workflow: false\nname: Falsch'));
    lege('Notiz.md', '# Nur eine Notiz\n');
    lege('Bild.txt', workflowText('workflow: true\nname: Keine Markdown-Datei'));
    const liste = await readWorkflowFolder(tmpDir);
    expect(liste.missing).toBe(false);
    expect(liste.workflows.map((w) => w.name)).toEqual(['Als Text', 'Mit Kennzeichen']);
  });

  it('sortiert alphabetisch nach Name, nicht nach Datei-Name, und zählt Ziffern als Zahl', async () => {
    lege('a.md', workflowText('workflow: true\nname: Wochenrückblick anlegen'));
    lege('b.md', workflowText('workflow: true\nname: Posteingang leeren'));
    lege('c.md', workflowText('workflow: true\nname: Schritt 10'));
    lege('d.md', workflowText('workflow: true\nname: Schritt 2'));
    lege('e.md', workflowText('workflow: true\nname: ärger melden'));
    const liste = await readWorkflowFolder(tmpDir);
    expect(liste.items.map((w) => w.name)).toEqual([
      'ärger melden',
      'Posteingang leeren',
      'Schritt 2',
      'Schritt 10',
      'Wochenrückblick anlegen',
    ]);
  });

  it('nimmt ohne Namen im Dateikopf den Datei-Namen und trägt Beschreibung und Pfade', async () => {
    const abs = lege(
      'Tagesnotiz anlegen.md',
      workflowText('workflow: true\ndescription: Legt die Notiz an'),
    );
    const [eintrag] = (await readWorkflowFolder(tmpDir)).workflows;
    expect(eintrag).toEqual({
      kind: 'workflow',
      name: 'Tagesnotiz anlegen',
      description: 'Legt die Notiz an',
      relPath: 'Tagesnotiz anlegen.md',
      absPath: abs,
    });
  });

  it('bildet Unterordner als Gruppen hinter den Workflows ihrer Ebene ab', async () => {
    lege('Wochenrückblick.md', workflowText('workflow: true\nname: Wochenrückblick anlegen'));
    lege('Projekt/Abschluss.md', workflowText('workflow: true\nname: Projekt abschließen'));
    lege('Projekt/Anlage.md', workflowText('workflow: true\nname: Projekt anlegen'));
    lege('Projekt/Tief/Archiv.md', workflowText('workflow: true\nname: Archivieren'));
    lege('Ablage/Eins.md', workflowText('workflow: true\nname: Eins'));
    const liste = await readWorkflowFolder(tmpDir);
    expect(liste.items.map((e) => [e.kind, e.name])).toEqual([
      ['workflow', 'Wochenrückblick anlegen'],
      ['group', 'Ablage'],
      ['group', 'Projekt'],
    ]);
    const projekt = liste.items[2];
    expect(projekt.relPath).toBe('Projekt');
    expect(projekt.items.map((e) => [e.kind, e.name, e.relPath])).toEqual([
      ['workflow', 'Projekt abschließen', 'Projekt/Abschluss.md'],
      ['workflow', 'Projekt anlegen', 'Projekt/Anlage.md'],
      ['group', 'Tief', 'Projekt/Tief'],
    ]);
    // Flach in Anzeige-Reihenfolge, wie die Kommandos sie brauchen.
    expect(liste.workflows.map((w) => w.relPath)).toEqual([
      'Wochenrückblick.md',
      'Ablage/Eins.md',
      'Projekt/Abschluss.md',
      'Projekt/Anlage.md',
      'Projekt/Tief/Archiv.md',
    ]);
  });

  it('lässt Unterordner ohne Workflow weg, ebenso node_modules und Punkt-Einträge', async () => {
    lege('Leer/Notiz.md', '# Notiz\n');
    fs.mkdirSync(path.join(tmpDir, 'Ganz leer'));
    lege('node_modules/x.md', workflowText('workflow: true\nname: Paket'));
    lege('.versteckt/x.md', workflowText('workflow: true\nname: Versteckt'));
    lege('.Punkt.md', workflowText('workflow: true\nname: Punkt-Datei'));
    lege('Da.md', workflowText('workflow: true\nname: Da'));
    const liste = await readWorkflowFolder(tmpDir);
    expect(liste.items.map((e) => e.name)).toEqual(['Da']);
  });

  it('übergeht eine Datei über der Größen-Grenze', async () => {
    lege('Gross.md', workflowText('workflow: true\nname: Groß') + 'x'.repeat(200));
    lege('Klein.md', workflowText('workflow: true\nname: Klein'));
    const liste = await readWorkflowFolder(tmpDir, { maxBytes: 120 });
    expect(liste.workflows.map((w) => w.name)).toEqual(['Klein']);
  });

  it('meldet einen festgelegten, aber fehlenden Ordner und liefert ohne Ordner eine leere Liste', async () => {
    expect(await readWorkflowFolder(path.join(tmpDir, 'gibt-es-nicht'))).toEqual({
      missing: true,
      items: [],
      workflows: [],
    });
    expect(await readWorkflowFolder(null)).toEqual({ missing: false, items: [], workflows: [] });
  });

  it('liefert für einen leeren Ordner eine leere Liste ohne Fehl-Meldung', async () => {
    expect(await readWorkflowFolder(tmpDir)).toEqual({ missing: false, items: [], workflows: [] });
  });
});
