// @vitest-environment jsdom
// 4T-001904 (Epic 3E-000318): Prüffälle «Tags am Kartenfuß» — Sammeln und
// Herausnehmen der Tags, die Fußreihe der Karte, der globale Schalter samt
// Neu-Zeichnung aller Tafeln, der Weg eines Tag-Klicks ins Tag-Panel und die
// Verdrahtung über Registry, Menü, Brücke, Einstellungs-Verteilung und
// Erweiterung.
//
// **Gemessen wird an der echten Render-Kette** (Muster kanban-tafel.test.js):
// Die Zusage «die Tags am Fuß sehen aus wie in der Lese-Ansicht» ist ein
// Vergleich zweier Ergebnisse, kein Aufruf-Protokoll.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import {
  KANBAN_ANZEIGE_SCHALTER,
  kanbanAnzeigeAusSpeicher,
  normalisiereKanbanAnzeige,
} from '../../../src/shared/kanban-anzeige.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import {
  baueTagFuss,
  tagVerweisAn,
  trenneKartenTags,
} from '../../../src/renderer/modules/kanban/kanban-tags.js';
import { KARTE_KLASSE, zeichneTafel } from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;
const cjs = createRequire(import.meta.url);

// Der Weg eines Tag-Verweises der Lese-Ansicht. Er wird hier nachgestellt, weil
// das Modul am ganzen Fenster-Zustand hängt; gemessen wird, dass die Tafel
// **diesen** Weg mit dem Ziel des Tags ruft und keinen eigenen baut.
const { activateLink } = vi.hoisted(() => ({ activateLink: vi.fn(async () => {}) }));
vi.mock('../../../src/renderer/modules/views/link-navigation.js', () => ({ activateLink }));

// Die Prozess-Brücke, gestellt wie im Programm: Render-Kette, Einstellungs-Weg
// und die Meldung eines umgeschalteten Werts aus einem anderen Fenster. Sie
// muss VOR dem Laden der Einbettung stehen (Muster kanban-tafel.test.js).
const gespeichert = new Map();
let meldeAnFenster = null;
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  getSetting: vi.fn(async (k) => gespeichert.get(k)),
  setSetting: vi.fn(async (k, v) => {
    gespeichert.set(k, v);
  }),
  onKanbanAnzeigeChanged: (cb) => {
    meldeAnFenster = cb;
  },
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
const { kanbanAnzeige, schalteKanbanAnzeige, uebernimmKanbanAnzeige } =
  await import('../../../src/renderer/modules/kanban/kanban-anzeige-schalter.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte #arbeit mit Text #dringend',
  '\tFolgezeile mit #privat',
  '- [ ] Zweite Karte ohne Tag',
  '- [ ] Code `#nicht` und https://beispiel.de/#anker und #echt',
  '',
].join('\n');

const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Sammeln und Herausnehmen ---------------------------------------------------

