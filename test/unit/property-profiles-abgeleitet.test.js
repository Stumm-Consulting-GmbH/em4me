// 4T-1183 (Epic 3E-0221, E1): Unit-Tests der abgeleiteten Felder — Format-Seite
// des Typs `formula`, Auswertung des Ausdrucks und die beiden Entartungs-Fälle
// Kreis und Bezug ins Leere.
//
// Eigene Datei nach dem Muster von 4T-1171: Die ABLEITUNG ist ein eigener
// Gegenstand neben Definitions-Format und Auflösung, und `property-profiles.js`
// steht mit über 700 Zeilen dicht am Test-Budget. Was eine Definition liest,
// prüft `property-profiles.test.js`; hier steht ausschließlich, was ein
// abgeleitetes Feld rechnet.
import { describe, it, expect } from 'vitest';
import {
  parseProfileFields,
  resolveProfileFields,
  werteAbgeleiteteFelder,
  istAbgeleitet,
  DERIVED_TYPES,
  PROFILE_FIELD_TYPES,
} from '../../src/shared/property-profiles.js';

// Eine Formel-Definition, wie sie aus einer Profil-Datei käme.
const formel = (name, expression) => ({
  name,
  type: 'formula',
  values: null,
  multiple: false,
  default: null,
  options: expression === null ? {} : { expression },
});

describe('Format-Seite des Typs formula (4T-1183)', () => {
  it('AK1: `formula` gehört zum Typ-Satz und ist als abgeleitet erkennbar', () => {
    expect(PROFILE_FIELD_TYPES).toContain('formula');
    expect(DERIVED_TYPES).toContain('formula');
    expect(istAbgeleitet({ type: 'formula' })).toBe(true);
    expect(istAbgeleitet({ type: 'string' })).toBe(false);
  });

  it('AK1: eine Definition mit Ausdruck läuft hinweisfrei durch', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'gesamt', type: 'formula', options: { expression: 'budget + reserve' } }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].type).toBe('formula');
    expect(fields[0].options).toEqual({ expression: 'budget + reserve' });
  });

  it('AK7: default, values und valuesFrom entfallen einzeln mit Hinweis', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'gesamt',
          type: 'formula',
          options: { expression: '1 + 1' },
          default: 42,
          values: ['a', 'b'],
          valuesFrom: { query: 'FROM "X"' },
        },
      ],
    });
    expect(errors.map((e) => e.code)).toEqual([
      'derivedNoValues',
      'derivedNoValues',
      'derivedNoValues',
    ]);
    expect(errors.map((e) => e.expected).sort()).toEqual(['default', 'values', 'valuesFrom']);
    // Das Feld selbst bleibt wirksam, samt seiner Rechenvorschrift.
    expect(fields).toHaveLength(1);
    expect(fields[0].values).toBeNull();
    expect(fields[0].default).toBeNull();
    expect(fields[0].valuesFrom).toBeUndefined();
    expect(fields[0].options.expression).toBe('1 + 1');
  });

  it('AK7: auch `multiple` entfällt mit Hinweis, und zwar wirksam', () => {
    // Die Gestalt des Ergebnisses bestimmt der Ausdruck, nicht die Definition.
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'gesamt', type: 'formula', multiple: true }],
    });
    expect(errors.map((e) => e.code)).toEqual(['derivedNoValues']);
    expect(errors[0].expected).toBe('multiple');
    expect(fields[0].multiple).toBe(false);
    expect(fields[0].type).toBe('formula');
  });

  it('ein abgeleiteter Typ wird nicht als Mehrfach-Alternative angeboten', () => {
    // Die multipleType-Meldung nennt Auswege; ein abgeleitetes Feld ist keiner,
    // weil `multiple` daran ohnehin nichts steuert.
    const { errors } = parseProfileFields({
      fields: [{ name: 'x', type: 'boolean', multiple: true }],
    });
    expect(errors[0].code).toBe('multipleType');
    expect(errors[0].expected).not.toContain('formula');
  });

  it('AK7: die übrigen Definitionen des Profils bleiben unberührt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'gesamt', type: 'formula', default: 42 },
        { name: 'status', values: ['offen', 'fertig'], default: 'offen' },
      ],
    });
    expect(errors.map((e) => e.code)).toEqual(['derivedNoValues']);
    expect(fields).toHaveLength(2);
    expect(fields[1]).toMatchObject({ name: 'status', default: 'offen' });
  });

  it('ein formula ohne Rechenvorschrift ist KEIN Definitions-Fehler', () => {
    // Der Name bleibt die einzige Pflichtangabe (Konzept 7.1); die fehlende
    // Vorschrift zeigt sich erst bei der Auswertung als leerer Wert.
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'gesamt', type: 'formula' }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].type).toBe('formula');
  });

  it('ein unpassend belegter Ausdruck entfällt einzeln, das Feld bleibt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'gesamt', type: 'formula', options: { expression: 42 } }],
    });
    expect(errors.map((e) => e.code)).toEqual(['optionValue']);
    expect(fields[0].type).toBe('formula');
    expect(fields[0].options).toEqual({});
  });
});

