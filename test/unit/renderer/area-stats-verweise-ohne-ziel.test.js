// @vitest-environment jsdom
// 4T-002783 (Epic 3E-000392): die Liste «Verweise ohne Ziel» auf der Seite
// Bereichs-Statistik.
//
// Gemessen wird die Anzeige, nicht die Erhebung: Die Einträge kommen fertig
// aus dem Hauptprozess (Antwort-Feld `verweiseOhneZiel`, Fälle in
// area-stats.test.js und verweise-ohne-ziel.test.js). Geprüft werden Spalten,
// Gründe, Leer-Zustand, Hinweis auf nicht geprüfte Verweise, die Kennzahl mit
// ihrem Sprung, der Klick auf eine Zeile und der Umgang mit fremdem Text.
//
// Die Seite wird ohne Reiter-Mechanik gemountet: system-pages.js ist gemockt
// und hält die registrierte Seiten-Beschreibung fest, die der Test selbst
// öffnet und in einen Container hängt. Gemockt sind dazu der Sprung
// (bookmarks.js), der Statusleisten-Hinweis (views.js), der Fenster-Zustand
// und der Preload-Zugang. Die Übersetzung läuft ohne geladenes Wörterbuch,
// t() liefert dann den Schlüssel; geprüft wird deshalb gegen Schlüssel.
// Ausnahme ist der Text der Hinweis-Zeile: Ohne Platzhalter im Text bliebe
// die eingesetzte Zahl ungeprüft (Zweitblick zu 4T-002783, Befund 1). Für ihn
// liefert t() einen Text mit `{count}`.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const halter = vi.hoisted(() => ({ seite: null, antwort: null, spruenge: [] }));

vi.mock('../../../src/renderer/i18n.js', async (original) => {
  const echt = await original();
  return {
    ...echt,
    t: (key) => (key === 'stats.deadLinks.unchecked' ? 'Nicht geprüft: {count}' : echt.t(key)),
  };
});

vi.mock('../../../src/renderer/modules/app/system-pages.js', () => ({
  registerSystemPage: (def) => {
    halter.seite = def;
  },
  openSystemPage: () => {},
  findSystemTabAcrossPanes: () => null,
}));
vi.mock('../../../src/renderer/modules/bookmarks/bookmarks.js', () => ({
  openOrJumpToPath: (pfad, zeile) => {
    halter.spruenge.push([pfad, zeile]);
  },
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: () => {},
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { areaPath: '/b', areaName: 'B' },
}));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: { collectAreaStats: async () => halter.antwort },
}));

const { initAreaStatsPage, verweisZeilen, nichtGeprueftSumme } =
  await import('../../../src/renderer/modules/area-stats-page.js');
initAreaStatsPage();

// Vollständiges Kennzahlen-Objekt in der Form des Hauptprozesses, damit die
// übrigen Abschnitte zeichnen; allein `verweiseOhneZiel` variiert je Fall.
function antwort(verweiseOhneZiel) {
  return {
    status: 'ready',
    stand: 0,
    dateien: {
      markdown: 2,
      nichtMarkdown: { gesamt: 0, bilder: 0, pdf: 0, sonstige: 0 },
      ordner: 0,
    },
    speicher: { gesamt: 0, markdown: 0, nichtMarkdown: 0, begleit: 0 },
    eigenschaften: [],
    tags: [],
    begleit: { mdd: 0, mdda: 0, mddl: 0, mitMdd: 0, vonMarkdown: 2 },
    inhalte: {
      aufgaben: { gesamt: 0, offen: 0, erledigt: 0, abgebrochen: 0 },
      verweise: { wiki: 0, markdown: 0 },
      aliase: 0,
    },
    auffaelligkeiten: { groesste: [], juengste: [], meistverlinkt: [], unverlinkt: [] },
    hinweise: { ungespeicherteDokumente: 0, uebersprungeneOrdner: 0 },
    verweiseOhneZiel,
  };
}

const EINTRAEGE = [
  { pfad: '/b/A.md', name: 'A', zeile: 3, verweis: '[[Fehlt]]', grund: 'dokument-fehlt' },
  { pfad: '/b/A.md', name: 'A', zeile: 7, verweis: '[[B#Weg]]', grund: 'ueberschrift-fehlt' },
  { pfad: '/b/C.md', name: 'C', zeile: 2, verweis: '[[B#^x]]', grund: 'block-anker-fehlt' },
];