describe('Tags der Karte trennen (4T-001904, AK1/AK2)', () => {
  it('sammelt aus Karten-Zeile und Folgezeilen in der Reihenfolge des Vorkommens', () => {
    const { text, tags } = trenneKartenTags('Erste #arbeit Karte #dringend\nFolge #privat');
    expect(tags).toEqual(['arbeit', 'dringend', 'privat']);
    expect(text).toBe('Erste Karte\nFolge');
  });

  it('lässt keine doppelten Abstände und keinen Rest-Weißraum am Zeilenende', () => {
    expect(trenneKartenTags('#vorn Text').text).toBe('Text');
    expect(trenneKartenTags('Text #mitte weiter').text).toBe('Text weiter');
    expect(trenneKartenTags('Text #a #b').text).toBe('Text');
    expect(trenneKartenTags('Text #a, weiter').text).toBe('Text, weiter');
  });

  it('AK2: ein # in Code-Spanne, Adresse und Verweis-Ziel bleibt unangetastet', () => {
    const quelle =
      'A `#code` B https://x.de/#frag C [L](https://y.de/#ziel) D [[Notiz#Anker]] E [n](#abschnitt) #echt';
    const { text, tags } = trenneKartenTags(quelle);
    expect(tags).toEqual(['echt']);
    expect(text).toBe(
      'A `#code` B https://x.de/#frag C [L](https://y.de/#ziel) D [[Notiz#Anker]] E [n](#abschnitt)',
    );
  });

  it('Farbcodes, reine Zahlen, maskierte Rauten und Attribut-Blöcke sind keine Tags', () => {
    const { text, tags } = trenneKartenTags('Farbe #fff Nummer #123 wörtlich \\#kein Titel {#id}');
    expect(tags).toEqual([]);
    expect(text).toBe('Farbe #fff Nummer #123 wörtlich \\#kein Titel {#id}');
  });

  it('ein Tag erscheint einmal, auch in anderer Schreibweise; es gilt die erste', () => {
    const { tags } = trenneKartenTags('#Projekt und #projekt\nnoch #PROJEKT und #zwei #zwei');
    expect(tags).toEqual(['Projekt', 'zwei']);
  });

  it('ein Tag im privaten Kommentar bleibt, wo es ist — die Lese-Ansicht zeigt es nicht', () => {
    const { text, tags } = trenneKartenTags('Karte %%geheim #intern%% sichtbar #offen');
    expect(tags).toEqual(['offen']);
    expect(text).toBe('Karte %%geheim #intern%% sichtbar');
  });

  it('ein Hierarchie-Tag bleibt ganz', () => {
    expect(trenneKartenTags('Karte #projekt/alpha').tags).toEqual(['projekt/alpha']);
  });

  it('eine Zeile nur aus Tags fällt weg, statt den Absatz zu teilen', () => {
    const { text } = trenneKartenTags('Oben\n#a #b\nUnten');
    expect(text).toBe('Oben\nUnten');
  });

  it('der Einzug einer Unterliste bleibt stehen', () => {
    const { text } = trenneKartenTags('Karte\n- #a Punkt\n  - Unter #b');
    expect(text).toBe('Karte\n- Punkt\n  - Unter');
  });

  it('ein Code-Block der Folgezeilen bleibt unberührt', () => {
    const quelle = 'Karte #a\n```\n#nicht ein Tag\n```\nDanach #b';
    const { text, tags } = trenneKartenTags(quelle);
    expect(tags).toEqual(['a', 'b']);
    expect(text).toBe('Karte\n```\n#nicht ein Tag\n```\nDanach');
  });

  it('AK5: ohne Tag bleibt der Text Zeichen für Zeichen, und es gibt keine Reihe', () => {
    const quelle = 'Nur Text\n\tmit Folgezeile';
    expect(trenneKartenTags(quelle)).toEqual({ text: quelle, tags: [] });
    expect(baueTagFuss([])).toBeNull();
  });
});

// --- Die Fußreihe in der Zeichnung ----------------------------------------------

function zeichne(text, zusatz = {}) {
  const container = document.createElement('section');
  zeichneTafel(container, leseTafel(text), {
    t: tStub,
    pfad: 'C:/Notizen/Tafel.md',
    renderMarkdown: (fragment) => renderMarkdown(fragment, 'de', { frontmatterBlock: false }),
    ...zusatz,
  });
  return container;
}

