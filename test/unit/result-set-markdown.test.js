// 4T-002546 (Epic 3E-000368, Story 4S-001197, AK2, AK3): Der Baustein
// «Ergebnismenge als Markdown-Tabelle» (src/shared/query/result-set-markdown.js).
//
// Die Mengen entstehen über die Aufbau-Funktionen des Format-Vertrags
// (`result-set.js`) und werden vor dem Schreiben gegen ihn geprüft, damit kein
// Fall eine Gestalt prüft, die die Auswertung nie liefert. Die Werte laufen
// über denselben Darstellungs-Kern wie die Abfrage-Ansicht; erwartet wird je
// Typ die Text-Form, die die Ansicht zeigt (Listen kommagetrennt, Datum im
// ISO-Format, Wahrheitswert als `true`/`false`).
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resultSetMarkdown } = require('../../src/shared/query/result-set-markdown.js');
// 4T-002734: Die erzeugte Tabelle wird mit der Zeichen-Pipeline der Anwendung
// gezeichnet, mit allen Erweiterungen an (Vorgabe des Moduls) und aus.
const {
  renderMarkdown,
  configureExtensions,
  convertMarkdownPortable,
  PERSPECTIVE_PORTABLE_MARKER,
} = require('../../src/shared/markdown/markdown.js');
const { internalExtensions } = require('../../src/shared/extensions/extensions.js');
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

  // Fortgeschrieben mit 4T-002734 (Zweitblick Runde 1, Befund 1): Der Helfer
  // schreibt den Strich in Text aus Daten als Entität `&#124;`; `zelle` findet
  // dann keinen rohen Strich mehr. Die Anzeige zeigt genau den Strich.
  it('maskiert den senkrechten Strich und macht aus einem Zeilenumbruch ein Leerzeichen', () => {
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [spalte('a|b', 'A|B'), spalte('text')],
      rows: [makeRow(['x | y', 'Zeile 1\nZeile 2'], fileOrigin('C:/b/N.md', 'N'))],
    });
    const zeilen = md(rs).split('\n');
    expect(zeilen[0]).toBe('| Datei | A&#124;B | text |');
    expect(zeilen[2]).toBe('| [[N]] | x &#124; y | Zeile 1 Zeile 2 |');
    const html = renderMarkdown(md(rs), 'de', { frontmatterBlock: false });
    expect(html).toContain('<th>A|B</th>');
    expect(html).toContain('<td>x | y</td>');
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
    // Fortgeschrieben mit 4T-002734: Strich wie in der Wert-Zelle.
    expect(md(aufgaben).split('\n').slice(0, 3)).toEqual([
      `| ${de['workflow.dbQuery.taskColumn']} |`,
      '| --- |',
      '| Rückblick &#124; schreiben |',
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

// ---------------------------------------------------------------------------
// 4T-002734 (Epic 3E-000431, Story 4S-001197, AK8 der Story): Daten bleiben
// Text. Jede Stelle, die Daten in die Tabelle trägt, erscheint in der
// gezeichneten Notiz als genau der Text, den die Abfrage-Ansicht zeigt, und
// löst weder Einbettung noch Verweis, Bild, Hervorhebung oder eine andere
// Auszeichnung aus. Gezeichnet wird mit `renderMarkdown`, je einmal mit allen
// Erweiterungen an (Vorgabe) und aus; `afterEach` stellt die Vorgabe wieder
// her, damit kein Fall einen anderen färbt.

const BS = '\\';
const ALLE_AUS = internalExtensions().map((e) => e.id);
const SCHALTER = [
  ['an', []],
  ['aus', ALLE_AUS],
];
const NACHSATZ = 'Nachsatz bleibt.';

afterEach(() => {
  configureExtensions([]);
});

function entitaetenAufloesen(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

// Zeichnet die Notiz aus Vorspann, Tabelle und einem festen Nachsatz und
// liefert die Zellen des Tabellen-Rumpfs samt dem, was nach der Tabelle steht.
function zeichne(markdown, vorspann = '') {
  const html = renderMarkdown(`${vorspann}${markdown}\n${NACHSATZ}\n`, 'de', {
    frontmatterBlock: false,
  });
  const rumpf = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const zellen = [...rumpf.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((m) => ({
    attr: m[1],
    html: m[2],
    text: entitaetenAufloesen(m[2].replace(/<[^>]*>/g, '')),
  }));
  const nach = html.slice(html.indexOf('</table>') + '</table>'.length);
  return { html, zellen, nachText: entitaetenAufloesen(nach.replace(/<[^>]*>/g, '')).trim() };
}

// Eine Ergebnismenge mit einer Zeile und einem Wert, ohne Treffer-Spalte.
function wertMenge(wert) {
  return menge({
    scope: 'files',
    type: 'table',
    columns: [spalte('wert', 'Wert')],
    rows: [makeRow([wert], fileOrigin('C:/b/N.md', 'N'))],
    wishes: makeWishes({ withoutId: true }),
  });
}

// Der Text, den die Zelle zeigen muss: der Wert, Zeilenumbrüche als Leerzeichen.
const alsZellText = (wert) => wert.replace(/\r\n?|\n/g, ' ');

// Erwartung «Text, kein Element»: genau eine Zelle ohne Attribut, ihr HTML
// ohne Element, ihr Text gleich dem Wert, und nach der Tabelle nur der Nachsatz.
function erwarteText(markdown, wert, vorspann = '') {
  const { zellen, nachText } = zeichne(markdown, vorspann);
  expect(zellen).toHaveLength(1);
  expect(zellen[0].attr).toBe('');
  expect(zellen[0].html).not.toMatch(/</);
  expect(zellen[0].text).toBe(alsZellText(wert));
  expect(nachText).toBe(NACHSATZ);
}

// Je erhobener Regel mindestens ein Wert (Erhebung Nr. 1 bis 35 ohne Nr. 21,
// 31 und 36: Abkürzung und Leerraum sind benannte Grenzen, der Block-Anker am
// Zellende gehört zu 4T-002778), dazu die Lagen der Bibliothek, die die
// Erhebung nicht erfasst hatte (Nr. 17 Schema `//`, Nr. 18 Fragezeichen-,
// Ausrufezeichen- und Komma-Folgen) und der einzelne Wagenrücklauf.
const REGELN = [
  ['1 Hervorhebung', ['*a*', '_a_', '**a**', 'a*b*c', '__a__']],
  ['2 Code', ['`a`', '``a`b``']],
  ['3 Verweis', ['[t](http://x)', '[t](bild.png "Titel")']],
  ['5 Bild', ['![b](bild.png)', '![b](bild.png =10x10)']],
  ['6 Autolink', ['<http://x.de>', '<a@b.de>']],
  ['7 Roh-HTML', ['<b>fett</b>', '<img src=x onerror=y>']],
  ['8 Zeichen-Entität', ['&amp;', '&copy;', '&#65;', '&#x41;']],
  ['9 Durchstreichung', ['~~a~~']],
  ['10 Tiefgestellt', ['H~2~O']],
  ['11 Hochgestellt', ['x^^2^^', 'x^2^']],
  ['12 Einfügung', ['++a++']],
  ['13 Markierung', ['==a==']],
  ['14 Formel', ['$a$', '$$a$$', '$ a $']],
  ['15 Fußnote inline', ['^[note]']],
  ['17 Verlinkung', ['http://x.de', 'https://x.de/p?q=1', 'www.x.de', 'example.com']],
  ['17 Verlinkung', ['siehe test.de jetzt', 'a@b.de', 'mailto:a@b.de', 'ftp://x.de']],
  ['17 Schema //', ['//localhost', 'x //localhost', 'https://localhost:8080/p', '//a.de']],
  ['17 Adresse', ['1.2.3.4', 'http://1.2.3.4']],
  ['18 Ersetzung', ['(c)', '(C)', '(tm)', '(TM)', '(r)', '(R)', '+-', '...', '..', 'a?...b']],
  ['18 Gedankenstrich', ['--', '---', 'a -- b', 'a--b', 'a---b', '----']],
  ['18 Folgen', ['a????b', 'a!!!!b', 'a,,b', 'a????!b', 'a?!?!b', 'a,,,b', 'Wow!!!!!']],
  ['19 Anführungszeichen', ['"a"', "'b'", "it's", 'Er sagt "Ja".']],
  ['20 Emoji', [':smile:', 'a:+1:b', ':-1:']],
  ['22 Wiki-Verweis', ['[[Geheim]]', '[[a|b]]', '[[@zt:X]]', '[[#Kapitel]]']],
  ['23 Einbettung', ['![[Privat]]', '![[x.png]]', '![[Privat#^k1]]']],
  ['24 Tag', ['#tag', 'a #tag b']],
  ['25 Kalender-Wert', ['@{Greg: 2026-01-01}']],
  ['26 Inline-Berechnung', ['{= 1+1 =}']],
  ['27 Critic Markup', ['{++a++}', '{--a--}', '{>>a<<}', '{==a==}', '{~~a~>b~~}']],
  ['28 Spoiler', ['||a||']],
  ['29 Attribut-Block', ['x {.cls}', 'x {#id}', 'x {foo}', '{.cls}', 'a {-}']],
  ['30 Bracketed Span', ['[t]{.cls}']],
  ['32 Privater Kommentar', ['x %%geheim%% y', 'x %%offen']],
  ['34 Rückstrich', [`a${BS}*b*`, `a${BS}b`, `a${BS}`, `${BS}${BS}`, `C:${BS}Pfad${BS}`]],
  ['35 Rückstrich vor Strich', [`a${BS}|b`, `${BS}|`]],
  ['Strich', ['x | y', '|']],
  ['Wagenrücklauf', ['a\r- x', 'a\r1. x', 'a\r\nb', 'a\nb']],
];

describe('Daten bleiben Text: je erhobener Regel ein Wert (4T-002734, AK3)', () => {
  for (const [schalter, aus] of SCHALTER) {
    for (const [regel, werte] of REGELN) {
      it.each(werte)(`Regel ${regel}, Erweiterungen ${schalter}: %j`, (wert) => {
        configureExtensions(aus);
        erwarteText(md(wertMenge(wert)), wert);
      });
    }
  }

  // Nr. 4 und 16 lösen nur mit einer Definition in derselben Notiz aus.
  it.each(SCHALTER)(
    'Regel 4 und 16 mit Definition in der Notiz, Erweiterungen %s',
    (_name, aus) => {
      configureExtensions(aus);
      const vorspann = '[t]: http://ref.example\n\n[^1]: Fußnote\n\n';
      for (const wert of ['[t]', 'x[^1]', '[t][]']) {
        erwarteText(md(wertMenge(wert)), wert, vorspann);
      }
    },
  );

  // Nr. 33: Ein einzelner Backtick im Wert darf einen privaten Kommentar der
  // Notiz nicht sichtbar machen, weder darunter noch davor. Nur mit den
  // Erweiterungen an: Ist die Erweiterung «comments» aus, gibt es keine
  // privaten Kommentare, `%%` ist dann gewöhnlicher Text.
  it('Regel 33: Backtick im Wert lässt den privaten Kommentar verborgen', () => {
    const tabelle = md(wertMenge('a`b'));
    const darunter = renderMarkdown(
      `${tabelle}\nText %%privat%% weiter mit \`code\` am Ende.\n`,
      'de',
    );
    expect(darunter).not.toContain('privat');
    const davor = renderMarkdown(`Vorher \` offen %%privat2%%\n\n${tabelle}`, 'de');
    expect(davor).not.toContain('privat2');
    expect(zeichne(tabelle).zellen[0].text).toBe('a`b');
  });
});

// Entscheidung 2 vom 2026-11-21: so eng maskieren, wie es ohne Lücke geht. Die
// harmlose Lage bleibt im Quelltext der Zelle unmaskiert und in der Anzeige
// gleich; die auslösende Lage steht oben in REGELN.
describe('Daten bleiben Text: harmlose Lagen bleiben lesbar (4T-002734)', () => {
  const HARMLOS = [
    '2026-11-21',
    'Ende.',
    'Satz. Noch einer.',
    'Hinweis: ja',
    'Hinweis:',
    'Seite (siehe unten)',
    '(a)',
    'Frage?',
    'Hallo!',
    'Was?!',
    'Echt???',
    'a, b',
    'a/b',
    'x - y',
    '-5',
    'Rückblick schreiben',
    'Größe 1, Maß 2',
  ];
  for (const [schalter, aus] of SCHALTER) {
    it.each(HARMLOS)(
      `Erweiterungen ${schalter}: %j bleibt im Quelltext und in der Anzeige gleich`,
      (wert) => {
        configureExtensions(aus);
        const markdown = md(wertMenge(wert));
        expect(markdown.split('\n')[2]).toBe(`| ${wert} |`);
        erwarteText(markdown, wert);
      },
    );
  }

  it('die auslösende Lage trägt den Rückstrich genau dort, wo die Bibliothek auslöst', () => {
    const zeile = (wert) => md(wertMenge(wert)).split('\n')[2];
    expect(zeile('a--b')).toBe(String.raw`| a\-\-b |`);
    expect(zeile('example.com')).toBe(String.raw`| example\.com |`);
    expect(zeile('a...')).toBe(String.raw`| a\.\.\. |`);
    expect(zeile('http://x')).toBe(String.raw`| http\:\/\/x |`);
    expect(zeile('(c) (x)')).toBe(String.raw`| \(c) (x) |`);
    expect(zeile('a????b')).toBe(String.raw`| a\?\?\?\?b |`);
    expect(zeile('a,,b')).toBe(String.raw`| a\,\,b |`);
    expect(zeile('//localhost')).toBe(String.raw`| \/\/localhost |`);
    expect(zeile('a`b')).toBe('| a&#96;b |');
  });
});

describe('Daten bleiben Text: weitere Stellen mit Daten (4T-002734, AK7)', () => {
  for (const [schalter, aus] of SCHALTER) {
    it(`Spalten-Überschrift und Überschrift der Gruppen-Spalte, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const gruppe = (wert, zeilen, werte) => ({ ...makeGroup(wert, zeilen), values: werte });
      const rs = menge({
        scope: 'records',
        type: 'table',
        columns: [spalte('n', '*Anzahl* [[X]]')],
        rows: [makeRow([null], recordOrigin('Library', 'r-00001'))],
        groups: [gruppe('**Lem**', [0], [1])],
        groupColumns: [spalte('author', '_Autor_ ![[P]]')],
      });
      const html = renderMarkdown(md(rs), 'de', { frontmatterBlock: false });
      const kopf = [...html.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => m[1]);
      expect(kopf.map(entitaetenAufloesen)).toEqual(['_Autor_ ![[P]]', '*Anzahl* [[X]]']);
      const { zellen } = zeichne(md(rs));
      expect(zellen.map((z) => z.html)).toEqual(['**Lem**', '1']);
    });

    it(`Gruppen-Wert der gruppierten Liste, mit und ohne Stücke, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const rs = menge({
        scope: 'files',
        type: 'list',
        columns: [],
        rows: [
          makeRow([], fileOrigin('C:/b/A.md', 'A')),
          makeRow([], fileOrigin('C:/b/B.md', 'B')),
        ],
        groups: [makeGroup('*Roman* ~~alt~~', [0]), makeGroup(['![[P]]', 'x'], [1])],
      });
      const { zellen } = zeichne(md(rs));
      // Die Zwischenzeile ist hervorgehoben, ihr Inhalt bleibt Text.
      expect(zellen[0].html).toBe('<strong>*Roman* ~~alt~~</strong>');
      expect(zellen[2].html).toBe('<strong>![[P]], x</strong>');
    });

    it(`Aufgaben-Zeile ohne Listen- und Status-Zeichen als Text, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const rs = menge({
        scope: 'tasks',
        type: 'list',
        columns: [],
        rows: [
          makeRow(
            [],
            taskOrigin('C:/b/P.md', 'P', 3, '- [ ] Rückblick *wichtig* [[X]] ![[P]] #tag'),
            { urgency: 1, blocked: false, duplicateId: false },
          ),
        ],
      });
      erwarteText(md(rs), 'Rückblick *wichtig* [[X]] ![[P]] #tag');
    });
  }
});

describe('Daten bleiben Text: Verweis-Namen, die die Schreibweise aufbrechen (4T-002734, AK8, P6)', () => {
  const BRECHEND = [
    'x]] ![[Privat',
    'a[b',
    'a|b',
    'a\nb',
    'a\rb',
    'a#b',
    `a${BS}b`,
    'a%%b',
    'a`b',
    '@zt:X',
    'javascript:x',
  ];
  const verweisWert = (name) => ({ kind: 'link', path: 'C:/b/x.md', name });
  const datensatzWert = (table) => ({
    ...makeRecordRef(table, 'r-00001', 'Anzeige'),
    path: 'C:/b/Daten/x.md',
  });

  for (const [schalter, aus] of SCHALTER) {
    it.each(BRECHEND)(`Verweis-Stück, Erweiterungen ${schalter}: %j wird Text`, (name) => {
      configureExtensions(aus);
      erwarteText(md(wertMenge(verweisWert(name))), name);
    });

    it.each(BRECHEND.filter((n) => !/[\\]/.test(n)))(
      `Tabellen-Name eines Datensatz-Verweises, Erweiterungen ${schalter}: %j ergibt die Anzeige-Form als Text`,
      (table) => {
        configureExtensions(aus);
        erwarteText(md(wertMenge(datensatzWert(table))), 'Anzeige');
      },
    );

    it.each(BRECHEND)(
      `Treffer-Spalte Datei und Block, Erweiterungen ${schalter}: %j wird Text`,
      (name) => {
        configureExtensions(aus);
        const dateien = menge({
          scope: 'files',
          type: 'list',
          columns: [],
          rows: [makeRow([], fileOrigin('C:/b/x.md', name))],
        });
        erwarteText(md(dateien), name);
        const bloecke = menge({
          scope: 'blocks',
          type: 'list',
          columns: [],
          rows: [makeRow([], blockOrigin('C:/b/x.md', name, 'k1'))],
        });
        erwarteText(md(bloecke), `${name}#^k1`);
      },
    );

    it(`Treffer-Spalte Datensatz mit brechendem Tabellen-Namen, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const rs = menge({
        scope: 'records',
        type: 'list',
        columns: [],
        rows: [makeRow([], { ...recordOrigin('x]] ![[Privat', 'r-00001'), display: 'Solaris' })],
      });
      erwarteText(md(rs), 'Solaris');
    });
  }

  it('Gegenprobe: gewöhnliche Namen, auch mit Ausrufe- und Dach-Zeichen, bleiben Verweise', () => {
    const zeile = (wert) => md(wertMenge(wert)).split('\n')[2];
    expect(zeile(verweisWert('Lem'))).toBe('| [[Lem]] |');
    expect(zeile(verweisWert('a!b'))).toBe('| [[a!b]] |');
    expect(zeile(verweisWert('a^b'))).toBe('| [[a^b]] |');
    expect(zeile(datensatzWert('Library'))).toBe('| [[Library#^r-00001\\|Anzeige]] |');
    const { zellen } = zeichne(md(wertMenge(verweisWert('a!b'))));
    expect(zellen[0].html).toBe('<a href="a!b.md" class="wikilink">a!b</a>');
  });

  it('der Name x]] ![[Privat in der gezeichneten Zelle: weder Verweis noch Einbettung', () => {
    const { html } = zeichne(md(wertMenge(verweisWert('x]] ![[Privat'))));
    expect(html).not.toContain('wikilink');
    expect(html).not.toContain('wiki-embed');
  });

  // Ergänzung zur Anzeige-Form: Backtick und doppeltes Prozentzeichen würden
  // den Abtaster der privaten Kommentare treffen; der Verweis bleibt ohne
  // Anzeigetext wie bei den Zeichen, die ihn zerbrächen.
  it('eine Anzeige-Form mit Backtick oder doppeltem Prozentzeichen bleibt weg, der Verweis bleibt', () => {
    for (const display of ['a`b', 'x %%y']) {
      const rs = menge({
        scope: 'records',
        type: 'table',
        columns: [spalte('pages', 'Seiten')],
        rows: [makeRow([1], { ...recordOrigin('Library', 'r-00001'), display })],
      });
      expect(md(rs).split('\n')[2]).toBe('| [[Library#^r-00001]] | 1 |');
    }
  });
});

describe('Daten bleiben Text: Zusammenspiel der Stücke (4T-002734, AK4, AK10, P1)', () => {
  for (const [schalter, aus] of SCHALTER) {
    it.each([['*a'], ['a*'], [`a${BS}`], ['[x]'], ['a--'], ['`']])(
      `Fett um ein maskiertes Stück bleibt fett, Erweiterungen ${schalter}: %j (P1)`,
      (text) => {
        configureExtensions(aus);
        const { zellen } = zeichne(md(wertMenge({ kind: 'rich', segs: [{ text, bold: true }] })));
        expect(zellen[0].html).toMatch(/^<strong>[^<]*<\/strong>$/);
        expect(zellen[0].text).toBe(text);
      },
    );

    it(`ein Ausrufezeichen am Ende eines Text-Stücks vor einem Verweis bettet nicht ein, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const wert = {
        kind: 'rich',
        segs: [
          { text: 'y', bold: true },
          { text: 'x!' },
          { link: { path: 'C:/b/L.md', name: 'L' } },
        ],
      };
      const { zellen } = zeichne(md(wertMenge(wert)));
      expect(zellen[0].html).not.toContain('wiki-embed');
      // Mit den Erweiterungen aus ist auch der Verweis Text.
      expect(zellen[0].text).toBe(schalter === 'an' ? 'yx!L' : 'yx![[L]]');
      if (schalter === 'an') expect(zellen[0].html).toContain('class="wikilink"');
    });

    it(`aneinanderstoßende Text-Stücke werden zusammen maskiert, Erweiterungen ${schalter}`, () => {
      configureExtensions(aus);
      const wert = {
        kind: 'rich',
        segs: [{ text: 'y', bold: true }, { text: 'a-' }, { text: '-b.' }, { text: '.c' }],
      };
      const { zellen } = zeichne(md(wertMenge(wert)));
      expect(zellen[0].text).toBe('ya--b..c');
    });
  }

  it('ein Datensatz-Verweis und ein Verweis-Feld mit gewöhnlichem Namen bleiben Verweise (AK4)', () => {
    const wert = [
      { kind: 'link', path: 'C:/b/Lem.md', name: 'Lem' },
      { ...makeRecordRef('Library', 'r-00002', 'Zauberberg'), path: 'C:/b/Daten/Library.md' },
    ];
    const { zellen } = zeichne(md(wertMenge(wert)));
    expect(zellen[0].html).toBe(
      '<a href="Lem.md" class="wikilink">Lem</a>, <a href="Library.md#r-00002" class="wikilink">Zauberberg</a>',
    );
  });
});

describe('Daten bleiben Text: Prüf-Punkte P2 und P4 (4T-002734)', () => {
  it('P2: Roh-HTML im Wert bleibt Text in einer Ziel-Notiz mit der Portable-Marke', () => {
    for (const wert of ['<b>f</b>', '<img src=x onerror=y>', '<a href="http://x">l</a>']) {
      erwarteText(md(wertMenge(wert)), wert, `${PERSPECTIVE_PORTABLE_MARKER}\n\n`);
    }
  });

  it('P4: «Speichern als portables Markdown» lässt den privaten Kommentar neben einem Backtick-Wert weg', () => {
    const tabelle = md(wertMenge('a`b'));
    const darunter = `${tabelle}\nText %%privat%% weiter mit \`code\` am Ende.\n`;
    expect(convertMarkdownPortable(darunter)).not.toContain('privat');
    const davor = `Vorher \` offen %%privat2%%\n\n${tabelle}`;
    expect(convertMarkdownPortable(davor)).not.toContain('privat2');
  });
});

// Nachtrag vom 2026-11-21 (P5): Der Index liest die erzeugte Tabelle zeilenweise
// auf Schlagworte. Die Raute steht deshalb als Entität `&#35;` in der Zelle; mit
// Rückstrich davor läse `TAG_RE` sie als Schlagwort der Ziel-Notiz.
describe('Daten bleiben Text: kein Schlagwort im Index aus einem Wert (4T-002734, P5)', () => {
  const { parseContent } = require('../../src/main/index/parse.js');
  const schlagworte = (wert) =>
    parseContent('C:/b/Bericht.md', `# Bericht\n\n${md(wertMenge(wert))}`).tags;

  it.each(['#geheim', 'a #b-c', '#a/b', '#35abc', 'x #id', '##`#x `y'])(
    '%j ergibt kein Schlagwort der Ziel-Notiz',
    (wert) => {
      expect(schlagworte(wert)).toEqual([]);
    },
  );

  it.each(SCHALTER)('die Raute erscheint als Text ohne Element, Erweiterungen %s', (_n, aus) => {
    configureExtensions(aus);
    for (const wert of ['#geheim', 'a #b-c', '#a/b', 'x #id', '#35abc']) {
      erwarteText(md(wertMenge(wert)), wert);
    }
    expect(md(wertMenge('#geheim')).split('\n')[2]).toBe('| &#35;geheim |');
  });
});

// Nachtrag vom 2026-11-21 (Zweitblick Runde 1, Befund 1): Die Tabellen-Werkzeuge
// des Editors (`table-edit.js`: «Tabelle formatieren», Zell-Bearbeitung der
// Live-Ansicht) zerlegen die erzeugte Tabelle in dieselben Zellen wie die
// Anzeige. Ein Strich nach einer geraden Zahl Rückstriche wäre für sie ein
// Spalten-Trenner; deshalb steht der Strich in Text aus Daten als `&#124;`.
describe('Daten bleiben Text: Tabellen-Werkzeuge zerlegen wie die Anzeige (4T-002734)', () => {
  const { parsePipeTable, parseTableCells } = require('../../src/shared/markdown/table-edit.js');
  // Roh-Text einer Zelle in den Text, den die Anzeige zeigt: erst die
  // Rückstrich-Maskierung in einem Durchgang, dann die Entitäten des Helfers.
  const angezeigt = (roh) => entitaetenAufloesen(roh.replace(/\\([!-/:-@[-`{-~])/g, '$1'));

  const FAELLE = [
    ['a|b', 'a|b'],
    ['||a||', '||a||'],
    [`a${BS}|b`, `a${BS}|b`],
    ['|', '|'],
    [{ kind: 'link', path: 'C:/b/x.md', name: 'a|b' }, 'a|b'],
    [{ ...makeRecordRef('T', 'r-00001', 'Anzeige'), path: 'C:/b/T.md' }, 'Anzeige'],
  ];

  it.each(FAELLE)('Wert %j: gleiche Zellen für Werkzeuge und Anzeige', (wert, erwartet) => {
    const markdown = md(wertMenge(wert));
    const zeilen = markdown.split('\n').filter((z) => z.startsWith('|'));
    const modell = parsePipeTable(zeilen);
    const { zellen } = zeichne(markdown);
    expect(modell.columnCount).toBe(1);
    expect(modell.rows).toHaveLength(1);
    expect(modell.rows[0]).toHaveLength(zellen.length);
    expect(parseTableCells(zeilen[2])).toHaveLength(zellen.length);
    expect(zellen[0].text).toBe(erwartet);
    // Der Datensatz-Verweis ist Markdown, kein Daten-Text; sein Trenner bleibt
    // `\|` mit einfachem Rückstrich, wie bisher.
    if (typeof wert === 'object' && wert.kind === 'record') {
      expect(modell.rows[0][0]).toBe('[[T#^r-00001\\|Anzeige]]');
    } else {
      expect(angezeigt(modell.rows[0][0])).toBe(erwartet);
    }
  });

  it('mehrere Spalten mit Strichen: Werkzeuge und Anzeige zählen dieselben Zellen', () => {
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [spalte('a', 'A|B'), spalte('b', '||x||')],
      rows: [makeRow(['|a', `b${BS}|`], fileOrigin('C:/b/N.md', 'a|N'))],
    });
    const zeilen = md(rs)
      .split('\n')
      .filter((z) => z.startsWith('|'));
    const modell = parsePipeTable(zeilen);
    const { zellen } = zeichne(md(rs));
    expect(modell.columnCount).toBe(3);
    expect(modell.header.map(angezeigt)).toEqual(['Datei', 'A|B', '||x||']);
    expect(modell.rows[0].map(angezeigt)).toEqual(zellen.map((z) => z.text));
    expect(zellen.map((z) => z.text)).toEqual(['a|N', '|a', `b${BS}|`]);
  });
});

// Benannte Grenzen (F3 a): Die Prüffälle halten das heutige Verhalten fest.
describe('Daten bleiben Text: benannte Grenzen (4T-002734)', () => {
  it('Leerraum am Rand eines Werts entfällt', () => {
    const { zellen } = zeichne(md(wertMenge('  a  ')));
    expect(zellen[0].text).toBe('a');
  });

  it('ein Wort mit Abkürzungs-Definition in der Ziel-Notiz bekommt die Kurzinfo, der Text bleibt gleich', () => {
    const { zellen } = zeichne(md(wertMenge('HTML')), '*[HTML]: Hypertext\n\n');
    expect(zellen[0].html).toContain('<abbr');
    expect(zellen[0].text).toBe('HTML');
  });
});
