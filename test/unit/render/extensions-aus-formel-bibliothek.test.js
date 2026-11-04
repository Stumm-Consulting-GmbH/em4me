// 4T-002449 (Epic 3E-000378, Story 4S-001124 AK5, AK6, AK7, AK10): Aus-Zustand
// der Erweiterung «Formel-Bibliothek» an den Rechen-Orten der prozess-neutralen
// Module — Fließtext und berechnete Spalte über die Render-Pipeline, Formel-Feld
// über die Auswertung der Eigenschafts-Profile, Wert-Platzhalter und Bereich der
// Masken. Muster wie test/unit/render/extensions-aus.test.js: erst der An-Zustand
// als Probe, dann schaltet `configureExtensions` die Erweiterung ab.
//
// **Warum eine eigene Datei.** `extensions-aus.test.js` steht nahe an seinem
// Zeilen-Budget; die Fälle der Formel-Bibliothek wachsen mit den Formeln der
// Stufen 2 und 3 (Vorbild `extensions-aus-diagramm.test.js`).
//
// **Die Prüf-Gruppe.** In Stufe 1 trägt die Bibliothek keine Formel; die Fälle
// registrieren eine Gruppe `probe` an der Kennung der Bibliothek. Katalog und
// Masken-Lesen kommen über createRequire, damit Gruppe und Schalter in
// derselben Modul-Instanz stehen, die die Rechen-Orte intern laden.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import {
  disabledFeatureKeySet,
  disabledIdsForModeLevel,
  effectiveDisabledSet,
} from '../../../src/shared/extensions/extensions-core.js';
import { werteAbgeleiteteFelder } from '../../../src/shared/property-profiles-abgeleitet.js';
import { hinweisSatz } from '../../../src/shared/database/table-hinweise.js';
import de from '../../../src/i18n/de.json';

const req = createRequire(import.meta.url);
const katalog = req('../../../src/shared/query/query-functions.js');
const { messageValue } = req('../../../src/shared/query/query-format.js');
const bibliothek = req('../../../src/shared/query/formula-library.js');
const { zerlegeMaskenKoerper, FORM_HINWEISE } = req('../../../src/shared/database/form-body.js');
const formWert = req('../../../src/shared/database/form-wert.js');

const AUS_SCHLUESSEL = 'query.formulaLibraryOff';
const MELDUNG = 'test.meldung.bereich';

function registriere() {
  katalog.registerFunctionGroup({
    namespace: 'probe',
    extension: bibliothek.FORMULA_LIBRARY_EXTENSION_ID,
    functions: {
      'probe.doppelt': { arity: [1, 1], fn: ([v]) => (typeof v === 'number' ? v * 2 : null) },
      'probe.meldung': { arity: [0, 0], fn: () => messageValue(MELDUNG) },
    },
  });
}

afterEach(() => {
  configureExtensions([]);
  katalog.resetFunctionGroupsForTests();
});

// Die Zelle einer Spalte in der ersten Daten-Zeile: Klassen, Attribute, Inhalt.
function zelle(html, spalte) {
  const re = new RegExp(`<td class="([^"]*)" data-dt-col="${spalte}"([^>]*)>([^<]*)</td>`);
  const m = re.exec(html);
  return m ? { klassen: m[1], attribute: m[2], inhalt: m[3] } : null;
}

const formel = (name, expression) => ({ name, type: 'formula', options: { expression } });

describe('Formel-Bibliothek: Registry und Modus-Stufe (4T-002449, AK2)', () => {
  it('steht in der Registry mit Stufe Voll und Katalog-Schlüsseln; dieselbe Kennung wie die Liste', () => {
    const eintrag = extensionById('formula-library');
    expect(eintrag).toMatchObject({
      category: 'render',
      modeLevel: 'full',
      nameKey: 'help.featureName.formulaLibrary',
      descKey: 'help.feature.formulaLibrary',
    });
    expect(eintrag.dependencies).toBeUndefined();
    expect(bibliothek.FORMULA_LIBRARY_EXTENSION_ID).toBe(eintrag.id);
    // 4T-002451 bis 4T-002454: die Formel-Gruppen der Bibliothek.
    expect(bibliothek.FORMULA_LIBRARY_GROUPS.map((g) => g.namespace)).toEqual([
      'humidity',
      'finance',
      'percent',
      'unit',
      'health',
      'const',
    ]);
    expect(de[eintrag.nameKey]).toBe('Formel-Bibliothek');
    expect(de[AUS_SCHLUESSEL]).toBe('Formel-Bibliothek ausgeschaltet');
    expect(disabledFeatureKeySet(['formula-library']).has('help.feature.formulaLibrary')).toBe(
      true,
    );
  });

  it('an im Modus Voll, aus in Fortgeschritten und Einsteiger; unabhängig von den Rechen-Orten', () => {
    expect(disabledIdsForModeLevel('full')).not.toContain('formula-library');
    expect(disabledIdsForModeLevel('advanced')).toContain('formula-library');
    expect(disabledIdsForModeLevel('beginner')).toContain('formula-library');
    for (const ort of ['inline-calc', 'perspective-datatable', 'property-profiles']) {
      expect(effectiveDisabledSet([ort]).has('formula-library')).toBe(false);
    }
  });
});

