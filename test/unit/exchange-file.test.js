// 4T-001586 (Story 4S-000904, Epic 3E-000160): Prüffälle des Austausch-Formats.
//
// Geprüft wird das Format als Zusicherung nach außen: der Rundlauf über alle
// vorgesehenen Datenarten, der Aufbau der erzeugten Datei, das Überleben
// unbekannter Abschnitte und die benannten Fehler-Meldungen. Das Modul ist
// prozessneutral, deshalb braucht kein Fall eine Umgebung.
//
// ESM-Syntax (Vitest 4 ist ESM-only); das CJS-Modul wird über den Vite-Interop
// mit Named-Exports importiert.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MARKER_KEY,
  FORMAT_VERSION,
  writeExchangeFile,
  readExchangeFile,
} from '../../src/shared/exchange-file.js';

// Die Datenarten aus der Erhebung der Konzept-Stufe (4T-001567, Kapitel «Umfang
// der Datenarten»), mit ihren tatsächlichen Schlüsseln — inklusive der
// Punkt-Schlüssel, an denen ein zu enges Namens-Muster scheitern würde.
const DATENARTEN = [
  { name: 'colorSchemes', value: [{ id: 'nacht', name: 'Nacht', farben: { bg: '#101014' } }] },
  { name: 'hotkeys', value: { 'file.save': 'Ctrl+S', 'view.toggleSidebar': 'Ctrl+B' } },
  { name: 'formatToolbar', value: ['bold', 'italic', 'code', 'link'] },
  { name: 'commandPlacement', value: { statusbar: ['cmd.journal'], makros: [] } },
  { name: 'extensions.disabled', value: ['mermaid', 'mindmap'] },
  { name: 'extensionsExternal.enabled', value: ['beispiel-erweiterung'] },
  { name: 'sidebar.layout', value: { links: ['outline'], rechts: ['backlinks'] } },
  { name: 'panelToggle.order', value: ['outline', 'search', 'backlinks'] },
  { name: 'sidebar.layoutVariants', value: {} },
  { name: 'templates.folder', value: 'Vorlagen' },
  { name: 'templates.rules', value: [{ muster: '*.md', vorlage: 'Notiz.md' }] },
  { name: 'bookmarksTree', value: { kinder: [{ titel: 'Größen & Maße', ziel: 'a/b.md' }] } },
  { name: 'calendarSystems', value: [{ id: 'fiskal', monate: 12, start: '04-01' }] },
];

const KOPF = {
  kind: 'settings',
  created: '2026-09-08T10:43:12Z',
  origin: { program: 'EM4me', version: '1.130.0' },
};

function schreibeBeispiel(sections = DATENARTEN) {
  const ergebnis = writeExchangeFile({ ...KOPF, sections });
  expect(ergebnis.ok).toBe(true);
  return ergebnis.text;
}

describe('exchange-file.js — Rundlauf (AK1, AK4)', () => {
  it('gibt jede vorgesehene Datenart unverändert zurück', () => {
    const gelesen = readExchangeFile(schreibeBeispiel());
    expect(gelesen.ok).toBe(true);
    expect(gelesen.sections).toEqual(DATENARTEN.map(({ name, value }) => ({ name, value })));
  });

  it('erhält die Reihenfolge der Abschnitte', () => {
    const gelesen = readExchangeFile(schreibeBeispiel());
    expect(gelesen.sections.map((s) => s.name)).toEqual(DATENARTEN.map((d) => d.name));
  });

  it('trägt die Kopfdaten unverändert zurück', () => {
    const gelesen = readExchangeFile(schreibeBeispiel());
    expect(gelesen.kind).toBe('settings');
    expect(gelesen.formatVersion).toBe(FORMAT_VERSION);
    expect(gelesen.created).toBe('2026-09-08T10:43:12Z');
    // Die Fassung bleibt Zeichenkette: ohne erzwungene Anführungszeichen käme
    // eine zweistellige Fassung wie "1.130" als Zahl zurück.
    expect(gelesen.origin).toEqual({ program: 'EM4me', version: '1.130.0' });
  });

  it('übersteht Werte, die den Zaun oder das Frontmatter nachahmen', () => {
    const heikel = [
      { name: 'tricky', value: { code: '```json', strich: '---', zitat: 'er sagte "ja"' } },
      { name: 'unicode', value: { text: 'Grüße — 日本語   ende' } },
    ];
    const gelesen = readExchangeFile(schreibeBeispiel(heikel));
    expect(gelesen.ok).toBe(true);
    expect(gelesen.sections).toEqual(heikel);
  });

  it('liest auch nach einem Umbruch-Wechsel auf CRLF', () => {
    const gelesen = readExchangeFile(schreibeBeispiel().replace(/\n/g, '\r\n'));
    expect(gelesen.ok).toBe(true);
    expect(gelesen.sections).toHaveLength(DATENARTEN.length);
  });
});