async function zeige(verweiseOhneZiel) {
  halter.antwort = antwort(verweiseOhneZiel);
  halter.spruenge = [];
  document.body.innerHTML = '<div id="seite"></div>';
  const container = document.getElementById('seite');
  halter.seite.onOpen();
  halter.seite.mount(container);
  // Die Erhebung ist asynchron: zwei Mikro-Schritte (Aufruf, Zeichnen).
  await Promise.resolve();
  await Promise.resolve();
  return container;
}

function block(container) {
  return container.querySelector('#area-stats-verweise-ohne-ziel');
}

function zeilenText(container) {
  return [...block(container).querySelectorAll('tbody tr')].map((tr) =>
    [...tr.cells].map((td) => td.textContent),
  );
}

function kennzahlZeile(container) {
  return [...container.querySelectorAll('.area-stats-figures tr')].find(
    (tr) => tr.cells[0].textContent === 'stats.content.deadLinks',
  );
}

describe('Bereichs-Statistik: Liste «Verweise ohne Ziel» (4T-002783)', () => {
  beforeEach(() => {
    halter.spruenge = [];
  });

  it('zeigt vier Spalten und je Verweis eine Zeile mit übersetztem Grund (AK1, AK2)', async () => {
    const c = await zeige({ eintraege: EINTRAEGE, nichtErreichbar: [] });
    const b = block(c);
    expect(b).not.toBeNull();
    expect(b.querySelector('h5').textContent).toBe('stats.highlights.deadLinks');
    expect([...b.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'stats.col.document',
      'stats.col.line',
      'stats.col.link',
      'stats.col.reason',
    ]);
    expect(zeilenText(c)).toEqual([
      ['A', '3', '[[Fehlt]]', 'stats.deadLinks.reason.documentMissing'],
      ['A', '7', '[[B#Weg]]', 'stats.deadLinks.reason.headingMissing'],
      ['C', '2', '[[B#^x]]', 'stats.deadLinks.reason.blockAnchorMissing'],
    ]);
  });

  it('zählt Verweise in der Kennzahl und springt zur Liste (AK2)', async () => {
    const c = await zeige({ eintraege: EINTRAEGE, nichtErreichbar: [] });
    const tr = kennzahlZeile(c);
    expect(tr).toBeDefined();
    const knopf = tr.querySelector('button.area-stats-jump');
    expect(knopf).not.toBeNull();
    expect(knopf.textContent).toBe('3');
    expect(knopf.title).toBe('stats.content.deadLinksJump');
    const ziel = block(c);
    ziel.scrollIntoView = vi.fn();
    knopf.click();
    expect(ziel.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('öffnet beim Klick auf eine Zeile das Dokument an der Zeile des Verweises (AK3)', async () => {
    const c = await zeige({ eintraege: EINTRAEGE, nichtErreichbar: [] });
    const zeilen = block(c).querySelectorAll('tbody tr');
    zeilen[1].cells[2].click();
    // Der Klick auf den Namen-Knopf erreicht die Zeile genau einmal.
    zeilen[2].querySelector('button.area-stats-file').click();
    expect(halter.spruenge).toEqual([
      ['/b/A.md', 7],
      ['/b/C.md', 2],
    ]);
  });

  it('zeigt bei leerer Liste «Keine» und keinen Sprung-Knopf (AK1)', async () => {
    const c = await zeige({ eintraege: [], nichtErreichbar: [] });
    const b = block(c);
    expect(b.querySelector('table')).toBeNull();
    expect(b.querySelector('.area-stats-empty').textContent).toBe('stats.deadLinks.none');
    const tr = kennzahlZeile(c);
    expect(tr.cells[1].textContent).toBe('0');
    expect(tr.querySelector('button')).toBeNull();
  });

  it('nennt die Summe der nicht geprüften Verweise nur, wenn es welche gibt (AK5)', async () => {
    const mit = await zeige({
      eintraege: [],
      nichtErreichbar: [
        { prefix: 'x', anzahl: 2 },
        { prefix: 'y', anzahl: 3 },
      ],
    });
    expect(block(mit).querySelector('.area-stats-unchecked').textContent).toBe('Nicht geprüft: 5');
    const ohne = await zeige({ eintraege: EINTRAEGE, nichtErreichbar: [] });
    expect(block(ohne).querySelector('.area-stats-unchecked')).toBeNull();
  });

  it('setzt fremden Text nur als Text und setzt keinen Typ voraus (Sicherheit)', async () => {
    const c = await zeige({
      eintraege: [
        {
          pfad: '/b/X.md',
          name: '<img src=x onerror="window.__boese=1">',
          zeile: 4,
          verweis: '[[<b>fett</b>]]',
          grund: 'dokument-fehlt',
        },
      ],
      nichtErreichbar: [],
    });
    const b = block(c);
    expect(b.querySelector('img')).toBeNull();
    expect(b.querySelector('tbody b')).toBeNull();
    expect(zeilenText(c)[0][2]).toBe('[[<b>fett</b>]]');
    expect(window.__boese).toBeUndefined();
  });

  it('behandelt eine ungültige Zeile als fehlend und öffnet ohne Sprung', async () => {
    const c = await zeige({
      eintraege: [{ pfad: '/b/A.md', name: 'A', zeile: '5', verweis: '[[F]]', grund: 'x-neu' }],
      nichtErreichbar: [],
    });
    expect(zeilenText(c)).toEqual([['A', '', '[[F]]', 'x-neu']]);
    block(c).querySelector('tbody tr').click();
    expect(halter.spruenge).toEqual([['/b/A.md', null]]);
  });

  it('normalisiert die Einträge ohne vorausgesetzte Typen (verweisZeilen)', () => {
    expect(verweisZeilen(undefined)).toEqual([]);
    expect(verweisZeilen({ eintraege: 'kein Feld' })).toEqual([]);
    expect(
      verweisZeilen({
        eintraege: [
          null,
          7,
          { pfad: 42, name: 99, zeile: 0, verweis: { a: 1 }, grund: undefined },
          { pfad: '/b/A.md', name: 'A', zeile: 2.5, verweis: '[[F]]', grund: 'ausserhalb-bereich' },
        ],
      }),
    ).toEqual([
      { pfad: null, name: '99', zeile: null, verweis: '[object Object]', grund: '' },
      {
        pfad: '/b/A.md',
        name: 'A',
        zeile: null,
        verweis: '[[F]]',
        grund: 'stats.deadLinks.reason.outsideArea',
      },
    ]);
  });

  it('übersetzt alle sechs Gründe aus dem Hauptprozess', () => {
    const gruende = [
      ['dokument-fehlt', 'documentMissing'],
      ['ueberschrift-fehlt', 'headingMissing'],
      ['block-anker-fehlt', 'blockAnchorMissing'],
      ['ausserhalb-bereich', 'outsideArea'],
      ['verknuepft-nicht-gefunden', 'linkedNotFound'],
      ['verknuepfung-nicht-nutzbar', 'linkUnusable'],
    ];
    const zeilen = verweisZeilen({
      eintraege: gruende.map(([grund]) => ({
        pfad: '/b/A.md',
        name: 'A',
        zeile: 1,
        verweis: 'v',
        grund,
      })),
    });
    expect(zeilen.map((z) => z.grund)).toEqual(
      gruende.map(([, key]) => `stats.deadLinks.reason.${key}`),
    );
  });

  it('zählt nur ganze positive Anzahlen nicht erreichbarer Bereiche (nichtGeprueftSumme)', () => {
    expect(nichtGeprueftSumme(undefined)).toBe(0);
    expect(
      nichtGeprueftSumme({
        nichtErreichbar: [{ anzahl: 2 }, { anzahl: '3' }, null, { anzahl: -1 }, { anzahl: 4 }],
      }),
    ).toBe(6);
  });

  it('deaktiviert den Namen-Knopf einer Zeile ohne Pfad', async () => {
    const c = await zeige({
      eintraege: [{ pfad: '', name: 'A', zeile: 1, verweis: '[[F]]', grund: 'dokument-fehlt' }],
      nichtErreichbar: [],
    });
    const knopf = block(c).querySelector('button.area-stats-file');
    expect(knopf.disabled).toBe(true);
    block(c).querySelector('tbody tr').click();
    expect(halter.spruenge).toEqual([]);
  });
});
