// 4T-001506 (Epic 3E-000250): Unit-Tests des Definitions-Behälters der
// Datenbank-Tabelle und seines internen Profils — Erkennung der Tabelle,
// Pflicht- und Zusatz-Angaben, Beschriftung in beiden Formen, die Kopplung
// von Profil und Parser sowie die Abgrenzung gegen den Profil-Katalog.
//
// Die Fehler-Fälle laufen einzeln durch (weiche Linie: eine defekte Angabe
// entfällt, der Eintrag bleibt; ein defekter Eintrag entfällt, die übrigen
// bleiben).
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  DB_COLUMN_TYPES,
  DB_DEFAULT_COLUMN_TYPE,
  DB_FIELD_PROFILE_NAME,
  HINWEIS_META,
  dbFieldProfileFields,
  dbFieldProfile,
  istTabellenDokument,
  parseTableDefinition,
} from '../../src/shared/database/table-definition.js';
import {
  parseProfileFields,
  assignedProfileNames,
  DEFAULT_ASSIGN_FIELD,
} from '../../src/shared/property-profiles.js';
import {
  createProfileCatalogCache,
  loadProfileCatalog,
} from '../../src/main/documents/profile-catalog.js';

// Frontmatter-Objekt einer Tabelle mit den übergebenen Definitions-Einträgen.
function tabelle(...eintraege) {
  return { [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: eintraege } };
}

describe('Tabellen-Definition: der Behälter (AK1)', () => {
  it('weist eine Datei über den Frontmatter-Behälter als Tabelle aus', () => {
    expect(istTabellenDokument(tabelle({ name: 'menge' }))).toBe(true);
    expect(istTabellenDokument({ title: 'Notiz' })).toBe(false);
    expect(istTabellenDokument(null)).toBe(false);
    expect(istTabellenDokument('kein Objekt')).toBe(false);
  });

  it('liest die Feld-Definitionen aus dem Behälter', () => {
    const { istTabelle, fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', type: 'number' }, { name: 'bemerkung', type: 'multiline' }),
    );
    expect(istTabelle).toBe(true);
    expect(hints).toEqual([]);
    expect(fields).toEqual([
      { name: 'menge', type: 'number' },
      { name: 'bemerkung', type: 'multiline' },
    ]);
  });

  it('ein gewöhnliches Dokument ist keine Tabelle', () => {
    expect(parseTableDefinition({ title: 'Notiz', fields: [{ name: 'status' }] })).toEqual({
      istTabelle: false,
      fields: [],
      hints: [],
    });
  });

  it('ein leerer Behälter ist eine Tabelle ohne Felder und kein Fehler', () => {
    for (const behaelter of [null, {}, { [DB_FIELDS_KEY]: null }]) {
      expect(parseTableDefinition({ [DB_TABLE_KEY]: behaelter })).toEqual({
        istTabelle: true,
        fields: [],
        hints: [],
      });
    }
  });
});

describe('Tabellen-Definition: Pflicht- und Zusatz-Angaben (AK2)', () => {
  it('der Name allein genügt; ohne Typ gilt die Vorgabe', () => {
    const { fields, hints } = parseTableDefinition(tabelle({ name: 'menge' }));
    expect(hints).toEqual([]);
    expect(fields).toEqual([{ name: 'menge', type: DB_DEFAULT_COLUMN_TYPE }]);
  });

  it('jede weitere Angabe ist einzeln weglassbar', () => {
    const voll = { name: 'menge', type: 'number', label: 'Menge', required: true };
    for (const angabe of ['type', 'label', 'required']) {
      const eintrag = { ...voll };
      delete eintrag[angabe];
      const { fields, hints } = parseTableDefinition(tabelle(eintrag));
      expect(hints, `Angabe ${angabe} weggelassen`).toEqual([]);
      expect(fields).toHaveLength(1);
      expect(fields[0][angabe]).toBe(angabe === 'type' ? DB_DEFAULT_COLUMN_TYPE : undefined);
    }
  });

  it('ohne Namen entfällt der Eintrag', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ type: 'number' }, { name: '   ' }, { name: 'menge' }),
    );
    expect(fields).toEqual([{ name: 'menge', type: DB_DEFAULT_COLUMN_TYPE }]);
    expect(hints.map((h) => h.code)).toEqual(['name', 'name']);
  });

  it('die Pflicht-Angabe steht als Wahrheitswert auf der oberen Ebene', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', required: true }, { name: 'bemerkung', required: false }),
    );
    expect(hints).toEqual([]);
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBe(false);
  });

  it('eine Pflicht-Angabe ohne Wahrheitswert entfällt einzeln, das Feld bleibt', () => {
    const { fields, hints } = parseTableDefinition(tabelle({ name: 'menge', required: 'ja' }));
    expect(fields).toEqual([{ name: 'menge', type: DB_DEFAULT_COLUMN_TYPE }]);
    expect(hints).toEqual([
      { code: 'required', index: 0, name: 'menge', key: 'required', expected: 'boolean' },
    ]);
  });

  it('Angaben, die dieses Modul nicht beschreibt, bleiben hinweisfrei', () => {
    // Rückwärts- und Vorwärts-Verträglichkeit: Eine Datei, die für eine
    // spätere Stufe geschrieben wurde, richtet heute keinen Schaden an.
    // `valuesFrom` ist der belegte Fall — ob eine Spalte ihren Wertevorrat aus
    // einer Quelle zieht, ist nicht entschieden.
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', type: 'number', valuesFrom: { note: 'Werte.md' }, kuenftig: 'x' }),
    );
    expect(hints).toEqual([]);
    expect(fields).toEqual([{ name: 'menge', type: 'number' }]);
  });
});