describe('Format-Seite des Typs lookup (4T-1184)', () => {
  it('AK1: `lookup` gehört zum Typ-Satz und gilt als abgeleitet', () => {
    expect(PROFILE_FIELD_TYPES).toContain('lookup');
    expect(DERIVED_TYPES).toContain('lookup');
    expect(istAbgeleitet({ type: 'lookup' })).toBe(true);
  });

  it('AK1/AK2: `from` und `relatedField` werden gelesen und geführt', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'artikel',
          type: 'lookup',
          options: { from: 'FROM "Artikel"', relatedField: 'projekt' },
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].options).toEqual({ from: 'FROM "Artikel"', relatedField: 'projekt' });
  });

  it('AK2: `from` ist freiwillig — ohne Eingrenzung gilt der Bereich', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'artikel', type: 'lookup', options: { relatedField: 'projekt' } }],
    });
    expect(errors).toEqual([]);
    expect(fields[0].options).toEqual({ relatedField: 'projekt' });
  });

  it('AK7: Wert-Angaben entfallen wie beim Formel-Feld', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'artikel', type: 'lookup', default: 'x', values: ['a'], multiple: true }],
    });
    expect(new Set(errors.map((e) => e.code))).toEqual(new Set(['derivedNoValues']));
    expect(fields[0].values).toBeNull();
    expect(fields[0].default).toBeNull();
    expect(fields[0].multiple).toBe(false);
  });

  it('die Optionen des Formel-Feldes gelten hier nicht und umgekehrt', () => {
    // Der Options-Katalog ist typ-eigen; eine fremde Angabe entfällt einzeln.
    const a = parseProfileFields({
      fields: [{ name: 'x', type: 'lookup', options: { expression: '1 + 1' } }],
    });
    expect(a.errors.map((e) => e.code)).toEqual(['optionUnknown']);
    const b = parseProfileFields({
      fields: [{ name: 'y', type: 'formula', options: { relatedField: 'projekt' } }],
    });
    expect(b.errors.map((e) => e.code)).toEqual(['optionUnknown']);
  });

  it('ein lookup wird von der lokalen Auswertung nicht angefasst', () => {
    // Es rechnet nicht lokal, sondern fragt den Index (4T-1184, Main-seitig);
    // `werteAbgeleiteteFelder` darf es deshalb nicht als Formel behandeln.
    const felder = [{ name: 'artikel', type: 'lookup', options: { relatedField: 'projekt' } }];
    const r = werteAbgeleiteteFelder(felder, {});
    expect(r.artikel).toEqual({ value: null, hint: 'derivedNoRule' });
  });
});

