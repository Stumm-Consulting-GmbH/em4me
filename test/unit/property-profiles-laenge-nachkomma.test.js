// 4T-001507 (Epic 3E-000250, E5.5): Unit-Tests der beiden Angaben, die in den
// GETEILTEN Optionen-Katalog kommen und damit auch Dokument-Eigenschaften
// offenstehen — die Längen-Angabe `maxLength` am Typ `string` und die
// Nachkommastellen `decimals` am Typ `number`.
//
// Der Anteil dieses Epics mit Wirkung auf ausgeliefertes Verhalten liegt hier;
// jeder Fall läuft deshalb zweimal, einmal an einer Dokument-Eigenschaft und
// einmal an einer Datenbank-Spalte. Die tragende Zusage ist die negative:
// **Beide wirken als Hinweis und ändern keinen gespeicherten Wert.**
import { describe, it, expect } from 'vitest';
import {
  parseProfileFields,
  optionSpecsFor,
  fieldDefinitionHint,
} from '../../src/shared/property-profiles.js';
import {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  parseTableDefinition,
} from '../../src/shared/database/table-definition.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Die Sprachdatei wird als Daten gelesen, nicht importiert: Ein Import-Attribut
// für JSON ist in der Lint-Konfiguration des Projekts nicht vorgesehen.
//
// **Der Pfad wird bewusst als Zeichenkette übergeben** und nicht als `URL`:
// Der Lese-Hook der Zuordnungs-Messung (scripts/eingaben-spur.js) verwirft
// Argumente, die weder Zeichenkette noch Puffer sind. Mit einer `URL` bliebe
// dieser Zugriff ungemessen, und die Zuordnung dieser Prüfdatei zur Klasse der
// Sprachdateien stünde ohne maschinellen Beleg da.
const DE_PFAD = fileURLToPath(new URL('../../src/i18n/de.json', import.meta.url));
const de = JSON.parse(fs.readFileSync(DE_PFAD, 'utf8'));

// Eine Definition als Dokument-Eigenschaft lesen.
function alsEigenschaft(eintrag) {
  const { fields, errors } = parseProfileFields({ fields: [eintrag] });
  return { def: fields[0], hints: errors };
}

// Dieselbe Definition als Datenbank-Spalte lesen.
function alsSpalte(eintrag) {
  const { fields, hints } = parseTableDefinition({
    [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: [eintrag] },
  });
  return { def: fields[0], hints };
}

const BEIDE_WEGE = [
  ['Dokument-Eigenschaft', alsEigenschaft],
  ['Datenbank-Spalte', alsSpalte],
];

describe('Optionen-Katalog: die beiden neuen Angaben (AK5)', () => {
  it('die Längen-Angabe steht am Text-Typ', () => {
    expect(Object.keys(optionSpecsFor('string', false))).toContain('maxLength');
  });

  it('die Längen-Angabe gilt nicht für den Langtext-Typ', () => {
    // E5.5: `multiline` ist als Langtext beliebiger Länge definiert. Die
    // Zuordnung je Typ erledigt den Ausschluss von selbst.
    expect(Object.keys(optionSpecsFor('multiline', false))).not.toContain('maxLength');
  });

  it('die Nachkommastellen stehen am Zahl-Typ, neben den bestehenden Angaben', () => {
    expect(Object.keys(optionSpecsFor('number', false))).toEqual([
      'step',
      'min',
      'max',
      'decimals',
    ]);
  });

  for (const [wo, lies] of BEIDE_WEGE) {
    it(`beide Angaben werden gelesen (${wo})`, () => {
      const text = lies({ name: 'kuerzel', type: 'string', options: { maxLength: 3 } });
      expect(text.hints).toEqual([]);
      expect(text.def.options).toEqual({ maxLength: 3 });

      const zahl = lies({ name: 'betrag', type: 'number', options: { decimals: 2 } });
      expect(zahl.hints).toEqual([]);
      expect(zahl.def.options).toEqual({ decimals: 2 });
    });

    it(`eine Längen-Angabe am Langtext entfällt einzeln, das Feld bleibt (${wo})`, () => {
      const { def, hints } = lies({ name: 'notiz', type: 'multiline', options: { maxLength: 80 } });
      expect(def.type).toBe('multiline');
      expect(def.options).toEqual({});
      expect(hints.map((h) => h.code)).toEqual(['optionUnknown']);
    });

    it(`unbrauchbare Werte beider Angaben entfallen einzeln (${wo})`, () => {
      // Eine Länge von null verböte jeden Wert, eine negative
      // Nachkommastellen-Angabe ergäbe keinen Sinn, und über zehn Stellen geht
      // die Anzeige nicht (Vorbild `number(n)` der Datentabelle).
      for (const [eintrag, code] of [
        [{ name: 'a', type: 'string', options: { maxLength: 0 } }, 'optionValue'],
        [{ name: 'a', type: 'string', options: { maxLength: 2.5 } }, 'optionValue'],
        [{ name: 'a', type: 'string', options: { maxLength: '40' } }, 'optionValue'],
        [{ name: 'a', type: 'number', options: { decimals: -1 } }, 'optionValue'],
        [{ name: 'a', type: 'number', options: { decimals: 11 } }, 'optionValue'],
      ]) {
        const { def, hints } = lies(eintrag);
        expect(def.options, JSON.stringify(eintrag.options)).toEqual({});
        expect(
          hints.map((h) => h.code),
          JSON.stringify(eintrag.options),
        ).toEqual([code]);
      }
    });

    it(`die Grenzwerte selbst sind gültig (${wo})`, () => {
      expect(lies({ name: 'a', type: 'string', options: { maxLength: 1 } }).def.options).toEqual({
        maxLength: 1,
      });
      for (const decimals of [0, 10]) {
        expect(
          lies({ name: 'a', type: 'number', options: { decimals } }).def.options,
          String(decimals),
        ).toEqual({ decimals });
      }
    });
  }
});

