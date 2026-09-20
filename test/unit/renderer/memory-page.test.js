// @vitest-environment jsdom
// 4T-001599 (Epic 3E-000191, Story 4S-000906): Unit-Prüfungen der Seite
// My Extended Memory.
//
// Geprüft werden die vier Zusagen, die ohne gebautes Programm messbar sind:
// die Registrierung als System-Seite und das Öffnen als pfadloser Reiter
// (AK1), der zweite Aufruf ohne zweiten Reiter (AK3), der Aufbau mit mehreren
// Gefäß-Arten in Abschnitten (AK4) und der Leer-Zustand (AK6). Dazu der
// dauerhafte Hinweis (AK5), der in beiden Lagen dastehen muss — gefüllte
// Liste wie leere —, weil genau das sein Zweck ist.
//
// Der Preload-Namensraum `memory` ist gemockt (Muster book-panel.test.js:
// window.api-Stub plus Pane-Markup VOR dem Modul-Import). Die Übersetzung
// läuft ohne geladenes Wörterbuch, t() liefert dann den Schlüssel selbst —
// geprüft wird deshalb gegen Schlüssel und Struktur, nicht gegen Texte.
//
// 4T-001600 ergänzt die Kennzahlen je Zeile: der ausgewiesene Stand, die
// Kurz-Kennzahlen je Gefäß-Art, das Kennzeichen des unvollständigen Bereichs
// und der Knopf «Neu erheben». Gemessen wird die Anzeige, nicht die Erhebung —
// sie liegt im Hauptprozess und hat ihre eigenen Fälle in memory-stats.test.js.
//
// 4T-001601 ergänzt die Detail-Sicht je Gefäß-Art. Gemessen wird genau das,
// was ohne gebautes Programm messbar ist: die Zusammenstellung der Kennzahlen
// je Art (AK1 bis AK4), die nicht verfügbare Kennzahl (AK7), die Gleichheit
// der gezeigten Zahlen mit den gelieferten `werte` (AK8) und der Weg zur
// ausführlichen Bereichs-Statistik (AK6). Erhoben wird dabei nichts — die
// Werte kommen fertig aus dem Hauptprozess.
//
// 4T-001602 ergänzt den Zugang zum Ex- und Import. Gemessen wird der Aufruf,
// nicht die Mechanik: `setup-export.js` und `setup-import.js` sind gemockt,
// weil genau das die Zusage ist — die Seite ruft die Kanäle aus 3E-000160 auf
// und baut keine zweite Auswahl, kein zweites Format und keine zweite
// Prüfung. Der Schalt-Zustand der Erweiterung kommt über den echten
// Lebenszyklus (`applyExtensionsState`), nicht über einen weiteren Mock.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

// Der Zähl-Halter wird mit vi.hoisted angelegt: vi.mock wandert an den
// Datei-Anfang, und ohne diese Anhebung stünde die Zuweisung darunter.
const austausch = vi.hoisted(() => ({ exportRufe: 0, importRufe: 0, importErgebnis: false }));
vi.mock('../../../src/renderer/modules/views/setup-export.js', () => ({
  exportSetup: async () => {
    austausch.exportRufe += 1;
    return true;
  },
}));
vi.mock('../../../src/renderer/modules/views/setup-import.js', () => ({
  importSetup: async () => {
    austausch.importRufe += 1;
    return austausch.importErgebnis;
  },
}));

// Bestands-Markup, so weit openSystemPage es anfasst: je Spalte Reiter-Streifen,
// Inhalts-Container und die vier Panes (app-state.js memoisiert die Referenzen
// beim ersten Zugriff, deshalb VOR dem Modul-Import), dazu die beiden
// Statusbar-Schaltflächen, die syncToolbarToActiveTab ohne Null-Prüfung greift.
for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

// Preload-Funktionen, die das Aktivieren eines Reiters anstößt (Menü-Zustand,
// Sitzungs-Ablage, Historien-Status). Sie gehören nicht zu dieser Seite und
// stehen deshalb hier und nicht im geteilten Stub.
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};
// 4T-001601: Der Weg zur Bereichs-Statistik bindet den Bereich, wenn er nicht
// der geöffnete ist. Die Attrappe zählt die Aufrufe und antwortet mit dem
// Ausgang, den der Fall verlangt (`boundExisting` = diese App übernimmt den
// Bereich, sonst ein anderes Fenster).
const gebunden = [];
let openAreaAntwort = { ok: true, boundExisting: true };
window.api.openAreaPath = async (p) => {
  gebunden.push(p);
  return openAreaAntwort;
};