describe('Auswertung der Formel-Felder (4T-1183)', () => {
  it('AK1: rechnet über die Werte desselben Dokuments', () => {
    const r = werteAbgeleiteteFelder([formel('gesamt', 'budget + reserve')], {
      budget: 2500,
      reserve: 500,
    });
    expect(r.gesamt).toEqual({ value: 3000, hint: null });
  });

  it('AK1: Schlüssel werden case-insensitiv aufgelöst', () => {
    const r = werteAbgeleiteteFelder([formel('Gesamt', 'Budget * 2')], { budget: 21 });
    expect(r.gesamt.value).toBe(42);
  });

  it('AK2: der Funktions-Katalog der Abfrage-Sprache steht zur Verfügung', () => {
    const r = werteAbgeleiteteFelder([formel('gross', 'upper(titel)')], { titel: 'auftakt' });
    expect(r.gross.value).toBe('AUFTAKT');
  });

  it('AK2: Datums-Rechnung liefert einen ISO-Datumswert', () => {
    const r = werteAbgeleiteteFelder([formel('start', 'date("2026-09-01")')], {});
    expect(r.start).toEqual({ value: '2026-09-01', hint: null });
  });

  it('eine Formel darf auf eine andere Formel verweisen', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'budget * 2'), formel('b', 'a + 1')], {
      budget: 10,
    });
    expect(r.a.value).toBe(20);
    expect(r.b.value).toBe(21);
  });

  it('die Deklarations-Reihenfolge ist dabei frei', () => {
    // Dieselbe Kette rückwärts deklariert: die Auflösung ordnet über die
    // Abhängigkeiten, nicht über die Reihenfolge in der Datei.
    const r = werteAbgeleiteteFelder([formel('b', 'a + 1'), formel('a', 'budget * 2')], {
      budget: 10,
    });
    expect(r.b.value).toBe(21);
  });

  it('ein Feld ohne Wert ist leer, aber kein unbekannter Bezug', () => {
    // `reserve` ist definiert, steht aber nicht im Dokument: kein Hinweis.
    const felder = [formel('gesamt', 'budget + reserve'), { name: 'reserve', type: 'number' }];
    const r = werteAbgeleiteteFelder(felder, { budget: 100 });
    expect(r.gesamt.hint).toBeNull();
  });

  it('nur abgeleitete Felder erscheinen im Ergebnis', () => {
    const r = werteAbgeleiteteFelder([formel('a', '1 + 1'), { name: 'titel', type: 'string' }], {});
    expect(Object.keys(r)).toEqual(['a']);
  });

  it('ohne abgeleitete Felder entsteht kein Ergebnis', () => {
    expect(werteAbgeleiteteFelder([{ name: 'titel', type: 'string' }], { titel: 'x' })).toEqual({});
    expect(werteAbgeleiteteFelder([], {})).toEqual({});
    expect(werteAbgeleiteteFelder(null, null)).toEqual({});
  });
});

describe('Entartungs-Fälle der Auswertung (4T-1183)', () => {
  it('AK3: ein Kreis-Bezug bleibt leer und trägt einen Hinweis', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'b + 1'), formel('b', 'a + 1')], {});
    expect(r.a).toEqual({ value: null, hint: 'derivedCycle' });
    expect(r.b).toEqual({ value: null, hint: 'derivedCycle' });
  });

  it('AK3: ein Selbst-Bezug ist der einfachste Kreis und fällt darunter', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'a + 1')], {});
    expect(r.a).toEqual({ value: null, hint: 'derivedCycle' });
  });

  it('AK3: ein Feld außerhalb des Kreises rechnet weiter', () => {
    const r = werteAbgeleiteteFelder(
      [formel('a', 'b + 1'), formel('b', 'a + 1'), formel('c', 'budget * 2')],
      { budget: 5 },
    );
    expect(r.a.hint).toBe('derivedCycle');
    expect(r.c).toEqual({ value: 10, hint: null });
  });

  it('AK4: ein Bezug auf ein nicht vorhandenes Feld ist kein Fehler', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'gibtsnicht + 1')], { budget: 1 });
    expect(r.a).toEqual({ value: null, hint: 'derivedBadRef' });
  });

  it('AK4: implizite Datei-Felder gelten nicht als unbekannter Bezug', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'file.name')], {}, { file: { name: 'Auftakt' } });
    expect(r.a).toEqual({ value: 'Auftakt', hint: null });
  });

  it('AK5: ein Syntax-Fehler erzeugt einen leeren Wert mit Hinweis', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'budget +')], { budget: 1 });
    expect(r.a).toEqual({ value: null, hint: 'derivedBadExpr' });
  });

  it('AK5: eine unbekannte Funktion ebenso', () => {
    const r = werteAbgeleiteteFelder([formel('a', 'gibtsnicht(1)')], {});
    expect(r.a.hint).toBe('derivedBadExpr');
  });

  it('AK5: keine Eingabe wirft je eine Ausnahme', () => {
    const wild = [
      formel('a', ''),
      formel('b', '((('),
      formel('c', '1 / 0'),
      formel('d', 'upper()'),
    ];
    expect(() => werteAbgeleiteteFelder(wild, {})).not.toThrow();
  });

  it('ein Feld ohne Rechenvorschrift bleibt leer mit Hinweis', () => {
    const r = werteAbgeleiteteFelder([formel('a', null)], {});
    expect(r.a).toEqual({ value: null, hint: 'derivedNoRule' });
  });

  it('ein Feld mit Hinweis macht seine Konsumenten nicht zu Kreis-Fällen', () => {
    // `a` ist ungültig, `b` verweist darauf: `b` rechnet mit leerem `a`
    // weiter und ist ausdrücklich KEIN Kreis (Vorbild validateComputedColumns).
    const r = werteAbgeleiteteFelder([formel('a', 'budget +'), formel('b', 'a')], { budget: 1 });
    expect(r.a.hint).toBe('derivedBadExpr');
    expect(r.b.hint).toBeNull();
  });
});

