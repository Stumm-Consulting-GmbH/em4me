// 4T-0424 (Epic 3E-0080): Unit-Tests der Vorlagen-Quellen — Auflösungs-
// Reihenfolge (Bereich vor global, vollständige Übersteuerung, Leer-Fälle),
// Konfigurations-Normalisierung, Pfad-Sicherung der Lese-Zugriffe und
// Anzeige-Einträge der Auswahl-Liste.
import { describe, it, expect } from 'vitest';
import {
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
} from '../../src/main/documents/templates.js';

const AREA = 'C:\\Notizen';

describe('normalizeTemplatesConfig', () => {
  it('liefert null für fehlende, leere oder defekte Konfigurationen', () => {
    expect(normalizeTemplatesConfig(undefined)).toBeNull();
    expect(normalizeTemplatesConfig(null)).toBeNull();
    expect(normalizeTemplatesConfig('Vorlagen')).toBeNull();
    expect(normalizeTemplatesConfig([])).toBeNull();
    expect(normalizeTemplatesConfig({})).toBeNull();
    expect(normalizeTemplatesConfig({ folder: '   ' })).toBeNull();
  });

  it('normalisiert Ordner und Regeln, defekte Regel-Einträge entfallen', () => {
    const config = normalizeTemplatesConfig({
      folder: ' Vorlagen ',
      rules: [
        { folder: 'GTD', template: 'GTD.md' },
        { folder: '', template: 'Standard.md' }, // Wurzel-Regel bleibt
        { folder: 'Kaputt' }, // ohne Vorlage: entfällt
        'kein-objekt',
        null,
      ],
    });
    expect(config).toEqual({
      folder: 'Vorlagen',
      rules: [
        { folder: 'GTD', template: 'GTD.md' },
        { folder: '', template: 'Standard.md' },
      ],
    });
  });

  it('akzeptiert eine Konfiguration mit Regeln ohne Ordner', () => {
    const config = normalizeTemplatesConfig({ rules: [{ folder: 'A', template: 'B.md' }] });
    expect(config).toEqual({ folder: null, rules: [{ folder: 'A', template: 'B.md' }] });
  });
});

describe('resolveTemplatesConfig — Auflösungs-Reihenfolge', () => {
  it('Bereichs-Konfiguration schlägt global (relativer Bereichs-Ordner)', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: 'Vorlagen' },
      globalConfig: { folder: 'C:\\Global\\Templates' },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.folder).toBe('C:\\Notizen\\Vorlagen');
    expect(resolved.baseDir).toBe('C:\\Notizen');
  });

  it('toleriert absolute Bereichs-Ordner', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: 'D:\\Anderswo\\Vorlagen' },
      globalConfig: null,
    });
    expect(resolved.folder).toBe('D:\\Anderswo\\Vorlagen');
  });

  it('Bereichs-Sektion übersteuert vollständig: globale Regeln zählen nicht mit', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: 'Vorlagen' },
      globalConfig: {
        folder: 'C:\\Global\\Templates',
        rules: [{ folder: 'C:\\Global\\GTD', template: 'GTD.md' }],
      },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.rules).toEqual([]);
  });

  it('ohne Bereichs-Sektion greift die globale Konfiguration', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: undefined,
      globalConfig: { folder: 'C:\\Global\\Templates' },
    });
    expect(resolved.source).toBe('global');
    expect(resolved.folder).toBe('C:\\Global\\Templates');
    expect(resolved.baseDir).toBeNull();
  });

  it('ohne Bereich zählt nur die globale Konfiguration', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: null,
      areaConfig: undefined,
      globalConfig: { folder: 'C:\\Global\\Templates' },
    });
    expect(resolved.source).toBe('global');
  });

  it('beide leer: source none ohne Ordner', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: null,
      areaConfig: undefined,
      globalConfig: undefined,
    });
    expect(resolved).toEqual({ source: 'none', folder: null, rules: [], baseDir: null });
  });

  it('Bereichs-Sektion nur mit Regeln: source area, Ordner bleibt null', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { rules: [{ folder: 'GTD', template: 'GTD.md' }] },
      globalConfig: { folder: 'C:\\Global\\Templates' },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.folder).toBeNull();
    expect(resolved.rules).toEqual([{ folder: 'GTD', template: 'GTD.md' }]);
  });
});

describe('resolveTemplateFile — Pfad-Sicherung', () => {
  const FOLDER = 'C:\\Notizen\\Vorlagen';

  it('löst relative Einträge innerhalb des Ordners auf (auch Unterordner)', () => {
    expect(resolveTemplateFile(FOLDER, 'Besprechung.md')).toBe(
      'C:\\Notizen\\Vorlagen\\Besprechung.md',
    );
    expect(resolveTemplateFile(FOLDER, 'GTD/Projekt.md')).toBe(
      'C:\\Notizen\\Vorlagen\\GTD\\Projekt.md',
    );
  });

  it('weist Ausbrüche und ungültige Eingaben zurück', () => {
    expect(resolveTemplateFile(FOLDER, '..\\Geheim.md')).toBeNull();
    expect(resolveTemplateFile(FOLDER, '../Geheim.md')).toBeNull();
    expect(resolveTemplateFile(FOLDER, 'GTD/../../Geheim.md')).toBeNull();
    expect(resolveTemplateFile(FOLDER, 'C:\\Windows\\win.ini')).toBeNull();
    expect(resolveTemplateFile(FOLDER, '')).toBeNull();
    expect(resolveTemplateFile(FOLDER, '.')).toBeNull(); // der Ordner selbst
    expect(resolveTemplateFile(null, 'A.md')).toBeNull();
  });

  it('Präfix-Nachbarn matchen nicht', () => {
    expect(resolveTemplateFile(FOLDER, '..\\Vorlagen2\\A.md')).toBeNull();
  });
});

