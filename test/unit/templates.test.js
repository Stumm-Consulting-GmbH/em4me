// 4T-000424 (Epic 3E-000080): Unit-Tests der Vorlagen-Quellen — Auflösungs-
// Reihenfolge (Bereich vor global, vollständige Übersteuerung, Leer-Fälle),
// Konfigurations-Normalisierung, Pfad-Sicherung der Lese-Zugriffe und
// Anzeige-Einträge der Auswahl-Liste.
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
  findTemplateSource,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
} from '../../src/main/documents/templates.js';

// 4T-001250 (Epic 3E-000124): Wirts-gerechter Pfad aus der gewachsenen
// Windows-Schreibweise. Die Faelle dieser Datei pruefen Fach-Logik und NICHT
// die Windows-Pfad-Syntax; mit fest verdrahteten Laufwerksbuchstaben liefen
// sie trotzdem nur unter Windows, weil path.resolve 'C:\...' auf anderen
// Plattformen als RELATIVEN Pfad liest und das Arbeitsverzeichnis davorsetzt.
//
// Der Laufwerksbuchstabe wird zum ERSTEN Pfad-Segment und nicht etwa
// weggelassen: Sonst faenden 'C:\Daten' und 'D:\Daten' auf der Zielplattform
// zusammen, und gerade die Faelle, die verschiedene Laufwerke auseinander
// halten sollen, schluegen ins Gegenteil um (belegt am 2026-08-28).
// Klein geschrieben, damit zwei Schreibweisen desselben Laufwerks dasselbe
// Segment ergeben und die Schreibweisen-Faelle weiter greifen.
//
// Unter Windows ist der Umrechner die Identitaet, die Haupt-Plattform prueft
// also unveraendert weiter.
const P = (w) =>
  process.platform === 'win32'
    ? w
    : `/${w[0].toLowerCase()}/${w.slice(3)}`.split('\\').join('/').replace(/\/+/g, '/');

const AREA = P('C:\\Notizen');

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
      globalConfig: { folder: P('C:\\Global\\Templates') },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.folder).toBe(P('C:\\Notizen\\Vorlagen'));
    expect(resolved.baseDir).toBe(P('C:\\Notizen'));
    // 4T-001456: ohne Verknuepfungen ist die Kette die eigene Quelle allein.
    expect(resolved.sources).toEqual([
      { key: '', folder: P('C:\\Notizen\\Vorlagen'), prefix: null, name: null },
    ]);
  });

  it('toleriert absolute Bereichs-Ordner', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: P('D:\\Anderswo\\Vorlagen') },
      globalConfig: null,
    });
    expect(resolved.folder).toBe(P('D:\\Anderswo\\Vorlagen'));
    // 4T-001456: der absolute Ordner ist auch als Ketten-Glied der eigene.
    expect(resolved.sources.map((q) => q.folder)).toEqual([P('D:\\Anderswo\\Vorlagen')]);
  });

  it('Bereichs-Sektion übersteuert vollständig: globale Regeln zählen nicht mit', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: 'Vorlagen' },
      globalConfig: {
        folder: P('C:\\Global\\Templates'),
        rules: [{ folder: P('C:\\Global\\GTD'), template: 'GTD.md' }],
      },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.rules).toEqual([]);
    // 4T-001456: die Uebersteuerung bleibt — der globale Ordner ist auch kein
    // Ketten-Glied. Die Kette entsteht aus Verknuepfungen, nicht aus der
    // globalen Konfiguration.
    expect(resolved.sources).toHaveLength(1);
    expect(resolved.sources[0].folder).toBe(P('C:\\Notizen\\Vorlagen'));
  });

  it('ohne Bereichs-Sektion greift die globale Konfiguration', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: undefined,
      globalConfig: { folder: P('C:\\Global\\Templates') },
    });
    expect(resolved.source).toBe('global');
    expect(resolved.folder).toBe(P('C:\\Global\\Templates'));
    expect(resolved.baseDir).toBeNull();
    // 4T-001456: auch die globale Quelle steht als Kette da, damit die
    // Aufrufer keinen Sonderfall fuehren muessen.
    expect(resolved.sources).toEqual([
      { key: '', folder: P('C:\\Global\\Templates'), prefix: null, name: null },
    ]);
  });

  it('ohne Bereich zählt nur die globale Konfiguration', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: null,
      areaConfig: undefined,
      globalConfig: { folder: P('C:\\Global\\Templates') },
    });
    expect(resolved.source).toBe('global');
    // 4T-001456: ohne Bereich gibt es keine Verknuepfungen — die Kette ist die
    // globale Quelle allein, selbst wenn linkedSources uebergeben wuerde.
    expect(resolved.sources).toHaveLength(1);
  });

  it('beide leer: source none ohne Ordner', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: null,
      areaConfig: undefined,
      globalConfig: undefined,
    });
    expect(resolved).toEqual({
      source: 'none',
      folder: null,
      rules: [],
      baseDir: null,
      // 4T-001456: nichts konfiguriert heisst auch keine Kette.
      sources: [],
    });
  });

  it('Bereichs-Sektion nur mit Regeln: source area, Ordner bleibt null', () => {
    const resolved = resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { rules: [{ folder: 'GTD', template: 'GTD.md' }] },
      globalConfig: { folder: P('C:\\Global\\Templates') },
    });
    expect(resolved.source).toBe('area');
    expect(resolved.folder).toBeNull();
    expect(resolved.rules).toEqual([{ folder: 'GTD', template: 'GTD.md' }]);
    // 4T-001456: ohne eigenen Ordner bleibt die Kette leer — ein Ketten-Glied
    // ohne Ordner waere fuer jeden Aufrufer nur eine Fallunterscheidung mehr.
    expect(resolved.sources).toEqual([]);
  });
});