describe('exchange-file.js — Aufbau der Datei (AK2, AK3, AK8)', () => {
  const text = schreibeBeispiel();

  it('beginnt mit Frontmatter aus Kennung, Fassung, Zeitpunkt und Herkunft', () => {
    expect(text.startsWith('---\n')).toBe(true);
    const frontmatter = text.slice(4, text.indexOf('\n---\n', 4));
    expect(frontmatter).toContain(`${MARKER_KEY}: "settings"`);
    expect(frontmatter).toContain(`formatVersion: ${FORMAT_VERSION}`);
    expect(frontmatter).toContain('created: "2026-09-08T10:43:12Z"');
    expect(frontmatter).toContain('program: "EM4me"');
    expect(frontmatter).toContain('version: "1.130.0"');
  });

  it('erzeugt je Datenart genau einen Fence-Block mit erkennbarem Namen', () => {
    for (const { name } of DATENARTEN) {
      const treffer = text.match(
        new RegExp(`^\`\`\`json em4me:${name.replace('.', '\\.')}$`, 'gm'),
      );
      expect(treffer, `Fence-Block für ${name}`).toHaveLength(1);
    }
  });

  it('stellt jedem Block eine Überschrift voran, damit die gerenderte Ansicht ihn benennt', () => {
    expect(text).toContain('## colorSchemes\n');
    const eigenerTitel = writeExchangeFile({
      ...KOPF,
      sections: [{ name: 'colorSchemes', title: 'Farbschemas', value: [] }],
    });
    expect(eigenerTitel.text).toContain('## Farbschemas\n');
  });

  it('lässt die Überschrift beim Lesen unbeachtet — den Namen trägt der Info-String', () => {
    const verfaelscht = schreibeBeispiel().replace('## colorSchemes', '## Etwas ganz anderes');
    const gelesen = readExchangeFile(verfaelscht);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.sections[0].name).toBe('colorSchemes');
  });

  it('weicht auf einen längeren Zaun aus, wenn der Inhalt selbst einen trägt', () => {
    // JSON kann das nicht erzeugen (Umbrüche in Zeichenketten sind escaped);
    // der Fall sichert das Modell für später nicht-JSON-artige Inhalte.
    const geschrieben = writeExchangeFile({
      ...KOPF,
      sections: [{ name: 'roh', value: '```' }],
    });
    expect(geschrieben.ok).toBe(true);
    expect(readExchangeFile(geschrieben.text).sections[0].value).toBe('```');
  });
});

describe('exchange-file.js — unbekannte Abschnitte (AK5)', () => {
  const text = schreibeBeispiel([
    { name: 'colorSchemes', value: [] },
    { name: 'erfundeneDatenart', value: { a: 1 } },
  ]);

  it('meldet den unbekannten Namen', () => {
    const gelesen = readExchangeFile(text, { knownSections: ['colorSchemes'] });
    expect(gelesen.ok).toBe(true);
    expect(gelesen.unknownSections).toEqual(['erfundeneDatenart']);
  });

  it('verliert den unbekannten Abschnitt nicht', () => {
    const gelesen = readExchangeFile(text, { knownSections: ['colorSchemes'] });
    expect(gelesen.sections).toEqual([
      { name: 'colorSchemes', value: [] },
      { name: 'erfundeneDatenart', value: { a: 1 } },
    ]);
  });

  it('meldet ohne Angabe bekannter Namen nichts als unbekannt', () => {
    expect(readExchangeFile(text).unknownSections).toEqual([]);
  });

  it('weist eine höhere Format-Fassung nicht ab, sondern gibt sie zurück', () => {
    // Nach Zug-Entscheidung Z3 entscheidet der Aufrufer über die Tragbarkeit;
    // das Format-Modul selbst kennt die Regel nicht.
    const kuenftig = schreibeBeispiel().replace(
      `formatVersion: ${FORMAT_VERSION}`,
      `formatVersion: ${FORMAT_VERSION + 7}`,
    );
    const gelesen = readExchangeFile(kuenftig);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.formatVersion).toBe(FORMAT_VERSION + 7);
  });
});

