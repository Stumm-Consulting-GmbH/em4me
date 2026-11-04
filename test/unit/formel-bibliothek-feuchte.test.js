// 4T-002451 (Epic 3E-000378, Story 4S-001139 AK1, AK2, AK5 bis AK7): die
// Formel-Gruppe «Feuchte und Taupunkt» der Formel-Bibliothek. Geprüft werden
// die Beispielwerte der Quellen (Fundstellen im Kapitel «Lösung» des Tasks),
// beide Seiten jeder Bereichs-Grenze, Angaben, die keine Zahl sind, der
// Aus-Zustand und dieselbe Antwort an den Rechen-Orten der prozess-neutralen
// Module; die Abfrage im Haupt-Prozess prüft formel-bibliothek-aus-zustand.test.js.
//
// **Warum eine eigene Datei.** Die Prüfdatei des Katalogs
// (perspective-query-eval.test.js) trägt die Formeln mit ihren Grenzen nicht
// mehr in ihrem Zeilen-Budget, und die Formel-Gruppen der Stufen 2 und 3
// wachsen weiter.
//
// **Toleranzen.** Die Quellen runden; geprüft wird «im Rahmen der Rundung der
// Quelle» (Story, AK1). Wo die Quelle eine genauere Tafel ist als die
// Magnus-Formel, gilt deren genannte Standardabweichung: ±0,3 % über Wasser und
// ±0,5 % über Eis (de.wikipedia «Sättigungsdampfdruck», Abschnitt 6.1).
//
// Katalog, Auswerter und Werte-Modell über createRequire, damit der Schalter in
// derselben Modul-Instanz steht, die die Rechen-Orte intern laden (Muster
// render/extensions-aus-formel-bibliothek.test.js).
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
const { HUMIDITY_GROUP, HUMIDITY_MESSAGES: M } = req('../../src/shared/query/formula-humidity.js');
const { FORMULA_LIBRARY_GROUPS } = req('../../src/shared/query/formula-library.js');

function ausdruck(src) {
  const r = parseQuery(src, { expression: true });
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}
const wert = (src, props = {}) => evaluateExpression(ausdruck(src), { props });
const meldung = (key) => messageValue(key);

// Relative Abweichung von einem Bezugswert.
const abweichung = (ist, soll) => Math.abs(ist - soll) / soll;

// Sättigungsdampfdruck in hPa aus der Sättigungsmenge in g/m³ der Tafel nach
// Sonntag 1982 (de.wikipedia «Sättigung (Physik)», Abschnitt «Sättigung von
// Gasen am Beispiel des Wasserdampfs»), über deren eigene Gleichung
// ρ = E / (R_w · T) mit R_w = 461,52 J/(kg·K).
const ausTafel = (gProM3, t) => ((gProM3 / 1000) * 461.52 * (t + 273.15)) / 100;

afterEach(() => configureExtensions([]));

describe('Feuchte und Taupunkt: Gruppe der Bibliothek (4T-002451)', () => {
  it('trägt die sieben Formeln unter ihren Namen im Namensraum humidity', () => {
    expect(FORMULA_LIBRARY_GROUPS).toContain(HUMIDITY_GROUP);
    const gruppe = katalog.functionGroups().find((g) => g.namespace === 'humidity');
    expect(gruppe).toEqual({
      namespace: 'humidity',
      extension: 'formula-library',
      names: [
        'humidity.saturationpressure',
        'humidity.saturationpressureice',
        'humidity.vaporpressure',
        'humidity.absolute',
        'humidity.relative',
        'humidity.dewpoint',
        'humidity.relativefromdewpoint',
      ],
    });
    for (const name of gruppe.names) expect(katalog.lookupFunction(name).lage).toBe('an');
  });
});

