// 4T-002452 (Epic 3E-000378, Story 4S-001139 AK1, AK2, AK4 bis AK7): die
// Formel-Gruppe «Finanzmathematik» der Formel-Bibliothek. Geprüft werden die
// drei Referenzwerte der Story und die Beispielwerte der Quellen (Fundstellen
// im Kapitel «Lösung» des Tasks), Zins 0, beide Zahlungs-Zeitpunkte, beide
// Seiten jeder Bereichs-Grenze, fehlende Konvergenz der iterativen Formeln,
// Angaben, die keine Zahl sind, die Form der Zahlungen bei Kapitalwert und
// internem Zinsfuß, der Aus-Zustand und dieselbe Antwort an den Rechen-Orten
// der prozess-neutralen Module.
//
// **Toleranzen.** Die Quellen runden; geprüft wird «im Rahmen der Rundung der
// Quelle» (Story, AK1), also mit `round` auf die Stellen der Quelle.
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
const {
  FINANCE_GROUP,
  FINANCE_MESSAGES: M,
  FINANCE_ITERATION,
} = req('../../src/shared/query/formula-finance.js');
const { FORMULA_LIBRARY_GROUPS } = req('../../src/shared/query/formula-library.js');

function ausdruck(src) {
  const r = parseQuery(src, { expression: true });
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}
const wert = (src, props = {}) => evaluateExpression(ausdruck(src), { props });
const meldung = (key) => messageValue(key);

// Die Zahlungen der Beispiele als Listen-Feld (die Sprache kennt kein
// Listen-Literal; Kapitel «Lösung», Form der Zahlungen).
const STORY_ZAHLUNGEN = { cf: [-10000, 3500, 7600, 1000] };
const IRR_VIER_JAHRE = { cf: [-70000, 12000, 15000, 18000, 21000] };
const IRR_FUENF_JAHRE = { cf: [-70000, 12000, 15000, 18000, 21000, 26000] };
const NPV_ERTRAEGE = { cf: [8000, 9200, 10000, 12000, 14500] };

afterEach(() => configureExtensions([]));

describe('Finanzmathematik: Gruppe der Bibliothek (4T-002452)', () => {
  it('trägt die neun Formeln unter ihren Namen im Namensraum finance', () => {
    expect(FORMULA_LIBRARY_GROUPS).toContain(FINANCE_GROUP);
    const gruppe = katalog.functionGroups().find((g) => g.namespace === 'finance');
    expect(gruppe).toEqual({
      namespace: 'finance',
      extension: 'formula-library',
      names: [
        'finance.pmt',
        'finance.pv',
        'finance.fv',
        'finance.npv',
        'finance.irr',
        'finance.rate',
        'finance.nper',
        'finance.effect',
        'finance.nominal',
      ],
    });
    for (const name of gruppe.names) expect(katalog.lookupFunction(name).lage).toBe('an');
    // Start-Schätzwert der Norm (OpenFormula 6.12.24 und 6.12.42).
    expect(FINANCE_ITERATION.START_SCHAETZWERT).toBe(0.1);
  });

  it('nimmt Angaben und Vorgaben in der Zahl der Story-Tabelle an', () => {
    const stellen = (name) => katalog.lookupFunction(name).def.arity;
    expect(stellen('finance.pmt')).toEqual([3, 5]);
    expect(stellen('finance.pv')).toEqual([3, 5]);
    expect(stellen('finance.fv')).toEqual([3, 5]);
    expect(stellen('finance.npv')).toEqual([2, 255]);
    expect(stellen('finance.irr')).toEqual([1, 2]);
    expect(stellen('finance.rate')).toEqual([3, 6]);
    expect(stellen('finance.nper')).toEqual([3, 5]);
    expect(stellen('finance.effect')).toEqual([2, 2]);
    expect(stellen('finance.nominal')).toEqual([2, 2]);
    expect(katalog.validateQuery(ausdruck('finance.pmt(0.01, 10)')).code).toBe('functionArity');
  });
});

