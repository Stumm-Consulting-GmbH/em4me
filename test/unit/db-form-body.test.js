// 4T-001938 (Epic 3E-000257, Bauplan B2, B5; AK1, AK2): Der Körper der
// Einzel-Maske — die erzeugte Fassung aus der Definition, die Zerlegung eines
// Körpers in Markdown- und Feld-Segmente und die Felder-Liste.
//
// Die Demo-Tabelle ist der reale Bestand, an dem die erzeugte Fassung gemessen
// wird; die Beschriftung in mehreren Sprachen steht dort nicht und kommt deshalb
// aus einer eigenen Definition. Dazu die Kopplung der Hinweis-Codes an den
// Katalog, über den ihre Sätze entstehen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORM_HINWEISE,
  feldPlatzhalter,
  erzeugeMaskenKoerper,
  zerlegeMaskenKoerper,
  felderDesKoerpers,
} from '../../src/shared/database/form-body.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';
import { HINWEIS_META, hinweisSatz } from '../../src/shared/database/table-hinweise.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LIBRARY = parseTableDefinition(
  extractFrontmatter(fs.readFileSync(path.join(ROOT, 'src', 'demo', 'Library.md'), 'utf8')).data,
);

// Eine Definition mit Beschriftungen in zwei Sprachen, einer ohne Beschriftung
// und einer, deren Zuordnung die gefragte Sprache nicht kennt.
const MEHRSPRACHIG = parseTableDefinition({
  'db-table': {
    fields: [
      { name: 'kuerzel', label: { de: 'Kürzel', en: 'Code' } },
      { name: 'ort' },
      { name: 'menge', type: 'number', label: { fr: 'Quantité', it: 'Quantità' } },
    ],
  },
});

describe('Masken-Körper: die erzeugte Fassung (AK1)', () => {
  it('trägt je Feld der Demo-Tabelle in Reihenfolge Beschriftung und Platzhalter', () => {
    expect(LIBRARY.hints).toEqual([]);
    expect(LIBRARY.fields.length).toBeGreaterThanOrEqual(3);
    const text = erzeugeMaskenKoerper(LIBRARY, { tabellenName: 'Library', sprache: 'de' });
    const erwartet = [
      '# Library',
      ...LIBRARY.fields.map((feld) => `**${feld.label || feld.name}:** {{field:${feld.name}}}`),
    ].join('\n\n');
    expect(text).toBe(`${erwartet}\n`);
  });

  it('folgt der aktiven Sprache, dann der Rückfall-Sprache, dann der ersten Fassung, dann dem Namen', () => {
    const zeilen = (sprache, rueckfallSprache) =>
      erzeugeMaskenKoerper(MEHRSPRACHIG, { tabellenName: 'Lager', sprache, rueckfallSprache })
        .split('\n\n')
        .slice(1)
        .map((z) => z.trim());
    expect(zeilen('de', null)).toEqual([
      '**Kürzel:** {{field:kuerzel}}',
      '**ort:** {{field:ort}}',
      '**Quantité:** {{field:menge}}',
    ]);
    expect(zeilen('en', 'it')).toEqual([
      '**Code:** {{field:kuerzel}}',
      '**ort:** {{field:ort}}',
      '**Quantità:** {{field:menge}}',
    ]);
    // Sprach-Kennungen ohne Rücksicht auf die Schreibung (E21.2).
    expect(zeilen('EN', null)[0]).toBe('**Code:** {{field:kuerzel}}');
  });

  it('eine Tabelle ohne Felder ergibt allein die Überschrift', () => {
    expect(erzeugeMaskenKoerper({ fields: [] }, { tabellenName: 'Leer' })).toBe('# Leer\n');
    expect(erzeugeMaskenKoerper(null)).toBe('# \n');
  });

  it('maskiert ein {{ in Beschriftung und Tabellen-Name, damit es kein Platzhalter wird', () => {
    const definition = { fields: [{ name: 'a', label: 'Wert {{field:b}}' }, { name: 'b' }] };
    const text = erzeugeMaskenKoerper(definition, { tabellenName: 'T {{x}}' });
    expect(text).toContain('# T \\{{x}}');
    const { segmente, hints } = zerlegeMaskenKoerper(text, definition.fields);
    expect(hints).toEqual([]);
    expect(felderDesKoerpers(segmente)).toEqual(['a', 'b']);
    expect(segmente[0]).toEqual({ art: 'markdown', text: '# T {{x}}\n\n**Wert {{field:b}}:** ' });
  });

  it('die erzeugte Fassung zerlegt sich ohne Hinweis in genau ihre Felder', () => {
    const text = erzeugeMaskenKoerper(LIBRARY, { tabellenName: 'Library' });
    const { segmente, hints } = zerlegeMaskenKoerper(text, LIBRARY.fields);
    expect(hints).toEqual([]);
    expect(felderDesKoerpers(segmente)).toEqual(LIBRARY.fields.map((feld) => feld.name));
    expect(feldPlatzhalter('title')).toBe('{{field:title}}');
  });
});

