// @vitest-environment jsdom
// 4T-002558 (Epic 3E-000390): Inhaltsverzeichnis als Block, Zaun `toc`.
//
// Geprüft wird der gemeinsame Kern src/shared/markdown/plugins/toc.js über die
// Pipeline (gerendert), dazu der Weg der Live-Ansicht: Die Überschriften kommen
// dort aus dem Lezer-Baum (live/live-toc.js über editor/ueberschriften.js) und
// reisen als Option `tocQuelle` an denselben Kern. Der Paritäts-Fall unten
// vergleicht beide Wege an demselben Dokument, der Prüf-Fixture des Tasks
// (Duplikat, Setext, Inline-Auszeichnung, explizites `{#id}`, Überschrift im
// Code-Block und Kopf-Block).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../renderer/api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import {
  renderMarkdown,
  configureHeadingNumbering,
} from '../../../src/shared/markdown/markdown.js';
import { tocOptionen, baueVerzeichnis } from '../../../src/shared/markdown/plugins/toc.js';

const { tocWidgetKontext, tocUeberschriften } =
  await import('../../../src/renderer/modules/live/live-toc.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'fixtures', 'render', 'inhaltsverzeichnis-block.md'),
  'utf8',
);

afterEach(() => configureHeadingNumbering({ enabled: false }));

// Die Verzeichnisse eines gerenderten Texts, je als Liste [ebene-Tiefe, href, text].
function verzeichnisse(html) {
  const wurzel = document.createElement('div');
  wurzel.innerHTML = html;
  return [...wurzel.querySelectorAll('nav.toc-block')].map((nav) =>
    [...nav.querySelectorAll('a')].map((a) => {
      let tiefe = 0;
      for (let el = a.parentElement; el && el !== nav; el = el.parentElement) {
        if (el.tagName === 'UL') tiefe += 1;
      }
      return [tiefe, a.getAttribute('href'), a.textContent];
    }),
  );
}

function lezerState(doc) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [LezerTable] })],
  });
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

const ALLE = [
  [1, '#einleitung', 'Einleitung'],
  [2, '#abschnitt', 'Abschnitt'],
  [2, '#abschnitt-1', 'Abschnitt'],
  [2, '#setext-uberschrift', 'Setext-Überschrift'],
  [3, '#fett-code-und-verweis', 'Fett, Code und Verweis'],
  [3, '#mein-anker', 'Eigener Anker'],
  [4, '#ebene-vier', 'Ebene vier'],
];