describe('Finanzmathematik: Referenzwerte der Story und Beispielwerte der Quellen (AK2)', () => {
  it('Rate: −1037.03 am Ende und −1030.16 am Anfang (Story), −129.08 beim Ansparen', () => {
    expect(wert('round(finance.pmt(0.08/12, 10, 10000), 2)')).toBe(-1037.03);
    expect(wert('round(finance.pmt(0.08/12, 10, 10000, 0, 1), 2)')).toBe(-1030.16);
    expect(wert('round(finance.pmt(0.06/12, 18 * 12, 0, 50000), 2)')).toBe(-129.08);
  });

  it('Barwert: −35019.37 bei Rate 500 und Endwert 20000 (Story)', () => {
    expect(wert('round(finance.pv(0.08/12, 48, 500, 20000), 2)')).toBe(-35019.37);
  });

  it('Endwert: 2581.40, 12682.50, 82846.25 und 2301.40 nach den Beispielen der Quelle', () => {
    expect(wert('round(finance.fv(0.06/12, 10, -200, -500, 1), 2)')).toBe(2581.4);
    expect(wert('round(finance.fv(0.12/12, 12, -1000), 2)')).toBe(12682.5);
    expect(wert('round(finance.fv(0.11/12, 35, -2000, 0, 1), 2)')).toBe(82846.25);
    expect(wert('round(finance.fv(0.06/12, 12, -100, -1000, 1), 2)')).toBe(2301.4);
  });

  it('Kapitalwert: 1188.44 aus einzelnen Angaben, 1922.06 und −3749.47 mit Listen-Feld', () => {
    expect(wert('round(finance.npv(0.1, -10000, 3000, 4200, 6800), 2)')).toBe(1188.44);
    // Zahlung zum Zeitpunkt 0 außerhalb addiert (Story, Gültigkeitsbereich L11).
    expect(wert('round(finance.npv(0.08, cf) - 40000, 2)', NPV_ERTRAEGE)).toBe(1922.06);
    expect(wert('round(finance.npv(0.08, cf, -9000) - 40000, 2)', NPV_ERTRAEGE)).toBe(-3749.47);
    // Einzelne Angaben und Listen-Feld rechnen in der Reihenfolge der Angaben.
    expect(wert('finance.npv(0.08, 8000, 9200, 10000, 12000, 14500)')).toBe(
      wert('finance.npv(0.08, cf)', NPV_ERTRAEGE),
    );
  });

  it('Interner Zinsfuß: 0.1133 (Story), −2.1 %, 8.7 % und mit Schätzwert −44.4 %', () => {
    expect(wert('round(finance.irr(cf), 4)', STORY_ZAHLUNGEN)).toBe(0.1133);
    expect(wert('round(finance.irr(cf), 3)', IRR_VIER_JAHRE)).toBe(-0.021);
    expect(wert('round(finance.irr(cf), 3)', IRR_FUENF_JAHRE)).toBe(0.087);
    expect(wert('round(finance.irr(cf, -0.1), 3)', { cf: [-70000, 12000, 15000] })).toBe(-0.444);
    // Definition über den Kapitalwert: bei diesem Zins ist er null.
    const irr = wert('finance.irr(cf)', STORY_ZAHLUNGEN);
    expect(wert(`-10000 + finance.npv(${irr}, 3500, 7600, 1000)`)).toBeCloseTo(0, 6);
  });

  it('Zins einer Annuität: 1 % im Monat und 9.24 % im Jahr nach dem Beispiel der Quelle', () => {
    expect(wert('round(finance.rate(4 * 12, -200, 8000), 2)')).toBe(0.01);
    expect(wert('round(finance.rate(4 * 12, -200, 8000) * 12, 4)')).toBe(0.0924);
    // Rückweg über die Rate der Story.
    expect(wert('finance.rate(10, finance.pmt(0.08/12, 10, 10000), 10000)')).toBeCloseTo(
      0.08 / 12,
      10,
    );
  });

  it('Laufzeit: 59.6738657, 60.0821229 und −9.57859404 nach den Beispielen der Quelle', () => {
    expect(wert('round(finance.nper(0.12/12, -100, -1000, 10000, 1), 7)')).toBe(59.6738657);
    expect(wert('round(finance.nper(0.12/12, -100, -1000, 10000), 7)')).toBe(60.0821229);
    expect(wert('round(finance.nper(0.12/12, -100, -1000), 8)')).toBe(-9.57859404);
  });

  it('Effektiv- und Nominalzins: 0.0535427 und 0.05250032 nach den Beispielen der Quelle', () => {
    expect(wert('round(finance.effect(0.0525, 4), 7)')).toBe(0.0535427);
    expect(wert('round(finance.nominal(0.053543, 4), 8)')).toBe(0.05250032);
    expect(wert('finance.nominal(finance.effect(0.0525, 4), 4)')).toBeCloseTo(0.0525, 12);
    // Die Zahl der Perioden ist eine ganze Zahl; ein Nachkommateil fällt weg.
    expect(wert('finance.effect(0.05, 4.7)')).toBe(wert('finance.effect(0.05, 4)'));
  });
});

