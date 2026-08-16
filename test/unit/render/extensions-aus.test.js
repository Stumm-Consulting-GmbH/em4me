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
// 4T-0849 (Epic 3E-0147): deklarative Seite des Aus-Zustands (Kommandos,
// Panel-Zugang) fuer Erweiterungen ohne Render-Konstrukt.
import { extensionById, internalExtensions } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  effectiveDisabledSet,
  isExtensionEnabled,
} from '../../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { panelAccessById } from '../../../src/shared/panel-access.js';

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

// 4T-0849 (Epic 3E-0147, Story S-0758): Aus-Zustand der Bücher-Erweiterung.
// Bücher bringen kein Markdown-Konstrukt mit, deshalb kein renderMarkdown-Fall
// wie oben: ihre Wirkung liegt auf den Kommandos, dem Panel-Zugang und der
// Buch-Erkennung im Main. Geprüft wird hier die deklarative Quelle, aus der
// sich alle drei speisen (Muster area-stats-extension.test.js); die
// Sichtbarkeits-Wirkung an der Oberfläche prüft die Test-Iteration an der EXE.
describe('Erweiterung books: Aus-Zustand (4T-0849)', () => {
  const BUCH_KOMMANDOS = [
    'book.open',
    'book.create',
    'book.close',
    'book.nextChapter',
    'book.previousChapter',
    'book.moveChapterFile',
    'view.toggleBookPanel',
    // 4T-0867 (Epic 3E-0162): Buecherregale laufen unter demselben Schalter
    // (Epic-Entscheidung: eine Stufe desselben Funktionsblocks).
    'shelf.open',
    'shelf.create',
    'shelf.close',
  ];

  it('ist als Werkzeug-Erweiterung mit den Katalog-Keys registriert', () => {
    const manifest = extensionById('books');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.nameKey).toBe('help.featureName.books');
    expect(manifest.descKey).toBe('help.feature.books');
    // Keine Abhängigkeit und kein eigener Einstellungs-Bereich.
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.settingsSections).toBeUndefined();
    // Ab Werk eingeschaltet (PO-Klärung zum Umsetzungs-Start): der Default
    // der Disabled-Liste ist leer, die Erweiterung damit aktiv.
    expect(isExtensionEnabled('books', [])).toBe(true);
    // Intern registriert und damit im Einstellungs-Bereich „Erweiterungen“
    // schaltbar (Story S-0758, AK1).
    expect(internalExtensions().some((m) => m.id === 'books')).toBe(true);
  });

  it('führt alle sieben Buch-Kommandos, und keines bleibt außen vor', () => {
    const manifest = extensionById('books');
    expect(manifest.commands).toEqual(BUCH_KOMMANDOS);
    const registrierte = new Set(COMMANDS.map((c) => c.id));
    for (const id of BUCH_KOMMANDOS) {
      expect(registrierte.has(id), `Kommando ${id} fehlt in commands.js`).toBe(true);
    }
    // Vollständigkeit gegen den Bestand: ein künftiges book.*-Kommando ohne
    // Eintrag in der Liste bliebe im Aus-Zustand bedienbar, während Panel und
    // Erkennung verschwänden — genau die Divergenz, die dieser Wächter
    // ausschließt.
    for (const id of COMMANDS.map((c) => c.id).filter((i) => i.startsWith('book.'))) {
      expect(
        manifest.commands.includes(id),
        `Kommando ${id} fehlt in der commands-Liste der Erweiterung books`,
      ).toBe(true);
    }
  });

  it('Aus-Zustand filtert genau diese Kommandos, An-Zustand keines', () => {
    const aus = disabledCommandIdSet(['books']);
    for (const id of BUCH_KOMMANDOS) expect(aus.has(id)).toBe(true);
    // Nachbarn in denselben Menüs bleiben unberührt: Bereich und Gliederung
    // sind Kern, die Lesezeichen eine eigene Erweiterung.
    expect(aus.has('area.open')).toBe(false);
    expect(aus.has('view.toggleOutline')).toBe(false);
    expect(aus.has('view.toggleBookmarks')).toBe(false);
    const an = disabledCommandIdSet([]);
    for (const id of BUCH_KOMMANDOS) expect(an.has(id)).toBe(false);
  });

  it('Panel-Zugang des Inhaltsverzeichnisses hängt an der Erweiterung', () => {
    const panel = panelAccessById('book');
    expect(panel).not.toBeNull();
    expect(panel.extensionId).toBe('books');
    // Deckungsgleich zur commands-Liste, damit Statusbar-Button,
    // Untermenü-Eintrag und Panel-Sichtbarkeit gemeinsam verschwinden.
    expect(extensionById('books').commands).toContain(panel.commandId);
  });

  it('Schalten wirkt nur auf den Zustand: keine Kaskade, sauberer Round-Trip', () => {
    // Soweit auf dieser Ebene prüfbar (Story S-0758, AK3): Die Registry-
    // Funktionen sind rein und fassen keine Datei an, das Manifest zieht keine
    // andere Erweiterung mit und wird von keiner gezogen, und Aus-und-wieder-An
    // liefert exakt die Ausgangs-Menge. Dass Buch-Datei, Begleitdatei und
    // Kapitel unangetastet bleiben, folgt daraus, dass an der Erweiterung kein
    // schreibender Migrations- oder Aufräum-Schritt hängt.
    expect([...effectiveDisabledSet(['books'])]).toEqual(['books']);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('books'), `${m.id} hängt an books`).toBe(false);
    }
    const vorher = [...disabledCommandIdSet([])].sort();
    disabledCommandIdSet(['books']);
    expect([...disabledCommandIdSet([])].sort()).toEqual(vorher);
  });
});