describe('Masken-Körper: die Zerlegung (AK2)', () => {
  const FELDER = [{ name: 'Name' }, { name: 'Ort' }, { name: 'Anzahl' }];

  it('liefert Markdown zwischen den Feldern und den kanonischen Feld-Namen', () => {
    const text =
      '## Kunde\n\n| Name | {{field:name}} |\n|---|---|\n\nOrt: {{ Field : ORT }} und {{field:Anzahl}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([
      { art: 'markdown', text: '## Kunde\n\n| Name | ' },
      { art: 'feld', name: 'Name' },
      { art: 'markdown', text: ' |\n|---|---|\n\nOrt: ' },
      { art: 'feld', name: 'Ort' },
      { art: 'markdown', text: ' und ' },
      { art: 'feld', name: 'Anzahl' },
    ]);
  });

  it('das Escape der Vorlagen-Engine bleibt Text', () => {
    const { segmente, hints } = zerlegeMaskenKoerper('A \\{{field:Name}} B', FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([{ art: 'markdown', text: 'A {{field:Name}} B' }]);
  });

  it('meldet fremde Platzhalter mit Inhalt und Zeile und lässt sie als Text stehen', () => {
    const text =
      'Kopf\n{{value: menge * preis}}\n\n{{when:status = "offen"}}x{{end}}\n{{list:Positionen}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(segmente).toEqual([{ art: 'markdown', text }]);
    expect(hints).toEqual([
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'value: menge * preis', zeile: 2 },
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'when:status = "offen"', zeile: 4 },
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'end', zeile: 4 },
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'list:Positionen', zeile: 5 },
    ]);
  });

  it('meldet ein unbekanntes Feld mit Namen und Zeile und lässt es als Text stehen', () => {
    const text = '{{field:Name}}\n\n{{field:Telefon}} und {{field:}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(segmente).toEqual([
      { art: 'feld', name: 'Name' },
      { art: 'markdown', text: '\n\n{{field:Telefon}} und {{field:}}' },
    ]);
    expect(hints).toEqual([
      { code: FORM_HINWEISE.feldUnbekannt, name: 'Telefon', zeile: 3 },
      { code: FORM_HINWEISE.feldUnbekannt, name: '', zeile: 3 },
    ]);
  });

  it('eine Klammer ohne Schluss auf derselben Zeile ist Text und verschluckt nichts', () => {
    const text = 'Offen {{field:Name\n{{field:Ort}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([
      { art: 'markdown', text: 'Offen {{field:Name\n' },
      { art: 'feld', name: 'Ort' },
    ]);
  });

  it('ohne Felder ist jedes Feld unbekannt, ohne Text gibt es nichts', () => {
    expect(zerlegeMaskenKoerper('{{field:Name}}', undefined).hints).toEqual([
      { code: FORM_HINWEISE.feldUnbekannt, name: 'Name', zeile: 1 },
    ]);
    expect(zerlegeMaskenKoerper(undefined, FELDER)).toEqual({ segmente: [], hints: [] });
  });
});

describe('Masken-Körper: Felder-Liste und Hinweis-Sätze', () => {
  it('nennt jedes Feld einmal, in der Reihenfolge des ersten Vorkommens', () => {
    const { segmente } = zerlegeMaskenKoerper('{{field:Ort}} {{field:name}} {{field:ORT}}', [
      { name: 'Name' },
      { name: 'Ort' },
    ]);
    expect(felderDesKoerpers(segmente)).toEqual(['Ort', 'Name']);
    expect(felderDesKoerpers(undefined)).toEqual([]);
  });

  it('führt beide Codes im Hinweis-Katalog, an keinem Frontmatter-Schlüssel', () => {
    for (const code of Object.values(FORM_HINWEISE)) {
      expect(HINWEIS_META[code], code).toEqual({ key: null, expected: null });
    }
  });

  it('setzt Zeile und Namen in den Satz ein und fällt ohne Zeile zurück', () => {
    const texte = {
      'database.hint.formFeldUnbekannt': 'Zeile {zeile}: Feld «{name}» unbekannt.',
      'database.hint.unknown': 'Rückfall ({name}).',
    };
    const uebersetze = (schluessel) => texte[schluessel] || schluessel;
    const hinweis = { code: FORM_HINWEISE.feldUnbekannt, name: 'Telefon', zeile: 3 };
    expect(hinweisSatz(hinweis, uebersetze)).toBe('Zeile 3: Feld «Telefon» unbekannt.');
    expect(hinweisSatz({ ...hinweis, zeile: undefined }, uebersetze)).toBe(
      'Rückfall (formFeldUnbekannt).',
    );
  });
});