describe('Feuchte und Taupunkt: Beispielwerte der Quellen (AK2)', () => {
  it('Sättigungsdampfdruck über Wasser: K1 bei 0 °C, Tafel-Werte im Rahmen von ±0,3 %', () => {
    // WMO-Nr. 8, Anhang 4.B: ew(0) = 6.112 hPa.
    expect(wert('humidity.saturationpressure(0)')).toBeCloseTo(6.112, 12);
    expect(abweichung(wert('humidity.saturationpressure(20)'), ausTafel(17.2848, 20))).toBeLessThan(
      0.003,
    );
    expect(
      abweichung(wert('humidity.saturationpressure(-10)'), ausTafel(2.3596, -10)),
    ).toBeLessThan(0.003);
  });

  it('Sättigungsdampfdruck über Eis: K1 bei 0 °C, Tafel-Werte im Rahmen von ±0,5 %', () => {
    expect(wert('humidity.saturationpressureice(0)')).toBeCloseTo(6.112, 12);
    expect(
      abweichung(wert('humidity.saturationpressureice(-10)'), ausTafel(2.138, -10)),
    ).toBeLessThan(0.005);
    expect(
      abweichung(wert('humidity.saturationpressureice(-20)'), ausTafel(0.88211, -20)),
    ).toBeLessThan(0.005);
    // Unter 0 °C liegt der Wert über Eis unter dem über Wasser.
    expect(wert('humidity.saturationpressureice(-10)')).toBeLessThan(
      wert('humidity.saturationpressure(-10)'),
    );
  });

  it('Dampfdruck: e = rh/100 · E(t), bei 100 % der Sättigungsdampfdruck', () => {
    expect(wert('humidity.vaporpressure(20, 100)')).toBe(wert('humidity.saturationpressure(20)'));
    expect(
      abweichung(wert('humidity.vaporpressure(20, 50)'), ausTafel(17.2848, 20) / 2),
    ).toBeLessThan(0.003);
    // Unter 0 °C über Wasser (WMO-Nr. 8, Anhang 4.A, Absatz 17).
    expect(wert('humidity.vaporpressure(-10, 100)')).toBe(wert('humidity.saturationpressure(-10)'));
  });

  it('absolute Feuchte: 7,3 und 9,7 g/m³ nach de.wikipedia «Luftfeuchtigkeit», Gegenprobe wetterochs.de', () => {
    expect(wert('round(humidity.absolute(21, 40), 1)')).toBe(7.3);
    expect(wert('round(humidity.absolute(22, 50), 1)')).toBe(9.7);
    expect(abweichung(wert('humidity.absolute(20, 100)'), 17.2848)).toBeLessThan(0.003);
    // Zahlenwertgleichung nach wetterochs.de «Feuchte»: AF = 10^5 · mw/R* · DD/T_K.
    const dd = wert('humidity.vaporpressure(20, 50)');
    const af = ((1e5 * 18.016) / 8314.3) * (dd / 293.15);
    expect(abweichung(wert('humidity.absolute(20, 50)'), af)).toBeLessThan(1e-4);
  });

  it('relative Feuchte aus absoluter: 20 % bei 7,6 g/m³ und 34,4 °C, Umkehrung der absoluten', () => {
    expect(wert('round(humidity.relative(34.4, 7.6))')).toBe(20);
    expect(wert('humidity.relative(20, humidity.absolute(20, 37))')).toBeCloseTo(37, 9);
    expect(wert('humidity.relative(20, 0)')).toBe(0);
  });

  it('Taupunkt: etwa 4 °C und 16 °C nach de.wikipedia «Taupunkt», 9,3 °C bei 20 °C und 50 %', () => {
    expect(wert('round(humidity.dewpoint(18, 40))')).toBe(4);
    expect(wert('round(humidity.dewpoint(22, 70))')).toBe(16);
    expect(wert('round(humidity.dewpoint(20, 50), 1)')).toBe(9.3);
    expect(wert('humidity.dewpoint(20, 100)')).toBeCloseTo(20, 9);
  });

  it('relative Feuchte aus dem Taupunkt: die gerundeten Taupunkte der Quelle schließen 40 % und 70 % ein', () => {
    // «etwa 4 °C» heißt 3,5 bis 4,5 °C; dazwischen liegt die Feuchte der Quelle.
    expect(wert('humidity.relativefromdewpoint(18, 3.5)')).toBeLessThan(40);
    expect(wert('humidity.relativefromdewpoint(18, 4.5)')).toBeGreaterThan(40);
    expect(wert('humidity.relativefromdewpoint(22, 15.5)')).toBeLessThan(70);
    expect(wert('humidity.relativefromdewpoint(22, 16.5)')).toBeGreaterThan(70);
    expect(wert('humidity.relativefromdewpoint(20, humidity.dewpoint(20, 50))')).toBeCloseTo(50, 9);
    expect(wert('humidity.relativefromdewpoint(20, 20)')).toBe(100);
  });
});

