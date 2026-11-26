// 4T-002823 (Epic 3E-000445, Story 4S-001197): Ausgeschnitten aus
// result-set-markdown.test.js, weil jene Datei sonst ihr Zeilen-Budget
// überschreitet. Mengen und Hilfen wie dort: Aufbau über den Format-Vertrag
// (`result-set.js`), gezeichnet mit der Zeichen-Pipeline der Anwendung, je
// einmal mit allen Erweiterungen an (Vorgabe) und aus.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resultSetMarkdown } = require('../../src/shared/query/result-set-markdown.js');
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
  makeRow,
  makeGroup,
  makeState,
  makeResultSet,
  validateResultSet,
} = require('../../src/shared/query/result-set.js');

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

const alsZellText = (wert) => wert.replace(/\r\n?|\n/g, ' ');

// ---------------------------------------------------------------------------
// 4T-002823 (Epic 3E-000445, Story 4S-001197, AK1 und AK2): Lücken der Abnahme
// von `db-query … into`. Die Abnahme des Vorhabens 3E-000431 hat Werte mit
// senkrechtem Strich, Zeilenumbruch und HTML nicht geprüft. Die Fälle in
// result-set-markdown.test.js führen sie nur in der Tabelle ohne Treffer-
// Spalte; hier steht jede der drei
// Zeichenarten in jeder Form der Ansicht: Tabelle mit Treffer-Spalte, Liste mit
// Zusatzfeld, gruppierte Liste (Wert als Gruppen-Beschriftung und als Zusatz-
// feld) und gruppierte Tabelle. Gezeichnet wird mit `renderMarkdown`, der
// Pipeline der Lese-Ansicht; erwartet sind gleich viele Zellen in jeder Zeile,
// der Wert als Text ohne Element und der Nachsatz unter der unzerbrochenen
// Tabelle. Dazu das portable Markdown, das ohne Oberfläche entsteht; Live-
// Ansicht, HTML, PDF und Druck prüft der Ablauf-Fall WF-DBQ-AUS-01.

const ZEICHENARTEN = [
  ['senkrechter Strich', 'a | b'],
  ['Zeilenumbruch', 'Zeile 1\nZeile 2'],
  ['HTML', '<b>fett</b> <img src=x onerror=y>'],
];

// Roh-HTML zeichnet die Lese-Ansicht nur in einer Notiz mit der Portable-Marke;
// ohne sie bliebe ein HTML-Wert auch ohne Maskierung Text. Jede Form läuft
// deshalb in beiden Arten der Ziel-Notiz (Rot-Probe im Lösungs-Kapitel).
const ZIEL_NOTIZEN = [
  ['gewöhnliche Ziel-Notiz', ''],
  ['Ziel-Notiz mit Portable-Marke', `${PERSPECTIVE_PORTABLE_MARKER}\n\n`],
];

// Alle Zeilen des Tabellen-Rumpfs mit ihren Zellen, dazu der Text nach der Tabelle.
function zeichneZeilen(markdown, kopf = '') {
  return zerlegeTabelle(
    renderMarkdown(`${kopf}${markdown}\n${NACHSATZ}\n`, 'de', { frontmatterBlock: false }),
  );
}

