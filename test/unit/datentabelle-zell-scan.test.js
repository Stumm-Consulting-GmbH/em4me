// 4T-002013 (Epic 3E-000332): Verweise und Schlagworte in Text-Zellen der
// Datentabelle: die Zell-Grammatik und der Verweis-Parser des Bereichs-Index.
//
// Geprüft wird hier die geteilte Zell-Grammatik
// (src/shared/markdown/perspective-datatable-cells.js) und ihre Wirkung im
// Verweis-Parser des Bereichs-Index (src/main/index/parse.js, über
// parseContent ohne Datei-Zugriff). Der Umbenennungs-Nachzug steht in
// link-rewrite.test.js, die Schlagwort-Umbenennung in tag-erkennung.test.js und
// tag-umbenennung.test.js, die ausgehenden Verweise der offenen Datei in
// renderer/struktur-und-state.test.js, jeweils bei ihrem Modul.
//
// **Die Negativ-Fälle sind hier kein Beiwerk** (Muster
// canvas-verweis-scan.test.js): Ein Treffer aus einer Zahl-Spalte oder einer
// Kopfzeile erzeugte einen Rückverweis, den niemand erklären kann, und das
// Umbenennen schriebe dort in die Datei des Anwenders.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { parseContent } from '../../src/main/index/parse.js';
import {
  istDatentabellenFenceInfo,
  leseZeile,
  maskiereAusserhalbTextZellen,
  neuerZellZustand,
  splitPipeRow,
  textZellSpannen,
  zellScanZeile,
} from '../../src/shared/markdown/perspective-datatable-cells.js';
import { parsePerspectiveDatatable } from '../../src/shared/markdown/perspective-datatable.js';

const require_ = createRequire(import.meta.url);
const { MDDA_CACHE_SCHEMA_VERSION } = require_('../../src/main/documents/mdd-store.js');

const QUELLE = 'C:/bereich/Quelle.md';

// Ein Dokument mit genau einer Datentabelle.
function tabelle(...zeilen) {
  return ['# Titel', '', '```perspective-datatable', ...zeilen, '```', ''].join('\n');
}

// Die Spannen jeder Zeile eines Fence-Bodys, als ausgeschnittener Roh-Text.
function spannenTexte(body) {
  const zustand = neuerZellZustand();
  return body
    .split('\n')
    .map((zeile) => leseZeile(zustand, zeile).map((s) => zeile.slice(s.start, s.end)));
}

// --- Zell-Grammatik ------------------------------------------------------------