// 4T-0427 (Epic 3E-0080): Tiefster-Treffer-Auflösung der Ordner-Regeln.
describe('matchFolderRule — Tiefster-Treffer-Auflösung', () => {
  const BASE = 'C:\\Notizen';
  const RULES = [
    { folder: '', template: 'Standard.md' },
    { folder: 'GTD', template: 'GTD.md' },
    { folder: 'GTD\\Projekte', template: 'Projekt.md' },
  ];

  it('tiefster passender Ordner gewinnt, Unterordner zählen zum Treffer', () => {
    const args = { rules: RULES, baseDir: BASE, templatesFolder: 'C:\\Notizen\\Vorlagen' };
    expect(matchFolderRule({ ...args, filePath: 'C:\\Notizen\\Notiz.md' })).toBe('Standard.md');
    expect(matchFolderRule({ ...args, filePath: 'C:\\Notizen\\GTD\\Task.md' })).toBe('GTD.md');
    expect(matchFolderRule({ ...args, filePath: 'C:\\Notizen\\GTD\\Projekte\\P1.md' })).toBe(
      'Projekt.md',
    );
    expect(matchFolderRule({ ...args, filePath: 'C:\\Notizen\\GTD\\Projekte\\Sub\\P2.md' })).toBe(
      'Projekt.md',
    );
  });

  it('Vorlagen-Ordner ist grundsätzlich ausgenommen', () => {
    expect(
      matchFolderRule({
        rules: RULES,
        baseDir: BASE,
        templatesFolder: 'C:\\Notizen\\Vorlagen',
        filePath: 'C:\\Notizen\\Vorlagen\\Neu.md',
      }),
    ).toBeNull();
  });

  it('ohne Treffer und ohne Regeln: null; Präfix-Nachbarn matchen nicht', () => {
    expect(
      matchFolderRule({ rules: RULES, baseDir: BASE, filePath: 'D:\\Anderswo\\Notiz.md' }),
    ).toBeNull();
    expect(matchFolderRule({ rules: [], baseDir: BASE, filePath: 'C:\\Notizen\\N.md' })).toBeNull();
    expect(
      matchFolderRule({
        rules: [{ folder: 'GTD', template: 'GTD.md' }],
        baseDir: BASE,
        filePath: 'C:\\Notizen\\GTD2\\N.md',
      }),
    ).toBeNull();
  });

  it('globale Regeln (ohne baseDir) zählen nur mit absoluten Ordnern', () => {
    const rules = [
      { folder: 'C:\\Global\\Notizen', template: 'Global.md' },
      { folder: 'relativ', template: 'Kaputt.md' },
    ];
    expect(matchFolderRule({ rules, baseDir: null, filePath: 'C:\\Global\\Notizen\\Neu.md' })).toBe(
      'Global.md',
    );
    expect(matchFolderRule({ rules, baseDir: null, filePath: 'C:\\relativ\\Neu.md' })).toBeNull();
  });

  it('defekte Regel-Einträge werden übersprungen', () => {
    const rules = [null, { folder: 'GTD' }, { folder: 'GTD', template: 'GTD.md' }];
    expect(matchFolderRule({ rules, baseDir: BASE, filePath: 'C:\\Notizen\\GTD\\N.md' })).toBe(
      'GTD.md',
    );
  });
});

describe('templateEntryFromRelPath und sortedTemplateEntries', () => {
  it('baut logischen Namen (U+2215 → /) und Gruppe aus dem relativen Pfad', () => {
    expect(templateEntryFromRelPath('Besprechung.md')).toEqual({
      relPath: 'Besprechung.md',
      group: '',
      name: 'Besprechung',
    });
    expect(templateEntryFromRelPath('GTD\\Projekt∕Aufgabe.md')).toEqual({
      relPath: 'GTD/Projekt∕Aufgabe.md',
      group: 'GTD',
      name: 'Projekt/Aufgabe',
    });
    expect(templateEntryFromRelPath('A/B/Notiz.markdown')).toEqual({
      relPath: 'A/B/Notiz.markdown',
      group: 'A/B',
      name: 'Notiz',
    });
  });

  it('sortiert Wurzel-Einträge zuerst, dann Gruppen, innerhalb nach Name', () => {
    const sorted = sortedTemplateEntries([
      { relPath: 'Z/b.md', group: 'Z', name: 'b' },
      { relPath: 'a10.md', group: '', name: 'a10' },
      { relPath: 'A/z.md', group: 'A', name: 'z' },
      { relPath: 'a2.md', group: '', name: 'a2' },
      { relPath: 'A/a.md', group: 'A', name: 'a' },
    ]);
    expect(sorted.map((e) => e.relPath)).toEqual(['a2.md', 'a10.md', 'A/a.md', 'A/z.md', 'Z/b.md']);
  });
});
