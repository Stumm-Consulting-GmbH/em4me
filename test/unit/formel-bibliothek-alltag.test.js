// 4T-002453 (Epic 3E-000378, Story 4S-001140 AK1, AK3, AK5 bis AK7): die
// Formel-Gruppen «Prozentrechnung», «Einheiten-Umrechnung» und «Gesundheit»
// der Formel-Bibliothek. Geprüft werden die Beispielwerte der Quellen
// (Fundstellen im Kapitel «Lösung» des Tasks), darunter die drei der Story, die
// Hin- und Rückumrechnung je Einheiten-Paar, beide Seiten jeder Bereichs-Grenze,
// fehlende und überzählige Angaben, Angaben, die keine Zahl sind, Ergebnisse
// jenseits des Zahlenbereichs, der Aus-Zustand je Namensraum und dieselbe
// Antwort an den Rechen-Orten der prozess-neutralen Module; die Abfrage im
// Haupt-Prozess prüft formel-bibliothek-aus-zustand.test.js.
//
// **Toleranzen.** Die Rechnungen sind exakte Definitions-Gleichungen oder
// Rechen-Regeln; geprüft wird «im Rahmen der Gleitkomma-Genauigkeit» (Story,
// AK1), also mit `toBeCloseTo` auf zehn Stellen, wo der Binärwert nicht exakt
// ist, und mit `round` auf die Stellen der Quelle beim Body-Mass-Index.
//
// Katalog, Auswerter und Werte-Modell über createRequire, damit der Schalter in
// derselben Modul-Instanz steht, die die Rechen-Orte intern laden (Muster
// formel-bibliothek-feuchte.test.js).
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';
import { werteAbgeleiteteFelder } from '../../src/shared/property-profiles-abgeleitet.js';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import fr from '../../src/i18n/fr.json';
import es from '../../src/i18n/es.json';
import it_ from '../../src/i18n/it.json';

const req = createRequire(import.meta.url);
const katalog = req('../../src/shared/query/query-functions.js');
const { evaluateExpression } = req('../../src/shared/query/perspective-query-eval.js');
const { parseQuery } = req('../../src/shared/query/perspective-query.js');
const { messageValue } = req('../../src/shared/query/query-format.js');
const { PERCENT_GROUP, PERCENT_MESSAGES: P } = req('../../src/shared/query/formula-percent.js');
const {
  UNIT_GROUP,
  UNIT_MESSAGES: U,
  UNIT_FACTORS,
} = req('../../src/shared/query/formula-unit.js');
const { HEALTH_GROUP, HEALTH_MESSAGES: H } = req('../../src/shared/query/formula-health.js');
const { FORMULA_LIBRARY_GROUPS } = req('../../src/shared/query/formula-library.js');

function ausdruck(src) {
  const r = parseQuery(src, { expression: true });
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}
const wert = (src, props = {}) => evaluateExpression(ausdruck(src), { props });
const meldung = (key) => messageValue(key);

// Die sechzehn Umrechnungen als Paare [hin, zurück].
const PAARE = [
  ['unit.celsiustokelvin', 'unit.kelvintocelsius'],
  ['unit.celsiustofahrenheit', 'unit.fahrenheittocelsius'],
  ['unit.kelvintofahrenheit', 'unit.fahrenheittokelvin'],
  ['unit.inchtometer', 'unit.metertoinch'],
  ['unit.foottometer', 'unit.metertofoot'],
  ['unit.yardtometer', 'unit.metertoyard'],
  ['unit.miletometer', 'unit.metertomile'],
  ['unit.nauticalmiletometer', 'unit.metertonauticalmile'],
];

afterEach(() => configureExtensions([]));