describe('Feuchte und Taupunkt: Grenzen beiderseits (AK3, AK7 der Story)', () => {
  const faelle = [
    // [Ausdruck innerhalb, Ausdruck außerhalb, Meldung]
    ['humidity.saturationpressure(-45)', 'humidity.saturationpressure(-45.01)', M.temperatur],
    ['humidity.saturationpressure(60)', 'humidity.saturationpressure(60.01)', M.temperatur],
    [
      'humidity.saturationpressureice(-65)',
      'humidity.saturationpressureice(-65.01)',
      M.temperaturEis,
    ],
    [
      'humidity.saturationpressureice(0.01)',
      'humidity.saturationpressureice(0.02)',
      M.temperaturEis,
    ],
    ['humidity.vaporpressure(-45, 50)', 'humidity.vaporpressure(-45.01, 50)', M.temperatur],
    ['humidity.vaporpressure(20, 0)', 'humidity.vaporpressure(20, -0.01)', M.relativ],
    ['humidity.vaporpressure(20, 100)', 'humidity.vaporpressure(20, 100.01)', M.relativ],
    ['humidity.absolute(60, 50)', 'humidity.absolute(60.01, 50)', M.temperatur],
    ['humidity.absolute(20, 0)', 'humidity.absolute(20, -0.01)', M.relativ],
    ['humidity.absolute(20, 100)', 'humidity.absolute(20, 100.01)', M.relativ],
    ['humidity.relative(-45, 0.05)', 'humidity.relative(-45.01, 0.05)', M.temperatur],
    ['humidity.relative(20, 0)', 'humidity.relative(20, -0.01)', M.absolutNegativ],
    [
      'humidity.relative(20, humidity.absolute(20, 100))',
      'humidity.relative(20, humidity.absolute(20, 100) * 1.0001)',
      M.absolutUebersaettigt,
    ],
    ['humidity.dewpoint(60, 50)', 'humidity.dewpoint(60.01, 50)', M.temperatur],
    ['humidity.dewpoint(20, 0.5)', 'humidity.dewpoint(20, 0)', M.relativTaupunkt],
    ['humidity.dewpoint(20, 100)', 'humidity.dewpoint(20, 100.01)', M.relativTaupunkt],
    // Ein Taupunkt unter dem Bereich der Magnus-Formel ist keine Näherung mehr.
    ['humidity.dewpoint(20, 0.5)', 'humidity.dewpoint(20, 0.4)', M.taupunkt],
    [
      'humidity.relativefromdewpoint(20, 20)',
      'humidity.relativefromdewpoint(20, 20.01)',
      M.taupunktUeberTemperatur,
    ],
    [
      'humidity.relativefromdewpoint(20, -45)',
      'humidity.relativefromdewpoint(20, -45.01)',
      M.taupunkt,
    ],
    [
      'humidity.relativefromdewpoint(60, 10)',
      'humidity.relativefromdewpoint(60.01, 10)',
      M.temperatur,
    ],
  ];

  it.each(faelle)('%s rechnet, %s meldet', (innen, aussen, key) => {
    expect(typeof wert(innen)).toBe('number');
    expect(Number.isFinite(wert(innen))).toBe(true);
    expect(wert(aussen)).toEqual(meldung(key));
  });

  it('der Abnahme-Fall der Story: humidity.dewpoint(20, 120) meldet die relative Feuchte, auch gerundet', () => {
    expect(wert('humidity.dewpoint(20, 120)')).toEqual(meldung(M.relativTaupunkt));
    expect(wert('round(humidity.dewpoint(20, 120), 1)')).toEqual(meldung(M.relativTaupunkt));
  });

  it('eine Angabe, die keine Zahl ist, oder ein fehlendes Feld meldet; ein Zahl-Text rechnet', () => {
    const keineZahl = meldung(M.keineZahl);
    expect(wert('humidity.dewpoint("warm", 50)')).toEqual(keineZahl);
    expect(wert('humidity.dewpoint(temp, 50)')).toEqual(keineZahl);
    expect(wert('humidity.saturationpressure(1 = 1)')).toEqual(keineZahl);
    expect(wert('humidity.dewpoint(temp, feuchte)', { temp: '20', feuchte: '50' })).toBe(
      wert('humidity.dewpoint(20, 50)'),
    );
  });

  it('jede Meldung steht in allen fünf Sprachen', () => {
    for (const [code, woerter] of Object.entries({ de, en, fr, es, it: it_ })) {
      for (const key of Object.values(M)) expect(woerter[key], `${code} ${key}`).toBeTruthy();
    }
    expect(de[M.relativTaupunkt]).toBe(
      'Relative Feuchte außerhalb des Bereichs von über 0 bis 100 %',
    );
  });
});