describe('Zell-Grammatik der Datentabelle (4T-002013)', () => {
  it('erkennt die Info-Zeichenfolge am ersten Wort', () => {
    expect(istDatentabellenFenceInfo('perspective-datatable')).toBe(true);
    expect(istDatentabellenFenceInfo('  perspective-datatable  titel')).toBe(true);
    expect(istDatentabellenFenceInfo('perspective-table')).toBe(false);
    expect(istDatentabellenFenceInfo('perspective-datatable-x')).toBe(false);
    expect(istDatentabellenFenceInfo('')).toBe(false);
  });

  it('liefert Spannen nur für Text-Spalten und nur für Datenzeilen', () => {
    const body = [
      'columns: Name:text, Betrag:number(2), Notiz:text',
      'aggregate: Betrag:sum',
      'types: hidden',
      '| Anna [[A]] | 12.50 | frei |',
    ].join('\n');
    expect(spannenTexte(body)).toEqual([[], [], [], ['Anna [[A]]', 'frei']]);
  });

  it('zählt über die Datenspalten: eine berechnete Spalte hat keine Zelle', () => {
    const body = [
      'columns: Betrag:number, Doppelt:number = Betrag * 2, Notiz:text',
      '| 5 | [[Notiz]] | [[Zuviel]] |',
    ].join('\n');
    // Die zweite Zelle ist die Notiz; die dritte liegt jenseits der Spalten.
    expect(spannenTexte(body)[1]).toEqual(['[[Notiz]]']);
  });

  it('das Escape \\| trennt nicht und bleibt in der Spanne', () => {
    const body = ['columns: Name:text, Zahl:number', '| [[Ziel\\|Alias]] | 3 |'].join('\n');
    expect(spannenTexte(body)[1]).toEqual(['[[Ziel\\|Alias]]']);
  });

  it('liefert ohne columns-Zeile, für Leerzellen und für Nicht-Pipe-Zeilen nichts', () => {
    expect(spannenTexte('| [[A]] | [[B]] |')).toEqual([[]]);
    const body = ['columns: A:text, B:text', '|  | x |', 'kaputt [[C]]', '| [[D]] |'].join('\n');
    expect(spannenTexte(body)).toEqual([[], ['x'], [], ['[[D]]']]);
  });

  it('liest eine Zeile ohne schließende Pipe tolerant wie der Parser', () => {
    const body = ['columns: A:number, B:text', '  | 1 | letzte [[Zelle]]'].join('\n');
    expect(spannenTexte(body)[1]).toEqual(['letzte [[Zelle]]']);
  });

  it('maskiert außerhalb der Text-Zellen längengleich mit Zeilenumbrüchen', () => {
    const zeile = '| a | 1 | b |';
    const maske = maskiereAusserhalbTextZellen(zeile, [
      { start: 2, end: 3 },
      { start: 10, end: 11 },
    ]);
    expect(maske).toHaveLength(zeile.length);
    expect(maske).toBe('\n\na\n\n\n\n\n\n\nb\n\n');
  });

  it('zellScanZeile liefert null für Kopfzeilen und ohne Text-Zelle', () => {
    const zustand = neuerZellZustand();
    expect(zellScanZeile(zustand, 'columns: A:number, B:text')).toBeNull();
    expect(zellScanZeile(zustand, '| 1 |  |')).toBeNull();
    expect(zellScanZeile(zustand, '| 1 | x |')).toBe('\n\n\n\n\n\nx\n\n');
  });

  it('liest dieselben Zellen wie der Parser des Kerns (Gleichlauf-Wächter)', () => {
    // Die Zusage «eine Zerlegung» ist kein Versprechen, sondern diese Prüfung:
    // Die Spannen, ausgeschnitten und entmaskiert, ergeben genau die Texte der
    // Text-Zellen, die parsePerspectiveDatatable liefert.
    const bloecke = [
      [
        'columns: Name "Anzeige":text, Datum:date, Start:time, Betrag:number(2), Ok:boolean, Notiz:text, G:number = Betrag * 2',
        'aggregate: Betrag:sum+avg, Ok:count',
        'types: shown',
        '| Anna [[Ziel\\|Alias]] | 2026-07-08 | 09:30 | 12.50 | x | #tag und `code` |',
        '|  Bert  | 2026-07-09 |  | 3 |  | a \\| b \\| c |',
        '| Carla | kaputt | 25:00 | abc | ja | [Text](Ziel.md) |',
        '   | eingerückt | 2026-01-01 | 00:00 | 1 | x | ohne Schluss-Pipe',
        '| kurz |',
        '| lang | 2026-01-02 | 01:00 | 2 | x | notiz | zuviel | noch mehr |',
      ],
      ['| ohne | columns |', '| [[A]] |'],
      ['columns: A:text, A:number, B:unbekannt, C:text', '| [[erste]] | [[zweite]] | [[dritte]] |'],
      ['columns: A:text', 'columns: A:number, B:text', '| x | y |'],
      ['columns: A:text, B:text', '| a | b |', 'Fehlzeile', '| c | d |'],
      ['columns: A:text, B:number', '| a\r', '| b | 2 |\r'],
    ];
    let geprueft = 0;
    for (const zeilen of bloecke) {
      const modell = parsePerspectiveDatatable(zeilen.join('\n'));
      const datenSpalten = modell.columns.filter((c) => c.expr === null);
      const erwartet = modell.rows.map((row) =>
        row
          .map((zelle, j) =>
            j < datenSpalten.length && datenSpalten[j].type === 'text' ? zelle.text : '',
          )
          .filter((text) => text !== ''),
      );
      const zustand = neuerZellZustand();
      const gelesen = [];
      for (const zeile of zeilen) {
        const spannen = leseZeile(zustand, zeile);
        if (zustand.inRows && zeile.trim().startsWith('|')) {
          gelesen.push(spannen.map((s) => zeile.slice(s.start, s.end).replace(/\\\|/g, '|')));
        }
      }
      expect(gelesen, zeilen.join('\n')).toEqual(erwartet);
      geprueft += erwartet.length;
    }
    // Plausibilitäts-Schranke: Ein leer laufender Vergleich wäre grün, ohne zu
    // prüfen.
    expect(geprueft).toBeGreaterThanOrEqual(12);
  });

  it('splitPipeRow behält seinen Vertrag nach dem Umzug aus dem Kern', () => {
    expect(splitPipeRow('| a | b\\|c |')).toEqual(['a', 'b|c']);
    expect(splitPipeRow('| a | b')).toEqual(['a', 'b']);
    expect(splitPipeRow('| a |  |')).toEqual(['a', '']);
    expect(textZellSpannen('| a |', null)).toEqual([]);
  });

  it('bleibt prozessneutral: eine einzige Abhängigkeit, kein Kern', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/markdown/perspective-datatable-cells.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual(['./perspective-datatable-kopf.js']);
    expect(typeof window).toBe('undefined');
  });
});