describe('Finanzmathematik: Zins 0 und beide Zeitpunkte (AK2)', () => {
  it('Zins 0 als Sonderfall: pmt · nper + pv + fv = 0 (Story, L9)', () => {
    expect(wert('finance.pmt(0, 10, 10000)')).toBe(-1000);
    expect(wert('finance.pmt(0, 10, 10000, 0, 1)')).toBe(-1000);
    expect(wert('finance.pmt(0, 10, 10000, -2000)')).toBe(-800);
    expect(wert('finance.pv(0, 10, -1000, 500)')).toBe(9500);
    expect(wert('finance.fv(0, 10, -100, -1000)')).toBe(2000);
    expect(wert('finance.nper(0, -100, 1000)')).toBe(10);
    expect(wert('finance.npv(0, 1, 2, 3)')).toBe(6);
    expect(wert('finance.rate(10, -100, 1000)')).toBeCloseTo(0, 12);
    expect(wert('finance.effect(0, 4)')).toBe(0);
    // Ein sehr kleiner Zins rechnet stetig in den Sonderfall hinein.
    expect(wert('finance.pmt(0.00000000000001, 10, 10000)')).toBeCloseTo(-1000, 6);
  });

  it('Zeitpunkt 0 und 1: Vorgabe 0, beide Wege rechnen sich zurück', () => {
    expect(wert('finance.pmt(0.08/12, 10, 10000)')).toBe(
      wert('finance.pmt(0.08/12, 10, 10000, 0, 0)'),
    );
    for (const t of [0, 1]) {
      const pmt = `finance.pmt(0.08/12, 10, 10000, 0, ${t})`;
      expect(wert(`finance.pv(0.08/12, 10, ${pmt}, 0, ${t})`)).toBeCloseTo(10000, 8);
      expect(wert(`finance.fv(0.08/12, 10, ${pmt}, 10000, ${t})`)).toBeCloseTo(0, 8);
      expect(wert(`finance.nper(0.08/12, ${pmt}, 10000, 0, ${t})`)).toBeCloseTo(10, 10);
      expect(wert(`finance.rate(10, ${pmt}, 10000, 0, ${t})`)).toBeCloseTo(0.08 / 12, 10);
    }
  });

  it('eine lange Laufzeit bei positivem Zins liefert die darstellbare Rate statt einer Meldung', () => {
    expect(wert('finance.pmt(1, 2000, 1000)')).toBe(-1000);
    expect(wert('finance.pv(1, 2000, -1)')).toBe(1);
  });
});

