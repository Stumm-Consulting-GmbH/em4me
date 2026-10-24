// @vitest-environment jsdom
// 4T-002333 (Epic 3E-000264, Entscheidung T5): Der Anker-Modus der
// Vorschlagsliste nach `[[Datei#` und `[[Datei#^`, mit den Datensätzen einer
// Tabelle hinter den Block-Ankern.
//
// Ersetzt sind die beiden Kanäle (`autocomplete:anchors`, `database:datensaetze`);
// geprüft wird das Ergebnis, das die Quelle der Bibliothek übergibt. Ob die
// Liste am gebauten Programm erscheint und die Auswahl die Kennung schreibt,
// steht im Ablauf-Fall DB-VER-03.
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = async () => ({ ok: true, json: async () => de });

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const anker = await import('../../../src/renderer/modules/editor/autocomplete-anker.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { AUTOCOMPLETE_RENDER_LIMIT } = await import('../../../src/shared/wiki-vorschlaege.js');

const NOTIZ = '/raum/Notiz.md';
const BUECHER = [
  { kennung: 'r-00004', anzeige: 'Bergwerk', schluessel: 'Bergwerk' },
  { kennung: 'r-00003', anzeige: 'Solaris', schluessel: 'Solaris' },
  { kennung: 'r-00001', anzeige: 'Der Zauberberg', schluessel: 'Der Zauberberg' },
];

let ankerAnfragen;
let datensatzAnfragen;
let ankerAntwort;
let datensatzAntwort;

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  ankerAnfragen = [];
  datensatzAnfragen = [];
  ankerAntwort = (typ) =>
    typ === 'block'
      ? { status: 'ready', suggestions: ['bergfest', 'notiz-1'] }
      : { status: 'ready', suggestions: ['Einleitung', 'Berg und Tal'] };
  datensatzAntwort = () => ({ status: 'ready', tabelle: 'Library', datensaetze: BUECHER });
  window.api.autocompleteAnchors = async (aktiv, basename, typ) => {
    ankerAnfragen.push([aktiv, basename, typ]);
    return ankerAntwort(typ);
  };
  window.api.databaseDatensaetze = async (params) => {
    datensatzAnfragen.push(params);
    return datensatzAntwort(params);
  };
});

// Der Text hinter `[[` bis zur Schreibmarke, wie ihn die Quelle übergibt.
async function vorschlaege(inner) {
  const doc = '[[' + inner;
  const context = { pos: doc.length, state: EditorState.create({ doc }) };
  return anker.ankerVorschlaege(context, NOTIZ, inner, inner.indexOf('#'));
}

const beschriftungen = (ergebnis) => ergebnis.options.map((o) => o.label);

describe('Überschriften nach [[Datei# (wie bisher)', () => {
  it('liefert die Überschriften, gefiltert, mit Treffer am Anfang zuerst', async () => {
    const ergebnis = await vorschlaege('Library#Be');
    expect(ankerAnfragen).toEqual([[NOTIZ, 'Library', 'heading']]);
    expect(beschriftungen(ergebnis)).toEqual(['Berg und Tal']);
    expect(ergebnis.options[0].detail).toBe('Heading');
    expect(ergebnis.from).toBe('[[Library#'.length);
    expect(ergebnis.validFor.test('Berg')).toBe(true);
    // Keine Datensätze nach einer Überschriften-Raute.
    expect(datensatzAnfragen).toEqual([]);
  });

  it('ohne bereiten Index keine Liste', async () => {
    ankerAntwort = () => ({ status: 'indexing' });
    expect(await vorschlaege('Library#')).toBe(null);
  });
});