describe('Zeichnung mit Schalter an und aus (4T-001904, AK1/AK2/AK5/AK7)', () => {
  it('AK1: an — die Tags stehen als eigene Reihe am Kartenfuß', () => {
    const erste = zeichne(TAFEL, { tagsAmFuss: true }).querySelector(`.${KARTE_KLASSE}`);
    const fuss = erste.querySelector('.kanban-karte-tags');
    expect(fuss).not.toBeNull();
    // Die Reihe ist das letzte Element der Karte, unter dem Inhalt.
    expect(erste.lastElementChild).toBe(fuss);
    expect([...fuss.querySelectorAll('a.tag-link')].map((a) => a.textContent)).toEqual([
      '#arbeit',
      '#dringend',
      '#privat',
    ]);
  });

  it('AK2: an — der Karten-Text zeigt die Tags nicht mehr', () => {
    const erste = zeichne(TAFEL, { tagsAmFuss: true }).querySelector(`.${KARTE_KLASSE}`);
    const inhalt = erste.querySelector('.kanban-karte-inhalt');
    expect(inhalt.querySelector('.tag-link')).toBeNull();
    expect(inhalt.textContent).not.toContain('#');
    expect(inhalt.textContent).toContain('Erste Karte mit Text');
    expect(inhalt.textContent).toContain('Folgezeile mit');
  });

  it('AK2: an — Code-Spanne und Adresse bleiben im Text, nur das echte Tag wandert', () => {
    const dritte = zeichne(TAFEL, { tagsAmFuss: true }).querySelectorAll(`.${KARTE_KLASSE}`)[2];
    const inhalt = dritte.querySelector('.kanban-karte-inhalt');
    expect(inhalt.querySelector('code').textContent).toBe('#nicht');
    expect(inhalt.textContent).toContain('https://beispiel.de/#anker');
    expect([...dritte.querySelectorAll('.kanban-karte-tags a')].map((a) => a.textContent)).toEqual([
      '#echt',
    ]);
  });

  it('AK5: an — eine Karte ohne Tag zeigt keine leere Reihe', () => {
    const zweite = zeichne(TAFEL, { tagsAmFuss: true }).querySelectorAll(`.${KARTE_KLASSE}`)[1];
    expect(zweite.querySelector('.kanban-karte-tags')).toBeNull();
  });

  it('aus — die Karte zeichnet wie bisher, die Tags stehen im Text', () => {
    const erste = zeichne(TAFEL, { tagsAmFuss: false }).querySelector(`.${KARTE_KLASSE}`);
    expect(erste.querySelector('.kanban-karte-tags')).toBeNull();
    const imText = [...erste.querySelectorAll('.kanban-karte-inhalt a.tag-link')];
    expect(imText.map((a) => a.textContent)).toEqual(['#arbeit', '#dringend', '#privat']);
  });

  it('AK7: das Tag am Fuß ist dasselbe Markup wie in der Lese-Ansicht', () => {
    const lese = document.createElement('div');
    lese.innerHTML = renderMarkdown('#arbeit', 'de', { frontmatterBlock: false });
    const vorbild = lese.querySelector('a.tag-link');
    const amFuss = zeichne(TAFEL, { tagsAmFuss: true }).querySelector('.kanban-karte-tags a');
    expect(amFuss.className).toBe(vorbild.className);
    expect(amFuss.getAttribute('href')).toBe(vorbild.getAttribute('href'));
    expect(amFuss.textContent).toBe(vorbild.textContent);
  });

  it('AK6: viele Tags stehen alle in der Reihe; das Stilblatt bricht sie um', () => {
    const viele = Array.from({ length: 12 }, (_, i) => `#tag${i}x`).join(' ');
    const karte = zeichne(`${KOPF}\n## Offen\n\n- [ ] Karte ${viele}\n`, {
      tagsAmFuss: true,
    }).querySelector(`.${KARTE_KLASSE}`);
    expect(karte.querySelectorAll('.kanban-karte-tags a.tag-link')).toHaveLength(12);
    // jsdom rechnet kein Layout; die Zusage steht im Stilblatt.
    const css = lies('src/renderer/styles/kanban.css');
    const regel = /\.kanban-karte-tags \{[^}]*\}/.exec(css);
    expect(regel, 'Regel der Fußreihe fehlt').not.toBeNull();
    expect(regel[0]).toContain('flex-wrap: wrap');
    expect(regel[0]).toContain('flex: 0 0 100%');
    expect(css).toMatch(/\.kanban-karte \{\s*flex-wrap: wrap;/);
  });

  it('AK7: hell und dunkel aus der Regel der Lese-Ansicht, ohne eigene Farbe', () => {
    const css = lies('src/renderer/styles/eigenschaften-und-notizen.css');
    for (const sel of [
      '.kanban-karte-tags .tag-link {',
      '.kanban-karte-tags .tag-link:hover {',
      "[data-theme='dark'] .kanban-karte-tags .tag-link {",
      "[data-theme='dark'] .kanban-karte-tags .tag-link:hover {",
    ]) {
      expect(css, sel).toContain(sel);
    }
    const eigene = /\.kanban-karte-tags[^{]*\{[^}]*\}/g;
    for (const block of lies('src/renderer/styles/kanban.css').match(eigene) || []) {
      expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});

// --- Der Schalter an der eingebetteten Tafel ------------------------------------

function baueSpalten(texte) {
  const tabs = texte.map((content) => ({
    content,
    viewMode: 'kanban',
    path: 'C:/Notizen/Tafel.md',
    editMode: true,
  }));
  const container = texte.map(() => {
    const el = document.createElement('section');
    document.body.appendChild(el);
    return el;
  });
  initKanbanPane({
    getPaneEls: (i) => ({ kanbanEl: container[i] }),
    aktivesDokument: (i) => tabs[i] || null,
    istAenderbar: () => true,
  });
  texte.forEach((_, i) => renderKanban(i));
  return { tabs, container };
}

describe('Schalter «Tags am Kartenfuß» an der Tafel (4T-001904, AK3/AK4)', () => {
  beforeEach(async () => {
    gespeichert.clear();
    window.api.setSetting.mockClear();
    activateLink.mockClear();
    await tick();
    uebernimmKanbanAnzeige('kanban.tagsAmFuss', false);
  });

  it('die Vorgabe ist aus', () => {
    // 4T-001903: dahinter der zweite Schalter «Termine relativ anzeigen».
    expect(normalisiereKanbanAnzeige(null)).toEqual({
      'kanban.tagsAmFuss': false,
      'kanban.terminRelativ': false,
    });
    expect(KANBAN_ANZEIGE_SCHALTER.map((s) => [s.kommando, s.schluessel, s.vorgabe])).toEqual([
      ['kanban.toggleTagsFooter', 'kanban.tagsAmFuss', false],
      ['kanban.toggleRelativeDates', 'kanban.terminRelativ', false],
    ]);
  });

  it('AK3: Umschalten zeichnet sofort alle offenen Tafeln neu und speichert global', async () => {
    const { container } = baueSpalten([TAFEL, TAFEL]);
    await tick();
    expect(container[0].querySelector('.kanban-karte-tags')).toBeNull();
    expect(container[1].querySelector('.kanban-karte-tags')).toBeNull();

    expect(schalteKanbanAnzeige('kanban.toggleTagsFooter')).toBe(true);
    expect(container[0].querySelector('.kanban-karte-tags')).not.toBeNull();
    expect(container[1].querySelector('.kanban-karte-tags')).not.toBeNull();
    expect(window.api.setSetting).toHaveBeenCalledWith('kanban.tagsAmFuss', true);

    schalteKanbanAnzeige('kanban.toggleTagsFooter');
    expect(container[0].querySelector('.kanban-karte-tags')).toBeNull();
    expect(window.api.setSetting).toHaveBeenLastCalledWith('kanban.tagsAmFuss', false);
  });

  it('AK4: das Dokument bleibt bei beiden Darstellungen byte-gleich', async () => {
    const { tabs } = baueSpalten([TAFEL]);
    await tick();
    schalteKanbanAnzeige('kanban.toggleTagsFooter');
    expect(tabs[0].content).toBe(TAFEL);
    schalteKanbanAnzeige('kanban.toggleTagsFooter');
    expect(tabs[0].content).toBe(TAFEL);
  });

  it('die gespeicherte Einstellung gilt beim Start', async () => {
    gespeichert.set('kanban.tagsAmFuss', true);
    const { container } = baueSpalten([TAFEL]);
    await tick();
    expect(kanbanAnzeige('kanban.tagsAmFuss')).toBe(true);
    expect(container[0].querySelector('.kanban-karte-tags')).not.toBeNull();
  });

  it('die Meldung eines anderen Fensters zieht nach; ein gleicher Wert zeichnet nicht neu', async () => {
    const { container } = baueSpalten([TAFEL]);
    await tick();
    expect(typeof meldeAnFenster).toBe('function');
    meldeAnFenster({ schluessel: 'kanban.tagsAmFuss', wert: true });
    const fuss = container[0].querySelector('.kanban-karte-tags');
    expect(fuss).not.toBeNull();
    meldeAnFenster({ schluessel: 'kanban.tagsAmFuss', wert: true });
    expect(container[0].querySelector('.kanban-karte-tags')).toBe(fuss);
    // Ein fremder Schlüssel bleibt ohne Wirkung.
    expect(uebernimmKanbanAnzeige('kanban.unbekannt', true)).toBe(false);
  });

  it('ein unbekanntes Kommando schaltet nichts', () => {
    expect(schalteKanbanAnzeige('kanban.unbekannt')).toBe(false);
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });
});

// --- Tag-Klick -----------------------------------------------------------------

describe('Klick auf ein Tag der Karte (4T-001904, AK8)', () => {
  // Die Einbettung liest beim Aufbau die gespeicherte Einstellung; sie steht
  // deshalb im Speicher und nicht allein im laufenden Wert.
  beforeEach(async () => {
    activateLink.mockClear();
    gespeichert.set('kanban.tagsAmFuss', true);
    await tick();
    uebernimmKanbanAnzeige('kanban.tagsAmFuss', true);
  });

  function klicke(el, art = 'click') {
    el.dispatchEvent(new window.MouseEvent(art, { bubbles: true, cancelable: true, button: 0 }));
  }

  it('AK8: öffnet das Tag-Panel über den Weg der Lese-Ansicht, mit dem Tag als Filter', async () => {
    const { container } = baueSpalten([TAFEL]);
    await tick();
    const tag = container[0].querySelector('.kanban-karte-tags a.tag-link');
    klicke(tag);
    await vi.waitFor(() => expect(activateLink).toHaveBeenCalledTimes(1));
    expect(activateLink).toHaveBeenCalledWith(0, '#tag:arbeit', false);
  });

  it('der Griff zum Tag wählt die Karte nicht und öffnet keine Bearbeitung', async () => {
    const { container } = baueSpalten([TAFEL]);
    await tick();
    const karten = [...container[0].querySelectorAll(`.${KARTE_KLASSE}`)];
    // Die zweite Karte ist gewählt; der Griff zum Tag der ersten ändert das nicht.
    klicke(karten[1], 'mousedown');
    expect(karten[1].getAttribute('aria-selected')).toBe('true');
    const tag = karten[0].querySelector('.kanban-karte-tags a.tag-link');
    klicke(tag, 'mousedown');
    tag.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    klicke(tag);
    klicke(tag, 'dblclick');
    expect(karten[0].getAttribute('aria-selected')).toBe('false');
    expect(karten[1].getAttribute('aria-selected')).toBe('true');
    expect(container[0].querySelector('.kanban-karte-eingabe')).toBeNull();
  });

  it('auch ein Tag im Text führt ins Tag-Panel, wenn der Schalter aus ist', async () => {
    gespeichert.set('kanban.tagsAmFuss', false);
    uebernimmKanbanAnzeige('kanban.tagsAmFuss', false);
    const { container } = baueSpalten([TAFEL]);
    await tick();
    const tag = container[0].querySelector('.kanban-karte-inhalt a.tag-link');
    klicke(tag);
    await vi.waitFor(() => expect(activateLink).toHaveBeenCalledWith(0, '#tag:arbeit', false));
  });

  it('ein Tag außerhalb einer Karte ist kein Tag-Verweis der Tafel', () => {
    const a = document.createElement('a');
    a.className = 'tag-link';
    a.setAttribute('href', '#tag:x');
    document.body.appendChild(a);
    expect(tagVerweisAn(a)).toBeNull();
    expect(tagVerweisAn(null)).toBeNull();
  });
});

// --- Verdrahtung über alle Zugänge ---------------------------------------------

describe('Kommando «Tags am Kartenfuß» über alle Zugänge (4T-001904, AK3/AK9)', () => {
  it('steht in der Registry, ohne Vorgabe-Kürzel, verfügbar an der offenen Tafel', () => {
    const { COMMANDS } = cjs('../../../src/shared/commands/commands.js');
    const cmd = COMMANDS.find((c) => c.id === 'kanban.toggleTagsFooter');
    expect(cmd).toMatchObject({
      defaultBindings: [],
      labelKey: 'command.kanban.toggleTagsFooter',
      menu: true,
      availability: 'tafelKarte',
    });
  });

  it('Menü, Brücke, Bindung und Dispatcher tragen es durchgängig', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("unless('kanban.toggleTagsFooter', {");
    expect(menu).toContain("send('menu:kanbanSchalter', 'kanban.toggleTagsFooter')");
    expect(menu).toContain("acc('kanban.toggleTagsFooter')");
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.on('menu:kanbanSchalter'");
    expect(preload).toContain("ipcRenderer.on('kanbanAnzeige:changed'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuKanbanSchalter(',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'kanban.toggleTagsFooter': () => schalteKanbanAnzeige('kanban.toggleTagsFooter')",
    );
  });

  it('AK9: die Erweiterung «Kanban» nimmt es im Aus-Zustand mit', () => {
    expect(extensionById('kanban').commands).toContain('kanban.toggleTagsFooter');
    expect(disabledCommandIdSet(['kanban']).has('kanban.toggleTagsFooter')).toBe(true);
    expect(disabledCommandIdSet([]).has('kanban.toggleTagsFooter')).toBe(false);
  });

  it('AK9: die Texte stehen in allen fünf Sprachen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of ['command.kanban.toggleTagsFooter', 'menu.view.kanbanTagsFooter']) {
        expect(woerterbuch[key], `${key} fehlt in ${sprache}`).toBeTruthy();
        expect(woerterbuch[key]).not.toContain('"');
      }
    }
  });
});