// Aufrufe der Liste sammeln statt den Hauptprozess zu brauchen.
const entfernt = [];
const eingetragen = [];
// 4T-001600: Schlüssel jeder angeforderten Neu-Erhebung samt der Antwort, die
// der Hauptprozess darauf gibt.
const erhoben = [];
let refreshAntwort = { ok: true };
// Zahl der Abrufe der Liste: Der Neuaufbau nach einem Einlesen (AK6) ist
// genau ein weiterer Abruf, sein Ausbleiben nach einem Abbruch (AK7) keiner.
let viewRufe = 0;
let viewAntwort = { ok: true, entries: [] };
let vorschlagAntwort = {
  ok: true,
  suggestions: { workspaces: [], areas: [], books: [], shelves: [] },
};
window.api.memory = {
  getViewData: async () => {
    viewRufe += 1;
    return viewAntwort;
  },
  suggestions: async () => vorschlagAntwort,
  addFromDialog: async () => ({ ok: false, canceled: true, error: 'canceled' }),
  addPath: async (p) => {
    eingetragen.push(p);
    return { ok: true };
  },
  addWorkspace: async (id) => {
    eingetragen.push(id);
    return { ok: true };
  },
  remove: async (key) => {
    entfernt.push(key);
    return { ok: true, removed: true };
  },
  refresh: async (key) => {
    erhoben.push(key);
    return refreshAntwort;
  },
  onChanged: () => {},
};

