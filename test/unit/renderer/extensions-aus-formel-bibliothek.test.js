// @vitest-environment jsdom
// 4T-002449 (Epic 3E-000378, Story 4S-001124 AK5, AK7): Die Fenster-Seite des
// Aus-Zustands der Formel-Bibliothek. Geprüft wird, dass der Lebenszyklus des
// Fensters (extension-lifecycle.js) den Funktions-Katalog des Renderer-Bündels
// beim Umschalten, beim Modus-Wechsel und beim Start aus dem Speicher setzt,
// und dass die Anzeigen des Fensters den Hinweis in ihrer Form zeigen: die
// Abfrage-Ausgabe statt des Ergebnisses, das Formel-Feld beim Darüberfahren,
// das Ergebnis-Widget der Live-Ansicht über dieselbe Schlüssel-Ableitung wie
// die Ansicht. Muster wie extensions-aus-abfrage-diagramm.test.js.
//
// **Die Instanz des Katalogs.** Der Katalog wird hier per `import` geladen,
// denselben Weg, den extension-lifecycle.js nimmt; so misst die Datei genau
// das Exemplar, das der Lebenszyklus setzt. Im gebauten Bündel gibt es davon
// nur eines; unter Vitest hält ein per `require` geladener Rechen-Ort ein
// eigenes, deshalb rechnet diese Datei nicht über die geteilten Module, das
// tun die Prüfdateien der beiden anderen Prozess-Seiten.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const lies = (code) =>
  JSON.parse(readFileSync(path.join(dir, `../../../src/i18n/${code}.json`), 'utf8'));
const de = lies('de');

// Das Wörterbuch des Fensters, für die Anzeigen mit `t()` (Muster
// eigenschaften-abgeleitet.test.js).
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const katalog = await import('../../../src/shared/query/query-functions.js');
const { applyExtensionsState, initExtensionsFromStore, resetExtensionStateForTests } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { disabledIdsForModeLevel } =
  await import('../../../src/shared/extensions/extensions-core.js');
const { buildQueryListDom } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const { renderAbgeleitetesFeld } =
  await import('../../../src/renderer/modules/properties/properties-neue-typen.js');
const { inlineCalcTitleKey } = await import('../../../src/shared/markdown/inline-calc.js');
const { makeState, makeResultSet, makeWishes, makeColumn, makeRow, fileOrigin, validateResultSet } =
  await import('../../../src/shared/query/result-set.js');

const AUS_SCHLUESSEL = 'query.formulaLibraryOff';

function registriere() {
  katalog.registerFunctionGroup({
    namespace: 'probe',
    extension: 'formula-library',
    functions: { 'probe.doppelt': { arity: [1, 1], fn: ([v]) => v * 2 } },
  });
}
const lage = () => katalog.lookupFunction('probe.doppelt').lage;

// Eine Abfrage-Antwort mit Abfrage-Fehler, wie der Haupt-Prozess sie liefert.
function fehlerMenge(queryError) {
  return makeResultSet({
    scope: 'files',
    type: 'table',
    columns: [],
    rows: [],
    wishes: makeWishes({}),
    state: makeState('ready', { area: { root: '/raum', fileCount: 1 }, queryError }),
  });
}
function fehlerText(queryError, woerter) {
  const host = document.createElement('div');
  const tr = (key) => woerter[key] ?? key;
  host.appendChild(buildQueryListDom({ resultSet: fehlerMenge(queryError) }, tr, {}));
  return host.querySelector('.perspective-query-error').textContent;
}

afterEach(() => {
  resetExtensionStateForTests();
  katalog.resetFunctionGroupsForTests();
  window.api.getSetting = async () => undefined;
});

describe('Formel-Bibliothek im Fenster: Schalter-Stand des Katalogs (4T-002449, AK7)', () => {
  it('Umschalten setzt den Katalog des Fensters, ohne Neustart, in beide Richtungen', async () => {
    registriere();
    expect(lage()).toBe('an');
    await applyExtensionsState(['formula-library'], { persist: false });
    expect(lage()).toBe('aus');
    expect(katalog.validateQuery({ type: 'call', name: 'probe.doppelt', args: [] }).code).toBe(
      'functionOff',
    );
    await applyExtensionsState([], { persist: false });
    expect(lage()).toBe('an');
  });

  it('Modus-Wechsel: Fortgeschritten und Einsteiger schalten aus, Voll wieder an', async () => {
    registriere();
    for (const [stufe, erwartet] of [
      ['advanced', 'aus'],
      ['full', 'an'],
      ['beginner', 'aus'],
    ]) {
      await applyExtensionsState(disabledIdsForModeLevel(stufe), { persist: false });
      expect(lage(), stufe).toBe(erwartet);
    }
  });

  it('Start: der gespeicherte Stand gilt, bevor die Ansichten rechnen (Neustart)', async () => {
    registriere();
    window.api.getSetting = async (key) =>
      key === 'extensions.disabled' ? ['formula-library'] : undefined;
    await initExtensionsFromStore();
    expect(lage()).toBe('aus');
  });
});