describe('Formel-Bibliothek: Aus-Zustand im Fließtext und in der berechneten Spalte (AK3)', () => {
  const TEXT = 'Text {= probe.doppelt(21) =} und {= round(pi() * 2, 2) =} Ende';
  const TABELLE =
    '```perspective-datatable\n' +
    'columns: Wert:number, Doppelt:number = probe.doppelt(Wert), Umfang:number(2) = round(pi() * Wert, 2)\n' +
    '| 2 |\n```\n';

  it('Fließtext: an das Ergebnis, aus das Warnzeichen mit dem Hinweis, Grundfunktionen rechnen', () => {
    registriere();
    const an = renderMarkdown(TEXT, 'de');
    expect(an).toContain('title="probe.doppelt(21)">42</span>');
    expect(an).not.toContain(AUS_SCHLUESSEL);

    configureExtensions(['formula-library']);
    const aus = renderMarkdown(TEXT, 'de');
    expect(aus).toContain(
      `class="inline-calc inline-calc-error" title="probe.doppelt(21)" data-i18n-title="${AUS_SCHLUESSEL}">⚠︎</span>`,
    );
    expect(aus).not.toContain('inlineCalc.error.function');
    expect(aus).toContain('title="round(pi() * 2, 2)">6.28</span>');

    configureExtensions([]);
    expect(renderMarkdown(TEXT, 'de')).toBe(an);
  });

  it('Spalte: an der Wert, aus ein Strich mit Hinweis je Zelle; Tabelle bleibt bearbeitbar', () => {
    registriere();
    const an = renderMarkdown(TABELLE, 'de');
    expect(zelle(an, 1).inhalt).toBe('4');
    expect(zelle(an, 2).inhalt).toBe('6.28');

    configureExtensions(['formula-library']);
    const aus = renderMarkdown(TABELLE, 'de');
    const doppelt = zelle(aus, 1);
    expect(doppelt.klassen).toContain('pdt-cell-error');
    expect(doppelt.attribute).toContain(`data-i18n-title="${AUS_SCHLUESSEL}"`);
    expect(doppelt.inhalt).toBe('—');
    expect(zelle(aus, 2).inhalt).toBe('6.28');
    // Kein Tabellen-Fehler: kein Fehlerkasten, Lösch- und Anfüge-Knöpfe stehen.
    expect(aus).not.toContain('pdt-errors');
    expect(aus).toContain('pdt-del-btn');
    expect(aus).toContain('pdt-add-btn');
  });

  it('Meldungs-Wert einer Formel: an beiden Orten der Schlüssel der Meldung', () => {
    registriere();
    const html = renderMarkdown(
      'Wert {= round(probe.meldung(), 1) =} im Satz\n\n' +
        '```perspective-datatable\ncolumns: A:number, M:number = probe.meldung() + A\n| 1 |\n```\n',
      'de',
    );
    expect(html).toContain(`data-i18n-title="${MELDUNG}">⚠︎</span>`);
    expect(zelle(html, 1).attribute).toContain(`data-i18n-title="${MELDUNG}"`);
    expect(html).not.toContain('pdt-errors');
  });

  // Im Modus Fortgeschritten sind Fließtext-Rechnung und Datentabelle selbst
  // aus; dort rechnet allein die Abfrage, die Kern ist. Gemessen wird deshalb
  // am Katalog, den die Pipeline mit dem Modus-Stand setzt.
  it('Modus Fortgeschritten schaltet die Bibliothek aus, Voll wieder an (AK7)', () => {
    registriere();
    configureExtensions(disabledIdsForModeLevel('advanced'));
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('aus');
    expect(katalog.lookupFunction('round').lage).toBe('kern');
    configureExtensions(disabledIdsForModeLevel('full'));
    expect(katalog.lookupFunction('probe.doppelt').lage).toBe('an');
    expect(renderMarkdown('A {= probe.doppelt(1) =} B', 'de')).toContain('>2</span>');
  });
});