const memoryPage = await import('../../../src/renderer/modules/memory-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
// 4T-001601: Ziel des Weges aus der Detail-Sicht. Ohne die Registrierung
// bliebe `openSystemPage` wirkungslos (system-pages.js:112-113), und der Fall
// liefe grün, ohne etwas zu messen.
const areaStatsPage = await import('../../../src/renderer/modules/area-stats-page.js');

memoryPage.initMemoryPage();
areaStatsPage.initAreaStatsPage();

// Seiten-Lebenszyklus wie beim echten Öffnen (Muster settings-page.test.js):
// onOpen setzt den frischen Zustand, mount baut das DOM. Danach wird auf den
// geladenen Bestand gewartet, weil mount() den Abruf nur anstößt.
async function mountPage() {
  const def = systemPages.systemPageById(memoryPage.MEMORY_PAGE_ID);
  def.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  def.mount(container);
  // Zwei Mikrotask-Runden: Abruf der Liste und der anschließende Neu-Aufbau.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return container;
}

function eintrag(kind, name, extra = {}) {
  return {
    kind,
    key: `${kind}:${name}`,
    path: kind === 'workspace' ? null : `C:\\Ablage\\${name}`,
    workspaceId: kind === 'workspace' ? `ws-${name}` : null,
    name,
    addedAt: '2026-09-11T08:00:00Z',
    reachable: kind === 'workspace' ? null : true,
    stats: null,
    workspace: null,
    shelfOf: null,
    ...extra,
  };
}

beforeEach(() => {
  entfernt.length = 0;
  eingetragen.length = 0;
  erhoben.length = 0;
  gebunden.length = 0;
  openAreaAntwort = { ok: true, boundExisting: true };
  state.areaPath = null;
  refreshAntwort = { ok: true };
  viewRufe = 0;
  austausch.exportRufe = 0;
  austausch.importRufe = 0;
  austausch.importErgebnis = false;
  lebenszyklus.resetExtensionStateForTests();
  viewAntwort = { ok: true, entries: [] };
  vorschlagAntwort = {
    ok: true,
    suggestions: { workspaces: [], areas: [], books: [], shelves: [] },
  };
});

describe('Registrierung und Öffnen als pfadloser Reiter (AK1, AK3)', () => {
  it('ist unter der Kennung memory registriert und trägt den Titel-Schlüssel', () => {
    const def = systemPages.systemPageById(memoryPage.MEMORY_PAGE_ID);
    expect(def).toBeTruthy();
    expect(def.id).toBe('memory');
    expect(def.titleKey).toBe('memory.pageTitle');
    expect(typeof def.mount).toBe('function');
  });

  it('öffnet einen pfadlosen Reiter, und der zweite Aufruf öffnet keinen zweiten', () => {
    memoryPage.openMemoryPage();
    const treffer = systemPages.findSystemTabAcrossPanes(memoryPage.MEMORY_PAGE_ID);
    expect(treffer, 'kein Reiter der Seite gefunden').toBeTruthy();
    expect(memoryPage.memoryPageOpen()).toBe(true);

    // Der Reiter selbst trägt keinen Pfad und die Seiten-Kennung — das ist
    // die Zusage «pfadloser Reiter».
    const tab = state.panes[treffer.paneIdx].tabs[treffer.tabIdx];
    expect(tab.path).toBe(null);
    expect(tab.systemPage).toBe('memory');

    const vorher = systemPages.systemPageOpenCount(memoryPage.MEMORY_PAGE_ID);
    memoryPage.openMemoryPage();
    // Die Anforderung zählt hoch (sie ist angekommen), der Reiter bleibt einer.
    expect(systemPages.systemPageOpenCount(memoryPage.MEMORY_PAGE_ID)).toBe(vorher + 1);
    const danach = systemPages.findSystemTabAcrossPanes(memoryPage.MEMORY_PAGE_ID);
    expect(danach).toEqual(treffer);
  });
});

describe('Aufbau der Seite (AK4, AK5, AK6)', () => {
  it('gruppiert die Einträge nach Gefäß-Art in der Reihenfolge des Vertrags', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('workspace', 'Projekt', {
          workspace: {
            area: 'C:\\Ablage\\Wissen',
            book: null,
            shelf: null,
            windows: 2,
            documents: 5,
          },
        }),
        eintrag('area', 'Wissen'),
        eintrag('book', 'Ithaka'),
        eintrag('shelf', 'Regal'),
      ],
    };
    const container = await mountPage();
    const titel = [...container.querySelectorAll('.memory-section-title')].map(
      (n) => n.textContent,
    );
    expect(titel).toEqual([
      'memory.section.workspaces',
      'memory.section.areas',
      'memory.section.books',
      'memory.section.shelves',
    ]);
    expect(container.querySelectorAll('.memory-row')).toHaveLength(4);
    // Je Zeile der leere Andockpunkt der Detail-Sicht (4T-001601).
    expect(container.querySelectorAll('.memory-row-detail')).toHaveLength(4);
    // Der Arbeitsbereich zeigt die getragenen Gefäße statt eines Pfades.
    // 4T-001739 (Epic 3E-000308): der Bereich als eigene Zeile, darunter die
    // zwei Zahlen in EINER Reihe — zuerst die geöffneten Markdown-Dokumente,
    // dann die Fenster (AK1, Befund der Abnahme vom 2026-09-19).
    const wsZeile = container.querySelector('.memory-row');
    expect(wsZeile.querySelector('.memory-row-path')).toBe(null);
    const teile = [...wsZeile.querySelectorAll('.memory-row-part')].map((n) => n.textContent);
    expect(teile).toEqual(['memory.workspace.area']);
    expect(wsZeile.querySelectorAll('.memory-row-counts')).toHaveLength(1);
    const zahlenReihe = [...wsZeile.querySelectorAll('.memory-row-counts > .memory-row-count')];
    expect(zahlenReihe.map((n) => n.textContent)).toEqual([
      'memory.workspace.documents',
      'memory.workspace.windows',
    ]);
    // Ohne Kennzahlen steht der Vermerk statt eines Standes; der
    // Arbeitsbereich bekommt nie welche (4T-001600).
    expect(container.querySelector('.memory-row-stand').textContent).toBe('memory.stats.none');
    // Kein Leer-Zustand neben einer gefüllten Liste.
    expect(container.querySelector('.memory-page-placeholder')).toBe(null);
  });

  it('kennzeichnet einen nicht erreichbaren Eintrag und sperrt sein Öffnen', async () => {
    viewAntwort = { ok: true, entries: [eintrag('area', 'Weg', { reachable: false })] };
    const container = await mountPage();
    expect(container.querySelector('.memory-row-unreachable').textContent).toBe(
      'memory.unreachable',
    );
    const knoepfe = [...container.querySelectorAll('.memory-row-actions .memory-action')];
    expect(knoepfe.map((k) => k.textContent)).toEqual([
      'memory.action.open',
      'memory.action.details',
      'memory.action.refresh',
      'memory.action.remove',
    ]);
    expect(knoepfe[0].disabled).toBe(true);
    // 4T-001601: Die Detail-Sicht bleibt erlaubt — sie zeigt genau dann die
    // zuletzt bekannten Zahlen.
    expect(knoepfe[1].disabled).toBe(false);
    // 4T-001600: Auch die Neu-Erhebung ist gesperrt — sie käme an das Gefäß
    // nicht heran. Entfernen bleibt erlaubt: Es fasst nur die Liste an.
    expect(knoepfe[2].disabled).toBe(true);
    expect(knoepfe[3].disabled).toBe(false);
  });

  it('zeigt ohne Einträge den Weg zum ersten Eintrag', async () => {
    const container = await mountPage();
    const platzhalter = container.querySelector('.memory-page-placeholder');
    expect(platzhalter).toBeTruthy();
    expect(platzhalter.textContent).toBe('memory.empty');
    expect(container.querySelectorAll('.memory-section')).toHaveLength(0);
  });

  it('zeigt den Hinweis auf den eingetragenen Bestand in beiden Lagen', async () => {
    const leer = await mountPage();
    expect(leer.querySelector('.memory-page-note').textContent).toBe('memory.note');

    viewAntwort = { ok: true, entries: [eintrag('area', 'Wissen')] };
    const gefuellt = await mountPage();
    expect(gefuellt.querySelector('.memory-page-note').textContent).toBe('memory.note');
    expect(gefuellt.querySelectorAll('.memory-row')).toHaveLength(1);
  });
});