describe('Prozent, Einheiten, Gesundheit: Gruppen der Bibliothek (4T-002453)', () => {
  it('tragen 5, 16 und 1 Formeln unter ihren Namen in den Namensräumen percent, unit und health', () => {
    for (const g of [PERCENT_GROUP, UNIT_GROUP, HEALTH_GROUP]) {
      expect(FORMULA_LIBRARY_GROUPS).toContain(g);
    }
    const gruppe = (ns) => katalog.functionGroups().find((g) => g.namespace === ns);
    expect(gruppe('percent')).toEqual({
      namespace: 'percent',
      extension: 'formula-library',
      names: [
        'percent.share',
        'percent.change',
        'percent.increase',
        'percent.decrease',
        'percent.base',
      ],
    });
    expect(gruppe('unit').extension).toBe('formula-library');
    expect([...gruppe('unit').names].sort()).toEqual(PAARE.flat().sort());
    expect(gruppe('health')).toEqual({
      namespace: 'health',
      extension: 'formula-library',
      names: ['health.bmi'],
    });
    for (const ns of ['percent', 'unit', 'health']) {
      for (const name of gruppe(ns).names) {
        expect(katalog.lookupFunction(name).lage).toBe('an');
        expect(katalog.lookupFunction(name).def.arity).toEqual(ns === 'unit' ? [1, 1] : [2, 2]);
      }
    }
  });

  it('die exakten Faktoren stehen an einer Stelle des Moduls (NIST SP 811, Anhang B.8)', () => {
    expect(UNIT_FACTORS.LAENGE).toEqual({
      inch: 0.0254,
      foot: 0.3048,
      yard: 0.9144,
      mile: 1609.344,
      nauticalmile: 1852,
    });
    expect(UNIT_FACTORS.TEMPERATUR).toEqual({
      kelvin: 273.15,
      fahrenheit: 32,
      zaehler: 9,
      nenner: 5,
    });
  });
});

describe('Prozentrechnung: Beispielwerte nach der Rechen-Regel (AK1)', () => {
  it('Anteil: 5 von 20 sind 25 %, 1 von 3 sind 33,3 %, negativer Teil ergibt negativen Anteil', () => {
    expect(wert('percent.share(5, 20)')).toBe(25);
    expect(wert('round(percent.share(1, 3), 1)')).toBe(33.3);
    expect(wert('percent.share(-5, 20)')).toBe(-25);
    expect(wert('percent.share(0, 20)')).toBe(0);
  });

  it('Änderung: von 80 auf 100 sind +25 %, von 100 auf 80 sind −20 %', () => {
    expect(wert('percent.change(80, 100)')).toBe(25);
    expect(wert('percent.change(100, 80)')).toBe(-20);
    expect(wert('percent.change(100, 100)')).toBe(0);
  });

  it('erhöhen und vermindern: 200 um 50 % sind 300 (Abnahme-Handgriff) und 100; 100 um 19 % sind 119', () => {
    expect(wert('percent.increase(200, 50)')).toBe(300);
    expect(wert('percent.decrease(200, 50)')).toBe(100);
    expect(wert('percent.increase(100, 19)')).toBeCloseTo(119, 10);
    expect(wert('percent.decrease(119, 0)')).toBe(119);
    // Keine Einschränkung: eine Abnahme über 100 % ergibt einen negativen Wert.
    expect(wert('percent.decrease(200, 150)')).toBe(-100);
  });

  it('Grundwert: 30 sind 15 % von 200; Grundwert und Anteil kehren einander um', () => {
    expect(wert('percent.base(30, 15)')).toBeCloseTo(200, 10);
    expect(wert('percent.base(19, 19)')).toBe(100);
    expect(wert('percent.share(30, percent.base(30, 15))')).toBeCloseTo(15, 10);
  });
});