describe('Optionen-Katalog: beide melden, ohne einen Wert zu ändern (AK6)', () => {
  const kuerzel = { name: 'kuerzel', type: 'string', options: { maxLength: 3 } };
  const betrag = { name: 'betrag', type: 'number', options: { decimals: 2 } };

  it('ein zu langer Wert wird gemeldet', () => {
    expect(fieldDefinitionHint(kuerzel, 'ABCD')).toBe('tooLong');
    expect(fieldDefinitionHint(kuerzel, 'ABC')).toBeNull();
  });

  it('ein zu langer Wert wird nicht gekürzt', () => {
    // Die Prüfung ist eine reine Funktion über den Wert; sie liefert einen
    // Hinweis-Code und fasst weder Wert noch Definition an. Dass ein
    // Datenspeicher nichts still wegschreiben darf, ist die tragende Zusage.
    const wert = 'ABCDEFG';
    const definition = { ...kuerzel, options: { ...kuerzel.options } };
    expect(fieldDefinitionHint(definition, wert)).toBe('tooLong');
    expect(wert).toBe('ABCDEFG');
    expect(definition.options).toEqual({ maxLength: 3 });
  });

  it('die Länge zählt Grapheme und nicht Code-Einheiten', () => {
    // Ein Emoji aus mehreren Code-Punkten ist EIN Zeichen; nach `length` wäre
    // es mehrere und der Hinweis stünde zu Unrecht da.
    expect(fieldDefinitionHint(kuerzel, '👍🏽')).toBeNull();
    expect(fieldDefinitionHint({ ...kuerzel, options: { maxLength: 1 } }, 'ab')).toBe('tooLong');
  });

  it('zu viele Nachkommastellen werden gemeldet', () => {
    expect(fieldDefinitionHint(betrag, 3.14159)).toBe('tooManyDecimals');
    expect(fieldDefinitionHint(betrag, 3.14)).toBeNull();
    expect(fieldDefinitionHint(betrag, 3)).toBeNull();
    expect(fieldDefinitionHint({ ...betrag, options: { decimals: 0 } }, 3.5)).toBe(
      'tooManyDecimals',
    );
  });

  it('die Exponential-Schreibweise wird mitgezählt', () => {
    // Ab einer gewissen Kleinheit schreibt die Laufzeit von sich aus `1e-7`;
    // ein Zählen allein am Punkt ergäbe dort null Nachkommastellen.
    expect(String(1e-7)).toBe('1e-7');
    expect(fieldDefinitionHint(betrag, 1e-7)).toBe('tooManyDecimals');
  });

  it('ein Wert falschen Typs meldet weiterhin zuerst den Typ', () => {
    // Reihenfolge: Der grundsätzlichere Befund geht vor; eine Meldung über die
    // Länge einer Zahl ginge am Problem vorbei.
    expect(fieldDefinitionHint(kuerzel, 42)).toBe('typeMismatch');
    expect(fieldDefinitionHint(betrag, 'viel')).toBe('typeMismatch');
  });

  it('ohne die Angaben verhält sich die Prüfung unverändert', () => {
    // Rückwärts-Verträglichkeit: Bestehende Definitionen tragen keine der
    // beiden Angaben und dürfen sich nicht anders verhalten als vorher.
    expect(fieldDefinitionHint({ name: 'a', type: 'string' }, 'beliebig lang')).toBeNull();
    expect(fieldDefinitionHint({ name: 'a', type: 'number' }, 3.14159265)).toBeNull();
  });

  it('jeder Hinweis-Code der Wert-Prüfung hat seinen Anzeige-Text', () => {
    // Die Zuordnung Code zu Text steht in einer DOM-Funktion des Renderers und
    // ist dort nicht ohne Aufbau prüfbar; die Paarung selbst ist es sehr wohl.
    // Ein neuer Code ohne Schlüssel zeigte im Betrieb einen falschen Text —
    // genau der Fehler, den diese Zeile abfängt. Die Gleichheit über alle fünf
    // Sprachen sichert der i18n-Wächter.
    for (const code of ['typeMismatch', 'outsideValues', 'tooLong', 'tooManyDecimals']) {
      expect(de[`properties.profileHint.${code}`], code).toBeTruthy();
    }
    expect(de['properties.profileHint.tooLong']).toContain('{max}');
    expect(de['properties.profileHint.tooManyDecimals']).toContain('{decimals}');
  });

  it('beide Angaben wirken auch an einem Mehrfach-Feld je Eintrag', () => {
    const mehrfach = { name: 'kuerzel', type: 'multistring', multiple: true, options: {} };
    expect(fieldDefinitionHint({ ...mehrfach, options: { maxLength: 3 } }, ['AB', 'ABCD'])).toBe(
      'tooLong',
    );
    expect(
      fieldDefinitionHint({ ...mehrfach, options: { maxLength: 4 } }, ['AB', 'ABCD']),
    ).toBeNull();
  });
});