// 4T-001600: Kennzahlen je Zeile. Die Zahlen selbst kommen fertig aus dem
// Hauptprozess; geprüft wird, was die Seite daraus macht — und ausdrücklich
// auch, was sie NICHT macht: eine fehlende Kennzahl bleibt weg, statt als Null
// zu erscheinen.
describe('Kennzahlen und Stand je Zeile (AK2, AK4, AK5)', () => {
  it('nennt den Stand und die Kurz-Kennzahlen eines Bereichs', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('area', 'Wissen', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: {
              markdown: 42,
              nichtMarkdown: 3,
              ordner: 5,
              bytes: 2048,
              tags: 7,
              aufgaben: 9,
              waisen: 1,
            },
          },
        }),
      ],
    };
    const container = await mountPage();
    // Der Stand steht als Zeitpunkt da, nicht als Vermerk.
    expect(container.querySelector('.memory-row-stand').textContent).toContain('memory.stand');
    const zahlen = [...container.querySelectorAll('.memory-row-stat')].map((n) => n.textContent);
    expect(zahlen).toHaveLength(2);
    expect(zahlen[0]).toContain('memory.stats.markdown');
    expect(zahlen[1]).toContain('memory.stats.bytes');
    // Vollständige Zahlen: kein Kennzeichen.
    expect(container.querySelector('.memory-row-partial')).toBe(null);
  });

  it('kennzeichnet den Bereich ohne Index-Kennzahlen als unvollständig', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('area', 'Wissen', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'partial',
            werte: {
              markdown: 4,
              nichtMarkdown: 0,
              ordner: 0,
              bytes: 10,
              tags: null,
              aufgaben: null,
              waisen: null,
            },
          },
        }),
      ],
    };
    const container = await mountPage();
    expect(container.querySelector('.memory-row-partial').textContent).toBe('memory.stats.partial');
  });

  it('nennt beim Buch die Kapitel und beim Regal die Bücher', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('book', 'Ithaka', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { markdown: 12, bytes: 100, kapitel: 8 },
          },
        }),
        eintrag('shelf', 'Regal', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { markdown: 30, bytes: 200, buecher: 3, fehlend: 1 },
          },
        }),
      ],
    };
    const container = await mountPage();
    const zeilen = [...container.querySelectorAll('.memory-row')];
    expect(zeilen[0].querySelector('.memory-row-stat').textContent).toContain(
      'memory.stats.chapters',
    );
    expect(zeilen[1].querySelector('.memory-row-stat').textContent).toContain('memory.stats.books');
  });

  it('lässt eine nicht erhobene Kennzahl weg, statt eine Null zu zeigen', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('book', 'Ithaka', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { markdown: 12, bytes: 100, kapitel: null },
          },
        }),
      ],
    };
    const container = await mountPage();
    const zahlen = [...container.querySelectorAll('.memory-row-stat')].map((n) => n.textContent);
    expect(zahlen).toHaveLength(1);
    expect(zahlen[0]).toContain('memory.stats.bytes');
  });

  it('zeigt den Vermerk, solange ein Eintrag ohne Stand dasteht', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('area', 'Weg', {
          reachable: false,
          stats: { stand: null, status: 'unreachable', werte: {} },
        }),
      ],
    };
    const container = await mountPage();
    expect(container.querySelector('.memory-row-stand').textContent).toBe('memory.stats.none');
  });

  it('fordert die Neu-Erhebung über den Schlüssel an, ohne selbst zu rechnen', async () => {
    viewAntwort = { ok: true, entries: [eintrag('area', 'Wissen')] };
    const container = await mountPage();
    container.querySelector('.memory-action-refresh').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(erhoben).toEqual(['area:Wissen']);
  });

  it('gibt dem Arbeitsbereich keinen Erhebungs-Knopf', async () => {
    viewAntwort = { ok: true, entries: [eintrag('workspace', 'Projekt')] };
    const container = await mountPage();
    expect(container.querySelector('.memory-action-refresh')).toBe(null);
    expect(
      [...container.querySelectorAll('.memory-row-actions .memory-action')].map(
        (k) => k.textContent,
      ),
    ).toEqual(['memory.action.open', 'memory.action.details', 'memory.action.remove']);
  });
});