function zerlegeTabelle(html) {
  expect(html.match(/<table/g) || []).toHaveLength(1);
  const rumpf = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const zeilen = [...rumpf.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((z) =>
    [...z[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((m) => ({
      attr: m[1],
      html: m[2],
      text: entitaetenAufloesen(m[2].replace(/<[^>]*>/g, '')),
    })),
  );
  const nach = html.slice(html.indexOf('</table>') + '</table>'.length);
  return { zeilen, nachText: entitaetenAufloesen(nach.replace(/<[^>]*>/g, '')).trim() };
}

// Eine Zelle zeigt den Wert als Text: kein Element außer der Hervorhebung der
// Gruppen-Zeile, deren Inhalt wieder reiner Text ist.
function erwarteZellText(zelle, wert, { hervorgehoben = false } = {}) {
  expect(zelle.attr).toBe('');
  const innen = hervorgehoben
    ? zelle.html.replace(/^(?:› )*<strong>([\s\S]*)<\/strong>$/, '$1')
    : zelle.html;
  expect(innen).not.toMatch(/</);
  expect(zelle.text.replace(/^(?:› )*/, '')).toBe(alsZellText(wert));
}

describe('Werte mit Strich, Zeilenumbruch und HTML in jeder Form (4T-002823, AK1)', () => {
  for (const [ziel, kopf] of ZIEL_NOTIZEN) {
    for (const [schalter, aus] of SCHALTER) {
      for (const [art, wert] of ZEICHENARTEN) {
        it(`Tabelle mit Treffer-Spalte, ${art}, Erweiterungen ${schalter}, ${ziel}`, () => {
          configureExtensions(aus);
          const rs = menge({
            scope: 'files',
            type: 'table',
            columns: [spalte('wert', 'Wert'), spalte('n', 'N')],
            rows: [
              makeRow([wert, 1], fileOrigin('C:/b/A.md', 'A')),
              makeRow(['danach', 2], fileOrigin('C:/b/B.md', 'B')),
            ],
          });
          const { zeilen, nachText } = zeichneZeilen(md(rs), kopf);
          expect(zeilen.map((z) => z.length)).toEqual([3, 3]);
          erwarteZellText(zeilen[0][1], wert);
          expect(zeilen[0][2].text).toBe('1');
          // Der Treffer ist ein Verweis, bei ausgeschalteten Erweiterungen als Text.
          expect(zeilen[1].slice(1).map((z) => z.text)).toEqual(['danach', '2']);
          expect(nachText).toBe(NACHSATZ);
        });

        it(`Liste mit Zusatzfeld, ${art}, Erweiterungen ${schalter}, ${ziel}`, () => {
          configureExtensions(aus);
          const rs = menge({
            scope: 'files',
            type: 'list',
            columns: [spalte('wert', 'Wert')],
            rows: [
              makeRow([wert], fileOrigin('C:/b/A.md', 'A')),
              makeRow(['danach'], fileOrigin('C:/b/B.md', 'B')),
            ],
          });
          const { zeilen, nachText } = zeichneZeilen(md(rs), kopf);
          expect(zeilen.map((z) => z.length)).toEqual([2, 2]);
          erwarteZellText(zeilen[0][1], wert);
          expect(zeilen[1].slice(1).map((z) => z.text)).toEqual(['danach']);
          expect(nachText).toBe(NACHSATZ);
        });

        it(`gruppierte Liste, Wert als Gruppe und als Zusatzfeld, ${art}, Erweiterungen ${schalter}, ${ziel}`, () => {
          configureExtensions(aus);
          const rs = menge({
            scope: 'files',
            type: 'list',
            columns: [spalte('wert', 'Wert')],
            rows: [
              makeRow([wert], fileOrigin('C:/b/A.md', 'A')),
              makeRow(['danach'], fileOrigin('C:/b/B.md', 'B')),
            ],
            groups: [makeGroup(wert, [0], [makeGroup(wert, [0])]), makeGroup('zweite', [1])],
          });
          const { zeilen, nachText } = zeichneZeilen(md(rs), kopf);
          expect(zeilen.map((z) => z.length)).toEqual([2, 2, 2, 2, 2]);
          erwarteZellText(zeilen[0][0], wert, { hervorgehoben: true });
          expect(zeilen[1][0].html.startsWith('› ')).toBe(true);
          erwarteZellText(zeilen[1][0], wert, { hervorgehoben: true });
          erwarteZellText(zeilen[2][1], wert);
          expect(zeilen[4].slice(1).map((z) => z.text)).toEqual(['danach']);
          expect(nachText).toBe(NACHSATZ);
        });

        it(`gruppierte Tabelle, Wert als Gruppe und als Wert, ${art}, Erweiterungen ${schalter}, ${ziel}`, () => {
          configureExtensions(aus);
          const gruppe = (g, zeilen, werte) => ({ ...makeGroup(g, zeilen), values: werte });
          const rs = menge({
            scope: 'files',
            type: 'table',
            columns: [spalte('wert', 'Wert')],
            rows: [
              makeRow([null], fileOrigin('C:/b/A.md', 'A')),
              makeRow([null], fileOrigin('C:/b/B.md', 'B')),
            ],
            groups: [gruppe(wert, [0], [wert]), gruppe('zweite', [1], ['danach'])],
            groupColumns: [spalte('art', 'Art')],
          });
          const { zeilen, nachText } = zeichneZeilen(md(rs), kopf);
          expect(zeilen.map((z) => z.length)).toEqual([2, 2]);
          erwarteZellText(zeilen[0][0], wert);
          erwarteZellText(zeilen[0][1], wert);
          expect(zeilen[1].map((z) => z.text)).toEqual(['zweite', 'danach']);
          expect(nachText).toBe(NACHSATZ);
        });
      }
    }
  }
});

describe('Portables Markdown einer geschriebenen Tabelle (4T-002823, AK2)', () => {
  it('«Speichern als portables Markdown» behält die Tabelle mit Strich, Zeilenumbruch und HTML', () => {
    const rs = menge({
      scope: 'files',
      type: 'table',
      columns: [spalte('wert', 'Wert')],
      rows: ZEICHENARTEN.map(([, wert], i) =>
        makeRow([wert], fileOrigin(`C:/b/N${i}.md`, `N${i}`)),
      ),
    });
    const tabelle = md(rs);
    const portabel = convertMarkdownPortable(`# Bericht\n\n${tabelle}\n${NACHSATZ}\n`);
    // Die Zeilen der Tabelle stehen unverändert im portablen Text.
    const zeilenVorher = tabelle.split('\n').filter((z) => z.startsWith('|'));
    const zeilenNachher = portabel.split(/\r?\n/).filter((z) => z.startsWith('|'));
    expect(zeilenNachher).toEqual(zeilenVorher);
    // Gezeichnet zeigt der portable Text samt seiner Marke dieselben Zellen.
    expect(portabel).toContain(PERSPECTIVE_PORTABLE_MARKER);
    const { zeilen, nachText } = zerlegeTabelle(
      renderMarkdown(portabel, 'de', { frontmatterBlock: false }),
    );
    expect(zeilen.map((z) => z.length)).toEqual([2, 2, 2]);
    ZEICHENARTEN.forEach(([, wert], i) => erwarteZellText(zeilen[i][1], wert));
    expect(nachText).toBe(NACHSATZ);
  });
});