describe('Formel-Bibliothek im Fenster: der Hinweis in der Form des Ortes (4T-002449, AK3)', () => {
  it('Abfrage: der Hinweis statt des Ergebnisses, in allen fünf Sprachen; der Tippfehler bleibt', () => {
    const fehler = { code: 'functionOff', message: 'intern', pos: 0, name: 'probe.doppelt' };
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const woerter = lies(code);
      expect(woerter[AUS_SCHLUESSEL], code).toBeTruthy();
      expect(fehlerText(fehler, woerter), code).toBe(woerter[AUS_SCHLUESSEL]);
    }
    expect(fehlerText({ ...fehler, code: 'unknownFunction' }, de)).toBe(
      de['query.syntax.unknownFunction'].replace('{name}', 'probe.doppelt'),
    );
  });

  it('Formel-Feld: leer mit dem Hinweis der Bibliothek beim Darüberfahren', () => {
    const c = document.createElement('div');
    renderAbgeleitetesFeld(c, null, { hinweis: AUS_SCHLUESSEL });
    const el = c.querySelector('.properties-field-abgeleitet');
    expect(el.title).toBe(de[AUS_SCHLUESSEL]);
    expect(el.textContent).toBe('');
    expect(el.classList.contains('is-leer')).toBe(true);
    // Ein Code der Auswertung bleibt beim Text seines Codes.
    renderAbgeleitetesFeld(c, null, { hinweis: 'derivedBadExpr' });
    expect(c.lastChild.title).toBe(de['properties.derivedHint.derivedBadExpr']);
  });

  it('Live-Ansicht: dieselbe Schlüssel-Ableitung wie die Ansicht', () => {
    const aus = { ok: false, errorCode: 'function', messageKey: AUS_SCHLUESSEL };
    expect(inlineCalcTitleKey(aus)).toBe(AUS_SCHLUESSEL);
    expect(inlineCalcTitleKey({ ok: false, errorCode: 'function' })).toBe(
      'inlineCalc.error.function',
    );
  });
});

// 4T-002451 (Epic 3E-000378, Story 4S-001139 AK5): Die Meldung einer Formel in
// einer Abfrage-Zelle erscheint als Warnzeichen mit dem Text der Meldung beim
// Darüberfahren, in derselben Form wie die Berechnung im Fließtext
// (Entscheidung der steuernden Sitzung vom 2026-10-31).
describe('Bereichs-Meldung in einer Abfrage-Zelle (4T-002451)', () => {
  const MELDUNG = 'query.formula.humidity.relativeRangeDewpoint';
  const meldung = { kind: 'message', key: MELDUNG };
  function zellenMenge(type) {
    return makeResultSet({
      scope: 'files',
      type,
      columns: [makeColumn({ name: 't', label: 'T', source: 'humidity.dewpoint(20, 120)' })],
      rows: [
        makeRow([meldung], fileOrigin('/raum/Buch.md', 'Buch')),
        makeRow([9.3], fileOrigin('/raum/Heft.md', 'Heft')),
      ],
      wishes: makeWishes({}),
      state: makeState('ready', { area: { root: '/raum', fileCount: 2 } }),
    });
  }
  function zeichne(type, woerter) {
    const host = document.createElement('div');
    const tr = (key) => woerter[key] ?? key;
    host.appendChild(buildQueryListDom({ resultSet: zellenMenge(type) }, tr, {}));
    return host;
  }

  it('Tabelle und Liste: Warnzeichen mit Meldungs-Text in fünf Sprachen, die Menge bleibt gültig', () => {
    expect(validateResultSet(zellenMenge('table'))).toEqual([]);
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const woerter = lies(code);
      expect(woerter[MELDUNG], code).toBeTruthy();
      for (const type of ['table', 'list']) {
        const host = zeichne(type, woerter);
        const zeichen = host.querySelectorAll('.inline-calc.inline-calc-error');
        expect(zeichen, `${code} ${type}`).toHaveLength(1);
        expect(zeichen[0].textContent).toBe('⚠︎');
        expect(zeichen[0].getAttribute('data-i18n-title')).toBe(MELDUNG);
        expect(zeichen[0].title).toBe(woerter[MELDUNG]);
      }
    }
    // Die Zelle ohne Meldung zeigt ihren Wert wie bisher.
    const zellen = zeichne('table', de).querySelectorAll('tbody td');
    expect([...zellen].map((td) => td.textContent)).toEqual(['Buch', '⚠︎', 'Heft', '9.3']);
  });
});
