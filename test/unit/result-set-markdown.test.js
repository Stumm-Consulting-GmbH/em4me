// 4T-002546 (Epic 3E-000368, Story 4S-001197, AK2, AK3): Der Baustein
// «Ergebnismenge als Markdown-Tabelle» (src/shared/query/result-set-markdown.js).
//
// Die Mengen entstehen über die Aufbau-Funktionen des Format-Vertrags
// (`result-set.js`) und werden vor dem Schreiben gegen ihn geprüft, damit kein
// Fall eine Gestalt prüft, die die Auswertung nie liefert. Die Werte laufen
// über denselben Darstellungs-Kern wie die Abfrage-Ansicht; erwartet wird je
// Typ die Text-Form, die die Ansicht zeigt (Listen kommagetrennt, Datum im
// ISO-Format, Wahrheitswert als `true`/`false`).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resultSetMarkdown } = require('../../src/shared/query/result-set-markdown.js');
const {
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  makeRecordRef,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} = require('../../src/shared/query/result-set.js');
const { parseIsoLocalMs } = require('../../src/shared/query/query-format.js');
// Die Texte des Fensters, gestellt: Der Baustein setzt allein ein, was die
// Übersetzung liefert; die fünf Sprachfassungen prüft der i18n-Wächter.
const de = {
  'query.table.fileColumn': 'Datei',
  'query.table.recordColumn': 'Datensatz',
  'query.group.none': '(ohne Wert)',
  'query.empty': 'Keine Datei entspricht dieser Abfrage',
  'query.emptyRecords': 'Kein Datensatz entspricht dieser Abfrage',
  'workflow.dbQuery.taskColumn': 'Aufgabe',
};

const t = (key) => (key in de ? de[key] : key);
const spalte = (name, label = name) => makeColumn({ name, label, source: name });
const bereit = makeState('ready');

function menge(spec) {
  const rs = makeResultSet({ state: bereit, ...spec });
  expect(validateResultSet(rs)).toEqual([]);
  return rs;
}

const md = (rs) => resultSetMarkdown(rs, { t });

