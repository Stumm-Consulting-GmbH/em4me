// 4T-001938 (Epic 3E-000257, Bauplan B2, B5; AK1, AK2): Der Körper der
// Einzel-Maske — die erzeugte Fassung aus der Definition, die Zerlegung eines
// Körpers in Markdown- und Feld-Segmente und die Felder-Liste.
//
// Die Demo-Tabelle ist der reale Bestand, an dem die erzeugte Fassung gemessen
// wird; die Beschriftung in mehreren Sprachen steht dort nicht und kommt deshalb
// aus einer eigenen Definition. Dazu die Kopplung der Hinweis-Codes an den
// Katalog, über den ihre Sätze entstehen.
//
// 4T-002183 (Epic 3E-000261, S2, S3, S5): Der Wert-Platzhalter — Grammatik,
// Escape, Rückwärts-Gleichheit, Hinweis beim ungültigen Ausdruck, Ausschluss aus
// der Felder-Liste und die Auswertung gegen gespeicherten Stand und Entwurf
// (`form-wert.js`).
//
// 4T-002186 (Epic 3E-000261, E7.8, S2, S5): Die bedingten Bereiche — Marker
// allein auf der Zeile, Verschachtelung, die drei Fehlerbilder samt Hinweis und
// Satz, Felder-Liste durch Bereiche hindurch, Escape, Prozess-Grenze und die
// Auswertung der Bedingung (`werteBedingungAus`); dazu der Wert im Satz
// (`imSatz`).
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
import {
  liesWertAusdruck,
  baueWertKontext,
  texteDesStands,
  werteWertAus,
  werteBedingungAus,
} from '../../src/shared/database/form-wert.js';
import { cellSegments } from '../../src/shared/query/result-display.js';
import de from '../../src/i18n/de.json';

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
    // 4T-002183: `value` ist seither erkannt; der Tippfehler `feld` bleibt fremd.
    // 4T-002253: `list` allein auf der Zeile ist ein Segment; im Satz bleibt er fremd.
    const text =
      'Kopf\n{{feld: menge}}\n\n{{when:status = "offen"}}x{{end}}\nx {{list:Positionen}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(segmente).toEqual([{ art: 'markdown', text }]);
    expect(hints).toEqual([
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'feld: menge', zeile: 2 },
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

// --- 4T-002183: der Wert-Platzhalter -----------------------------------------------------

describe('Masken-Körper: die Grammatik des Wert-Platzhalters (S2, AK1, AK5)', () => {
  const FELDER = [
    { name: 'Menge', type: 'number' },
    { name: 'Preis', type: 'number' },
    { name: 'Lent', type: 'date' },
  ];

  it('erkennt value mit Ausdruck, gelesenem Baum und Zeile, ohne Rücksicht auf Schreibung und Leerraum', () => {
    const text = '# Posten\n\nSumme: {{value: Menge * Preis }} €\n{{ VALUE : lent + dur(14 days)}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([]);
    expect(segmente.map((s) => s.art)).toEqual(['markdown', 'wert', 'markdown', 'wert']);
    expect(segmente[0]).toEqual({ art: 'markdown', text: '# Posten\n\nSumme: ' });
    expect(segmente[1]).toMatchObject({ art: 'wert', ausdruck: 'Menge * Preis', zeile: 3 });
    expect(segmente[1].ast).toMatchObject({ type: 'arith', op: 'mul' });
    expect(segmente[2]).toEqual({ art: 'markdown', text: ' €\n' });
    expect(segmente[3]).toMatchObject({ art: 'wert', ausdruck: 'lent + dur(14 days)', zeile: 4 });
    expect(segmente[3].ast).toMatchObject({ type: 'arith', op: 'add' });
  });

  it('meldet einen ungültigen Ausdruck mit Zeile und lässt die Stelle als Wert ohne Baum stehen', () => {
    const text =
      'A {{value:menge *}}\n{{value:}}\n{{value:gibtsnicht(menge)}} {{value:upper(a, b)}}';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([
      { code: FORM_HINWEISE.ausdruckUngueltig, name: 'menge *', zeile: 1 },
      { code: FORM_HINWEISE.ausdruckUngueltig, name: '', zeile: 2 },
      { code: FORM_HINWEISE.ausdruckUngueltig, name: 'gibtsnicht(menge)', zeile: 3 },
      { code: FORM_HINWEISE.ausdruckUngueltig, name: 'upper(a, b)', zeile: 3 },
    ]);
    const werte = segmente.filter((s) => s.art === 'wert');
    expect(werte).toHaveLength(4);
    for (const wert of werte) expect(wert.ast).toBeNull();
  });

  it('ein Ausdruck über ein Feld, das es nicht gibt, ist lesbar und trägt keinen Hinweis', () => {
    const { segmente, hints } = zerlegeMaskenKoerper('{{value:telefon}}', FELDER);
    expect(hints).toEqual([]);
    expect(segmente[0].ast).toEqual(expect.objectContaining({ type: 'field' }));
  });

  it('das Escape lässt den Wert-Platzhalter als Text stehen, eine offene Klammer ebenso', () => {
    const text = 'A \\{{value:menge}} B\n{{value:menge\n';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([{ art: 'markdown', text: 'A {{value:menge}} B\n{{value:menge\n' }]);
  });

  it('ein Körper ohne Wert-Platzhalter ergibt dieselbe Liste wie vorher (Rückwärts-Gleichheit)', () => {
    const text = '## K\n\n{{field:menge}} und {{field:Preis}}\n';
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        { art: 'markdown', text: '## K\n\n' },
        { art: 'feld', name: 'Menge' },
        { art: 'markdown', text: ' und ' },
        { art: 'feld', name: 'Preis' },
        { art: 'markdown', text: '\n' },
      ],
      hints: [],
    });
  });

  it('die Segmente überstehen den Weg über die Prozess-Grenze unverändert', () => {
    const { segmente } = zerlegeMaskenKoerper(
      '{{value:choice(menge > 2, "viel", "wenig")}}',
      FELDER,
    );
    expect(segmente[0].ast).not.toBeNull();
    expect(structuredClone(segmente)).toEqual(segmente);
  });

  it('die Felder-Liste nennt keinen Wert und steigt in die Kinder eines Segments hinab (AK4)', () => {
    const { segmente } = zerlegeMaskenKoerper(
      '{{value:menge}} {{field:Preis}} {{value:preis * 2}}',
      FELDER,
    );
    expect(felderDesKoerpers(segmente)).toEqual(['Preis']);
    const baum = [
      { art: 'feld', name: 'Lent' },
      {
        art: 'bereich',
        kinder: [
          { art: 'wert', ausdruck: 'menge' },
          { art: 'feld', name: 'Menge' },
        ],
      },
    ];
    expect(felderDesKoerpers(baum)).toEqual(['Lent', 'Menge']);
  });

  it('der Satz des Hinweises nennt Zeile und Ausdruck in der Sprache des Anwenders', () => {
    const uebersetze = (schluessel) => de[schluessel] || schluessel;
    const satz = hinweisSatz(
      { code: FORM_HINWEISE.ausdruckUngueltig, name: 'menge *', zeile: 7 },
      uebersetze,
    );
    expect(satz).toBe(
      de['database.hint.formAusdruckUngueltig']
        .replace('{zeile}', '7')
        .replace('{name}', 'menge *'),
    );
    expect(satz).toContain('Zeile 7');
  });
});

