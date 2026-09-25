// @vitest-environment jsdom
// 4T-001903 (Epic 3E-000318): Prüffälle «Termin und Uhrzeit auf der Karte»,
// Anzeige-Hälfte — die Abzeichen-Reihe je Segment-Art, Überfällig und
// Ungültig, der Vorbild-Termin lesbar und unlesbar, die relative Lesart samt
// Bezugstag, der Schalter «Termine relativ anzeigen» an der Tafel und seine
// Verdrahtung über Registry, Menü, Einstellungs-Verteilung und Erweiterung.
//
// **Gemessen wird an der echten Render-Kette** (Muster kanban-tags.test.js):
// Die Zusage «Abzeichen derselben Art wie in der Lese-Ansicht» ist ein
// Vergleich mit dem, was die Lese-Ansicht aus derselben Zeile macht.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import {
  angezeigteZeile,
  baueMarkerReihe,
  lokalesDatum,
  ohneVorbildTermin,
  relativerTermin,
} from '../../../src/renderer/modules/kanban/kanban-marker.js';
import {
  KARTE_KLASSE,
  kartenFragment,
  zeichneTafel,
} from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;
const cjs = createRequire(import.meta.url);
const STUFE2 = lies('test/fixtures/kanban/tafel-stufe-2.md');