describe('resolveTemplateFile — Pfad-Sicherung', () => {
  const FOLDER = P('C:\\Notizen\\Vorlagen');

  it('löst relative Einträge innerhalb des Ordners auf (auch Unterordner)', () => {
    expect(resolveTemplateFile(FOLDER, 'Besprechung.md')).toBe(
      P('C:\\Notizen\\Vorlagen\\Besprechung.md'),
    );
    expect(resolveTemplateFile(FOLDER, 'GTD/Projekt.md')).toBe(
      P('C:\\Notizen\\Vorlagen\\GTD\\Projekt.md'),
    );
  });

  it('weist Ausbrüche und ungültige Eingaben zurück', () => {
    // 4T-001250: Der Rueckwaerts-Schraegstrich ist NUR unter Windows ein Trenner;
    // anderswo ist «..\Geheim.md» ein gewoehnlicher Dateiname und kein Ausbruch.
    // Der Ausbruch in der Schreibweise des Wirts steht in der naechsten Zeile und
    // wird ueberall geprueft.
    if (process.platform === 'win32') {
      expect(resolveTemplateFile(FOLDER, '..\\Geheim.md')).toBeNull();
    }
    expect(resolveTemplateFile(FOLDER, '../Geheim.md')).toBeNull();
    expect(resolveTemplateFile(FOLDER, 'GTD/../../Geheim.md')).toBeNull();
    expect(resolveTemplateFile(FOLDER, P('C:\\Windows\\win.ini'))).toBeNull();
    expect(resolveTemplateFile(FOLDER, '')).toBeNull();
    expect(resolveTemplateFile(FOLDER, '.')).toBeNull(); // der Ordner selbst
    expect(resolveTemplateFile(null, 'A.md')).toBeNull();
  });

  it('Präfix-Nachbarn matchen nicht', () => {
    // 4T-001250: Rueckwaerts-Schraegstrich als Trenner gibt es nur unter Windows;
    // anderswo ist das ein Dateiname. Der Praefix-Nachbar in Wirts-Schreibweise
    // ist durch den Ausbruch-Fall weiter oben abgedeckt.
    if (process.platform === 'win32') {
      expect(resolveTemplateFile(FOLDER, '..\\Vorlagen2\\A.md')).toBeNull();
    }
  });
});