describe('Wert-Platzhalter: die Auswertung gegen den Datensatz (S3, F3 A)', () => {
  const FELDER = [
    { name: 'Menge', type: 'number' },
    { name: 'Preis', type: 'number' },
    { name: 'Lent', type: 'date' },
    { name: 'Uhr', type: 'time' },
    { name: 'Erledigt', type: 'boolean' },
    { name: 'Titel', type: 'string' },
  ];
  const ZELLEN = [
    { name: 'Menge', text: '3' },
    { name: 'Preis', text: '2.5' },
    { name: 'Lent', text: '2026-10-01' },
    { name: 'Uhr', text: '09:30' },
    { name: 'Erledigt', text: 'x' },
    { name: 'Titel', text: 'Faust' },
  ];
  const wert = (quelle, entwurf = null) =>
    werteWertAus(
      liesWertAusdruck(quelle),
      baueWertKontext(FELDER, texteDesStands(FELDER, ZELLEN, entwurf)),
    );
  const anzeige = (quelle, entwurf) => cellSegments(wert(quelle, entwurf));

  it('rechnet über den gespeicherten Stand, Felder unter ihrem Namen ohne Rücksicht auf die Schreibung', () => {
    expect(wert('menge * preis')).toBe(7.5);
    expect(wert('MENGE + Preis')).toBe(5.5);
    expect(wert('upper(titel)')).toBe('FAUST');
  });

  it('folgt dem Entwurf: die eben eingegebenen Werte gelten vor dem gespeicherten Stand', () => {
    expect(wert('menge * preis', { Menge: '4' })).toBe(10);
    expect(wert('menge * preis', { Menge: '4', Preis: '' })).toBeNull();
  });

  it('ein Datum rechnet wie in einer Tabellen-Abfrage und erscheint im Format ihrer Zellen (AK3)', () => {
    expect(anzeige('lent + dur(14 days)')).toEqual([{ text: '2026-10-15' }]);
    expect(anzeige('lent + dur(14 days)', { Lent: '2026-12-25' })).toEqual([
      { text: '2027-01-08' },
    ]);
    expect(anzeige('lent')).toEqual([{ text: '2026-10-01' }]);
    expect(anzeige('date(2026-10-11) - lent')).toEqual([{ text: '10d' }]);
    expect(anzeige('menge * preis')).toEqual([{ text: '7.5' }]);
    expect(anzeige('erledigt')).toEqual([{ text: 'true' }]);
    expect(anzeige('erledigt', { Erledigt: '' })).toEqual([{ text: 'false' }]);
    expect(anzeige('menge > 2')).toEqual([{ text: 'true' }]);
    expect(anzeige('uhr')).toEqual([{ text: '09:30' }]);
  });

  it('ohne Wert, bei einem Wurf und bei einem ungelesenen Ausdruck ist das Ergebnis null (AK5)', () => {
    expect(wert('menge * preis', { Menge: '' })).toBeNull();
    expect(wert('lent + dur(1 day)', { Lent: 'kein Datum' })).toBeNull();
    expect(wert('telefon')).toBeNull();
    expect(wert('this.menge')).toBeNull();
    expect(werteWertAus(null, {})).toBeNull();
    const ast = liesWertAusdruck('upper(menge)');
    const wirft = {
      get menge() {
        throw new Error('kaputt');
      },
    };
    expect(werteWertAus(ast, wirft)).toBeNull();
    expect(cellSegments(null)).toEqual([]);
  });

  it('die Texte des Stands folgen der Feld-Reihenfolge, eine fehlende Zelle ist leer', () => {
    expect(texteDesStands(FELDER, [{ name: 'Preis', text: '1' }], { Titel: 'Neu' })).toEqual([
      '',
      '1',
      '',
      '',
      '',
      'Neu',
    ]);
    expect(texteDesStands(FELDER, undefined, null)).toEqual(['', '', '', '', '', '']);
  });
});