// 4T-001601: Detail-Sicht je Gefäß-Art. Die Zahlen kommen fertig aus dem
// Hauptprozess; gemessen wird, WELCHE davon je Art erscheinen, dass sie
// unverändert erscheinen (AK8) und dass eine fehlende als fehlend benannt wird
// statt als Null (AK7).
describe('Detail-Sicht je Gefäß-Art (AK1 bis AK4, AK7, AK8)', () => {
  // Öffnet die Detail-Sicht einer Zeile und liefert ihre Paare aus Bezeichnung
  // und Wert. Nach dem Klick wird neu abgefragt: `zeichne()` ersetzt den
  // Aufbau vollständig, und der vor dem Klick gegriffene Knoten hinge danach
  // außerhalb des Containers.
  function detailPaare(container, index = 0) {
    const zeile = () => [...container.querySelectorAll('.memory-row')][index];
    zeile().querySelector('.memory-action-details').click();
    return [...zeile().querySelectorAll('.memory-detail-row')].map((tr) => [
      tr.querySelector('.memory-detail-name').textContent,
      tr.querySelector('.memory-detail-value').textContent,
    ]);
  }

  it('zeigt beim Bereich die sieben festgelegten Kennzahlen in unveränderten Werten', async () => {
    const werte = {
      markdown: 42,
      nichtMarkdown: 3,
      ordner: 5,
      bytes: 2048,
      tags: 7,
      aufgaben: 9,
      waisen: 1,
    };
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('area', 'Wissen', {
          stats: { stand: '2026-09-11T08:00:00Z', status: 'ready', werte },
        }),
      ],
    };
    const container = await mountPage();
    const paare = detailPaare(container);
    expect(paare.map(([name]) => name)).toEqual([
      'memory.detail.markdown',
      'memory.detail.nonMarkdown',
      'memory.detail.folders',
      'memory.detail.bytes',
      'memory.detail.tags',
      'memory.detail.tasks',
      'memory.detail.orphans',
    ]);
    // AK8: Die Zahlen sind die gelieferten, nur formatiert — keine zweite
    // Zähl-Grundlage und keine Umrechnung.
    const werteNachName = Object.fromEntries(paare);
    expect(werteNachName['memory.detail.markdown']).toBe('42');
    expect(werteNachName['memory.detail.nonMarkdown']).toBe('3');
    expect(werteNachName['memory.detail.folders']).toBe('5');
    expect(werteNachName['memory.detail.tags']).toBe('7');
    expect(werteNachName['memory.detail.tasks']).toBe('9');
    expect(werteNachName['memory.detail.orphans']).toBe('1');
    expect(werteNachName['memory.detail.bytes']).toContain('KB');
    // AK6: Der Weg zur ausführlichen Statistik steht genau beim Bereich.
    expect(container.querySelector('.memory-action-area-stats').textContent).toBe(
      'memory.action.areaStats',
    );
  });

  it('benennt die ohne Index nicht erhebbare Kennzahl als nicht verfügbar (AK7)', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('area', 'Wissen', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'partial',
            werte: {
              markdown: 4,
              nichtMarkdown: 0,
              ordner: 0,
              bytes: 10,
              tags: null,
              aufgaben: null,
              waisen: null,
            },
          },
        }),
      ],
    };
    const container = await mountPage();
    const werteNachName = Object.fromEntries(detailPaare(container));
    expect(werteNachName['memory.detail.tags']).toBe('memory.notAvailable');
    expect(werteNachName['memory.detail.tasks']).toBe('memory.notAvailable');
    expect(werteNachName['memory.detail.orphans']).toBe('memory.notAvailable');
    // Die gezählte Null bleibt eine Null — sie ist eine Auskunft und nicht
    // dasselbe wie eine fehlende Kennzahl.
    expect(werteNachName['memory.detail.nonMarkdown']).toBe('0');
    expect(werteNachName['memory.detail.folders']).toBe('0');
  });

  it('zeigt ohne jede erhobene Kennzahl überall den Vermerk statt Nullen (AK7)', async () => {
    viewAntwort = { ok: true, entries: [eintrag('area', 'Wissen')] };
    const container = await mountPage();
    const paare = detailPaare(container);
    expect(paare).toHaveLength(7);
    expect(paare.every(([, wert]) => wert === 'memory.notAvailable')).toBe(true);
  });

  it('zeigt beim Buch Umfang und Regal-Zugehörigkeit (AK2)', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('book', 'Ithaka', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { markdown: 12, bytes: 100, kapitel: 8 },
          },
          shelfOf: { key: 'shelf:Regal', name: 'Grosses Regal' },
        }),
      ],
    };
    const container = await mountPage();
    const paare = detailPaare(container);
    expect(paare).toEqual([
      ['memory.detail.chapters', '8'],
      ['memory.detail.markdown', '12'],
      ['memory.detail.bytes', '100 B'],
      ['memory.detail.shelf', 'Grosses Regal'],
    ]);
    // Kein Weg zur Bereichs-Statistik: Sie gehört dem Bereich.
    expect(container.querySelector('.memory-action-area-stats')).toBe(null);
  });

  it('nennt beim Buch ohne eingetragenes Regal die fehlende Zuordnung (AK2)', async () => {
    viewAntwort = { ok: true, entries: [eintrag('book', 'Ithaka')] };
    const container = await mountPage();
    const werteNachName = Object.fromEntries(detailPaare(container));
    expect(werteNachName['memory.detail.shelf']).toBe('memory.book.noShelf');
  });

  it('zeigt beim Regal Bücher, nicht auffindbare Bücher und Umfang (AK3)', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('shelf', 'Regal', {
          stats: {
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { markdown: 30, bytes: 200, buecher: 3, fehlend: 1 },
          },
        }),
      ],
    };
    const container = await mountPage();
    expect(detailPaare(container)).toEqual([
      ['memory.detail.books', '3'],
      ['memory.detail.missing', '1'],
      ['memory.detail.markdown', '30'],
      ['memory.detail.bytes', '200 B'],
    ]);
  });

  it('zeigt beim Arbeitsbereich die getragenen Gefäße, Fenster und letzte Nutzung (AK4)', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('workspace', 'Projekt', {
          workspace: {
            area: 'C:\\Ablage\\Wissen',
            book: null,
            shelf: null,
            windows: 2,
            // 4T-001739 (Epic 3E-000308): die zweite Zahl des Vertrags.
            documents: 5,
            lastOpenedAt: '2026-09-10T07:30:00Z',
          },
        }),
      ],
    };
    const container = await mountPage();
    const paare = detailPaare(container);
    expect(paare.map(([name]) => name)).toEqual([
      'memory.detail.area',
      'memory.detail.book',
      'memory.detail.shelf',
      'memory.detail.windows',
      // 4T-001739: unmittelbar hinter der Fenster-Zahl, weil die beiden
      // zusammengehören.
      'memory.detail.documents',
      'memory.detail.lastOpened',
    ]);
    const werteNachName = Object.fromEntries(paare);
    expect(werteNachName['memory.detail.area']).toBe('C:\\Ablage\\Wissen');
    // Ein nicht getragenes Gefäß ist kein fehlender Messwert, sondern eine
    // fehlende Sache — deshalb der Strich und nicht «nicht verfügbar».
    expect(werteNachName['memory.detail.book']).toBe('—');
    expect(werteNachName['memory.detail.shelf']).toBe('—');
    expect(werteNachName['memory.detail.windows']).toBe('2');
    // 4T-001739 (AK7): Die Detail-Sicht nennt DIESELBE Zahl wie die Liste; sie
    // rechnet nichts eigen nach, sondern liest dasselbe Feld.
    expect(werteNachName['memory.detail.documents']).toBe('5');
    expect(werteNachName['memory.detail.lastOpened']).not.toBe('—');
  });

  // 4T-001739 (Epic 3E-000308, AK6): Die Null und die fehlende Angabe sind
  // zwei verschiedene Auskünfte, und die Detail-Sicht unterscheidet sie schon
  // für alle übrigen Kennzahlen. Der Fall hält fest, dass die neue Zahl
  // derselben Regel folgt: null heisst «nicht erhoben», 0 heisst «keine».
  it('unterscheidet bei der Dokument-Zahl die Null von der fehlenden Angabe', async () => {
    viewAntwort = {
      ok: true,
      entries: [
        eintrag('workspace', 'Leer', {
          workspace: { area: null, book: null, shelf: null, windows: 1, documents: 0 },
        }),
      ],
    };
    const container = await mountPage();
    expect(Object.fromEntries(detailPaare(container))['memory.detail.documents']).toBe('0');

    viewAntwort = {
      ok: true,
      entries: [
        eintrag('workspace', 'Alt', {
          workspace: { area: null, book: null, shelf: null, windows: 1 },
        }),
      ],
    };
    const zweiter = await mountPage();
    expect(Object.fromEntries(detailPaare(zweiter))['memory.detail.documents']).toBe(
      'memory.notAvailable',
    );
  });

  it('klappt die Detail-Sicht auf und wieder zu, je Zeile einzeln', async () => {
    viewAntwort = {
      ok: true,
      entries: [eintrag('area', 'Wissen'), eintrag('area', 'Notizen')],
    };
    const container = await mountPage();
    expect(container.querySelectorAll('.memory-detail')).toHaveLength(0);

    const ersteZeile = () => container.querySelectorAll('.memory-row')[0];
    ersteZeile().querySelector('.memory-action-details').click();
    expect(container.querySelectorAll('.memory-detail')).toHaveLength(1);
    // Nur die angeklickte Zeile ist offen.
    expect(container.querySelectorAll('.memory-row')[1].querySelector('.memory-detail')).toBe(null);

    ersteZeile().querySelector('.memory-action-details').click();
    expect(container.querySelectorAll('.memory-detail')).toHaveLength(0);
  });
});