describe('Nach [[Datei#^: Block-Anker, dahinter Datensätze', () => {
  it('Block-Anker zuerst, dann die Datensätze in der Reihenfolge des Kanals', async () => {
    const ergebnis = await vorschlaege('Library#^');
    expect(datensatzAnfragen).toEqual([{ tabelle: 'Library' }]);
    expect(beschriftungen(ergebnis)).toEqual([
      '^bergfest',
      '^notiz-1',
      '^Bergwerk',
      '^Solaris',
      '^Der Zauberberg',
    ]);
    expect(ergebnis.options[0].detail).toBe('Block-Anker');
    expect(ergebnis.options[2].detail).toBe('Datensatz');
  });

  it('ein Datensatz zeigt seinen Namen und schreibt die lange Kennung', async () => {
    const ergebnis = await vorschlaege('Library#^');
    const solaris = ergebnis.options.find((o) => o.label === '^Solaris');
    expect(solaris.apply).toBe('^r-00003');
    // Ein Block-Anker schreibt seine Beschriftung.
    expect(ergebnis.options[0].apply).toBeUndefined();
  });

  it('die ersetzte Stelle beginnt am Zirkumflex, damit er nicht doppelt steht', async () => {
    const ergebnis = await vorschlaege('Library#^Sol');
    expect(ergebnis.from).toBe('[[Library#'.length);
    expect(ergebnis.filter).toBe(false);
  });

  it('gefiltert über Name und Kennung, Treffer am Anfang zuerst', async () => {
    expect(beschriftungen(await vorschlaege('Library#^sol'))).toEqual(['^Solaris']);
    expect(beschriftungen(await vorschlaege('Library#^r-00001'))).toEqual(['^Der Zauberberg']);
    // «berg» steht am Anfang von «bergfest» und «Bergwerk», in «Der Zauberberg» innen.
    expect(beschriftungen(await vorschlaege('Library#^berg'))).toEqual([
      '^bergfest',
      '^Bergwerk',
      '^Der Zauberberg',
    ]);
  });

  it('beim Weitertippen rechnet die Liste ohne neue Anfrage, auch mit Leerzeichen', async () => {
    const ergebnis = await vorschlaege('Library#^');
    const doc = '[[Library#^Der Z';
    const ctx = { pos: doc.length, state: EditorState.create({ doc }) };
    const weiter = ergebnis.update(ergebnis, ergebnis.from, ctx.pos, ctx);
    expect(beschriftungen(weiter)).toEqual(['^Der Zauberberg']);
    expect(datensatzAnfragen).toHaveLength(1);
    // Hervorgehoben wird die Fundstelle hinter dem Zirkumflex.
    expect(weiter.getMatch(weiter.options[0])).toEqual([1, 6]);
    // Eine schließende Klammer beendet die Eingabe: die Quelle läuft neu.
    const zu = '[[Library#^Zauber]';
    const ctxZu = { pos: zu.length, state: EditorState.create({ doc: zu }) };
    expect(ergebnis.update(ergebnis, ergebnis.from, ctxZu.pos, ctxZu)).toBe(null);
  });

  it(`höchstens ${AUTOCOMPLETE_RENDER_LIMIT} Einträge insgesamt, Block-Anker vorn`, async () => {
    const viele = Array.from({ length: 40 }, (_, i) => ({
      kennung: `r-${String(i + 1).padStart(5, '0')}`,
      anzeige: `Buch ${String(i + 1).padStart(2, '0')}`,
    }));
    datensatzAntwort = () => ({ status: 'ready', datensaetze: viele });
    const ergebnis = await vorschlaege('Library#^');
    expect(ergebnis.options).toHaveLength(AUTOCOMPLETE_RENDER_LIMIT);
    expect(beschriftungen(ergebnis).slice(0, 3)).toEqual(['^bergfest', '^notiz-1', '^Buch 01']);
  });

  it('ein Datensatz ohne Anzeige-Form zeigt seine Kennung', async () => {
    datensatzAntwort = () => ({
      status: 'ready',
      datensaetze: [{ kennung: 'r-00009', anzeige: '' }],
    });
    const ergebnis = await vorschlaege('Library#^');
    expect(beschriftungen(ergebnis)).toContain('^r-00009');
  });
});

describe('Keine Datensätze, wo keine hingehören', () => {
  it('keine Tabelle (Antwort ohne ready): nur die Block-Anker', async () => {
    datensatzAntwort = () => ({ status: 'error', code: 'tabelleUnbekannt' });
    const ergebnis = await vorschlaege('Notiz#^');
    expect(beschriftungen(ergebnis)).toEqual(['^bergfest', '^notiz-1']);
  });

  it('Kanal wirft: nur die Block-Anker', async () => {
    datensatzAntwort = () => {
      throw new Error('weg');
    };
    expect(beschriftungen(await vorschlaege('Library#^'))).toEqual(['^bergfest', '^notiz-1']);
  });

  it('Erweiterung «Datenbank» aus: keine Anfrage, keine Datensätze', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    const ergebnis = await vorschlaege('Library#^');
    expect(datensatzAnfragen).toEqual([]);
    expect(beschriftungen(ergebnis)).toEqual(['^bergfest', '^notiz-1']);
  });

  it('ohne Datei-Namen (Anker im selben Dokument) keine Anfrage', async () => {
    await vorschlaege('#^');
    expect(datensatzAnfragen).toEqual([]);
  });

  it('weder Anker noch Datensätze: keine Liste', async () => {
    ankerAntwort = () => ({ status: 'indexing' });
    datensatzAntwort = () => ({ status: 'error' });
    expect(await vorschlaege('Library#^')).toBe(null);
  });
});
