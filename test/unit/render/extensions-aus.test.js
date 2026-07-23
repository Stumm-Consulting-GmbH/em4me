// 4T-0293 (Epic 3E-0052): Aus-Zustand der Render-Erweiterungen.
// Pro Erweiterung genau ein gezielter Test (Epic-Test-Pragmatik): erst der
// An-Zustand als Nicht-Vakuitaets-Probe, dann schaltet configureExtensions
// die Erweiterung ab und die Syntax erscheint als Klartext bzw.
// Standard-Markdown. Die Snapshot-Suite bleibt auf dem Default-Zustand
// (alles an); afterEach stellt ihn wieder her.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';

afterEach(() => {
  configureExtensions([]);
});

function renderOff(id, src) {
  configureExtensions([id]);
  return renderMarkdown(src, 'de');
}

describe('Render-Erweiterungen: Aus-Zustand (4T-0293)', () => {
  it('callouts: Block wird normales Blockquote, Header bleibt Klartext', () => {
    const src = '> [!note] Titel\n> Inhalt';
    expect(renderMarkdown(src, 'de')).toContain('callout-note');
    const off = renderOff('callouts', src);
    expect(off).not.toContain('callout');
    expect(off).toContain('<blockquote');
    expect(off).toContain('[!note]');
  });

  it('custom-containers: ::: bleibt Klartext', () => {
    const src = '::: warning Eigener Titel\nBox-Inhalt\n:::';
    expect(renderMarkdown(src, 'de')).toContain('callout-warning');
    const off = renderOff('custom-containers', src);
    expect(off).not.toContain('callout-warning');
    expect(off).not.toContain('custom-container');
    expect(off).toContain(':::');
  });

  // 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges der custom-calendars-
  // Erweiterung. Ohne Konfiguration erscheint der An-Zustand als
  // "unbekannter Kalender"-Badge (Klasse calendar-value) — als Nicht-
  // Vakuitaets-Probe ausreichend; aus bleibt @{…} reiner Klartext.
  it('custom-calendars: @{…} bleibt Klartext', () => {
    const src = 'Wert @{Irgendwas: 1-2-3} im Text';
    expect(renderMarkdown(src, 'de')).toContain('calendar-value');
    const off = renderOff('custom-calendars', src);
    expect(off).not.toContain('calendar-value');
    expect(off).toContain('@{Irgendwas: 1-2-3}');
  });

  it('highlight: ==…== bleibt Klartext', () => {
    const src = 'Text mit ==Markierung== dazwischen';
    expect(renderMarkdown(src, 'de')).toContain('<mark');
    const off = renderOff('highlight', src);
    expect(off).not.toContain('<mark');
    expect(off).toContain('==Markierung==');
  });

  it('footnotes: keine Fussnoten-Struktur mehr (Standard-Markdown)', () => {
    const src = 'Text[^1]\n\n[^1]: Definition';
    expect(renderMarkdown(src, 'de')).toContain('footnote');
    const off = renderOff('footnotes', src);
    // Standard-Markdown-Degradation: `[^1]: Definition` wird zur
    // Link-Referenz-Definition, `[^1]` zum Referenz-Link — keine
    // Fussnoten-Struktur, kein Fussnoten-Block.
    expect(off).not.toContain('footnote');
    expect(off).toContain('^1');
  });

  it('emoji: :shortcode: bleibt Klartext', () => {
    const src = 'Ein :smile: mitten im Satz';
    expect(renderMarkdown(src, 'de')).not.toContain(':smile:');
    const off = renderOff('emoji', src);
    expect(off).toContain(':smile:');
  });

  it('abbreviations: Definition bleibt sichtbar, kein <abbr>', () => {
    const src = '*[HTML]: HyperText Markup Language\n\nHTML ist Auszeichnung.';
    expect(renderMarkdown(src, 'de')).toContain('<abbr');
    const off = renderOff('abbreviations', src);
    expect(off).not.toContain('<abbr');
    expect(off).toContain('*[HTML]');
  });

  it('figures: keine Figure, Groessen-Suffix bleibt Roh-Text', () => {
    const src = '![Alt-Text](bild.png =100x50)';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('<figure');
    expect(on).toContain('width="100"');
    const off = renderOff('figures', src);
    expect(off).not.toContain('<figure');
    expect(off).not.toContain('width="100"');
  });

  it('definition-lists: kein <dl>, Zeilen bleiben Absatz', () => {
    const src = 'Begriff\n: Definition';
    expect(renderMarkdown(src, 'de')).toContain('<dl');
    const off = renderOff('definition-lists', src);
    expect(off).not.toContain('<dl');
    expect(off).toContain(': Definition');
  });

  it('line-blocks: | Zeilen bleiben Klartext', () => {
    const src = '| Erste Zeile\n| Zweite Zeile';
    expect(renderMarkdown(src, 'de')).toContain('line-block');
    const off = renderOff('line-blocks', src);
    expect(off).not.toContain('line-block');
  });

  it('typography: ~, ^^ und ++ bleiben Klartext', () => {
    const src = 'H~2~O und x^^2^^ und ++unterstrichen++';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('<sub');
    expect(on).toContain('<sup');
    expect(on).toContain('<ins');
    const off = renderOff('typography', src);
    expect(off).not.toContain('<sub');
    expect(off).not.toContain('<sup');
    expect(off).not.toContain('<ins');
    expect(off).toContain('H~2~O');
  });

  it('attributes: {#id}/{.klasse} bleiben Klartext', () => {
    const src = '# Kopf {#eigene-id}\n\n[Span-Text]{.klasse}';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('id="eigene-id"');
    expect(on).toContain('class="klasse"');
    const off = renderOff('attributes', src);
    expect(off).not.toContain('id="eigene-id"');
    expect(off).not.toContain('class="klasse"');
    expect(off).toContain('{#eigene-id}');
  });

  it('spoiler: ||…|| bleibt Klartext', () => {
    const src = 'Ein ||Geheimnis|| im Text';
    expect(renderMarkdown(src, 'de')).toContain('class="spoiler"');
    const off = renderOff('spoiler', src);
    expect(off).not.toContain('class="spoiler"');
    expect(off).toContain('||Geheimnis||');
  });

  it('critic-markup: {++…++} rendert nicht als Critic', () => {
    const src = 'Aenderung {--alt--} und {>>Kommentar<<}';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('class="critic"');
    expect(on).toContain('critic-comment');
    const off = renderOff('critic-markup', src);
    expect(off).not.toContain('critic');
  });

  // 4T-0595 (Epic 3E-0111): Inline-Berechnungen. Probe mittig im Satz —
  // am Block-Ende wuerde im Aus-Zustand markdown-it-attrs das {…} als
  // Attribut-Block konsumieren (Bestandsverhalten der attributes-
  // Erweiterung, dokumentierter Sonderfall der 4T-0595-Loesung).
  it('inline-calc: {= … =} bleibt Klartext', () => {
    const src = 'Summe {= 2+3 =} im Satz';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('class="inline-calc"');
    expect(on).toContain('>5</span>');
    const off = renderOff('inline-calc', src);
    expect(off).not.toContain('inline-calc');
    expect(off).toContain('{= 2+3 =}');
  });

  it('comments: %%…%% verschwindet an, bleibt Literal aus (4T-0479)', () => {
    const src = 'Sichtbar %%geheim%% Text';
    // An-Zustand: der Kommentar-Inhalt verschwindet aus HTML und Export.
    expect(renderMarkdown(src, 'de')).not.toContain('geheim');
    expect(convertMarkdownPortable(src)).not.toContain('geheim');
    // Aus-Zustand: %% bleibt Literal-Text, der Export strippt nicht mehr.
    const off = renderOff('comments', src);
    expect(off).toContain('%%geheim%%');
    expect(convertMarkdownPortable(src)).toContain('%%geheim%%');
  });

  it('task-states: [/] bleibt Klartext, Basis-Checkboxen bleiben Kern', () => {
    const src = '- [/] in Arbeit\n- [ ] offen\n- [x] fertig';
    expect(renderMarkdown(src, 'de')).toContain('task-state-box');
    const off = renderOff('task-states', src);
    expect(off).not.toContain('task-state-box');
    expect(off).toContain('[/]');
    // Basis-Task-Listen sind Kern und bleiben Checkboxen.
    expect(off).toContain('task-list-item-checkbox');
  });

  it('tasks: Marker werden Badges an, bleiben Klartext aus (4T-0498)', () => {
    const src = '- [ ] Aufgabe mit Termin 📅 2099-12-31';
    expect(renderMarkdown(src, 'de')).toContain('task-marker');
    const off = renderOff('tasks', src);
    expect(off).not.toContain('task-marker');
    // Aus-Zustand: der Marker bleibt reiner Text (Querschnitt C des Epics).
    expect(off).toContain('📅 2099-12-31');
  });

  it('perspective-datatable: Fence bleibt Code-Block, Export konvertiert nicht (4T-0417)', () => {
    const src = '```perspective-datatable\ncolumns: N:number\naggregate: N:sum\n| 7 |\n```';
    expect(renderMarkdown(src, 'de')).toContain('pdt-grid');
    const off = renderOff('perspective-datatable', src);
    expect(off).not.toContain('pdt-grid');
    expect(off).toContain('columns: N:number');
    // Portable-Export: Fence bleibt unkonvertiert (der Marker kommt von der
    // weiterhin aktiven perspective-table-Erweiterung).
    const conv = convertMarkdownPortable(src);
    expect(conv).toContain('```perspective-datatable');
    expect(conv).not.toContain('<table');
  });

  // 4T-0512 (Epic 3E-0092): Ereignis-Erweiterung aus — Fence bleibt in
  // Render und Export ein neutraler Code-Block. Die Einspeisung des
  // internen Profils deckt 4T-0517 auf Main-Seite ab (events-core.test.js,
  // E2E eigenschafts-profile.spec.js).
  it('events: Fence bleibt Code-Block, Export konvertiert nicht (4T-0512)', () => {
    const src = '```perspective-events\n| 2020-01-01 | | Start | projekt | | | | | |\n```';
    expect(renderMarkdown(src, 'de')).toContain('perspective-events');
    expect(renderMarkdown(src, 'de')).toContain('pev-table');
    const off = renderOff('events', src);
    expect(off).not.toContain('pev-table');
    expect(off).toContain('| 2020-01-01 |');
    const conv = convertMarkdownPortable(src);
    expect(conv).toContain('```perspective-events');
    expect(conv).not.toContain('<table');
  });

  // 4T-0517 (Epic 3E-0092): transitive Richtung — property-profiles aus
  // nimmt events mit (dependencies-Kaskade wie wiki-embeds/wiki-links).
  it('events kaskadiert mit property-profiles (4T-0517)', () => {
    const src = '```perspective-events\n| 2020-01-01 | | Start | projekt | | | | | |\n```';
    const off = renderOff('property-profiles', src);
    expect(off).not.toContain('pev-table');
    expect(off).toContain('| 2020-01-01 |');
  });

  it('perspective-table: Fence bleibt Code-Block, Export konvertiert nicht', () => {
    const src = '```perspective-table\n{| caption="P"\n|! A\n| 1\n|}\n```';
    expect(renderMarkdown(src, 'de')).toContain('<table');
    const off = renderOff('perspective-table', src);
    expect(off).not.toContain('<table');
    expect(off).toContain('{| caption=&quot;P&quot;');
    // Portable-Export: unveraendert, ohne Marker.
    const conv = convertMarkdownPortable(src);
    expect(conv).toBe(src);
  });

  it('wiki-links: [[Ziel]] und ^anker bleiben Klartext, Embeds kaskadieren mit', () => {
    const src = 'Ein [[Ziel|Label]] und ein Absatz ^block-id\n\n![[bild.png]]';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('wikilink');
    expect(on).toContain('id="block-id"');
    expect(on).toContain('wiki-embed');
    // 4T-0294: wiki-embeds haengt deklarativ an wiki-links und
    // deaktiviert sich effektiv mit.
    const off = renderOff('wiki-links', src);
    expect(off).not.toContain('wikilink');
    expect(off).not.toContain('id="block-id"');
    expect(off).not.toContain('wiki-embed');
    expect(off).toContain('[[Ziel|Label]]');
    expect(off).toContain('^block-id');
  });

  it('wiki-embeds: kein Embed mehr, Wiki-Links bleiben aktiv', () => {
    const src = '[[Ziel]] und ![[bild.png]]';
    const off = renderOff('wiki-embeds', src);
    expect(off).toContain('wikilink');
    expect(off).not.toContain('wiki-embed');
    // Definierte Degradation: bei aktiven Wiki-Links wird `![[…]]` zu
    // `!` plus Wiki-Link — die `[[…]]`-Spanne bleibt ein Link, nur der
    // Embed-Operator verliert seine Wirkung.
    expect(off).toContain('!<a href="bild.png"');
  });

  it('tags: #tag bleibt Klartext', () => {
    const src = 'Text mit #projekt/alpha dazwischen';
    expect(renderMarkdown(src, 'de')).toContain('tag-link');
    const off = renderOff('tags', src);
    expect(off).not.toContain('tag-link');
    expect(off).toContain('#projekt/alpha');
  });

  // 4T-0435 (Epic 3E-0081): journals — der Navigations-Fence fällt auf den
  // Default-Code-Block zurück (die Kommando-Filterung deckt der Registry-
  // Test in journal-perioden.test.js ab).
  it('journals: perspective-journal-nav wird regulärer Code-Block', () => {
    const src = '```perspective-journal-nav\n```';
    expect(renderMarkdown(src, 'de')).toContain('class="perspective-journal-nav"');
    const off = renderOff('journals', src);
    expect(off).not.toContain('class="perspective-journal-nav"');
    expect(off).toContain('<pre>');
  });

  it('code-highlight: Code-Block ohne hljs, language-Klasse bleibt', () => {
    const src = '```js\nconst x = 1;\n```';
    expect(renderMarkdown(src, 'de')).toContain('hljs');
    const off = renderOff('code-highlight', src);
    expect(off).not.toContain('hljs');
    // Mermaid-Erkennung u.a. haengen an der language-Klasse des
    // Default-Renderers.
    expect(off).toContain('language-js');
    expect(off).toContain('const x = 1;');
  });
});