describe('Ergebnismenge als Markdown-Tabelle (4T-002546, AK2)', () => {
  it('Kopfzeile aus den Beschriftungen, vorn der Treffer als Verweis, Werte je Typ wie die Ansicht', () => {
    const datum = parseIsoLocalMs('2026-11-10');
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [
        spalte('title', 'Titel'),
        spalte('pages', 'Seiten'),
        spalte('tags'),
        spalte('done'),
        spalte('am'),
      ],
      rows: [
        makeRow(
          ['Solaris', 224, ['a', 'b'], true, { kind: 'date', ms: datum }],
          fileOrigin('C:/b/Solaris.md', 'Solaris'),
        ),
        makeRow([null, 0, [], false, null], fileOrigin('C:/b/Leer.md', 'Leer')),
      ],
    });
    expect(md(rs)).toBe(
      [
        '| Datei | Titel | Seiten | tags | done | am |',
        '| --- | --- | --- | --- | --- | --- |',
        '| [[Solaris]] | Solaris | 224 | a, b | true | 2026-11-10 |',
        '| [[Leer]] |  | 0 |  | false |  |',
        '',
      ].join('\n'),
    );
  });

  // Nachtrag zu 4T-002546 vom 2026-11-10: Der Verweis trägt die Anzeige-Form als
  // Anzeigetext, in der Zelle mit dem Trenner `\|`; ohne Anzeige-Form ohne Text.
  it('Datensatz-Ebene: Spalte «Datensatz», Treffer und Verweise als [[Tabelle#^Kennung|Anzeige-Form]]', () => {
    const ausleihe = {
      ...makeRecordRef('Library', 'r-00002', 'Zauberberg'),
      path: 'C:/b/Daten/Library.md',
    };
    const rs = menge({
      scope: 'records',
      type: 'table',
      columns: [spalte('book', 'Buch'), spalte('borrower', 'Leser')],
      rows: [makeRow([ausleihe, 'Clara'], recordOrigin('Loans', 'r-00001'))],
    });
    expect(md(rs).split('\n').slice(0, 3)).toEqual([
      '| Datensatz | Buch | Leser |',
      '| --- | --- | --- |',
      '| [[Loans#^r-00001]] | [[Library#^r-00002\\|Zauberberg]] | Clara |',
    ]);
  });

  it('der Treffer eines Datensatzes trägt seine Anzeige-Form wie in der Abfrage-Ansicht', () => {
    const rs = menge({
      scope: 'records',
      type: 'table',
      columns: [spalte('pages', 'Seiten')],
      rows: [
        makeRow([224], { ...recordOrigin('Library', 'r-00001'), display: 'Solaris' }),
        makeRow([5], { ...recordOrigin('Library', 'r-00007'), display: 'r-00007' }),
      ],
    });
    expect(md(rs).split('\n').slice(2, 4)).toEqual([
      '| [[Library#^r-00001\\|Solaris]] | 224 |',
      '| [[Library#^r-00007]] | 5 |',
    ]);
  });

  it('Sonderzeichen im Anzeigetext: Zeilenumbruch wird Leerzeichen, [ ] | und Backslash lassen den Text weg', () => {
    const zeile = (display) =>
      md(
        menge({
          scope: 'records',
          type: 'table',
          columns: [spalte('pages', 'Seiten')],
          rows: [makeRow([1], { ...recordOrigin('Library', 'r-00001'), display })],
        }),
      ).split('\n')[2];
    expect(zeile('Der Name\nder Rose')).toBe('| [[Library#^r-00001\\|Der Name der Rose]] | 1 |');
    for (const display of ['A [Band 2]', 'Ja | Nein', 'C:\\Pfad', 'x]]y']) {
      expect(zeile(display)).toBe('| [[Library#^r-00001]] | 1 |');
    }
  });

  it('WITHOUT ID lässt die Treffer-Spalte weg; ein Datei-Verweis im Wert wird [[Name]], Hervorhebung **…**', () => {
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [spalte('autor', 'Autor'), spalte('fett')],
      rows: [
        makeRow(
          [
            { kind: 'link', path: 'C:/b/Lem.md', name: 'Lem' },
            { kind: 'rich', segs: [{ text: 'wichtig', bold: true }] },
          ],
          fileOrigin('C:/b/Solaris.md', 'Solaris'),
        ),
      ],
      wishes: makeWishes({ withoutId: true }),
    });
    expect(md(rs).split('\n')[2]).toBe('| [[Lem]] | **wichtig** |');
  });

  it('maskiert den senkrechten Strich und macht aus einem Zeilenumbruch ein Leerzeichen', () => {
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [spalte('a|b', 'A|B'), spalte('text')],
      rows: [makeRow(['x | y', 'Zeile 1\nZeile 2'], fileOrigin('C:/b/N.md', 'N'))],
    });
    const zeilen = md(rs).split('\n');
    expect(zeilen[0]).toBe('| Datei | A\\|B | text |');
    expect(zeilen[2]).toBe('| [[N]] | x \\| y | Zeile 1 Zeile 2 |');
  });

  it('Block und Aufgabe: [[Name#^Anker]] und der Text der Aufgabe in der Spalte «Aufgabe»', () => {
    const bloecke = menge({
      scope: 'blocks',
      type: 'list',
      columns: [],
      rows: [makeRow([], blockOrigin('C:/b/N.md', 'N', 'abc'))],
    });
    expect(md(bloecke).split('\n')).toEqual(['| Datei |', '| --- |', '| [[N#^abc]] |', '']);
    const aufgaben = menge({
      scope: 'tasks',
      type: 'list',
      columns: [],
      rows: [
        makeRow([], taskOrigin('C:/b/P.md', 'P', 3, '- [ ] Rückblick | schreiben'), {
          urgency: 1,
          blocked: false,
          duplicateId: false,
        }),
      ],
    });
    expect(md(aufgaben).split('\n').slice(0, 3)).toEqual([
      `| ${de['workflow.dbQuery.taskColumn']} |`,
      '| --- |',
      '| Rückblick \\| schreiben |',
    ]);
  });

  it('eine Liste trägt ihr Zusatzfeld als zweite Spalte', () => {
    const rs = menge({
      scope: 'files',
      type: 'list',
      columns: [spalte('status', 'Status')],
      rows: [makeRow(['offen'], fileOrigin('C:/b/A.md', 'A'))],
    });
    expect(md(rs).split('\n').slice(0, 3)).toEqual([
      '| Datei | Status |',
      '| --- | --- |',
      '| [[A]] | offen |',
    ]);
  });

  it('eine gruppierte Liste schreibt je Gruppe eine Zwischenzeile, Untergruppen mit › davor, «ohne Wert» wie die Ansicht', () => {
    const rs = menge({
      scope: 'files',
      type: 'list',
      columns: [],
      rows: [
        makeRow([], fileOrigin('C:/b/A.md', 'A')),
        makeRow([], fileOrigin('C:/b/B.md', 'B')),
        makeRow([], fileOrigin('C:/b/C.md', 'C')),
      ],
      groups: [
        makeGroup('Roman', [0, 1], [makeGroup('Lem', [0]), makeGroup('Mann', [1])]),
        makeGroup(null, [2]),
      ],
    });
    expect(md(rs).split('\n')).toEqual([
      '| Datei |',
      '| --- |',
      '| **Roman** |',
      '| › **Lem** |',
      '| [[A]] |',
      '| › **Mann** |',
      '| [[B]] |',
      `| **${de['query.group.none']}** |`,
      '| [[C]] |',
      '',
    ]);
  });

  it('eine gruppierte Tabelle schreibt wie die Ansicht eine Zeile je Gruppe', () => {
    const gruppe = (wert, zeilen, werte) => ({ ...makeGroup(wert, zeilen), values: werte });
    const rs = menge({
      scope: 'records',
      type: 'table',
      columns: [spalte('count()', 'Anzahl')],
      rows: [
        makeRow([null], recordOrigin('Library', 'r-00001')),
        makeRow([null], recordOrigin('Library', 'r-00002')),
      ],
      groups: [gruppe('Lem', [0], [1]), gruppe('Mann', [1], [1])],
      groupColumns: [spalte('author', 'Autor')],
    });
    expect(md(rs).split('\n')).toEqual([
      '| Autor | Anzahl |',
      '| --- | --- |',
      '| Lem | 1 |',
      '| Mann | 1 |',
      '',
    ]);
  });
});

describe('Ohne Treffer (4T-002546, AK3)', () => {
  it('eine Tabelle ohne Zeilen und darunter der Satz der Ansicht, je Ebene', () => {
    const dateien = menge({ scope: 'files', type: 'table', columns: [spalte('a', 'A')], rows: [] });
    expect(md(dateien)).toBe(`| Datei | A |\n| --- | --- |\n\n${de['query.empty']}\n`);
    const saetze = menge({
      scope: 'records',
      type: 'table',
      columns: [spalte('a', 'A')],
      rows: [],
    });
    expect(md(saetze)).toBe(`| Datensatz | A |\n| --- | --- |\n\n${de['query.emptyRecords']}\n`);
  });
});