describe('Einheiten-Umrechnung: Beispielwerte nach NIST SP 811, Anhang B.8 (AK1)', () => {
  it('die drei Werte der Story: 0 °C sind 273.15 K, 212 °F sind 100 °C, 1 Meile sind 1609.344 m', () => {
    expect(wert('unit.celsiustokelvin(0)')).toBe(273.15);
    expect(wert('unit.fahrenheittocelsius(212)')).toBe(100);
    expect(wert('unit.miletometer(1)')).toBe(1609.344);
  });

  it('Temperatur: Gefrier- und Siedepunkt, absoluter Nullpunkt, −40 auf beiden Skalen', () => {
    expect(wert('unit.kelvintocelsius(273.15)')).toBe(0);
    expect(wert('unit.celsiustofahrenheit(100)')).toBe(212);
    expect(wert('unit.celsiustofahrenheit(37)')).toBe(98.6);
    expect(wert('unit.fahrenheittokelvin(32)')).toBe(273.15);
    expect(wert('unit.kelvintofahrenheit(273.15)')).toBe(32);
    expect(wert('unit.kelvintofahrenheit(0)')).toBeCloseTo(-459.67, 10);
    expect(wert('unit.fahrenheittokelvin(-459.67)')).toBeCloseTo(0, 10);
    expect(wert('unit.celsiustofahrenheit(-40)')).toBe(-40);
    expect(wert('unit.fahrenheittocelsius(-40)')).toBe(-40);
  });

  it('Länge: je Einheit der exakte Faktor in Meter und sein Kehrwert', () => {
    expect(wert('unit.inchtometer(1)')).toBe(0.0254);
    expect(wert('unit.foottometer(1)')).toBe(0.3048);
    expect(wert('unit.yardtometer(1)')).toBe(0.9144);
    expect(wert('unit.nauticalmiletometer(1)')).toBe(1852);
    expect(wert('unit.metertonauticalmile(1852)')).toBe(1);
    expect(wert('unit.metertomile(1609.344)')).toBe(1);
    // 1 ft = 12 in, 1 yd = 3 ft (exakt nach denselben Faktoren).
    expect(wert('unit.metertoinch(unit.foottometer(1))')).toBeCloseTo(12, 10);
    expect(wert('unit.metertofoot(unit.yardtometer(1))')).toBeCloseTo(3, 10);
    expect(wert('round(unit.metertoinch(1), 4)')).toBe(39.3701);
  });
});

describe('Einheiten-Umrechnung: Hin und zurück ergibt den Ausgangswert (AK2)', () => {
  const WERTE = [-1234.5, -40, -0.37, 0, 0.001, 1, 37, 98.6, 273.15, 1609.344, 123456.789];
  it.each(PAARE)('%s und %s', (hin, zurueck) => {
    for (const x of WERTE) {
      const genau = 1e-12 * Math.max(1, Math.abs(x));
      expect(Math.abs(wert(`${zurueck}(${hin}(${x}))`) - x), `${hin} ${x}`).toBeLessThanOrEqual(
        genau,
      );
      expect(Math.abs(wert(`${hin}(${zurueck}(${x}))`) - x), `${zurueck} ${x}`).toBeLessThanOrEqual(
        genau,
      );
    }
  });
});

describe('Gesundheit: Body-Mass-Index nach der WHO (AK1)', () => {
  it('70 kg und 1,75 m ergeben 22.9 (WHO Europa), allein die Zahl', () => {
    expect(wert('round(health.bmi(70, 1.75), 1)')).toBe(22.9);
    expect(wert('health.bmi(70, 1.75)')).toBeCloseTo(70 / 1.75 ** 2, 12);
    expect(wert('health.bmi(100, 2)')).toBe(25);
  });
});