describe('Feuchte und Taupunkt: dieselbe Antwort an den Rechen-Orten und Aus-Zustand (AK3, AK4)', () => {
  const TEXT = 'T {= round(humidity.dewpoint(20, 50), 1) =} und M {= humidity.dewpoint(20, 120) =}';
  const TABELLE =
    '```perspective-datatable\n' +
    'columns: Temp:number, Feuchte:number, Taupunkt:number = round(humidity.dewpoint(Temp, Feuchte), 1)\n' +
    '| 20 | 50 |\n| 20 | 120 |\n```\n';
  const FELDER = [
    { name: 't', type: 'number' },
    { name: 'rh', type: 'number' },
    { name: 'tau', type: 'formula', options: { expression: 'round(humidity.dewpoint(t, rh), 1)' } },
  ];

  it('an: Fließtext, berechnete Spalte und Formel-Feld zeigen 9.3, im Bereichs-Fehler die Meldung', () => {
    const text = renderMarkdown(TEXT, 'de');
    expect(text).toContain('title="round(humidity.dewpoint(20, 50), 1)">9.3</span>');
    expect(text).toContain(`data-i18n-title="${M.relativTaupunkt}">⚠︎</span>`);
    const tabelle = renderMarkdown(TABELLE, 'de');
    expect(tabelle).toMatch(/data-dt-col="2"[^>]*>9\.3<\/td>/);
    expect(tabelle).toContain(`data-i18n-title="${M.relativTaupunkt}"`);
    expect(tabelle).not.toContain('pdt-errors');
    expect(werteAbgeleiteteFelder(FELDER, { t: 20, rh: 50 }).tau).toEqual({
      value: 9.3,
      hint: null,
    });
    expect(werteAbgeleiteteFelder(FELDER, { t: 20, rh: 120 }).tau).toEqual({
      value: null,
      hint: M.relativTaupunkt,
    });
  });

  // 4T-002456, Zweitblick-Befund 3 des Epic-Abschlusses: Eine Spalte, die auf
  // eine Meldungs-Zelle verweist, übernimmt die Meldung, wie ein Formel-Feld
  // der Eigenschafts-Profile, statt mit null zu rechnen und leer zu bleiben.
  it('an: eine abhängige Spalte übernimmt die Meldung der Zelle, auf die sie verweist', () => {
    const tabelle = renderMarkdown(
      '```perspective-datatable\n' +
        'columns: Temp:number, Feuchte:number, Taupunkt:number = round(humidity.dewpoint(Temp, Feuchte), 1), Folge:number = Taupunkt + 1\n' +
        '| 20 | 120 |\n```\n',
      'de',
    );
    expect(tabelle.split(`data-i18n-title="${M.relativTaupunkt}"`)).toHaveLength(3);
    expect(tabelle).toMatch(/data-dt-col="3"[^>]*>—<\/td>/);
    expect(tabelle).not.toContain('pdt-errors');
    const folge = werteAbgeleiteteFelder(
      [...FELDER, { name: 'folge', type: 'formula', options: { expression: 'tau + 1' } }],
      { t: 20, rh: 120 },
    ).folge;
    expect(folge).toEqual({ value: null, hint: M.relativTaupunkt });
  });

  it('aus: eigener Prüf-Code, keine Rechnung, an jedem Ort der Hinweis der Bibliothek', () => {
    configureExtensions(['formula-library']);
    expect(katalog.validateQuery(ausdruck('humidity.dewpoint(20, 50)')).code).toBe(
      katalog.FUNCTION_OFF_CODE,
    );
    expect(wert('humidity.dewpoint(20, 50)')).toBeNull();
    expect(renderMarkdown(TEXT, 'de')).toContain(
      'data-i18n-title="query.formulaLibraryOff">⚠︎</span>',
    );
    expect(renderMarkdown(TABELLE, 'de')).toContain('data-i18n-title="query.formulaLibraryOff"');
    expect(werteAbgeleiteteFelder(FELDER, { t: 20, rh: 50 }).tau).toEqual({
      value: null,
      hint: 'query.formulaLibraryOff',
    });
    // Grundfunktionen rechnen weiter.
    expect(wert('round(ln(e()), 1)')).toBe(1);
    configureExtensions([]);
    expect(wert('round(humidity.dewpoint(20, 50), 1)')).toBe(9.3);
  });
});