describe('Inhaltsverzeichnis-Block: gerenderter Weg (4T-002558)', () => {
  it('zeigt alle Ebenen ohne Angabe und begrenzt mit depth: 2 auf die Ebenen 1 und 2', () => {
    const [ohne, mitTiefe] = verzeichnisse(renderMarkdown(FIXTURE, 'de'));
    expect(ohne).toEqual(ALLE);
    expect(mitTiefe).toEqual(ALLE.slice(0, 4));
  });

  it('zeigt keine Überschrift aus einem Code-Block und keine aus dem Kopf-Block', () => {
    const html = renderMarkdown(FIXTURE, 'de');
    const texte = verzeichnisse(html)[0].map((e) => e[2]);
    expect(texte).toHaveLength(7);
    expect(html).toContain('Keine Überschrift im Code-Block');
    expect(texte).not.toContain('Keine Überschrift im Code-Block');
    expect(texte.some((t) => t.includes('titel'))).toBe(false);
  });

  it('zählt gleiche Überschriften wie die Anker hoch und nimmt ein explizites {#id}', () => {
    const html = renderMarkdown(FIXTURE, 'de');
    expect(html).toContain('id="abschnitt-1"');
    expect(html).toContain('id="mein-anker"');
    const hrefs = verzeichnisse(html)[0].map((e) => e[1]);
    expect(hrefs).toContain('#abschnitt-1');
    expect(hrefs).toContain('#mein-anker');
    expect(hrefs).not.toContain('#eigener-anker');
  });

  it('behält die Inline-Auszeichnung, aber keinen Verweis im Verweis', () => {
    const html = renderMarkdown(FIXTURE, 'de');
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).toContain('<strong>Fett</strong>, <code>Code</code> und Verweis');
    expect(nav).not.toContain('example.org');
  });

  it('maskiert Roh-HTML aus einer Überschrift', () => {
    const html = renderMarkdown('# A <b onclick="x()">B</b>\n\n```toc\n```\n', 'de');
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).not.toContain('<b');
    expect(nav).toContain('&lt;b');
  });

  it('zeigt ohne Überschriften den Platzhalter für den Hinweis-Text', () => {
    const html = renderMarkdown('Nur Text.\n\n```toc\n```\n', 'de');
    expect(html).toContain('class="toc-block toc-block-leer"');
    expect(html).toContain('data-i18n="tocBlock.empty"');
    expect(html).not.toContain('<ul>');
    // depth: 1 ohne Überschrift der Ebene 1 ist ebenso leer.
    expect(renderMarkdown('## Nur Ebene zwei\n\n```toc\ndepth: 1\n```\n', 'de')).toContain(
      'data-i18n="tocBlock.empty"',
    );
  });

  it('zeigt in mehreren Blöcken dasselbe Verzeichnis', () => {
    const src = '```toc\n```\n\n# Eins\n\n## Zwei\n\n```toc\n```\n\n# Drei\n';
    const [erster, zweiter] = verzeichnisse(renderMarkdown(src, 'de'));
    expect(erster).toEqual([
      [1, '#eins', 'Eins'],
      [2, '#zwei', 'Zwei'],
      [1, '#drei', 'Drei'],
    ]);
    expect(zweiter).toEqual(erster);
  });

  it('zeigt die Nummern der Überschriften-Nummerierung nur, wenn sie an ist', () => {
    const src = '# Eins\n\n## Zwei\n\n```toc\n```\n';
    expect(renderMarkdown(src, 'de')).not.toContain('heading-number');
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const [an] = verzeichnisse(renderMarkdown(src, 'de'));
    expect(an).toEqual([
      [1, '#eins', '1 Eins'],
      [2, '#zwei', '1.1 Zwei'],
    ]);
  });

  it('nimmt aus dem Körper allein depth: 1 bis 6 an, tiefe nicht mehr', () => {
    expect(tocOptionen('')).toEqual({ tiefe: 6 });
    expect(tocOptionen('depth: 3')).toEqual({ tiefe: 3 });
    expect(tocOptionen('titel: x\n  depth:2  ')).toEqual({ tiefe: 2 });
    for (const falsch of [
      'depth: 0',
      'depth: 7',
      'depth: 10',
      'depth: x',
      'depth: -1',
      'tiefe: 2',
    ]) {
      expect(tocOptionen(falsch)).toEqual({ tiefe: 6 });
    }
    expect(tocOptionen('depth: 9\ndepth: 2\ndepth: 4')).toEqual({ tiefe: 2 });
  });

  it('baut aus derselben Liste HTML und Markdown mit Ebenen-Sprung als eine Stufe', () => {
    const liste = [
      { ebene: 1, text: 'A', html: 'A', slug: 'a' },
      { ebene: 3, text: 'B [x]', html: 'B [x]', slug: 'b-x' },
      { ebene: 2, text: 'C', html: 'C', slug: 'c' },
    ];
    expect(baueVerzeichnis(liste, 6, 'markdown')).toBe(
      '- [A](#a)\n  - [B \\[x\\]](#b-x)\n  - [C](#c)\n',
    );
    expect(baueVerzeichnis(liste, 6, 'html')).toBe(
      '<nav class="toc-block"><ul><li><a href="#a" data-toc-index="0">A</a><ul>' +
        '<li><a href="#b-x" data-toc-index="1">B [x]</a></li>' +
        '<li><a href="#c" data-toc-index="2">C</a></li></ul></li></ul></nav>\n',
    );
    expect(baueVerzeichnis([], 6, 'markdown')).toBe('');
  });

  // Zweitblick zu 3E-000390: Ein eigener Anker mit Klammer bricht sonst aus
  // dem Verweis-Ziel aus; markdown-it liest `\)` im Ziel als Klammer.
  it('maskiert Klammern und Rückstriche eines eigenen Ankers im Markdown-Ziel', () => {
    const liste = [{ ebene: 1, text: 'A', html: 'A', slug: 'x)y(\\z' }];
    expect(baueVerzeichnis(liste, 6, 'markdown')).toBe('- [A](#x\\)y\\(\\\\z)\n');
    expect(renderMarkdown('- [A](#x\\)y\\(\\\\z)\n', 'de')).toContain('href="#x)y(%5Cz"');
  });
});