describe('Prozent und Gesundheit: Grenzen beiderseits (AK3, AK5 und AK7 der Story)', () => {
  const faelle = [
    // [Ausdruck innerhalb, Ausdruck außerhalb, Meldung]
    ['percent.share(5, 0.001)', 'percent.share(5, 0)', P.ganzes],
    ['percent.share(5, -0.001)', 'percent.share(5, 0)', P.ganzes],
    ['percent.change(0.001, 5)', 'percent.change(0, 5)', P.alterWert],
    ['percent.change(-0.001, 5)', 'percent.change(0, 5)', P.alterWert],
    ['percent.base(30, 0.001)', 'percent.base(30, 0)', P.prozent],
    ['percent.base(30, -0.001)', 'percent.base(30, 0)', P.prozent],
    ['health.bmi(0.001, 1.75)', 'health.bmi(0, 1.75)', H.masse],
    ['health.bmi(70, 0.001)', 'health.bmi(70, 0)', H.groesse],
    ['health.bmi(70, 1.75)', 'health.bmi(-70, 1.75)', H.masse],
    ['health.bmi(70, 1.75)', 'health.bmi(70, -1.75)', H.groesse],
    // Ergebnis jenseits des darstellbaren Zahlenbereichs (die Sprache kennt
    // keine Exponent-Schreibweise; die Zehnerpotenzen kommen über pow).
    [
      'percent.increase(pow(10, 300), 100)',
      'percent.increase(pow(10, 308), 100)',
      P.nichtDarstellbar,
    ],
    [
      'percent.share(1, pow(10, -300))',
      'percent.share(pow(10, 10), pow(10, -300))',
      P.nichtDarstellbar,
    ],
    ['health.bmi(70, pow(10, -150))', 'health.bmi(70, pow(10, -160))', H.nichtDarstellbar],
    ['unit.metertoinch(pow(10, 300))', 'unit.metertoinch(pow(10, 308))', U.nichtDarstellbar],
    [
      'unit.celsiustofahrenheit(pow(10, 300))',
      'unit.celsiustofahrenheit(pow(10, 308))',
      U.nichtDarstellbar,
    ],
  ];

  it.each(faelle)('%s rechnet, %s meldet', (innen, aussen, key) => {
    expect(typeof wert(innen)).toBe('number');
    expect(Number.isFinite(wert(innen))).toBe(true);
    expect(wert(aussen)).toEqual(meldung(key));
  });

  it('der Abnahme-Fall der Story: percent.share(5, 0) meldet das Ganze, auch gerundet', () => {
    expect(wert('percent.share(5, 0)')).toEqual(meldung(P.ganzes));
    expect(wert('round(percent.share(5, 0), 1)')).toEqual(meldung(P.ganzes));
  });

  it('Einheiten ohne Bereich: negative Kelvin und Längen rechnen nach der Gleichung', () => {
    expect(wert('unit.kelvintocelsius(-10)')).toBeCloseTo(-283.15, 10);
    expect(wert('unit.metertofoot(-0.3048)')).toBe(-1);
  });

  it('eine fehlende oder überzählige Angabe ist ein Stelligkeits-Fehler, nie ein Wert', () => {
    for (const src of [
      'percent.share(5)',
      'percent.base(1, 2, 3)',
      'unit.celsiustokelvin()',
      'unit.miletometer(1, 2)',
      'health.bmi(70)',
      'health.bmi(70, 1.75, 1)',
    ]) {
      expect(katalog.validateQuery(ausdruck(src)).code, src).toBe('functionArity');
    }
  });

  it('eine Angabe, die keine Zahl ist, oder ein fehlendes Feld meldet; ein Zahl-Text rechnet', () => {
    for (const [src, key] of [
      ['percent.share("viel", 20)', P.keineZahl],
      ['percent.increase(wert, 19)', P.keineZahl],
      ['percent.change(1 = 1, 5)', P.keineZahl],
      ['unit.celsiustokelvin("warm")', U.keineZahl],
      ['unit.miletometer(strecke)', U.keineZahl],
      ['unit.inchtometer(1 = 1)', U.keineZahl],
      ['health.bmi("schwer", 1.75)', H.keineZahl],
      ['health.bmi(70, größe)', H.keineZahl],
    ]) {
      expect(wert(src), src).toEqual(meldung(key));
    }
    expect(wert('health.bmi(m, h)', { m: '70', h: '1.75' })).toBe(wert('health.bmi(70, 1.75)'));
    expect(wert('unit.miletometer(s)', { s: '2' })).toBe(3218.688);
    expect(wert('percent.share(t, g)', { t: '5', g: '20' })).toBe(25);
  });

  it('jede Meldung steht in allen fünf Sprachen', () => {
    const schluessel = new Set([...Object.values(P), ...Object.values(U), ...Object.values(H)]);
    for (const [code, woerter] of Object.entries({ de, en, fr, es, it: it_ })) {
      for (const key of schluessel) expect(woerter[key], `${code} ${key}`).toBeTruthy();
    }
    expect(de[P.ganzes]).toBe('Ganzes außerhalb des Bereichs: erlaubt ist jede Zahl außer 0');
    expect(de[H.groesse]).toBe('Größe außerhalb des Bereichs von über 0 m');
  });
});