// 4T-000427 (Epic 3E-000080): Tiefster-Treffer-Auflösung der Ordner-Regeln.
describe('matchFolderRule — Tiefster-Treffer-Auflösung', () => {
  const BASE = P('C:\\Notizen');
  const RULES = [
    { folder: '', template: 'Standard.md' },
    { folder: 'GTD', template: 'GTD.md' },
    // 4T-001250: Der Trenner der Ordner-Regel ist der des Wirts; als fester
    // Rueckwaerts-Schraegstrich waere die Regel anderswo ein Ordnername mit
    // Sonderzeichen und traefe nie.
    {
      folder: ['GTD', 'Projekte'].join(process.platform === 'win32' ? '\\' : '/'),
      template: 'Projekt.md',
    },
  ];

  it('tiefster passender Ordner gewinnt, Unterordner zählen zum Treffer', () => {
    const args = { rules: RULES, baseDir: BASE, templatesFolder: P('C:\\Notizen\\Vorlagen') };
    expect(matchFolderRule({ ...args, filePath: P('C:\\Notizen\\Notiz.md') })).toBe('Standard.md');
    expect(matchFolderRule({ ...args, filePath: P('C:\\Notizen\\GTD\\Task.md') })).toBe('GTD.md');
    expect(matchFolderRule({ ...args, filePath: P('C:\\Notizen\\GTD\\Projekte\\P1.md') })).toBe(
      'Projekt.md',
    );
    expect(
      matchFolderRule({ ...args, filePath: P('C:\\Notizen\\GTD\\Projekte\\Sub\\P2.md') }),
    ).toBe('Projekt.md');
  });

  it('Vorlagen-Ordner ist grundsätzlich ausgenommen', () => {
    expect(
      matchFolderRule({
        rules: RULES,
        baseDir: BASE,
        templatesFolder: P('C:\\Notizen\\Vorlagen'),
        filePath: P('C:\\Notizen\\Vorlagen\\Neu.md'),
      }),
    ).toBeNull();
  });

  it('ohne Treffer und ohne Regeln: null; Präfix-Nachbarn matchen nicht', () => {
    expect(
      matchFolderRule({ rules: RULES, baseDir: BASE, filePath: P('D:\\Anderswo\\Notiz.md') }),
    ).toBeNull();
    expect(
      matchFolderRule({ rules: [], baseDir: BASE, filePath: P('C:\\Notizen\\N.md') }),
    ).toBeNull();
    expect(
      matchFolderRule({
        rules: [{ folder: 'GTD', template: 'GTD.md' }],
        baseDir: BASE,
        filePath: P('C:\\Notizen\\GTD2\\N.md'),
      }),
    ).toBeNull();
  });

  it('globale Regeln (ohne baseDir) zählen nur mit absoluten Ordnern', () => {
    const rules = [
      { folder: P('C:\\Global\\Notizen'), template: 'Global.md' },
      { folder: 'relativ', template: 'Kaputt.md' },
    ];
    expect(
      matchFolderRule({ rules, baseDir: null, filePath: P('C:\\Global\\Notizen\\Neu.md') }),
    ).toBe('Global.md');
    expect(
      matchFolderRule({ rules, baseDir: null, filePath: P('C:\\relativ\\Neu.md') }),
    ).toBeNull();
  });

  it('defekte Regel-Einträge werden übersprungen', () => {
    const rules = [null, { folder: 'GTD' }, { folder: 'GTD', template: 'GTD.md' }];
    expect(matchFolderRule({ rules, baseDir: BASE, filePath: P('C:\\Notizen\\GTD\\N.md') })).toBe(
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
describe('Quellen-Kette der Vorlagen (4T-001456, Architekturentscheidung 4)', () => {
  const ZENTRAL = P('C:\\Zentral\\Vorlagen');
  const ARCHIV = P('D:\\Archiv\\Muster');

  function mitKette(linkedSources) {
    return resolveTemplatesConfig({
      areaRootPath: AREA,
      areaConfig: { folder: 'Vorlagen' },
      globalConfig: { folder: P('C:\\Global\\Templates') },
      linkedSources,
    });
  }

  it('reiht den eigenen Ordner zuerst, danach die Verknuepfungen in ihrer Reihenfolge (AK7)', () => {
    const resolved = mitKette([
      { prefix: 'zt', folder: ZENTRAL, name: 'Zentral' },
      { prefix: 'ar', folder: ARCHIV, name: 'Archiv' },
    ]);
    expect(resolved.sources.map((q) => q.key)).toEqual(['', 'zt', 'ar']);
    expect(resolved.sources.map((q) => q.folder)).toEqual([
      P('C:\\Notizen\\Vorlagen'),
      ZENTRAL,
      ARCHIV,
    ]);
    // Der eigene Ordner bleibt daneben als 'folder' stehen: Die Ordner-Regeln
    // gehoeren dem eigenen Bereich, ein verknuepfter steuert nur Vorlagen bei.
    expect(resolved.folder).toBe(P('C:\\Notizen\\Vorlagen'));
    expect(resolved.baseDir).toBe(P('C:\\Notizen'));
  });

  it('laesst eine Verknuepfung ohne Ordner und ohne Kuerzel weg', () => {
    const resolved = mitKette([
      { prefix: 'zt', folder: ZENTRAL, name: 'Zentral' },
      { prefix: 'leer', folder: '' },
      { prefix: '', folder: ARCHIV },
      null,
    ]);
    expect(resolved.sources.map((q) => q.key)).toEqual(['', 'zt']);
  });

  it('traegt Kuerzel und Namen je Quelle mit', () => {
    const resolved = mitKette([{ prefix: 'zt', folder: ZENTRAL, name: 'Zentral' }]);
    expect(resolved.sources[1]).toEqual({
      key: 'zt',
      folder: ZENTRAL,
      prefix: 'zt',
      name: 'Zentral',
    });
    // Die eigene Quelle traegt kein Kuerzel — daran erkennt die Oberflaeche,
    // dass sie keine Herkunfts-Marke setzen soll.
    expect(resolved.sources[0].prefix).toBeNull();
  });
});

describe('findTemplateSource — Zugriff auf ein Ketten-Glied (4T-001456)', () => {
  const kette = [
    { key: '', folder: P('C:\\Notizen\\Vorlagen'), prefix: null, name: null },
    { key: 'zt', folder: P('C:\\Zentral\\Vorlagen'), prefix: 'zt', name: 'Zentral' },
  ];

  it('findet die Quelle an ihrem Schluessel', () => {
    expect(findTemplateSource(kette, 'zt').folder).toBe(P('C:\\Zentral\\Vorlagen'));
  });

  it('faellt ohne Schluessel auf die erste Quelle zurueck', () => {
    // Das ist zugleich die Rangfolge bei Namensgleichheit und der Rueckfall
    // fuer eine Ordner-Regel ohne Qualifizierung.
    for (const key of [undefined, null, '']) {
      expect(findTemplateSource(kette, key).key).toBe('');
    }
  });

  it('liefert null fuer eine unbekannte oder leere Kette', () => {
    expect(findTemplateSource(kette, 'weg')).toBeNull();
    expect(findTemplateSource([], 'zt')).toBeNull();
    expect(findTemplateSource(null, 'zt')).toBeNull();
  });
});

describe('Einschliessung je Quelle (4T-001456, AK3)', () => {
  const kette = [
    { key: '', folder: P('C:\\Notizen\\Vorlagen'), prefix: null, name: null },
    { key: 'zt', folder: P('C:\\Zentral\\Vorlagen'), prefix: 'zt', name: 'Zentral' },
  ];

  it('schliesst in die BENANNTE Quelle ein, nicht in irgendeine der Kette', () => {
    const zentral = findTemplateSource(kette, 'zt');
    expect(resolveTemplateFile(zentral.folder, 'Muster.md')).toBe(
      P('C:\\Zentral\\Vorlagen\\Muster.md'),
    );
    // Ein Ausbruch nach oben bleibt verwehrt — je Quelle, wie zuvor fuer den
    // einen Ordner. Der Trenner kommt aus path.join und nicht als literaler
    // Backslash: Unter Linux ist ein Backslash KEIN Pfad-Trenner, der
    // Ausdruck war dort ein gewoehnlicher Dateiname im Ordner, und der Fall
    // prueft so das Gegenteil seiner Absicht (belegt im Linux-Lauf zu 1.130.0).
    expect(resolveTemplateFile(zentral.folder, path.join('..', 'geheim.md'))).toBeNull();
    // Und der Ordner der ANDEREN Quelle ist von hier aus nicht erreichbar,
    // obwohl er in derselben Kette steht.
    expect(resolveTemplateFile(zentral.folder, P('C:\\Notizen\\Vorlagen\\X.md'))).toBeNull();
  });
});