// --- 4T-002186: bedingte Bereiche und Wert im Satz ---------------------------------------

describe('4T-002186: bedingte Bereiche und Wert im Satz (E7.8, S2, S5)', () => {
  const FELDER = [
    { name: 'Status' },
    { name: 'Titel' },
    { name: 'Notiz' },
    { name: 'x', type: 'number' },
  ];
  // Der ganze Text einer Segment-Liste, ohne Rücksicht auf ihre Schnitte.
  const textDer = (liste) =>
    liste
      .filter((s) => s.art === 'markdown')
      .map((s) => s.text)
      .join('');

  it('Marker allein auf ihrer Zeile ergeben verschachtelte Bereiche, die Marker-Zeilen fehlen im Text', () => {
    // Leerraum vor und nach dem Marker, Groß- und Kleinschreibung beliebig.
    const text = [
      '# Kopf',
      '{{field:titel}}',
      '  {{WHEN: status = "offen"}}  ',
      'Offen seit {{field:Status}}',
      '{{when:notiz}}',
      'Notiz: {{field:notiz}}',
      '\t{{End}}',
      'Schluss',
      '{{end}}',
      'Fuß',
    ].join('\n');
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        { art: 'markdown', text: '# Kopf\n' },
        { art: 'feld', name: 'Titel' },
        { art: 'markdown', text: '\n' },
        {
          art: 'bereich',
          bedingung: 'status = "offen"',
          ast: expect.any(Object),
          zeile: 3,
          kinder: [
            { art: 'markdown', text: 'Offen seit ' },
            { art: 'feld', name: 'Status' },
            { art: 'markdown', text: '\n' },
            {
              art: 'bereich',
              bedingung: 'notiz',
              ast: expect.any(Object),
              zeile: 5,
              kinder: [
                { art: 'markdown', text: 'Notiz: ' },
                { art: 'feld', name: 'Notiz' },
                { art: 'markdown', text: '\n' },
              ],
            },
            { art: 'markdown', text: 'Schluss\n' },
          ],
        },
        { art: 'markdown', text: 'Fuß' },
      ],
      hints: [],
    });
  });

  it('ein Marker am Körper-Ende ohne Umbruch und Zeilen mit CRLF bleiben Marker', () => {
    const { segmente, hints } = zerlegeMaskenKoerper(
      'A\r\n{{when:notiz}}\r\nB\r\n{{end}}\r\nC\n{{when:titel}}\nD\n{{end}}',
      FELDER,
    );
    expect(hints).toEqual([]);
    expect(segmente).toEqual([
      { art: 'markdown', text: 'A\r\n' },
      {
        art: 'bereich',
        bedingung: 'notiz',
        ast: expect.any(Object),
        zeile: 2,
        kinder: [{ art: 'markdown', text: 'B\r\n' }],
      },
      { art: 'markdown', text: 'C\n' },
      {
        art: 'bereich',
        bedingung: 'titel',
        ast: expect.any(Object),
        zeile: 6,
        kinder: [{ art: 'markdown', text: 'D\n' }],
      },
    ]);
  });

  it('ein Marker mit Text auf derselben Zeile ist kein Marker: Hinweis, und der Text bleibt stehen', () => {
    const text = 'Vorher {{when:Status}}\nX\n{{end}} Nachher';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(segmente).toEqual([{ art: 'markdown', text }]);
    expect(hints).toEqual([
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'when:Status', zeile: 1 },
      { code: FORM_HINWEISE.platzhalterUnbekannt, name: 'end', zeile: 3 },
    ]);
  });

  it('ein end ohne offenen Bereich wird mit Zeile gemeldet und seine Zeile übergangen', () => {
    const { segmente, hints } = zerlegeMaskenKoerper('Oben\n  {{end}}\nUnten', FELDER);
    expect(hints).toEqual([{ code: FORM_HINWEISE.endOhneWhen, name: '', zeile: 2 }]);
    // Der Text vor und nach der übergangenen Zeile steht in EINEM Segment.
    expect(segmente).toEqual([{ art: 'markdown', text: 'Oben\nUnten' }]);
    // Auch nach einem geschlossenen Bereich: das zweite end schließt nichts.
    const danach = zerlegeMaskenKoerper('{{when:notiz}}\nA\n{{end}}\n{{end}}\nB', FELDER);
    expect(danach.hints).toEqual([{ code: FORM_HINWEISE.endOhneWhen, name: '', zeile: 4 }]);
    expect(danach.segmente.map((s) => s.art)).toEqual(['bereich', 'markdown']);
    expect(textDer(danach.segmente)).toBe('B');
  });

  it('ein offener Bereich wird mit Bedingung und Zeile gemeldet, sein Inhalt gilt als außerhalb', () => {
    const text = 'Oben\n{{when:Status}}\nMitte {{field:Titel}}\nUnten';
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        { art: 'markdown', text: 'Oben\nMitte ' },
        { art: 'feld', name: 'Titel' },
        { art: 'markdown', text: '\nUnten' },
      ],
      hints: [{ code: FORM_HINWEISE.whenOhneEnd, name: 'Status', zeile: 2 }],
    });
  });

  it('verschachtelt: der offene äußere Bereich weicht, der geschlossene innere bleibt', () => {
    const text = '{{when:Status}}\nA\n{{when:Notiz}}\nB\n{{end}}\nC';
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        { art: 'markdown', text: 'A\n' },
        {
          art: 'bereich',
          bedingung: 'Notiz',
          ast: expect.any(Object),
          zeile: 3,
          kinder: [{ art: 'markdown', text: 'B\n' }],
        },
        { art: 'markdown', text: 'C' },
      ],
      hints: [{ code: FORM_HINWEISE.whenOhneEnd, name: 'Status', zeile: 1 }],
    });
  });

  it('zwei offene Bereiche weichen beide, von innen nach außen, und der Text verschmilzt', () => {
    const text = 'V\n{{when:Status}}\nX\n{{when:Notiz}}\nY';
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [{ art: 'markdown', text: 'V\nX\nY' }],
      hints: [
        { code: FORM_HINWEISE.whenOhneEnd, name: 'Notiz', zeile: 4 },
        { code: FORM_HINWEISE.whenOhneEnd, name: 'Status', zeile: 2 },
      ],
    });
  });

  it('eine ungültige Bedingung wird gemeldet, der Bereich bleibt mit ast null und seinen Kindern stehen', () => {
    const text = [
      '{{when:status =}}',
      'A',
      '{{end}}',
      '{{when:}}',
      'B {{field:titel}}',
      '{{end}}',
      '{{when:gibtsnicht(status)}}',
      'C',
      '{{end}}',
    ].join('\n');
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        {
          art: 'bereich',
          bedingung: 'status =',
          ast: null,
          zeile: 1,
          kinder: [{ art: 'markdown', text: 'A\n' }],
        },
        {
          art: 'bereich',
          bedingung: '',
          ast: null,
          zeile: 4,
          kinder: [
            { art: 'markdown', text: 'B ' },
            { art: 'feld', name: 'Titel' },
            { art: 'markdown', text: '\n' },
          ],
        },
        {
          art: 'bereich',
          bedingung: 'gibtsnicht(status)',
          ast: null,
          zeile: 7,
          kinder: [{ art: 'markdown', text: 'C\n' }],
        },
      ],
      hints: [
        { code: FORM_HINWEISE.bedingungUngueltig, name: 'status =', zeile: 1 },
        { code: FORM_HINWEISE.bedingungUngueltig, name: '', zeile: 4 },
        { code: FORM_HINWEISE.bedingungUngueltig, name: 'gibtsnicht(status)', zeile: 7 },
      ],
    });
  });

  it('ein Körper ohne Marker ergibt dieselbe Liste wie vorher (Rückwärts-Gleichheit)', () => {
    const text = '## K\n\n{{field:Status}} und {{field:Titel}}\n{{value:x * 2}}\n';
    expect(zerlegeMaskenKoerper(text, FELDER)).toEqual({
      segmente: [
        { art: 'markdown', text: '## K\n\n' },
        { art: 'feld', name: 'Status' },
        { art: 'markdown', text: ' und ' },
        { art: 'feld', name: 'Titel' },
        { art: 'markdown', text: '\n' },
        { art: 'wert', ausdruck: 'x * 2', ast: expect.any(Object), zeile: 4, imSatz: false },
        { art: 'markdown', text: '\n' },
      ],
      hints: [],
    });
  });

  it('imSatz: wahr innerhalb einer Textzeile, falsch allein auf der Zeile', () => {
    expect(zerlegeMaskenKoerper('Fällig am {{value:x}} Tage', FELDER).segmente).toEqual([
      { art: 'markdown', text: 'Fällig am ' },
      { art: 'wert', ausdruck: 'x', ast: expect.any(Object), zeile: 1, imSatz: true },
      { art: 'markdown', text: ' Tage' },
    ]);
    const text = [
      'Fällig am {{value:x}} Tage',
      '{{value:x}}',
      '  {{value:x}}\t',
      '{{value:x}}{{value:x}}',
      '{{field:Titel}} {{value:x}}',
      '{{when:notiz}}',
      '{{value:x}}',
      'im {{value:x}} Bereich',
      '{{end}}',
    ].join('\n');
    const werte = [];
    const sammle = (liste) => {
      for (const s of liste) {
        if (s.art === 'wert') werte.push([s.zeile, s.imSatz]);
        if (s.kinder) sammle(s.kinder);
      }
    };
    sammle(zerlegeMaskenKoerper(text, FELDER).segmente);
    expect(werte).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
      [4, true],
      [5, true],
      [7, false],
      [8, true],
    ]);
  });

  it('die Felder-Liste steigt durch verschachtelte, ungültige und aufgelöste Bereiche hinab', () => {
    const text = [
      '{{field:Status}}',
      '{{when:titel}}',
      '{{when:notiz}}',
      '{{field:notiz}}',
      '{{end}}',
      '{{field:status}}',
      '{{end}}',
      '{{when:status =}}',
      '{{field:titel}}',
      '{{end}}',
      '{{when:notiz}}',
      '{{field:x}}',
    ].join('\n');
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints.map((h) => h.code)).toEqual([
      FORM_HINWEISE.bedingungUngueltig,
      FORM_HINWEISE.whenOhneEnd,
    ]);
    expect(felderDesKoerpers(segmente)).toEqual(['Status', 'Notiz', 'Titel', 'x']);
  });

  it('das Escape lässt beide Marker als Text stehen, ohne Hinweis', () => {
    const { segmente, hints } = zerlegeMaskenKoerper('\\{{when:status}}\nX\n\\{{end}}\n', FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([{ art: 'markdown', text: '{{when:status}}\nX\n{{end}}\n' }]);
  });

  it('ein Bereichs-Segment übersteht den Weg über die Prozess-Grenze unverändert', () => {
    const { segmente } = zerlegeMaskenKoerper(
      '{{when:choice(x > 2, true, false)}}\n{{value:x}}\n{{when:notiz}}\nN\n{{end}}\n{{end}}',
      FELDER,
    );
    expect(segmente[0].art).toBe('bereich');
    expect(segmente[0].ast).not.toBeNull();
    expect(segmente[0].kinder.map((k) => k.art)).toEqual(['wert', 'markdown', 'bereich']);
    expect(structuredClone(segmente)).toEqual(segmente);
  });

  it('der Satz jedes Bereichs-Hinweises nennt Zeile und Bedingung in der Sprache des Anwenders', () => {
    const uebersetze = (schluessel) => de[schluessel] || schluessel;
    const faelle = [
      [FORM_HINWEISE.endOhneWhen, '', 'database.hint.formEndOhneWhen'],
      [FORM_HINWEISE.whenOhneEnd, 'status = "offen"', 'database.hint.formWhenOhneEnd'],
      [FORM_HINWEISE.bedingungUngueltig, 'status =', 'database.hint.formBedingungUngueltig'],
    ];
    for (const [code, name, schluessel] of faelle) {
      expect(typeof de[schluessel], schluessel).toBe('string');
      const satz = hinweisSatz({ code, name, zeile: 4 }, uebersetze);
      expect(satz, code).toBe(
        de[schluessel].replace('{zeile}', '4').replace('{name}', name || '—'),
      );
      expect(satz, code).toContain('Zeile 4');
      if (name) expect(satz, code).toContain(`«${name}»`);
    }
  });
});