// --- Verweis-Parser des Bereichs-Index ----------------------------------------

describe('Verweis-Parser: Verweise und Schlagworte in Text-Zellen (AK1, AK2, 4T-002013)', () => {
  const KOPF = 'columns: Name:text, Betrag:number(2), Notiz:text';

  it('AK1: ein Doppelklammer-Verweis mit Alias ist ein gewöhnlicher Treffer', () => {
    const hits = parseContent(QUELLE, tabelle(KOPF, '| Anna | 12.50 | [[Ziel\\|Alias]] |')).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      zeile: 5,
      linkTyp: 'wiki',
      zielBasename: 'Ziel',
      zielAbsolut: null,
      anker: null,
    });
    // Dieselben Felder wie ein Treffer im Fließtext; der Ausschnitt ist die
    // Roh-Zeile.
    const fliesstext = parseContent(QUELLE, '[[Ziel]]\n').hits[0];
    expect(Object.keys(hits[0]).sort()).toEqual(Object.keys(fliesstext).sort());
    expect(hits[0].snippet).toBe('| Anna | 12.50 | [[Ziel\\|Alias]] |');
  });

  it('AK1: Anker, Einbettung und mehrere Verweise in einer Zelle', () => {
    const hits = parseContent(
      QUELLE,
      tabelle(KOPF, '| [[Ziel#Kapitel]] ![[Bild.md]] | 1 | [[Eins]] [[Zwei]] |'),
    ).hits;
    expect(hits.map((h) => [h.zielBasename, h.anker])).toEqual([
      ['Ziel', 'Kapitel'],
      ['Bild.md', null],
      ['Eins', null],
      ['Zwei', null],
    ]);
  });

  it('AK1 (F1 b): ein Markdown-Link ist ein Treffer md mit aufgelöstem Pfad', () => {
    const hits = parseContent(QUELLE, tabelle(KOPF, '| [Text](Ziel.md#Anker) | 1 | x |')).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ linkTyp: 'md', zielBasename: null, anker: 'Anker' });
    expect(hits[0].zielAbsolut.replace(/\\/g, '/')).toMatch(/\/bereich\/Ziel\.md$/);
  });

  it('AK2: ein Schlagwort aus einer Text-Zelle steht in tags', () => {
    const ergebnis = parseContent(QUELLE, tabelle(KOPF, '| #kunde | 1 | Stand #projekt/alpha |'));
    expect([...ergebnis.tags].sort()).toEqual(['kunde', 'projekt/alpha']);
  });

  it('AK4: Zahl-, Datum-, Uhrzeit- und Wahrheitswert-Spalten liefern nichts', () => {
    const text = tabelle(
      'columns: Betrag:number, Datum:date, Zeit:time, Ok:boolean',
      '| [[A]] #a | [[B]] #b | [[C]] #c | [[D]] #d |',
    );
    const ergebnis = parseContent(QUELLE, text);
    expect(ergebnis.hits).toEqual([]);
    expect(ergebnis.tags).toEqual([]);
  });

  it('AK4: eine berechnete Spalte und Zellen jenseits der Spalten liefern nichts', () => {
    const text = tabelle(
      'columns: Betrag:number, G:number = Betrag * 2, Notiz:text',
      '| 1 | [[Notiz]] | [[Zuviel]] #zuviel |',
    );
    const ergebnis = parseContent(QUELLE, text);
    expect(ergebnis.hits.map((h) => h.zielBasename)).toEqual(['Notiz']);
    expect(ergebnis.tags).toEqual([]);
  });

  it('AK4: Kopfzeilen liefern nichts, auch mit Verweis-Zeichen im Anzeigetext', () => {
    const text = tabelle('columns: Name "[[Kopf]] #kopf":text', 'aggregate: Name:count', '| x |');
    const ergebnis = parseContent(QUELLE, text);
    expect(ergebnis.hits).toEqual([]);
    expect(ergebnis.tags).toEqual([]);
  });

  it('AK4 (F1 b): in Backticks bleibt ein Verweis wörtlich', () => {
    const text = tabelle(KOPF, '| `[[Code]]` | 1 | ``#kein [[Treffer]]`` |');
    const ergebnis = parseContent(QUELLE, text);
    expect(ergebnis.hits).toEqual([]);
    expect(ergebnis.tags).toEqual([]);
  });

  it('AK4: ein Treffer überspannt keine Zellgrenze', () => {
    // Eine unmaskierte Pipe teilt die Zelle; die Anzeige zeigt `[[A` und
    // `B]]` in zwei Zellen und keinen Verweis.
    const text = tabelle('columns: A:text, B:text', '| [[A | B]] |');
    expect(parseContent(QUELLE, text).hits).toEqual([]);
  });

  it('AK4 (Rot-Probe): eine Fence anderer Art bleibt übersprungen', () => {
    for (const info of ['js', 'perspective-table', '']) {
      const text = ['```' + info, KOPF, '| [[Ziel]] #tag | 1 | [Text](Ziel.md) |', '```', ''].join(
        '\n',
      );
      const ergebnis = parseContent(QUELLE, text);
      expect(ergebnis.hits, info).toEqual([]);
      expect(ergebnis.tags, info).toEqual([]);
    }
  });

  it('Rot-Probe: die geschlossene Datentabelle trägt nicht weiter', () => {
    const text = [
      '```perspective-datatable',
      'columns: A:text',
      '| [[Drinnen]] |',
      '```',
      '',
      '```',
      '| [[Fremd]] |',
      '```',
      '',
    ].join('\n');
    expect(parseContent(QUELLE, text).hits.map((h) => h.zielBasename)).toEqual(['Drinnen']);
  });

  it('aus Zellen entstehen keine Überschriften, Block-Anker und Aufgaben-Zeilen', () => {
    const text = tabelle('columns: A:text, B:text', '| - [ ] offen | Text ^anker');
    const ergebnis = parseContent(QUELLE, text);
    expect(ergebnis.blockIds).toEqual([]);
    expect(ergebnis.tasks).toEqual([]);
    expect(ergebnis.headings).toEqual(['titel']);
  });

  it('AK5: die Erfassung liest keinen Erweiterungs-Schalter', () => {
    // Der Index ist zustandsfrei gegenüber der Anzeige: Weder die Zell-Grammatik
    // (Abhängigkeiten oben) noch der Parser fragen den Schalter der
    // Datentabelle. Festgehalten am Quelltext, weil der Parser keinen solchen
    // Zustand kennt, den ein Prüffall umstellen könnte.
    const quelle = readFileSync(new URL('../../src/main/index/parse.js', import.meta.url), 'utf8');
    expect(quelle).not.toMatch(/extensions?\//);
    expect(quelle).not.toMatch(/isExtensionActive|enabled\(\s*['"]perspective-datatable/);
  });

  it('AK14: eine lange Tabelle wird bis zur letzten Zeile erfasst', () => {
    const zeilen = ['columns: Nr:number, Name:text'];
    for (let n = 1; n <= 1200; n++) zeilen.push(`| ${n} | ${n === 1150 ? '[[Spaet]]' : 'x'} |`);
    const hits = parseContent(QUELLE, tabelle(...zeilen)).hits;
    expect(hits.map((h) => [h.zielBasename, h.zeile])).toEqual([['Spaet', 1154]]);
  });
});

// --- Zwischenspeicher -----------------------------------------------------------

describe('Zwischenspeicher (AK6, 4T-002013)', () => {
  it('die Schema-Version ist mindestens 6, damit ein Alt-Cache verfällt', () => {
    // Ein Zwischenspeicher der Vorgänger-Version trägt die Zell-Verweise nicht;
    // ein Warmstart aus ihm übernähme das Ergebnis unveränderter Dateien ohne
    // sie.
    expect(MDDA_CACHE_SCHEMA_VERSION).toBeGreaterThanOrEqual(6);
  });
});