describe('Tabellen-Definition: Beschriftung (AK3)', () => {
  it('nimmt die Beschriftung als einfachen Text', () => {
    const { fields, hints } = parseTableDefinition(tabelle({ name: 'menge', label: ' Menge ' }));
    expect(hints).toEqual([]);
    expect(fields[0].label).toBe('Menge');
  });

  it('nimmt die Beschriftung als Zuordnung von Sprache zu Text', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', label: { de: 'Menge', EN: 'Quantity' } }),
    );
    expect(hints).toEqual([]);
    expect(fields[0].label).toEqual({ de: 'Menge', en: 'Quantity' });
  });

  it('der Feld-Name bleibt von der Beschriftung unberührt', () => {
    const { fields } = parseTableDefinition(
      tabelle({ name: 'menge', label: { de: 'Menge', fr: 'Quantité' } }),
    );
    expect(fields[0].name).toBe('menge');
  });

  it('eine defekte Zuordnung setzt die ganze Beschriftung aus, das Feld bleibt', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', label: { de: 'Menge', en: 42 } }),
    );
    expect(fields).toEqual([{ name: 'menge', type: DB_DEFAULT_COLUMN_TYPE }]);
    expect(hints).toEqual([
      { code: 'label', index: 0, name: 'menge', key: 'label', expected: 'text-or-locale-map' },
    ]);
  });

  it('eine Beschriftung als Liste ist nicht bildbar', () => {
    const { fields, hints } = parseTableDefinition(tabelle({ name: 'menge', label: ['Menge'] }));
    expect(fields).toHaveLength(1);
    expect(hints.map((h) => h.code)).toEqual(['label']);
  });
});

describe('Tabellen-Definition: das interne Profil (AK4)', () => {
  it('ist ein internes Profil im Code ohne Datei dahinter', () => {
    const profil = dbFieldProfile();
    expect(profil.name).toBe(DB_FIELD_PROFILE_NAME);
    expect(profil.internal).toBe(true);
    expect(profil.fileName).toBeNull();
    expect(profil.errors).toEqual([]);
    expect(profil.fields.map((f) => f.name)).toEqual(['name', 'type', 'label', 'required']);
  });

  it('zieht seinen Typ-Wertevorrat aus derselben Konstante wie der Parser', () => {
    const typFeld = dbFieldProfileFields().find((f) => f.name === 'type');
    expect(typFeld.values).toEqual(DB_COLUMN_TYPES);
    // Kopie, nicht die Konstante selbst: ein Aufrufer darf den Typ-Satz nicht
    // aus Versehen umschreiben.
    expect(typFeld.values).not.toBe(DB_COLUMN_TYPES);
  });

  it('der Parser nimmt jeden Typ des Profils an', () => {
    const eintraege = DB_COLUMN_TYPES.map((type, i) => ({ name: `f${i}`, type }));
    const { fields, hints } = parseTableDefinition(tabelle(...eintraege));
    expect(hints).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(DB_COLUMN_TYPES);
  });

  it('ein Typ außerhalb des Wertevorrats lässt den Eintrag entfallen', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', type: 'waehrung' }, { name: 'bemerkung' }),
    );
    expect(fields).toEqual([{ name: 'bemerkung', type: DB_DEFAULT_COLUMN_TYPE }]);
    expect(hints).toEqual([
      { code: 'type', index: 0, name: 'menge', key: 'type', expected: DB_COLUMN_TYPES },
    ]);
  });

  it('der Hinweis-Katalog nennt dieselben Behälter-Schlüssel wie das Modul', () => {
    // 4T-001508: Der Katalog liegt als Blatt-Modul daneben und führt die beiden
    // Schlüssel als Zeichenketten, damit er nichts importieren muss. Diese
    // Zeile hält beide Fassungen zusammen.
    expect(HINWEIS_META.container.key).toBe(DB_TABLE_KEY);
    expect(HINWEIS_META.fieldsNotList.key).toBe(DB_FIELDS_KEY);
  });

  it('jede Angabe des Profils hat einen Eintrag im Hinweis-Katalog', () => {
    // Hält Profil und Katalog deckungsgleich: Eine neue Angabe im Profil ohne
    // ihren Hinweis-Eintrag meldete sonst einen Fehler ohne Ortsbezug.
    for (const feld of dbFieldProfileFields()) {
      expect(HINWEIS_META[feld.name], `Hinweis-Eintrag für ${feld.name}`).toBeTruthy();
      expect(HINWEIS_META[feld.name].key).toBe(feld.name);
    }
  });
});