describe('4T-002186: die Auswertung der Bedingung eines Bereichs (E7.8, F5 A)', () => {
  const FELDER = [
    { name: 'Status', type: 'string' },
    { name: 'Menge', type: 'number' },
    { name: 'Erledigt', type: 'boolean' },
    { name: 'Lent', type: 'date' },
  ];
  const ZELLEN = [
    { name: 'Status', text: 'offen' },
    { name: 'Menge', text: '3' },
    { name: 'Erledigt', text: 'x' },
    { name: 'Lent', text: '2026-10-01' },
  ];
  const bedingung = (quelle, entwurf = null) =>
    werteBedingungAus(
      liesWertAusdruck(quelle),
      baueWertKontext(FELDER, texteDesStands(FELDER, ZELLEN, entwurf)),
    );

  it('ein Vergleich entscheidet wahr oder falsch, auch über ein Datum', () => {
    expect(bedingung('status = "offen"')).toBe(true);
    expect(bedingung('status = "zu"')).toBe(false);
    expect(bedingung('menge > 2')).toBe(true);
    expect(bedingung('lent > date(2026-09-30)')).toBe(true);
    expect(bedingung('lent > date(2026-10-02)')).toBe(false);
  });

  it('ein Wahrheitswert-Feld: x ist wahr, leer ist falsch', () => {
    expect(bedingung('erledigt')).toBe(true);
    expect(bedingung('erledigt', { Erledigt: '' })).toBe(false);
  });

  it('der Entwurf gilt vor dem gespeicherten Stand', () => {
    expect(bedingung('menge > 2', { Menge: '1' })).toBe(false);
    expect(bedingung('status = "zu"', { Status: 'zu' })).toBe(true);
  });

  it('ein fehlendes Feld, ein Wurf und ein ungelesener Ausdruck ergeben falsch', () => {
    expect(bedingung('telefon')).toBe(false);
    expect(bedingung('menge > 2', { Menge: '' })).toBe(false);
    expect(werteBedingungAus(null, {})).toBe(false);
    expect(werteBedingungAus(liesWertAusdruck('status ='), {})).toBe(false);
    const wirft = {
      get status() {
        throw new Error('kaputt');
      },
    };
    expect(werteBedingungAus(liesWertAusdruck('upper(status)'), wirft)).toBe(false);
    // Gegenprobe: derselbe Ausdruck ohne Wurf ist wahr.
    expect(bedingung('upper(status)')).toBe(true);
  });
});