describe('exchange-file.js — Fehler werden gemeldet, nicht geworfen (AK6)', () => {
  const faelle = [
    ['kein Frontmatter', '## nur Text\n\nohne Kopf\n', 'no-frontmatter'],
    ['defektes Frontmatter', '---\nem4me: "a\n  b: [\n---\n\ntext\n', 'invalid-frontmatter'],
    [
      'offener Fence-Block',
      `---\nem4me: "settings"\nformatVersion: 1\n---\n\n\`\`\`json em4me:colorSchemes\n[]\n`,
      'unterminated-fence',
    ],
    [
      'fremde Markdown-Datei',
      '---\ntitle: "Notiz"\ntags: []\n---\n\nText\n',
      'not-an-exchange-file',
    ],
    ['fehlende Format-Fassung', '---\nem4me: "settings"\n---\n\nText\n', 'invalid-format-version'],
    [
      'Block ohne Marke',
      '---\nem4me: "settings"\nformatVersion: 1\n---\n\n```json\n[]\n```\n',
      'unmarked-fence',
    ],
  ];

  for (const [bezeichnung, text, ursache] of faelle) {
    it(`meldet «${bezeichnung}» als ${ursache}`, () => {
      const gelesen = readExchangeFile(text);
      expect(gelesen.ok).toBe(false);
      expect(gelesen.error).toBe(ursache);
    });
  }

  it('meldet defekten Inhalt mit dem Namen seines Abschnitts', () => {
    const kaputt = schreibeBeispiel([{ name: 'colorSchemes', value: [] }]).replace('[]', '[,]');
    const gelesen = readExchangeFile(kaputt);
    expect(gelesen).toEqual({
      ok: false,
      error: 'invalid-section-content',
      section: 'colorSchemes',
    });
  });

  it('meldet einen doppelten Abschnitt statt einen der beiden zu verschlucken', () => {
    const einer = schreibeBeispiel([{ name: 'colorSchemes', value: [] }]);
    const doppelt = einer + einer.slice(einer.indexOf('## colorSchemes'));
    expect(readExchangeFile(doppelt)).toEqual({
      ok: false,
      error: 'duplicate-section',
      section: 'colorSchemes',
    });
  });

  it('wirft auch bei grob unbrauchbarer Eingabe nicht', () => {
    for (const eingabe of [undefined, null, '', 42, '---\n']) {
      expect(() => readExchangeFile(eingabe)).not.toThrow();
      expect(readExchangeFile(eingabe).ok).toBe(false);
    }
  });

  it('meldet die Fehler der Schreib-Richtung ebenso', () => {
    const zyklisch = { a: 1 };
    zyklisch.selbst = zyklisch;
    expect(writeExchangeFile({ ...KOPF, sections: [] }).error).toBe('no-sections');
    expect(writeExchangeFile({ ...KOPF, kind: '', sections: DATENARTEN }).error).toBe(
      'invalid-kind',
    );
    expect(writeExchangeFile({ ...KOPF, created: 'gestern', sections: DATENARTEN }).error).toBe(
      'invalid-created',
    );
    expect(
      writeExchangeFile({ ...KOPF, sections: [{ name: 'mit Leerzeichen', value: 1 }] }),
    ).toEqual({ ok: false, error: 'invalid-section-name', section: 'mit Leerzeichen' });
    expect(
      writeExchangeFile({
        ...KOPF,
        sections: [
          { name: 'a', value: 1 },
          { name: 'a', value: 2 },
        ],
      }),
    ).toEqual({ ok: false, error: 'duplicate-section', section: 'a' });
    expect(writeExchangeFile({ ...KOPF, sections: [{ name: 'a', value: zyklisch }] })).toEqual({
      ok: false,
      error: 'unserializable-section',
      section: 'a',
    });
    expect(writeExchangeFile({ ...KOPF, sections: [{ name: 'a', value: undefined }] })).toEqual({
      ok: false,
      error: 'unserializable-section',
      section: 'a',
    });
  });

  it('lässt eine fehlende Herkunft weg, statt sie als null zu schreiben', () => {
    const ohne = writeExchangeFile({
      kind: 'settings',
      created: KOPF.created,
      sections: DATENARTEN,
    });
    expect(ohne.text).not.toContain('origin');
    expect(readExchangeFile(ohne.text).origin).toEqual({});
  });
});

describe('exchange-file.js — Prozessneutralität (AK7)', () => {
  it('bindet weder Dateisystem noch Electron noch Renderer-Globale ein', () => {
    const quelle = readFileSync(
      fileURLToPath(new URL('../../src/shared/exchange-file.js', import.meta.url)),
      'utf8',
    );
    // Nur der Code, ohne Kommentare: der Kopf-Kommentar nennt Datei-Zugriff und
    // Electron ausdrücklich, und ein Treffer dort wäre ein falsches Rot.
    const code = quelle.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/require\(['"](node:)?fs['"]\)/);
    expect(code).not.toMatch(/require\(['"]electron['"]\)/);
    expect(code).not.toMatch(/\b(window|document|localStorage)\b/);
  });
});