describe('Kreis-Erkennung über eine Vererbungs-Kette (4T-1183)', () => {
  // AK8 an der realen Konstellation: Die beteiligten Felder stammen aus
  // VERSCHIEDENEN Profilen und finden erst über die Auflösung zueinander.
  // Ein Prüffall an einem einzelnen Profil wäre der bequemere und würde die
  // Auflage der Aufgaben-Klasse K3 verfehlen.
  const PROFILE = [
    {
      name: 'Artikel',
      parent: 'Projekt',
      fields: [{ name: 'summe', type: 'formula', options: { expression: 'zwischensumme + 1' } }],
    },
    {
      name: 'Projekt',
      parent: 'Basis',
      fields: [
        { name: 'zwischensumme', type: 'formula', options: { expression: 'grundwert * 2' } },
      ],
    },
    {
      name: 'Basis',
      fields: [{ name: 'grundwert', type: 'number' }],
    },
  ];

  it('AK8: eine Kette über drei Profile rechnet durch', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Artikel'] });
    const werte = werteAbgeleiteteFelder(r.fields, { grundwert: 10 });
    expect(werte.zwischensumme.value).toBe(20);
    expect(werte.summe.value).toBe(21);
  });

  it('AK8: ein Kreis über Profil-Grenzen hinweg wird erkannt', () => {
    const kreis = [
      {
        name: 'Kind',
        parent: 'Eltern',
        fields: [{ name: 'a', type: 'formula', options: { expression: 'b + 1' } }],
      },
      {
        name: 'Eltern',
        fields: [{ name: 'b', type: 'formula', options: { expression: 'a + 1' } }],
      },
    ];
    const r = resolveProfileFields(kreis, { assigned: ['Kind'] });
    const werte = werteAbgeleiteteFelder(r.fields, {});
    expect(werte.a.hint).toBe('derivedCycle');
    expect(werte.b.hint).toBe('derivedCycle');
  });

  it('AK8: ein überschriebenes Feld gilt in der Fassung, die die Auflösung liefert', () => {
    // Das Kind-Profil definiert `zwischensumme` neu; die Eltern-Fassung
    // entfällt in der Auflösung, und gerechnet wird die des Kindes.
    const ueberschrieben = [
      {
        name: 'Artikel',
        parent: 'Projekt',
        fields: [
          { name: 'zwischensumme', type: 'formula', options: { expression: 'grundwert * 10' } },
        ],
      },
      {
        name: 'Projekt',
        fields: [
          { name: 'zwischensumme', type: 'formula', options: { expression: 'grundwert * 2' } },
          { name: 'grundwert', type: 'number' },
        ],
      },
    ];
    const r = resolveProfileFields(ueberschrieben, { assigned: ['Artikel'] });
    const werte = werteAbgeleiteteFelder(r.fields, { grundwert: 3 });
    expect(werte.zwischensumme.value).toBe(30);
  });
});

describe('Die Auswertung schreibt nichts (4T-1183, AK6)', () => {
  // Der Datei-Nachweis gehört zu 4T-1185 (Schreibwege beider Panels). Auf
  // dieser Ebene ist die prüfbare Zusage: Die Auswertung ist eine reine
  // Funktion — sie fasst weder die übergebenen Werte noch die Definitionen an.
  it('die übergebenen Dokument-Werte bleiben unverändert', () => {
    const props = { budget: 2500, reserve: 500 };
    const vorher = JSON.stringify(props);
    werteAbgeleiteteFelder([formel('gesamt', 'budget + reserve')], props);
    expect(JSON.stringify(props)).toBe(vorher);
    expect('gesamt' in props).toBe(false);
  });

  it('die übergebenen Definitionen bleiben unverändert', () => {
    const felder = [formel('gesamt', 'budget + reserve')];
    const vorher = JSON.stringify(felder);
    werteAbgeleiteteFelder(felder, { budget: 1, reserve: 2 });
    expect(JSON.stringify(felder)).toBe(vorher);
  });

  it('zweimaliges Auswerten liefert dasselbe Ergebnis', () => {
    const felder = [formel('gesamt', 'budget + reserve')];
    const props = { budget: 1, reserve: 2 };
    const a = werteAbgeleiteteFelder(felder, props);
    const b = werteAbgeleiteteFelder(felder, props);
    expect(a).toEqual(b);
  });
});