describe('Formel-Bibliothek: Aus-Zustand im Formel-Feld (AK3)', () => {
  const FELDER = [
    { name: 'wert', type: 'number' },
    formel('doppelt', 'probe.doppelt(wert)'),
    formel('umfang', 'round(pi() * wert, 2)'),
    formel('kette', 'doppelt + 1'),
    formel('bereich', 'probe.meldung()'),
  ];

  it('an der Wert, aus leer mit dem Hinweis der Bibliothek; Grundfunktion und Meldung', () => {
    registriere();
    const an = werteAbgeleiteteFelder(FELDER, { wert: 21 });
    expect(an.doppelt).toEqual({ value: 42, hint: null });
    expect(an.kette).toEqual({ value: 43, hint: null });
    expect(an.bereich).toEqual({ value: null, hint: MELDUNG });

    configureExtensions(['formula-library']);
    const aus = werteAbgeleiteteFelder(FELDER, { wert: 21 });
    expect(aus.doppelt).toEqual({ value: null, hint: AUS_SCHLUESSEL });
    expect(aus.umfang).toEqual({ value: 65.97, hint: null });
    // Ein Feld auf dem ausgeschalteten bleibt leer ohne eigenen Hinweis, wie auf
    // einem Feld mit Hinweis bisher.
    expect(aus.kette).toEqual({ value: null, hint: null });
  });
});

describe('Formel-Bibliothek: Wert-Platzhalter und Bereich der Masken (Schritt 5)', () => {
  const FELDER = [{ name: 'Menge', type: 'number' }];
  const KOERPER = [
    'Doppelt: {{value: probe.doppelt(Menge)}}',
    '{{when: probe.doppelt(Menge) > 2}}',
    'Viel',
    '{{end}}',
  ].join('\n');

  it('aus: eigene Hinweise mit Grund, der Wert bleibt leer und markiert, der Bereich verborgen', () => {
    registriere();
    const an = zerlegeMaskenKoerper(KOERPER, FELDER);
    expect(an.hints).toEqual([]);

    configureExtensions(['formula-library']);
    const aus = zerlegeMaskenKoerper(KOERPER, FELDER);
    expect(aus.hints).toEqual([
      { code: FORM_HINWEISE.ausdruckAus, name: 'probe.doppelt(Menge)', zeile: 1 },
      { code: FORM_HINWEISE.bedingungAus, name: 'probe.doppelt(Menge) > 2', zeile: 2 },
    ]);
    const wert = aus.segmente.find((s) => s.art === 'wert');
    expect(wert).toMatchObject({ ast: null, aus: true });
    expect(aus.segmente.find((s) => s.art === 'bereich').ast).toBeNull();
    const uebersetze = (schluessel) => de[schluessel] || schluessel;
    expect(hinweisSatz(aus.hints[0], uebersetze)).toBe(
      de['database.hint.formAusdruckAus']
        .replace('{zeile}', '1')
        .replace('{name}', 'probe.doppelt(Menge)'),
    );
  });

  it('ein vor dem Umschalten gelesener Baum rechnet aus nicht weiter, auch nicht verneint', () => {
    registriere();
    const kontext = formWert.baueWertKontext(FELDER, ['3']);
    const wertBaum = formWert.liesWertAusdruck('probe.doppelt(Menge)');
    const nichtBaum = formWert.liesWertAusdruck('NOT probe.doppelt(Menge) > 2');
    expect(formWert.werteWertAus(wertBaum, kontext)).toBe(6);
    expect(formWert.werteBedingungAus(nichtBaum, kontext)).toBe(false);

    configureExtensions(['formula-library']);
    expect(formWert.werteWertAus(wertBaum, kontext)).toBeNull();
    // Ohne die erneute Prüfung ergäbe NOT über null «wahr», und der Bereich erschiene.
    expect(formWert.werteBedingungAus(nichtBaum, kontext)).toBe(false);
    expect(formWert.werteWertAus(formWert.liesWertAusdruck('Menge * 2'), kontext)).toBe(6);
  });
});