// 4T-001601: Der Weg zur ausführlichen Bereichs-Statistik (AK6). Gemessen wird
// die Zusage, dass er auf der vorhandenen Seite landet — nicht auf einer
// zweiten Statistik — und dass er den Bereich vorher bindet, wenn er nicht der
// geöffnete ist.
describe('Weg zur ausführlichen Bereichs-Statistik (AK6)', () => {
  async function oeffneDetail() {
    viewAntwort = { ok: true, entries: [eintrag('area', 'Wissen')] };
    const container = await mountPage();
    container.querySelector('.memory-action-details').click();
    return container;
  }

  it('öffnet die vorhandene Statistik-Seite, wenn der Bereich der geöffnete ist', async () => {
    const container = await oeffneDetail();
    // Gegenprobe vor dem Klick: Ohne sie liefe der Fall auch dann grün, wenn
    // die Statistik-Seite schon offen wäre.
    expect(systemPages.findSystemTabAcrossPanes('area-stats')).toBe(null);
    state.areaPath = 'C:\\Ablage\\Wissen';
    container.querySelector('.memory-action-area-stats').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(systemPages.findSystemTabAcrossPanes('area-stats')).toBeTruthy();
    // Kein Binden: Der Bereich war schon der geöffnete.
    expect(gebunden).toEqual([]);
  });

  it('bindet den Bereich zuerst und springt erst mit der Display-Info-Meldung', async () => {
    const container = await oeffneDetail();
    container.querySelector('.memory-action-area-stats').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(gebunden).toEqual(['C:\\Ablage\\Wissen']);
  });
});