describe('Prozent, Einheiten, Gesundheit: dieselbe Antwort an den Rechen-Orten und Aus-Zustand (AK3, AK4)', () => {
  const TEXT =
    'P {= percent.increase(200, 50) =}, F {= round(unit.celsiustofahrenheit(37), 1) =}, ' +
    'B {= round(health.bmi(70, 1.75), 1) =} und M {= percent.share(5, 0) =}';
  const TABELLE =
    '```perspective-datatable\n' +
    'columns: Masse:number, Größe:number, BMI:number = round(health.bmi(Masse, Größe), 1), ' +
    'Fahrenheit:number = round(unit.celsiustofahrenheit(37), 1), ' +
    'Anteil:number = percent.share(Masse, 0)\n' +
    '| 70 | 1.75 |\n| 70 | 0 |\n```\n';
  const FELDER = [
    { name: 'masse', type: 'number' },
    { name: 'größe', type: 'number' },
    { name: 'bmi', type: 'formula', options: { expression: 'round(health.bmi(masse, größe), 1)' } },
    { name: 'mehr', type: 'formula', options: { expression: 'percent.increase(masse, 50)' } },
    { name: 'zoll', type: 'formula', options: { expression: 'unit.metertoinch(größe)' } },
  ];

  it('an: Fließtext, berechnete Spalte und Formel-Feld zeigen 300, 98.6 und 22.9, im Bereichs-Fehler die Meldung', () => {
    const text = renderMarkdown(TEXT, 'de');
    expect(text).toContain('title="percent.increase(200, 50)">300</span>');
    expect(text).toContain('title="round(unit.celsiustofahrenheit(37), 1)">98.6</span>');
    expect(text).toContain('title="round(health.bmi(70, 1.75), 1)">22.9</span>');
    expect(text).toContain(`data-i18n-title="${P.ganzes}">⚠︎</span>`);
    const tabelle = renderMarkdown(TABELLE, 'de');
    expect(tabelle).toMatch(/data-dt-col="2"[^>]*>22\.9<\/td>/);
    expect(tabelle).toMatch(/data-dt-col="3"[^>]*>98\.6<\/td>/);
    expect(tabelle).toContain(`data-i18n-title="${H.groesse}"`);
    expect(tabelle).toContain(`data-i18n-title="${P.ganzes}"`);
    expect(tabelle).not.toContain('pdt-errors');
    const satz = werteAbgeleiteteFelder(FELDER, { masse: 70, größe: 1.75 });
    expect(satz.bmi).toEqual({ value: 22.9, hint: null });
    expect(satz.mehr).toEqual({ value: 105, hint: null });
    expect(satz.zoll.value).toBeCloseTo(1.75 / 0.0254, 10);
    expect(werteAbgeleiteteFelder(FELDER, { masse: 70, größe: 0 }).bmi).toEqual({
      value: null,
      hint: H.groesse,
    });
  });

  it.each([
    ['percent', 'percent.share(5, 20)'],
    ['unit', 'unit.celsiustokelvin(0)'],
    ['health', 'health.bmi(70, 1.75)'],
  ])(
    'aus: Namensraum %s mit eigenem Prüf-Code, keine Rechnung, an jedem Ort der Hinweis',
    (ns, src) => {
      configureExtensions(['formula-library']);
      expect(katalog.validateQuery(ausdruck(src)).code).toBe(katalog.FUNCTION_OFF_CODE);
      expect(wert(src)).toBeNull();
      expect(renderMarkdown(`W {= ${src} =}`, 'de')).toContain(
        'data-i18n-title="query.formulaLibraryOff">⚠︎</span>',
      );
      const zaun = `\`\`\`perspective-datatable\ncolumns: A:number, B:number = ${src}\n| 1 |\n\`\`\`\n`;
      expect(renderMarkdown(zaun, 'de')).toContain('data-i18n-title="query.formulaLibraryOff"');
      const feld = [{ name: 'f', type: 'formula', options: { expression: src } }];
      expect(werteAbgeleiteteFelder(feld, {}).f).toEqual({
        value: null,
        hint: 'query.formulaLibraryOff',
      });
      // Grundfunktionen und Konstanten rechnen weiter.
      expect(wert('round(pi(), 2)')).toBe(3.14);
      configureExtensions([]);
      expect(typeof wert(src)).toBe('number');
    },
  );
});
