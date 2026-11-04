// 4T-002454 (Epic 3E-000378, Story 4S-001140 AK2, AK3, AK6, AK7): die
// Formel-Gruppe «Naturkonstanten» der Formel-Bibliothek, Namensraum `const.`.
// Geprüft werden der Wert jeder Konstante gegen die Story-Tabelle (Fundstellen
// im Kapitel «Lösung» des Tasks), der Aufruf ohne Angaben und die überzählige
// Angabe, der Aus-Zustand mit weiter rechnenden Konstanten des Kerns und die
// Katalog-Schlüssel in fünf Sprachen. Die Anzeige sehr großer und sehr kleiner
// Werte in der Abfrage-Zelle steht hier; dieselbe Anzeige an den übrigen
// Rechen-Orten prüfen die Paritäts-Fälle in
// render/inline-calc.test.js, perspective-datatable.test.js und
// property-profiles-abgeleitet.test.js.
//
// Katalog, Auswerter und Werte-Modell über createRequire, damit der Schalter in
// derselben Modul-Instanz steht, die die Rechen-Orte intern laden (Muster
// formel-bibliothek-alltag.test.js).
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';
import { werteAbgeleiteteFelder } from '../../src/shared/property-profiles-abgeleitet.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';
import { disabledFeatureKeySet } from '../../src/shared/extensions/extensions-core.js';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import fr from '../../src/i18n/fr.json';
import es from '../../src/i18n/es.json';
import it_ from '../../src/i18n/it.json';

const req = createRequire(import.meta.url);
const katalog = req('../../src/shared/query/query-functions.js');
const { evaluateExpression } = req('../../src/shared/query/perspective-query-eval.js');
const { parseQuery } = req('../../src/shared/query/perspective-query.js');
const { formatValue } = req('../../src/shared/query/query-format.js');
const { cellSegments } = req('../../src/shared/query/result-display.js');
const { CONST_GROUP, CONST_VALUES } = req('../../src/shared/query/formula-const.js');
const { FORMULA_LIBRARY_GROUPS } = req('../../src/shared/query/formula-library.js');
const { HELP_FEATURE_GROUPS } = req('../../src/shared/manual/manual-feature-groups.js');

function ausdruck(src) {
  const r = parseQuery(src, { expression: true });
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}
const wert = (src, props = {}) => evaluateExpression(ausdruck(src), { props });

// Die Story-Tabelle: Name, Wert, Einheit. Die Gaskonstante steht dort mit den
// zehn Stellen, die CODATA nennt («8.314 462 618...»); der Katalog trägt den
// vollständigen exakten Wert, das Produkt aus Avogadro- und Boltzmann-Konstante.
const TABELLE = [
  ['c', 299792458, 'm/s'],
  ['g', 9.80665, 'm/s²'],
  ['t0', 273.15, 'K'],
  ['na', 6.02214076e23, '1/mol'],
  ['r', 8.31446261815324, 'J/(mol·K)'],
  ['h', 6.62607015e-34, 'J·s'],
  ['p0', 1013.25, 'hPa'],
];
const NAMEN = TABELLE.map(([n]) => `const.${n}`);
const SCHLUESSEL = ['help.feature', 'help.featureName', 'help.featureAccess'].map(
  (p) => `${p}.formulaConst`,
);

afterEach(() => configureExtensions([]));

describe('Naturkonstanten: Gruppe der Bibliothek (4T-002454)', () => {
  it('trägt sieben Konstanten im Namensraum const, je ohne Angaben aufzurufen', () => {
    expect(FORMULA_LIBRARY_GROUPS).toContain(CONST_GROUP);
    expect(katalog.functionGroups().find((g) => g.namespace === 'const')).toEqual({
      namespace: 'const',
      extension: 'formula-library',
      names: NAMEN,
    });
    for (const name of NAMEN) {
      expect(katalog.lookupFunction(name).lage, name).toBe('an');
      expect(katalog.lookupFunction(name).def.arity, name).toEqual([0, 0]);
    }
  });

  it('die Werte stehen an einer Stelle des Moduls, in der Einheit der Story-Tabelle', () => {
    expect(CONST_VALUES).toEqual(Object.fromEntries(TABELLE.map(([n, w]) => [n, w])));
  });
});