describe('Inhaltsverzeichnis-Block: Weg der Live-Ansicht (4T-002558)', () => {
  it('Parität: Lezer-Liste und Token-Weg ergeben an der Prüf-Fixture dasselbe Verzeichnis', () => {
    const state = lezerState(FIXTURE);
    const liste = tocUeberschriften(state);
    // Sieben Überschriften auf beiden Wegen; der Kopf-Block zählt nicht mit.
    expect(liste).toHaveLength(7);
    const { quelle } = tocWidgetKontext(state, (s) => s);
    const gerendert = verzeichnisse(renderMarkdown(FIXTURE, 'de'))[0];
    const live = verzeichnisse(renderMarkdown('```toc\n```\n', 'de', { tocQuelle: quelle }))[0];
    expect(live).toEqual(gerendert);
    expect(live).toEqual(ALLE);
    // Der Platz eines Eintrags ist der Platz seiner Überschrift in der Liste.
    expect(liste.map((u) => u.zeile)).toEqual([5, 12, 16, 20, 23, 25, 31]);
  });

  it('Parität mit Nummerierung und Tiefe', () => {
    configureHeadingNumbering({ enabled: true, startLevel: 1 });
    const { quelle } = tocWidgetKontext(lezerState(FIXTURE), (s) => s);
    const gerendert = verzeichnisse(renderMarkdown(FIXTURE, 'de'));
    const live = verzeichnisse(
      renderMarkdown('```toc\ndepth: 2\n```\n', 'de', { tocQuelle: quelle }),
    );
    expect(live[0]).toEqual(gerendert[1]);
    expect(live[0][0][2]).toBe('1 Einleitung');
  });

  it('lässt Überschriften in einem Kommentar weg und schneidet Inline-Kommentare heraus', () => {
    const doc = '# Eins %%privat%%\n\n%%\n# Versteckt\n%%\n\n# Zwei\n\n```toc\n```\n';
    const state = lezerState(doc);
    const { quelle } = tocWidgetKontext(state, (s) => s);
    const live = verzeichnisse(renderMarkdown('```toc\n```\n', 'de', { tocQuelle: quelle }))[0];
    expect(live).toEqual(verzeichnisse(renderMarkdown(doc, 'de'))[0]);
    expect(live.map((e) => e[2])).toEqual(['Eins', 'Zwei']);
  });

  it('Parität bei einem Verweis über eine Definition ([Text][name])', () => {
    const doc = '# Mit [Verweis][r] davor\n\n[r]: https://example.org\n\n```toc\n```\n';
    const { quelle } = tocWidgetKontext(lezerState(doc), (s) => s);
    const live = verzeichnisse(renderMarkdown('```toc\n```\n', 'de', { tocQuelle: quelle }))[0];
    expect(live).toEqual(verzeichnisse(renderMarkdown(doc, 'de'))[0]);
    expect(live).toEqual([[1, '#mit-verweis-davor', 'Mit Verweis davor']]);
  });

  it('zeigt bei leerer Liste den Platzhalter', () => {
    const { quelle } = tocWidgetKontext(lezerState('Nur Text.\n\n```toc\n```\n'), (s) => s);
    expect(quelle).toBe('');
    expect(renderMarkdown('```toc\n```\n', 'de', { tocQuelle: quelle })).toContain(
      'data-i18n="tocBlock.empty"',
    );
  });
});