describe('Finanzmathematik: Grenzen beiderseits (AK3, AK5 und AK7 der Story)', () => {
  const faelle = [
    // [Ausdruck innerhalb, Ausdruck außerhalb, Meldung]
    ['finance.pmt(0.01, 0.001, 1000)', 'finance.pmt(0.01, 0, 1000)', M.laufzeit],
    ['finance.rate(1, -110, 100)', 'finance.rate(0, -110, 100)', M.laufzeit],
    ['finance.pmt(-0.99, 10, 1000)', 'finance.pmt(-1, 10, 1000)', M.zins],
    ['finance.pv(-0.99, 10, -100)', 'finance.pv(-1, 10, -100)', M.zins],
    ['finance.fv(-0.99, 10, -100)', 'finance.fv(-1, 10, -100)', M.zins],
    ['finance.nper(-0.99, -100, 1000)', 'finance.nper(-1, -100, 1000)', M.zins],
    ['finance.npv(-0.99, 100)', 'finance.npv(-1, 100)', M.zins],
    ['finance.pmt(0.01, 10, 1000, 0, 1)', 'finance.pmt(0.01, 10, 1000, 0, 2)', M.zeitpunkt],
    ['finance.pmt(0.01, 10, 1000, 0, 0)', 'finance.pmt(0.01, 10, 1000, 0, -1)', M.zeitpunkt],
    ['finance.pv(0.01, 10, -100, 0, 1)', 'finance.pv(0.01, 10, -100, 0, 0.5)', M.zeitpunkt],
    ['finance.fv(0.01, 10, -100, 0, 1)', 'finance.fv(0.01, 10, -100, 0, 1.01)', M.zeitpunkt],
    ['finance.nper(0.01, -100, 1000, 0, 1)', 'finance.nper(0.01, -100, 1000, 0, 3)', M.zeitpunkt],
    ['finance.rate(10, -110, 1000, 0, 1)', 'finance.rate(10, -110, 1000, 0, 2)', M.zeitpunkt],
    [
      'finance.rate(48, -200, 8000, 0, 0, -0.99)',
      'finance.rate(48, -200, 8000, 0, 0, -1)',
      M.schaetzwert,
    ],
    ['finance.nper(0.01, -10.01, 1000)', 'finance.nper(0.01, -10, 1000)', M.keineLaufzeit],
    ['finance.nper(0, -0.01, 1000)', 'finance.nper(0, 0, 1000)', M.keineLaufzeit],
    ['finance.effect(0, 4)', 'finance.effect(-0.0001, 4)', M.nominalzins],
    ['finance.effect(0.05, 1)', 'finance.effect(0.05, 0.99)', M.zinsperioden],
    ['finance.nominal(0.0001, 4)', 'finance.nominal(0, 4)', M.effektivzins],
    ['finance.nominal(0.05, 1)', 'finance.nominal(0.05, 0.99)', M.zinsperioden],
    // Ergebnis jenseits des darstellbaren Zahlenbereichs: 2^1000 geht, 2^1100 nicht.
    ['finance.fv(1, 1000, 0, -1)', 'finance.fv(1, 1100, 0, -1)', M.nichtDarstellbar],
  ];

  it.each(faelle)('%s rechnet, %s meldet', (innen, aussen, key) => {
    expect(typeof wert(innen)).toBe('number');
    expect(Number.isFinite(wert(innen))).toBe(true);
    expect(wert(aussen)).toEqual(meldung(key));
  });

  it('interner Zinsfuß: Vorzeichenwechsel und Schätzwert beiderseits der Grenze', () => {
    expect(wert('finance.irr(cf)', { cf: [-1, 2] })).toBeCloseTo(1, 10);
    expect(wert('finance.irr(cf)', { cf: [-1, 0] })).toEqual(meldung(M.vorzeichen));
    expect(wert('finance.irr(cf)', { cf: [0, -1, 2] })).toBeCloseTo(1, 10);
    expect(wert('finance.irr(cf)', { cf: [1, 2, 3] })).toEqual(meldung(M.vorzeichen));
    expect(wert('finance.irr(cf)', { cf: [-1, -2] })).toEqual(meldung(M.vorzeichen));
    // Eine einzelne Zahl hat keinen Vorzeichenwechsel.
    expect(wert('finance.irr(5)')).toEqual(meldung(M.vorzeichen));
    expect(typeof wert('finance.irr(cf, -0.99)', STORY_ZAHLUNGEN)).toBe('number');
    expect(wert('finance.irr(cf, -1)', STORY_ZAHLUNGEN)).toEqual(meldung(M.schaetzwert));
  });

  it('ohne Konvergenz melden interner Zinsfuß und Zins einer Annuität, auch gerundet', () => {
    // −1 + 3·x − 3·x² hat für x = 1/(1 + r) keine reelle Nullstelle.
    expect(wert('finance.irr(cf)', { cf: [-1, 3, -3] })).toEqual(meldung(M.konvergenz));
    // Rate und Barwert beide positiv: Die Gleichung hat keinen Zins als Lösung.
    expect(wert('finance.rate(10, 100, 1000)')).toEqual(meldung(M.konvergenz));
    expect(wert('round(finance.rate(10, 100, 1000), 2)')).toEqual(meldung(M.konvergenz));
  });

  it('der Abnahme-Fall der Story ist im Bereich; eine Laufzeit von null meldet auch gerundet', () => {
    expect(wert('round(finance.pmt(0.08/12, 10, 10000), 2)')).toBe(-1037.03);
    expect(wert('round(finance.pmt(0.08/12, 0, 10000), 2)')).toEqual(meldung(M.laufzeit));
  });

  it('eine fehlende Angabe oder eine Angabe, die keine Zahl ist, meldet; ein Zahl-Text rechnet', () => {
    const keineZahl = meldung(M.keineZahl);
    expect(wert('finance.pmt("viel", 10, 10000)')).toEqual(keineZahl);
    expect(wert('finance.pmt(zins, 10, 10000)')).toEqual(keineZahl);
    expect(wert('finance.pmt(1 = 1, 10, 10000)')).toEqual(keineZahl);
    expect(wert('finance.pmt(0.01, 10, cf)', STORY_ZAHLUNGEN)).toEqual(keineZahl);
    // Ein Element ohne Zahl fällt nicht still weg, weil sich sonst die Perioden
    // der folgenden Zahlungen verschöben.
    expect(wert('finance.npv(0.1, cf)', { cf: [100, 'viel', 200] })).toEqual(keineZahl);
    expect(wert('finance.npv(0.1, cf)', { cf: [100, null, 200] })).toEqual(keineZahl);
    expect(wert('finance.irr(cf)', { cf: [] })).toEqual(keineZahl);
    expect(wert('finance.irr(cf)')).toEqual(keineZahl);
    expect(wert('finance.irr(cf)', { cf: ['-10000', '3500', '7600', '1000'] })).toBe(
      wert('finance.irr(cf)', STORY_ZAHLUNGEN),
    );
    expect(wert('finance.pmt(z, n, b)', { z: '0.01', n: '10', b: '10000' })).toBe(
      wert('finance.pmt(0.01, 10, 10000)'),
    );
  });

  it('jede Meldung steht in allen fünf Sprachen', () => {
    for (const [code, woerter] of Object.entries({ de, en, fr, es, it: it_ })) {
      for (const key of Object.values(M)) expect(woerter[key], `${code} ${key}`).toBeTruthy();
    }
    expect(de[M.laufzeit]).toBe('Laufzeit außerhalb des Bereichs von über 0 Perioden');
    expect(de[M.vorzeichen]).toContain('mindestens eine negative und eine positive Zahlung');
  });
});