describe('Naturkonstanten: Wert je Konstante nach der Story-Tabelle (AK2)', () => {
  it.each(TABELLE)('const.%s() liefert %s in %s', (name, erwartet) => {
    expect(wert(`const.${name}()`)).toBe(erwartet);
  });

  it('die Gaskonstante ist exakt N_A · k und trifft die zehn Stellen der Story', () => {
    expect(wert('const.r()')).toBeCloseTo(8.314462618, 9);
    expect(wert('const.r()')).toBeCloseTo(wert('const.na()') * 1.380649e-23, 12);
  });

  it('rechnen in Ausdrücken wie jede Zahl; t0 ist der Versatz der Temperatur-Umrechnung', () => {
    expect(wert('const.c() * 2')).toBe(599584916);
    expect(wert('round(const.g(), 2)')).toBe(9.81);
    expect(wert('const.p0() * 100')).toBe(101325);
    expect(wert('unit.celsiustokelvin(0)')).toBe(wert('const.t0()'));
    // Molare Planck-Konstante N_A · h, CODATA «3.990 312 712... e-10» J/(Hz·mol).
    expect(wert('const.h() * const.na()')).toBeCloseTo(3.990312712e-10, 18);
  });
});

describe('Naturkonstanten: Anzeige in der Abfrage (AK3)', () => {
  // Die Zelle einer Abfrage zeigt den Wert über formatValue; dieselbe
  // Zeichenkette erscheint im Fließtext, in der berechneten Spalte und im
  // Formel-Feld (Paritäts-Fälle der drei Prüfdateien im Kopf).
  it('const.na() und const.h() erscheinen mit allen Stellen der Quelle', () => {
    expect(cellSegments(wert('const.na()'))).toEqual([{ text: '6.02214076e+23' }]);
    expect(cellSegments(wert('const.h()'))).toEqual([{ text: '6.62607015e-34' }]);
    expect(formatValue(wert('const.c()'))).toBe('299792458');
  });
});

describe('Naturkonstanten: Ränder (AK7 der Story)', () => {
  it('eine überzählige Angabe ist ein Stelligkeits-Fehler, nie ein Wert', () => {
    expect(katalog.validateQuery(ausdruck('const.c(1)')).code).toBe('functionArity');
    for (const name of NAMEN) {
      expect(katalog.validateQuery(ausdruck(`${name}(1)`)).code, name).toBe('functionArity');
      expect(katalog.validateQuery(ausdruck(`${name}()`)), name).toBeNull();
    }
  });
});

describe('Naturkonstanten: Aus-Zustand, die Konstanten des Kerns rechnen weiter (AK4)', () => {
  it('const.c() aus: eigener Prüf-Code, keine Rechnung, an jedem Ort der Hinweis; pi() rechnet', () => {
    configureExtensions(['formula-library']);
    for (const name of NAMEN) {
      expect(katalog.validateQuery(ausdruck(`${name}()`)).code, name).toBe(
        katalog.FUNCTION_OFF_CODE,
      );
      expect(wert(`${name}()`), name).toBeNull();
    }
    expect(renderMarkdown('W {= const.c() =}', 'de')).toContain(
      'data-i18n-title="query.formulaLibraryOff">⚠︎</span>',
    );
    const zaun = '```perspective-datatable\ncolumns: A:number, B:number = const.c()\n| 1 |\n```\n';
    expect(renderMarkdown(zaun, 'de')).toContain('data-i18n-title="query.formulaLibraryOff"');
    const feld = [{ name: 'f', type: 'formula', options: { expression: 'const.c()' } }];
    expect(werteAbgeleiteteFelder(feld, {}).f).toEqual({
      value: null,
      hint: 'query.formulaLibraryOff',
    });
    // Die Konstanten des Kerns gehören nicht zur Bibliothek.
    expect(wert('pi()')).toBe(Math.PI);
    expect(wert('e()')).toBe(Math.E);
    expect(wert('round(phi(), 3)')).toBe(1.618);
    expect(wert('sqrt2()')).toBe(Math.SQRT2);
    expect(renderMarkdown('K {= round(pi(), 2) =}', 'de')).toContain('>3.14</span>');
    configureExtensions([]);
    expect(wert('const.c()')).toBe(299792458);
  });
});

describe('Naturkonstanten: Katalog-Eintrag (4T-002454)', () => {
  it('Name, Beschreibung und Zugang stehen in allen fünf Sprachen', () => {
    for (const [code, woerter] of Object.entries({ de, en, fr, es, it: it_ })) {
      for (const key of SCHLUESSEL) expect(woerter[key], `${code} ${key}`).toBeTruthy();
      expect(woerter['help.feature.formulaConst'], code).toContain('const.');
    }
    expect(de['help.featureName.formulaConst']).toBe('Naturkonstanten');
  });

  it('gehört zur Erweiterung «Formel-Bibliothek» und steht in der Gruppe hinter dem Body-Mass-Index', () => {
    expect(extensionById('formula-library').featureKeys).toContain('help.feature.formulaConst');
    expect(disabledFeatureKeySet(['formula-library']).has('help.feature.formulaConst')).toBe(true);
    const gruppe = HELP_FEATURE_GROUPS.find((g) =>
      g.features.includes('help.feature.formulaHealth'),
    );
    const i = gruppe.features.indexOf('help.feature.formulaHealth');
    expect(gruppe.features[i + 1]).toBe('help.feature.formulaConst');
  });
});