// 4T-001602: Der Zugang zum Ex- und Import. Gemessen wird ausschließlich der
// Aufruf der Funktionen aus 3E-000160 und die Folge ihrer Rückgabe — der
// Nachweis, dass hier keine zweite Mechanik steht, ist ihr Fehlen im Modul
// und in diesen Fällen.
describe('Zugang zum Ex- und Import (AK1 bis AK3, AK5 bis AK7)', () => {
  it('trägt beide Knöpfe und den erklärenden Satz in der Werkzeugleiste', async () => {
    const container = await mountPage();
    const block = container.querySelector('.memory-page-toolbar .memory-page-exchange');
    expect(block, 'Austausch-Block fehlt in der Werkzeugleiste').toBeTruthy();
    expect(block.querySelector('.memory-exchange-export').textContent).toBe(
      'memory.exchange.export',
    );
    expect(block.querySelector('.memory-exchange-import').textContent).toBe(
      'memory.exchange.import',
    );
    expect(block.querySelector('.memory-page-exchange-note').textContent).toBe(
      'memory.exchange.note',
    );
  });

  it('ruft beim Ausgeben die Ausgabe aus 3E-000160 auf und baut keine eigene Auswahl', async () => {
    const container = await mountPage();
    const vorher = viewRufe;
    container.querySelector('.memory-exchange-export').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(austausch.exportRufe).toBe(1);
    // Kein Dialog, kein Bericht, kein Neuaufbau: Die Ausgabe ändert den
    // eigenen Bestand nicht.
    expect(viewRufe).toBe(vorher);
  });

  it('baut die Seite nach einem Einlesen mit Übernahme neu auf (AK6)', async () => {
    austausch.importErgebnis = true;
    const container = await mountPage();
    const vorher = viewRufe;
    container.querySelector('.memory-exchange-import').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(austausch.importRufe).toBe(1);
    expect(viewRufe).toBe(vorher + 1);
  });

  it('lässt nach Abbruch oder leerem Einlesen alles stehen (AK7)', async () => {
    austausch.importErgebnis = false;
    const container = await mountPage();
    const vorher = viewRufe;
    container.querySelector('.memory-exchange-import').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(austausch.importRufe).toBe(1);
    expect(viewRufe).toBe(vorher);
    expect(entfernt).toEqual([]);
    expect(eingetragen).toEqual([]);
  });

  it('lässt den Zugang bei abgeschalteter Erweiterung ganz weg', async () => {
    await lebenszyklus.applyExtensionsState(['setup-exchange'], { persist: false });
    const container = await mountPage();
    expect(container.querySelector('.memory-page-exchange')).toBe(null);
    // Die übrige Werkzeugleiste bleibt: Nur der Austausch-Block hängt an der
    // Erweiterung, das Eintragen nicht.
    expect(container.querySelector('.memory-page-add')).toBeTruthy();
  });
});