// Die Prozess-Brücke, gestellt wie im Programm (Muster kanban-tags.test.js).
const gespeichert = new Map();
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  getSetting: vi.fn(async (k) => gespeichert.get(k)),
  setSetting: vi.fn(async (k, v) => {
    gespeichert.set(k, v);
  }),
  onKanbanAnzeigeChanged: () => {},
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
const { schalteKanbanAnzeige, uebernimmKanbanAnzeige } =
  await import('../../../src/renderer/modules/kanban/kanban-anzeige-schalter.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const tafel = (...karten) => [KOPF, '## Offen', '', ...karten, ''].join('\n');
const tick = () => new Promise((r) => setTimeout(r, 0));

// Ein fester Bezugs-Zeitpunkt: Mittwoch, 23. September 2026, 10 Uhr lokal.
const JETZT = new Date(2026, 8, 23, 10, 0);

function ersteKarte(text) {
  return leseTafel(text).spalten[0].karten[0];
}

function reihe(text, optionen = {}) {
  return baueMarkerReihe(ersteKarte(text), { t: tStub, ...optionen });
}

// Die Abzeichen einer Zeile, wie die Lese-Ansicht sie zeichnet.
function abzeichenDerLeseAnsicht(zeile) {
  const huelle = document.createElement('div');
  huelle.innerHTML = renderMarkdown(zeile, 'de', { frontmatterBlock: false });
  return [...huelle.querySelectorAll('.task-marker')].map((el) => [
    el.className,
    el.textContent,
    el.getAttribute('title') || '',
  ]);
}

function abzeichenDerKarte(el) {
  return [...el.querySelectorAll('.task-marker')].map((b) => [
    b.className,
    b.textContent,
    b.getAttribute('title') || '',
  ]);
}

// --- Abzeichen je Segment-Art --------------------------------------------------

describe('Abzeichen-Reihe der Karte (4T-001903, AK1/AK7/AK8)', () => {
  const ALLES =
    '- [ ] Alles 📅 2026-10-01 14:00 ⏳ 2026-09-30 🛫 2026-09-29 ➕ 2026-09-01 ' +
    '✅ 2026-09-02 ❌ 2026-09-03 ⏫ 🔁 every week ⏰ 2026-09-30 08:00';

  it('AK1: jedes Marker-Segment wird ein Abzeichen, gleich dem der Lese-Ansicht', () => {
    const el = reihe(tafel(ALLES));
    expect(el.className).toBe('kanban-karte-marker');
    const karte = abzeichenDerKarte(el);
    expect(karte).toHaveLength(9);
    expect(karte).toEqual(abzeichenDerLeseAnsicht(ALLES));
    expect(karte[0][1]).toBe('📅 2026-10-01 14:00');
  });

  it('eine Karte ohne Angabe bekommt keine leere Reihe', () => {
    expect(reihe(tafel('- [ ] Nur Text'))).toBeNull();
  });

  it('AK7: ein überfälliger Termin ist hervorgehoben wie in der Lese-Ansicht', () => {
    const alt = reihe(tafel('- [ ] Alt 📅 2000-01-01')).firstChild;
    expect(alt.classList.contains('task-marker-overdue')).toBe(true);
    const neu = reihe(tafel('- [ ] Neu 📅 2999-01-01')).firstChild;
    expect(neu.classList.contains('task-marker-overdue')).toBe(false);
  });

  it('AK8: ein ungültiger Termin ist gekennzeichnet und behält seinen Wert', () => {
    const el = reihe(tafel('- [ ] Kaputt 📅 2026-02-30')).firstChild;
    expect(el.classList.contains('task-marker-invalid')).toBe(true);
    expect(el.textContent).toBe('📅 2026-02-30');
  });

  it('der Termin trägt im änderbaren Dokument die Kennung für den Wähler, sonst nicht', () => {
    expect(reihe(tafel('- [ ] A 📅 2026-10-01')).firstChild.dataset.kanbanTermin).toBe('due');
    const lesend = reihe(tafel('- [ ] A 📅 2026-10-01'), { aenderbar: false }).firstChild;
    expect(lesend.dataset.kanbanTermin).toBeUndefined();
    // Nur der Termin selbst öffnet den Wähler, nicht die übrigen Angaben.
    const geplant = reihe(tafel('- [ ] A ⏳ 2026-10-01')).firstChild;
    expect(geplant.dataset.kanbanTermin).toBeUndefined();
  });
});

// --- Vorbild-Termin ------------------------------------------------------------

describe('Vorbild-Termin auf der Karte (4T-001903, AK4/AK8)', () => {
  const karten = leseTafel(STUFE2).spalten;

  it('AK4: lesbar — ein Abzeichen «fremde Schreibweise», der Rohtext verschwindet', () => {
    const karte = karten[0].karten[0];
    const text = ohneVorbildTermin(kartenFragment(karte, []), karte);
    expect(text).toBe('Angebot prüfen #kunde');
    const el = baueMarkerReihe(karte, { t: tStub }).firstChild;
    expect([...el.classList]).toEqual([
      'task-marker',
      'task-marker-date',
      'task-marker-due',
      'kanban-marker-fremd',
    ]);
    expect(el.textContent).toBe('📅 2026-10-01 14:00');
    expect(el.title).toBe(de['kanban.termin.fremd']);
    expect(el.dataset.kanbanTermin).toBe('vorbild');
  });

  it('ein Termin-Marker vor dem Vorbild-Termin zählt wieder als Abzeichen', () => {
    // «Laufende Aufgabe 📅 2026-09-30 @{2026-10-06}»: Der fremde Termin am
    // Zeilenende verdeckte den Marker; ohne ihn gelesen, erscheinen beide.
    const karte = karten[1].karten[0];
    expect(angezeigteZeile(karte).beschreibung).toBe('Laufende Aufgabe');
    const texte = [...baueMarkerReihe(karte, { t: tStub }).children].map((b) => b.textContent);
    expect(texte).toEqual(['📅 2026-10-06', '📅 2026-09-30']);
  });

  it('ein Vorbild-Termin am Zeilenanfang lässt keinen Rest-Abstand', () => {
    const karte = karten[1].karten[1];
    expect(ohneVorbildTermin(kartenFragment(karte, []), karte).trim()).toBe('Termin vorn');
  });

  it('AK8: unlesbar — Abzeichen «ungültig» mit dem Rohtext, der Text bleibt stehen', () => {
    const faelle = [
      [3, '@{2026-13-40}', 'kanban.termin.terminUnlesbar'],
      [5, '@@{09:30}', 'kanban.termin.uhrzeitOhneDatum'],
      [6, '@{2026-10-07} @@{25:00}', 'kanban.termin.terminUnlesbar'],
    ];
    for (const [nr, roh, schluessel] of faelle) {
      const karte = karten[0].karten[nr];
      expect(ohneVorbildTermin(kartenFragment(karte, []), karte)).toContain(roh);
      const el = baueMarkerReihe(karte, { t: tStub }).firstChild;
      expect(el.classList.contains('task-marker-invalid')).toBe(true);
      expect(el.classList.contains('kanban-marker-fremd')).toBe(true);
      expect(el.textContent).toBe(roh);
      expect(el.title).toBe(de[schluessel]);
      expect(el.dataset.kanbanTermin).toBeUndefined();
    }
  });

  it('das Dokument bleibt beim Zeichnen unverändert', () => {
    const container = document.createElement('section');
    const model = leseTafel(STUFE2);
    zeichneTafel(container, model, { t: tStub });
    expect(model.zeilen.join('\n')).toBe(STUFE2);
    expect(container.querySelectorAll('.kanban-marker-fremd').length).toBeGreaterThan(0);
  });
});

// --- Relative Lesart ------------------------------------------------------------

describe('Termine relativ lesen (4T-001903, AK6)', () => {
  const rel = (date, time = null, locale = 'de') =>
    relativerTermin({ date, time }, { jetzt: JETZT, locale });

  it('heute, morgen, gestern und die Tage davor und danach', () => {
    expect(rel('2026-09-23')).toBe('heute');
    expect(rel('2026-09-24')).toBe('morgen');
    expect(rel('2026-09-22')).toBe('gestern');
    expect(rel('2026-09-26')).toBe('in 3 Tagen');
    expect(rel('2026-09-19')).toBe('vor 4 Tagen');
    expect(rel('2026-09-21', null, 'en')).toBe('2 days ago');
  });

  it('mit angehängter Uhrzeit, wenn es eine gibt', () => {
    expect(rel('2026-09-24', '14:00')).toBe('morgen 14:00');
    expect(rel('2026-09-26', '08:30', 'en')).toBe('in 3 days 08:30');
  });

  it('der Bezugstag ist der lokale Tag, auch kurz vor Mitternacht und über die Zeitumstellung', () => {
    const spaet = new Date(2026, 8, 23, 23, 59);
    expect(lokalesDatum(spaet)).toBe('2026-09-23');
    expect(relativerTermin({ date: '2026-09-24' }, { jetzt: spaet, locale: 'de' })).toBe('morgen');
    const vorUmstellung = new Date(2026, 9, 24, 12, 0);
    expect(relativerTermin({ date: '2026-10-27' }, { jetzt: vorUmstellung, locale: 'de' })).toBe(
      'in 3 Tagen',
    );
  });

  it('an: Termin, Geplant und Start lesen sich relativ, der Titel trägt das Datum', () => {
    const el = reihe(tafel('- [ ] A 📅 2026-09-24 14:00 ⏳ 2026-09-23 ➕ 2026-09-20'), {
      relativ: true,
      jetzt: JETZT,
      locale: 'de',
    });
    const [termin, geplant, erstellt] = el.children;
    expect(termin.textContent).toBe('📅 morgen 14:00');
    expect(termin.title).toBe('Fällig: 2026-09-24 14:00');
    expect(geplant.textContent).toBe('⏳ heute');
    // Das Erstellt-Datum ist Protokoll und bleibt absolut.
    expect(erstellt.textContent).toBe('➕ 2026-09-20');
  });

  it('aus: dieselbe Karte zeigt die absoluten Werte', () => {
    const el = reihe(tafel('- [ ] A 📅 2026-09-24 14:00'), { jetzt: JETZT, locale: 'de' });
    expect(el.firstChild.textContent).toBe('📅 2026-09-24 14:00');
    expect(el.firstChild.title).toBe('Fällig');
  });

  it('ein Vorbild-Termin liest sich ebenso relativ; der Titel nennt Datum und Hinweis', () => {
    const karte = leseTafel(STUFE2).spalten[0].karten[1];
    const el = baueMarkerReihe(karte, { t: tStub, relativ: true, jetzt: JETZT, locale: 'de' });
    expect(el.firstChild.textContent).toBe('📅 in 9 Tagen');
    expect(el.firstChild.title).toBe(`2026-10-02\n${de['kanban.termin.fremd']}`);
  });

  it('ein ungültiger Termin bleibt auch relativ bei seinem Rohwert', () => {
    const el = reihe(tafel('- [ ] A 📅 2026-02-30'), { relativ: true, jetzt: JETZT });
    expect(el.firstChild.textContent).toBe('📅 2026-02-30');
  });
});

// --- Zeichnung und Schalter an der Tafel -----------------------------------------

function baueSpalten(texte) {
  const tabs = texte.map((content) => ({ content, viewMode: 'kanban', path: 'C:/T.md' }));
  const container = texte.map(() => document.createElement('section'));
  initKanbanPane({
    getPaneEls: (i) => ({ kanbanEl: container[i] }),
    aktivesDokument: (i) => tabs[i] || null,
    istAenderbar: () => true,
  });
  texte.forEach((_, i) => renderKanban(i));
  return { tabs, container };
}

describe('Zeichnung der Karte mit Abzeichen (4T-001903, AK1/AK4)', () => {
  it('die Reihe steht unter dem Text und vor einem Tag-Fuß', () => {
    const container = document.createElement('section');
    zeichneTafel(container, leseTafel(tafel('- [ ] Karte #tag 📅 2026-10-01')), {
      t: tStub,
      tagsAmFuss: true,
      renderMarkdown: (f) => renderMarkdown(f, 'de', { frontmatterBlock: false }),
    });
    const karte = container.querySelector(`.${KARTE_KLASSE}`);
    expect([...karte.children].map((c) => c.className)).toEqual([
      'kanban-karte-kasten',
      'kanban-karte-inhalt markdown-body',
      'kanban-karte-marker',
      'kanban-karte-tags',
    ]);
  });

  it('AK4/AK8: der gezeichnete Text zeigt einen lesbaren Vorbild-Termin nicht; ein unlesbarer steht im Abzeichen', () => {
    const container = document.createElement('section');
    zeichneTafel(
      container,
      leseTafel(tafel('- [ ] Lesbar @{2026-10-02} @@{14:00}', '- [ ] Kaputt @{2026-13-40}')),
      { t: tStub, renderMarkdown: (f) => renderMarkdown(f, 'de', { frontmatterBlock: false }) },
    );
    const [lesbar, kaputt] = [...container.querySelectorAll('.kanban-karte-inhalt')];
    expect(lesbar.textContent.trim()).toBe('Lesbar');
    // Der unlesbare Rohtext geht unverändert in die Render-Kette; was sie aus
    // ihm macht, ist das Bild der Lese-Ansicht. Vollständig steht er im
    // Abzeichen darunter.
    expect(kaputt.textContent).toContain('Kaputt @');
    const abzeichen = kaputt.parentElement.querySelector('.task-marker-invalid');
    expect(abzeichen.textContent).toBe('@{2026-13-40}');
  });

  it('das Stilblatt gibt der Reihe Umbruch und Abstand, ohne eigene Farbe', () => {
    const css = lies('src/renderer/styles/kanban.css');
    const block = /\.kanban-karte-marker \{[^}]*\}/.exec(css);
    expect(block, 'Regel .kanban-karte-marker fehlt').not.toBeNull();
    expect(block[0]).toContain('flex-wrap: wrap');
    const teil = css.slice(css.indexOf('4T-001903'), css.indexOf('/* AK9'));
    expect(teil).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('Schalter «Termine relativ anzeigen» an der Tafel (4T-001903, AK6)', () => {
  const HEUTE = lokalesDatum(new Date());
  const TAFEL = tafel(`- [ ] Heute fällig 📅 ${HEUTE}`);

  beforeEach(async () => {
    gespeichert.clear();
    window.api.setSetting.mockClear();
    await tick();
    uebernimmKanbanAnzeige('kanban.terminRelativ', false);
  });

  const text = (c) => c.querySelector('.task-marker-due').textContent;

  it('AK6: Umschalten zeichnet alle offenen Tafeln neu und speichert global', async () => {
    const { container } = baueSpalten([TAFEL, TAFEL]);
    await tick();
    expect(text(container[0])).toBe(`📅 ${HEUTE}`);
    expect(schalteKanbanAnzeige('kanban.toggleRelativeDates')).toBe(true);
    expect(text(container[0])).not.toBe(`📅 ${HEUTE}`);
    expect(text(container[1])).toBe(text(container[0]));
    expect(window.api.setSetting).toHaveBeenCalledWith('kanban.terminRelativ', true);
    schalteKanbanAnzeige('kanban.toggleRelativeDates');
    expect(text(container[0])).toBe(`📅 ${HEUTE}`);
    expect(window.api.setSetting).toHaveBeenLastCalledWith('kanban.terminRelativ', false);
  });

  it('AK6: das Dokument bleibt bei beiden Lesarten byte-gleich', async () => {
    const { tabs } = baueSpalten([TAFEL]);
    await tick();
    schalteKanbanAnzeige('kanban.toggleRelativeDates');
    expect(tabs[0].content).toBe(TAFEL);
    schalteKanbanAnzeige('kanban.toggleRelativeDates');
    expect(tabs[0].content).toBe(TAFEL);
  });

  it('die gespeicherte Einstellung gilt beim Start', async () => {
    gespeichert.set('kanban.terminRelativ', true);
    const { container } = baueSpalten([TAFEL]);
    await tick();
    expect(text(container[0])).not.toBe(`📅 ${HEUTE}`);
  });
});

// --- Verdrahtung über alle Zugänge ---------------------------------------------

describe('Kommando «Termine relativ anzeigen» über alle Zugänge (4T-001903, AK6/AK10)', () => {
  it('steht in der Registry, ohne Vorgabe-Kürzel, verfügbar an der offenen Tafel', () => {
    const { COMMANDS } = cjs('../../../src/shared/commands/commands.js');
    const cmd = COMMANDS.find((c) => c.id === 'kanban.toggleRelativeDates');
    expect(cmd).toMatchObject({
      defaultBindings: [],
      labelKey: 'command.kanban.toggleRelativeDates',
      menu: true,
      availability: 'tafelKarte',
    });
  });

  it('Menü und Dispatcher tragen es über den gemeinsamen Schalter-Kanal', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("unless('kanban.toggleRelativeDates', {");
    expect(menu).toContain("send('menu:kanbanSchalter', 'kanban.toggleRelativeDates')");
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'kanban.toggleRelativeDates': () => schalteKanbanAnzeige('kanban.toggleRelativeDates')",
    );
  });

  it('AK10: die Erweiterung «Kanban» nimmt es im Aus-Zustand mit', () => {
    expect(extensionById('kanban').commands).toContain('kanban.toggleRelativeDates');
    expect(disabledCommandIdSet(['kanban']).has('kanban.toggleRelativeDates')).toBe(true);
    expect(disabledCommandIdSet([]).has('kanban.toggleRelativeDates')).toBe(false);
  });

  it('AK10: die neuen Texte stehen in allen fünf Sprachen', () => {
    const schluessel = [
      'command.kanban.toggleRelativeDates',
      'menu.view.kanbanRelativeDates',
      'kanban.terminSetzen',
      'kanban.terminEntfernen',
      'kanban.termin.fremd',
      'kanban.termin.terminUnlesbar',
      'kanban.termin.uhrzeitOhneDatum',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(woerterbuch[key], `${key} fehlt in ${sprache}`).toBeTruthy();
        expect(woerterbuch[key]).not.toContain('"');
      }
    }
  });
});

describe('Häkchen im Menü und Einstellungs-Verteilung (4T-001903, AK6)', () => {
  const electronPfad = cjs.resolve('electron');
  cjs.cache[electronPfad] = {
    id: electronPfad,
    filename: electronPfad,
    loaded: true,
    exports: { Menu: { buildFromTemplate: (template) => template } },
  };
  const { buildMenu, tForLocale } = cjs('../../../src/main/menu/menu.js');

  function haekchen(zustand) {
    const template = buildMenu(
      null,
      { locale: 'de', viewMode: 'kanban', hasActiveTab: true, tafelTab: true, ...zustand },
      null,
    );
    const label = tForLocale('de', 'menu.view.kanbanRelativeDates');
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

  it('das Häkchen folgt der gespeicherten Einstellung und steht außerhalb der Tafel blass', () => {
    const an = haekchen({ kanbanAnzeige: { 'kanban.terminRelativ': true } });
    expect(an).toMatchObject({ type: 'checkbox', checked: true, enabled: true });
    expect(haekchen({ kanbanAnzeige: { 'kanban.terminRelativ': false } }).checked).toBe(false);
    expect(haekchen({ viewMode: 'rendered' }).enabled).toBe(false);
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
    verteile('kanban.terminRelativ', true, sender.webContents);
    expect(applyMenuToAllWindows).toHaveBeenCalledTimes(1);
    expect(gesendet).toEqual([
      ['sender', 'kanbanAnzeige:changed', { schluessel: 'kanban.terminRelativ', wert: true }],
      ['anderes', 'kanbanAnzeige:changed', { schluessel: 'kanban.terminRelativ', wert: true }],
    ]);
  });
});