describe('Tabellen-Definition: Abgrenzung gegen den Profil-Katalog (AK5)', () => {
  it('die Profil-Maschinerie sieht den Behälter nicht', () => {
    expect(parseProfileFields(tabelle({ name: 'menge', type: 'number' }))).toEqual({
      fields: [],
      errors: [],
    });
  });

  it('die Profil-Zuordnung eines Dokuments bleibt unverändert', () => {
    const ohne = { [DEFAULT_ASSIGN_FIELD]: 'Projekt' };
    const mit = { ...ohne, ...tabelle({ name: 'menge' }) };
    expect(assignedProfileNames(mit, DEFAULT_ASSIGN_FIELD)).toEqual(
      assignedProfileNames(ohne, DEFAULT_ASSIGN_FIELD),
    );
  });

  it('ein Tabellen-Dokument steuert dem Katalog keine Felder bei', async () => {
    // Der Katalog liest ausschließlich den Profil-Ordner; ein Tabellen-Dokument
    // liegt dort nie. Selbst wenn es dort läge, brächte es keine Definitionen
    // mit — die beiden Konstrukte teilen keinen Frontmatter-Schlüssel.
    const ordner = path.resolve('C:/Bereich/Profile');
    const inhalt = `---\n${DB_TABLE_KEY}:\n  ${DB_FIELDS_KEY}:\n    - name: menge\n      type: number\n---\nTabelle.\n`;
    const fsp = {
      readdir: async (dir) => {
        if (dir !== ordner) throw new Error('ENOENT');
        return [{ name: 'Tabelle.md', isFile: () => true }];
      },
      stat: async () => ({ mtimeMs: 1, size: inhalt.length }),
      readFile: vi.fn(async () => inhalt),
    };
    const { profiles } = await loadProfileCatalog({
      folderAbs: ordner,
      fsp,
      cache: createProfileCatalogCache(),
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].fields).toEqual([]);
    expect(profiles[0].errors).toEqual([]);
  });
});

describe('Tabellen-Definition: fehlerhafte Definitionen (AK6)', () => {
  it('ein defekter Behälter macht das Dokument nicht unbrauchbar', () => {
    const { istTabelle, fields, hints } = parseTableDefinition({ [DB_TABLE_KEY]: 'Personen' });
    expect(istTabelle).toBe(true);
    expect(fields).toEqual([]);
    expect(hints).toEqual([
      { code: 'container', index: -1, name: null, key: DB_TABLE_KEY, expected: 'object' },
    ]);
  });

  it('eine Feld-Liste, die keine ist, wird benannt', () => {
    const { istTabelle, fields, hints } = parseTableDefinition({
      [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: 'menge, bemerkung' },
    });
    expect(istTabelle).toBe(true);
    expect(fields).toEqual([]);
    expect(hints).toEqual([
      { code: 'fieldsNotList', index: -1, name: null, key: DB_FIELDS_KEY, expected: 'list' },
    ]);
  });

  it('ein defekter Eintrag entfällt, die übrigen bleiben wirksam', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge', type: 'number' }, 'kein Objekt', { name: 'bemerkung' }),
    );
    expect(fields.map((f) => f.name)).toEqual(['menge', 'bemerkung']);
    expect(hints).toEqual([{ code: 'entry', index: 1, name: null, key: null, expected: 'object' }]);
  });

  it('ein doppelter Feldname entfällt und wird benannt', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle({ name: 'menge' }, { name: 'MENGE', type: 'number' }),
    );
    expect(fields).toHaveLength(1);
    expect(hints).toEqual([
      { code: 'duplicate', index: 1, name: 'MENGE', key: 'name', expected: null },
    ]);
  });

  it('die Meldung benennt die fehlerhafte Stelle', () => {
    const { hints } = parseTableDefinition(
      tabelle({ name: 'a' }, { name: 'b', label: 7 }, { name: 'c', type: 'waehrung' }),
    );
    expect(hints.map((h) => [h.code, h.index, h.name, h.key])).toEqual([
      ['label', 1, 'b', 'label'],
      ['type', 2, 'c', 'type'],
    ]);
  });
});