describe('Finanzmathematik: dieselbe Antwort an den Rechen-Orten und Aus-Zustand (AK3)', () => {
  const TEXT =
    'R {= round(finance.pmt(0.08/12, 10, 10000), 2) =} und M {= finance.pmt(0.08/12, 0, 10000) =}';
  const TABELLE =
    '```perspective-datatable\n' +
    'columns: Zins:number, Monate:number, Betrag:number, ' +
    'Rate:number = round(finance.pmt(Zins / 12, Monate, Betrag), 2)\n' +
    '| 0.08 | 10 | 10000 |\n| 0.08 | 0 | 10000 |\n```\n';
  const FELDER = [
    { name: 'zins', type: 'number' },
    { name: 'monate', type: 'number' },
    { name: 'betrag', type: 'number' },
    {
      name: 'rate',
      type: 'formula',
      options: { expression: 'round(finance.pmt(zins / 12, monate, betrag), 2)' },
    },
  ];
  const ZINSFUSS = [
    { name: 'zf', type: 'formula', options: { expression: 'round(finance.irr(cf), 4)' } },
  ];

  it('an: Fließtext, berechnete Spalte und Formel-Feld zeigen −1037.03, bei Laufzeit 0 die Meldung', () => {
    const text = renderMarkdown(TEXT, 'de');
    expect(text).toContain('title="round(finance.pmt(0.08/12, 10, 10000), 2)">-1037.03</span>');
    expect(text).toContain(`data-i18n-title="${M.laufzeit}">⚠︎</span>`);
    const tabelle = renderMarkdown(TABELLE, 'de');
    expect(tabelle).toMatch(/data-dt-col="3"[^>]*>-1037\.03<\/td>/);
    expect(tabelle).toContain(`data-i18n-title="${M.laufzeit}"`);
    expect(tabelle).not.toContain('pdt-errors');
    const satz = { zins: 0.08, monate: 10, betrag: 10000 };
    expect(werteAbgeleiteteFelder(FELDER, satz).rate).toEqual({ value: -1037.03, hint: null });
    expect(werteAbgeleiteteFelder(FELDER, { ...satz, monate: 0 }).rate).toEqual({
      value: null,
      hint: M.laufzeit,
    });
    // Der interne Zinsfuß aus einem Listen-Feld des Datensatzes.
    expect(werteAbgeleiteteFelder(ZINSFUSS, STORY_ZAHLUNGEN).zf).toEqual({
      value: 0.1133,
      hint: null,
    });
  });

  it('aus: eigener Prüf-Code, keine Rechnung, an jedem Ort der Hinweis der Bibliothek', () => {
    configureExtensions(['formula-library']);
    expect(katalog.validateQuery(ausdruck('finance.pmt(0.08/12, 10, 10000)')).code).toBe(
      katalog.FUNCTION_OFF_CODE,
    );
    expect(wert('finance.pmt(0.08/12, 10, 10000)')).toBeNull();
    expect(renderMarkdown(TEXT, 'de')).toContain(
      'data-i18n-title="query.formulaLibraryOff">⚠︎</span>',
    );
    expect(renderMarkdown(TABELLE, 'de')).toContain('data-i18n-title="query.formulaLibraryOff"');
    expect(werteAbgeleiteteFelder(FELDER, { zins: 0.08, monate: 10, betrag: 10000 }).rate).toEqual({
      value: null,
      hint: 'query.formulaLibraryOff',
    });
    // Grundfunktionen rechnen weiter.
    expect(wert('round(pow(1 + 0.08/12, 10), 4)')).toBe(1.0687);
    configureExtensions([]);
    expect(wert('round(finance.pmt(0.08/12, 10, 10000), 2)')).toBe(-1037.03);
  });
});