// --- 4T-002252: Weiche der Verweis-Pfade ------------------------------------------------

describe('Verweis-Pfade in Wert und Bedingung (4T-002252, Festlegung 1, 6)', () => {
  const LOANS = [
    { name: 'book', type: 'record', options: { table: 'Library' } },
    { name: 'borrower', type: 'string' },
    { name: 'a.b', type: 'string' },
  ];

  it('erkennt einen Pfad allein über ein Verweis-Feld, auch tief im Baum', async () => {
    const { nenntVerweisPfad } = await import('../../src/shared/database/form-wert.js');
    const pfad = (quelle) => nenntVerweisPfad(liesWertAusdruck(quelle), LOANS);
    expect(pfad('book.title')).toBe(true);
    expect(pfad('BOOK.Title')).toBe(true);
    expect(pfad('upper(book.title) + " (" + borrower + ")"')).toBe(true);
    expect(pfad('book.onloan and borrower = "Clara"')).toBe(true);
    // Kein Pfad: ohne Punkt, Kopf kein Verweis-Feld, wörtliches Punkt-Feld, Namensraum.
    expect(pfad('book')).toBe(false);
    expect(pfad('borrower.name')).toBe(false);
    expect(pfad('a.b')).toBe(false);
    expect(pfad('file.name')).toBe(false);
    expect(pfad('record.id')).toBe(false);
    expect(nenntVerweisPfad(null, LOANS)).toBe(false);
  });

  it('vermerkt pfad an Wert- und Bereichs-Segment; ohne Pfad fehlt die Angabe', () => {
    const { segmente, hints } = zerlegeMaskenKoerper(
      [
        'Titel: {{value:book.title}}',
        '{{value:upper(borrower)}}',
        '{{when:book.onloan}}',
        'Ausgeliehen',
        '{{end}}',
        '{{when:borrower != ""}}',
        'Mit Name',
        '{{end}}',
      ].join('\n'),
      LOANS,
    );
    expect(hints).toEqual([]);
    const art = (a) => segmente.filter((s) => s.art === a);
    expect(art('wert').map((s) => [s.ausdruck, s.pfad])).toEqual([
      ['book.title', true],
      ['upper(borrower)', undefined],
    ]);
    expect(art('bereich').map((s) => [s.bedingung, s.pfad])).toEqual([
      ['book.onloan', true],
      ['borrower != ""', undefined],
    ]);
    expect('pfad' in art('wert')[1]).toBe(false);
  });

  it('meldet einen Punkt-Namen mit unbekanntem Kopf mit Zeile, einmal je Name', () => {
    const { segmente, hints } = zerlegeMaskenKoerper(
      ['# Ausleihe', '{{value:buch.titel + buch.titel}}', '{{when:kunde.ort}}', '{{end}}'].join(
        '\n',
      ),
      LOANS,
    );
    expect(hints).toEqual([
      { code: FORM_HINWEISE.pfadUnbekannt, name: 'buch.titel', zeile: 2 },
      { code: FORM_HINWEISE.pfadUnbekannt, name: 'kunde.ort', zeile: 3 },
    ]);
    // Die Stelle bleibt als lokales Segment stehen und zeigt leer.
    expect(segmente.find((s) => s.art === 'wert').pfad).toBeUndefined();
    expect(FORM_HINWEISE.pfadUnbekannt).toBe('formPfadUnbekannt');
  });

  it('der Satz des Hinweises steht in allen Sprachen mit Zeile und Pfad', () => {
    const satz = hinweisSatz(
      { code: FORM_HINWEISE.pfadUnbekannt, name: 'buch.titel', zeile: 2 },
      (key) => de[key] || key,
    );
    expect(satz).toContain('2');
    expect(satz).toContain('buch.titel');
    expect(satz).not.toBe('database.hint.formPfadUnbekannt');
  });

  it('wertAlsAusdruck ergibt genau den gelieferten Wert', async () => {
    const { wertAlsAusdruck } = await import('../../src/shared/database/form-wert.js');
    expect(werteWertAus(wertAlsAusdruck('Zauberberg'), {})).toBe('Zauberberg');
    expect(werteWertAus(wertAlsAusdruck({ kind: 'date', ms: 0 }), {})).toEqual({
      kind: 'date',
      ms: 0,
    });
    expect(werteWertAus(wertAlsAusdruck(undefined), {})).toBeNull();
    expect(werteBedingungAus(wertAlsAusdruck(true), {})).toBe(true);
  });
});