describe('Bedienung von der Seite aus (AK7)', () => {
  it('entfernt einen Eintrag über seinen Schlüssel, ohne Rückfrage', async () => {
    viewAntwort = { ok: true, entries: [eintrag('area', 'Wissen')] };
    const container = await mountPage();
    // 4T-001601: über die eigene Klasse statt über die Position — die
    // Knopf-Reihe ist seit 4T-001600 zweimal gewachsen, und jeder Zuwachs hat
    // einen positions-adressierten Prüffall mitgerissen.
    const entfernen = container.querySelector('.memory-row-actions .memory-action-remove');
    entfernen.click();
    await Promise.resolve();
    expect(entfernt).toEqual(['area:Wissen']);
  });

  it('klappt den Vorschlags-Block auf und trägt einen Vorschlag ein', async () => {
    vorschlagAntwort = {
      ok: true,
      suggestions: {
        workspaces: [],
        areas: [{ key: 'k1', path: 'C:\\Ablage\\Neu', name: 'Neu' }],
        books: [],
        shelves: [],
      },
    };
    const container = await mountPage();
    expect(container.querySelector('.memory-suggest')).toBe(null);

    container.querySelector('.memory-page-add').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const block = container.querySelector('.memory-suggest');
    expect(block, 'Vorschlags-Block ist nicht aufgeklappt').toBeTruthy();
    expect(block.querySelector('.memory-suggest-title').textContent).toBe('memory.section.areas');
    expect(block.querySelector('.memory-suggest-path').textContent).toBe('C:\\Ablage\\Neu');
    // Der Ordner-Weg steht daneben, auch wenn es Vorschläge gibt.
    expect(block.querySelector('.memory-suggest-folder').textContent).toBe(
      'memory.suggest.chooseFolder',
    );

    block.querySelector('.memory-suggest-row .memory-action').click();
    await Promise.resolve();
    expect(eingetragen).toEqual(['C:\\Ablage\\Neu']);
  });

  it('nennt den Ordner-Weg auch ohne Vorschlag', async () => {
    const container = await mountPage();
    container.querySelector('.memory-page-add').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const block = container.querySelector('.memory-suggest');
    expect(block.querySelector('.memory-suggest-empty').textContent).toBe('memory.suggest.empty');
    expect(block.querySelector('.memory-suggest-folder')).toBeTruthy();
  });
});
