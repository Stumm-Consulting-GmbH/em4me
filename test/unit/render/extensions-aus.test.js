// 4T-000293 (Epic 3E-000052): Aus-Zustand der Render-Erweiterungen.
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
// 4T-000849 (Epic 3E-000147): deklarative Seite des Aus-Zustands (Kommandos,
// Panel-Zugang) fuer Erweiterungen ohne Render-Konstrukt.
import { extensionById, internalExtensions } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
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

describe('Render-Erweiterungen: Aus-Zustand (4T-000293)', () => {
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

  // 4T-000546 (Epic 3E-000097): Kalender-Wert-Badges der custom-calendars-
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

  // 4T-000595 (Epic 3E-000111): Inline-Berechnungen. Probe mittig im Satz —
  // am Block-Ende wuerde im Aus-Zustand markdown-it-attrs das {…} als
  // Attribut-Block konsumieren (Bestandsverhalten der attributes-
  // Erweiterung, dokumentierter Sonderfall der 4T-000595-Loesung).
  it('inline-calc: {= … =} bleibt Klartext', () => {
    const src = 'Summe {= 2+3 =} im Satz';
    const on = renderMarkdown(src, 'de');
    expect(on).toContain('class="inline-calc"');
    expect(on).toContain('>5</span>');
    const off = renderOff('inline-calc', src);
    expect(off).not.toContain('inline-calc');
    expect(off).toContain('{= 2+3 =}');
  });

  it('comments: %%…%% verschwindet an, bleibt Literal aus (4T-000479)', () => {
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

  it('tasks: Marker werden Badges an, bleiben Klartext aus (4T-000498)', () => {
    const src = '- [ ] Aufgabe mit Termin 📅 2099-12-31';
    expect(renderMarkdown(src, 'de')).toContain('task-marker');
    const off = renderOff('tasks', src);
    expect(off).not.toContain('task-marker');
    // Aus-Zustand: der Marker bleibt reiner Text (Querschnitt C des Epics).
    expect(off).toContain('📅 2099-12-31');
  });

  it('perspective-datatable: Fence bleibt Code-Block, Export konvertiert nicht (4T-000417)', () => {
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

  // 4T-000512 (Epic 3E-000092): Ereignis-Erweiterung aus — Fence bleibt in
  // Render und Export ein neutraler Code-Block. Die Einspeisung des
  // internen Profils deckt 4T-000517 auf Main-Seite ab (events-core.test.js,
  // E2E eigenschafts-profile.spec.js).
  it('events: Fence bleibt Code-Block, Export konvertiert nicht (4T-000512)', () => {
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

  // 4T-000517 (Epic 3E-000092): transitive Richtung — property-profiles aus
  // nimmt events mit (dependencies-Kaskade wie wiki-embeds/wiki-links).
  it('events kaskadiert mit property-profiles (4T-000517)', () => {
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
    // 4T-000294: wiki-embeds haengt deklarativ an wiki-links und
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

  // 4T-000435 (Epic 3E-000081): journals — der Navigations-Fence fällt auf den
  // Default-Code-Block zurück (die Kommando-Filterung deckt der Registry-
  // Test in journal-perioden.test.js ab).
  it('journals: perspective-journal-nav wird regulärer Code-Block', () => {
    const src = '```perspective-journal-nav\n```';
    expect(renderMarkdown(src, 'de')).toContain('class="perspective-journal-nav"');
    const off = renderOff('journals', src);
    expect(off).not.toContain('class="perspective-journal-nav"');
    expect(off).toContain('<pre>');
  });

  // 4T-001064 (Epic 3E-000212): journals — der Timeline-Fence haengt an derselben
  // Erweiterung wie der Navigations-Fence und faellt ebenso zurueck.
  it('journals: perspective-journal-timeline wird regulärer Code-Block', () => {
    const src = '```perspective-journal-timeline\nmode: month\n```';
    const an = renderMarkdown(src, 'de');
    expect(an).toContain('class="perspective-journal-timeline"');
    expect(an).toContain('data-jt-source');
    const off = renderOff('journals', src);
    expect(off).not.toContain('class="perspective-journal-timeline"');
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

// 4T-000849 (Epic 3E-000147, Story 4S-000758): Aus-Zustand der Bücher-Erweiterung.
// Bücher bringen kein Markdown-Konstrukt mit, deshalb kein renderMarkdown-Fall
// wie oben: ihre Wirkung liegt auf den Kommandos, dem Panel-Zugang und der
// Buch-Erkennung im Main. Geprüft wird hier die deklarative Quelle, aus der
// sich alle drei speisen (Muster area-stats-extension.test.js); die
// Sichtbarkeits-Wirkung an der Oberfläche prüft die Test-Iteration an der EXE.
describe('Erweiterung books: Aus-Zustand (4T-000849)', () => {
  const BUCH_KOMMANDOS = [
    'book.open',
    'book.create',
    'book.close',
    'book.nextChapter',
    'book.previousChapter',
    'book.moveChapterFile',
    'view.toggleBookPanel',
    // 4T-000867 (Epic 3E-000162): Buecherregale laufen unter demselben Schalter
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
    // schaltbar (Story 4S-000758, AK1).
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
    // Soweit auf dieser Ebene prüfbar (Story 4S-000758, AK3): Die Registry-
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

// 4T-001047 (Epic 3E-000151): Aus-Zustand der Mindmap-Ansicht. Sie bringt kein
// Render-Konstrukt mit, sondern einen Ansichts-Modus; geprüft wird deshalb
// die deklarative Seite (Registry, Kommando-Filterung) plus der Rückfall des
// gespeicherten Modus, der in mindmap-pane.js liegt.
describe('Erweiterung mindmap: Registry und Aus-Zustand (4T-001047)', () => {
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

// 4T-001656 (Epic 3E-000287): Aus-Zustand der Canvas-Fläche (Story 4S-000919,
// Entscheidung E6). Sie bringt beides mit — ein Render-Konstrukt (die Fence)
// und einen Ansichts-Modus mit drei Kommandos —, deshalb stehen hier beide
// Seiten: der Render-Rückfall und die deklarative Seite. Der Rückfall des
// gespeicherten Ansichts-Modus und die Verfügbarkeit des Modus liegen im
// Renderer und werden in renderer/canvas-pane.test.js geprüft.
describe('Erweiterung canvas: Registry und Aus-Zustand (4T-001656)', () => {
  const FLAECHE = '```perspective-canvas\n!karte k1 x=0 y=0 b=200 h=100\n## Titel\n```';

  it('AK1: ist als Render-Erweiterung mit den Katalog-Keys registriert', () => {
    const manifest = extensionById('canvas');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('render');
    // Die bestehenden Katalog-Schlüssel, keine duplizierten Übersetzungen.
    expect(manifest.nameKey).toBe('help.featureName.canvas');
    expect(manifest.descKey).toBe('help.feature.canvas');
    expect(manifest.dependencies).toBeUndefined();
    // Ab Werk eingeschaltet: der Default der Disabled-Liste ist leer.
    expect(isExtensionEnabled('canvas', [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === 'canvas')).toBe(true);
    // Der descKey IST die Katalog-Zeile; im Aus-Zustand wird genau sie
    // gekennzeichnet (und sie steht seit diesem Vorgang nicht mehr in der
    // Kern-Liste von funktions-seite-kern.js).
    expect(disabledFeatureKeySet(['canvas']).has('help.feature.canvas')).toBe(true);
  });

  it('fuehrt genau die Canvas-Kommandos, und alle sind registriert', () => {
    const manifest = extensionById('canvas');
    expect(manifest.commands).toEqual([
      'view.modeCanvas',
      'canvas.addCard',
      'canvas.addShape',
      'canvas.addGroup',
      // 4T-001747 (Epic 3E-000289): die Verweis-Karte der Stufe 3.
      'canvas.addLinkCard',
      // 4T-001748 (Epic 3E-000289): die Bild-Karte derselben Stufe.
      'canvas.addImageCard',
      // 4T-001770 (Epic 3E-000290): die Verbindung ohne Maus, mit Ziel-Wahl in
      // der Karten-Liste.
      'canvas.addConnection',
      'canvas.stackFront',
      'canvas.stackForward',
      'canvas.stackBackward',
      'canvas.stackBack',
      'insert.canvas',
      // 4T-001769 (Epic 3E-000290): der Panel-Zugang der Karten-Liste.
      'view.toggleCanvasList',
      // 4T-001805 (Epic 3E-000292): die Ausgabe der Flaeche im offenen Format
      // JSON Canvas. Ohne die Flaeche hat sie keinen Gegenstand.
      'file.exportJsonCanvas',
      // 4T-001806 (Epic 3E-000292): das Einlesen einer solchen Datei, aus
      // demselben Grund an derselben Erweiterung.
      'file.importJsonCanvas',
    ]);
    const registrierte = new Set(COMMANDS.map((c) => c.id));
    for (const id of manifest.commands) {
      expect(registrierte.has(id), `${id} fehlt in der Kommando-Registry`).toBe(true);
    }
  });

  it('AK5: der Aus-Zustand filtert genau diese, der An-Zustand keines', () => {
    const aus = disabledCommandIdSet(['canvas']);
    for (const id of [
      'view.modeCanvas',
      'canvas.addCard',
      'canvas.addShape',
      'canvas.addGroup',
      // 4T-001747 (Epic 3E-000289): die Verweis-Karte der Stufe 3.
      'canvas.addLinkCard',
      // 4T-001748 (Epic 3E-000289): die Bild-Karte derselben Stufe.
      'canvas.addImageCard',
      // 4T-001770 (Epic 3E-000290): die Verbindung ohne Maus, mit Ziel-Wahl in
      // der Karten-Liste.
      'canvas.addConnection',
      'canvas.stackFront',
      'canvas.stackForward',
      'canvas.stackBackward',
      'canvas.stackBack',
      'insert.canvas',
      // 4T-001769 (Epic 3E-000290): der Panel-Zugang der Karten-Liste.
      'view.toggleCanvasList',
      // 4T-001805 (Epic 3E-000292): die Ausgabe der Flaeche im offenen Format
      // JSON Canvas. Ohne die Flaeche hat sie keinen Gegenstand.
      'file.exportJsonCanvas',
      // 4T-001806 (Epic 3E-000292): das Einlesen einer solchen Datei, aus
      // demselben Grund an derselben Erweiterung.
      'file.importJsonCanvas',
    ]) {
      expect(aus.has(id), `${id} muss im Aus-Zustand gefiltert sein`).toBe(true);
    }
    // Die Nachbarn in denselben Menüs bleiben unberührt: die übrigen fünf
    // Ansichts-Modi (der Mindmap-Modus hat seinen eigenen Schalter) und die
    // Einfüge-Kommandos des Kerns.
    for (const id of [
      'view.modeRendered',
      'view.modeSplit',
      'view.modeSource',
      'view.modeLive',
      'insert.table',
      'insert.codeBlock',
    ]) {
      expect(aus.has(id), `${id} darf nicht mitgefiltert werden`).toBe(false);
    }
    const an = disabledCommandIdSet([]);
    for (const id of [
      'view.modeCanvas',
      'canvas.addCard',
      'canvas.addShape',
      'canvas.addGroup',
      // 4T-001747 (Epic 3E-000289): die Verweis-Karte der Stufe 3.
      'canvas.addLinkCard',
      // 4T-001748 (Epic 3E-000289): die Bild-Karte derselben Stufe.
      'canvas.addImageCard',
      // 4T-001770 (Epic 3E-000290): die Verbindung ohne Maus, mit Ziel-Wahl in
      // der Karten-Liste.
      'canvas.addConnection',
      'canvas.stackFront',
      'canvas.stackForward',
      'canvas.stackBackward',
      'canvas.stackBack',
      'insert.canvas',
      // 4T-001769 (Epic 3E-000290): der Panel-Zugang der Karten-Liste.
      'view.toggleCanvasList',
      // 4T-001805 (Epic 3E-000292): die Ausgabe der Flaeche im offenen Format
      // JSON Canvas. Ohne die Flaeche hat sie keinen Gegenstand.
      'file.exportJsonCanvas',
      // 4T-001806 (Epic 3E-000292): das Einlesen einer solchen Datei, aus
      // demselben Grund an derselben Erweiterung.
      'file.importJsonCanvas',
    ]) {
      expect(an.has(id)).toBe(false);
    }
  });

  // 4T-001769 (Epic 3E-000290), AK10 der Story 4S-000948: Ist die Erweiterung
  // abgeschaltet, gibt es weder Knopf noch Menü-Eintrag noch Palette-Eintrag der
  // Karten-Liste. Alle drei hängen an derselben Kopplung — der Panel-Zugang
  // nennt seine Erweiterung, und sein Toggle-Kommando steht in deren
  // commands-Liste (Muster des Inhaltsverzeichnisses aus 4T-000849).
  it('AK10: der Panel-Zugang der Karten-Liste hängt an der Erweiterung', () => {
    const panel = panelAccessById('canvaslist');
    expect(panel).not.toBeNull();
    expect(panel.extensionId).toBe('canvas');
    expect(panel.commandId).toBe('view.toggleCanvasList');
    expect(extensionById('canvas').commands).toContain(panel.commandId);
    // Der Statusbar-Knopf verschwindet über dasselbe Gate: Der Renderer leitet
    // seine Liste aus genau diesen Zeilen ab (EXTENSION_STATUSBAR_BUTTONS).
    expect(disabledCommandIdSet(['canvas']).has(panel.commandId)).toBe(true);
    expect(disabledCommandIdSet([]).has(panel.commandId)).toBe(false);
  });

  it('AK3: die Fence erscheint abgeschaltet als gewöhnlicher Code-Block', () => {
    // Nicht-Vakuitäts-Probe zuerst: eingeschaltet ist es der Block aus E8.
    expect(renderMarkdown(FLAECHE, 'de')).toContain('canvas-block');
    const off = renderOff('canvas', FLAECHE);
    expect(off).not.toContain('canvas-block');
    expect(off).toContain('language-perspective-canvas');
    // Der Inhalt bleibt lesbar — abgeschaltet wird die Darstellung, nicht die
    // Angabe.
    expect(off).toContain('!karte k1 x=0 y=0 b=200 h=100');
  });

  it('AK6: das Wiedereinschalten stellt den Block zeichengleich wieder her', () => {
    const vorher = renderMarkdown(FLAECHE, 'de');
    renderOff('canvas', FLAECHE);
    configureExtensions([]);
    expect(renderMarkdown(FLAECHE, 'de')).toBe(vorher);
  });

  it('auch der portable Export fällt auf den Code-Block zurück', () => {
    // 4T-001777: Dieser Fall prüfte bis zur Stufe 5 **nichts**. Er verlangte,
    // dass kein `canvas-block` im Ergebnis steht — erfüllt, solange der
    // Konverter die Fence gar nicht anfasst, und damit auch dann grün, wenn
    // die Funktion fehlt. Die **Gegenprobe im Ein-Zustand** steht deshalb
    // voran: eingeschaltet erscheint die Entsprechung nach E7 und keine Fence,
    // abgeschaltet die Fence und keine Entsprechung.
    configureExtensions([]);
    const an = convertMarkdownPortable(FLAECHE, false, 'de');
    expect(an).toContain('**Titel · ');
    expect(an).not.toContain('perspective-canvas');
    expect(an).not.toContain('!karte k1');

    configureExtensions(['canvas']);
    const portabel = convertMarkdownPortable(FLAECHE, false, 'de');
    expect(portabel).not.toContain('canvas-block');
    expect(portabel).toContain('```perspective-canvas');
    expect(portabel).toContain('!karte k1 x=0 y=0 b=200 h=100');
    expect(portabel).not.toContain('**Titel · ');
  });

  it('zieht keine andere Erweiterung mit und wird von keiner gezogen', () => {
    // Story 4S-000919, Abgrenzung: Die Fläche steht für sich, keine andere
    // Funktion setzt sie voraus.
    expect([...effectiveDisabledSet(['canvas'])]).toEqual(['canvas']);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('canvas'), `${m.id} hängt an canvas`).toBe(false);
    }
  });
});
// 4T-001760 (Epic 3E-000253, Story 4S-000946): Registrierung der Datenbank als
// Werkzeug-Erweiterung und der Teil ihres Aus-Zustands, den die Registrierung
// selbst bewirkt. Die Schablone ist der Canvas-Block darüber, weil auch hier
// beide Seiten zusammenkommen: ein Render-Konstrukt (der Datensatz-Block) und
// die deklarative Seite (Kommando, Einstellungs-Bereich, Abhängigkeit).
//
// Die tiefergehenden Zusagen des Aus-Zustands (Live-Ansicht, ruhender
// Datensatz-Bestand im Index, Verweis-Auflösung, Suchraum-Schnitt) gehören zu
// 4T-001761 und stehen bewusst nicht hier.
describe('Erweiterung database: Registry und Aus-Zustand (4T-001760)', () => {
  // Ein Tabellen-Dokument: Die Spalten des Datensatz-Blocks stehen nicht in
  // seiner Fence, sondern in der Definition im Frontmatter derselben Datei.
  const TABELLE = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: name',
    '---',
    '',
    '```perspective-records',
    '|-',
    '| Anna',
    '```',
    '',
  ].join('\n');

  it('AK1: ist als Werkzeug-Erweiterung mit eigenen Texten registriert', () => {
    const manifest = extensionById('database');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    // Gebündelte Erweiterung: eigene extension.*-Texte statt einer
    // Katalog-Zeile, weil sie mehrere Zeilen zusammenfasst.
    expect(manifest.nameKey).toBe('extension.database.name');
    expect(manifest.descKey).toBe('extension.database.description');
    // Ab Werk eingeschaltet: der Default der Disabled-Liste ist leer.
    expect(isExtensionEnabled('database', [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === 'database')).toBe(true);
  });

  it('AK3: nennt die zehn Katalog-Zeilen der Gruppe «Datenbank»', () => {
    const manifest = extensionById('database');
    // 4T-001761 (Epic 3E-000253): Acht statt der ursprünglichen neun. Die Zeile
    // zum Suchraum-Schnitt ist in die Kern-Liste zurückgezogen, weil der
    // Schnitt an der Marke der Tabellen-Datei hängt und im Aus-Zustand
    // bestehen bleibt (Entscheidung E-C).
    //
    // 4T-001762 (Epic 3E-000253): Zehn statt acht. Die Katalog-Zeilen zum
    // Datenbank-Bereich und zu seiner Übersichts-Seite sind mit dem Hilfe- und
    // Handbuch-Task entstanden; beide beschreiben Bedienelemente, die im
    // Aus-Zustand entfallen, und gehören deshalb an die Erweiterung. Die dritte
    // neue Zeile, help.feature.databaseExtension, bleibt draußen: Sie
    // beschreibt den Schalter selbst und steht in der Kern-Liste.
    expect(manifest.featureKeys).toEqual([
      'help.feature.databaseTable',
      'help.feature.databaseColumnTypes',
      'help.feature.databaseRecordKey',
      'help.feature.databaseInfo',
      'help.feature.databaseRecords',
      'help.feature.databaseRecordsView',
      'help.feature.databaseSegments',
      'help.feature.databaseRecordLink',
      'help.feature.databaseArea',
      'help.feature.databaseOverview',
    ]);
    expect(manifest.featureKeys).not.toContain('help.feature.databaseSearchScope');
    expect(manifest.featureKeys).not.toContain('help.feature.databaseExtension');
    // Im Aus-Zustand tragen sie damit die Kennzeichnung der Funktions-Seite,
    // statt zu verschwinden; im An-Zustand keine von ihnen.
    const aus = disabledFeatureKeySet(['database']);
    for (const key of manifest.featureKeys) expect(aus.has(key)).toBe(true);
    const an = disabledFeatureKeySet([]);
    for (const key of manifest.featureKeys) expect(an.has(key)).toBe(false);
  });

  it('AK4: führt das Kommando der Übersicht, und es ist registriert', () => {
    const manifest = extensionById('database');
    expect(manifest.commands).toEqual(['database.openOverview']);
    const registrierte = new Set(COMMANDS.map((c) => c.id));
    expect(registrierte.has('database.openOverview')).toBe(true);
  });

  it('AK4: der Aus-Zustand filtert genau dieses Kommando, der An-Zustand keines', () => {
    const aus = disabledCommandIdSet(['database']);
    expect(aus.has('database.openOverview')).toBe(true);
    // Die Nachbarn im selben Ansichtsmenü bleiben unberührt.
    for (const id of ['stats.openArea', 'graph.openArea']) {
      expect(aus.has(id), `${id} darf nicht mitgefiltert werden`).toBe(false);
    }
    expect(disabledCommandIdSet([]).has('database.openOverview')).toBe(false);
  });

  it('AK4: der Einstellungs-Bereich «Datenbank» entfällt im Aus-Zustand', () => {
    const manifest = extensionById('database');
    expect(manifest.settingsSections).toEqual(['database']);
    expect(disabledSettingsSectionIdSet(['database']).has('database')).toBe(true);
    expect(disabledSettingsSectionIdSet([]).has('database')).toBe(false);
  });

  it('AK5: der Datensatz-Block erscheint abgeschaltet als gewöhnlicher Code-Block', () => {
    // Nicht-Vakuitäts-Probe zuerst: eingeschaltet ist es die typisierte Tabelle.
    expect(renderMarkdown(TABELLE, 'de')).toContain('class="perspective-records"');
    const off = renderOff('database', TABELLE);
    expect(off).not.toContain('class="perspective-records"');
    expect(off).toContain('language-perspective-records');
    // Der Inhalt bleibt lesbar — abgeschaltet wird die Darstellung, nicht die
    // Angabe.
    expect(off).toContain('| Anna');
  });

  it('AK5: das Wiedereinschalten stellt den Block zeichengleich wieder her', () => {
    const vorher = renderMarkdown(TABELLE, 'de');
    renderOff('database', TABELLE);
    configureExtensions([]);
    expect(renderMarkdown(TABELLE, 'de')).toBe(vorher);
  });

  it('AK5: auch der portable Export lässt die Fence als Rohtext stehen', () => {
    // Derselbe Weg, dieselbe Weiche: Der portable Konverter nutzt die zweite
    // Instanz derselben Pipeline.
    configureExtensions(['database']);
    const portabel = convertMarkdownPortable(TABELLE, true, 'de');
    expect(portabel).toContain('```perspective-records');
    expect(portabel).not.toContain('<table>');
  });

  it('AK6: das Abschalten der Eigenschafts-Profile schaltet die Datenbank mit ab', () => {
    // Die Gestalt einer Tabellen-Definition wird über ein internes Profil
    // beschrieben und geprüft (E15.3); ohne den Profil-Mechanismus entfiele
    // diese Prüfung.
    const manifest = extensionById('database');
    expect(manifest.dependencies).toEqual(['property-profiles']);
    expect(effectiveDisabledSet(['property-profiles']).has('database')).toBe(true);
    expect(isExtensionEnabled('database', ['property-profiles'])).toBe(false);
    // Und die Wirkung reicht bis in die Darstellung.
    expect(renderOff('property-profiles', TABELLE)).not.toContain('class="perspective-records"');
    // Umgekehrt nicht: die Datenbank abzuschalten lässt die Profile stehen.
    expect(isExtensionEnabled('property-profiles', ['database'])).toBe(true);
  });

  it('der eigene Schalter-Stand bleibt beim transitiven Abschalten erhalten', () => {
    // Wirk-Semantik der Persistenz: 'extensions.disabled' trägt nur die bewusst
    // abgeschalteten Kennungen; die Datenbank kehrt mit den Profilen zurück.
    expect(isExtensionEnabled('database', ['property-profiles'])).toBe(false);
    expect(isExtensionEnabled('database', [])).toBe(true);
  });

  it('zieht keine andere Erweiterung mit', () => {
    expect([...effectiveDisabledSet(['database'])]).toEqual(['database']);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes('database'), `${m.id} hängt an database`).toBe(false);
    }
  });
});
// 4T-001761 (Epic 3E-000253, Story 4S-000946): Der vollständige Aus-Zustand
// der Datenbank, soweit er an der Render-Pipeline hängt.
//
// **Abgrenzung zum Block darüber.** 4T-001760 hat die Registrierung gebaut und
// den Teil des Aus-Zustands geprüft, den sie selbst bewirkt: Lese-Ansicht,
// portabler Export, Kommando-Filterung, Einstellungs-Bereich, Abhängigkeit.
// Hier steht, was jene Registrierung NICHT von allein leistet — allen voran
// der **Änderungs-Modus**, dessen Live-Widget die Pipeline mit dem
// Frontmatter-Vorspann der Datei anwirft und deshalb einen eigenen Nachweis
// braucht.
//
// **Was hier bewusst NICHT noch einmal steht.** Der portable Export (AK2) und
// die Kommando-Filterung (AK3) sind im Block darüber geprüft; eine zweite
// Fassung derselben Messung wäre eine zweite Antwort auf dieselbe Frage. Die
// übrigen Zusagen liegen außerhalb der Render-Pipeline und haben ihre eigenen
// Prüfdateien: die Übersichts-Seite samt ihren Zugängen (AK4) in
// `test/unit/renderer/datenbank-uebersicht-zugaenge.test.js` und
// `…-beim-binden.test.js`, der ruhende Datensatz-Bestand mit Verweis-Auflösung,
// unveränderten Dateien und Wiedereinschalten (AK5 bis AK8) in
// `test/unit/datensatz-aus-zustand.test.js`, der bestehen bleibende
// Suchraum-Schnitt (AK9) in `test/unit/area-suchraum-datensaetze.test.js`.
describe('Erweiterung database: vollständiger Aus-Zustand (4T-001761)', () => {
  // Der Frontmatter-Vorspann einer Tabellen-Datei: Hier stehen die Spalten,
  // nicht in der Fence (E3.2). Er wird getrennt gehalten, weil der
  // Änderungs-Modus genau ihn als Vorspann vor die Fence setzt.
  const VORSPANN = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '  key: Kürzel',
    '---',
    '',
  ].join('\n');

  const FENCE = ['```perspective-records', '|- id="r-00001"', '| K-1', '| Anna', '```', ''].join(
    '\n',
  );

  const DOKUMENT = VORSPANN + '\n# Kundenliste\n\nEine Beschreibung.\n\n' + FENCE;

  it('AK2: die Lese-Ansicht zeigt den Block als gewöhnlichen Code-Block', () => {
    // Nicht-Vakuitäts-Probe: eingeschaltet trägt die Tabelle die Spalten-Köpfe
    // aus dem Vorspann, ist also wirklich die typisierte Darstellung.
    const an = renderMarkdown(DOKUMENT, 'de');
    expect(an).toContain('class="perspective-records"');
    expect(an).toContain('Kürzel');

    const aus = renderOff('database', DOKUMENT);
    expect(aus).not.toContain('class="perspective-records"');
    expect(aus).toContain('language-perspective-records');
    // Abgeschaltet wird die Darstellung, nicht die Angabe: Der Rohtext bleibt
    // vollständig lesbar, samt Kennung.
    expect(aus).toContain('r-00001');
    expect(aus).toContain('| Anna');
    // Und die Prosa der Datei bleibt, was sie war.
    expect(aus).toContain('Eine Beschreibung.');
  });

  it('AK2: der Änderungs-Modus zeigt denselben Code-Block', () => {
    // Das Live-Widget des Änderungs-Modus rendert NUR die Fence, stellt ihr
    // aber den Frontmatter-Vorspann der Datei voran und unterdrückt dessen
    // Anzeige (live-block-field.js baut den Vorspann, live-widget-render.js
    // ruft damit). Über die Preload-Brücke steht an der Stelle der Sprache der
    // Basis-Pfad; der Kern-Aufruf darunter ist dieser hier.
    const an = renderMarkdown(VORSPANN + FENCE, 'de', { frontmatterBlock: false });
    expect(an).toContain('class="perspective-records"');

    configureExtensions(['database']);
    const aus = renderMarkdown(VORSPANN + FENCE, 'de', { frontmatterBlock: false });
    expect(aus).not.toContain('class="perspective-records"');
    expect(aus).toContain('<pre');
    expect(aus).toContain('language-perspective-records');
    expect(aus).toContain('| Anna');
  });

  it('AK2: auch transitiv über die Eigenschafts-Profile fällt der Änderungs-Modus zurück', () => {
    // Derselbe Weg wie beim eigenen Schalter — die Wirkung des Aus-Zustands
    // darf nicht daran hängen, WELCHER Schalter ihn ausgelöst hat.
    configureExtensions(['property-profiles']);
    const aus = renderMarkdown(VORSPANN + FENCE, 'de', { frontmatterBlock: false });
    expect(aus).not.toContain('class="perspective-records"');
    expect(aus).toContain('language-perspective-records');
  });
});

describe('area-links: Aus-Zustand der Bereichs-Verknuepfungen (4T-001457)', () => {
  it('an: der Kuerzel-Link traegt Marke und Herkunft', () => {
    // Nicht-Vakuitaets-Probe: ohne sie belegt der Aus-Fall nichts.
    const html = renderMarkdown('[[@zt:Datei]]', 'de');
    expect(html).toContain('data-area-prefix="zt"');
    expect(html).toContain('arealink');
    expect(html).toContain('href="@zt:Datei.md"');
  });

  it('aus: der Link bleibt ein gewoehnlicher, unaufgeloester Wiki-Link (AK2)', () => {
    const html = renderOff('area-links', '[[@zt:Datei]]');
    // Die Marke ist weg — und das Ziel ist NICHT verschwunden, sondern zum
    // gewoehnlichen Datei-Namen geworden. Abgeschaltet wird die Wirkung, nicht
    // die Angabe (Entscheidung E7).
    expect(html).not.toContain('data-area-prefix');
    expect(html).not.toContain('arealink');
    expect(html).toContain('wikilink');
    expect(html).toContain('href="@zt:Datei.md"');
  });

  it('aus: auch die Einbettung traegt kein Kuerzel mehr', () => {
    const html = renderOff('area-links', '![[@zt:Notiz]]');
    expect(html).not.toContain('data-area-prefix');
  });

  it('aus: ein gewoehnlicher Wiki-Link bleibt unberuehrt', () => {
    const html = renderOff('area-links', '[[Datei]]');
    expect(html).toContain('href="Datei.md"');
    expect(html).toContain('wikilink');
  });

  it('haengt deklarativ an wiki-links und faellt mit ihm (AK5)', () => {
    const eintrag = extensionById('area-links');
    expect(eintrag).toBeTruthy();
    expect(eintrag.dependencies).toEqual(['wiki-links']);
    // Die Kaskade ist die Zusicherung: Ohne Wiki-Link gibt es keinen
    // Verknuepfungs-Link, und das muss niemand zusaetzlich pruefen.
    expect(effectiveDisabledSet(['wiki-links']).has('area-links')).toBe(true);
    expect(isExtensionEnabled('area-links', ['wiki-links'])).toBe(false);
    // Umgekehrt nicht: area-links abzuschalten laesst den Wiki-Link stehen.
    expect(isExtensionEnabled('wiki-links', ['area-links'])).toBe(true);
  });

  it('nennt Katalog-Schluessel statt eigener Uebersetzungen (AK1)', () => {
    const eintrag = extensionById('area-links');
    expect(eintrag.nameKey).toBe('help.featureName.areaLinks');
    expect(eintrag.descKey).toBe('help.feature.areaLinks');
    // Der descKey IST die Katalog-Zeile; im Aus-Zustand wird genau sie
    // gekennzeichnet.
    expect(disabledFeatureKeySet(['area-links']).has('help.feature.areaLinks')).toBe(true);
  });
});