describe('Häkchen im Menü und Einstellungs-Verteilung (4T-001904, AK3)', () => {
  const electronPfad = cjs.resolve('electron');
  cjs.cache[electronPfad] = {
    id: electronPfad,
    filename: electronPfad,
    loaded: true,
    exports: { Menu: { buildFromTemplate: (template) => template } },
  };
  const { buildMenu, tForLocale } = cjs('../../../src/main/menu/menu.js');
  const { normalizeMenuState } = cjs('../../../src/main/menu/menu-state.js');

  function haekchen(zustand) {
    const template = buildMenu(
      null,
      { locale: 'de', viewMode: 'kanban', hasActiveTab: true, tafelTab: true, ...zustand },
      null,
    );
    const label = tForLocale('de', 'menu.view.kanbanTagsFooter');
    const suche = (items) => {
      for (const i of items || []) {
        if (i && i.label === label) return i;
        const tiefer = i && Array.isArray(i.submenu) ? suche(i.submenu) : null;
        if (tiefer) return tiefer;
      }
      return null;
    };
    return suche(template);
  }

  it('das Häkchen folgt der gespeicherten Einstellung', () => {
    const an = haekchen({ kanbanAnzeige: { 'kanban.tagsAmFuss': true } });
    expect(an).toMatchObject({ type: 'checkbox', checked: true, enabled: true });
    expect(haekchen({ kanbanAnzeige: { 'kanban.tagsAmFuss': false } }).checked).toBe(false);
    expect(haekchen({}).checked).toBe(false);
  });

  it('außerhalb der Tafel-Ansicht steht es blass', () => {
    expect(haekchen({ viewMode: 'rendered' }).enabled).toBe(false);
  });

  it('der Menü-Zustand liest den Wert aus dem Speicher und nimmt nur Wahrheitswerte', () => {
    const speicher = { 'kanban.tagsAmFuss': true };
    const gelesen = kanbanAnzeigeAusSpeicher((k) => speicher[k]);
    // 4T-001903: der zweite Schalter steht mit seiner Vorgabe daneben.
    expect(normalizeMenuState(null, { kanbanAnzeige: gelesen }).kanbanAnzeige).toEqual({
      'kanban.tagsAmFuss': true,
      'kanban.terminRelativ': false,
    });
    expect(
      normalizeMenuState(null, { kanbanAnzeige: { 'kanban.tagsAmFuss': 'true' } }).kanbanAnzeige,
    ).toEqual({ 'kanban.tagsAmFuss': false, 'kanban.terminRelativ': false });
    expect(lies('src/main/menu/menu-apply.js')).toContain(
      'kanbanAnzeige: kanbanAnzeigeAusSpeicher(',
    );
  });

  it('die Verteilung baut alle Menüs neu und meldet den Wert an alle Fenster', () => {
    const { createSettingsVerteilung } = cjs('../../../src/main/ipc/settings-verteilung.js');
    const gesendet = [];
    const fenster = (name) => ({
      isDestroyed: () => false,
      webContents: { send: (kanal, nutzlast) => gesendet.push([name, kanal, nutzlast]) },
    });
    const sender = fenster('sender');
    const applyMenuToAllWindows = vi.fn();
    const verteile = createSettingsVerteilung({
      BrowserWindow: { getAllWindows: () => [sender, fenster('anderes')] },
      getStore: () => null,
      applyMenuToAllWindows,
      updateAllCaptionColors: () => {},
      timerChecker: { reschedule: () => {} },
    });
    verteile('kanban.tagsAmFuss', true, sender.webContents);
    expect(applyMenuToAllWindows).toHaveBeenCalledTimes(1);
    expect(gesendet).toEqual([
      ['sender', 'kanbanAnzeige:changed', { schluessel: 'kanban.tagsAmFuss', wert: true }],
      ['anderes', 'kanbanAnzeige:changed', { schluessel: 'kanban.tagsAmFuss', wert: true }],
    ]);
  });
});