// 4T-1047 (Epic 3E-0151): Aus-Zustand der Mindmap-Ansicht. Sie bringt kein
// Render-Konstrukt mit, sondern einen Ansichts-Modus; geprüft wird deshalb
// die deklarative Seite (Registry, Kommando-Filterung) plus der Rückfall des
// gespeicherten Modus, der in mindmap-pane.js liegt.
describe('Erweiterung mindmap: Registry und Aus-Zustand (4T-1047)', () => {
  it('ist als Render-Erweiterung mit den Katalog-Keys registriert', () => {
    const manifest = extensionById('mindmap');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('render');
    expect(manifest.nameKey).toBe('help.featureName.mindmap');
    expect(manifest.descKey).toBe('help.feature.mindmap');
    expect(manifest.dependencies).toBeUndefined();
    // Ab Werk eingeschaltet: der Default der Disabled-Liste ist leer.
    expect(isExtensionEnabled('mindmap', [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === 'mindmap')).toBe(true);
  });

  it('führt genau das Modus-Kommando, und es ist registriert', () => {
    const manifest = extensionById('mindmap');
    expect(manifest.commands).toEqual(['view.modeMindmap']);
    const registrierte = new Set(COMMANDS.map((c) => c.id));
    expect(registrierte.has('view.modeMindmap')).toBe(true);
  });

  it('Aus-Zustand filtert genau dieses Kommando, An-Zustand keines', () => {
    const aus = disabledCommandIdSet(['mindmap']);
    expect(aus.has('view.modeMindmap')).toBe(true);
    // Die übrigen Modus-Kommandos bleiben unberührt.
    for (const id of ['view.modeRendered', 'view.modeSplit', 'view.modeSource', 'view.modeLive']) {
      expect(aus.has(id), `${id} darf nicht mitgefiltert werden`).toBe(false);
    }
    const an = disabledCommandIdSet([]);
    expect(an.has('view.modeMindmap')).toBe(false);
  });

  it('zieht keine andere Erweiterung mit und wird von keiner gezogen', () => {
    expect([...effectiveDisabledSet(['mindmap'])]).toEqual(['mindmap']);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('mindmap'), `${m.id} hängt an mindmap`).toBe(false);
    }
  });
});