// 4T-002253 (Epic 3E-000262, F5 A, S6; AK1): der Positions-Bereich.
describe('zerlegeMaskenKoerper: Positions-Bereich `list` (4T-002253)', () => {
  const FELDER = [{ name: 'Name' }];
  it('bildet allein auf der Zeile ein Segment `liste`, mit und ohne BY, die Zeile entfällt', () => {
    const text =
      '# B\n{{field:Name}}\n{{list:Ausleihen}}\n  {{ LIST : Meine Liste by Buch }}  \nEnde';
    const { segmente, hints } = zerlegeMaskenKoerper(text, FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toEqual([
      { art: 'markdown', text: '# B\n' },
      { art: 'feld', name: 'Name' },
      { art: 'markdown', text: '\n' },
      { art: 'liste', datei: 'Ausleihen', by: null, zeile: 3 },
      { art: 'liste', datei: 'Meine Liste', by: 'Buch', zeile: 4 },
      { art: 'markdown', text: 'Ende' },
    ]);
    expect(felderDesKoerpers(segmente)).toEqual(['Name']);
  });

  it('bleibt im Satz und ohne Datei Text mit Hinweis; ein Körper ohne ihn bleibt gleich', () => {
    const { segmente, hints } = zerlegeMaskenKoerper('a {{list:X}}\n{{list:}}\n', FELDER);
    expect(segmente).toEqual([{ art: 'markdown', text: 'a {{list:X}}\n{{list:}}\n' }]);
    expect(hints.map((h) => [h.name, h.zeile])).toEqual([
      ['list:X', 1],
      ['list:', 2],
    ]);
    expect(zerlegeMaskenKoerper('# K\n{{field:Name}}\n', FELDER).segmente).toEqual([
      { art: 'markdown', text: '# K\n' },
      { art: 'feld', name: 'Name' },
      { art: 'markdown', text: '\n' },
    ]);
  });
});
